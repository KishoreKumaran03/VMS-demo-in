"""Kiosk and scanner registration for administrators."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device, Role
from ..schemas import DeviceCreate, DeviceOut, DevicePairingOut
from ..security import Principal, current_user
from ..services import devices
from .common import audit, scoped_site

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


def manageable_device(db: Session, user: Principal, device_id: uuid.UUID) -> Device:
    device = db.get(Device, device_id)
    if not device or (user.role != Role.super_admin and (device.organization_id != user.organization_id or not user.in_site(device.site_id))):
        raise HTTPException(404, "Device was not found")
    return device


@router.get("", response_model=list[DeviceOut])
def list_devices(site_id: uuid.UUID | None = None, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("device.manage", "Your role cannot manage devices")
    query = select(Device).where(Device.status != "retired")
    if user.role != Role.super_admin:
        query = query.where(Device.organization_id == user.organization_id, user.site_clause(Device.site_id))
    if site_id:
        query = query.where(Device.site_id == site_id)
    return db.scalars(query.order_by(Device.name)).all()


@router.post("", response_model=DevicePairingOut, status_code=201)
def register_device(payload: DeviceCreate, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Registers a device and returns a pairing code to type into it. The code works once, for 15 minutes."""
    user.require("device.manage", "Your role cannot manage devices")
    site = scoped_site(db, user, payload.site_id)
    device, code = devices.register(db, site=site, name=payload.name, device_type=payload.device_type, actor_id=user.id)
    db.commit()
    return DevicePairingOut(device=DeviceOut.model_validate(device), pairing_code=code, pairing_expires_at=device.pairing_expires_at)


@router.post("/{device_id}/pairing-code", response_model=DevicePairingOut)
def new_pairing_code(device_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Re-pair a device (for example after replacing the tablet). Its current key stops working immediately."""
    user.require("device.manage", "Your role cannot manage devices")
    device = manageable_device(db, user, device_id)
    code = devices.new_pairing_code(db, device)
    audit(db, user, "device.repairing", entity_type="device", entity_id=device.id, organization_id=device.organization_id, site_id=device.site_id)
    db.commit()
    return DevicePairingOut(device=DeviceOut.model_validate(device), pairing_code=code, pairing_expires_at=device.pairing_expires_at)


@router.delete("/{device_id}", status_code=204)
def disable_device(device_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("device.manage", "Your role cannot manage devices")
    devices.disable(db, manageable_device(db, user, device_id), user.id)
    db.commit()
    return Response(status_code=204)
