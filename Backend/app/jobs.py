"""Scheduled jobs run by the worker (`python -m app.worker`) and by tests.

Each job receives a session, does bounded work, and returns counts for `job_runs`. `run_job` wraps a job
with a PostgreSQL advisory lock (two workers never run the same job concurrently), a job_runs row, and
failure capture, so an operator can see the last success of every job (GET /api/v1/ops/health).
"""
import logging
import zlib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import time, timedelta

from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import AuditLog, BlacklistEntry, JobRun, utcnow
from .services import audit, notify, outbox, retention
from .services import visits as lifecycle

logger = logging.getLogger("visitorhub.jobs")


@dataclass(frozen=True)
class Job:
    name: str
    every: timedelta
    run: Callable[..., dict]
    record_idle_runs: bool = True  # high-frequency jobs only record runs that did something
    daily_at: time | None = None   # UTC time for once-a-day jobs (then `every` is the staleness interval)


def outbox_job(db: Session) -> dict:
    return outbox.process_batch(db, {"notification.deliver": notify.deliver_notification})


def visit_sweeps(db: Session) -> dict:
    counts = {"no_shows": lifecycle.mark_no_shows(db), "overdue_escalations": lifecycle.escalate_overdue(db)}
    return counts


def blacklist_maintenance(db: Session) -> dict:
    now = utcnow()
    expired = db.execute(update(BlacklistEntry).where(BlacklistEntry.status == "active", BlacklistEntry.effective_until <= now)
                         .values(status="expired")).rowcount
    reminded = 0
    for entry in db.scalars(select(BlacklistEntry).where(BlacklistEntry.status == "active", BlacklistEntry.review_due_at <= now)).all():
        recent = db.scalar(select(AuditLog.id).where(AuditLog.action == "blacklist.review_reminder", AuditLog.entity_id == entry.id,
                                                     AuditLog.created_at > now - timedelta(days=7)).limit(1))
        if recent:
            continue
        notify.notify(db, organization_id=entry.organization_id, recipient_id=entry.created_by, kind="blacklist_review",
                      title="Restricted-entry record due for review",
                      message="A restricted-entry record you created has reached its review date. Confirm, change or lift it.")
        audit.record(db, "blacklist.review_reminder", entity_type="blacklist_entry", entity_id=entry.id, organization_id=entry.organization_id,
                     site_id=entry.site_id)
        reminded += 1
    return {"expired": expired, "review_reminders": reminded}


def retention_job(db: Session, dry_run: bool = False) -> dict:
    return retention.run(db, dry_run=dry_run)


JOBS: list[Job] = [
    Job("outbox", timedelta(seconds=5), outbox_job, record_idle_runs=False),
    Job("visit_sweeps", timedelta(minutes=1), visit_sweeps),
    Job("blacklist_maintenance", timedelta(hours=1), blacklist_maintenance),
    # After the 02:00 UTC backup, so the newest backup still holds what this run removes.
    Job("retention", timedelta(hours=12), retention_job, daily_at=time(2, 30)),
]


def ran_since(job: Job, moment) -> bool:
    with SessionLocal() as db:
        return db.scalar(select(JobRun.id).where(JobRun.job_name == job.name, JobRun.started_at >= moment, JobRun.dry_run.is_(False)).limit(1)) is not None


def run_job(job: Job, **kwargs) -> JobRun | None:
    """Runs one job once. Returns the job_runs row, or None when another worker holds the lock or nothing was worth recording."""
    with SessionLocal() as db:
        lock_key = zlib.crc32(job.name.encode())
        if not db.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": lock_key}):
            return None
        try:
            started = utcnow()
            try:
                counts = job.run(db, **kwargs) or {}
                db.commit()
                status, error = "succeeded", None
            except Exception as exc:
                db.rollback()
                logger.exception("Job %s failed", job.name)
                counts, status, error = {}, "failed", f"{type(exc).__name__}: {exc}"[:1000]
            if status == "succeeded" and not job.record_idle_runs and not any(counts.values()):
                return None
            run = JobRun(job_name=job.name, started_at=started, finished_at=utcnow(), status=status, counts=counts, error=error,
                         dry_run=bool(kwargs.get("dry_run")))
            db.add(run)
            db.commit()
            return run
        finally:
            db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": lock_key})
            db.commit()
