"""Kiosk endpoints. Every call except pairing requires a paired device (X-Device-Key); the device's site
scopes host search, walk-ins and pass validation, so a kiosk cannot act for another site."""
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device, Host, Site, SiteSettings, Visit, VisitStatus, utcnow
from ..schemas import DeviceOut, HostOut, KioskIdentityOut, KioskPairOut, KioskPairRequest, KioskRequestOut, VisitOut, WalkInCreate
from ..security import current_device
from ..services import devices, identity, idempotency
from ..services import visits as lifecycle
from ..services.visits import Actor
from .common import client_ip, host_out, visit_out, visit_query
from .hosts import host_search

router = APIRouter(prefix="/api/v1/kiosk", tags=["kiosk"])


def as_actor(device: Device) -> Actor:
    return Actor(device_id=device.id)


@router.post("/pair", response_model=KioskPairOut)
def pair_kiosk(payload: KioskPairRequest, request: Request, db: Session = Depends(get_db)):
    """Exchange a one-time pairing code for this kiosk's device key. The key is returned only here."""
    device, key = devices.pair(db, payload.pairing_code, client_ip(request))
    site = db.get(Site, device.site_id)
    db.commit()
    return KioskPairOut(device_key=key, device=DeviceOut.model_validate(device), site_name=site.name)


@router.get("/me", response_model=KioskIdentityOut)
def kiosk_identity(db: Session = Depends(get_db), device: Device = Depends(current_device)):
    site = db.get(Site, device.site_id)
    return KioskIdentityOut(device=DeviceOut.model_validate(device), site_name=site.name, require_nda=db.get(SiteSettings, site.id).require_nda)


@router.get("/hosts", response_model=list[HostOut])
def kiosk_hosts(q: str | None = Query(default=None, max_length=100), department: str | None = Query(default=None, max_length=120),
                site_id: uuid.UUID | None = None, db: Session = Depends(get_db), device: Device = Depends(current_device)):
    """Active hosts at the kiosk's own site. A `site_id` for another site returns nothing."""
    if site_id and site_id != device.site_id:
        return []
    query = select(Host).where(Host.site_id == device.site_id, Host.status == "active")
    return [host_out(h) for h in db.scalars(host_search(query, q, department).limit(50)).all()]


@router.post("/walk-ins", response_model=VisitOut, status_code=status.HTTP_201_CREATED)
def create_walk_in(payload: WalkInCreate, response: Response, idempotency_key: str | None = Header(default=None),
                   db: Session = Depends(get_db), device: Device = Depends(current_device)):
    """Self-registration. The host (or a site admin) approves it unless the site allows walk-ins without approval."""
    if payload.site_id != device.site_id:
        raise HTTPException(404, "Host was not found at this site")
    scope = f"device:{device.id}:walk-in"
    if (replay := idempotency.claim(db, scope, idempotency_key, payload)) is not None:
        db.commit()
        response.status_code = 200
        return replay
    host = db.scalar(select(Host).where(Host.id == payload.host_id, Host.site_id == device.site_id, Host.status == "active"))
    if not host:
        raise HTTPException(404, "Host was not found at this site")
    settings = db.get(SiteSettings, device.site_id)
    now = utcnow()
    visitor = identity.find_or_create_visitor(db, organization_id=host.organization_id, full_name=payload.visitor_name,
                                              email=payload.visitor_email, phone=payload.visitor_phone, company=payload.company, actor_id=None)
    visit = lifecycle.create_visit(db, host=host, visitor=visitor, purpose=payload.purpose.strip(), starts_at=now,
                                   ends_at=now + timedelta(hours=settings.default_visit_hours), source="walk-in", actor=as_actor(device),
                                   consent_at=now, nda_at=now if payload.nda_accepted else None)
    if visit.status == VisitStatus.security_review:
        pass  # security staff were notified by screening; the kiosk keeps showing "waiting"
    elif settings.walk_in_requires_host_approval:
        lifecycle.notify_host(db, visit, "Walk-in approval requested", f"{visitor.full_name} is waiting for your response.", kind="walk_in")
    else:
        lifecycle.transition(db, visit, VisitStatus.scheduled, "approved", as_actor(device), reason="Site allows walk-ins without approval")
        lifecycle.issue_pass(db, visit, as_actor(device))
        lifecycle.notify_host(db, visit, "Walk-in registered", f"{visitor.full_name} registered at the kiosk to see you.", kind="walk_in")
    db.flush()
    body = visit_out(visit)
    idempotency.store(db, scope, idempotency_key, 201, body)
    db.commit()
    return body


@router.get("/requests/{visit_id}", response_model=KioskRequestOut)
def kiosk_request_status(visit_id: uuid.UUID, db: Session = Depends(get_db), device: Device = Depends(current_device)):
    """Polled by the kiosk that created the walk-in. Other devices cannot see it."""
    visit = db.scalar(visit_query().where(Visit.id == visit_id, Visit.created_by_device_id == device.id))
    if not visit:
        raise HTTPException(404, "Request was not found")
    return KioskRequestOut(id=visit.id, status=visit.status, pass_code=lifecycle.visible_pass_code(visit), host_name=visit.host.name)


@router.get("/pass/{pass_code}", response_model=VisitOut)
def verify_pass(pass_code: str, db: Session = Depends(get_db), device: Device = Depends(current_device)):
    visit = lifecycle.evaluate_pass(db, pass_code, action="verify", site_ids=frozenset({device.site_id}), actor=as_actor(device))
    db.commit()
    return visit_out(visit)


@router.post("/pass/{pass_code}/check-in", response_model=VisitOut)
def kiosk_check_in(pass_code: str, gate: str | None = Query(default=None, max_length=120), db: Session = Depends(get_db),
                   device: Device = Depends(current_device)):
    visit = lifecycle.evaluate_pass(db, pass_code, action="check_in", site_ids=frozenset({device.site_id}), actor=as_actor(device))
    if visit.status not in {VisitStatus.scheduled, VisitStatus.checked_in, VisitStatus.temporarily_out}:
        raise HTTPException(409, "Visit is not approved for check-in")
    lifecycle.check_in(db, visit, as_actor(device), gate or device.name)
    db.commit()
    return visit_out(visit)


@router.post("/pass/{pass_code}/check-out", response_model=VisitOut)
def kiosk_check_out(pass_code: str, db: Session = Depends(get_db), device: Device = Depends(current_device)):
    """Signing out works even after the pass has expired, as long as the visitor is on site."""
    visit = lifecycle.evaluate_pass(db, pass_code, action="check_out", site_ids=frozenset({device.site_id}), actor=as_actor(device))
    lifecycle.check_out(db, visit, as_actor(device), device.name)
    db.commit()
    return visit_out(visit)
