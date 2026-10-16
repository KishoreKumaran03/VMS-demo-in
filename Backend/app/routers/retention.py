"""Retention policies, legal/investigation holds, and a dry-run preview of the next retention run."""
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Person, RetentionHold, RetentionPolicy, Role, Visit, utcnow
from ..schemas import RetentionHoldIn, RetentionHoldOut, RetentionHoldRelease, RetentionPolicyIn, RetentionPolicyOut
from ..security import Principal, current_user
from ..services import retention
from .common import audit, scope_visits, scoped_site

router = APIRouter(prefix="/api/v1/retention", tags=["retention"])


def can_set_policy(user: Principal, organization_id: uuid.UUID | None) -> bool:
    if user.role == Role.super_admin:
        return True
    # Organization-wide site administrators manage their own organization's overrides.
    return user.role == Role.site_admin and user.site_ids is None and organization_id == user.organization_id


@router.get("/policies", response_model=list[RetentionPolicyOut])
def list_policies(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("user.read", "Your role cannot view retention policies")
    query = select(RetentionPolicy)
    if user.role != Role.super_admin:
        query = query.where(RetentionPolicy.organization_id.is_(None) | (RetentionPolicy.organization_id == user.organization_id))
    return db.scalars(query.order_by(RetentionPolicy.record_class, RetentionPolicy.organization_id.nulls_first(), RetentionPolicy.site_id.nulls_first())).all()


@router.put("/policies", response_model=RetentionPolicyOut)
def set_policy(payload: RetentionPolicyIn, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Creates or replaces the policy for one scope. Platform defaults can be changed but never removed."""
    if not can_set_policy(user, payload.organization_id):
        raise HTTPException(403, "Your role cannot change this retention policy")
    if payload.site_id:
        site = scoped_site(db, user, payload.site_id)
        if site.organization_id != payload.organization_id:
            raise HTTPException(422, "The site must belong to the organization")
    policy = db.scalar(select(RetentionPolicy).where(
        RetentionPolicy.organization_id.is_(payload.organization_id) if payload.organization_id is None else RetentionPolicy.organization_id == payload.organization_id,
        RetentionPolicy.site_id.is_(None) if payload.site_id is None else RetentionPolicy.site_id == payload.site_id,
        RetentionPolicy.record_class == payload.record_class))
    previous = (policy.retain_months, policy.action) if policy else None
    if policy is None:
        policy = RetentionPolicy(organization_id=payload.organization_id, site_id=payload.site_id, record_class=payload.record_class)
        db.add(policy)
    policy.retain_months, policy.action, policy.notes = payload.retain_months, payload.action, payload.notes
    policy.approved_by, policy.approved_at = user.id, utcnow()
    db.flush()
    audit(db, user, "retention.policy_set", entity_type="retention_policy", entity_id=policy.id, organization_id=payload.organization_id,
          site_id=payload.site_id, record_class=payload.record_class, retain_months=payload.retain_months, policy_action=payload.action,
          previous=list(previous) if previous else None)
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/policies/{policy_id}", status_code=204)
def remove_override(policy_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    policy = db.get(RetentionPolicy, policy_id)
    if not policy or not can_set_policy(user, policy.organization_id):
        raise HTTPException(404, "Policy was not found")
    if policy.organization_id is None:
        raise HTTPException(409, "Platform defaults cannot be removed; change them instead")
    audit(db, user, "retention.policy_removed", entity_type="retention_policy", entity_id=policy.id, organization_id=policy.organization_id,
          site_id=policy.site_id, record_class=policy.record_class)
    db.delete(policy)
    db.commit()
    return Response(status_code=204)


def hold_target_org(db: Session, user: Principal, entity_type: str, entity_id: uuid.UUID) -> uuid.UUID:
    if entity_type == "visit":
        visit = db.scalar(scope_visits(select(Visit).where(Visit.id == entity_id), user))
        if visit:
            return visit.organization_id
    else:
        person = db.get(Person, entity_id)
        if person and (user.role == Role.super_admin or person.organization_id == user.organization_id):
            return person.organization_id
    raise HTTPException(404, "Record was not found")


@router.get("/holds", response_model=list[RetentionHoldOut])
def list_holds(include_released: bool = False, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("retention.hold", "Your role cannot view retention holds")
    query = select(RetentionHold)
    if user.role != Role.super_admin:
        query = query.where(RetentionHold.organization_id == user.organization_id)
    if not include_released:
        query = query.where(RetentionHold.released_at.is_(None))
    return db.scalars(query.order_by(RetentionHold.review_due_at)).all()


@router.post("/holds", response_model=RetentionHoldOut, status_code=201)
def place_hold(payload: RetentionHoldIn, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("retention.hold", "Your role cannot place retention holds")
    now = utcnow()
    if payload.review_due_at <= now or payload.review_due_at > now + timedelta(days=365):
        raise HTTPException(422, "The review date must be in the future and within 12 months")
    organization_id = hold_target_org(db, user, payload.entity_type, payload.entity_id)
    hold = RetentionHold(organization_id=organization_id, placed_by=user.id, placed_at=now, **payload.model_dump())
    db.add(hold)
    db.flush()
    audit(db, user, "retention.hold_placed", entity_type="retention_hold", entity_id=hold.id, organization_id=organization_id,
          target_type=payload.entity_type, target_id=payload.entity_id, hold_type=payload.hold_type, case_reference=payload.case_reference)
    db.commit()
    db.refresh(hold)
    return hold


@router.post("/holds/{hold_id}/release", response_model=RetentionHoldOut)
def release_or_extend_hold(hold_id: uuid.UUID, payload: RetentionHoldRelease, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Release a hold, or (with review_due_at) extend it after review. Released records become eligible again under policy."""
    user.require("retention.hold", "Your role cannot change retention holds")
    hold = db.get(RetentionHold, hold_id)
    if not hold or hold.released_at or (user.role != Role.super_admin and hold.organization_id != user.organization_id):
        raise HTTPException(404, "Active hold was not found")
    now = utcnow()
    if payload.review_due_at:
        if payload.review_due_at <= now or payload.review_due_at > now + timedelta(days=365):
            raise HTTPException(422, "The review date must be in the future and within 12 months")
        db.execute(RetentionHold.__table__.update().where(RetentionHold.id == hold.id).values(placed_at=now, review_due_at=payload.review_due_at))
        action = "retention.hold_extended"
    else:
        hold.released_by, hold.released_at, hold.release_reason = user.id, now, payload.reason
        action = "retention.hold_released"
    audit(db, user, action, entity_type="retention_hold", entity_id=hold.id, organization_id=hold.organization_id, reason=payload.reason)
    db.commit()
    db.refresh(hold)
    return hold


@router.get("/preview")
def preview(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Exactly what the next retention run would do right now, without changing anything."""
    user.require("organization.manage", "Only platform administrators can preview retention")
    return {"dry_run": True, "counts": retention.run(db, dry_run=True), "backlog_days": retention.oldest_overdue_visit_days(db)}
