"""The single way to write audit_logs.

Each row says who (user or device), did what (action), to which entity, in which organization/site,
plus the request's correlation id and client IP. Metadata must stay non-sensitive: identifiers, field
names and outcomes are fine; passwords, tokens, OTPs, pass codes and free-form personal details are not.
"""
import contextvars
import uuid

from sqlalchemy.orm import Session

from ..models import AuditLog

request_ip: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_ip", default=None)
correlation_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("correlation_id", default=None)

FORBIDDEN_KEYS = {"password", "token", "otp", "pass_code", "code", "secret", "device_key"}


def record(db: Session, action: str, *, entity_type: str, entity_id: uuid.UUID | None = None,
           organization_id: uuid.UUID | None = None, site_id: uuid.UUID | None = None,
           actor_user_id: uuid.UUID | None = None, actor_device_id: uuid.UUID | None = None, **metadata) -> None:
    leaked = FORBIDDEN_KEYS & {key.lower() for key in metadata}
    if leaked:
        raise ValueError(f"Refusing to write secrets to the audit log: {sorted(leaked)}")
    db.add(AuditLog(
        organization_id=organization_id, actor_user_id=actor_user_id, actor_device_id=actor_device_id, action=action,
        entity_type=entity_type, entity_id=entity_id, site_id=site_id, correlation_id=correlation_id.get(), ip=request_ip.get(),
        event_metadata={k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in metadata.items() if v is not None},
    ))
