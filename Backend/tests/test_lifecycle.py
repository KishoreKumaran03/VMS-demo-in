import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Host, Organization, Role, Site, User
from app.security import hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base.metadata.create_all(engine)
org_id, site_id = uuid.uuid4(), uuid.uuid4()
host_id, admin_id, host_user_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


def override_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_db
with TestingSession() as db:
    db.add_all([
        Organization(id=org_id, name="Test Organization"),
        Site(id=site_id, organization_id=org_id, name="Test Site"),
        User(id=admin_id, email="admin@example.com", full_name="Site Admin", password_hash=hash_password("a-strong-test-password"), role=Role.site_admin, organization_id=org_id, site_id=site_id),
        User(id=host_user_id, email="host@example.com", full_name="Host One", password_hash=hash_password("another-strong-password"), role=Role.host, organization_id=org_id, site_id=site_id),
        Host(id=host_id, organization_id=org_id, site_id=site_id, employee_id="EMP-1", name="Host One", email="host@example.com", department="Engineering"),
    ])
    db.commit()

client = TestClient(app)


def admin_headers():
    response = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "a-strong-test-password"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_login_and_role_scoped_visit_lifecycle():
    headers = admin_headers()
    start = datetime.now(timezone.utc) + timedelta(hours=1)
    created = client.post("/api/v1/visits", headers=headers, json={
        "visitor_name": "Test Visitor", "visitor_email": "visitor@example.com", "visitor_phone": "+15555550100",
        "host_id": str(host_id), "purpose": "Project meeting", "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=2)).isoformat(),
    })
    assert created.status_code == 201, created.text
    visit_id = created.json()["id"]
    assert created.json()["status"] == "pending"
    assert created.json()["pass_code"] is None

    approved = client.post(f"/api/v1/visits/{visit_id}/approve", headers=headers)
    assert approved.status_code == 200, approved.text
    code = approved.json()["pass_code"]
    assert len(code) >= 32
    assert approved.json()["status"] == "scheduled"

    checked_in = client.post(f"/api/v1/kiosk/pass/{code}/check-in", params={"gate": "Front Desk"})
    assert checked_in.status_code == 200, checked_in.text
    assert checked_in.json()["status"] == "checked-in"
    repeated = client.post(f"/api/v1/kiosk/pass/{code}/check-in")
    assert repeated.status_code == 200
    assert repeated.json()["checked_in_at"].removesuffix("Z") == checked_in.json()["checked_in_at"].removesuffix("Z")
    host_login = client.post("/api/v1/auth/login", json={"email": "host@example.com", "password": "another-strong-password"})
    host_headers = {"Authorization": f"Bearer {host_login.json()['access_token']}"}
    notifications = client.get("/api/v1/notifications", headers=host_headers)
    assert len(notifications.json()) == 1
    assert notifications.json()[0]["title"] == "Test Visitor has arrived"

    listed = client.get("/api/v1/visits", headers=headers)
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [visit_id]
    summary = client.get("/api/v1/dashboard/summary", headers=headers)
    assert summary.json()["on_site"] == 1

    checked_out = client.post(f"/api/v1/kiosk/pass/{code}/check-out")
    assert checked_out.status_code == 200
    assert checked_out.json()["status"] == "checked-out"
    visitor_id = checked_out.json()["visitor_id"]
    archived = client.delete(f"/api/v1/visitors/{visitor_id}", headers=headers)
    assert archived.status_code == 204
    assert client.get(f"/api/v1/kiosk/pass/{code}").status_code == 404


def test_invalid_login_and_invalid_state_transitions():
    bad_login = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "wrong"})
    assert bad_login.status_code == 401
    assert client.get("/api/v1/visits").status_code == 401
    assert client.post("/api/v1/kiosk/pass/not-a-real-code/check-in").status_code == 404
