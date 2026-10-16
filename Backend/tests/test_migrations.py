"""Upgrade/downgrade round trips over legacy data, run in scratch databases."""
import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from alembic import command
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.security import hash_password

from .conftest import alembic_config, TEST_DATABASE_URL

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")


@pytest.fixture
def scratch_engine():
    admin_url = make_url(TEST_DATABASE_URL)
    name = f"vms_migration_{uuid.uuid4().hex[:8]}"
    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    engine = create_engine(admin_url.set(database=name))
    try:
        yield engine
    finally:
        engine.dispose()
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
        admin.dispose()


def migrate(engine, action, target):
    with engine.begin() as conn:
        config = alembic_config()
        config.attributes["connection"] = conn
        getattr(command, action)(config, target)


def legacy_cipher():
    material = hashlib.sha256((get_settings().jwt_secret + ":pass-encryption").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def seed_legacy(conn):
    org, site, inactive_site = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    conn.execute(text("INSERT INTO organizations (id, name) VALUES (:id, 'Legacy Org')"), {"id": org})
    conn.execute(text("INSERT INTO sites (id, organization_id, name) VALUES (:id, :org, 'HQ')"), {"id": site, "org": org})
    conn.execute(text("INSERT INTO sites (id, organization_id, name, is_active) VALUES (:id, :org, 'Old', false)"), {"id": inactive_site, "org": org})
    users = {}
    for role, site_id, active in (("super-admin", site, True), ("site-admin", site, True), ("receptionist", None, True), ("host", site, False)):
        user_id = uuid.uuid4()
        users[role] = user_id
        conn.execute(
            text("INSERT INTO users (id, email, full_name, password_hash, role, organization_id, site_id, is_active) "
                 "VALUES (:id, :email, :name, :hash, CAST(:role AS user_role), :org, :site, :active)"),
            {"id": user_id, "email": f"{role}@x.test", "name": f"{role.title()} Person", "hash": hash_password("correct horse battery"),
             "role": role, "org": org, "site": site_id, "active": active},
        )
    return org, site, inactive_site, users


def seed_legacy_visits(conn, org, site):
    """One host linked to the host account by email, one directory-only host, and visits in every legacy status."""
    linked, directory_only = uuid.uuid4(), uuid.uuid4()
    conn.execute(text("INSERT INTO hosts (id, organization_id, site_id, employee_id, name, email, department) "
                      "VALUES (:id, :org, :site, 'E1', 'Hal', 'HOST@x.test', ' Sales ')"), {"id": linked, "org": org, "site": site})
    conn.execute(text("INSERT INTO hosts (id, organization_id, site_id, employee_id, name, email, department, active) "
                      "VALUES (:id, :org, :site, 'E2', 'Dee', 'dee@x.test', 'sales', false)"), {"id": directory_only, "org": org, "site": site})
    visitor = uuid.uuid4()
    conn.execute(text("INSERT INTO visitors (id, organization_id, full_name, email, phone) VALUES (:id, :org, 'Vic Visitor', 'vic@y.test', '555 0100')"),
                 {"id": visitor, "org": org})
    now = datetime.now(timezone.utc)
    codes, cipher = {}, legacy_cipher()
    for status in ("pending", "scheduled", "checked-in", "checked-out", "cancelled", "rejected"):
        code = secrets.token_urlsafe(24)
        codes[status] = code
        checked_in = now - timedelta(hours=1) if status in ("checked-in", "checked-out") else None
        conn.execute(text(
            "INSERT INTO visits (id, organization_id, site_id, visitor_id, host_id, purpose, starts_at, ends_at, status, source, "
            "pass_digest, pass_ciphertext, pass_expires_at, pass_revoked_at, checked_in_at, checked_out_at, check_in_gate, created_at) "
            "VALUES (gen_random_uuid(), :org, :site, :visitor, :host, :purpose, :start, :end, CAST(:status AS visit_status), 'invited', "
            ":digest, :cipher, :end, :revoked, :checked_in, :checked_out, :gate, :start)"),
            {"org": org, "site": site, "visitor": visitor, "host": linked, "purpose": status, "start": now - timedelta(hours=2),
             "end": now + timedelta(hours=6), "status": status, "digest": hashlib.sha256(code.encode()).hexdigest(),
             "cipher": cipher.encrypt(code.encode()).decode(), "revoked": now if status in ("cancelled", "rejected") else None,
             "checked_in": checked_in, "checked_out": now if status == "checked-out" else None, "gate": "Lobby" if checked_in else None})
    return codes, linked, directory_only


def test_round_trip_preserves_legacy_accounts(scratch_engine):
    migrate(scratch_engine, "upgrade", "0002_deduplicate_unique_indexes")
    with scratch_engine.begin() as conn:
        org, site, inactive_site, users = seed_legacy(conn)
        before = conn.execute(text("SELECT id, email, full_name, password_hash, role::text, site_id, is_active FROM users ORDER BY id")).all()

    migrate(scratch_engine, "upgrade", "0005_backfill_identity_auth")
    with scratch_engine.begin() as conn:
        assert conn.execute(text("SELECT status, is_active FROM sites WHERE id = :id"), {"id": inactive_site}).one() == ("inactive", False)
        assert conn.execute(text("SELECT count(*) FROM site_settings")).scalar_one() == 2
        rows = conn.execute(text(
            "SELECT u.email, p.full_name, r.code, ur.site_id, u.account_status, u.is_active, c.password_hash "
            "FROM users u JOIN people p ON p.id = u.person_id JOIN user_credentials c ON c.user_id = u.id "
            "JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id ORDER BY u.email"
        )).all()
        by_role = {row.code: row for row in rows}
        assert by_role["super-admin"].site_id is None          # platform role loses its site
        assert by_role["site-admin"].site_id == site
        assert by_role["receptionist"].site_id is None         # grandfathered org-wide receptionist
        assert by_role["host"].account_status == "disabled" and by_role["host"].is_active is False
        assert all(row.password_hash.startswith("$argon2id$") for row in rows)
        assert conn.execute(text("SELECT count(*) FROM person_contacts WHERE is_primary AND channel = 'email'")).scalar_one() == 4

    migrate(scratch_engine, "downgrade", "0002_deduplicate_unique_indexes")
    with scratch_engine.begin() as conn:
        after = conn.execute(text("SELECT id, email, full_name, password_hash, role::text, site_id, is_active FROM users ORDER BY id")).all()
        restored = {row.role: row._asdict() for row in after}
        expected = {row.role: row._asdict() for row in before}
        # The super-admin's legacy site cannot be recovered (platform roles are not site-scoped); everything else is identical.
        assert {**restored["super-admin"], "site_id": None} == {**expected["super-admin"], "site_id": None}
        for role in ("site-admin", "receptionist", "host"):
            assert restored[role] == expected[role]
        assert conn.execute(text("SELECT is_active FROM sites WHERE id = :id"), {"id": inactive_site}).scalar_one() is False

    migrate(scratch_engine, "upgrade", "head")  # re-upgrade after downgrade must also work


def test_round_trip_preserves_visits_and_passes(scratch_engine):
    migrate(scratch_engine, "upgrade", "0005_backfill_identity_auth")
    with scratch_engine.begin() as conn:
        conn.execute(text("SELECT 1"))
    # Seed at 0002-shaped visit tables: 0003-0005 did not touch hosts/visitors/visits columns.
    with scratch_engine.begin() as conn:
        org, site, _, users = seed_legacy_after_0005(conn)
        codes, linked, directory_only = seed_legacy_visits(conn, org, site)
        legacy_visits = conn.execute(text("SELECT id, status::text, pass_digest FROM visits ORDER BY purpose")).all()

    migrate(scratch_engine, "upgrade", "head")
    with scratch_engine.begin() as conn:
        host = conn.execute(text("SELECT h.user_id, p.full_name, d.name, h.status FROM hosts h JOIN people p ON p.id = h.person_id "
                                 "JOIN departments d ON d.id = h.department_id WHERE h.id = :id"), {"id": linked}).one()
        assert host.user_id == users["host"] and host.name.lower() == "sales" and host.status == "active"
        other = conn.execute(text("SELECT h.user_id, p.full_name, p.email, d.name, h.status FROM hosts h JOIN people p ON p.id = h.person_id "
                                  "JOIN departments d ON d.id = h.department_id WHERE h.id = :id"), {"id": directory_only}).one()
        assert other.user_id is None and other.full_name == "Dee" and other.email == "dee@x.test" and other.name == host.name and other.status == "inactive"

        passes = dict(conn.execute(text("SELECT v.status, p.status FROM passes p JOIN visits v ON v.id = p.visit_id")).all())
        assert passes == {"scheduled": "active", "checked-in": "active", "checked-out": "expired"}
        cipher = Fernet(base64.urlsafe_b64encode(hashlib.sha256((get_settings().pass_encryption_key + ":pass-token").encode()).digest()))
        stored = conn.execute(text("SELECT p.token_ciphertext FROM passes p JOIN visits v ON v.id = p.visit_id WHERE v.status = 'scheduled'")).scalar_one()
        assert cipher.decrypt(stored.encode()).decode() == codes["scheduled"]  # re-encrypted under PASS_ENCRYPTION_KEY
        events = conn.execute(text("SELECT v.status, array_agg(e.event_type ORDER BY e.occurred_at) FROM visit_events e JOIN visits v ON v.id = e.visit_id GROUP BY v.status")).all()
        assert dict(events)["checked-out"] == ["created", "check_in", "check_out"]
        assert conn.execute(text("SELECT count(*) FROM invitations")).scalar_one() == 6
        assert conn.execute(text("SELECT count(*) FROM visits WHERE invitation_id IS NULL")).scalar_one() == 0
        profile = conn.execute(text("SELECT visit_count, status FROM visitor_profiles")).one()
        assert profile == (2, "active")
        assert conn.execute(text("SELECT count(*) FROM visits WHERE retention_eligible_at IS NOT NULL")).scalar_one() == 3

    migrate(scratch_engine, "downgrade", "0005_backfill_identity_auth")
    with scratch_engine.begin() as conn:
        restored = conn.execute(text("SELECT id, status::text, pass_digest FROM visits ORDER BY purpose")).all()
        restored_by_status = {row.status: row for row in restored}
        for row in legacy_visits:
            assert restored_by_status[row.status].id == row.id
            if row.status in ("scheduled", "checked-in", "checked-out"):
                assert restored_by_status[row.status].pass_digest == row.pass_digest
        decrypted = legacy_cipher().decrypt(conn.execute(text("SELECT pass_ciphertext FROM visits WHERE status = 'scheduled'")).scalar_one().encode())
        assert decrypted.decode() == codes["scheduled"]  # live pass still works after downgrade
        assert conn.execute(text("SELECT name, email, department, active FROM hosts WHERE id = :id"), {"id": directory_only}).one()[:2] == ("Dee", "dee@x.test")
        assert conn.execute(text("SELECT full_name FROM visitors")).scalar_one() == "Vic Visitor"
    migrate(scratch_engine, "upgrade", "head")


def seed_legacy_after_0005(conn):
    org, site = uuid.uuid4(), uuid.uuid4()
    conn.execute(text("INSERT INTO organizations (id, name) VALUES (:id, 'Org')"), {"id": org})
    conn.execute(text("INSERT INTO sites (id, organization_id, name) VALUES (:id, :org, 'HQ')"), {"id": site, "org": org})
    person, user = uuid.uuid4(), uuid.uuid4()
    conn.execute(text("INSERT INTO people (id, organization_id, full_name, email) VALUES (:id, :org, 'Hal Host', 'host@x.test')"), {"id": person, "org": org})
    conn.execute(text("INSERT INTO users (id, email, organization_id, person_id) VALUES (:id, 'host@x.test', :org, :p)"), {"id": user, "org": org, "p": person})
    return org, site, None, {"host": user}
