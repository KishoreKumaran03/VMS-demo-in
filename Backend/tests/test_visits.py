"""Visit lifecycle, passes, kiosk devices, visitor identity and the scheduled sweeps."""
import threading
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.database import SessionLocal
from app.models import Notification, Pass, PassScan, Person, Visit, VisitEvent, VisitorProfile, utcnow
from app.services import visits as lifecycle

from .conftest import login


def iso(dt):
    return dt.isoformat()


def invite(client, world, name="Vera Visitor", email="vera@guest.com", phone="+1 555 010 0200", hours=2, start=None, key=None):
    start = start or utcnow() - timedelta(minutes=5)
    headers = {**world["hostauth"], **({"Idempotency-Key": key} if key else {})}
    response = client.post("/api/v1/visits", headers=headers, json={
        "visitor_name": name, "visitor_email": email, "visitor_phone": phone, "host_id": str(world["host"].id),
        "purpose": "Planning", "starts_at": iso(start), "ends_at": iso(start + timedelta(hours=hours))})
    assert response.status_code in (200, 201), response.text
    return response.json()


def approved(client, world, **kwargs):
    visit = invite(client, world, **kwargs)
    response = client.post(f"/api/v1/visits/{visit['id']}/approve", headers=world["admin"])
    assert response.status_code == 200, response.text
    return response.json()


def events(db, visit_id):
    return db.scalars(select(VisitEvent.event_type).where(VisitEvent.visit_id == uuid.UUID(visit_id)).order_by(VisitEvent.recorded_at)).all()


class TestLifecycle:
    def test_invite_approve_enter_step_out_reenter_leave(self, client, db, world):
        visit = approved(client, world)
        code, kiosk = visit["pass_code"], world["kiosk"]
        assert visit["status"] == "scheduled" and code

        assert client.post(f"/api/v1/kiosk/pass/{code}/check-in", headers=kiosk).json()["status"] == "checked-in"
        assert client.post(f"/api/v1/visits/{visit['id']}/step-out", headers=world["desk"]).json()["status"] == "temporarily-out"
        assert client.post(f"/api/v1/kiosk/pass/{code}/check-in", headers=kiosk).json()["status"] == "checked-in"
        out = client.post(f"/api/v1/kiosk/pass/{code}/check-out", headers=kiosk).json()
        assert out["status"] == "checked-out" and out["pass_code"] is None

        assert events(db, visit["id"]) == ["created", "approved", "pass_issued", "check_in", "step_out", "reentry", "check_out"]
        stored = db.scalar(select(Pass).where(Pass.visit_id == uuid.UUID(visit["id"])))
        assert stored.status == "expired" and stored.token_ciphertext is None and code not in stored.token_hash
        assert db.scalar(select(Visit.retention_eligible_at).where(Visit.id == uuid.UUID(visit["id"]))) is not None
        history = client.get(f"/api/v1/visits/{visit['id']}/events", headers=world["admin"]).json()
        assert [e["to_status"] for e in history if e["event_type"] == "reentry"] == ["checked-in"]

    def test_invitation_mirrors_visit_outcome(self, client, db, world):
        visit = invite(client, world)
        client.post(f"/api/v1/visits/{visit['id']}/reject", headers=world["admin"], json={"reason": "Not needed"})
        status = db.scalar(text("SELECT i.status FROM invitations i JOIN visits v ON v.invitation_id = i.id WHERE v.id = :id"), {"id": visit["id"]})
        assert status == "rejected"

    def test_hosts_cannot_approve_their_own_invitations(self, client, world):
        visit = invite(client, world)
        assert client.post(f"/api/v1/visits/{visit['id']}/approve", headers=world["hostauth"]).status_code == 403

    def test_reentry_can_be_disabled_per_site(self, client, world):
        client.patch(f"/api/v1/sites/{world['site'].id}/settings", headers=world["admin"], json={"allow_reentry": False})
        visit = approved(client, world)
        client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        assert client.post(f"/api/v1/visits/{visit['id']}/step-out", headers=world["desk"]).status_code == 409

    def test_reception_walk_in_is_admitted_immediately(self, client, db, world):
        response = client.post("/api/v1/reception/walk-ins", headers=world["desk"], json={
            "visitor_name": "Walter Walkin", "visitor_phone": "5550001111", "host_id": str(world["host"].id), "site_id": str(world["site"].id),
            "purpose": "Delivery", "consent_accepted": True, "nda_accepted": True})
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["status"] == "checked-in" and body["pass_code"]
        assert events(db, body["id"]) == ["created", "approved", "pass_issued", "check_in"]
        notes = db.scalars(select(Notification.title)).all()
        assert "Walter Walkin has arrived" in notes


class TestPasses:
    def test_duplicate_check_in_is_idempotent(self, client, db, world):
        visit = approved(client, world)
        for _ in range(3):
            assert client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"]).status_code == 200
        assert events(db, visit["id"]).count("check_in") == 1

    def test_concurrent_check_in_records_one_event(self, client, db, world):
        visit = approved(client, world)
        device_id = db.scalar(text("SELECT id FROM devices LIMIT 1"))
        barrier, errors = threading.Barrier(4), []

        def attempt():
            with SessionLocal() as session:
                barrier.wait()
                try:
                    found = lifecycle.evaluate_pass(session, visit["pass_code"], action="check_in", site_ids=frozenset({world["site"].id}),
                                                    actor=lifecycle.Actor(device_id=device_id))
                    lifecycle.check_in(session, found, lifecycle.Actor(device_id=device_id), "Lobby")
                    session.commit()
                except Exception as exc:  # pragma: no cover - surfaced below
                    errors.append(exc)
                    session.rollback()

        threads = [threading.Thread(target=attempt) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert errors == []
        assert events(db, visit["id"]).count("check_in") == 1
        assert db.scalar(select(VisitorProfile.visit_count)) == 1

    def test_expired_pass_cannot_enter_but_visitor_can_still_leave(self, client, db, world):
        visit = approved(client, world)
        client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        db.execute(update(Pass).values(expires_at=utcnow() - timedelta(minutes=1), valid_from=utcnow() - timedelta(hours=3)))
        db.commit()
        # Re-entry after stepping out needs a valid pass...
        client.post(f"/api/v1/visits/{visit['id']}/step-out", headers=world["desk"])
        reentry = client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        assert reentry.status_code == 404 and reentry.json()["detail"] == "This pass has expired"
        # ...but signing out never does.
        assert client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-out", headers=world["kiosk"]).json()["status"] == "checked-out"
        outcomes = db.scalars(select(PassScan.outcome).order_by(PassScan.id)).all()
        assert outcomes == ["accepted", "expired", "accepted"]

    def test_revoked_and_unknown_passes_are_rejected_and_logged(self, client, db, world):
        visit = approved(client, world)
        assert client.post(f"/api/v1/visits/{visit['id']}/revoke", headers=world["hostauth"]).json()["status"] == "cancelled"
        revoked = client.get(f"/api/v1/kiosk/pass/{visit['pass_code']}", headers=world["kiosk"])
        assert revoked.status_code == 404 and "revoked" in revoked.json()["detail"]
        assert client.get("/api/v1/kiosk/pass/" + "x" * 43, headers=world["kiosk"]).status_code == 404
        assert client.get("/api/v1/kiosk/pass/short", headers=world["kiosk"]).status_code == 404
        assert db.scalars(select(PassScan.outcome).order_by(PassScan.id)).all() == ["revoked", "unknown", "malformed"]
        assert db.scalar(select(Pass.revoked_at)) is not None

    def test_pass_from_another_site_is_rejected(self, client, make, world):
        other_site = make.site(world["org"], "Annex")
        visit = approved(client, world)
        response = client.get(f"/api/v1/kiosk/pass/{visit['pass_code']}", headers=make.kiosk(client, other_site))
        assert response.status_code == 409 and response.json()["detail"] == "This pass is for a different site"

    def test_inactive_visitor_is_blocked_at_entry(self, client, world):
        visit = approved(client, world)
        assert client.delete(f"/api/v1/visitors/{visit['visitor_id']}", headers=world["admin"]).status_code == 204
        blocked = client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        assert blocked.status_code == 403
        assert client.post(f"/api/v1/visits/{visit['id']}/check-in", headers=world["desk"]).status_code == 403

    def test_staff_can_redisplay_active_pass_only(self, client, world):
        visit = approved(client, world)
        listed = client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).json()
        assert listed["pass_code"] == visit["pass_code"]
        client.post(f"/api/v1/visits/{visit['id']}/revoke", headers=world["admin"])
        assert client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).json()["pass_code"] is None


class TestKioskDevices:
    def test_unpaired_or_disabled_kiosk_is_refused(self, client, db, world):
        assert client.get("/api/v1/kiosk/hosts").status_code == 401
        assert client.get("/api/v1/kiosk/hosts", headers={"X-Device-Key": "guess"}).status_code == 401
        device_id = db.scalar(text("SELECT id FROM devices"))
        assert client.delete(f"/api/v1/devices/{device_id}", headers=world["admin"]).status_code == 204
        assert client.get("/api/v1/kiosk/hosts", headers=world["kiosk"]).status_code == 401

    def test_pairing_code_is_single_use(self, client, world):
        created = client.post("/api/v1/devices", headers=world["admin"], json={"name": "Side door", "site_id": str(world["site"].id)}).json()
        code = created["pairing_code"]
        assert client.post("/api/v1/kiosk/pair", json={"pairing_code": code.lower()}).status_code == 200
        assert client.post("/api/v1/kiosk/pair", json={"pairing_code": code}).status_code == 400

    def test_kiosk_only_sees_its_own_site_and_requests(self, client, make, world):
        annex = make.site(world["org"], "Annex")
        make.host(world["org"], annex, name="Andy Annex")
        annex_kiosk = make.kiosk(client, annex)
        assert [h["name"] for h in client.get("/api/v1/kiosk/hosts", headers=world["kiosk"]).json()] == ["Hana Host"]
        walk_in = client.post("/api/v1/kiosk/walk-ins", headers=world["kiosk"], json={
            "visitor_name": "Kim Kiosk", "visitor_phone": "5550002222", "host_id": str(world["host"].id), "site_id": str(world["site"].id),
            "purpose": "Meeting", "consent_accepted": True, "nda_accepted": True}).json()
        assert client.get(f"/api/v1/kiosk/requests/{walk_in['id']}", headers=world["kiosk"]).status_code == 200
        assert client.get(f"/api/v1/kiosk/requests/{walk_in['id']}", headers=annex_kiosk).status_code == 404
        cross = client.post("/api/v1/kiosk/walk-ins", headers=annex_kiosk, json={
            "visitor_name": "Kim Kiosk", "visitor_phone": "5550002222", "host_id": str(world["host"].id), "site_id": str(world["site"].id),
            "purpose": "Meeting", "consent_accepted": True, "nda_accepted": True})
        assert cross.status_code == 404

    def test_kiosk_walk_in_waits_for_host_then_gets_pass(self, client, world):
        walk_in = client.post("/api/v1/kiosk/walk-ins", headers=world["kiosk"], json={
            "visitor_name": "Kim Kiosk", "visitor_phone": "5550002222", "host_id": str(world["host"].id), "site_id": str(world["site"].id),
            "purpose": "Meeting", "consent_accepted": True, "nda_accepted": True}).json()
        poll = client.get(f"/api/v1/kiosk/requests/{walk_in['id']}", headers=world["kiosk"]).json()
        assert poll["status"] == "pending" and poll["pass_code"] is None
        client.post(f"/api/v1/visits/{walk_in['id']}/approve", headers=world["hostauth"])
        poll = client.get(f"/api/v1/kiosk/requests/{walk_in['id']}", headers=world["kiosk"]).json()
        assert poll["status"] == "scheduled" and poll["pass_code"]


class TestIdentity:
    def test_returning_visitor_reuses_person(self, client, db, world):
        first = invite(client, world, name="Vera Visitor", email="vera@guest.com")
        second = invite(client, world, name="vera visitor", email="VERA@guest.com", phone=None)
        assert first["visitor_id"] == second["visitor_id"]
        assert db.scalar(select(text("count(*)")).select_from(Person.__table__).where(Person.email == "vera@guest.com")) == 1

    def test_shared_contact_with_different_name_is_flagged_not_merged(self, client, db, world):
        first = invite(client, world, name="Vera Visitor", email="front-desk@acme.com", phone=None)
        second = invite(client, world, name="Oscar Other", email="front-desk@acme.com", phone=None)
        assert first["visitor_id"] != second["visitor_id"]
        assert db.get(VisitorProfile, uuid.UUID(second["visitor_id"])).identity_review is True

    def test_same_name_alone_never_links(self, client, world):
        first = invite(client, world, name="Sam Same", email="sam1@guest.com", phone=None)
        second = invite(client, world, name="Sam Same", email="sam2@guest.com", phone=None)
        assert first["visitor_id"] != second["visitor_id"]

    def test_merge_moves_history_and_is_logged(self, client, db, world):
        a = invite(client, world, name="Ann Lee", email="ann@one.com", phone=None)
        b = invite(client, world, name="Ann Lee", email="ann@two.com", phone=None)
        merged = client.post("/api/v1/visitors/merge", headers=world["admin"], json={"source_id": b["visitor_id"], "target_id": a["visitor_id"], "reason": "Same person, two emails"})
        assert merged.status_code == 200, merged.text
        history = client.get(f"/api/v1/visitors/{a['visitor_id']}/visits", headers=world["admin"]).json()
        assert {v["id"] for v in history} == {a["id"], b["id"]}
        assert db.get(Person, uuid.UUID(b["visitor_id"])).identity_status == "merged"
        assert db.scalar(text("SELECT count(*) FROM person_merge_log")) == 1
        assert client.post("/api/v1/visitors/merge", headers=world["desk"], json={"source_id": a["visitor_id"], "target_id": b["visitor_id"], "reason": "nope nope"}).status_code == 403


class TestIntegrity:
    def test_deactivated_host_gets_no_new_visits_but_keeps_history(self, client, db, world):
        visit = invite(client, world)
        assert client.delete(f"/api/v1/hosts/{world['host'].id}", headers=world["admin"]).status_code == 204
        refused = client.post("/api/v1/visits", headers=world["admin"], json={
            "visitor_name": "X", "host_id": str(world["host"].id), "purpose": "x", "starts_at": iso(utcnow()), "ends_at": iso(utcnow() + timedelta(hours=1))})
        assert refused.status_code == 404
        assert client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).status_code == 200
        with pytest.raises(DBAPIError, match="inactive"):
            db.execute(text("UPDATE visits SET host_id = :h WHERE id <> :v"), {"h": world["host"].id, "v": visit["id"]})
            db.execute(text("INSERT INTO visits (organization_id, site_id, visitor_person_id, host_id, purpose, starts_at, ends_at, status, source) "
                            "SELECT organization_id, site_id, visitor_person_id, host_id, 'x', now(), now() + interval '1 hour', 'pending', 'invited' FROM visits LIMIT 1"))
            db.commit()

    def test_deleting_a_host_with_visits_is_restricted(self, client, db, world):
        invite(client, world)
        with pytest.raises(IntegrityError):
            db.execute(text("DELETE FROM hosts WHERE id = :id"), {"id": world["host"].id})
            db.commit()

    def test_cross_organization_visit_reference_is_rejected(self, db, make, world):
        other = make.org("Other")
        foreign_host = make.host(other, make.site(other), name="Foreign")
        with pytest.raises(IntegrityError):
            db.execute(text("UPDATE visits SET host_id = :h"), {"h": foreign_host.id})
            db.execute(text("INSERT INTO visits (organization_id, site_id, visitor_person_id, host_id, purpose, starts_at, ends_at, status, source) "
                            "SELECT :org, :site, (SELECT id FROM people WHERE organization_id = :org LIMIT 1), :h, 'x', now(), now() + interval '1 hour', 'pending', 'invited'"),
                       {"org": world["org"].id, "site": world["site"].id, "h": foreign_host.id})
            db.commit()

    def test_status_and_pass_constraints(self, client, db, world):
        visit = approved(client, world)
        with pytest.raises(IntegrityError):
            db.execute(text("UPDATE visits SET status = 'teleported' WHERE id = :id"), {"id": visit["id"]})
            db.commit()
        db.rollback()
        with pytest.raises(IntegrityError):  # an ended pass must not keep a re-displayable token
            db.execute(text("UPDATE passes SET status = 'expired'"))
            db.commit()

    def test_idempotent_create(self, client, db, world):
        start = utcnow()
        first = invite(client, world, key="retry-1", start=start)
        second = invite(client, world, key="retry-1", start=start)
        assert first["id"] == second["id"] and db.scalar(text("SELECT count(*) FROM visits")) == 1
        conflict = client.post("/api/v1/visits", headers={**world["hostauth"], "Idempotency-Key": "retry-1"}, json={
            "visitor_name": "Someone Else", "host_id": str(world["host"].id), "purpose": "x",
            "starts_at": iso(utcnow()), "ends_at": iso(utcnow() + timedelta(hours=1))})
        assert conflict.status_code == 422

    def test_stale_visit_edit_rejected(self, client, world):
        visit = invite(client, world)
        ok = client.patch(f"/api/v1/visits/{visit['id']}", headers=world["admin"], json={"purpose": "New", "version": visit["version"]})
        assert ok.status_code == 200
        assert client.patch(f"/api/v1/visits/{visit['id']}", headers=world["admin"], json={"purpose": "Old", "version": visit["version"]}).status_code == 409

    def test_cross_organization_staff_access(self, client, make, world):
        visit = approved(client, world)
        other = make.org("Other")
        make.user(other, "site-admin", [make.site(other)], email="other@example.com")
        other_admin = login(client, "other@example.com")
        assert client.get(f"/api/v1/visits/{visit['id']}", headers=other_admin).status_code == 404
        assert client.post(f"/api/v1/visits/{visit['id']}/check-in", headers=other_admin).status_code in (403, 404)
        # A pass from another organization is simply unknown there (and the attempt is logged).
        assert client.post("/api/v1/passes/verify", headers=other_admin, json={"code": visit["pass_code"]}).status_code == 404
        make.user(other, "receptionist", [make.site(other, "Other2")], email="otherdesk@example.com")
        assert client.post("/api/v1/passes/verify", headers=login(client, "otherdesk@example.com"), json={"code": visit["pass_code"]}).status_code == 404


class TestSweeps:
    def test_overdue_visitors_are_escalated_once(self, client, db, world):
        visit = approved(client, world)
        client.post(f"/api/v1/kiosk/pass/{visit['pass_code']}/check-in", headers=world["kiosk"])
        later = utcnow() + timedelta(hours=3)
        assert lifecycle.escalate_overdue(db, later) == 1
        db.commit()
        assert lifecycle.escalate_overdue(db, later) == 0
        assert "overdue_escalated" in events(db, visit["id"])
        assert "Visitor overdue" in db.scalars(select(Notification.title)).all()
        assert client.get("/api/v1/dashboard/summary", headers=world["admin"]).json()["on_site"] == 1

    def test_no_shows_close_the_visit_and_expire_the_pass(self, client, db, world):
        visit = approved(client, world)
        assert lifecycle.mark_no_shows(db, utcnow() + timedelta(hours=5)) == 1
        db.commit()
        assert client.get(f"/api/v1/visits/{visit['id']}", headers=world["admin"]).json()["status"] == "no-show"
        assert db.scalar(select(Pass.status)) == "expired"
        assert db.scalar(text("SELECT i.status FROM invitations i")) == "expired"

    def test_dashboard_counts_from_database(self, client, world):
        approved(client, world)
        invite(client, world, name="Pat Pending", email="pat@guest.com")
        summary = client.get("/api/v1/dashboard/summary", headers=world["admin"]).json()
        assert summary["expected_today"] == 1 and summary["pending"] == 1 and summary["on_site"] == 0
