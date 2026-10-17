"""Blacklist screening and security decisions.

Rules (docs/BACKEND.md, "Blacklist and security approval"):
- A visit is screened when it is created, when it is approved, and again at every entry attempt.
- Matching entries are active, in effect now, and cover the visit's organization (and its site, if site-specific).
  A linked person is a `confirmed` match; email, phone or a near-identical name is `uncertain`.
- Any unresolved match moves the visit to `security-review` with one pending security approval. Ordinary
  visitors never enter this workflow.
- An approval covers the matches that existed when it was decided. A match on a `deny` entry blocks approval
  until a reviewer marks it `rejected` (not the same person). Hosts can never decide on their own visitors.
- Decisions never change blacklist entries.
"""
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models import (
    BlacklistEntry, BlacklistMatch, Host, Person, SecurityApproval, Visit, VisitStatus, utcnow,
)
from . import audit, identity, notify

NAME_MATCH = 0.85
S = VisitStatus


def in_effect(now: datetime):
    return (BlacklistEntry.status == "active", BlacklistEntry.effective_from <= now,
            (BlacklistEntry.effective_until.is_(None)) | (BlacklistEntry.effective_until > now))


def candidate_entries(db: Session, visit: Visit, person: Person) -> list[tuple[BlacklistEntry, str, str]]:
    now = utcnow()
    email, digits = identity.normalize_email(person.email), identity.phone_digits(person.phone)
    conditions = [BlacklistEntry.person_id == person.id,
                  func.similarity(func.lower(BlacklistEntry.match_name), person.full_name.lower()) >= NAME_MATCH]
    if email:
        conditions.append(BlacklistEntry.match_email == email)
    if digits:
        conditions.append(BlacklistEntry.match_phone_digits == digits)
    entries = db.scalars(select(BlacklistEntry).where(
        BlacklistEntry.organization_id == visit.organization_id, *in_effect(now),
        (BlacklistEntry.site_id.is_(None)) | (BlacklistEntry.site_id == visit.site_id), or_(*conditions))).all()
    found = []
    for entry in entries:
        if entry.person_id == person.id:
            found.append((entry, "person", "confirmed"))
        elif email and entry.match_email == email:
            found.append((entry, "email", "uncertain"))
        elif digits and entry.match_phone_digits == digits:
            found.append((entry, "phone", "uncertain"))
        else:
            found.append((entry, "name", "uncertain"))
    return found


def record_matches(db: Session, visit: Visit) -> list[BlacklistMatch]:
    person = visit.visitor or db.get(Person, visit.visitor_person_id)
    for entry, basis, confidence in candidate_entries(db, visit, person):
        db.execute(insert(BlacklistMatch).values(id=uuid.uuid4(), organization_id=visit.organization_id, blacklist_entry_id=entry.id,
                                                 visit_id=visit.id, match_basis=basis, confidence=confidence)
                   .on_conflict_do_nothing(index_elements=["blacklist_entry_id", "visit_id"]))
    return db.scalars(select(BlacklistMatch).where(BlacklistMatch.visit_id == visit.id)).all()


def unresolved(db: Session, visit: Visit, matches: list[BlacklistMatch]) -> list[BlacklistMatch]:
    """Matches still needing a decision: not rejected, entry still in effect, and newer than the last approval."""
    now = utcnow()
    last_approval = db.scalar(select(func.max(SecurityApproval.decided_at)).where(
        SecurityApproval.visit_id == visit.id, SecurityApproval.status == "approved"))
    open_matches = []
    for match in matches:
        entry = match.entry
        active = entry.status == "active" and entry.effective_from <= now and (entry.effective_until is None or entry.effective_until > now)
        if active and match.confidence != "rejected" and (last_approval is None or match.created_at > last_approval):
            open_matches.append(match)
    return open_matches


def screen(db: Session, visit: Visit, actor_user_id: uuid.UUID | None = None, actor_device_id: uuid.UUID | None = None) -> bool:
    """Record matches and, if any are unresolved, put the visit into security review. Returns True when flagged."""
    from .visits import Actor, record_event, transition  # local import: visits imports this module

    if VisitStatus(visit.status) not in {S.pending, S.scheduled, S.security_review, S.temporarily_out}:
        return False
    open_matches = unresolved(db, visit, record_matches(db, visit))
    if not open_matches:
        return False
    actor = Actor(user_id=actor_user_id, device_id=actor_device_id)
    pending = db.scalar(select(SecurityApproval).where(SecurityApproval.visit_id == visit.id, SecurityApproval.status == "pending"))
    if pending is None:
        db.add(SecurityApproval(organization_id=visit.organization_id, visit_id=visit.id))
    if visit.status in {S.pending, S.scheduled}:
        transition(db, visit, S.security_review, "security_review_requested", actor, metadata={"matches": len(open_matches)})
    elif pending is None:
        record_event(db, visit, "security_review_requested", actor, metadata={"matches": len(open_matches)})
    if pending is None:
        notify.notify_roles(db, organization_id=visit.organization_id, site_id=visit.site_id, roles=("site-admin", "super-admin"),
                            kind="security_review", title="Security review needed",
                            message="A visitor matched a restricted-entry record and needs a security decision.", visit_id=visit.id)
    return True


def decide(db: Session, approval: SecurityApproval, *, approve: bool, reason: str, decider_id: uuid.UUID,
           reviews: dict[uuid.UUID, str]) -> Visit:
    from .visits import Actor, issue_pass, lock_visit, record_event, transition, visit_query_for_update

    visit = lock_visit(db, visit_query_for_update(approval.visit_id))
    host = db.get(Host, visit.host_id)
    if host.user_id == decider_id:
        raise HTTPException(403, "A host cannot make the security decision for their own visitor")
    if approval.status != "pending" or visit.status not in {S.security_review, S.temporarily_out}:
        raise HTTPException(409, "This security review has already been decided")
    now = utcnow()
    matches = db.scalars(select(BlacklistMatch).where(BlacklistMatch.visit_id == visit.id)).all()
    by_id = {m.id: m for m in matches}
    for match_id, confidence in reviews.items():
        match = by_id.get(match_id)
        if match is None:
            raise HTTPException(404, "Match was not found on this visit")
        match.confidence, match.reviewed_by, match.reviewed_at = confidence, decider_id, now
    actor = Actor(user_id=decider_id)
    if approve:
        blocking = [m for m in unresolved(db, visit, matches) if m.entry.severity == "deny"]
        if blocking:
            raise HTTPException(409, "A deny-level record still matches. Mark it as not the same person before approving.")
        if visit.status == S.temporarily_out:  # stepped out while flagged: approval re-opens re-entry
            record_event(db, visit, "security_approved", actor, reason=reason)
        else:
            transition(db, visit, S.scheduled, "security_approved", actor, reason=reason)
            if visit.pass_ is None:
                issue_pass(db, visit, actor)
    elif visit.status == S.temporarily_out:  # denied re-entry: the visit ends here
        visit.checked_out_at = now
        transition(db, visit, S.checked_out, "security_denied", actor, reason=reason)
    else:
        transition(db, visit, S.rejected, "security_denied", actor, reason=reason)
    approval.status = "approved" if approve else "denied"
    approval.decided_by, approval.decided_at, approval.decision_reason = decider_id, now, reason
    audit.record(db, f"security.{approval.status}", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id,
                 site_id=visit.site_id, actor_user_id=decider_id, approval_id=approval.id, reviewed_matches=len(reviews))
    if host.user_id:
        outcome = "approved" if approve else "denied"
        notify.notify(db, organization_id=visit.organization_id, recipient_id=host.user_id, kind="security_decision",
                      title=f"Security review {outcome}", message=f"{visit.visitor.full_name}'s visit was {outcome} after a security review.",
                      visit_id=visit.id)
    return visit


def screen_upcoming(db: Session, entry: BlacklistEntry, actor_user_id: uuid.UUID) -> int:
    """Run a new entry against visits that have not finished yet."""
    query = select(Visit.id).join(Person, Person.id == Visit.visitor_person_id).where(
        Visit.organization_id == entry.organization_id, Visit.status.in_([S.pending, S.scheduled, S.checked_in, S.temporarily_out]))
    if entry.site_id:
        query = query.where(Visit.site_id == entry.site_id)
    identifiers = []
    if entry.person_id:
        identifiers.append(Person.id == entry.person_id)
    if entry.match_email:
        identifiers.append(func.lower(Person.email) == entry.match_email)
    if entry.match_phone_digits:
        identifiers.append(identity.phone_key(Person.phone) == entry.match_phone_digits)
    if entry.match_name:
        identifiers.append(func.similarity(func.lower(Person.full_name), entry.match_name.lower()) >= NAME_MATCH)
    flagged = 0
    from .visits import lock_visit, visit_query_for_update

    for visit_id in db.scalars(query.where(or_(*identifiers)).limit(1000)).all():
        visit = lock_visit(db, visit_query_for_update(visit_id))
        if visit.status in {S.checked_in}:
            record_matches(db, visit)  # already inside: recorded for staff, enforced at next entry
            flagged += 1
        elif screen(db, visit, actor_user_id=actor_user_id):
            flagged += 1
    return flagged
