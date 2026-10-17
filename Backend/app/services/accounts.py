"""Account lifecycle: creation, role assignment, sign-in with lockout, password change and recovery.

Functions work inside the caller's transaction and do not commit, so an endpoint can combine several
steps (e.g. create a host account and its directory row) atomically. The exception is a rejected
sign-in or reset: the failure record is committed before the error is raised, because counting
failures is the point.
"""
import logging
import secrets
import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import (
    AuthenticationEvent, PasswordResetRequest, Person, PersonContact, Role, RoleDefinition, User, UserCredential, UserRole, utcnow,
)
from ..security import hash_password, hash_token, revoke_sessions, verify_password
from . import audit, notify

logger = logging.getLogger("visitorhub.accounts")

PRIVILEGED_ROLES = {Role.super_admin, Role.site_admin}
GENERIC_LOGIN_ERROR = "Email or password is incorrect"
GENERIC_RESET_ERROR = "This reset link is invalid or has expired"


def record_auth_event(db: Session, event_type: str, user: User | None = None, ip: str | None = None,
                      user_agent: str | None = None, **metadata) -> None:
    """Never pass passwords, tokens or OTPs as metadata."""
    db.add(AuthenticationEvent(organization_id=user.organization_id if user else None, user_id=user.id if user else None,
                               event_type=event_type, ip=ip, user_agent=(user_agent or "")[:300] or None, event_metadata=metadata))


def audit_account(db: Session, user: User, actor_id: uuid.UUID | None, action: str, **metadata) -> None:
    audit.record(db, action, entity_type="user", entity_id=user.id, organization_id=user.organization_id, actor_user_id=actor_id, **metadata)


# --- creation and roles --------------------------------------------------------------------------

def role_definition(db: Session, role: Role) -> RoleDefinition:
    return db.scalar(select(RoleDefinition).where(RoleDefinition.code == role.value))


def email_in_use(db: Session, email: str) -> bool:
    return db.scalar(select(User.id).where(User.email == email.lower())) is not None


def create_account(db: Session, *, organization_id: uuid.UUID, email: str, full_name: str, password: str, role: Role,
                   site_ids: list[uuid.UUID] | None, actor_id: uuid.UUID | None) -> User:
    email = email.strip().lower()
    if email_in_use(db, email):
        raise HTTPException(409, "An account with this email already exists")
    person = Person(organization_id=organization_id, full_name=full_name.strip(), email=email, created_by=actor_id, updated_by=actor_id)
    person.contacts.append(PersonContact(channel="email", value=email, is_primary=True))
    db.add(person)
    db.flush()
    user = User(email=email, organization_id=organization_id, person_id=person.id)
    db.add(user)
    db.flush()
    db.add(UserCredential(user_id=user.id, password_hash=hash_password(password)))
    assign_role(db, user, role, site_ids, actor_id)
    audit_account(db, user, actor_id, "account.created", role=role.value, sites=[str(s) for s in site_ids or []])
    return user


def assign_role(db: Session, user: User, role: Role, site_ids: list[uuid.UUID] | None, actor_id: uuid.UUID | None) -> None:
    """Replace the user's assignments with `role` at each of `site_ids` (None or [] = no site restriction).

    The roles table decides whether a site is required, optional or forbidden; the database trigger
    enforces the same rule, this check just turns it into a readable error.
    """
    definition = role_definition(db, role)
    sites = sorted(set(site_ids or []))
    if definition.scope == "platform":
        sites = []
    elif definition.scope == "site" and not sites:
        raise HTTPException(422, f"{role.value} accounts must be assigned to at least one site")
    user.role_assignments.clear()
    db.flush()
    for site_id in sites or [None]:
        user.role_assignments.append(UserRole(role_id=definition.id, organization_id=user.organization_id, site_id=site_id, granted_by=actor_id))
    db.flush()
    db.expire(user, ["role_assignments"])


def set_account_status(db: Session, user: User, status: str, actor_id: uuid.UUID | None) -> None:
    user.account_status = status
    if status != "active":
        revoke_sessions(db, user.id, "account_" + status)
    audit_account(db, user, actor_id, f"account.{status}")


# --- sign-in ---------------------------------------------------------------------------------------

def authenticate(db: Session, email: str, password: str, ip: str | None, user_agent: str | None) -> User:
    settings = get_settings()
    window_start = utcnow() - timedelta(minutes=15)
    if ip:
        recent_failures = db.scalar(select(func.count()).select_from(AuthenticationEvent).where(
            AuthenticationEvent.ip == ip, AuthenticationEvent.event_type == "login.failure", AuthenticationEvent.occurred_at > window_start))
        if recent_failures >= settings.login_ip_failures_per_15_minutes:
            raise HTTPException(429, "Too many sign-in attempts. Please try again later.")

    user = db.scalar(select(User).where(User.email == email.strip().lower()).with_for_update())
    credential = db.get(UserCredential, user.id) if user else None
    valid, upgraded = verify_password(password, credential.password_hash if credential else None)
    now = utcnow()

    if user is None:
        record_auth_event(db, "login.failure", None, ip, user_agent, reason="unknown_account")
        db.commit()
        raise HTTPException(401, GENERIC_LOGIN_ERROR)
    if user.locked_until and user.locked_until > now:
        record_auth_event(db, "login.failure", user, ip, user_agent, reason="locked")
        db.commit()
        raise HTTPException(401, GENERIC_LOGIN_ERROR)
    if not valid:
        user.failed_login_count += 1
        reason = "bad_password"
        if user.failed_login_count >= settings.login_max_failures:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_count = 0
            reason = "lockout"
        record_auth_event(db, "login.failure", user, ip, user_agent, reason=reason)
        db.commit()
        raise HTTPException(401, GENERIC_LOGIN_ERROR)
    if not user.is_active:
        record_auth_event(db, "login.failure", user, ip, user_agent, reason="inactive")
        db.commit()
        raise HTTPException(401, GENERIC_LOGIN_ERROR)

    if upgraded:
        credential.password_hash = upgraded
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    record_auth_event(db, "login.success", user, ip, user_agent)
    return user


def change_password(db: Session, user: User, new_password: str, *, actor_id: uuid.UUID | None, reason: str,
                    keep_session: uuid.UUID | None = None) -> None:
    credential = db.get(UserCredential, user.id)
    credential.password_hash = hash_password(new_password)
    credential.password_changed_at = utcnow()
    credential.must_change = False
    user.failed_login_count = 0
    user.locked_until = None
    revoke_sessions(db, user.id, reason, keep=keep_session)
    audit_account(db, user, actor_id, f"password.{reason}")


# --- recovery --------------------------------------------------------------------------------------

def deliver_reset_link(email: str, link: str) -> None:
    """Sent synchronously (never through the outbox) so the raw token is never stored. Tests replace this."""
    try:
        notify.send_email(email, "Reset your VisitorHub password", f"Use this link within the next few minutes to choose a new password:\n{link}")
    except Exception:
        logger.error("Password reset requested but the email could not be sent (EMAIL_DELIVERY=%s)", get_settings().email_delivery)


def deliver_security_notice(email: str, message: str) -> None:
    try:
        notify.send_email(email, "VisitorHub security notice", message)
    except Exception:
        logger.warning("Security notice could not be sent (EMAIL_DELIVERY=%s)", get_settings().email_delivery)


def primary_email_contact(db: Session, user: User) -> PersonContact | None:
    return db.scalar(select(PersonContact).where(
        PersonContact.person_id == user.person_id, PersonContact.channel == "email", PersonContact.is_primary.is_(True)))


def is_privileged(user: User) -> bool:
    return any(Role(a.role.code) in PRIVILEGED_ROLES for a in user.role_assignments)


def request_password_reset(db: Session, user: User | None, *, ip: str | None, user_agent: str | None,
                           initiated_by: User | None = None) -> None:
    """Create and deliver a single-use reset link. Silently does nothing when the request is not allowed,
    so callers can always return the same response."""
    settings = get_settings()
    now = utcnow()
    if ip and initiated_by is None:
        per_ip = db.scalar(select(func.count()).select_from(AuthenticationEvent).where(
            AuthenticationEvent.ip == ip, AuthenticationEvent.event_type == "reset.requested",
            AuthenticationEvent.occurred_at > now - timedelta(hours=1)))
        if per_ip >= settings.reset_requests_per_ip_per_hour:
            return
    if user is None or not user.is_active:
        record_auth_event(db, "reset.requested", user, ip, user_agent, outcome="ignored")
        return
    contact = primary_email_contact(db, user)
    if contact is None:
        record_auth_event(db, "reset.requested", user, ip, user_agent, outcome="no_channel")
        return

    recent = db.scalars(select(PasswordResetRequest.created_at).where(
        PasswordResetRequest.user_id == user.id, PasswordResetRequest.created_at > now - timedelta(hours=1))).all()
    if len(recent) >= settings.reset_requests_per_user_per_hour or any(
            created > now - timedelta(seconds=settings.reset_resend_cooldown_seconds) for created in recent):
        record_auth_event(db, "reset.requested", user, ip, user_agent, outcome="rate_limited")
        return

    # One live request per user: a new request cancels the previous link.
    db.execute(update(PasswordResetRequest).where(
        PasswordResetRequest.user_id == user.id, PasswordResetRequest.consumed_at.is_(None),
        PasswordResetRequest.cancelled_at.is_(None)).values(cancelled_at=now))
    privileged = is_privileged(user)
    minutes = settings.reset_token_minutes_privileged if privileged else settings.reset_token_minutes
    token = secrets.token_urlsafe(32)
    db.add(PasswordResetRequest(user_id=user.id, channel="email", contact_id=contact.id, token_hash=hash_token(token),
                                initiated_by=initiated_by.id if initiated_by else None, created_at=now, expires_at=now + timedelta(minutes=minutes),
                                request_ip=ip))
    record_auth_event(db, "reset.requested", user, ip, user_agent, outcome="sent", privileged=privileged,
                      initiated_by=str(initiated_by.id) if initiated_by else None)
    if initiated_by:
        audit_account(db, user, initiated_by.id, "password.reset_initiated", channel="email")
    db.flush()
    deliver_reset_link(contact.value, f"{settings.dashboard_url.rstrip('/')}/reset-password#token={token}")


def complete_password_reset(db: Session, token: str, new_password: str, *, ip: str | None, user_agent: str | None) -> User:
    now = utcnow()
    # Atomic single-use consumption: only one concurrent request can flip consumed_at.
    consumed = db.execute(
        update(PasswordResetRequest)
        .where(PasswordResetRequest.token_hash == hash_token(token), PasswordResetRequest.consumed_at.is_(None),
               PasswordResetRequest.cancelled_at.is_(None), PasswordResetRequest.expires_at > now)
        .values(consumed_at=now)
        .returning(PasswordResetRequest.user_id, PasswordResetRequest.contact_id)
    ).one_or_none()
    if consumed is None:
        record_auth_event(db, "reset.failed", None, ip, user_agent, reason="invalid_or_expired")
        db.commit()
        raise HTTPException(400, GENERIC_RESET_ERROR)
    user = db.get(User, consumed.user_id)
    if not user or not user.is_active:
        db.rollback()
        raise HTTPException(400, GENERIC_RESET_ERROR)

    change_password(db, user, new_password, actor_id=user.id, reason="reset")
    contact = db.get(PersonContact, consumed.contact_id)
    if contact.verified_at is None:
        contact.verified_at = now  # following the link proves control of the address
    record_auth_event(db, "reset.completed", user, ip, user_agent)

    if is_privileged(user):
        # Stronger policy for administrators: every other active administrator in the organization is told.
        admins = db.scalars(select(User).join(UserRole, UserRole.user_id == User.id).join(RoleDefinition).where(
            User.organization_id == user.organization_id, User.id != user.id, User.is_active.is_(True),
            RoleDefinition.code.in_([r.value for r in PRIVILEGED_ROLES]))).unique().all()
        for admin in admins:
            notify.notify(db, organization_id=user.organization_id, recipient_id=admin.id, kind="security", title="Administrator password reset",
                          message=f"{user.full_name} reset their password using email recovery.")
    deliver_security_notice(contact.value, "Your VisitorHub password was changed. If this was not you, contact your administrator.")
    return user
