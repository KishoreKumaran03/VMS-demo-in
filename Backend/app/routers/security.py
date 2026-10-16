"""Restricted-entry (blacklist) records and security decisions. Details are visible only to holders of
blacklist.manage / security.approve; receptionists and hosts only see that a visit is in security review."""
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BlacklistEntry, BlacklistMatch, Person, Role, SecurityApproval, Visit, utcnow
from ..schemas import (
    BlacklistCreate, BlacklistLift, BlacklistMatchOut, BlacklistOut, BlacklistPatch, SecurityApprovalOut, SecurityDecision,
)
from ..security import Principal, current_user
from ..services import identity, screening
from .common import audit, check_version, scope_visits, scoped_site, visit_query

router = APIRouter(prefix="/api/v1", tags=["security"])
MAX_REVIEW = timedelta(days=366)


def scoped_entry(db: Session, user: Principal, entry_id: uuid.UUID) -> BlacklistEntry:
    entry = db.get(BlacklistEntry, entry_id)
    if (not entry or (user.role != Role.super_admin and entry.organization_id != user.organization_id)
            or (entry.site_id and user.role != Role.super_admin and not user.in_site(entry.site_id))):
        raise HTTPException(404, "Record was not found")
    return entry


def review_date(value, now):
    value = value or now + timedelta(days=182)
    if value <= now or value > now + MAX_REVIEW:
        raise HTTPException(422, "The review date must be in the future and within 12 months")
    return value


@router.get("/blacklist", response_model=list[BlacklistOut])
def list_entries(status: str = Query(default="active", pattern="^(active|expired|lifted|all)$"), review_due: bool = False,
                 db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("blacklist.manage", "Your role cannot view restricted-entry records")
    query = select(BlacklistEntry)
    if user.role != Role.super_admin:
        query = query.where(BlacklistEntry.organization_id == user.organization_id)
        if user.site_ids is not None:
            query = query.where(BlacklistEntry.site_id.is_(None) | user.site_clause(BlacklistEntry.site_id))
    if status != "all":
        query = query.where(BlacklistEntry.status == status)
    if review_due:
        query = query.where(BlacklistEntry.review_due_at <= utcnow())
    return db.scalars(query.order_by(BlacklistEntry.created_at.desc()).limit(500)).all()


@router.post("/blacklist", response_model=BlacklistOut, status_code=201)
def create_entry(payload: BlacklistCreate, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("blacklist.manage", "Your role cannot create restricted-entry records")
    now = utcnow()
    if payload.site_id:
        organization_id = scoped_site(db, user, payload.site_id).organization_id
    elif user.site_ids is not None:
        raise HTTPException(403, "Site-scoped administrators must choose one of their sites")
    else:
        organization_id = user.organization_id
    if payload.person_id:
        person = db.get(Person, payload.person_id)
        if not person or person.organization_id != organization_id:
            raise HTTPException(404, "Person was not found")
    if payload.effective_until and payload.effective_until <= now:
        raise HTTPException(422, "The end date must be in the future")
    entry = BlacklistEntry(
        organization_id=organization_id, site_id=payload.site_id, person_id=payload.person_id,
        match_name=payload.match_name.strip() if payload.match_name else None,
        match_email=str(payload.match_email).lower() if payload.match_email else None,
        match_phone_digits=identity.phone_digits(payload.match_phone), reason_category=payload.reason_category,
        reason_detail=payload.reason_detail, severity=payload.severity, effective_from=now, effective_until=payload.effective_until,
        review_due_at=review_date(payload.review_due_at, now), created_by=user.id,
    )
    db.add(entry)
    db.flush()
    flagged = screening.screen_upcoming(db, entry, user.id)
    audit(db, user, "blacklist.created", entity_type="blacklist_entry", entity_id=entry.id, organization_id=organization_id, site_id=entry.site_id,
          severity=entry.severity, reason_category=entry.reason_category, visits_flagged=flagged)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/blacklist/{entry_id}", response_model=BlacklistOut)
def update_entry(entry_id: uuid.UUID, payload: BlacklistPatch, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("blacklist.manage", "Your role cannot change restricted-entry records")
    entry = scoped_entry(db, user, entry_id)
    if entry.status != "active":
        raise HTTPException(409, "Only active records can be changed")
    changes = payload.model_dump(exclude_unset=True)
    check_version(entry, changes.pop("version", None))
    if "review_due_at" in changes:
        changes["review_due_at"] = review_date(changes["review_due_at"], utcnow())
    for field, value in changes.items():
        setattr(entry, field, value)
    audit(db, user, "blacklist.updated", entity_type="blacklist_entry", entity_id=entry.id, organization_id=entry.organization_id,
          site_id=entry.site_id, fields=sorted(changes))
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/blacklist/{entry_id}/lift", response_model=BlacklistOut)
def lift_entry(entry_id: uuid.UUID, payload: BlacklistLift, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Ends a restriction. Lifting is explicit and audited; approving a single visit never lifts anything."""
    user.require("blacklist.manage", "Your role cannot lift restricted-entry records")
    entry = scoped_entry(db, user, entry_id)
    if entry.status != "active":
        raise HTTPException(409, "This record is not active")
    entry.status, entry.lifted_by, entry.lifted_at, entry.lift_reason = "lifted", user.id, utcnow(), payload.reason
    audit(db, user, "blacklist.lifted", entity_type="blacklist_entry", entity_id=entry.id, organization_id=entry.organization_id, site_id=entry.site_id)
    db.commit()
    db.refresh(entry)
    return entry


def approval_out(db: Session, approval: SecurityApproval, visit: Visit) -> SecurityApprovalOut:
    matches = db.scalars(select(BlacklistMatch).where(BlacklistMatch.visit_id == visit.id).order_by(BlacklistMatch.created_at)).all()
    return SecurityApprovalOut(
        id=approval.id, visit_id=visit.id, status=approval.status, requested_at=approval.requested_at, decided_by=approval.decided_by,
        decided_at=approval.decided_at, decision_reason=approval.decision_reason, visitor_name=visit.visitor.full_name, host_name=visit.host.name,
        site_id=visit.site_id, visit_status=visit.status,
        matches=[BlacklistMatchOut(id=m.id, blacklist_entry_id=m.blacklist_entry_id, match_basis=m.match_basis, confidence=m.confidence,
                                   severity=m.entry.severity, reason_category=m.entry.reason_category, reviewed_at=m.reviewed_at) for m in matches],
    )


@router.get("/security/approvals", response_model=list[SecurityApprovalOut])
def list_approvals(status: str = Query(default="pending", pattern="^(pending|approved|denied|all)$"),
                   db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("security.approve", "Your role cannot view security reviews")
    visits = {v.id: v for v in db.scalars(scope_visits(visit_query().join(SecurityApproval, SecurityApproval.visit_id == Visit.id), user)).unique().all()}
    query = select(SecurityApproval).where(SecurityApproval.visit_id.in_(visits.keys()))
    if status != "all":
        query = query.where(SecurityApproval.status == status)
    return [approval_out(db, a, visits[a.visit_id]) for a in db.scalars(query.order_by(SecurityApproval.requested_at.desc()).limit(200)).all()]


@router.post("/security/approvals/{approval_id}/decision", response_model=SecurityApprovalOut)
def decide(approval_id: uuid.UUID, payload: SecurityDecision, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("security.approve", "Your role cannot make security decisions")
    approval = db.get(SecurityApproval, approval_id, with_for_update=True)
    if not approval or not db.scalar(scope_visits(select(Visit.id).where(Visit.id == approval.visit_id), user)):
        raise HTTPException(404, "Security review was not found")
    visit = screening.decide(db, approval, approve=payload.decision == "approve", reason=payload.reason, decider_id=user.id,
                             reviews={r.match_id: r.confidence for r in payload.match_reviews})
    db.commit()
    return approval_out(db, approval, visit)
