"""Operational health for platform administrators: job freshness, outbox backlog, delivery failures."""
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..jobs import JOBS
from ..config import get_settings
from ..models import BackupRun, JobRun, Notification, OutboxEvent, utcnow
from ..security import Principal, current_user
from ..services import outbox, retention

router = APIRouter(prefix="/api/v1/ops", tags=["ops"])

# A job is stale when its last success is older than this many of its intervals (plus a minute of slack).
STALE_FACTOR = 3
OUTBOX_LAG_ALERT = timedelta(minutes=5)
BACKUP_MAX_AGE = timedelta(hours=26)        # daily backups, with slack
RESTORE_TEST_MAX_AGE = timedelta(days=8)    # weekly restore tests, with slack
RETENTION_BACKLOG_DAYS = 7


class Requeue(BaseModel):
    event_ids: list[int] = Field(min_length=1, max_length=500)


def job_health(db: Session) -> list[dict]:
    now, rows = utcnow(), []
    for job in JOBS:
        last = db.scalar(select(JobRun).where(JobRun.job_name == job.name).order_by(JobRun.started_at.desc()).limit(1))
        last_ok = db.scalar(select(func.max(JobRun.finished_at)).where(JobRun.job_name == job.name, JobRun.status == "succeeded", JobRun.dry_run.is_(False)))
        allowed = timedelta(hours=36) if job.daily_at else job.every * STALE_FACTOR + timedelta(minutes=1)
        stale = job.record_idle_runs and (last_ok is None or now - last_ok > allowed)
        rows.append({"job": job.name, "last_status": last.status if last else None, "last_run_at": last.started_at if last else None,
                     "last_success_at": last_ok, "last_error": last.error if last and last.status == "failed" else None, "stale": stale})
    return rows


@router.get("/health")
def ops_health(db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("organization.manage", "Only platform administrators can view operational health")
    now = utcnow()
    pending = select(OutboxEvent).where(OutboxEvent.processed_at.is_(None), OutboxEvent.dead_lettered_at.is_(None))
    oldest = db.scalar(select(func.min(OutboxEvent.created_at)).where(OutboxEvent.processed_at.is_(None), OutboxEvent.dead_lettered_at.is_(None)))
    jobs = job_health(db)
    outbox_state = {
        "pending": db.scalar(select(func.count()).select_from(pending.subquery())),
        "oldest_pending_seconds": int((now - oldest).total_seconds()) if oldest else 0,
        "dead_lettered": db.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.dead_lettered_at.is_not(None))),
    }
    failed_notifications = db.scalar(select(func.count()).select_from(Notification).where(Notification.status == "failed",
                                                                                         Notification.created_at > now - timedelta(days=1)))
    problems = [f"job {j['job']} is stale or failing" for j in jobs if j["stale"] or j["last_status"] == "failed"]
    if oldest and now - oldest > OUTBOX_LAG_ALERT:
        problems.append("outbox is lagging")
    if outbox_state["dead_lettered"]:
        problems.append("outbox has dead-lettered events")

    def last(kind, status=None):
        query = select(BackupRun).where(BackupRun.kind == kind)
        if status:
            query = query.where(BackupRun.status == status)
        return db.scalar(query.order_by(BackupRun.started_at.desc()).limit(1))

    last_backup, last_ok_backup, last_restore = last("full"), last("full", "succeeded"), last("restore_test", "succeeded")
    backups = {"last_status": last_backup.status if last_backup else None, "last_success_at": last_ok_backup.finished_at if last_ok_backup else None,
               "last_error": last_backup.error if last_backup and last_backup.status == "failed" else None,
               "last_restore_test_at": last_restore.finished_at if last_restore else None}
    production = get_settings().app_env == "production"
    if last_ok_backup is None:
        if production:
            problems.append("no successful database backup has been recorded")
    elif now - last_ok_backup.finished_at > BACKUP_MAX_AGE:
        problems.append("the last successful backup is more than 26 hours old")
    if last_backup and last_backup.status == "failed":
        problems.append("the most recent backup failed")
    if production and (last_restore is None or now - last_restore.finished_at > RESTORE_TEST_MAX_AGE):
        problems.append("no restore test in the last 8 days")
    backlog = retention.oldest_overdue_visit_days(db, now)
    if backlog > RETENTION_BACKLOG_DAYS:
        problems.append(f"retention is {backlog} days behind")
    return {"status": "degraded" if problems else "ok", "problems": problems, "jobs": jobs, "outbox": outbox_state, "backups": backups,
            "retention_backlog_days": backlog, "failed_notifications_24h": failed_notifications, "checked_at": now}


@router.post("/outbox/requeue")
def requeue(payload: Requeue, db: Session = Depends(get_db), user: Principal = Depends(current_user)):
    user.require("organization.manage", "Only platform administrators can requeue events")
    count = outbox.requeue_dead_letters(db, payload.event_ids)
    db.commit()
    return {"requeued": count}
