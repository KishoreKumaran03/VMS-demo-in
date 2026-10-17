"""Incremental synchronization feed for downstream systems (reporting, SIEM, replicas).

Pull model: the consumer keeps its own cursor and advances it only after durably storing a batch, so
nothing here needs to know about consumers. Rules for consumers (docs/BACKEND.md, "Synchronization"):
- Page with `after=<last id you stored>`; ids are monotonic and every event has a stable `event_id`
  (deduplicate on it) and the entity `aggregate_version` (ignore anything older than what you hold).
- Events younger than SAFETY_LAG are withheld: an outbox id is assigned at insert time, so a slower
  transaction could otherwise commit a lower id after you had read past it.
- Reconcile periodically with /sync/visits (versions by id). Never use synchronized copies for
  entry decisions: pass validity and blacklist checks always read the primary database.
- Processed events are deleted after the `outbox_event` retention period (default 1 month); a consumer
  further behind than that must re-baseline from /sync/visits.
Payloads contain identifiers and states only, never names, contact details, tokens or pass codes.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import OutboxEvent, Role, Visit, utcnow
from ..security import Principal, current_user

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])
SAFETY_LAG = timedelta(seconds=10)


def org_filter(user: Principal, column):
    return None if user.role == Role.super_admin else column == user.organization_id


@router.get("/events")
def changes(after: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=1000), db: Session = Depends(get_db),
            user: Principal = Depends(current_user)):
    user.require("organization.manage", "Only platform administrators can read the change feed")
    query = select(OutboxEvent).where(OutboxEvent.id > after, OutboxEvent.created_at < utcnow() - SAFETY_LAG)
    if (scope := org_filter(user, OutboxEvent.organization_id)) is not None:
        query = query.where(scope)
    rows = db.scalars(query.order_by(OutboxEvent.id).limit(limit)).all()
    return {
        "events": [{"id": e.id, "event_id": e.event_id, "event_type": e.event_type, "aggregate_type": e.aggregate_type,
                    "aggregate_id": e.aggregate_id, "aggregate_version": e.aggregate_version, "organization_id": e.organization_id,
                    "payload": e.payload, "created_at": e.created_at} for e in rows],
        "next_cursor": rows[-1].id if rows else after,
        "has_more": len(rows) == limit,
    }


@router.get("/visits")
def visit_versions(updated_after: datetime | None = None, after_id: uuid.UUID | None = None, limit: int = Query(500, ge=1, le=1000),
                   db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    """Reconciliation snapshot: current version and state of each visit, keyset-paginated by (updated_at, id)."""
    user.require("organization.manage", "Only platform administrators can read the reconciliation feed")
    query = select(Visit.id, Visit.version, Visit.status, Visit.organization_id, Visit.site_id, Visit.host_id, Visit.starts_at, Visit.ends_at,
                   Visit.updated_at, Visit.anonymized_at)
    if (scope := org_filter(user, Visit.organization_id)) is not None:
        query = query.where(scope)
    if updated_after is not None:
        query = query.where(tuple_(Visit.updated_at, Visit.id) > tuple_(updated_after, after_id or uuid.UUID(int=0)))
    rows = db.execute(query.order_by(Visit.updated_at, Visit.id).limit(limit)).all()
    items = [dict(row._mapping) | {"anonymized": row.anonymized_at is not None} for row in rows]
    for item in items:
        item.pop("anonymized_at")
    last = rows[-1] if rows else None
    return {"visits": items, "next": {"updated_after": last.updated_at, "after_id": last.id} if last else None, "has_more": len(rows) == limit}
