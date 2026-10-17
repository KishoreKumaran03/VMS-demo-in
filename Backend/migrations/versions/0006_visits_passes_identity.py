"""Hosts and visitors become people; visits gain invitations, an event history and a separate pass table.

- hosts: linked to people (and to their login account via hosts.user_id instead of email matching),
  to departments, with a status lifecycle. Name/email/department columns move to people/departments.
- visitors: every row becomes a `people` row with the SAME id plus a `visitor_profiles` row; the table is dropped.
- visits: status becomes TEXT + CHECK (adds security-review, temporarily-out, no-show); visitor_id is renamed
  visitor_person_id; pass columns move to `passes`; existing invitations, check-ins and check-outs are
  written to `invitations` / `visit_events` (metadata.source = 'migration').
- passes: lookup hash is the existing SHA-256 digest; the re-displayable copy is re-encrypted from the old
  JWT-derived key to PASS_ENCRYPTION_KEY. Passes that cannot be decrypted stay valid but lose QR re-display.
- devices: pairing-code columns for kiosk enrollment.
- Every history foreign key moves from CASCADE to RESTRICT.

downgrade() rebuilds the legacy columns. Live passes keep working after a downgrade only if the same
JWT_SECRET and PASS_ENCRYPTION_KEY are configured.
"""
import base64
import hashlib
import secrets

from alembic import op
import sqlalchemy as sa
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.dialects import postgresql

from app.config import get_settings

revision = "0006_visits_passes_identity"
down_revision = "0005_backfill_identity_auth"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
VISIT_STATUSES = ("pending", "security-review", "scheduled", "checked-in", "temporarily-out", "checked-out", "no-show", "cancelled", "rejected")
TERMINAL = ("checked-out", "no-show", "cancelled", "rejected")
LEGACY_STATUSES = ("scheduled", "pending", "checked-in", "checked-out", "cancelled", "rejected")
NEW_PERMISSIONS = {
    "visit.check_in": ["super-admin", "site-admin", "receptionist"],
    "visitor.merge": ["super-admin", "site-admin"],
    "device.manage": ["super-admin", "site-admin"],
}


def _fernet(material: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material.encode()).digest()))


def legacy_cipher() -> Fernet:
    return _fernet(get_settings().jwt_secret + ":pass-encryption")


def pass_cipher() -> Fernet:
    return _fernet(get_settings().pass_encryption_key + ":pass-token")


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def add_updated_at_trigger(table: str) -> None:
    op.execute(f"CREATE TRIGGER trg_{table}_updated_at BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()")


def replace_fk(table, name, columns, ref_table, ref_columns, ondelete, new_name=None):
    op.drop_constraint(name, table, type_="foreignkey")
    op.create_foreign_key(new_name or name, table, ref_table, columns, ref_columns, ondelete=ondelete)


def upgrade():
    bind = op.get_bind()

    # permissions ---------------------------------------------------------------------------------
    for code, holders in NEW_PERMISSIONS.items():
        op.execute(sa.text("INSERT INTO permissions (id, code) SELECT COALESCE(max(id), 0) + 1, :code FROM permissions").bindparams(code=code))
        op.execute(sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE p.code = :code AND r.code = ANY(:holders)").bindparams(code=code, holders=holders))

    # hosts ---------------------------------------------------------------------------------------
    op.add_column("hosts", sa.Column("person_id", UUID))
    op.add_column("hosts", sa.Column("user_id", UUID))
    op.add_column("hosts", sa.Column("department_id", UUID))
    op.add_column("hosts", sa.Column("status", sa.Text(), nullable=False, server_default="active"))
    op.add_column("hosts", sa.Column("deactivated_at", sa.DateTime(timezone=True)))
    for column in timestamps():
        op.add_column("hosts", column)
    op.add_column("hosts", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))

    # Link a host to the account with the same email in its organization (one host per account).
    op.execute(
        """
        UPDATE hosts h SET person_id = u.person_id, user_id = u.id
        FROM (
            SELECT DISTINCT ON (h2.organization_id, lower(h2.email)) h2.id AS host_id, u2.id, u2.person_id
            FROM hosts h2 JOIN users u2 ON u2.organization_id = h2.organization_id AND u2.email = lower(h2.email)
            ORDER BY h2.organization_id, lower(h2.email), h2.active DESC, h2.id
        ) u
        WHERE h.id = u.host_id
        """
    )
    op.execute("UPDATE hosts SET person_id = gen_random_uuid() WHERE person_id IS NULL")
    op.execute(
        """
        INSERT INTO people (id, organization_id, full_name, email)
        SELECT h.person_id, h.organization_id, COALESCE(NULLIF(trim(h.name), ''), 'Unnamed host'), lower(h.email)
        FROM hosts h WHERE h.user_id IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO person_contacts (person_id, channel, value, is_primary)
        SELECT h.person_id, 'email', lower(h.email), true FROM hosts h WHERE h.user_id IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO departments (organization_id, name)
        SELECT DISTINCT ON (organization_id, lower(dept)) organization_id, dept
        FROM (SELECT organization_id, COALESCE(NULLIF(trim(department), ''), 'Unassigned') AS dept FROM hosts) named
        ORDER BY organization_id, lower(dept), dept
        ON CONFLICT (organization_id, lower(name)) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE hosts h SET department_id = d.id FROM departments d
        WHERE d.organization_id = h.organization_id AND lower(d.name) = lower(COALESCE(NULLIF(trim(h.department), ''), 'Unassigned'))
        """
    )
    op.execute("UPDATE hosts SET status = CASE WHEN active THEN 'active' ELSE 'inactive' END, deactivated_at = CASE WHEN active THEN NULL ELSE now() END")
    for column in ("person_id", "department_id"):
        op.alter_column("hosts", column, nullable=False)
    op.drop_column("hosts", "active")
    op.execute("ALTER TABLE hosts ADD COLUMN active boolean GENERATED ALWAYS AS (status = 'active') STORED")
    for column in ("name", "email", "department"):
        op.drop_column("hosts", column)
    op.create_check_constraint("ck_hosts_status", "hosts", "status IN ('active', 'inactive')")
    op.create_check_constraint("ck_hosts_deactivated_at", "hosts", "(status = 'inactive') = (deactivated_at IS NOT NULL)")
    op.create_unique_constraint("uq_hosts_organization_id_id", "hosts", ["organization_id", "id"])
    op.create_index("uq_hosts_user_id", "hosts", ["user_id"], unique=True, postgresql_where=sa.text("user_id IS NOT NULL"))
    op.create_index("ix_hosts_site_status", "hosts", ["site_id", "status"])
    op.create_index("ix_hosts_employee_id_trgm", "hosts", ["employee_id"], postgresql_using="gin", postgresql_ops={"employee_id": "gin_trgm_ops"})
    op.drop_constraint("hosts_organization_id_fkey", "hosts", type_="foreignkey")
    op.create_foreign_key("hosts_organization_id_fkey", "hosts", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")
    op.drop_constraint("hosts_site_id_fkey", "hosts", type_="foreignkey")
    op.create_foreign_key("fk_hosts_site", "hosts", "sites", ["organization_id", "site_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_hosts_person", "hosts", "people", ["organization_id", "person_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_hosts_user", "hosts", "users", ["organization_id", "user_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_hosts_department", "hosts", "departments", ["organization_id", "department_id"], ["organization_id", "id"], ondelete="RESTRICT")
    add_updated_at_trigger("hosts")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION reject_inactive_host() RETURNS trigger AS $$
        BEGIN
            IF (TG_OP = 'INSERT' OR NEW.host_id IS DISTINCT FROM OLD.host_id)
               AND NOT EXISTS (SELECT 1 FROM hosts WHERE id = NEW.host_id AND status = 'active') THEN
                RAISE EXCEPTION 'Host % is inactive and cannot receive new visits', NEW.host_id USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )

    # visitors -> people + visitor_profiles ----------------------------------------------------------
    op.execute(
        """
        INSERT INTO people (id, organization_id, full_name, email, phone, company, created_at)
        SELECT id, organization_id, COALESCE(NULLIF(trim(full_name), ''), 'Unknown visitor'), lower(email), phone, company, created_at
        FROM visitors
        """
    )
    op.create_table(
        "visitor_profiles",
        sa.Column("person_id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("classification", sa.Text(), nullable=False, server_default="standard"),
        sa.Column("identity_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("first_visit_at", sa.DateTime(timezone=True)),
        sa.Column("last_visit_at", sa.DateTime(timezone=True)),
        sa.Column("visit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(1000)),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *timestamps(),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_visitor_profiles_status"),
        sa.CheckConstraint("classification IN ('standard', 'frequent', 'contractor', 'vip', 'restricted')", name="ck_visitor_profiles_classification"),
        sa.CheckConstraint("visit_count >= 0", name="ck_visitor_profiles_visit_count"),
        sa.ForeignKeyConstraint(["organization_id", "person_id"], ["people.organization_id", "people.id"], name="fk_visitor_profiles_person", ondelete="RESTRICT"),
    )
    op.create_index("ix_visitor_profiles_org_classification", "visitor_profiles", ["organization_id", "classification"])
    op.create_index("ix_visitor_profiles_org_last_visit", "visitor_profiles", ["organization_id", sa.text("last_visit_at DESC NULLS LAST")])
    op.create_index("ix_visitor_profiles_review", "visitor_profiles", ["organization_id"], postgresql_where=sa.text("identity_review"))
    add_updated_at_trigger("visitor_profiles")
    op.execute(
        """
        INSERT INTO visitor_profiles (person_id, organization_id, status, first_visit_at, last_visit_at, visit_count)
        SELECT v.id, v.organization_id, CASE WHEN v.is_active THEN 'active' ELSE 'inactive' END,
               min(x.checked_in_at), max(x.checked_in_at), count(x.checked_in_at)
        FROM visitors v LEFT JOIN visits x ON x.visitor_id = v.id
        GROUP BY v.id, v.organization_id, v.is_active
        """
    )
    op.create_index("ix_people_org_phone_digits", "people", ["organization_id", sa.text("regexp_replace(phone, '[^0-9]', '', 'g')")], postgresql_where=sa.text("phone IS NOT NULL"))

    op.create_table(
        "person_merge_log",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_person_id", UUID, sa.ForeignKey("people.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("target_person_id", UUID, sa.ForeignKey("people.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("merged_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("moved_counts", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("source_person_id <> target_person_id", name="ck_person_merge_distinct"),
    )

    # devices: pairing -----------------------------------------------------------------------------
    op.add_column("devices", sa.Column("pairing_code_hash", sa.String(64)))
    op.add_column("devices", sa.Column("pairing_expires_at", sa.DateTime(timezone=True)))
    op.create_unique_constraint("uq_devices_organization_id_id", "devices", ["organization_id", "id"])
    op.create_index("uq_devices_pairing_code_hash", "devices", ["pairing_code_hash"], unique=True, postgresql_where=sa.text("pairing_code_hash IS NOT NULL"))

    # invitations ------------------------------------------------------------------------------------
    op.create_table(
        "invitations",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("site_id", UUID, nullable=False),
        sa.Column("host_id", UUID, nullable=False),
        sa.Column("visitor_person_id", UUID, nullable=False),
        sa.Column("purpose", sa.String(500), nullable=False),
        sa.Column("scheduled_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("scheduled_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("cancelled_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("cancel_reason", sa.String(500)),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *timestamps(),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')", name="ck_invitations_status"),
        sa.CheckConstraint("scheduled_end > scheduled_start", name="ck_invitations_period"),
        sa.CheckConstraint("(status = 'cancelled') = (cancelled_at IS NOT NULL)", name="ck_invitations_cancelled_at"),
        sa.ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"], name="fk_invitations_site", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id", "host_id"], ["hosts.organization_id", "hosts.id"], name="fk_invitations_host", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id", "visitor_person_id"], ["people.organization_id", "people.id"], name="fk_invitations_visitor", ondelete="RESTRICT"),
        sa.UniqueConstraint("organization_id", "id", name="uq_invitations_organization_id_id"),
    )
    op.create_index("ix_invitations_host_start", "invitations", ["host_id", sa.text("scheduled_start DESC")])
    op.create_index("ix_invitations_site_status_start", "invitations", ["site_id", "status", "scheduled_start"])
    op.create_index("ix_invitations_visitor", "invitations", ["visitor_person_id"])
    add_updated_at_trigger("invitations")
    op.execute("CREATE TRIGGER trg_invitations_active_host BEFORE INSERT OR UPDATE OF host_id ON invitations FOR EACH ROW EXECUTE FUNCTION reject_inactive_host()")

    # visits ---------------------------------------------------------------------------------------------
    op.execute("ALTER TABLE visits ALTER COLUMN status TYPE text USING status::text")
    sa.Enum(name="visit_status").drop(bind, checkfirst=True)
    op.alter_column("visits", "visitor_id", new_column_name="visitor_person_id")
    op.drop_index("ix_visits_visitor_id", table_name="visits")
    op.add_column("visits", sa.Column("invitation_id", UUID))
    op.add_column("visits", sa.Column("category", sa.Text(), nullable=False, server_default="business"))
    op.add_column("visits", sa.Column("created_by_device_id", UUID))
    op.add_column("visits", sa.Column("overdue_notified_at", sa.DateTime(timezone=True)))
    op.add_column("visits", sa.Column("retention_eligible_at", sa.DateTime(timezone=True)))
    op.add_column("visits", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.execute(f"UPDATE visits SET retention_eligible_at = COALESCE(checked_out_at, ends_at) WHERE status IN {TERMINAL}")

    # One invitation per pre-registered visit, mirroring its outcome. The id is assigned on the visit first
    # so the link is exact even when several visits share a host, visitor and timestamps.
    op.execute("UPDATE visits SET invitation_id = gen_random_uuid() WHERE source = 'invited'")
    op.execute(
        """
        INSERT INTO invitations (id, organization_id, site_id, host_id, visitor_person_id, purpose, scheduled_start, scheduled_end,
                                 status, created_by, cancelled_at, created_at)
        SELECT invitation_id, organization_id, site_id, host_id, visitor_person_id, purpose, starts_at, ends_at,
               CASE status WHEN 'pending' THEN 'pending' WHEN 'cancelled' THEN 'cancelled' WHEN 'rejected' THEN 'rejected' ELSE 'approved' END,
               created_by_id, CASE WHEN status = 'cancelled' THEN updated_at END, created_at
        FROM visits WHERE source = 'invited'
        """
    )

    op.create_check_constraint("ck_visits_status", "visits", f"status IN {VISIT_STATUSES}")
    op.create_check_constraint("ck_visits_source", "visits", "source IN ('invited', 'walk-in')")
    op.create_check_constraint("ck_visits_category", "visits", "category IN ('business', 'interview', 'contractor', 'delivery', 'personal', 'other')")
    op.create_check_constraint("ck_visits_period", "visits", "ends_at > starts_at")
    op.create_check_constraint("ck_visits_checked_in", "visits", "status NOT IN ('checked-in', 'temporarily-out', 'checked-out') OR checked_in_at IS NOT NULL")
    op.create_check_constraint("ck_visits_checked_out", "visits", "status <> 'checked-out' OR checked_out_at IS NOT NULL")
    op.create_check_constraint("ck_visits_retention_terminal", "visits", f"retention_eligible_at IS NULL OR status IN {TERMINAL}")
    op.create_unique_constraint("uq_visits_organization_id_id", "visits", ["organization_id", "id"])
    op.create_index("uq_visits_invitation", "visits", ["invitation_id"], unique=True, postgresql_where=sa.text("invitation_id IS NOT NULL"))
    op.create_index("ix_visits_site_status_start", "visits", ["site_id", "status", "starts_at"])
    op.create_index("ix_visits_on_site", "visits", ["site_id"], postgresql_where=sa.text("status IN ('checked-in', 'temporarily-out')"))
    op.create_index("ix_visits_overdue", "visits", ["ends_at"], postgresql_where=sa.text("status IN ('checked-in', 'temporarily-out')"))
    op.create_index("ix_visits_visitor_start", "visits", ["visitor_person_id", sa.text("starts_at DESC")])
    op.create_index("ix_visits_host_start", "visits", ["host_id", sa.text("starts_at DESC")])
    op.create_index("ix_visits_retention", "visits", ["retention_eligible_at"], postgresql_where=sa.text("retention_eligible_at IS NOT NULL"))

    replace_fk("visits", "visits_organization_id_fkey", ["organization_id"], "organizations", ["id"], "RESTRICT")
    op.drop_constraint("visits_site_id_fkey", "visits", type_="foreignkey")
    op.create_foreign_key("fk_visits_site", "visits", "sites", ["organization_id", "site_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.drop_constraint("visits_host_id_fkey", "visits", type_="foreignkey")
    op.create_foreign_key("fk_visits_host", "visits", "hosts", ["organization_id", "host_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.drop_constraint("visits_visitor_id_fkey", "visits", type_="foreignkey")
    op.create_foreign_key("fk_visits_visitor", "visits", "people", ["organization_id", "visitor_person_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_visits_invitation", "visits", "invitations", ["organization_id", "invitation_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_visits_device", "visits", "devices", ["organization_id", "created_by_device_id"], ["organization_id", "id"], ondelete="RESTRICT")
    replace_fk("visits", "visits_created_by_id_fkey", ["created_by_id"], "users", ["id"], "RESTRICT")
    add_updated_at_trigger("visits")
    op.execute("CREATE TRIGGER trg_visits_active_host BEFORE INSERT OR UPDATE OF host_id ON visits FOR EACH ROW EXECUTE FUNCTION reject_inactive_host()")

    # visit_events --------------------------------------------------------------------------------------
    op.create_table(
        "visit_events",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("visit_id", UUID, nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("from_status", sa.Text()),
        sa.Column("to_status", sa.Text()),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("actor_user_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("device_id", UUID, sa.ForeignKey("devices.id", ondelete="RESTRICT")),
        sa.Column("gate_label", sa.String(120)),
        sa.Column("pass_id", UUID),
        sa.Column("reason", sa.String(500)),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.CheckConstraint(
            "event_type IN ('created', 'approved', 'rejected', 'security_review_requested', 'security_approved', 'security_denied', "
            "'pass_issued', 'pass_revoked', 'check_in', 'step_out', 'reentry', 'check_out', 'cancelled', 'overdue_escalated', "
            "'no_show', 'manual_correction', 'reconciled', 'identity_merged')", name="ck_visit_events_type"),
        sa.ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"], name="fk_visit_events_visit", ondelete="RESTRICT"),
    )
    op.create_index("ix_visit_events_visit", "visit_events", ["visit_id", "occurred_at"])
    op.execute(
        """
        INSERT INTO visit_events (organization_id, visit_id, event_type, to_status, occurred_at, actor_user_id, metadata)
        SELECT organization_id, id, 'created', CASE WHEN source = 'walk-in' AND status <> 'pending' AND created_by_id IS NOT NULL THEN 'checked-in' ELSE 'pending' END,
               created_at, created_by_id, '{"source": "migration"}'::jsonb FROM visits
        """
    )
    op.execute(
        """
        INSERT INTO visit_events (organization_id, visit_id, event_type, from_status, to_status, occurred_at, gate_label, metadata)
        SELECT organization_id, id, 'check_in', 'scheduled', 'checked-in', checked_in_at, check_in_gate, '{"source": "migration"}'::jsonb
        FROM visits WHERE checked_in_at IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO visit_events (organization_id, visit_id, event_type, from_status, to_status, occurred_at, metadata)
        SELECT organization_id, id, 'check_out', 'checked-in', 'checked-out', checked_out_at, '{"source": "migration"}'::jsonb
        FROM visits WHERE checked_out_at IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO visit_events (organization_id, visit_id, event_type, to_status, occurred_at, metadata)
        SELECT organization_id, id, CASE status WHEN 'cancelled' THEN 'cancelled' ELSE 'rejected' END, status,
               COALESCE(pass_revoked_at, updated_at), '{"source": "migration"}'::jsonb
        FROM visits WHERE status IN ('cancelled', 'rejected')
        """
    )

    # passes --------------------------------------------------------------------------------------------
    op.create_table(
        "passes",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("visit_id", UUID, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("token_ciphertext", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("usage", sa.Text(), nullable=False, server_default="multi_entry"),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("issued_by_user_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("issued_by_device_id", UUID, sa.ForeignKey("devices.id", ondelete="RESTRICT")),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("revoke_reason", sa.String(500)),
        *timestamps(),
        sa.CheckConstraint("status IN ('active', 'revoked', 'expired', 'consumed')", name="ck_passes_status"),
        sa.CheckConstraint("usage IN ('single_entry', 'multi_entry')", name="ck_passes_usage"),
        sa.CheckConstraint("expires_at > valid_from", name="ck_passes_validity"),
        sa.CheckConstraint("(status = 'revoked') = (revoked_at IS NOT NULL)", name="ck_passes_revoked_at"),
        sa.CheckConstraint("status = 'active' OR token_ciphertext IS NULL", name="ck_passes_ciphertext_only_while_active"),
        sa.ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"], name="fk_passes_visit", ondelete="RESTRICT"),
        sa.UniqueConstraint("visit_id", name="uq_passes_visit"),  # one pass per visit; no replacement passes
    )
    op.create_index("ix_passes_expiry_active", "passes", ["expires_at"], postgresql_where=sa.text("status = 'active'"))
    add_updated_at_trigger("passes")
    op.create_foreign_key("fk_visit_events_pass", "visit_events", "passes", ["pass_id"], ["id"], ondelete="RESTRICT")

    old, new = legacy_cipher(), pass_cipher()
    rows = bind.execute(sa.text(
        "SELECT id, organization_id, status, pass_digest, pass_ciphertext, pass_expires_at, pass_revoked_at, starts_at, created_at, updated_at, created_by_id "
        # Only these statuses prove a pass was issued; pending/rejected/cancelled visits held an unissued placeholder.
        "FROM visits WHERE status IN ('scheduled', 'checked-in', 'checked-out')"
    )).mappings().all()
    for row in rows:
        active = row["status"] in ("scheduled", "checked-in") and row["pass_revoked_at"] is None
        ciphertext = None
        if active:
            try:
                ciphertext = new.encrypt(old.decrypt(row["pass_ciphertext"].encode())).decode()
            except InvalidToken:
                ciphertext = None
        status = "active" if active else ("revoked" if row["pass_revoked_at"] else "expired")
        valid_from = min(row["created_at"], row["starts_at"])
        bind.execute(sa.text(
            "INSERT INTO passes (organization_id, visit_id, token_hash, token_ciphertext, status, valid_from, expires_at, issued_by_user_id, "
            "issued_at, revoked_at, revoke_reason) VALUES (:org, :visit, :hash, :cipher, :status, :valid_from, "
            "GREATEST(:expires, CAST(:valid_from AS timestamptz) + interval '1 minute'), :issuer, :issued, :revoked, :reason)"
        ), {"org": row["organization_id"], "visit": row["id"], "hash": row["pass_digest"], "cipher": ciphertext, "status": status,
            "valid_from": valid_from, "expires": row["pass_expires_at"], "issuer": row["created_by_id"], "issued": row["created_at"],
            "revoked": row["pass_revoked_at"] if status == "revoked" else None,
            "reason": "migrated" if status == "revoked" else None})
    op.execute("UPDATE visit_events e SET pass_id = p.id FROM passes p WHERE p.visit_id = e.visit_id AND e.event_type IN ('check_in', 'check_out')")
    op.drop_index("ix_visits_pass_digest", table_name="visits")
    for column in ("pass_digest", "pass_ciphertext", "pass_expires_at", "pass_revoked_at"):
        op.drop_column("visits", column)

    op.create_table(
        "pass_scans",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT")),
        sa.Column("pass_id", UUID, sa.ForeignKey("passes.id", ondelete="RESTRICT")),
        sa.Column("site_id", UUID, sa.ForeignKey("sites.id", ondelete="RESTRICT")),
        sa.Column("device_id", UUID, sa.ForeignKey("devices.id", ondelete="RESTRICT")),
        sa.Column("actor_user_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("outcome", sa.Text(), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("action IN ('verify', 'check_in', 'check_out')", name="ck_pass_scans_action"),
        sa.CheckConstraint(
            "outcome IN ('accepted', 'malformed', 'unknown', 'expired', 'not_yet_valid', 'revoked', 'already_used', 'visit_cancelled', "
            "'visit_completed', 'not_approved', 'wrong_site', 'not_eligible', 'security_pending', 'blacklisted')", name="ck_pass_scans_outcome"),
        sa.CheckConstraint("device_id IS NOT NULL OR actor_user_id IS NOT NULL", name="ck_pass_scans_actor"),
    )
    op.create_index("ix_pass_scans_pass", "pass_scans", ["pass_id", "scanned_at"])
    op.create_index("ix_pass_scans_site_rejected", "pass_scans", ["site_id", "scanned_at"], postgresql_where=sa.text("outcome <> 'accepted'"))

    op.create_table(
        "idempotency_keys",
        sa.Column("scope", sa.String(80), primary_key=True),
        sa.Column("key", sa.String(120), primary_key=True),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("response_status", sa.Integer()),
        sa.Column("response_body", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_idempotency_keys_expires", "idempotency_keys", ["expires_at"])

    op.drop_table("visitors")


def downgrade():
    bind = op.get_bind()
    op.execute("DROP TABLE idempotency_keys, pass_scans")

    # visitors back from people
    op.create_table(
        "visitors",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("email", sa.String(320)),
        sa.Column("phone", sa.String(40)),
        sa.Column("company", sa.String(160)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_visitors_organization_id", "visitors", ["organization_id"])
    op.create_index("ix_visitors_org_email", "visitors", ["organization_id", "email"])
    op.execute(
        """
        INSERT INTO visitors (id, organization_id, full_name, email, phone, company, is_active, created_at)
        SELECT p.id, p.organization_id, p.full_name, p.email, p.phone, p.company, COALESCE(vp.status = 'active', true), p.created_at
        FROM people p LEFT JOIN visitor_profiles vp ON vp.person_id = p.id
        WHERE p.id IN (SELECT visitor_person_id FROM visits)
        """
    )

    # visits: pass columns back
    op.add_column("visits", sa.Column("pass_digest", sa.String(64)))
    op.add_column("visits", sa.Column("pass_ciphertext", sa.Text()))
    op.add_column("visits", sa.Column("pass_expires_at", sa.DateTime(timezone=True)))
    op.add_column("visits", sa.Column("pass_revoked_at", sa.DateTime(timezone=True)))
    old, new = legacy_cipher(), pass_cipher()
    rows = bind.execute(sa.text(
        "SELECT v.id, v.ends_at, v.updated_at, v.status, p.token_hash, p.token_ciphertext, p.expires_at, p.revoked_at "
        "FROM visits v LEFT JOIN passes p ON p.visit_id = v.id")).mappings().all()
    for row in rows:
        plain = None
        if row["token_ciphertext"]:
            try:
                plain = new.decrypt(row["token_ciphertext"].encode())
            except InvalidToken:
                plain = None
        seed = secrets.token_urlsafe(32).encode()
        digest = row["token_hash"] or hashlib.sha256(seed).hexdigest()
        revoked = row["revoked_at"] or (row["updated_at"] if row["status"] in ("cancelled", "rejected", "no-show") else None)
        bind.execute(sa.text("UPDATE visits SET pass_digest = :d, pass_ciphertext = :c, pass_expires_at = :e, pass_revoked_at = :r WHERE id = :id"), {
            "id": row["id"], "d": digest, "c": old.encrypt(plain or seed).decode(), "e": row["expires_at"] or row["ends_at"], "r": revoked})
    for column in ("pass_digest", "pass_ciphertext", "pass_expires_at"):
        op.alter_column("visits", column, nullable=False)
    op.create_index("ix_visits_pass_digest", "visits", ["pass_digest"], unique=True)

    op.execute("DROP TRIGGER IF EXISTS trg_visits_active_host ON visits")
    op.execute("DROP TRIGGER IF EXISTS trg_visits_updated_at ON visits")
    op.drop_constraint("fk_visit_events_pass", "visit_events", type_="foreignkey")
    op.drop_table("passes")
    op.drop_table("visit_events")
    for name in ("fk_visits_device", "fk_visits_invitation", "fk_visits_visitor", "fk_visits_host", "fk_visits_site"):
        op.drop_constraint(name, "visits", type_="foreignkey")
    replace_fk("visits", "visits_organization_id_fkey", ["organization_id"], "organizations", ["id"], "CASCADE")
    replace_fk("visits", "visits_created_by_id_fkey", ["created_by_id"], "users", ["id"], None)
    for name in ("ix_visits_retention", "ix_visits_host_start", "ix_visits_visitor_start", "ix_visits_overdue", "ix_visits_on_site", "ix_visits_site_status_start", "uq_visits_invitation"):
        op.drop_index(name, table_name="visits")
    op.drop_constraint("uq_visits_organization_id_id", "visits", type_="unique")
    for name in ("ck_visits_retention_terminal", "ck_visits_checked_out", "ck_visits_checked_in", "ck_visits_period", "ck_visits_category", "ck_visits_source", "ck_visits_status"):
        op.drop_constraint(name, "visits", type_="check")
    for column in ("version", "retention_eligible_at", "overdue_notified_at", "created_by_device_id", "category", "invitation_id"):
        op.drop_column("visits", column)
    op.alter_column("visits", "visitor_person_id", new_column_name="visitor_id")
    op.create_index("ix_visits_visitor_id", "visits", ["visitor_id"])
    op.execute("UPDATE visits SET status = CASE status WHEN 'security-review' THEN 'pending' WHEN 'temporarily-out' THEN 'checked-in' WHEN 'no-show' THEN 'cancelled' ELSE status END")
    visit_status = postgresql.ENUM(*LEGACY_STATUSES, name="visit_status")
    visit_status.create(bind)
    op.execute("ALTER TABLE visits ALTER COLUMN status TYPE visit_status USING status::visit_status")
    op.create_foreign_key("visits_site_id_fkey", "visits", "sites", ["site_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("visits_host_id_fkey", "visits", "hosts", ["host_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("visits_visitor_id_fkey", "visits", "visitors", ["visitor_id"], ["id"], ondelete="RESTRICT")
    op.drop_table("invitations")

    op.drop_index("uq_devices_pairing_code_hash", table_name="devices")
    op.drop_constraint("uq_devices_organization_id_id", "devices", type_="unique")
    op.drop_column("devices", "pairing_expires_at")
    op.drop_column("devices", "pairing_code_hash")
    op.drop_table("person_merge_log")
    op.drop_index("ix_people_org_phone_digits", table_name="people")
    op.drop_table("visitor_profiles")

    # hosts back to text columns
    op.execute("DROP TRIGGER IF EXISTS trg_hosts_updated_at ON hosts")
    op.add_column("hosts", sa.Column("name", sa.String(160)))
    op.add_column("hosts", sa.Column("email", sa.String(320)))
    op.add_column("hosts", sa.Column("department", sa.String(120)))
    op.execute(
        """
        UPDATE hosts h SET name = p.full_name, email = COALESCE(p.email, ''), department = d.name
        FROM people p, departments d WHERE p.id = h.person_id AND d.id = h.department_id
        """
    )
    for column in ("name", "email", "department"):
        op.alter_column("hosts", column, nullable=False)
    op.execute("ALTER TABLE hosts DROP COLUMN active")
    op.add_column("hosts", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE hosts SET active = (status = 'active')")
    for name in ("fk_hosts_department", "fk_hosts_user", "fk_hosts_person", "fk_hosts_site"):
        op.drop_constraint(name, "hosts", type_="foreignkey")
    replace_fk("hosts", "hosts_organization_id_fkey", ["organization_id"], "organizations", ["id"], "CASCADE")
    op.create_foreign_key("hosts_site_id_fkey", "hosts", "sites", ["site_id"], ["id"], ondelete="CASCADE")
    for name in ("ix_hosts_employee_id_trgm", "ix_hosts_site_status", "uq_hosts_user_id"):
        op.drop_index(name, table_name="hosts")
    op.drop_constraint("uq_hosts_organization_id_id", "hosts", type_="unique")
    op.drop_constraint("ck_hosts_deactivated_at", "hosts", type_="check")
    op.drop_constraint("ck_hosts_status", "hosts", type_="check")
    for column in ("version", "updated_at", "created_at", "deactivated_at", "status", "department_id", "user_id", "person_id"):
        op.drop_column("hosts", column)
    op.execute("DROP FUNCTION IF EXISTS reject_inactive_host()")

    # people that only existed for hosts/visitors are removed; account holders stay.
    op.execute("DELETE FROM person_contacts WHERE person_id NOT IN (SELECT person_id FROM users)")
    op.execute("DELETE FROM people WHERE id NOT IN (SELECT person_id FROM users)")
    op.execute("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ('visit.check_in', 'visitor.merge', 'device.manage'))")
    op.execute("DELETE FROM permissions WHERE code IN ('visit.check_in', 'visitor.merge', 'device.manage')")
