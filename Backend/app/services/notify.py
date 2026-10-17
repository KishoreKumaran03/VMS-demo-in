"""Notifications to staff.

Every notification is stored in-app (delivered on insert). When email copies are enabled
(EMAIL_DELIVERY != "disabled") an email row is queued as well, and an outbox event hands it to the
worker; a failed email never affects the business change that caused it.
"""
import logging
import sys
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Notification, NotificationAttempt, OutboxEvent, RoleDefinition, User, UserRole, utcnow
from . import outbox

logger = logging.getLogger("visitorhub.notify")


def notify(db: Session, *, organization_id: uuid.UUID, recipient_id: uuid.UUID, kind: str, title: str, message: str,
           visit_id: uuid.UUID | None = None, email: bool = True) -> None:
    now = utcnow()
    db.add(Notification(organization_id=organization_id, recipient_id=recipient_id, visit_id=visit_id, kind=kind, channel="in_app",
                        status="delivered", delivered_at=now, title=title, message=message))
    if email and get_settings().email_delivery != "disabled":
        copy = Notification(organization_id=organization_id, recipient_id=recipient_id, visit_id=visit_id, kind=kind, channel="email",
                            status="queued", title=title, message=message, read=True, read_at=now)
        db.add(copy)
        db.flush()
        outbox.emit(db, "notification.deliver", aggregate_type="notification", aggregate_id=copy.id, organization_id=organization_id)


def notify_roles(db: Session, *, organization_id: uuid.UUID, site_id: uuid.UUID | None, roles: tuple[str, ...], kind: str, title: str,
                 message: str, visit_id: uuid.UUID | None = None, exclude: set[uuid.UUID] = frozenset()) -> int:
    """Notify active staff holding any of `roles` at `site_id` (or organization-wide holders of those roles)."""
    query = (select(User.id).join(UserRole, UserRole.user_id == User.id).join(RoleDefinition)
             .where(User.organization_id == organization_id, User.is_active.is_(True), RoleDefinition.code.in_(roles)))
    if site_id is not None:
        query = query.where((UserRole.site_id == site_id) | UserRole.site_id.is_(None))
    recipients = [r for r in db.scalars(query).unique().all() if r not in exclude]
    for recipient in recipients:
        notify(db, organization_id=organization_id, recipient_id=recipient, kind=kind, title=title, message=message, visit_id=visit_id)
    return len(recipients)


# --- delivery (worker side) -------------------------------------------------------------------------

def send_email(to: str, subject: str, body: str) -> tuple[str, str | None]:
    """Returns (outcome, provider_message_id). Replace the body of this function to connect a provider."""
    settings = get_settings()
    if settings.email_delivery == "console" and settings.app_env == "development":
        print(f"[dev email] to={to} subject={subject!r}\n{body}", file=sys.stderr, flush=True)
        return "accepted", None
    raise RuntimeError(f"No email provider configured (EMAIL_DELIVERY={settings.email_delivery})")


def deliver_notification(db: Session, event: OutboxEvent) -> None:
    """Outbox handler for notification.deliver. Safe to repeat: a notification already accepted is skipped."""
    notification = db.get(Notification, event.aggregate_id, with_for_update=True)
    if notification is None or notification.status in {"accepted", "delivered"}:
        return
    user = db.get(User, notification.recipient_id)
    notification.status = "attempting"
    try:
        outcome, provider_id = send_email(user.email, notification.title, notification.message)
    except Exception as exc:
        db.add(NotificationAttempt(notification_id=notification.id, provider=get_settings().email_delivery, outcome="failed", error_code=type(exc).__name__))
        notification.status = "failed" if event.attempts + 1 >= outbox.MAX_ATTEMPTS else "queued"
        raise outbox.RetryLater(str(exc)) from exc
    db.add(NotificationAttempt(notification_id=notification.id, provider=get_settings().email_delivery, outcome=outcome, provider_message_id=provider_id))
    notification.status = outcome
    notification.delivered_at = utcnow()
