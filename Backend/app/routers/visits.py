"""Staff-facing visit endpoints: invitations, approvals, arrivals/departures, visitor records and the dashboard."""
import uuid
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    ON_SITE_STATUSES, Host, Person, Role, Site, User, Visit, VisitEvent, VisitorProfile, VisitStatus, utcnow,
)
from ..schemas import (
    GateIn, PassCheck, RejectVisit, VisitCreate, VisitEventOut, VisitorMerge, VisitorOut, VisitorPatch, VisitOut, VisitPatch, WalkInCreate,
)
from ..security import Principal, current_user
from ..services import identity, idempotency, screening
from ..services import visits as lifecycle
from ..services.visits import Actor
from .common import audit, check_version, scope_visits, scoped_site, users_at_sites, visit_out, visit_query

router = APIRouter(prefix="/api/v1", tags=["visits"])
S = VisitStatus


def staff(user: Principal) -> Actor:
    return Actor(user_id=user.id)


def load_visit(db: Session, user: Principal, visit_id: uuid.UUID, *, lock: bool = True) -> Visit:
    query = scope_visits(visit_query().where(Visit.id == visit_id), user)
    visit = lifecycle.lock_visit(db, query) if lock else db.scalar(query)
    if not visit:
        raise HTTPException(404, "Visit was not found")
    return visit


def bookable_host(db: Session, user: Principal, host_id: uuid.UUID, site_id: uuid.UUID | None = None) -> Host:
    host = db.get(Host, host_id)
    if (not host or not host.active or (site_id and host.site_id != site_id)
            or (user.role != Role.super_admin and (host.organization_id != user.organization_id or not user.in_site(host.site_id)))
            or (user.role == Role.host and host.user_id != user.id)):
        raise HTTPException(404, "Host was not found")
    scoped_site(db, user, host.site_id)
    return host


# --- visits ------------------------------------------------------------------------------------------

@router.get("/visits", response_model=list[VisitOut])
def list_visits(status_filter: VisitStatus | None = Query(default=None, alias="status"), site_id: uuid.UUID | None = None,
                host_id: uuid.UUID | None = None, visitor_id: uuid.UUID | None = None, overdue: bool | None = None,
                starts_after: datetime | None = None, starts_before: datetime | None = None,
                offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.read", "Your role cannot view visits")
    query = scope_visits(visit_query(), user)
    if status_filter:
        query = query.where(Visit.status == status_filter)
    for column, value in ((Visit.site_id, site_id), (Visit.host_id, host_id), (Visit.visitor_person_id, visitor_id)):
        if value:
            query = query.where(column == value)
    if overdue:
        query = query.where(Visit.status.in_(ON_SITE_STATUSES), Visit.ends_at < utcnow())
    if starts_after:
        query = query.where(Visit.starts_at >= starts_after)
    if starts_before:
        query = query.where(Visit.starts_at < starts_before)
    rows = db.scalars(query.order_by(Visit.starts_at.desc(), Visit.id).offset(offset).limit(limit)).unique().all()
    return [visit_out(v, include_pass=True) for v in rows]


@router.get("/visits/{visit_id}", response_model=VisitOut)
def get_visit(visit_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.read", "Your role cannot view visits")
    return visit_out(load_visit(db, user, visit_id, lock=False), include_pass=True)


@router.get("/visits/{visit_id}/events", response_model=list[VisitEventOut])
def visit_events(visit_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.read", "Your role cannot view visits")
    load_visit(db, user, visit_id, lock=False)
    return db.scalars(select(VisitEvent).where(VisitEvent.visit_id == visit_id).order_by(VisitEvent.occurred_at, VisitEvent.recorded_at)).all()


@router.post("/visits", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def create_visit(payload: VisitCreate, response: Response, idempotency_key: str | None = Header(default=None),
                 db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Host pre-registration: creates the invitation and its visit, pending approval by a site administrator."""
    user.require("visit.create", "Your role cannot create visits")
    scope = f"user:{user.id}:visit"
    if (replay := idempotency.claim(db, scope, idempotency_key, payload)) is not None:
        db.commit()
        response.status_code = 200
        return replay
    host = bookable_host(db, user, payload.host_id, payload.site_id)
    visitor = identity.find_or_create_visitor(db, organization_id=host.organization_id, full_name=payload.visitor_name,
                                              email=payload.visitor_email, phone=payload.visitor_phone, company=payload.company, actor_id=user.id)
    visit = lifecycle.create_visit(db, host=host, visitor=visitor, purpose=payload.purpose.strip(), starts_at=payload.starts_at,
                                   ends_at=payload.ends_at, source="invited", category=payload.category, actor=staff(user), invited=True)
    if visit.status == S.pending:
        lifecycle.notify_site_staff(db, visit, "Invitation awaiting approval", f"{host.name} invited {visitor.full_name}.", roles=("site-admin",),
                                    kind="invitation")
    audit(db, user, "visit.created", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    db.flush()
    body = visit_out(visit)
    idempotency.store(db, scope, idempotency_key, 201, body)
    db.commit()
    return body


@router.patch("/visits/{visit_id}", response_model=VisitOut)
def update_visit(visit_id: uuid.UUID, payload: VisitPatch, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.update", "Your role cannot edit visits")
    visit = load_visit(db, user, visit_id)
    values = payload.model_dump(exclude_unset=True)
    check_version(visit, values.pop("version", None))
    if visit.status not in {S.pending, S.security_review, S.scheduled}:
        raise HTTPException(409, "This visit can no longer be edited")
    next_start, next_end = values.get("starts_at", visit.starts_at), values.get("ends_at", visit.ends_at)
    if next_end <= next_start:
        raise HTTPException(422, "Visit end must be after its start")
    if "host_id" in values:
        host = bookable_host(db, user, values["host_id"], visit.site_id)
        visit.host_id, visit.host = host.id, host
    if "purpose" in values:
        visit.purpose = values["purpose"].strip()
    visit.starts_at, visit.ends_at = next_start, next_end
    if visit.pass_ and visit.pass_.status == "active":
        visit.pass_.expires_at = max(next_end, visit.pass_.valid_from + timedelta(minutes=5))
    visit.updated_at = utcnow()
    lifecycle.record_event(db, visit, "manual_correction", staff(user), reason="Visit details edited", metadata={"fields": sorted(values)})
    audit(db, user, "visit.updated", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    db.commit()
    return visit_out(visit, include_pass=True)


@router.post("/visits/{visit_id}/approve", response_model=VisitOut)
def approve_visit(visit_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.approve", "Your role cannot approve visits")
    visit = load_visit(db, user, visit_id)
    if user.role == Role.host and visit.source != "walk-in":
        raise HTTPException(403, "Hosts may approve walk-in requests only")
    if visit.status == S.security_review:
        raise HTTPException(409, "This visit needs a security decision before it can be approved")
    if visit.status != S.pending:
        raise HTTPException(409, "This visit cannot be approved in its current state")
    if screening.screen(db, visit, actor_user_id=user.id):
        db.commit()  # keep the security review that screening just opened
        raise HTTPException(409, "This visitor matched a restricted-entry record; the visit now needs a security decision")
    lifecycle.transition(db, visit, S.scheduled, "approved", staff(user))
    code = lifecycle.issue_pass(db, visit, staff(user))
    audit(db, user, "visit.approved", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    db.commit()
    return visit_out(visit, pass_code=code)


@router.post("/visits/{visit_id}/reject", response_model=VisitOut)
def reject_visit(visit_id: uuid.UUID, payload: RejectVisit, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.reject", "Only an administrator can reject visits")
    visit = load_visit(db, user, visit_id)
    if visit.status not in {S.pending, S.security_review}:
        raise HTTPException(409, "Only pending visits can be rejected")
    lifecycle.transition(db, visit, S.rejected, "rejected", staff(user), reason=payload.reason)
    audit(db, user, "visit.rejected", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id, reason=payload.reason)
    db.commit()
    return visit_out(visit)


@router.post("/visits/{visit_id}/revoke", response_model=VisitOut)
def revoke_visit(visit_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Cancels a visit that has not started and revokes its pass."""
    user.require("pass.revoke", "Your role cannot revoke passes")
    visit = load_visit(db, user, visit_id)
    if visit.status not in {S.pending, S.security_review, S.scheduled}:
        raise HTTPException(409, "This visit cannot be revoked in its current state")
    lifecycle.transition(db, visit, S.cancelled, "cancelled", staff(user), reason="Cancelled by staff")
    audit(db, user, "pass.revoked", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    db.commit()
    return visit_out(visit)


@router.post("/visits/{visit_id}/check-in", response_model=VisitOut)
def staff_check_in(visit_id: uuid.UUID, payload: GateIn | None = None, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Reception admits a visitor (first entry or re-entry). Security state is re-checked; pass expiry is not,
    because staff have verified the visitor in person."""
    user.require("visit.check_in", "Your role cannot check visitors in")
    visit = load_visit(db, user, visit_id)
    if visit.status not in {S.scheduled, S.checked_in, S.temporarily_out}:
        raise HTTPException(409, "Visit is not approved for check-in")
    if lifecycle.check_in(db, visit, staff(user), (payload.gate if payload else None) or "Reception"):
        audit(db, user, "visit.checked_in", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    db.commit()
    return visit_out(visit, include_pass=True)


@router.post("/visits/{visit_id}/step-out", response_model=VisitOut)
def staff_step_out(visit_id: uuid.UUID, payload: GateIn | None = None, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.check_in", "Your role cannot record visitor movements")
    visit = load_visit(db, user, visit_id)
    lifecycle.step_out(db, visit, staff(user), payload.gate if payload else None)
    db.commit()
    return visit_out(visit, include_pass=True)


@router.post("/visits/{visit_id}/check-out", response_model=VisitOut)
def staff_check_out(visit_id: uuid.UUID, payload: GateIn | None = None, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Works whether or not the pass has expired, so an overstaying visitor can always be signed out."""
    user.require("visit.check_in", "Your role cannot check visitors out")
    visit = load_visit(db, user, visit_id)
    if visit.status not in {S.checked_in, S.temporarily_out, S.checked_out}:
        raise HTTPException(409, "Visit is not currently checked in")
    if lifecycle.check_out(db, visit, staff(user), payload.gate if payload else None):
        audit(db, user, "visit.checked_out", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    db.commit()
    return visit_out(visit)


@router.post("/passes/verify", response_model=VisitOut)
def verify_pass(payload: PassCheck, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Reception scans or types a pass; the outcome is recorded either way."""
    user.require("visit.check_in", "Your role cannot verify passes")
    org = None if user.role == Role.super_admin else user.organization_id
    visit = lifecycle.evaluate_pass(db, payload.code.strip(), action="verify", site_ids=user.site_ids, actor=staff(user), organization_id=org)
    db.commit()
    return visit_out(visit, pass_code=payload.code.strip())


@router.post("/reception/walk-ins", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def register_reception_walk_in(payload: WalkInCreate, response: Response, idempotency_key: str | None = Header(default=None),
                               db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Reception registers and admits a walk-in in one step: visit, approval, pass and check-in."""
    user.require("walk_in.register", "Your role cannot register a walk-in visitor")
    scope = f"user:{user.id}:walk-in"
    if (replay := idempotency.claim(db, scope, idempotency_key, payload)) is not None:
        db.commit()
        response.status_code = 200
        return replay
    host = bookable_host(db, user, payload.host_id, payload.site_id)
    now = utcnow()
    hours = db.get(Site, host.site_id).settings.default_visit_hours
    visitor = identity.find_or_create_visitor(db, organization_id=host.organization_id, full_name=payload.visitor_name,
                                              email=payload.visitor_email, phone=payload.visitor_phone, company=payload.company, actor_id=user.id)
    visit = lifecycle.create_visit(db, host=host, visitor=visitor, purpose=payload.purpose.strip(), starts_at=now,
                                   ends_at=now + timedelta(hours=hours), source="walk-in", actor=staff(user), consent_at=now, nda_at=now)
    code = None
    if visit.status == S.security_review:
        # A blacklist match: nothing is admitted until security decides.
        audit(db, user, "walk_in.held_for_security", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    else:
        lifecycle.transition(db, visit, S.scheduled, "approved", staff(user), reason="Registered at reception")
        code = lifecycle.issue_pass(db, visit, staff(user))
        lifecycle.check_in(db, visit, staff(user), "Reception")
        audit(db, user, "walk_in.checked_in", entity_type="visit", entity_id=visit.id, organization_id=visit.organization_id, site_id=visit.site_id)
    db.flush()
    body = visit_out(visit, pass_code=code)
    idempotency.store(db, scope, idempotency_key, 201, body)
    db.commit()
    return body


# --- visitors --------------------------------------------------------------------------------------

def visitor_out(person: Person, profile: VisitorProfile | None) -> VisitorOut:
    return VisitorOut(
        id=person.id, full_name=person.full_name, email=person.email, phone=person.phone, company=person.company,
        is_active=profile is None or profile.status == "active", created_at=person.created_at,
        classification=profile.classification if profile else "standard", visit_count=profile.visit_count if profile else 0,
        first_visit_at=profile.first_visit_at if profile else None, last_visit_at=profile.last_visit_at if profile else None,
        identity_review=profile.identity_review if profile else False, notes=profile.notes if profile else None,
        version=profile.version if profile else person.version,
    )


def visible_visitor(db: Session, user: Principal, person_id: uuid.UUID) -> tuple[Person, VisitorProfile]:
    person = db.get(Person, person_id)
    seen = db.scalar(scope_visits(select(Visit.id).where(Visit.visitor_person_id == person_id), user).limit(1))
    profile = db.get(VisitorProfile, person_id)
    if not person or person.identity_status != "active" or not seen or profile is None:
        raise HTTPException(404, "Visitor was not found")
    return person, profile


@router.get("/visitors", response_model=list[VisitorOut])
def list_visitors(q: str | None = Query(default=None, max_length=100), classification: str | None = None, needs_review: bool | None = None,
                  offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.read", "Your role cannot view visitors")
    visible = scope_visits(select(Visit.visitor_person_id), user).subquery()
    query = (select(Person, VisitorProfile).join(VisitorProfile, VisitorProfile.person_id == Person.id)
             .where(Person.id.in_(select(visible.c.visitor_person_id)), Person.identity_status == "active"))
    if q:
        digits = identity.phone_digits(q)
        terms = [Person.full_name.ilike(f"%{q}%"), Person.email.ilike(f"%{q}%")]
        if digits:
            terms.append(func.regexp_replace(Person.phone, "[^0-9]", "", "g").contains(digits))  # partial search, not identity matching
        query = query.where(or_(*terms))
    if classification:
        query = query.where(VisitorProfile.classification == classification)
    if needs_review is not None:
        query = query.where(VisitorProfile.identity_review.is_(needs_review))
    rows = db.execute(query.order_by(VisitorProfile.last_visit_at.desc().nulls_last(), Person.created_at.desc()).offset(offset).limit(limit)).all()
    return [visitor_out(person, profile) for person, profile in rows]


@router.get("/visitors/{person_id}/visits", response_model=list[VisitOut])
def visitor_history(person_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visit.read", "Your role cannot view visitors")
    visible_visitor(db, user, person_id)
    rows = db.scalars(scope_visits(visit_query().where(Visit.visitor_person_id == person_id), user).order_by(Visit.starts_at.desc()).limit(200)).unique().all()
    return [visit_out(v) for v in rows]


@router.patch("/visitors/{person_id}", response_model=VisitorOut)
def update_visitor(person_id: uuid.UUID, payload: VisitorPatch, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visitor.update", "Your role cannot edit visitor records")
    person, profile = visible_visitor(db, user, person_id)
    changes = payload.model_dump(exclude_unset=True)
    profile_fields = {k: changes.pop(k) for k in ("classification", "notes", "identity_review") if k in changes}
    if profile_fields and not user.can("visitor.deactivate"):
        raise HTTPException(403, "Only administrators can change a visitor's classification or notes")
    if changes and db.scalar(select(User.id).where(User.person_id == person.id)):
        raise HTTPException(409, "This person is also a staff member; edit their details through their account")
    for field, value in changes.items():
        setattr(person, field, (str(value).lower() if field == "email" else value.strip()) if value and isinstance(value, str) else value)
    person.updated_by = user.id
    for field, value in profile_fields.items():
        setattr(profile, field, value)
    audit(db, user, "visitor.updated", entity_type="person", entity_id=person.id, organization_id=person.organization_id, fields=sorted([*changes, *profile_fields]))
    db.commit()
    return visitor_out(person, profile)


@router.delete("/visitors/{person_id}", status_code=204)
def deactivate_visitor(person_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Blocks future entry for this visitor. History is kept."""
    user.require("visitor.deactivate", "Your role cannot deactivate visitor records")
    person, profile = visible_visitor(db, user, person_id)
    profile.status = "inactive"
    audit(db, user, "visitor.deactivated", entity_type="person", entity_id=person.id, organization_id=person.organization_id)
    db.commit()
    return Response(status_code=204)


@router.post("/visitors/{person_id}/reactivate", response_model=VisitorOut)
def reactivate_visitor(person_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visitor.deactivate", "Your role cannot reactivate visitor records")
    person, profile = visible_visitor(db, user, person_id)
    profile.status = "active"
    audit(db, user, "visitor.reactivated", entity_type="person", entity_id=person.id, organization_id=person.organization_id)
    db.commit()
    return visitor_out(person, profile)


@router.post("/visitors/merge", response_model=VisitorOut)
def merge_visitors(payload: VisitorMerge, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("visitor.merge", "Your role cannot merge visitor records")
    visible_visitor(db, user, payload.source_id)
    target = db.get(Person, payload.target_id)
    if target is None or (user.role != Role.super_admin and target.organization_id != user.organization_id):
        raise HTTPException(404, "Visitor was not found")
    identity.merge_people(db, organization_id=target.organization_id, source_id=payload.source_id, target_id=payload.target_id,
                          actor_id=user.id, reason=payload.reason)
    db.commit()
    return visitor_out(target, db.get(VisitorProfile, target.id))


# --- dashboard -------------------------------------------------------------------------------------

@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Counts for the signed-in user's scope. "Today" is the current UTC day."""
    now = utcnow()
    day_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)
    today = and_(Visit.starts_at >= day_start, Visit.starts_at < day_end)
    counts = db.execute(scope_visits(select(
        func.count().filter(today, Visit.status == S.scheduled),
        func.count().filter(today, Visit.status.not_in([S.cancelled, S.rejected])),
        func.count().filter(Visit.status.in_(ON_SITE_STATUSES)),
        func.count().filter(Visit.checked_out_at >= day_start, Visit.checked_out_at < day_end),
        func.count().filter(Visit.status.in_([S.pending, S.security_review])),
        func.count().filter(Visit.status.in_(ON_SITE_STATUSES), Visit.ends_at < now),
    ).select_from(Visit), user)).one()
    user_query = select(func.count()).select_from(User).where(User.is_active.is_(True))
    site_query = select(func.count()).select_from(Site).where(Site.status == "active")
    if user.role != Role.super_admin:
        user_query = user_query.where(User.organization_id == user.organization_id)
        site_query = site_query.where(Site.organization_id == user.organization_id, user.site_clause(Site.id))
        if user.site_ids is not None:
            user_query = user_query.where(users_at_sites(user.site_ids))
    expected, today_total, on_site, checked_out, pending, overdue = counts
    return {"expected_today": expected, "visitors_today": today_total, "on_site": on_site, "checked_out_today": checked_out,
            "pending": pending, "overdue": overdue, "user_count": db.scalar(user_query), "site_count": db.scalar(site_query)}
