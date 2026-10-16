"""Per-user notifications and the audit trail."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditLog, Notification, Role, Visit, utcnow
from ..schemas import AuditOut, NotificationOut
from ..security import Principal, current_user
from .common import own_host_ids

router = APIRouter(prefix="/api/v1", tags=["activity"])


@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(unread_only: bool = False, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    query = select(Notification).where(Notification.organization_id == user.organization_id, Notification.recipient_id == user.id,
                                       Notification.channel == "in_app")
    if unread_only:
        query = query.where(Notification.read.is_(False))
    return db.scalars(query.order_by(Notification.created_at.desc()).limit(100)).all()


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(notification_id: uuid.UUID, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    notification = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.organization_id == user.organization_id,
                                                        Notification.recipient_id == user.id, Notification.channel == "in_app"))
    if not notification:
        raise HTTPException(404, "Notification was not found")
    if not notification.read:
        notification.read, notification.read_at = True, utcnow()
    db.commit()
    db.refresh(notification)
    return notification


def audit_out(row: AuditLog) -> AuditOut:
    metadata = row.event_metadata or {}
    detail = metadata.get("detail") or ", ".join(f"{k}={v}" for k, v in sorted(metadata.items())) or None
    return AuditOut(id=row.id, action=row.action, entity_type=row.entity_type, entity_id=row.entity_id, site_id=row.site_id,
                    actor_user_id=row.actor_user_id, actor_device_id=row.actor_device_id, correlation_id=row.correlation_id,
                    metadata=metadata, created_at=row.created_at, event_type=row.action,
                    visit_id=row.entity_id if row.entity_type == "visit" else None, detail=detail)


@router.get("/audit", response_model=list[AuditOut])
def list_audit(entity_type: str | None = Query(default=None, max_length=40), entity_id: uuid.UUID | None = None,
               action: str | None = Query(default=None, max_length=80), actor_user_id: uuid.UUID | None = None,
               since: datetime | None = None, until: datetime | None = None,
               offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200), db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Super Admins see everything; others see their organization, limited to their sites; hosts see entries about their own visits."""
    user.require("audit.read", "Your role cannot view audit history")
    query = select(AuditLog)
    if user.role != Role.super_admin:
        query = query.where(AuditLog.organization_id == user.organization_id)
        if user.role == Role.host:
            query = query.where(AuditLog.entity_type == "visit", AuditLog.entity_id.in_(select(Visit.id).where(Visit.host_id.in_(own_host_ids(user)))))
        elif user.site_ids is not None:
            query = query.where(user.site_clause(AuditLog.site_id))
    for column, value in ((AuditLog.entity_type, entity_type), (AuditLog.entity_id, entity_id), (AuditLog.action, action),
                          (AuditLog.actor_user_id, actor_user_id)):
        if value:
            query = query.where(column == value)
    if since:
        query = query.where(AuditLog.created_at >= since)
    if until:
        query = query.where(AuditLog.created_at < until)
    return [audit_out(row) for row in db.scalars(query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)).all()]
