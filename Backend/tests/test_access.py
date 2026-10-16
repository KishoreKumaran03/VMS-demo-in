"""Organization/site scoping, role assignment rules and database-level integrity."""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from .conftest import PASSWORD, login


def test_multi_site_admin_sees_exactly_their_sites(client, make):
    org = make.org()
    north, south, west = make.site(org, "North"), make.site(org, "South"), make.site(org, "West")
    admin = make.user(org, "site-admin", [north, south], email="admin@example.com")
    for site in (north, south, west):
        make.user(org, "receptionist", [site], email=f"desk-{site.name.lower()}@example.com")
    headers = login(client, "admin@example.com")

    me = client.get("/api/v1/auth/me", headers=headers).json()
    # Two sites: no single legacy site_id, and crucially not treated as organization-wide.
    assert me["site_id"] is None and sorted(me["site_ids"]) == sorted([str(north.id), str(south.id)])
    assert {s["name"] for s in client.get("/api/v1/sites", headers=headers).json()} == {"North", "South"}
    emails = {u["email"] for u in client.get("/api/v1/users", headers=headers).json()}
    assert emails == {"admin@example.com", "desk-north@example.com", "desk-south@example.com"}
    assert str(admin.id) in {u["id"] for u in client.get("/api/v1/users", headers=headers).json()}


def test_cross_organization_access_is_denied(client, make):
    org, other = make.org("Acme"), make.org("Globex")
    site, other_site = make.site(org), make.site(other)
    make.user(org, "site-admin", [site], email="admin@example.com")
    foreign = make.user(other, "receptionist", [other_site], email="foreign@example.com")
    headers = login(client, "admin@example.com")

    assert all(u["organization_id"] == str(org.id) for u in client.get("/api/v1/users", headers=headers).json())
    assert client.patch(f"/api/v1/users/{foreign.id}", headers=headers, json={"full_name": "Hijacked"}).status_code == 404
    assert client.delete(f"/api/v1/users/{foreign.id}", headers=headers).status_code == 404
    assert client.patch(f"/api/v1/sites/{other_site.id}", headers=headers, json={"name": "Mine"}).status_code == 404
    created = client.post("/api/v1/users", headers=headers, json={
        "email": "x@example.com", "full_name": "X", "password": PASSWORD, "role": "receptionist", "site_id": str(other_site.id)})
    assert created.status_code == 403


def test_site_admin_cannot_escalate(client, make):
    org = make.org()
    site, annex = make.site(org), make.site(org, "Annex")
    make.user(org, "site-admin", [site], email="admin@example.com")
    desk = make.user(org, "receptionist", [site], email="desk@example.com")
    headers = login(client, "admin@example.com")
    assert client.patch(f"/api/v1/users/{desk.id}", headers=headers, json={"role": "site-admin"}).status_code == 403
    assert client.patch(f"/api/v1/users/{desk.id}", headers=headers, json={"site_id": str(annex.id)}).status_code == 403
    assert client.post("/api/v1/users", headers=headers, json={
        "email": "a@example.com", "full_name": "A", "password": PASSWORD, "role": "site-admin", "site_id": str(site.id)}).status_code == 403


def test_super_admin_assigns_multiple_sites(client, make):
    org = make.org()
    north, south = make.site(org, "North"), make.site(org, "South")
    make.user(org, "super-admin", email="boss@example.com")
    headers = login(client, "boss@example.com")
    created = client.post("/api/v1/users", headers=headers, json={
        "email": "roam@example.com", "full_name": "Roaming Desk", "password": PASSWORD, "role": "receptionist",
        "site_ids": [str(north.id), str(south.id)]})
    assert created.status_code == 201, created.text
    assert sorted(created.json()["site_ids"]) == sorted([str(north.id), str(south.id)])

    moved = client.patch(f"/api/v1/users/{created.json()['id']}", headers=headers, json={"site_ids": [str(south.id)]})
    assert moved.json()["site_id"] == str(south.id)


def test_receptionist_requires_a_site(client, db, make):
    org = make.org()
    make.user(org, "super-admin", email="boss@example.com")
    response = client.post("/api/v1/users", headers=login(client, "boss@example.com"), json={
        "email": "desk@example.com", "full_name": "Desk", "password": PASSWORD, "role": "receptionist"})
    assert response.status_code == 422
    # The trigger enforces the same rule if application code is bypassed.
    user = make.user(org, "super-admin", email="other@example.com")
    with pytest.raises(DBAPIError, match="requires a site"):
        db.execute(text("INSERT INTO user_roles (user_id, role_id, organization_id) VALUES (:u, 3, :o)"), {"u": user.id, "o": org.id})
        db.commit()


def test_duplicate_login_email_rejected_case_insensitively(client, make):
    org = make.org()
    site = make.site(org)
    make.user(org, "super-admin", email="boss@example.com")
    make.user(org, "receptionist", [site], email="desk@example.com")
    response = client.post("/api/v1/users", headers=login(client, "boss@example.com"), json={
        "email": "DESK@example.com", "full_name": "Copy", "password": PASSWORD, "role": "receptionist", "site_id": str(site.id)})
    assert response.status_code == 409


def test_stale_version_is_rejected(client, make):
    org = make.org()
    site = make.site(org)
    make.user(org, "super-admin", email="boss@example.com")
    desk = make.user(org, "receptionist", [site], email="desk@example.com")
    headers = login(client, "boss@example.com")
    version = client.get("/api/v1/users", headers=headers).json()
    version = next(u["version"] for u in version if u["id"] == str(desk.id))
    assert client.patch(f"/api/v1/users/{desk.id}", headers=headers, json={"full_name": "First", "version": version}).status_code == 200
    stale = client.patch(f"/api/v1/users/{desk.id}", headers=headers, json={"full_name": "Second", "version": version})
    assert stale.status_code == 409


def test_cross_org_role_assignment_blocked_by_foreign_key(db, make):
    org, other = make.org("Acme"), make.org("Globex")
    foreign_site = make.site(other)
    user = make.user(org, "super-admin")
    with pytest.raises(IntegrityError):
        db.execute(text("INSERT INTO user_roles (user_id, role_id, organization_id, site_id) VALUES (:u, 2, :o, :s)"),
                   {"u": user.id, "o": org.id, "s": foreign_site.id})
        db.commit()


def test_deleting_organization_with_history_is_restricted(db, make):
    org = make.org()
    make.site(org)
    with pytest.raises(IntegrityError):
        db.execute(text("DELETE FROM organizations WHERE id = :id"), {"id": org.id})
        db.commit()


def test_site_settings_and_timezone(client, make):
    org = make.org()
    make.user(org, "super-admin", email="boss@example.com")
    headers = login(client, "boss@example.com")
    bad = client.post("/api/v1/sites", headers=headers, json={"name": "Moon", "timezone": "Mars/Base"})
    assert bad.status_code == 422
    site = client.post("/api/v1/sites", headers=headers, json={"name": "London", "timezone": "Europe/London", "code": "LON"}).json()
    assert site["timezone"] == "Europe/London" and site["status"] == "active"
    stale = client.patch(f"/api/v1/sites/{site['id']}", headers=headers, json={"name": "L2", "version": site["version"] + 1})
    assert stale.status_code == 409


def test_host_account_flow_still_notifies_host(client, db, make):
    """Regression check: visits still find the host's account after the identity refactor."""
    org = make.org()
    site = make.site(org)
    make.user(org, "site-admin", [site], email="admin@example.com")
    admin = login(client, "admin@example.com")
    created = client.post("/api/v1/hosts/accounts", headers=admin, json={
        "email": "host@example.com", "full_name": "Hana Host", "password": PASSWORD, "employee_id": "EMP-1", "department": "Sales"})
    assert created.status_code == 201, created.text
    host_id = created.json()["host"]["id"]

    walk_in = client.post("/api/v1/kiosk/walk-ins", headers=make.kiosk(client, site), json={
        "visitor_name": "Val Visitor", "visitor_phone": "5550001111", "host_id": host_id, "site_id": str(site.id),
        "purpose": "Meeting", "consent_accepted": True, "nda_accepted": True})
    assert walk_in.status_code == 201
    host = login(client, "host@example.com")
    assert [n["title"] for n in client.get("/api/v1/notifications", headers=host).json()] == ["Walk-in approval requested"]
    approved = client.post(f"/api/v1/visits/{walk_in.json()['id']}/approve", headers=host)
    assert approved.status_code == 200 and approved.json()["status"] == "scheduled"
    code = approved.json()["pass_code"]
    kiosk = make.kiosk(client, site)
    assert client.post(f"/api/v1/kiosk/pass/{code}/check-in", headers=kiosk).json()["status"] == "checked-in"
    assert client.post(f"/api/v1/kiosk/pass/{code}/check-out", headers=kiosk).json()["status"] == "checked-out"
