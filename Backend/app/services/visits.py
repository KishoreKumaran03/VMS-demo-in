"""Visit lifecycle: the state machine, pass issuance/validation, check-in/out with re-entry, and the
overdue/no-show sweeps.

Every status change goes through `transition()`, which validates it against TRANSITIONS and appends a
`visit_events` row in the same transaction. Callers lock the visit row first (`lock_visit`), so two
concurrent check-ins serialize and the second one sees the first one's result.
"""
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..models import (
    ON_SITE_STATUSES, TERMINAL_STATUSES, Host, Invitation, Pass, PassScan, Person, SiteSettings, User, Visit, VisitEvent,
    VisitorProfile, VisitStatus, utcnow,
)
from ..security import decrypt_pass, digest_pass, encrypt_pass
from . import identity, notify, outbox, screening

S = VisitStatus
TRANSITIONS: dict[VisitStatus, set[VisitStatus]] = {
    S.pending: {S.scheduled, S.rejected, S.cancelled, S.security_review},
    S.security_review: {S.scheduled, S.rejected, S.cancelled},
    S.scheduled: {S.checked_in, S.cancelled, S.no_show, S.security_review},
    S.checked_in: {S.temporarily_out, S.checked_out},
    S.temporarily_out: {S.checked_in, S.checked_out},
}
INVITATION_STATUS = {S.scheduled: "approved", S.rejected: "rejected", S.cancelled: "cancelled", S.no_show: "expired"}
PASS_TOKEN = re.compile(r"^[A-Za-z0-9_-]{24,128}$")


@dataclass
class Actor:
    """Who performed an action: a signed-in user, a paired device, or the system (both None)."""

    user_id: uuid.UUID | None = None
    device_id: uuid.UUID | None = None


SYSTEM = Actor()


def visit_query_for_update(visit_id: uuid.UUID):
    return select(Visit).where(Visit.id == visit_id)


def lock_visit(db: Session, query) -> Visit | None:
    return db.scalar(query.options(joinedload(Visit.visitor), joinedload(Visit.host), joinedload(Visit.pass_)).with_for_update(of=Visit))


def record_event(db: Session, visit: Visit, event_type: str, actor: Actor, *, from_status: str | None = None,
                 to_status: str | None = None, gate: str | None = None, pass_id: uuid.UUID | None = None,
                 reason: str | None = None, metadata: dict | None = None) -> VisitEvent:
    event = VisitEvent(organization_id=visit.organization_id, visit_id=visit.id, event_type=event_type,
                       from_status=from_status, to_status=to_status, actor_user_id=actor.user_id, device_id=actor.device_id,
                       gate_label=gate, pass_id=pass_id, reason=reason, event_metadata=metadata or {})
    db.add(event)
    return event


def transition(db: Session, visit: Visit, to: VisitStatus, event_type: str, actor: Actor, *, gate: str | None = None,
               reason: str | None = None, metadata: dict | None = None) -> None:
    current = VisitStatus(visit.status)
    if to not in TRANSITIONS.get(current, set()):
        raise HTTPException(409, f"A {current.value} visit cannot become {to.value}")
    now = utcnow()
    visit.status = to
    if to in TERMINAL_STATUSES:
        visit.retention_eligible_at = visit.checked_out_at or now
        if visit.pass_ and visit.pass_.status == "active":
            end_pass(visit.pass_, "revoked" if to in {S.cancelled, S.rejected} else "expired", actor, reason)
    if visit.invitation_id and to in INVITATION_STATUS:
        invitation = db.get(Invitation, visit.invitation_id)
        invitation.status = INVITATION_STATUS[to]
        if to == S.cancelled:
            invitation.cancelled_at, invitation.cancelled_by, invitation.cancel_reason = now, actor.user_id, reason
    record_event(db, visit, event_type, actor, from_status=current.value, to_status=to.value, gate=gate,
                 pass_id=visit.pass_.id if visit.pass_ else None, reason=reason, metadata=metadata)
    db.flush()  # assigns the new version before it is published
    outbox.emit(db, "visit.status_changed", aggregate_type="visit", aggregate_id=visit.id, aggregate_version=visit.version,
                organization_id=visit.organization_id, payload={"from": current.value, "to": to.value, "event": event_type, "site_id": str(visit.site_id)})


# --- creation -------------------------------------------------------------------------------------

def create_visit(db: Session, *, host: Host, visitor: Person, purpose: str, starts_at: datetime, ends_at: datetime, source: str,
                 actor: Actor, category: str = "business", invited: bool = False, consent_at: datetime | None = None,
                 nda_at: datetime | None = None) -> Visit:
    if not host.active:
        raise HTTPException(409, "This host is no longer accepting visitors")
    invitation_id = None
    if invited:
        invitation = Invitation(organization_id=host.organization_id, site_id=host.site_id, host_id=host.id,
                                visitor_person_id=visitor.id, purpose=purpose, scheduled_start=starts_at, scheduled_end=ends_at,
                                created_by=actor.user_id)
        db.add(invitation)
        db.flush()
        invitation_id = invitation.id
    visit = Visit(organization_id=host.organization_id, site_id=host.site_id, visitor_person_id=visitor.id, host_id=host.id,
                  invitation_id=invitation_id, created_by_id=actor.user_id, created_by_device_id=actor.device_id,
                  purpose=purpose, category=category, starts_at=starts_at, ends_at=ends_at, status=S.pending, source=source,
                  privacy_consent_at=consent_at, nda_signed_at=nda_at)
    visit.host, visit.visitor = host, visitor
    db.add(visit)
    db.flush()
    record_event(db, visit, "created", actor, to_status=S.pending.value, metadata={"source": source})
    outbox.emit(db, "visit.created", aggregate_type="visit", aggregate_id=visit.id, aggregate_version=visit.version,
                organization_id=visit.organization_id, payload={"source": source, "site_id": str(visit.site_id)})
    screening.screen(db, visit, actor_user_id=actor.user_id, actor_device_id=actor.device_id)
    return visit


# --- passes ---------------------------------------------------------------------------------------

def issue_pass(db: Session, visit: Visit, actor: Actor) -> str:
    """Create the visit's single pass and return the raw token (shown to staff/visitor, never logged)."""
    if visit.pass_ is not None:
        raise HTTPException(409, "This visit already has a pass")
    token = secrets.token_urlsafe(32)
    now = utcnow()
    visit.pass_ = Pass(organization_id=visit.organization_id, visit_id=visit.id, token_hash=digest_pass(token),
                       token_ciphertext=encrypt_pass(token), valid_from=now, expires_at=max(visit.ends_at, now + timedelta(minutes=5)),
                       issued_by_user_id=actor.user_id, issued_by_device_id=actor.device_id)
    db.flush()
    record_event(db, visit, "pass_issued", actor, pass_id=visit.pass_.id)
    return token


def end_pass(pass_: Pass, status: str, actor: Actor, reason: str | None = None) -> None:
    pass_.status = status
    pass_.token_ciphertext = None  # nothing re-displayable once the pass stops being active
    if status == "revoked":
        pass_.revoked_at, pass_.revoked_by, pass_.revoke_reason = utcnow(), actor.user_id, reason


def visible_pass_code(visit: Visit) -> str | None:
    if visit.pass_ is None or visit.pass_.status != "active" or visit.status not in {S.scheduled, S.checked_in, S.temporarily_out}:
        return None
    return decrypt_pass(visit.pass_.token_ciphertext)


REJECTION_MESSAGES = {
    "malformed": (404, "Pass was not found"),
    "unknown": (404, "Pass was not found"),
    "revoked": (404, "This pass has been revoked"),
    "expired": (404, "This pass has expired"),
    "not_yet_valid": (409, "This pass is not valid yet"),
    "already_used": (409, "This pass has already been used"),
    "visit_cancelled": (409, "This visit was cancelled"),
    "visit_completed": (409, "This visit has already ended"),
    "not_approved": (409, "This visit has not been approved"),
    "security_pending": (409, "This visit is waiting for a security decision. Please see reception."),
    "blacklisted": (403, "Entry is not permitted. Please see reception."),
    "not_eligible": (403, "Entry is not permitted. Please see reception."),
    "wrong_site": (409, "This pass is for a different site"),
}


def entry_block(db: Session, visit: Visit, actor: "Actor | None" = None) -> str | None:
    """Security re-check performed at every entry: a deactivated visitor, or a blacklist match that no
    security decision has covered yet (which also opens a security review)."""
    profile = db.get(VisitorProfile, visit.visitor_person_id)
    if profile is not None and profile.status != "active":
        return "not_eligible"
    actor = actor or SYSTEM
    if screening.screen(db, visit, actor_user_id=actor.user_id, actor_device_id=actor.device_id):
        return "security_pending"
    return None


def evaluate_pass(db: Session, code: str, *, action: str, site_ids: frozenset[uuid.UUID] | None, actor: Actor,
                  organization_id: uuid.UUID | None = None) -> Visit:
    """Validate a scanned token for `action` (verify / check_in / check_out), record the scan, and return the
    locked visit. Raises with a specific message for each rejection outcome."""
    visit, outcome = None, "accepted"
    if not PASS_TOKEN.fullmatch(code or ""):
        outcome = "malformed"
    else:
        visit = lock_visit(db, select(Visit).join(Pass, Pass.visit_id == Visit.id).where(Pass.token_hash == digest_pass(code)))
        if visit is None or (organization_id is not None and visit.organization_id != organization_id):
            visit, outcome = None, "unknown"
        else:
            outcome = pass_outcome(db, visit, action, site_ids, actor)
    db.add(PassScan(organization_id=visit.organization_id if visit else None, pass_id=visit.pass_.id if visit else None,
                    site_id=visit.site_id if visit else (next(iter(site_ids)) if site_ids and len(site_ids) == 1 else None),
                    device_id=actor.device_id, actor_user_id=actor.user_id, action=action, outcome=outcome))
    if outcome != "accepted":
        db.commit()  # keep the rejected-scan record
        status_code, message = REJECTION_MESSAGES[outcome]
        raise HTTPException(status_code, message)
    return visit


def pass_outcome(db: Session, visit: Visit, action: str, site_ids: frozenset[uuid.UUID] | None, actor: Actor = SYSTEM) -> str:
    pass_, now, status = visit.pass_, utcnow(), VisitStatus(visit.status)
    if site_ids is not None and visit.site_id not in site_ids:
        return "wrong_site"
    if action == "check_out":
        # Leaving is always allowed for someone on site, whatever the pass state; a repeat is a harmless retry.
        if status in ON_SITE_STATUSES or status == S.checked_out:
            return "accepted"
        return "visit_cancelled" if status == S.cancelled else "not_approved"
    if pass_.status == "revoked":
        return "revoked"
    if pass_.status == "consumed" and action == "check_in":
        return "already_used"
    if status == S.cancelled:
        return "visit_cancelled"
    if status in {S.pending, S.rejected}:
        return "not_approved"
    if status == S.security_review:
        return "security_pending"
    if status in {S.checked_out, S.no_show}:
        return "visit_completed"
    # Verification and entry: the pass itself must be current. A visitor already inside may always leave (above).
    if now < pass_.valid_from:
        return "not_yet_valid"
    if now > pass_.expires_at or pass_.status == "expired":
        return "expired"
    if action == "check_in":
        return entry_block(db, visit, actor) or "accepted"
    if action == "verify":
        profile = db.get(VisitorProfile, visit.visitor_person_id)
        return "not_eligible" if profile is not None and profile.status != "active" else "accepted"
    return "accepted"


# --- arrival and departure ------------------------------------------------------------------------

def site_settings(db: Session, visit: Visit) -> SiteSettings:
    return db.get(SiteSettings, visit.site_id) or SiteSettings(site_id=visit.site_id)


def check_in(db: Session, visit: Visit, actor: Actor, gate: str | None) -> bool:
    """Returns False when the visitor was already inside (an idempotent retry): no event is written."""
    status = VisitStatus(visit.status)
    if status == S.checked_in:
        return False
    gate = (gate or "Reception")[:120]
    block = entry_block(db, visit, actor)
    if block:
        db.commit()  # keep the security review that the re-check may have opened
        raise HTTPException(*REJECTION_MESSAGES[block])
    if status == S.temporarily_out:
        transition(db, visit, S.checked_in, "reentry", actor, gate=gate)
        return True
    visit.checked_in_at = visit.checked_in_at or utcnow()  # set before the transition flushes (ck_visits_checked_in)
    visit.check_in_gate = gate
    transition(db, visit, S.checked_in, "check_in", actor, gate=gate)
    if visit.pass_ and visit.pass_.usage == "single_entry":
        visit.pass_.status = "consumed"
        visit.pass_.token_ciphertext = None
    identity.record_arrival(db, visit)
    notify_host(db, visit, f"{visit.visitor.full_name} has arrived", f"Checked in at {gate}.", kind="arrival")
    return True


def step_out(db: Session, visit: Visit, actor: Actor, gate: str | None) -> None:
    if not site_settings(db, visit).allow_reentry:
        raise HTTPException(409, "Re-entry is not allowed at this site; check the visitor out instead")
    transition(db, visit, S.temporarily_out, "step_out", actor, gate=gate)


def check_out(db: Session, visit: Visit, actor: Actor, gate: str | None) -> bool:
    if VisitStatus(visit.status) == S.checked_out:
        return False
    visit.checked_out_at = utcnow()
    transition(db, visit, S.checked_out, "check_out", actor, gate=gate)
    return True


# --- notifications --------------------------------------------------------------------------------

def notify_host(db: Session, visit: Visit, title: str, message: str, kind: str = "visit") -> None:
    host = visit.host if visit.host is not None else db.get(Host, visit.host_id)
    if host.user_id:
        user = db.get(User, host.user_id)
        if user and user.is_active:
            notify.notify(db, organization_id=visit.organization_id, recipient_id=user.id, kind=kind, title=title, message=message, visit_id=visit.id)


def notify_site_staff(db: Session, visit: Visit, title: str, message: str, roles: tuple[str, ...] = ("site-admin", "receptionist"),
                      kind: str = "visit") -> None:
    notify.notify_roles(db, organization_id=visit.organization_id, site_id=visit.site_id, roles=roles, kind=kind, title=title,
                        message=message, visit_id=visit.id)


# --- scheduled sweeps -----------------------------------------------------------------------------

def mark_no_shows(db: Session, now: datetime | None = None, grace: timedelta = timedelta(hours=1)) -> int:
    """Approved visits whose window ended without an arrival become no-shows (their pass expires)."""
    now = now or utcnow()
    ids = db.scalars(select(Visit.id).where(Visit.status == S.scheduled, Visit.ends_at < now - grace).limit(500)).all()
    for visit_id in ids:
        visit = lock_visit(db, select(Visit).where(Visit.id == visit_id, Visit.status == S.scheduled))
        if visit:
            transition(db, visit, S.no_show, "no_show", SYSTEM)
    return len(ids)


def escalate_overdue(db: Session, now: datetime | None = None) -> int:
    """Visitors still on site after their visit window (plus the site's grace period) are escalated once."""
    now = now or utcnow()
    count = 0
    rows = db.execute(
        select(Visit.id, SiteSettings.overdue_grace_minutes).join(SiteSettings, SiteSettings.site_id == Visit.site_id)
        .where(Visit.status.in_([S.checked_in, S.temporarily_out]), Visit.overdue_notified_at.is_(None), Visit.ends_at < now)
        .limit(500)
    ).all()
    for visit_id, grace in rows:
        visit = lock_visit(db, select(Visit).where(Visit.id == visit_id, Visit.overdue_notified_at.is_(None)))
        if visit is None or visit.ends_at + timedelta(minutes=grace) > now:
            continue
        visit.overdue_notified_at = now
        record_event(db, visit, "overdue_escalated", SYSTEM, metadata={"minutes_over": int((now - visit.ends_at).total_seconds() // 60)})
        message = f"{visit.visitor.full_name} was expected to leave at {visit.ends_at:%H:%M} UTC and has not checked out."
        notify_host(db, visit, "Visitor overdue", message, kind="overdue")
        notify_site_staff(db, visit, "Visitor overdue", message, kind="overdue")
        count += 1
    return count


def is_overdue(visit: Visit, now: datetime | None = None) -> bool:
    return VisitStatus(visit.status) in ON_SITE_STATUSES and visit.ends_at < (now or utcnow())


def visitor_of(db: Session, visit: Visit) -> Person:
    return visit.visitor or db.get(Person, visit.visitor_person_id)
