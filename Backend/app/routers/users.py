"""Staff accounts: listing, creation, role/site assignment, deactivation and admin-initiated password resets."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Host, Organization, Person, Role, User
from ..schemas import AccountUserOut, UserCreate, UserOut, UserPatch
from ..security import Principal, current_user, principal_for
from ..services import accounts
from .common import check_version, client_ip, manageable_target, require_sites, requested_sites, user_out, users_at_sites

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("", response_model=list[AccountUserOut])
def list_users(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("user.read", "Your role cannot list user accounts")
    query = select(User, Host.employee_id).join(Person, Person.id == User.person_id).outerjoin(Host, Host.user_id == User.id)
    if user.role != Role.super_admin:
        query = query.where(User.organization_id == user.organization_id)
        if user.site_ids is not None:
            query = query.where(users_at_sites(user.site_ids))
    return [
        {**user_out(account).model_dump(), "employee_id": employee_id}
        for account, employee_id in db.execute(query.order_by(Person.full_name)).unique().all()
    ]


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("user.manage", "Your role cannot create user accounts")
    sites = requested_sites(payload.site_id, payload.site_ids)
    if user.role == Role.site_admin:
        if payload.role not in {Role.host, Role.receptionist} or not sites or not all(user.in_site(s) for s in sites):
            raise HTTPException(403, "Site administrators may create host or reception accounts at their own sites")
        org_id = user.organization_id
    else:
        if payload.role == Role.host:
            raise HTTPException(422, "Create Host accounts through the host account endpoint so the directory record is created too")
        org_id = payload.organization_id or user.organization_id
        if not db.get(Organization, org_id):
            raise HTTPException(404, "Organization was not found")
    require_sites(db, org_id, sites)
    account = accounts.create_account(db, organization_id=org_id, email=str(payload.email), full_name=payload.full_name,
                                      password=payload.password, role=payload.role, site_ids=sites, actor_id=user.id)
    db.commit()
    return user_out(account)


@router.delete("/{user_id}", status_code=204)
def deactivate_user(user_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("user.manage", "Your role cannot manage user accounts")
    target = manageable_target(db, user, user_id)
    if target.id == user.id:
        raise HTTPException(409, "You cannot deactivate your own account")
    accounts.set_account_status(db, target, "disabled", user.id)
    db.commit()
    return Response(status_code=204)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, payload: UserPatch, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("user.manage", "Your role cannot manage user accounts")
    target = manageable_target(db, user, user_id)
    changes = payload.model_dump(exclude_unset=True)
    check_version(target, changes.get("version"))
    current = principal_for(target)
    new_role = changes.get("role") or current.role
    role_changed = "role" in changes and changes["role"] not in (None, current.role)
    sites_changed = "site_id" in changes or "site_ids" in changes
    if user.role == Role.site_admin:
        if new_role not in {Role.host, Role.receptionist}:
            raise HTTPException(403, "Site administrators cannot change account scope")
        if sites_changed and not all(user.in_site(s) for s in requested_sites(changes.get("site_id"), changes.get("site_ids"))):
            raise HTTPException(403, "Site administrators cannot change account scope")
    if target.id == user.id and role_changed:
        raise HTTPException(409, "You cannot change your own role")
    if role_changed or sites_changed:
        sites = requested_sites(changes.get("site_id"), changes.get("site_ids")) if sites_changed else sorted(current.site_ids or [])
        require_sites(db, target.organization_id, sites)
        accounts.assign_role(db, target, new_role, sites, user.id)
        accounts.audit_account(db, target, user.id, "account.role_changed", role=new_role.value, sites=[str(s) for s in sites])
    if changes.get("full_name"):
        target.person.full_name = changes["full_name"].strip()
        target.person.updated_by = user.id
        accounts.audit_account(db, target, user.id, "account.updated", fields=["full_name"])
    target.updated_at = accounts.utcnow()  # bump the account version even when only related rows changed
    db.commit()
    db.refresh(target)
    return user_out(target)


@router.post("/{user_id}/password-reset", status_code=202)
def admin_password_reset(user_id: uuid.UUID, request: Request, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Starts the normal email recovery flow for another account. The administrator never sees or sets the password."""
    user.require("user.reset_password", "Your role cannot reset passwords")
    target = manageable_target(db, user, user_id)
    if target.id == user.id:
        raise HTTPException(409, "Use the password change form for your own account")
    if not target.is_active:
        raise HTTPException(409, "Reactivate the account before resetting its password")
    accounts.request_password_reset(db, target, ip=client_ip(request), user_agent=request.headers.get("user-agent"), initiated_by=user.user)
    db.commit()
    return {"detail": "A reset link has been sent to the account's registered email address."}
