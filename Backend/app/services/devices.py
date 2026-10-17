"""Kiosk/device enrollment.

An administrator registers a device for a site and receives a one-time pairing code (valid
PAIRING_MINUTES). Entering the code on the kiosk exchanges it for a long-lived device key, which the
kiosk keeps and sends as `X-Device-Key`. Only keyed hashes of the code and key are stored. Re-pairing
issues a new code and invalidates the previous key; disabling a device rejects its key immediately.
"""
import secrets
import uuid
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import AuthenticationEvent, Device, Site, utcnow
from ..security import hash_token
from . import audit

PAIRING_MINUTES = 15
PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
FAILED_PAIRINGS_PER_IP = 10


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def new_pairing_code(db: Session, device: Device) -> str:
    code = "".join(secrets.choice(PAIRING_ALPHABET) for _ in range(8))
    device.pairing_code_hash = hash_token("pair:" + code)
    device.pairing_expires_at = utcnow() + timedelta(minutes=PAIRING_MINUTES)
    device.credential_hash = None
    device.status = "pending"
    device.enrolled_at = None
    return f"{code[:4]}-{code[4:]}"


def register(db: Session, *, site: Site, name: str, device_type: str, actor_id: uuid.UUID) -> tuple[Device, str]:
    if db.scalar(select(Device.id).where(Device.site_id == site.id, func.lower(Device.name) == name.strip().lower())):
        raise HTTPException(409, "A device with this name already exists at the site")
    device = Device(organization_id=site.organization_id, site_id=site.id, name=name.strip(), device_type=device_type, enrolled_by=actor_id)
    db.add(device)
    code = new_pairing_code(db, device)
    db.flush()
    audit.record(db, "device.registered", entity_type="device", entity_id=device.id, organization_id=site.organization_id, site_id=site.id,
                 actor_user_id=actor_id, device_type=device_type)
    return device, code


def pair(db: Session, code: str, ip: str | None) -> tuple[Device, str]:
    window = utcnow() - timedelta(minutes=15)
    if ip and db.scalar(select(func.count()).select_from(AuthenticationEvent).where(
            AuthenticationEvent.ip == ip, AuthenticationEvent.event_type == "device.pair_failed", AuthenticationEvent.occurred_at > window)) >= FAILED_PAIRINGS_PER_IP:
        raise HTTPException(429, "Too many pairing attempts. Please wait and try again.")
    device = db.scalar(select(Device).where(Device.pairing_code_hash == hash_token("pair:" + normalize_code(code))).with_for_update())
    if device is None or device.status != "pending" or device.pairing_expires_at is None or device.pairing_expires_at < utcnow():
        db.add(AuthenticationEvent(ip=ip, event_type="device.pair_failed"))
        db.commit()
        raise HTTPException(400, "That pairing code is invalid or has expired")
    key = secrets.token_urlsafe(32)
    device.credential_hash = hash_token(key)
    device.pairing_code_hash = None
    device.pairing_expires_at = None
    device.status = "active"
    device.enrolled_at = device.last_seen_at = utcnow()
    db.add(AuthenticationEvent(organization_id=device.organization_id, ip=ip, event_type="device.paired", event_metadata={"device_id": str(device.id)}))
    audit.record(db, "device.paired", entity_type="device", entity_id=device.id, organization_id=device.organization_id, site_id=device.site_id,
                 actor_device_id=device.id)
    return device, key


def disable(db: Session, device: Device, actor_id: uuid.UUID) -> None:
    device.status = "disabled"
    device.credential_hash = None
    device.pairing_code_hash = None
    device.pairing_expires_at = None
    audit.record(db, "device.disabled", entity_type="device", entity_id=device.id, organization_id=device.organization_id, site_id=device.site_id,
                 actor_user_id=actor_id)
