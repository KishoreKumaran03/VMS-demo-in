"""Run once after restoring a backup and before reopening the system.

A restored database is a copy of the past. This command:
1. signs everyone out (sessions issued before the restore must not keep working),
2. runs retention, so personal data that had already been anonymized or deleted after the backup was
   taken is removed again (retention is state-driven, so it catches everything now past policy),
3. runs the visit sweeps (no-shows, overdue visitors) for the time the system was down,
4. writes an audit entry.

    docker compose exec api python -m app.restore_reconcile --backup-taken-at 2026-10-16T02:00:00Z --reason "Disk failure, ticket OPS-77"

Records created after the backup was taken (new visits, blacklist entries, merges) are not in the
restored database and must be re-entered; see docs/OPERATIONS.md.
"""
import argparse
from datetime import datetime

from sqlalchemy import update

from .database import SessionLocal
from .jobs import JOBS, run_job
from .models import UserSession, utcnow
from .services import audit


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--backup-taken-at", required=True, type=datetime.fromisoformat)
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()

    with SessionLocal() as db:
        revoked = db.execute(update(UserSession).where(UserSession.revoked_at.is_(None))
                             .values(revoked_at=utcnow(), revoke_reason="restore")).rowcount
        db.commit()
    results = {"sessions_revoked": revoked}
    for name in ("retention", "visit_sweeps", "blacklist_maintenance"):
        run = run_job(next(job for job in JOBS if job.name == name))
        results[name] = {"status": run.status, **run.counts} if run else "skipped (locked)"
    with SessionLocal() as db:
        audit.record(db, "system.restore_reconciled", entity_type="system", backup_taken_at=args.backup_taken_at.isoformat(),
                     reason=args.reason[:500], sessions_revoked=revoked)
        db.commit()
    for key, value in results.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
