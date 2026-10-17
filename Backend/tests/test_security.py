"""Blacklist screening, security decisions, append-only history, outbox delivery and background jobs."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError

from app.config import get_settings
from app.database import SessionLocal
from app.jobs import JOBS, run_job
from app.models import (
    AuditLog, BlacklistEntry, Host, JobRun, Notification, NotificationAttempt, OutboxEvent, SecurityApproval, utcnow,
)
from app.services import audit, notify, outbox

from .conftest import login
from .test_visits import approved, events, invite


def blacklist(client, world, **body):
    response = client.post("/api/v1/blacklist", headers=world["admin"], json={"reason_category": "safety", "site_id": str(world["site"].id), **body})
    assert response.status_code == 201, response.text
    return response.json()


def pending_approval(client, world):
    rows = client.get("/api/v1/security/approvals", headers=world["admin"]).json()
    assert len(rows) == 1, rows
    return rows[0]


class TestScreening:
    def test_ordinary_visitors_skip_security_review(self, client, db, world):
        visit = invite(client, world)
        assert visit["status"] == "pending"
        assert db.scalar(select(SecurityApproval.id)) is None

    def test_known_person_is_held_for_security(self, client, db, world):
        first = invite(client, world, name="Rex Restricted", email="rex@bad.com")
        blacklist(client, world, person_id=first["visitor_id"], severity="require_approval")
        # The new record also flagged Rex's existing pending visit.
        assert client.get(f"/api/v1/visits/{first['id']}", headers=world["admin"]).json()["status"] == "security-review"
        second = invite(client, world, name="Rex Restricted", email="rex@bad.com")
        assert second["status"] == "security-review" and second["pass_code"] is None
        approvals = client.get("/api/v1/security/approvals", headers=world["admin"]).json()
        assert {a["visit_id"] for a in approvals} == {first["id"], second["id"]}
        assert all([m["confidence"] for m in a["matches"]] == ["confirmed"] for a in approvals)
        assert "Security review needed" in db.scalars(select(Notification.title)).all()
        # Hosts and receptionists never see restricted-entry details.
        assert client.get("/api/v1/security/approvals", headers=world["hostauth"]).status_code == 403
        assert client.get("/api/v1/blacklist", headers=world["desk"]).status_code == 403

    def test_deny_level_match_blocks_approval_until_ruled_out(self, client, db, world):
        blacklist(client, world, match_email="sam@bad.com", severity="deny")
        visit = invite(client, world, name="Sam Different", email="sam@bad.com")
        approval = pending_approval(client, world)
        match = approval["matches"][0]
        assert match["confidence"] == "uncertain" and match["match_basis"] == "email"
        url = f"/api/v1/security/approvals/{approval['id']}/decision"
        blocked = client.post(url, headers=world["admin"], json={"decision": "approve", "reason": "Looks fine"})
        assert blocked.status_code == 409
        ok = client.post(url, headers=world["admin"], json={"decision": "approve", "reason": "Shared mailbox; different person",
                                                            "match_reviews": [{"match_id": match["id"], "confidence": "rejected"}]})
        assert ok.status_code == 200, ok.text
        refreshed = client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).json()
        assert refreshed["status"] == "scheduled" and refreshed["pass_code"]
        assert db.scalar(select(BlacklistEntry.status)) == "active"  # the record itself is untouched
        assert events(db, visit["id"])[-2:] == ["security_approved", "pass_issued"]

    def test_denial_rejects_the_visit(self, client, world):
        blacklist(client, world, match_phone="+1 555 999 0000", severity="require_approval")
        visit = invite(client, world, name="Pat Phone", email=None, phone="555-999-0000")
        approval = pending_approval(client, world)
        client.post(f"/api/v1/security/approvals/{approval['id']}/decision", headers=world["admin"], json={"decision": "deny", "reason": "Confirmed match"})
        assert client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).json()["status"] == "rejected"

    def test_host_cannot_decide_for_their_own_visitor(self, client, db, make, world):
        # A site admin who is also the host of the visit.
        boss = make.user(world["org"], "site-admin", [world["site"]], email="boss-host@example.com")
        host = make.host(world["org"], world["site"], name="Boss Host", account=False)
        db.execute(update(Host).where(Host.id == host.id).values(user_id=boss.id))
        db.commit()
        blacklist(client, world, match_email="who@bad.com")
        response = client.post("/api/v1/visits", headers=world["admin"], json={
            "visitor_name": "Who Ever", "visitor_email": "who@bad.com", "host_id": str(host.id), "purpose": "x",
            "starts_at": utcnow().isoformat(), "ends_at": (utcnow() + timedelta(hours=1)).isoformat()})
        assert response.json()["status"] == "security-review"
        approval = pending_approval(client, world)
        own = client.post(f"/api/v1/security/approvals/{approval['id']}/decision", headers=login(client, "boss-host@example.com"),
                          json={"decision": "approve", "reason": "My own guest"})
        assert own.status_code == 403

    def test_new_record_catches_an_already_approved_visit_at_the_door(self, client, world):
        visit = approved(client, world, name="Late Flag", email="late@bad.com")
        entry = blacklist(client, world, match_email="late@bad.com")
        assert entry["status"] == "active"
        assert client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).json()["status"] == "security-review"
        door = client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        assert door.status_code == 409 and "security" in door.json()["detail"]

    def test_record_created_while_visitor_inside_blocks_reentry_until_approved(self, client, world):
        visit = approved(client, world, name="Inside Ivy", email="ivy@guest.com")
        client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        blacklist(client, world, match_email="ivy@guest.com")
        client.post(f"/api/v1/visits/{visit['id']}/step-out", headers=world["desk"])
        reentry = client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        assert reentry.status_code == 409
        approval = pending_approval(client, world)
        client.post(f"/api/v1/security/approvals/{approval['id']}/decision", headers=world["admin"], json={"decision": "approve", "reason": "Cleared by security"})
        assert client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"]).json()["status"] == "checked-in"

    def test_reception_walk_in_is_held_not_admitted(self, client, world):
        blacklist(client, world, match_name="Walter Watchlist")
        response = client.post("/api/v1/reception/walk-ins", headers=world["desk"], json={
            "visitor_name": "Walter Watchlist", "visitor_phone": "5550003333", "host_id": str(world["host"].id), "site_id": str(world["site"].id),
            "purpose": "Delivery", "consent_accepted": True, "nda_accepted": True})
        assert response.status_code == 201
        assert response.json()["status"] == "security-review" and response.json()["pass_code"] is None

    def test_lifted_and_expired_records_stop_matching(self, client, db, world):
        entry = blacklist(client, world, match_email="gone@bad.com")
        assert client.post(f"/api/v1/blacklist/{entry['id']}/lift", headers=world["admin"], json={"reason": "Court order ended"}).status_code == 200
        assert invite(client, world, name="Gone Person", email="gone@bad.com")["status"] == "pending"
        other = blacklist(client, world, match_email="temp@bad.com", effective_until=(utcnow() + timedelta(days=1)).isoformat())
        db.execute(update(BlacklistEntry).where(BlacklistEntry.id == uuid.UUID(other["id"]))
                   .values(effective_from=utcnow() - timedelta(days=3), effective_until=utcnow() - timedelta(days=1)))
        db.commit()
        assert invite(client, world, name="Temp Person", email="temp@bad.com")["status"] == "pending"
        assert run_job(next(j for j in JOBS if j.name == "blacklist_maintenance")).counts["expired"] == 1

    def test_review_date_is_bounded(self, client, world):
        response = client.post("/api/v1/blacklist", headers=world["admin"], json={
            "reason_category": "other", "match_name": "Forever Person", "site_id": str(world["site"].id),
            "review_due_at": (utcnow() + timedelta(days=800)).isoformat()})
        assert response.status_code == 422


class TestAudit:
    def test_history_tables_are_append_only(self, client, db, world):
        invite(client, world)
        for table, column in (("audit_logs", "action"), ("visit_events", "event_type"), ("authentication_events", "event_type")):
            with pytest.raises(DBAPIError, match="append-only"):
                db.execute(text(f"UPDATE {table} SET {column} = {column}"))
            db.rollback()
            with pytest.raises(DBAPIError, match="append-only"):
                db.execute(text(f"DELETE FROM {table}"))
            db.rollback()
        db.execute(text("SET LOCAL vms.allow_history_changes = 'on'"))
        db.execute(text("DELETE FROM pass_scans"))  # the retention job's escape hatch
        db.rollback()

    def test_audit_rows_are_structured_and_correlated(self, client, db, world):
        visit = invite(client, world)
        client.post(f"/api/v1/visits/{visit['id']}/approve", headers={**world["admin"], "X-Request-ID": "req-123"})
        row = db.scalar(select(AuditLog).where(AuditLog.action == "visit.approved"))
        assert row.entity_type == "visit" and str(row.entity_id) == visit["id"] and row.site_id == world["site"].id
        assert row.correlation_id == "req-123" and row.actor_user_id is not None
        listed = client.get("/api/v1/audit", headers=world["admin"], params={"entity_id": visit["id"]}).json()
        assert {r["action"] for r in listed} >= {"visit.created", "visit.approved"}
        assert client.get("/api/v1/audit", headers=world["hostauth"]).status_code == 200

    def test_audit_refuses_secrets(self, db):
        with pytest.raises(ValueError):
            audit.record(db, "x", entity_type="user", password="hunter2")

    def test_no_pass_code_in_audit_or_events(self, client, db, world):
        visit = approved(client, world)
        blob = str(db.execute(text("SELECT metadata FROM audit_logs")).all()) + str(db.execute(text("SELECT metadata FROM visit_events")).all())
        assert visit["pass_code"] not in blob


class TestOutboxAndNotifications:
    def test_state_changes_emit_events_in_the_same_transaction(self, client, db, world):
        visit = approved(client, world)
        rows = db.scalars(select(OutboxEvent.event_type).where(OutboxEvent.aggregate_id == uuid.UUID(visit["id"])).order_by(OutboxEvent.id)).all()
        assert rows == ["visit.created", "visit.status_changed"]

    def test_email_copy_is_delivered_by_worker_and_failures_are_retried(self, client, db, world, monkeypatch):
        monkeypatch.setattr(get_settings(), "email_delivery", "console")
        calls = []

        def flaky(to, subject, body):
            calls.append(subject)
            if "arrived" in subject and calls.count(subject) == 1:
                raise RuntimeError("provider timeout")
            return "accepted", "msg-1"

        monkeypatch.setattr(notify, "send_email", flaky)
        visit = approved(client, world)
        client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        email = db.scalar(select(Notification).where(Notification.channel == "email", Notification.kind == "arrival"))
        assert email.status == "queued"
        with SessionLocal() as session:
            assert outbox.process_batch(session, {"notification.deliver": notify.deliver_notification})["retried"] == 1
        db.expire_all()
        assert db.get(Notification, email.id).status == "queued"
        db.execute(update(OutboxEvent).values(available_at=utcnow()))
        db.commit()
        with SessionLocal() as session:
            outbox.process_batch(session, {"notification.deliver": notify.deliver_notification})
        db.expire_all()
        assert db.get(Notification, email.id).status == "accepted"
        attempts = select(NotificationAttempt.outcome).where(NotificationAttempt.notification_id == email.id).order_by(NotificationAttempt.id)
        assert db.scalars(attempts).all() == ["failed", "accepted"]
        # The arrival itself was committed regardless of the email failure.
        assert client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).json()["status"] == "checked-in"

    def test_poison_event_is_dead_lettered(self, db):
        outbox.emit(db, "boom", aggregate_type="test", aggregate_id=uuid.uuid4(), organization_id=None)
        db.commit()

        def explode(session, event):
            raise ValueError("bad payload")

        for _ in range(outbox.MAX_ATTEMPTS):
            db.execute(update(OutboxEvent).values(available_at=utcnow()))
            db.commit()
            with SessionLocal() as session:
                outbox.process_batch(session, {"boom": explode})
        db.expire_all()
        event = db.scalar(select(OutboxEvent))
        assert event.dead_lettered_at is not None and event.attempts == outbox.MAX_ATTEMPTS and "bad payload" in event.last_error

    def test_in_app_notifications_only_listed(self, client, db, world, monkeypatch):
        monkeypatch.setattr(get_settings(), "email_delivery", "console")
        visit = approved(client, world)
        client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        listed = client.get("/api/v1/notifications", headers=world["hostauth"]).json()
        assert [n["kind"] for n in listed] == ["arrival"]
        read = client.post(f"/api/v1/notifications/{listed[0]['id']}/read", headers=world["hostauth"]).json()
        assert read["read"] is True and read["read_at"]


class TestJobs:
    def test_jobs_record_runs_and_do_not_overlap(self, db, world):
        sweeps = next(j for j in JOBS if j.name == "visit_sweeps")
        run = run_job(sweeps)
        assert run.status == "succeeded" and set(run.counts) == {"no_shows", "overdue_escalations"}
        with SessionLocal() as holder:
            import zlib
            holder.execute(text("SELECT pg_advisory_lock(:k)"), {"k": zlib.crc32(b"visit_sweeps")})
            assert run_job(sweeps) is None
            holder.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": zlib.crc32(b"visit_sweeps")})
        assert db.scalar(select(text("count(*)")).select_from(JobRun.__table__)) == 1

    def test_failed_job_is_recorded(self, db, monkeypatch):
        from app import jobs

        failing = jobs.Job("visit_sweeps", timedelta(minutes=1), lambda session: 1 / 0)
        run = run_job(failing)
        assert run.status == "failed" and "ZeroDivisionError" in run.error

    def test_ops_health_reports_stale_jobs(self, client, make):
        org = make.org()
        make.user(org, "super-admin", email="root@example.com")
        health = client.get("/api/v1/ops/health", headers=login(client, "root@example.com")).json()
        assert health["status"] == "degraded" and any("visit_sweeps" in p for p in health["problems"])
        for job in JOBS:
            run_job(job)
        health = client.get("/api/v1/ops/health", headers=login(client, "root@example.com")).json()
        assert not [j for j in health["jobs"] if j["stale"]], health
