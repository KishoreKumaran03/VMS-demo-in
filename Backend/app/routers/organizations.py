"""Organizations, sites and per-site settings."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Organization, Role, Site, SiteSettings
from ..schemas import OrganizationCreate, OrganizationOut, SiteCreate, SiteOut, SitePatch, SiteSettingsOut, SiteSettingsPatch
from ..security import Principal, current_user
from .common import audit, check_version, scoped_site

router = APIRouter(prefix="/api/v1", tags=["organizations"])


def new_site(db: Session, organization_id: uuid.UUID, payload: SiteCreate | None = None, name: str | None = None) -> Site:
    site = Site(organization_id=organization_id, name=(payload.name if payload else name).strip(), settings=SiteSettings())
    if payload:
        site.code, site.address, site.timezone = payload.code, payload.address, payload.timezone
    db.add(site)
    db.flush()
    return site


@router.get("/organizations", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("organization.manage", "Only platform administrators can manage organizations")
    return db.scalars(select(Organization).where(Organization.status == "active").order_by(Organization.name)).all()


@router.post("/organizations", response_model=OrganizationOut, status_code=201)
def create_organization(payload: OrganizationCreate, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("organization.manage", "Only platform administrators can manage organizations")
    if db.scalar(select(Organization.id).where(Organization.name == payload.name.strip())):
        raise HTTPException(409, "An organization with this name already exists")
    organization = Organization(name=payload.name.strip())
    db.add(organization)
    db.flush()
    audit(db, user, "organization.created", entity_type="organization", entity_id=organization.id, organization_id=organization.id)
    db.commit()
    db.refresh(organization)
    return organization


@router.get("/sites", response_model=list[SiteOut])
def list_sites(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    query = select(Site).where(Site.status == "active")
    if user.role != Role.super_admin:
        query = query.where(Site.organization_id == user.organization_id, user.site_clause(Site.id))
    return db.scalars(query.order_by(Site.name)).all()


@router.post("/sites", response_model=SiteOut, status_code=201)
def create_site(payload: SiteCreate, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("site.manage", "Your role cannot create sites")
    org_id = payload.organization_id if user.role == Role.super_admin and payload.organization_id else user.organization_id
    if org_id != user.organization_id and user.role != Role.super_admin:
        raise HTTPException(403, "Site is outside your organization")
    if not db.get(Organization, org_id):
        raise HTTPException(404, "Organization was not found")
    if db.scalar(select(Site.id).where(Site.organization_id == org_id, Site.name == payload.name.strip())):
        raise HTTPException(409, "A site with this name already exists")
    site = new_site(db, org_id, payload)
    audit(db, user, "site.created", entity_type="site", entity_id=site.id, organization_id=org_id, site_id=site.id)
    db.commit()
    db.refresh(site)
    return site


@router.patch("/sites/{site_id}", response_model=SiteOut)
def update_site(site_id: uuid.UUID, payload: SitePatch, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("site.manage", "Your role cannot manage sites")
    site = scoped_site(db, user, site_id, require_active=False)
    changes = payload.model_dump(exclude_unset=True)
    check_version(site, changes.pop("version", None))
    for field, value in changes.items():
        setattr(site, field, value.strip() if field in {"name", "code"} and value else value)
    audit(db, user, "site.updated", entity_type="site", entity_id=site.id, organization_id=site.organization_id, site_id=site.id, fields=sorted(changes))
    db.commit()
    db.refresh(site)
    return site


@router.delete("/sites/{site_id}", status_code=204)
def deactivate_site(site_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("site.manage", "Your role cannot manage sites")
    site = scoped_site(db, user, site_id)
    if site.organization_id != user.organization_id and user.role != Role.super_admin:
        raise HTTPException(404, "Site was not found")
    site.status = "inactive"
    audit(db, user, "site.deactivated", entity_type="site", entity_id=site.id, organization_id=site.organization_id, site_id=site.id)
    db.commit()
    return Response(status_code=204)


@router.get("/sites/{site_id}/settings", response_model=SiteSettingsOut)
def get_site_settings(site_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    scoped_site(db, user, site_id)
    return db.get(SiteSettings, site_id)


@router.patch("/sites/{site_id}/settings", response_model=SiteSettingsOut)
def update_site_settings(site_id: uuid.UUID, payload: SiteSettingsPatch, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("site.manage", "Your role cannot manage site settings")
    site = scoped_site(db, user, site_id)
    settings = db.get(SiteSettings, site_id)
    changes = payload.model_dump(exclude_unset=True)
    check_version(settings, changes.pop("version", None))
    for field, value in changes.items():
        setattr(settings, field, value)
    audit(db, user, "site.settings_updated", entity_type="site", entity_id=site.id, organization_id=site.organization_id, site_id=site.id, fields=sorted(changes))
    db.commit()
    db.refresh(settings)
    return settings
