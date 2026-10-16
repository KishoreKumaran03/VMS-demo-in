"""Helpers shared by the routers: request metadata, optimistic locking, scoping and response shaping."""
import ipaddress
import uuid

from fastapi import HTTPException, Request
from sqlalchemy import exists, select
from sqlalchemy.orm import Session, joinedload

from ..models import Host, Role, Site, User, UserRole, Visit
from ..schemas import HostOut, UserOut, VisitOut
from ..security import Principal, principal_for
from ..services import audit as audit_log
from ..services.visits import is_overdue, visible_pass_code


def client_ip(request: Request) -> str | None:
    # client.host is not always an address (test clients, Unix sockets); the audit columns are INET.
    try:
        return str(ipaddress.ip_address(request.client.host)) if request.client else None
    except ValueError:
        return None


def check_version(record, expected: int | None) -> None:
    """Optimistic locking for PATCH requests that carry the version the client last read."""
    if expected is not None and record.version != expected:
        raise HTTPException(409, "This record was changed by someone else. Reload and try again.")


def audit(db: Session, user: Principal | None, action: str, *, entity_type: str, entity_id: uuid.UUID | None,
          organization_id: uuid.UUID | None, site_id: uuid.UUID | None = None, **metadata) -> None:
    audit_log.record(db, action, entity_type=entity_type, entity_id=entity_id, organization_id=organization_id, site_id=site_id,
                     actor_user_id=user.id if user else None, **metadata)


# --- accounts ---------------------------------------------------------------------------------------

def user_out(user: User) -> UserOut:
    access = principal_for(user)
    if access is None:
        raise HTTPException(500, "Account has no role assignment")
    return UserOut(
        id=user.id, email=user.email, full_name=user.full_name, role=access.role, organization_id=user.organization_id,
        site_id=access.primary_site_id, site_ids=sorted(access.site_ids) if access.site_ids is not None else None,
        account_status=user.account_status, version=user.version,
    )


def requested_sites(site_id: uuid.UUID | None, site_ids: list[uuid.UUID] | None) -> list[uuid.UUID]:
    if site_ids is not None:
        return list(dict.fromkeys(site_ids))
    return [site_id] if site_id else []


def require_sites(db: Session, organization_id: uuid.UUID, site_ids: list[uuid.UUID]) -> None:
    for site_id in site_ids:
        site = db.get(Site, site_id)
        if not site or site.organization_id != organization_id or not site.is_active:
            raise HTTPException(404, "Site was not found in this organization")


def users_at_sites(site_ids: frozenset[uuid.UUID]):
    return exists().where(UserRole.user_id == User.id, UserRole.site_id.in_(site_ids))


def manageable_target(db: Session, user: Principal, user_id: uuid.UUID) -> User:
    """Load an account the caller may administer; 404 otherwise so foreign accounts are not disclosed."""
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User was not found")
    if user.role == Role.super_admin:
        return target
    target_access = principal_for(target)
    if (target.organization_id != user.organization_id or target_access is None
            or target_access.role not in {Role.host, Role.receptionist}):
        raise HTTPException(404, "User was not found")
    if user.site_ids is not None and (target_access.site_ids is None or not target_access.site_ids <= user.site_ids):
        raise HTTPException(404, "User was not found")
    return target


# --- sites and hosts -------------------------------------------------------------------------------

def scoped_site(db: Session, user: Principal, site_id: uuid.UUID | None, *, require_active: bool = True) -> Site:
    site = db.get(Site, site_id) if site_id else None
    if (not site or (require_active and not site.is_active)
            or (user.role != Role.super_admin and (site.organization_id != user.organization_id or not user.in_site(site.id)))):
        raise HTTPException(404, "Site was not found in your organization")
    return site


def host_out(host: Host) -> HostOut:
    return HostOut(id=host.id, employee_id=host.employee_id, name=host.name, department=host.department, site_id=host.site_id,
                   active=host.active, has_account=host.user_id is not None, version=host.version)


def own_host_ids(user: Principal):
    return select(Host.id).where(Host.user_id == user.id)


# --- visits ----------------------------------------------------------------------------------------

def scope_visits(query, user: Principal):
    """Restrict a visit query to what the caller may see: their organization and sites; hosts see their own visits."""
    if user.role != Role.super_admin:
        query = query.where(Visit.organization_id == user.organization_id, user.site_clause(Visit.site_id))
        if user.role == Role.host:
            query = query.where(Visit.host_id.in_(own_host_ids(user)))
    return query


def visit_query():
    return select(Visit).options(joinedload(Visit.visitor), joinedload(Visit.host), joinedload(Visit.pass_))


def visit_out(visit: Visit, *, include_pass: bool = False, pass_code: str | None = None) -> VisitOut:
    if include_pass and pass_code is None:
        pass_code = visible_pass_code(visit)
    visitor, host = visit.visitor, visit.host
    return VisitOut(
        id=visit.id, visitor_id=visitor.id, visitor_name=visitor.full_name, visitor_email=visitor.email, visitor_phone=visitor.phone,
        company=visitor.company, host_id=host.id, host_name=host.name, host_department=host.department, site_id=visit.site_id,
        purpose=visit.purpose, starts_at=visit.starts_at, ends_at=visit.ends_at, status=visit.status, source=visit.source,
        pass_code=pass_code, checked_in_at=visit.checked_in_at, checked_out_at=visit.checked_out_at, check_in_gate=visit.check_in_gate,
        category=visit.category, invitation_id=visit.invitation_id, pass_expires_at=visit.pass_.expires_at if visit.pass_ else None,
        overdue=is_overdue(visit), version=visit.version,
    )
