"""Visitor identity: reuse a returning visitor's person record when the match is reliable, otherwise
create a new one, and let administrators merge duplicates explicitly.

Matching rules (docs/BACKEND.md, "Identity matching"):
- Candidates are active people in the same organization with the same email (case-insensitive) or the
  same phone digits. A name alone never matches.
- Exactly one candidate whose name is similar (pg_trgm similarity >= NAME_SIMILARITY) -> reuse it.
- Any other contact match (several candidates, or a shared mailbox/phone with a different name) -> new
  person, flagged `identity_review` so staff can merge it if it is the same individual.
"""
import re
import uuid

from fastapi import HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from . import audit
from ..models import (
    Host, Invitation, Person, PersonContact, PersonMergeLog, User, Visit, VisitorProfile, utcnow,
)

NAME_SIMILARITY = 0.6


def normalize_email(email: str | None) -> str | None:
    email = (email or "").strip().lower()
    return email or None


PHONE_KEY_DIGITS = 10


def phone_digits(phone: str | None) -> str | None:
    """Comparison key for phone numbers: the last 10 digits, so "+1 555 010 0200" and "(555) 010-0200" match."""
    digits = re.sub(r"\D", "", phone or "")
    return digits[-PHONE_KEY_DIGITS:] if len(digits) >= 7 else None


def phone_key(column):
    """SQL expression matching phone_digits() for a phone column."""
    return func.right(func.regexp_replace(column, "[^0-9]", "", "g"), PHONE_KEY_DIGITS)


def ensure_profile(db: Session, person: Person) -> VisitorProfile:
    profile = db.get(VisitorProfile, person.id)
    if profile is None:
        profile = VisitorProfile(person_id=person.id, organization_id=person.organization_id)
        db.add(profile)
        db.flush()
    return profile


def find_or_create_visitor(db: Session, *, organization_id: uuid.UUID, full_name: str, email: str | None, phone: str | None,
                           company: str | None, actor_id: uuid.UUID | None) -> Person:
    full_name = full_name.strip()
    email, digits = normalize_email(email), phone_digits(phone)
    contact_filters = []
    if email:
        contact_filters.append(func.lower(Person.email) == email)
    if digits:
        contact_filters.append(phone_key(Person.phone) == digits)

    candidates: list[tuple[Person, float]] = []
    if contact_filters:
        candidates = db.execute(
            select(Person, func.similarity(func.lower(Person.full_name), full_name.lower()))
            .where(Person.organization_id == organization_id, Person.identity_status == "active", or_(*contact_filters))
            .limit(20)
        ).all()

    similar = [person for person, score in candidates if score >= NAME_SIMILARITY]
    if len(candidates) == 1 and len(similar) == 1:
        person = similar[0]
        # Fill gaps only; never overwrite details recorded on earlier visits.
        person.email = person.email or email
        person.phone = person.phone or (phone.strip() if phone else None)
        person.company = person.company or company
        person.updated_by = actor_id
        ensure_profile(db, person)
        return person

    person = Person(organization_id=organization_id, full_name=full_name, email=email,
                    phone=phone.strip() if phone else None, company=company, created_by=actor_id, updated_by=actor_id)
    if email:
        person.contacts.append(PersonContact(channel="email", value=email, is_primary=True))
    if phone and phone.strip():
        person.contacts.append(PersonContact(channel="phone", value=phone.strip(), is_primary=True))
    db.add(person)
    db.flush()
    profile = ensure_profile(db, person)
    if candidates:
        profile.identity_review = True
        profile.notes = f"Shares contact details with {len(candidates)} existing record(s); review for a possible merge."
    return person


def merge_people(db: Session, *, organization_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID,
                 actor_id: uuid.UUID, reason: str) -> PersonMergeLog:
    """Move a duplicate visitor's history onto the surviving record. Accounts and hosts are never merged here."""
    if source_id == target_id:
        raise HTTPException(422, "Choose two different people to merge")
    source, target = db.get(Person, source_id, with_for_update=True), db.get(Person, target_id, with_for_update=True)
    for person in (source, target):
        if person is None or person.organization_id != organization_id or person.identity_status != "active":
            raise HTTPException(404, "Person was not found")
    if db.scalar(select(User.id).where(User.person_id == source.id)) or db.scalar(select(Host.id).where(Host.person_id == source.id)):
        raise HTTPException(409, "Staff records cannot be merged away; merge the visitor record into the staff record instead")

    moved = {
        "visits": db.execute(update(Visit).where(Visit.visitor_person_id == source.id).values(visitor_person_id=target.id)).rowcount,
        "invitations": db.execute(update(Invitation).where(Invitation.visitor_person_id == source.id).values(visitor_person_id=target.id)).rowcount,
    }
    source_profile, target_profile = db.get(VisitorProfile, source.id), ensure_profile(db, target)
    if source_profile:
        target_profile.visit_count += source_profile.visit_count
        firsts = [d for d in (target_profile.first_visit_at, source_profile.first_visit_at) if d]
        lasts = [d for d in (target_profile.last_visit_at, source_profile.last_visit_at) if d]
        target_profile.first_visit_at = min(firsts) if firsts else None
        target_profile.last_visit_at = max(lasts) if lasts else None
        if source_profile.status == "inactive":
            target_profile.status = "inactive"  # a block on either record survives the merge
        db.delete(source_profile)
    target_profile.identity_review = False
    target.email = target.email or source.email
    target.phone = target.phone or source.phone
    target.company = target.company or source.company
    source.identity_status = "merged"
    source.merged_into_id = target.id
    source.updated_by = actor_id
    log = PersonMergeLog(organization_id=organization_id, source_person_id=source.id, target_person_id=target.id,
                         merged_by=actor_id, reason=reason.strip(), moved_counts=moved)
    db.add(log)
    audit.record(db, "person.merged", entity_type="person", entity_id=target.id, organization_id=organization_id, actor_user_id=actor_id,
                 source_person_id=source.id, moved=moved)
    db.flush()
    return log


def record_arrival(db: Session, visit: Visit) -> None:
    """Update the visitor's long-term profile on a visit's first check-in."""
    profile = db.get(VisitorProfile, visit.visitor_person_id)
    if profile is None:
        profile = ensure_profile(db, db.get(Person, visit.visitor_person_id))
    now = utcnow()
    profile.visit_count += 1
    profile.first_visit_at = profile.first_visit_at or now
    profile.last_visit_at = now
    if profile.visit_count >= 5 and profile.classification == "standard":
        profile.classification = "frequent"
