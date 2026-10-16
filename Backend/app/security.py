import base64
import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import ColumnElement, select, true
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import Device, Role, Site, User, UserSession, utcnow

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
# Verified against when the login email is unknown, so response time does not reveal whether an account exists.
_DUMMY_HASH = password_hash.hash("timing-equalisation-placeholder")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str | None) -> tuple[bool, str | None]:
    """Return (valid, upgraded_hash). upgraded_hash is set when the stored hash uses outdated parameters."""
    if hashed is None:
        password_hash.verify(password, _DUMMY_HASH)
        return False, None
    return password_hash.verify_and_update(password, hashed)


def hash_token(token: str) -> str:
    """Keyed hash for high-entropy bearer tokens (reset links). Not for passwords."""
    return hmac.new(get_settings().token_pepper.encode(), token.encode(), hashlib.sha256).hexdigest()


def issue_token(user: User, session: UserSession) -> str:
    return jwt.encode({"sub": str(user.id), "sid": str(session.id), "exp": session.expires_at}, get_settings().jwt_secret, algorithm="HS256")


def new_session(db: Session, user: User, user_agent: str | None, ip: str | None) -> UserSession:
    session = UserSession(user_id=user.id, expires_at=utcnow() + timedelta(minutes=get_settings().access_token_minutes),
                          user_agent=(user_agent or "")[:300] or None, ip=ip)
    db.add(session)
    db.flush()
    return session


def revoke_sessions(db: Session, user_id: uuid.UUID, reason: str, keep: uuid.UUID | None = None) -> None:
    query = select(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if keep:
        query = query.where(UserSession.id != keep)
    for session in db.scalars(query):
        session.revoked_at = utcnow()
        session.revoke_reason = reason


def digest_pass(code: str) -> str:
    """Lookup hash for a QR pass token. Tokens carry 256 bits of randomness, so a plain SHA-256 cannot be brute-forced."""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _pass_cipher() -> Fernet:
    material = hashlib.sha256((get_settings().pass_encryption_key + ":pass-token").encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def encrypt_pass(code: str) -> str:
    return _pass_cipher().encrypt(code.encode("utf-8")).decode("ascii")


def decrypt_pass(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    try:
        return _pass_cipher().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken:
        return None  # key rotated: the pass still validates by hash but cannot be re-displayed


@dataclass(frozen=True)
class Principal:
    """The signed-in user with their effective role and site scope, resolved from user_roles.

    site_ids is None when the role is not limited to particular sites (super-admin, or an
    organization-wide site-admin); otherwise it is the set of sites the role applies to.
    """

    user: User
    session_id: uuid.UUID | None
    role: Role
    site_ids: frozenset[uuid.UUID] | None
    permissions: frozenset[str]

    @property
    def id(self) -> uuid.UUID:
        return self.user.id

    @property
    def email(self) -> str:
        return self.user.email

    @property
    def organization_id(self) -> uuid.UUID:
        return self.user.organization_id

    @property
    def primary_site_id(self) -> uuid.UUID | None:
        """The single site for single-site staff; None for org-wide or multi-site roles."""
        return next(iter(self.site_ids)) if self.site_ids is not None and len(self.site_ids) == 1 else None

    def can(self, permission: str) -> bool:
        return permission in self.permissions

    def require(self, permission: str, message: str) -> None:
        if permission not in self.permissions:
            raise HTTPException(status.HTTP_403_FORBIDDEN, message)

    def in_site(self, site_id: uuid.UUID | None) -> bool:
        return self.site_ids is None or site_id in self.site_ids

    def site_clause(self, column) -> ColumnElement[bool]:
        return true() if self.site_ids is None else column.in_(self.site_ids)


def effective_access(user: User) -> tuple[Role, frozenset[uuid.UUID] | None, frozenset[str]] | None:
    """Pick the highest-priority role; scope is every site that role is assigned at (None = unrestricted)."""
    if not user.role_assignments:
        return None
    top = max(user.role_assignments, key=lambda assignment: assignment.role.priority)
    same_role = [a for a in user.role_assignments if a.role_id == top.role_id]
    site_ids = None if any(a.site_id is None for a in same_role) else frozenset(a.site_id for a in same_role)
    return Role(top.role.code), site_ids, frozenset(p.code for p in top.role.permissions)


def principal_for(user: User, session_id: uuid.UUID | None = None) -> Principal | None:
    access = effective_access(user)
    if access is None:
        return None
    role, site_ids, permissions = access
    return Principal(user=user, session_id=session_id, role=role, site_ids=site_ids, permissions=permissions)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Principal:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Valid sign-in required", headers={"WWW-Authenticate": "Bearer"})
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, get_settings().jwt_secret, algorithms=["HS256"])
        user_id = uuid.UUID(payload.get("sub", ""))
        session_id = uuid.UUID(payload.get("sid", ""))
    except (jwt.PyJWTError, ValueError):
        raise unauthorized
    session = db.get(UserSession, session_id)
    if not session or session.user_id != user_id or session.revoked_at is not None or session.expires_at <= datetime.now(timezone.utc):
        raise unauthorized
    user = db.get(User, user_id)
    principal = principal_for(user, session.id) if user and user.is_active else None
    if principal is None:
        raise unauthorized
    return principal


def current_device(x_device_key: str | None = Header(default=None), db: Session = Depends(get_db)) -> Device:
    """Authenticates a paired kiosk. The device key is shown once at pairing and stored only as a keyed hash."""
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "This kiosk is not paired. Ask an administrator to pair it.")
    if not x_device_key or len(x_device_key) > 200:
        raise unauthorized
    device = db.scalar(select(Device).where(Device.credential_hash == hash_token(x_device_key)))
    if device is None or device.status != "active":
        raise unauthorized
    site = db.get(Site, device.site_id)
    if site is None or not site.is_active:
        raise unauthorized
    now = utcnow()
    if device.last_seen_at is None or now - device.last_seen_at > timedelta(minutes=1):
        device.last_seen_at = now
        db.commit()
    return device
