"""Idempotency-Key support for create endpoints that a kiosk or browser may retry after a network failure.

The key row is inserted in the same transaction as the work it protects. A concurrent duplicate blocks
on the primary key until the first transaction commits, then replays the stored response; a key reused
with a different body is rejected. Keys expire after KEY_TTL and are removed by the retention job.
"""
import hashlib
import json
from datetime import timedelta

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..models import IdempotencyKey, utcnow

KEY_TTL = timedelta(hours=24)


def claim(db: Session, scope: str, key: str | None, payload) -> dict | None:
    """Returns the stored response body for a replay, or None when the caller should do the work."""
    if not key:
        return None
    if len(key) > 120:
        raise HTTPException(422, "Idempotency-Key is too long")
    request_hash = hashlib.sha256(json.dumps(jsonable_encoder(payload), sort_keys=True).encode()).hexdigest()
    db.execute(insert(IdempotencyKey).values(scope=scope, key=key, request_hash=request_hash, expires_at=utcnow() + KEY_TTL)
               .on_conflict_do_nothing())
    row = db.get(IdempotencyKey, (scope, key), populate_existing=True)
    if row.request_hash != request_hash:
        raise HTTPException(422, "This Idempotency-Key was already used for a different request")
    return row.response_body


def store(db: Session, scope: str, key: str | None, status_code: int, body) -> None:
    if key:
        row = db.get(IdempotencyKey, (scope, key))
        row.response_status, row.response_body = status_code, jsonable_encoder(body)
