"""Test configuration.

Tests run against a real PostgreSQL database named by TEST_DATABASE_URL (never the development
database): the schema is dropped and rebuilt with Alembic once per session and every table except
the seeded role/permission catalog is truncated before each test.
"""
import os
from pathlib import Path

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
if TEST_DATABASE_URL:
    # Must be set before `app` is imported: settings and the engine are created at import time.
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    os.environ.setdefault("APP_ENV", "test")
    os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-long-enough-for-hs256")
    os.environ.setdefault("TOKEN_PEPPER", "test-token-pepper")
    os.environ.setdefault("PASS_ENCRYPTION_KEY", "test-pass-encryption-key")

from alembic.config import Config  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]
CATALOG_TABLES = {"alembic_version", "roles", "permissions", "role_permissions"}


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return config


@pytest.fixture(scope="session")
def migrated_database():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL is not set")
    if "test" not in TEST_DATABASE_URL.rsplit("/", 1)[-1]:
        pytest.exit("Refusing to run: TEST_DATABASE_URL must name a database containing 'test'.")
    from alembic import command
    from sqlalchemy import text

    from app.database import engine

    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    command.upgrade(alembic_config(), "head")
    with engine.connect() as conn:
        tables = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).scalars().all()
    return sorted(set(tables) - CATALOG_TABLES)


@pytest.fixture
def db_tables(migrated_database):
    from sqlalchemy import text

    from app.database import engine

    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(migrated_database)} RESTART IDENTITY CASCADE"))
        # Platform retention defaults are seed data like the role catalog; restore them after the truncate.
        for record_class, months, action, notes in retention_defaults():
            conn.execute(text("INSERT INTO retention_policies (record_class, retain_months, action, notes) VALUES (:c, :m, :a, :n)"),
                         {"c": record_class, "m": months, "a": action, "n": notes})
    return migrated_database


def retention_defaults():
    import importlib.util

    path = BACKEND_DIR / "migrations" / "versions" / "0008_retention_backups.py"
    spec = importlib.util.spec_from_file_location("retention_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.DEFAULTS


PASSWORD = "correct horse battery staple"


@pytest.fixture
def client(db_tables):
    from fastapi.testclient import TestClient

    from app.main import _request_counts, app

    _request_counts.clear()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db(db_tables):
    from app.database import SessionLocal

    with SessionLocal() as session:
        yield session


class Factory:
    """Builds organizations, sites and accounts through the same services the API uses."""

    def __init__(self, session):
        self.db = session

    def org(self, name="Acme"):
        from app.models import Organization

        org = Organization(name=name)
        self.db.add(org)
        self.db.commit()
        return org

    def site(self, org, name="HQ"):
        from app.routers.organizations import new_site

        site = new_site(self.db, org.id, name=name)
        self.db.commit()
        return site

    def user(self, org, role, sites=(), email=None, name="Test Person"):
        from app.services import accounts
        from app.models import Role

        role = Role(role)
        user = accounts.create_account(self.db, organization_id=org.id, email=email or f"{role.value}-{len(sites)}-{id(object())}@example.com",
                                       full_name=name, password=PASSWORD, role=role, site_ids=[s.id for s in sites], actor_id=None)
        self.db.commit()
        return user


    def host(self, org, site, *, email=None, name="Hana Host", employee_id=None, account=True):
        """A host, with a login account by default. Returns the Host row."""
        from app.models import Host, Person
        from app.routers.hosts import department_named

        self.counter = getattr(self, "counter", 0) + 1
        email = email or f"host{self.counter}-{id(object())}@example.com"
        if account:
            user = self.user(org, "host", [site], email=email, name=name)
            person_id, user_id = user.person_id, user.id
        else:
            person = Person(organization_id=org.id, full_name=name, email=email)
            self.db.add(person)
            self.db.flush()
            person_id, user_id = person.id, None
        host = Host(organization_id=org.id, site_id=site.id, person_id=person_id, user_id=user_id,
                    employee_id=employee_id or f"EMP-{self.counter:04d}", department_id=department_named(self.db, org.id, "Engineering").id)
        self.db.add(host)
        self.db.commit()
        return host

    def kiosk(self, client, site, name=None):
        """Registers and pairs a kiosk at `site`; returns the headers a paired kiosk sends."""
        from app.services import devices

        self.counter = getattr(self, "counter", 0) + 1
        _, code = devices.register(self.db, site=site, name=name or f"Kiosk {self.counter}", device_type="kiosk", actor_id=None)
        self.db.commit()
        response = client.post("/api/v1/kiosk/pair", json={"pairing_code": code})
        assert response.status_code == 200, response.text
        return {"X-Device-Key": response.json()["device_key"]}


@pytest.fixture
def make(db):
    return Factory(db)


def login(client, email, password=PASSWORD):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def outbox(monkeypatch):
    """Captures reset links instead of delivering them."""
    sent = []
    from app.services import accounts

    monkeypatch.setattr(accounts, "deliver_reset_link", lambda email, link: sent.append((email, link.split("#token=", 1)[1])))
    return sent


@pytest.fixture
def world(client, make):
    """One organization with a site, a site admin, a receptionist, a host with an account, and a paired kiosk."""
    org = make.org()
    site = make.site(org)
    make.user(org, "site-admin", [site], email="admin@example.com")
    make.user(org, "receptionist", [site], email="desk@example.com")
    host = make.host(org, site, email="host@example.com", name="Hana Host")
    return {
        "org": org, "site": site, "host": host,
        "admin": login(client, "admin@example.com"), "desk": login(client, "desk@example.com"), "hostauth": login(client, "host@example.com"),
        "kiosk": make.kiosk(client, site),
    }
