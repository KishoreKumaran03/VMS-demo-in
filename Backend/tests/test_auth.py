import threading
from datetime import timedelta

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import AuthenticationEvent, Notification, PasswordResetRequest, UserCredential, UserSession, utcnow

from .conftest import PASSWORD, login

NEW_PASSWORD = "a completely different passphrase"


def test_login_returns_role_and_scope(client, make):
    org = make.org()
    site = make.site(org)
    user = make.user(org, "receptionist", [site], email="Desk@Example.com")
    response = client.post("/api/v1/auth/login", json={"email": "desk@example.com", "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()["user"]
    assert body["id"] == str(user.id) and body["role"] == "receptionist"
    assert body["site_id"] == str(site.id) and body["site_ids"] == [str(site.id)]


def test_password_stored_only_as_argon2id_hash(db, make):
    org = make.org()
    user = make.user(org, "super-admin")
    stored = db.get(UserCredential, user.id).password_hash
    assert stored.startswith("$argon2id$") and PASSWORD not in stored
    with pytest.raises(IntegrityError):
        db.execute(text("UPDATE user_credentials SET password_hash = 'plaintext' WHERE user_id = :id"), {"id": user.id})
        db.commit()


def test_unknown_email_and_wrong_password_look_identical(client, make):
    org = make.org()
    make.user(org, "super-admin", email="boss@example.com")
    wrong = client.post("/api/v1/auth/login", json={"email": "boss@example.com", "password": "nope"})
    unknown = client.post("/api/v1/auth/login", json={"email": "ghost@example.com", "password": "nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_lockout_after_repeated_failures(client, db, make):
    org = make.org()
    make.user(org, "super-admin", email="boss@example.com")
    for _ in range(5):
        assert client.post("/api/v1/auth/login", json={"email": "boss@example.com", "password": "wrong"}).status_code == 401
    # Correct password is refused while locked, with the same generic message.
    locked = client.post("/api/v1/auth/login", json={"email": "boss@example.com", "password": PASSWORD})
    assert locked.status_code == 401 and locked.json()["detail"] == "Email or password is incorrect"
    reasons = db.scalars(select(AuthenticationEvent.event_metadata["reason"].astext).order_by(AuthenticationEvent.id)).all()
    assert reasons == ["bad_password"] * 4 + ["lockout", "locked"]
    assert PASSWORD not in str(db.scalars(select(AuthenticationEvent.event_metadata)).all())

    db.execute(text("UPDATE users SET locked_until = now() - interval '1 second'"))
    db.commit()
    assert client.post("/api/v1/auth/login", json={"email": "boss@example.com", "password": PASSWORD}).status_code == 200


def test_logout_and_deactivation_revoke_tokens(client, make):
    org = make.org()
    site = make.site(org)
    make.user(org, "super-admin", email="boss@example.com")
    make.user(org, "receptionist", [site], email="desk@example.com")
    admin, desk = login(client, "boss@example.com"), login(client, "desk@example.com")

    assert client.post("/api/v1/auth/logout", headers=desk).status_code == 204
    assert client.get("/api/v1/auth/me", headers=desk).status_code == 401

    desk = login(client, "desk@example.com")
    desk_id = client.get("/api/v1/auth/me", headers=desk).json()["id"]
    assert client.delete(f"/api/v1/users/{desk_id}", headers=admin).status_code == 204
    assert client.get("/api/v1/auth/me", headers=desk).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "desk@example.com", "password": PASSWORD}).status_code == 401


def test_change_password_keeps_current_session_only(client, make):
    org = make.org()
    make.user(org, "super-admin", email="boss@example.com")
    first, second = login(client, "boss@example.com"), login(client, "boss@example.com")
    bad = client.post("/api/v1/auth/password", headers=first, json={"current_password": "wrong", "new_password": NEW_PASSWORD})
    assert bad.status_code == 400
    assert client.post("/api/v1/auth/password", headers=first, json={"current_password": PASSWORD, "new_password": NEW_PASSWORD}).status_code == 204
    assert client.get("/api/v1/auth/me", headers=first).status_code == 200
    assert client.get("/api/v1/auth/me", headers=second).status_code == 401
    login(client, "boss@example.com", NEW_PASSWORD)


class TestSelfServiceReset:
    def test_response_does_not_reveal_accounts(self, client, make, outbox):
        org = make.org()
        site = make.site(org)
        make.user(org, "receptionist", [site], email="desk@example.com")
        known = client.post("/api/v1/auth/password-reset", json={"email": "desk@example.com"})
        unknown = client.post("/api/v1/auth/password-reset", json={"email": "nobody@example.com"})
        assert known.status_code == unknown.status_code == 202
        assert known.json() == unknown.json()
        assert [email for email, _ in outbox] == ["desk@example.com"]

    def test_full_reset_flow(self, client, db, make, outbox):
        org = make.org()
        site = make.site(org)
        make.user(org, "receptionist", [site], email="desk@example.com")
        old_session = login(client, "desk@example.com")
        client.post("/api/v1/auth/password-reset", json={"email": "desk@example.com"})
        (_, token), = outbox

        stored = db.scalar(select(PasswordResetRequest))
        assert stored.token_hash != token and token not in stored.token_hash  # only a keyed hash is stored
        assert stored.expires_at - stored.created_at == timedelta(minutes=30)

        assert client.post("/api/v1/auth/password-reset/complete", json={"token": token, "password": NEW_PASSWORD}).status_code == 204
        assert client.get("/api/v1/auth/me", headers=old_session).status_code == 401
        login(client, "desk@example.com", NEW_PASSWORD)
        # Single use.
        reuse = client.post("/api/v1/auth/password-reset/complete", json={"token": token, "password": "yet another passphrase"})
        assert reuse.status_code == 400
        login(client, "desk@example.com", NEW_PASSWORD)

    def test_expired_token_rejected(self, client, db, make, outbox):
        org = make.org()
        site = make.site(org)
        make.user(org, "receptionist", [site], email="desk@example.com")
        client.post("/api/v1/auth/password-reset", json={"email": "desk@example.com"})
        (_, token), = outbox
        db.execute(update(PasswordResetRequest).values(created_at=utcnow() - timedelta(hours=2), expires_at=utcnow() - timedelta(minutes=1)))
        db.commit()
        assert client.post("/api/v1/auth/password-reset/complete", json={"token": token, "password": NEW_PASSWORD}).status_code == 400
        login(client, "desk@example.com")

    def test_cooldown_and_new_request_cancels_old_link(self, client, db, make, outbox):
        org = make.org()
        site = make.site(org)
        make.user(org, "receptionist", [site], email="desk@example.com")
        client.post("/api/v1/auth/password-reset", json={"email": "desk@example.com"})
        client.post("/api/v1/auth/password-reset", json={"email": "desk@example.com"})
        assert len(outbox) == 1  # second request within the cooldown is not sent

        db.execute(update(PasswordResetRequest).values(created_at=utcnow() - timedelta(minutes=5)))
        db.commit()
        client.post("/api/v1/auth/password-reset", json={"email": "desk@example.com"})
        assert len(outbox) == 2
        first_token, second_token = outbox[0][1], outbox[1][1]
        assert client.post("/api/v1/auth/password-reset/complete", json={"token": first_token, "password": NEW_PASSWORD}).status_code == 400
        assert client.post("/api/v1/auth/password-reset/complete", json={"token": second_token, "password": NEW_PASSWORD}).status_code == 204

    def test_concurrent_completion_consumes_token_once(self, client, make, outbox):
        from app.services import accounts

        org = make.org()
        site = make.site(org)
        make.user(org, "receptionist", [site], email="desk@example.com")
        client.post("/api/v1/auth/password-reset", json={"email": "desk@example.com"})
        (_, token), = outbox

        results, barrier = [], threading.Barrier(2)

        def attempt(password):
            with SessionLocal() as session:
                barrier.wait()
                try:
                    accounts.complete_password_reset(session, token, password, ip=None, user_agent=None)
                    session.commit()
                    results.append(password)
                except Exception:
                    session.rollback()

        threads = [threading.Thread(target=attempt, args=(p,)) for p in ("first winner passphrase", "second winner passphrase")]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert len(results) == 1
        login(client, "desk@example.com", results[0])

    def test_privileged_reset_is_shorter_and_notifies_other_admins(self, client, db, make, outbox):
        org = make.org()
        site = make.site(org)
        target = make.user(org, "site-admin", [site], email="admin@example.com")
        other_admin = make.user(org, "super-admin", email="boss@example.com")
        client.post("/api/v1/auth/password-reset", json={"email": "admin@example.com"})
        stored = db.scalar(select(PasswordResetRequest).where(PasswordResetRequest.user_id == target.id))
        assert stored.expires_at - stored.created_at == timedelta(minutes=15)
        (_, token), = outbox
        assert client.post("/api/v1/auth/password-reset/complete", json={"token": token, "password": NEW_PASSWORD}).status_code == 204
        notified = db.scalars(select(Notification.recipient_id)).all()
        assert notified == [other_admin.id]


class TestAdminInitiatedReset:
    def test_site_admin_starts_reset_without_seeing_token(self, client, db, make, outbox):
        org = make.org()
        site = make.site(org)
        make.user(org, "site-admin", [site], email="admin@example.com")
        desk = make.user(org, "receptionist", [site], email="desk@example.com")
        response = client.post(f"/api/v1/users/{desk.id}/password-reset", headers=login(client, "admin@example.com"))
        assert response.status_code == 202
        (email, token), = outbox
        assert email == "desk@example.com" and token not in response.text
        assert db.scalar(select(PasswordResetRequest.initiated_by)) is not None

    def test_scope_is_enforced(self, client, make, outbox):
        org, other_org = make.org(), make.org("Other")
        site, other_site = make.site(org), make.site(org, "Annex")
        make.user(org, "site-admin", [site], email="admin@example.com")
        boss = make.user(org, "super-admin", email="boss@example.com")
        annex_desk = make.user(org, "receptionist", [other_site], email="annex@example.com")
        foreign = make.user(other_org, "receptionist", [make.site(other_org)], email="foreign@example.com")
        headers = login(client, "admin@example.com")
        for target in (boss, annex_desk, foreign):
            assert client.post(f"/api/v1/users/{target.id}/password-reset", headers=headers).status_code == 404
        assert outbox == []

    def test_host_cannot_initiate(self, client, make, outbox):
        org = make.org()
        site = make.site(org)
        make.user(org, "host", [site], email="host@example.com")
        desk = make.user(org, "receptionist", [site], email="desk@example.com")
        assert client.post(f"/api/v1/users/{desk.id}/password-reset", headers=login(client, "host@example.com")).status_code == 403


def test_sessions_are_server_side(db, client, make):
    org = make.org()
    make.user(org, "super-admin", email="boss@example.com")
    login(client, "boss@example.com")
    session = db.scalar(select(UserSession))
    assert session.revoked_at is None and session.expires_at > utcnow()
