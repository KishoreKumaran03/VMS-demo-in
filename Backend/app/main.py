import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session, joinedload

from .config import get_settings
from .database import get_db
from .models import AuditEvent, Host, Notification, Organization, Role, Site, User, Visit, VisitStatus, Visitor, utcnow
from .schemas import AuditOut, HostCreate, HostOut, HostPatch, KioskRequestOut, LoginRequest, NotificationOut, OrganizationCreate, OrganizationOut, RejectVisit, SiteCreate, SiteOut, SitePatch, TokenOut, UserCreate, UserOut, UserPatch, VisitCreate, VisitOut, VisitPatch, VisitorOut, VisitorPatch, WalkInCreate
from .security import current_user, decrypt_pass, digest_pass, encrypt_pass, hash_password, issue_token, verify_password

app = FastAPI(title="VisitorHub API", version="1.0.0", openapi_url="/api/v1/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().allowed_origins, allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])

_request_counts: dict[str, tuple[int, float]] = {}


@app.middleware("http")
async def limit_public_kiosk_requests(request: Request, call_next):
    if request.url.path.startswith("/api/v1/kiosk/"):
        import time

        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        count, started = _request_counts.get(ip, (0, now))
        if now - started >= 60:
            count, started = 0, now
        if count >= 60:
            from starlette.responses import JSONResponse

            return JSONResponse(status_code=429, content={"detail": "Too many kiosk requests. Please try again shortly."})
        _request_counts[ip] = (count + 1, started)
    return await call_next(request)


def scope_visits(query, user: User):
    if user.role != Role.super_admin:
        query = query.where(Visit.organization_id == user.organization_id)
        if user.role == Role.host:
            query = query.join(Host, Visit.host_id == Host.id).where(Host.email == user.email, Host.active.is_(True))
        elif user.site_id:
            query = query.where(Visit.site_id == user.site_id)
    return query


def visible_host(db: Session, host_id: uuid.UUID, org_id: uuid.UUID) -> Host | None:
    return db.scalar(select(Host).where(Host.id == host_id, Host.organization_id == org_id, Host.active.is_(True)))


def view_visit(visit: Visit, pass_code: str | None = None, include_pass: bool = False) -> VisitOut:
    if include_pass and visit.status in {VisitStatus.scheduled, VisitStatus.checked_in}:
        pass_code = decrypt_pass(visit.pass_ciphertext)
    return VisitOut(
        id=visit.id, visitor_id=visit.visitor.id, visitor_name=visit.visitor.full_name,
        visitor_email=visit.visitor.email, visitor_phone=visit.visitor.phone, company=visit.visitor.company,
        host_id=visit.host.id, host_name=visit.host.name, host_department=visit.host.department, site_id=visit.site_id, purpose=visit.purpose,
        starts_at=visit.starts_at, ends_at=visit.ends_at, status=visit.status,
        source=visit.source,
        pass_code=pass_code, checked_in_at=visit.checked_in_at, checked_out_at=visit.checked_out_at,
        check_in_gate=visit.check_in_gate,
    )


def audit(db: Session, visit: Visit, actor: User | None, event_type: str, detail: str | None = None) -> None:
    db.add(AuditEvent(organization_id=visit.organization_id, actor_id=actor.id if actor else None, visit_id=visit.id, event_type=event_type, detail=detail))


def is_expired(value: datetime, now: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value < now


@app.get("/api/v1/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "visitorhub-api"}


@app.post("/api/v1/auth/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    return TokenOut(access_token=issue_token(user), user=UserOut.model_validate(user))


@app.get("/api/v1/auth/me", response_model=UserOut)
def who_am_i(user: User = Depends(current_user)):
    return user


@app.get("/api/v1/organizations", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != Role.super_admin:
        raise HTTPException(403, "Only platform administrators can manage organizations")
    return db.scalars(select(Organization).where(Organization.is_active.is_(True)).order_by(Organization.name)).all()


@app.post("/api/v1/organizations", response_model=OrganizationOut, status_code=201)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != Role.super_admin:
        raise HTTPException(403, "Only platform administrators can manage organizations")
    organization = Organization(name=payload.name.strip())
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


@app.patch("/api/v1/sites/{site_id}", response_model=SiteOut)
def update_site(site_id: uuid.UUID, payload: SitePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot manage sites")
    site = db.get(Site, site_id)
    if not site or (user.role != Role.super_admin and (site.organization_id != user.organization_id or user.site_id != site_id)):
        raise HTTPException(404, "Site was not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(site, field, value.strip() if field == "name" and value else value)
    db.commit()
    db.refresh(site)
    return site


@app.get("/api/v1/sites", response_model=list[SiteOut])
def list_sites(db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(Site).where(Site.is_active.is_(True))
    if user.role != Role.super_admin:
        query = query.where(Site.organization_id == user.organization_id)
    if user.site_id and user.role not in {Role.super_admin}:
        query = query.where(Site.id == user.site_id)
    return db.scalars(query.order_by(Site.name)).all()


@app.post("/api/v1/sites", response_model=SiteOut, status_code=201)
def create_site(payload: SiteCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot create sites")
    org_id = payload.organization_id if user.role == Role.super_admin and payload.organization_id else user.organization_id
    if org_id != user.organization_id and user.role != Role.super_admin:
        raise HTTPException(403, "Site is outside your organization")
    if not db.get(Organization, org_id):
        raise HTTPException(404, "Organization was not found")
    site = Site(organization_id=org_id, name=payload.name.strip(), address=payload.address)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


@app.delete("/api/v1/sites/{site_id}", status_code=204)
def deactivate_site(site_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot manage sites")
    site = db.get(Site, site_id)
    if not site or site.organization_id != user.organization_id or (user.role != Role.super_admin and user.site_id != site_id):
        raise HTTPException(404, "Site was not found")
    site.is_active = False
    db.commit()
    return Response(status_code=204)


@app.get("/api/v1/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot list user accounts")
    query = select(User)
    if user.role != Role.super_admin:
        query = query.where(User.organization_id == user.organization_id)
    if user.site_id and user.role != Role.super_admin:
        query = query.where(User.site_id == user.site_id)
    return db.scalars(query.order_by(User.full_name)).all()


@app.post("/api/v1/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == Role.site_admin:
        if payload.role not in {Role.host, Role.receptionist} or not user.site_id or payload.site_id != user.site_id:
            raise HTTPException(403, "Site administrators may create host or reception accounts at their own site")
        org_id = user.organization_id
    elif user.role == Role.super_admin:
        org_id = payload.organization_id or user.organization_id
        if not db.get(Organization, org_id):
            raise HTTPException(404, "Organization was not found")
    else:
        raise HTTPException(403, "Your role cannot create user accounts")
    if payload.site_id:
        site = db.get(Site, payload.site_id)
        if not site or site.organization_id != org_id or not site.is_active:
            raise HTTPException(404, "Site was not found in this organization")
    existing = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if existing:
        raise HTTPException(409, "An account with this email already exists")
    account = User(email=str(payload.email).lower(), full_name=payload.full_name.strip(), password_hash=hash_password(payload.password), role=payload.role, organization_id=org_id, site_id=payload.site_id)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@app.delete("/api/v1/users/{user_id}", status_code=204)
def deactivate_user(user_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot manage user accounts")
    target = db.get(User, user_id)
    if not target or (user.role != Role.super_admin and target.organization_id != user.organization_id):
        raise HTTPException(404, "User was not found")
    if user.site_id and user.role != Role.super_admin and target.site_id != user.site_id:
        raise HTTPException(404, "User was not found")
    if target.id == user.id:
        raise HTTPException(409, "You cannot deactivate your own account")
    target.is_active = False
    db.commit()
    return Response(status_code=204)


@app.patch("/api/v1/users/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, payload: UserPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    target = db.get(User, user_id)
    if user.role == Role.site_admin:
        if not target or target.organization_id != user.organization_id or target.site_id != user.site_id or target.role not in {Role.host, Role.receptionist}:
            raise HTTPException(404, "User was not found")
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("role") not in (None, Role.host, Role.receptionist) or ("site_id" in changes and changes["site_id"] != user.site_id):
            raise HTTPException(403, "Site administrators cannot change account scope")
    elif user.role == Role.super_admin:
        if not target:
            raise HTTPException(404, "User was not found")
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("site_id"):
            site = db.get(Site, changes["site_id"])
            if not site or site.organization_id != target.organization_id:
                raise HTTPException(404, "Site was not found in the user's organization")
    else:
        raise HTTPException(403, "Your role cannot manage user accounts")
    if target.id == user.id and changes.get("role") not in (None, user.role):
        raise HTTPException(409, "You cannot change your own role")
    for field, value in changes.items():
        setattr(target, field, value.strip() if field == "full_name" and value else value)
    db.commit()
    db.refresh(target)
    return target


@app.post("/api/v1/hosts", response_model=HostOut, status_code=201)
def create_host(payload: HostCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot manage the host directory")
    site_id = payload.site_id or user.site_id
    site = db.get(Site, site_id) if site_id else None
    if not site or not site.is_active or (user.role != Role.super_admin and (site.organization_id != user.organization_id or (user.site_id and site.id != user.site_id))):
        raise HTTPException(404, "Site was not found in your organization")
    host = Host(organization_id=site.organization_id, site_id=site.id, employee_id=payload.employee_id.strip(), name=payload.name.strip(), email=str(payload.email).lower(), department=payload.department.strip())
    db.add(host)
    db.commit()
    db.refresh(host)
    return host


@app.patch("/api/v1/hosts/{host_id}", response_model=HostOut)
def update_host(host_id: uuid.UUID, payload: HostPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot manage the host directory")
    host = db.get(Host, host_id)
    if not host or (user.role != Role.super_admin and host.organization_id != user.organization_id) or (user.site_id and user.role != Role.super_admin and host.site_id != user.site_id):
        raise HTTPException(404, "Host was not found")
    fields = payload.model_dump(exclude_unset=True)
    for field in ("employee_id", "name", "email", "department"):
        if field in fields:
            setattr(host, field, str(fields[field]).lower() if field == "email" else fields[field].strip())
    db.commit()
    db.refresh(host)
    return host


@app.delete("/api/v1/hosts/{host_id}", status_code=204)
def deactivate_host(host_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot manage the host directory")
    host = db.get(Host, host_id)
    if not host or (user.role != Role.super_admin and host.organization_id != user.organization_id) or (user.site_id and user.role != Role.super_admin and host.site_id != user.site_id):
        raise HTTPException(404, "Host was not found")
    host.active = False
    db.commit()
    return Response(status_code=204)


@app.get("/api/v1/hosts", response_model=list[HostOut])
def list_hosts(q: str | None = Query(default=None, max_length=100), department: str | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(Host).where(Host.organization_id == user.organization_id, Host.active.is_(True))
    if user.site_id and user.role != Role.super_admin:
        query = query.where(Host.site_id == user.site_id)
    if q:
        query = query.where(Host.name.ilike(f"%{q}%") | Host.employee_id.ilike(f"%{q}%"))
    if department:
        query = query.where(Host.department == department)
    return db.scalars(query.order_by(Host.name).limit(100)).all()


@app.get("/api/v1/kiosk/hosts", response_model=list[HostOut])
def kiosk_hosts(site_id: uuid.UUID, q: str | None = Query(default=None, max_length=100), department: str | None = None, db: Session = Depends(get_db)):
    query = select(Host).join(Site, Host.site_id == Site.id).where(Host.active.is_(True), Site.is_active.is_(True))
    if site_id:
        query = query.where(Host.site_id == site_id)
    if q:
        query = query.where(Host.name.ilike(f"%{q}%") | Host.employee_id.ilike(f"%{q}%"))
    if department:
        query = query.where(Host.department == department)
    return db.scalars(query.order_by(Host.name).limit(50)).all()


@app.get("/api/v1/kiosk/requests/{visit_id}", response_model=KioskRequestOut)
def kiosk_request_status(visit_id: uuid.UUID, db: Session = Depends(get_db)):
    visit = db.scalar(select(Visit).options(joinedload(Visit.host)).where(Visit.id == visit_id))
    if not visit:
        raise HTTPException(404, "Request was not found")
    code = decrypt_pass(visit.pass_ciphertext) if visit.status == VisitStatus.scheduled else None
    return KioskRequestOut(id=visit.id, status=visit.status, pass_code=code, host_name=visit.host.name)


@app.get("/api/v1/visits", response_model=list[VisitOut])
def list_visits(status_filter: VisitStatus | None = Query(default=None, alias="status"), offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = scope_visits(select(Visit).options(joinedload(Visit.visitor), joinedload(Visit.host)), user)
    if status_filter:
        query = query.where(Visit.status == status_filter)
    return [view_visit(v, include_pass=True) for v in db.scalars(query.order_by(Visit.starts_at.desc()).offset(offset).limit(limit)).unique().all()]


@app.patch("/api/v1/visits/{visit_id}", response_model=VisitOut)
def update_visit(visit_id: uuid.UUID, payload: VisitPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.host, Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot edit visits")
    visit = db.scalar(scope_visits(select(Visit).options(joinedload(Visit.visitor), joinedload(Visit.host)).where(Visit.id == visit_id).with_for_update(of=Visit), user))
    if not visit:
        raise HTTPException(404, "Visit was not found")
    if user.role == Role.host and visit.host.email.lower() != user.email.lower():
        raise HTTPException(404, "Visit was not found")
    if visit.status in {VisitStatus.checked_in, VisitStatus.checked_out, VisitStatus.cancelled, VisitStatus.rejected}:
        raise HTTPException(409, "This visit can no longer be edited")
    values = payload.model_dump(exclude_unset=True)
    next_start = values.get("starts_at", visit.starts_at)
    next_end = values.get("ends_at", visit.ends_at)
    if next_end <= next_start:
        raise HTTPException(422, "Visit end must be after its start")
    if "host_id" in values:
        host = db.scalar(select(Host).where(Host.id == values["host_id"], Host.organization_id == visit.organization_id, Host.site_id == visit.site_id, Host.active.is_(True)))
        if not host:
            raise HTTPException(404, "Host was not found at this site")
        if user.role == Role.host and host.email.lower() != user.email.lower():
            raise HTTPException(403, "A host cannot reassign a visit to another host")
        visit.host_id = host.id
        visit.host = host
    if "purpose" in values:
        visit.purpose = values["purpose"].strip()
    if "starts_at" in values:
        visit.starts_at = next_start
    if "ends_at" in values:
        visit.ends_at = next_end
        visit.pass_expires_at = next_end
    audit(db, visit, user, "visit.updated")
    db.commit()
    db.refresh(visit)
    return view_visit(visit, include_pass=True)


@app.get("/api/v1/visitors", response_model=list[VisitorOut])
def list_visitors(q: str | None = Query(default=None, max_length=100), offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user: User = Depends(current_user)):
    visible = scope_visits(select(Visit.visitor_id), user).subquery()
    query = select(Visitor).where(Visitor.id.in_(select(visible.c.visitor_id)), Visitor.is_active.is_(True))
    if q:
        query = query.where(Visitor.full_name.ilike(f"%{q}%") | Visitor.email.ilike(f"%{q}%"))
    return db.scalars(query.order_by(Visitor.created_at.desc()).offset(offset).limit(limit)).all()


@app.patch("/api/v1/visitors/{visitor_id}", response_model=VisitorOut)
def update_visitor(visitor_id: uuid.UUID, payload: VisitorPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin, Role.receptionist}:
        raise HTTPException(403, "Your role cannot edit visitor records")
    visitor = db.get(Visitor, visitor_id)
    visible = scope_visits(select(Visit.id).where(Visit.visitor_id == visitor_id), user).limit(1)
    if not visitor or not visitor.is_active or not db.scalar(visible):
        raise HTTPException(404, "Visitor was not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(visitor, field, (str(value).lower() if field == "email" else value.strip()) if value and isinstance(value, str) else value)
    db.commit()
    db.refresh(visitor)
    return visitor


@app.delete("/api/v1/visitors/{visitor_id}", status_code=204)
def deactivate_visitor(visitor_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot deactivate visitor records")
    visitor = db.get(Visitor, visitor_id)
    visible = scope_visits(select(Visit.id).where(Visit.visitor_id == visitor_id), user).limit(1)
    if not visitor or not db.scalar(visible):
        raise HTTPException(404, "Visitor was not found")
    visitor.is_active = False
    db.commit()
    return Response(status_code=204)


@app.post("/api/v1/visits", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def create_visit(payload: VisitCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.host, Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot create visits")
    host = db.scalar(select(Host).where(Host.id == payload.host_id, Host.active.is_(True))) if user.role == Role.super_admin else visible_host(db, payload.host_id, user.organization_id)
    if not host or (user.role == Role.host and user.email.lower() != host.email.lower()):
        raise HTTPException(404, "Host was not found")
    site_id = payload.site_id or host.site_id
    if site_id != host.site_id or (user.site_id and user.role != Role.super_admin and site_id != user.site_id):
        raise HTTPException(403, "Host and visit must belong to your site")
    visitor = Visitor(organization_id=host.organization_id, full_name=payload.visitor_name.strip(), email=str(payload.visitor_email).lower() if payload.visitor_email else None, phone=payload.visitor_phone, company=payload.company)
    db.add(visitor)
    db.flush()
    seed_code = secrets.token_urlsafe(32)
    visit = Visit(organization_id=host.organization_id, site_id=site_id, visitor_id=visitor.id, host_id=host.id, created_by_id=user.id, purpose=payload.purpose.strip(), starts_at=payload.starts_at, ends_at=payload.ends_at, status=VisitStatus.pending, pass_digest=digest_pass(seed_code), pass_ciphertext=encrypt_pass(seed_code), pass_expires_at=payload.ends_at)
    db.add(visit)
    db.flush()
    audit(db, visit, user, "visit.created")
    db.commit()
    db.refresh(visit)
    return view_visit(visit)


@app.post("/api/v1/visits/{visit_id}/approve", response_model=VisitOut)
def approve_visit(visit_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin, Role.host}:
        raise HTTPException(403, "Your role cannot approve visits")
    visit = db.scalar(scope_visits(select(Visit).options(joinedload(Visit.visitor), joinedload(Visit.host)).where(Visit.id == visit_id), user))
    if not visit:
        raise HTTPException(404, "Visit was not found")
    if user.role == Role.host and visit.host.email.lower() != user.email.lower():
        raise HTTPException(404, "Visit was not found")
    if user.role == Role.host and visit.source != "walk-in":
        raise HTTPException(403, "Hosts may approve walk-in requests only")
    if visit.status != VisitStatus.pending or visit.pass_revoked_at:
        raise HTTPException(409, "This visit cannot be approved in its current state")
    code = secrets.token_urlsafe(24)
    visit.pass_digest = digest_pass(code)
    visit.pass_ciphertext = encrypt_pass(code)
    visit.status = VisitStatus.scheduled
    audit(db, visit, user, "visit.approved")
    db.commit()
    db.refresh(visit)
    return view_visit(visit, pass_code=code)


@app.post("/api/v1/visits/{visit_id}/reject", response_model=VisitOut)
def reject_visit(visit_id: uuid.UUID, payload: RejectVisit, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Only an administrator can reject visits")
    visit = db.scalar(scope_visits(select(Visit).options(joinedload(Visit.visitor), joinedload(Visit.host)).where(Visit.id == visit_id), user))
    if not visit:
        raise HTTPException(404, "Visit was not found")
    if visit.status != VisitStatus.pending:
        raise HTTPException(409, "Only pending visits can be rejected")
    visit.status = VisitStatus.rejected
    visit.pass_revoked_at = utcnow()
    audit(db, visit, user, "visit.rejected", payload.reason)
    db.commit()
    return view_visit(visit)


@app.post("/api/v1/visits/{visit_id}/revoke", response_model=VisitOut)
def revoke_pass(visit_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.host, Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot revoke passes")
    visit = db.scalar(scope_visits(select(Visit).options(joinedload(Visit.visitor), joinedload(Visit.host)).where(Visit.id == visit_id), user))
    if not visit:
        raise HTTPException(404, "Visit was not found")
    if visit.status in {VisitStatus.checked_in, VisitStatus.checked_out, VisitStatus.cancelled}:
        raise HTTPException(409, "This visit cannot be revoked in its current state")
    visit.pass_revoked_at = utcnow()
    visit.status = VisitStatus.cancelled
    audit(db, visit, user, "pass.revoked")
    db.commit()
    return view_visit(visit)


def find_pass(db: Session, pass_code: str) -> Visit | None:
    return db.scalar(select(Visit).options(joinedload(Visit.visitor), joinedload(Visit.host)).where(Visit.pass_digest == digest_pass(pass_code)).with_for_update(of=Visit))


@app.get("/api/v1/kiosk/pass/{pass_code}", response_model=VisitOut)
def verify_pass(pass_code: str, db: Session = Depends(get_db)):
    if len(pass_code) < 24 or len(pass_code) > 128:
        raise HTTPException(404, "Pass was not found")
    visit = find_pass(db, pass_code)
    now = utcnow()
    if not visit or not visit.visitor.is_active or visit.pass_revoked_at or is_expired(visit.pass_expires_at, now):
        raise HTTPException(404, "Pass is invalid, expired, or revoked")
    return view_visit(visit)


@app.post("/api/v1/kiosk/pass/{pass_code}/check-in", response_model=VisitOut)
def kiosk_check_in(pass_code: str, gate: str = "Reception", db: Session = Depends(get_db)):
    if len(pass_code) < 24 or len(pass_code) > 128:
        raise HTTPException(404, "Pass was not found")
    visit = find_pass(db, pass_code)
    now = utcnow()
    if not visit or not visit.visitor.is_active or visit.pass_revoked_at or is_expired(visit.pass_expires_at, now):
        raise HTTPException(404, "Pass is invalid, expired, or revoked")
    if visit.status == VisitStatus.checked_in:
        return view_visit(visit)
    if visit.status != VisitStatus.scheduled:
        raise HTTPException(409, "Visit is not approved for check-in")
    visit.status = VisitStatus.checked_in
    visit.checked_in_at = now
    visit.check_in_gate = gate[:120]
    audit(db, visit, None, "visit.checked_in", gate[:120])
    host_user = db.scalar(select(User).where(User.organization_id == visit.organization_id, User.email == visit.host.email, User.role == Role.host, User.is_active.is_(True)))
    if host_user:
        db.add(Notification(organization_id=visit.organization_id, recipient_id=host_user.id, visit_id=visit.id, title=f"{visit.visitor.full_name} has arrived", message=f"Checked in at {gate[:120]}."))
    db.commit()
    return view_visit(visit)


@app.post("/api/v1/kiosk/pass/{pass_code}/check-out", response_model=VisitOut)
def kiosk_check_out(pass_code: str, db: Session = Depends(get_db)):
    if len(pass_code) < 24 or len(pass_code) > 128:
        raise HTTPException(404, "Pass was not found")
    visit = find_pass(db, pass_code)
    if not visit or visit.pass_revoked_at:
        raise HTTPException(404, "Pass was not found")
    if visit.status == VisitStatus.checked_out:
        return view_visit(visit)
    if visit.status != VisitStatus.checked_in:
        raise HTTPException(409, "Visit is not currently checked in")
    visit.status = VisitStatus.checked_out
    visit.checked_out_at = utcnow()
    audit(db, visit, None, "visit.checked_out")
    db.commit()
    return view_visit(visit)


@app.post("/api/v1/kiosk/walk-ins", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def create_walk_in(payload: WalkInCreate, db: Session = Depends(get_db)):
    """Create a walk-in request; reception must approve it before a pass is issued."""
    host = db.scalar(select(Host).where(Host.id == payload.host_id, Host.site_id == payload.site_id, Host.active.is_(True)))
    if not host:
        raise HTTPException(404, "Host was not found at this site")
    visitor = Visitor(organization_id=host.organization_id, full_name=payload.visitor_name.strip(), email=str(payload.visitor_email).lower() if payload.visitor_email else None, phone=payload.visitor_phone, company=payload.company)
    db.add(visitor)
    db.flush()
    start = utcnow()
    seed_code = secrets.token_urlsafe(32)
    visit = Visit(organization_id=host.organization_id, site_id=host.site_id, visitor_id=visitor.id, host_id=host.id, purpose=payload.purpose.strip(), starts_at=start, ends_at=start + timedelta(hours=8), status=VisitStatus.pending, source="walk-in", pass_digest=digest_pass(seed_code), pass_ciphertext=encrypt_pass(seed_code), pass_expires_at=start + timedelta(hours=8), privacy_consent_at=start, nda_signed_at=start)
    db.add(visit)
    db.flush()
    audit(db, visit, None, "walk_in.created")
    host_user = db.scalar(select(User).where(User.organization_id == host.organization_id, User.email == host.email, User.role == Role.host, User.is_active.is_(True)))
    if host_user:
        db.add(Notification(organization_id=host.organization_id, recipient_id=host_user.id, visit_id=visit.id, title="Walk-in approval requested", message=f"{visitor.full_name} is waiting for your response."))
    db.commit()
    db.refresh(visit)
    return view_visit(visit)


@app.post("/api/v1/reception/walk-ins", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def register_reception_walk_in(payload: WalkInCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role not in {Role.receptionist, Role.site_admin, Role.super_admin}:
        raise HTTPException(403, "Your role cannot register a walk-in visitor")
    host = db.scalar(select(Host).where(Host.id == payload.host_id, Host.site_id == payload.site_id, Host.active.is_(True)))
    if not host or (user.role != Role.super_admin and (host.organization_id != user.organization_id or user.site_id != host.site_id)):
        raise HTTPException(404, "Host was not found at your site")
    now = utcnow()
    code = secrets.token_urlsafe(24)
    visitor = Visitor(organization_id=host.organization_id, full_name=payload.visitor_name.strip(), email=str(payload.visitor_email).lower() if payload.visitor_email else None, phone=payload.visitor_phone, company=payload.company)
    db.add(visitor)
    db.flush()
    visit = Visit(organization_id=host.organization_id, site_id=host.site_id, visitor_id=visitor.id, host_id=host.id, created_by_id=user.id, purpose=payload.purpose.strip(), starts_at=now, ends_at=now + timedelta(hours=8), status=VisitStatus.checked_in, source="walk-in", pass_digest=digest_pass(code), pass_ciphertext=encrypt_pass(code), pass_expires_at=now + timedelta(hours=8), checked_in_at=now, check_in_gate="Reception", privacy_consent_at=now, nda_signed_at=now)
    db.add(visit)
    db.flush()
    audit(db, visit, user, "walk_in.checked_in", "Reception registration")
    host_user = db.scalar(select(User).where(User.organization_id == host.organization_id, User.email == host.email, User.role == Role.host, User.is_active.is_(True)))
    if host_user:
        db.add(Notification(organization_id=host.organization_id, recipient_id=host_user.id, visit_id=visit.id, title=f"{visitor.full_name} has arrived", message="Registered at reception."))
    db.commit()
    db.refresh(visit)
    return view_visit(visit, pass_code=code)


@app.get("/api/v1/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(current_user)):
    visits = db.scalars(scope_visits(select(Visit), user)).all()
    today = datetime.now(timezone.utc).date()
    user_query = select(User).where(User.organization_id == user.organization_id, User.is_active.is_(True))
    site_query = select(Site).where(Site.organization_id == user.organization_id, Site.is_active.is_(True))
    if user.role == Role.super_admin:
        user_query = select(User).where(User.is_active.is_(True))
        site_query = select(Site).where(Site.is_active.is_(True))
    elif user.site_id:
        user_query = user_query.where(User.site_id == user.site_id)
        site_query = site_query.where(Site.id == user.site_id)
    return {
        "expected_today": sum(v.starts_at.date() == today and v.status == VisitStatus.scheduled for v in visits),
        "visitors_today": sum(v.starts_at.date() == today and v.status not in {VisitStatus.cancelled, VisitStatus.rejected} for v in visits),
        "on_site": sum(v.status == VisitStatus.checked_in for v in visits),
        "checked_out_today": sum(v.checked_out_at is not None and v.checked_out_at.date() == today for v in visits),
        "pending": sum(v.status == VisitStatus.pending for v in visits),
        "user_count": len(db.scalars(user_query).all()),
        "site_count": len(db.scalars(site_query).all()),
    }


@app.get("/api/v1/notifications", response_model=list[NotificationOut])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.scalars(select(Notification).where(Notification.organization_id == user.organization_id, Notification.recipient_id == user.id).order_by(Notification.created_at.desc()).limit(100)).all()


@app.post("/api/v1/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(notification_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    notification = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.organization_id == user.organization_id, Notification.recipient_id == user.id))
    if not notification:
        raise HTTPException(404, "Notification was not found")
    notification.read = True
    db.commit()
    db.refresh(notification)
    return notification


@app.get("/api/v1/audit", response_model=list[AuditOut])
def list_audit(offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = select(AuditEvent)
    if user.role != Role.super_admin:
        query = query.where(AuditEvent.organization_id == user.organization_id)
    if user.role == Role.host:
        query = query.join(Visit, AuditEvent.visit_id == Visit.id).join(Host, Visit.host_id == Host.id).where(Host.email == user.email)
    elif user.site_id and user.role != Role.super_admin:
        query = query.join(Visit, AuditEvent.visit_id == Visit.id).where(Visit.site_id == user.site_id)
    return db.scalars(query.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit)).all()
