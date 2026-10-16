"""Retention eligibility, anonymization, holds, policy overrides, dry runs and failure recovery."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select, text, update

from app.jobs import JOBS, run_job
from app.models import (
    AuditLog, AuthenticationEvent, Notification, Pass, PassScan, Person, Visit, VisitDailyStat, VisitEvent, VisitorProfile, utcnow,
)
from app.services import retention

from .conftest import login
from .test_security import blacklist, pending_approval
from .test_visits import approved, invite


def completed_visit(client, world, months_ago, **kwargs):
    """A visit that was checked in and out, with its retention clock started `months_ago`."""
    visit = approved(client, world, **kwargs)
    client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
    client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-out", headers=world["kiosk"])
    return backdate(visit, months_ago)


def backdate(visit, months_ago):
    from app.database import SessionLocal

    with SessionLocal() as session:
        session.execute(update(Visit).where(Visit.id == uuid.UUID(visit["id"])).values(
            retention_eligible_at=retention.add_months(utcnow(), -months_ago)))
        session.commit()
    return visit


def run(db, **kwargs):
    counts = retention.run(db, **kwargs)
    db.expire_all()
    return counts


def visit_row(db, visit):
    return db.get(Visit, uuid.UUID(visit["id"]))


class TestEligibility:
    def test_ordinary_visit_is_anonymized_after_five_months(self, client, db, world):
        old = completed_visit(client, world, 6, name="Olga Old", email="olga@guest.com")
        recent = completed_visit(client, world, 4, name="Rita Recent", email="rita@guest.com")
        counts = run(db)
        assert counts["visits_anonymized"] == 1
        row = visit_row(db, old)
        assert row.anonymized_at and row.purpose == "[removed]" and row.privacy_consent_at is None
        assert db.get(Person, row.visitor_person_id).full_name == retention.SENTINEL_NAME
        for model in (VisitEvent, Pass):
            assert db.scalar(select(func.count()).select_from(model).where(model.visit_id == row.id)) == 0
        assert db.scalar(select(func.count()).select_from(Notification).where(Notification.visit_id == row.id)) == 0
        original = db.get(Person, uuid.UUID(old["visitor_id"]))
        assert original.identity_status == "anonymized" and original.email is None and original.phone is None
        assert db.get(VisitorProfile, original.id) is None
        assert visit_row(db, recent).anonymized_at is None
        stats = db.scalars(select(VisitDailyStat)).all()
        assert sum(s.visits for s in stats) == 1 and stats[0].final_status == "checked-out"

    def test_active_and_open_visits_are_never_touched(self, client, db, world):
        inside = approved(client, world, name="Ines Inside", email="ines@guest.com")
        client.post(f"/api/v1/kiosk/pass/{inside['pass_code']}/check-in", headers=world["kiosk"])
        pending = invite(client, world, name="Pete Pending", email="pete@guest.com")
        db.execute(update(Visit).values(starts_at=utcnow() - timedelta(days=400), ends_at=utcnow() - timedelta(days=399)))
        db.commit()
        assert run(db)["visits_anonymized"] == 0
        assert visit_row(db, inside).purpose != "[removed]" and visit_row(db, pending).purpose != "[removed]"

    def test_returning_visitor_keeps_identity_but_loses_old_visit_link(self, client, db, world):
        old = completed_visit(client, world, 7, name="Ray Returning", email="ray@guest.com")
        new = completed_visit(client, world, 1, name="Ray Returning", email="ray@guest.com")
        assert old["visitor_id"] == new["visitor_id"]
        run(db)
        person = db.get(Person, uuid.UUID(new["visitor_id"]))
        assert person.identity_status == "active" and person.email == "ray@guest.com"
        assert visit_row(db, old).visitor_person_id != person.id  # the old visit no longer points at Ray
        history = client.get(f"/api/v1/visitors/{person.id}/visits", headers=world["admin"]).json()
        assert [v["id"] for v in history] == [new["id"]]

    def test_staff_identities_are_never_anonymized(self, client, db, world):
        # A host's colleague (who has an account) visits another site as a visitor.
        response = client.post("/api/v1/visits", headers=world["hostauth"], json={
            "visitor_name": "Desk Person", "visitor_email": "desk@example.com", "host_id": str(world["host"].id), "purpose": "x",
            "starts_at": utcnow().isoformat(), "ends_at": (utcnow() + timedelta(hours=1)).isoformat()})
        visit = response.json()
        client.post(f"/api/v1/visits/{visit['id']}/revoke", headers=world["admin"])
        backdate(visit, 6)
        run(db)
        assert visit_row(db, visit).anonymized_at is not None
        from app.models import User

        staff_person = db.scalar(select(Person).join(User, User.person_id == Person.id).where(User.email == "desk@example.com"))
        assert staff_person.identity_status == "active" and staff_person.email == "desk@example.com"


class TestSecurityAndHolds:
    def test_security_visits_follow_the_longer_policy(self, client, db, world):
        first = invite(client, world, name="Sid Security", email="sid@bad.com")
        blacklist(client, world, person_id=first["visitor_id"])
        approval = pending_approval(client, world)
        client.post(f"/api/v1/security/approvals/{approval['id']}/decision", headers=world["admin"], json={"decision": "deny", "reason": "Confirmed match"})
        backdate(first, 6)
        assert run(db)["visits_anonymized"] == 0
        backdate(first, 25)
        assert run(db)["visits_anonymized"] == 1
        assert db.scalar(text("SELECT count(*) FROM security_approvals")) == 0

    def test_holds_block_anonymization_until_released(self, client, db, world):
        visit = completed_visit(client, world, 6, name="Hank Held", email="hank@guest.com")
        hold = client.post("/api/v1/retention/holds", headers=world["admin"], json={
            "entity_type": "person", "entity_id": visit["visitor_id"], "hold_type": "legal", "reason": "Litigation hold for claim 42",
            "case_reference": "CASE-42", "review_due_at": (utcnow() + timedelta(days=90)).isoformat()})
        assert hold.status_code == 201, hold.text
        counts = run(db)
        assert counts["visits_anonymized"] == 0 and counts["visits_held"] == 1
        released = client.post(f"/api/v1/retention/holds/{hold.json()['id']}/release", headers=world["admin"], json={"reason": "Claim settled"})
        assert released.status_code == 200
        assert run(db)["visits_anonymized"] == 1

    def test_hold_rules(self, client, world):
        visit = completed_visit(client, world, 1)
        base = {"entity_type": "visit", "entity_id": visit["id"], "reason": "Investigation into incident", "review_due_at": (utcnow() + timedelta(days=30)).isoformat()}
        assert client.post("/api/v1/retention/holds", headers=world["admin"], json={**base, "hold_type": "legal"}).status_code == 422  # no case reference
        too_long = {**base, "hold_type": "security_incident", "review_due_at": (utcnow() + timedelta(days=500)).isoformat()}
        assert client.post("/api/v1/retention/holds", headers=world["admin"], json=too_long).status_code == 422
        assert client.post("/api/v1/retention/holds", headers=world["desk"], json={**base, "hold_type": "security_incident"}).status_code == 403
        assert client.post("/api/v1/retention/holds", headers=world["admin"], json={**base, "hold_type": "security_incident"}).status_code == 201


class TestPoliciesAndRuns:
    def test_organization_override_shortens_retention(self, client, db, make, world):
        make.user(world["org"], "super-admin", email="root@example.com")
        root = login(client, "root@example.com")
        visit = completed_visit(client, world, 4)
        assert run(db)["visits_anonymized"] == 0
        response = client.put("/api/v1/retention/policies", headers=root, json={
            "organization_id": str(world["org"].id), "record_class": "ordinary_visit", "retain_months": 3, "action": "anonymize"})
        assert response.status_code == 200
        assert run(db)["visits_anonymized"] == 1 and visit_row(db, visit).anonymized_at is not None

    def test_policy_permissions(self, client, make, world):
        make.user(world["org"], "super-admin", email="root@example.com")
        site_scoped = client.put("/api/v1/retention/policies", headers=world["admin"], json={
            "organization_id": str(world["org"].id), "record_class": "ordinary_visit", "retain_months": 2, "action": "anonymize"})
        assert site_scoped.status_code == 403
        platform = next(p for p in client.get("/api/v1/retention/policies", headers=login(client, "root@example.com")).json()
                        if p["record_class"] == "ordinary_visit" and p["organization_id"] is None)
        assert platform["retain_months"] == 5
        assert client.delete(f"/api/v1/retention/policies/{platform['id']}", headers=login(client, "root@example.com")).status_code == 409

    def test_dry_run_is_exact_and_changes_nothing(self, client, db, world):
        completed_visit(client, world, 6, name="Dora Dry", email="dora@guest.com")
        completed_visit(client, world, 8, name="Drew Dry", email="drew@guest.com")
        preview = run(db, dry_run=True)
        assert db.scalar(select(func.count()).select_from(Visit).where(Visit.anonymized_at.is_not(None))) == 0
        assert db.scalar(select(func.count()).select_from(VisitDailyStat)) == 0
        real = run(db)
        assert {k: preview[k] for k in ("visits_anonymized", "people_anonymized", "visit_events_deleted")} == \
               {k: real[k] for k in ("visits_anonymized", "people_anonymized", "visit_events_deleted")}
        assert run(db)["visits_anonymized"] == 0  # idempotent: nothing left to do

    def test_failed_run_changes_nothing_and_retry_succeeds(self, client, db, world, monkeypatch):
        visit = completed_visit(client, world, 6)
        original = retention.anonymize_people

        def crash(*args, **kwargs):
            raise RuntimeError("disk full")

        monkeypatch.setattr(retention, "anonymize_people", crash)
        job = next(j for j in JOBS if j.name == "retention")
        failed = run_job(job)
        assert failed.status == "failed" and "disk full" in failed.error
        db.expire_all()
        assert visit_row(db, visit).anonymized_at is None
        monkeypatch.setattr(retention, "anonymize_people", original)
        assert run_job(job).counts["visits_anonymized"] == 1

    def test_batch_audit_has_counts_not_names(self, client, db, world):
        completed_visit(client, world, 6, name="Quentin Quiet", email="quentin@guest.com")
        run(db)
        row = db.scalar(select(AuditLog).where(AuditLog.action == "retention.visits_anonymized"))
        assert row.event_metadata["visits"] == 1
        assert "Quentin" not in str(db.execute(text("SELECT metadata FROM audit_logs")).all())

    def test_old_operational_records_are_deleted(self, client, db, world):
        login(client, "desk@example.com")
        db.execute(text("SET LOCAL vms.allow_history_changes = 'on'"))
        db.execute(update(AuthenticationEvent).values(occurred_at=utcnow() - timedelta(days=400)))
        db.execute(update(PassScan).values(scanned_at=utcnow() - timedelta(days=400)))
        db.commit()
        counts = run(db)
        assert counts["deleted_auth_events"] >= 1
        assert db.scalar(select(func.count()).select_from(AuthenticationEvent)) == 0

    def test_preview_endpoint(self, client, make, world):
        make.user(world["org"], "super-admin", email="root@example.com")
        completed_visit(client, world, 6)
        body = client.get("/api/v1/retention/preview", headers=login(client, "root@example.com")).json()
        assert body["dry_run"] is True and body["counts"]["visits_anonymized"] == 1
        assert client.get("/api/v1/retention/preview", headers=world["admin"]).status_code == 403


@pytest.mark.parametrize("start,months,expected", [
    ("2026-03-31", -1, "2026-02-28"), ("2026-01-15", -5, "2025-08-15"), ("2024-08-31", 6, "2025-02-28"),
])
def test_calendar_months(start, months, expected):
    from datetime import datetime, timezone

    moment = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    assert retention.add_months(moment, months).date().isoformat() == expected
