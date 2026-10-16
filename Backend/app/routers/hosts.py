"""Host directory and departments."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Department, Host, Person, PersonContact, Role, utcnow
from ..schemas import DepartmentOut, HostAccountCreate, HostAccountOut, HostCreate, HostOut, HostPatch
from ..security import Principal, current_user
from ..services import accounts
from .common import audit, check_version, host_out, scoped_site, user_out

router = APIRouter(prefix="/api/v1", tags=["hosts"])


def department_named(db: Session, organization_id: uuid.UUID, name: str) -> Department:
    name = name.strip()
    department = db.scalar(select(Department).where(Department.organization_id == organization_id, func.lower(Department.name) == name.lower()))
    if department is None:
        department = Department(organization_id=organization_id, name=name)
        db.add(department)
        db.flush()
    return department


def ensure_unique_employee_id(db: Session, organization_id: uuid.UUID, employee_id: str, exclude: uuid.UUID | None = None) -> None:
    query = select(Host.id).where(Host.organization_id == organization_id, func.lower(Host.employee_id) == employee_id.lower())
    if exclude:
        query = query.where(Host.id != exclude)
    if db.scalar(query):
        raise HTTPException(409, "A host with this employee ID already exists")


def manageable_host(db: Session, user: Principal, host_id: uuid.UUID) -> Host:
    host = db.get(Host, host_id)
    if not host or (user.role != Role.super_admin and (host.organization_id != user.organization_id or not user.in_site(host.site_id))):
        raise HTTPException(404, "Host was not found")
    return host


def host_search(query, q: str | None, department: str | None):
    query = query.join(Person, Person.id == Host.person_id).join(Department, Department.id == Host.department_id)
    if q:
        query = query.where(Person.full_name.ilike(f"%{q}%") | Host.employee_id.ilike(f"%{q}%"))
    if department:
        query = query.where(func.lower(Department.name) == department.strip().lower())
    return query.order_by(Person.full_name)


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("host.read", "Your role cannot view the host directory")
    return db.scalars(select(Department).where(Department.organization_id == user.organization_id, Department.status == "active").order_by(Department.name)).all()


@router.get("/hosts", response_model=list[HostOut])
def list_hosts(q: str | None = Query(default=None, max_length=100), department: str | None = Query(default=None, max_length=120),
               include_inactive: bool = False, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("host.read", "Your role cannot view the host directory")
    query = select(Host).where(Host.organization_id == user.organization_id)
    if not (include_inactive and user.can("host.manage")):
        query = query.where(Host.status == "active")
    if user.role != Role.super_admin:
        query = query.where(user.site_clause(Host.site_id))
    return [host_out(h) for h in db.scalars(host_search(query, q, department).limit(100)).all()]


@router.post("/hosts", response_model=HostOut, status_code=201)
def create_host(payload: HostCreate, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Directory-only host (no dashboard login)."""
    user.require("host.manage", "Your role cannot manage the host directory")
    site = scoped_site(db, user, payload.site_id or user.primary_site_id)
    ensure_unique_employee_id(db, site.organization_id, payload.employee_id.strip())
    email = str(payload.email).lower()
    person = Person(organization_id=site.organization_id, full_name=payload.name.strip(), email=email, created_by=user.id, updated_by=user.id)
    person.contacts.append(PersonContact(channel="email", value=email, is_primary=True))
    db.add(person)
    db.flush()
    host = Host(organization_id=site.organization_id, site_id=site.id, person_id=person.id, employee_id=payload.employee_id.strip(),
                department_id=department_named(db, site.organization_id, payload.department).id)
    db.add(host)
    db.flush()
    audit(db, user, "host.created", entity_type="host", entity_id=host.id, organization_id=site.organization_id, site_id=site.id)
    db.commit()
    db.refresh(host)
    return host_out(host)


@router.post("/hosts/accounts", response_model=HostAccountOut, status_code=201)
def create_host_account(payload: HostAccountCreate, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Host with a dashboard login: the account, its person record and the directory entry are created together."""
    user.require("host.manage", "Your role cannot create host accounts")
    site = scoped_site(db, user, payload.site_id or user.primary_site_id)
    ensure_unique_employee_id(db, site.organization_id, payload.employee_id.strip())
    account = accounts.create_account(db, organization_id=site.organization_id, email=str(payload.email), full_name=payload.full_name,
                                      password=payload.password, role=Role.host, site_ids=[site.id], actor_id=user.id)
    host = Host(organization_id=site.organization_id, site_id=site.id, person_id=account.person_id, user_id=account.id,
                employee_id=payload.employee_id.strip(), department_id=department_named(db, site.organization_id, payload.department).id)
    db.add(host)
    db.flush()
    audit(db, user, "host.created", entity_type="host", entity_id=host.id, organization_id=site.organization_id, site_id=site.id, user_id=account.id)
    db.commit()
    db.refresh(host)
    return {"user": user_out(account), "host": host_out(host)}


@router.patch("/hosts/{host_id}", response_model=HostOut)
def update_host(host_id: uuid.UUID, payload: HostPatch, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("host.manage", "Your role cannot manage the host directory")
    host = manageable_host(db, user, host_id)
    fields = payload.model_dump(exclude_unset=True)
    check_version(host, fields.pop("version", None))
    if "employee_id" in fields:
        ensure_unique_employee_id(db, host.organization_id, fields["employee_id"].strip(), exclude=host.id)
        host.employee_id = fields["employee_id"].strip()
    if "name" in fields:
        host.person.full_name = fields["name"].strip()
    if "email" in fields:
        if host.user_id:
            raise HTTPException(409, "This host signs in with their email; change it through the account instead")
        host.person.email = str(fields["email"]).lower()
    if "department" in fields:
        host.department_id = department_named(db, host.organization_id, fields["department"]).id
    if "active" in fields:
        host.status = "active" if fields["active"] else "inactive"
        host.deactivated_at = None if fields["active"] else utcnow()
    host.updated_at = utcnow()
    audit(db, user, "host.updated", entity_type="host", entity_id=host.id, organization_id=host.organization_id, site_id=host.site_id, fields=sorted(fields))
    db.commit()
    db.refresh(host)
    return host_out(host)


@router.delete("/hosts/{host_id}", status_code=204)
def deactivate_host(host_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Stops new invitations and walk-ins for the host. Past visits are kept."""
    user.require("host.manage", "Your role cannot manage the host directory")
    host = manageable_host(db, user, host_id)
    if host.status != "inactive":
        host.status, host.deactivated_at = "inactive", utcnow()
        audit(db, user, "host.deactivated", entity_type="host", entity_id=host.id, organization_id=host.organization_id, site_id=host.site_id)
    db.commit()
    return Response(status_code=204)
