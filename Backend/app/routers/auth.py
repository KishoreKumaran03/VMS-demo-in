"""Sign-in, sessions, first-time setup and password management."""
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Organization, Role, Site, SiteSettings, User
from ..schemas import InitialSignupRequest, LoginRequest, PasswordChange, PasswordResetFinish, PasswordResetStart, TokenOut, UserOut
from ..security import Principal, current_user, issue_token, new_session, revoke_sessions, verify_password
from ..services import accounts
from .common import client_ip, user_out

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = accounts.authenticate(db, payload.email, payload.password, client_ip(request), request.headers.get("user-agent"))
    session = new_session(db, user, request.headers.get("user-agent"), client_ip(request))
    db.commit()
    return TokenOut(access_token=issue_token(user, session), user=user_out(user))


@router.post("/logout", status_code=204)
def logout(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    revoke_sessions(db, user.id, "logout")
    accounts.record_auth_event(db, "logout", user.user)
    db.commit()
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def who_am_i(user: Principal = Depends(current_user)):
    return user_out(user.user)


@router.post("/password", status_code=204)
def change_own_password(payload: PasswordChange, request: Request, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    valid, _ = verify_password(payload.current_password, user.user.credential.password_hash)
    if not valid:
        accounts.record_auth_event(db, "password.change_failed", user.user, client_ip(request))
        db.commit()
        raise HTTPException(400, "Current password is incorrect")
    accounts.change_password(db, user.user, payload.new_password, actor_id=user.id, reason="changed", keep_session=user.session_id)
    accounts.record_auth_event(db, "password.changed", user.user, client_ip(request))
    db.commit()
    return Response(status_code=204)


@router.post("/password-reset", status_code=202)
def start_password_reset(payload: PasswordResetStart, request: Request, db: Session = Depends(get_db)):
    """Always answers 202 with the same body so callers cannot learn whether an account exists."""
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    accounts.request_password_reset(db, user, ip=client_ip(request), user_agent=request.headers.get("user-agent"))
    db.commit()
    return {"detail": "If an account matches that email, a reset link has been sent."}


@router.post("/password-reset/complete", status_code=204)
def finish_password_reset(payload: PasswordResetFinish, request: Request, db: Session = Depends(get_db)):
    accounts.complete_password_reset(db, payload.token, payload.password, ip=client_ip(request), user_agent=request.headers.get("user-agent"))
    db.commit()
    return Response(status_code=204)


@router.post("/signup", response_model=TokenOut, status_code=201)
def initial_signup(payload: InitialSignupRequest, request: Request, db: Session = Depends(get_db)):
    setup_key = get_settings().initial_setup_key
    if not setup_key:
        raise HTTPException(403, "First-time signup is disabled. Configure INITIAL_SETUP_KEY for initial setup.")
    if not hmac.compare_digest(payload.setup_key, setup_key):
        raise HTTPException(403, "The setup key is invalid")

    # Serialize first-user creation so simultaneous signup requests cannot create multiple bootstrap admins.
    db.execute(text("LOCK TABLE users IN EXCLUSIVE MODE"))
    if db.scalar(select(User.id).limit(1)):
        db.rollback()
        raise HTTPException(409, "Setup is already complete. Ask an administrator to create your account.")

    organization_name, site_name, full_name = payload.organization_name.strip(), payload.site_name.strip(), payload.full_name.strip()
    if not organization_name or not site_name or not full_name:
        raise HTTPException(422, "Organization, site, and full name are required")

    organization = Organization(name=organization_name)
    db.add(organization)
    db.flush()
    db.add(Site(organization_id=organization.id, name=site_name, settings=SiteSettings()))
    user = accounts.create_account(db, organization_id=organization.id, email=str(payload.email), full_name=full_name,
                                   password=payload.password, role=Role.super_admin, site_ids=None, actor_id=None)
    session = new_session(db, user, request.headers.get("user-agent"), client_ip(request))
    db.commit()
    return TokenOut(access_token=issue_token(user, session), user=user_out(user))
