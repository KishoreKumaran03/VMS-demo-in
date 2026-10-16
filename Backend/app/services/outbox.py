"""Transactional outbox.

`emit()` adds an event in the caller's transaction, so it exists if and only if the business change
committed. The worker calls `process_batch()`: rows are claimed with FOR UPDATE SKIP LOCKED (several
workers never take the same row), each row is handled and marked individually, failures are retried
with exponential backoff and jitter, and a row that keeps failing is dead-lettered for an operator.
Handlers must be idempotent: a crash after a handler ran but before commit means it runs again.
"""
import logging
import random
import uuid
from collections.abc import Callable
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import OutboxEvent, utcnow

logger = logging.getLogger("visitorhub.outbox")
MAX_ATTEMPTS = 10
Handler = Callable[[Session, OutboxEvent], None]


class RetryLater(Exception):
    """Raised by a handler that recorded its own failure (e.g. a delivery attempt) and wants a retry.
    Unlike other exceptions, the handler's writes are kept."""


def emit(db: Session, event_type: str, *, aggregate_type: str, aggregate_id: uuid.UUID, organization_id: uuid.UUID | None,
         aggregate_version: int | None = None, payload: dict | None = None) -> OutboxEvent:
    """Payloads carry identifiers and changed fields only, never secrets or contact details."""
    event = OutboxEvent(event_type=event_type, aggregate_type=aggregate_type, aggregate_id=aggregate_id, aggregate_version=aggregate_version,
                        organization_id=organization_id, payload=payload or {})
    db.add(event)
    return event


def backoff(attempts: int) -> timedelta:
    return timedelta(seconds=min(2 ** attempts, 3600) * random.uniform(0.5, 1.5))


def process_batch(db: Session, handlers: dict[str, Handler], limit: int = 100) -> dict[str, int]:
    counts = {"processed": 0, "retried": 0, "dead_lettered": 0}
    events = db.scalars(
        select(OutboxEvent).where(OutboxEvent.processed_at.is_(None), OutboxEvent.dead_lettered_at.is_(None), OutboxEvent.available_at <= utcnow())
        .order_by(OutboxEvent.id).limit(limit).with_for_update(skip_locked=True)
    ).all()
    for event in events:
        handler = handlers.get(event.event_type)
        savepoint = db.begin_nested()
        try:
            if handler:
                handler(db, event)
            savepoint.commit()
            event.processed_at = utcnow()
            counts["processed"] += 1
        except Exception as exc:  # one bad event must not block the rest of the batch
            if isinstance(exc, RetryLater):
                savepoint.commit()
            else:
                savepoint.rollback()
            event.attempts += 1
            event.last_error = f"{type(exc).__name__}: {exc}"[:500]
            if event.attempts >= MAX_ATTEMPTS:
                event.dead_lettered_at = utcnow()
                counts["dead_lettered"] += 1
                logger.error("Outbox event %s (%s) dead-lettered: %s", event.id, event.event_type, event.last_error)
            else:
                event.available_at = utcnow() + backoff(event.attempts)
                counts["retried"] += 1
    db.commit()
    return counts


def requeue_dead_letters(db: Session, event_ids: list[int]) -> int:
    """Operator action after fixing the cause of a failure."""
    events = db.scalars(select(OutboxEvent).where(OutboxEvent.id.in_(event_ids), OutboxEvent.dead_lettered_at.is_not(None))).all()
    for event in events:
        event.dead_lettered_at, event.attempts, event.available_at = None, 0, utcnow()
    return len(events)
