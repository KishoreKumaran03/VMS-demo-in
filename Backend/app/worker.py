"""Background worker: runs the scheduled jobs in app/jobs.py.

    python -m app.worker             # run forever (the Compose `worker` service)
    python -m app.worker --once JOB  # run one job now, e.g. --once retention --dry-run

Run one worker per deployment; more are safe (advisory locks stop duplicate runs) but unnecessary.
"""
import argparse
import logging
import signal
import time
from datetime import datetime, timedelta, timezone

from .jobs import JOBS, ran_since, run_job
from .models import utcnow

logger = logging.getLogger("visitorhub.worker")


def loop() -> None:
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True
        logger.info("Worker stopping")

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    next_run = {job.name: utcnow() for job in JOBS}
    logger.info("Worker started with jobs: %s", ", ".join(job.name for job in JOBS))
    while not stopping:
        now = utcnow()
        for job in JOBS:
            if stopping or now < next_run[job.name]:
                continue
            if job.daily_at is None:
                next_run[job.name] = now + job.every
                run_job(job)
                continue
            # Daily job: run once after its time of day; checked each minute, and a missed day is caught up on start.
            next_run[job.name] = now + timedelta(minutes=1)
            scheduled = datetime.combine(now.date(), job.daily_at, tzinfo=timezone.utc)
            if now >= scheduled and not ran_since(job, scheduled):
                run_job(job)
        time.sleep(1)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--once", metavar="JOB", choices=[job.name for job in JOBS])
    parser.add_argument("--dry-run", action="store_true", help="Only for jobs that support it (retention)")
    args = parser.parse_args()
    if args.once:
        job = next(job for job in JOBS if job.name == args.once)
        run = run_job(job, **({"dry_run": True} if args.dry_run else {}))
        if run is None:
            print("Nothing to record (or another worker is running this job).")
            return 0
        print(f"{job.name}: {run.status} {run.counts}{' ' + run.error if run.error else ''}")
        return 0 if run.status == "succeeded" else 1
    loop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
