import hashlib
import uuid
import base64
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def issue_token(user: User) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": str(user.id), "exp": expires}, settings.jwt_secret, algorithm="HS256")


def digest_pass(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _pass_cipher() -> Fernet:
    material = hashlib.sha256((get_settings().jwt_secret + ":pass-encryption").encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def encrypt_pass(code: str) -> str:
    return _pass_cipher().encrypt(code.encode("utf-8")).decode("ascii")


def decrypt_pass(ciphertext: str) -> str:
    return _pass_cipher().decrypt(ciphertext.encode("ascii")).decode("utf-8")


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Valid sign-in required", headers={"WWW-Authenticate": "Bearer"})
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, get_settings().jwt_secret, algorithms=["HS256"])
        user_id = uuid.UUID(payload.get("sub", ""))
        user = db.get(User, user_id)
    except (jwt.PyJWTError, ValueError):
        raise unauthorized
    if not user or not user.is_active:
        raise unauthorized
    return user
