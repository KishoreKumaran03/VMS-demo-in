"""Retention: anonymize completed visits and delete aged operational records according to `retention_policies`.

How a visit is processed (docs/BACKEND.md, "Retention"):
1. Only visits with `retention_eligible_at` (set when a visit reaches a terminal status) and no `anonymized_at`.
   Active visits never qualify.
2. Class: `security_visit` if it has a non-rejected blacklist match or a security decision, else `ordinary_visit`.
   The policy is resolved site -> organization -> platform default; the cutoff is calendar months.
3. Skipped while a retention hold exists on the visit or on its visitor.
4. In one transaction per batch: add the visit to de-identified `visit_daily_stats`; delete its events, pass,
   pass scans, notifications, blacklist matches and security decisions; re-point the visit and its invitation to
   the organization's "Anonymized visitor" record and blank purpose/consent fields; then anonymize any visitor
   left with no identifiable history (no account, host entry, active blacklist entry, hold, or remaining visit).
5. One audit row per batch with counts only.

The job is idempotent and state-driven: rerunning it, or running it after a crash or a backup restore,
just processes whatever is eligible now. `dry_run=True` does all the work and rolls it back, so the counts
are exact. Records in backups are not touched; they age out with the backup retention (see docs).
"""
import calendar
import uuid
from datetime import datetime, timedelta

from sqlalchemy import and_, delete, exists, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..models import (
    AuditLog, AuthenticationEvent, BlacklistEntry, BlacklistMatch, Host, IdempotencyKey, Invitation, JobRun, Notification, Organization,
    OutboxEvent, Pass, PassScan, Person, PersonContact, RetentionHold, RetentionPolicy, SecurityApproval, TERMINAL_STATUSES, User,
    Visit, VisitDailyStat, VisitEvent, VisitorProfile, utcnow,
)
from . import audit, notify

SENTINEL_NAMESPACE = uuid.UUID("6f1f6a52-8c1d-4f4a-9c39-3f0a3e3b2a10")
SENTINEL_NAME = "Anonymized visitor"
BATCH_SIZE = 500
MAX_BATCHES = 40
DELETE_CHUNK = 5000


def add_months(moment: datetime, months: int) -> datetime:
    month_index = moment.month - 1 + months
    year, month = moment.year + month_index // 12, month_index % 12 + 1
    return moment.replace(year=year, month=month, day=min(moment.day, calendar.monthrange(year, month)[1]))


def allow_history_changes(db: Session) -> None:
    """Lets this transaction delete from the append-only tables (see migration 0007)."""
    db.execute(text("SET LOCAL vms.allow_history_changes = 'on'"))


class PolicyBook:
    def __init__(self, db: Session):
        self.rows = {(p.organization_id, p.site_id, p.record_class): p for p in db.scalars(select(RetentionPolicy)).all()}

    def get(self, record_class: str, organization_id: uuid.UUID | None = None, site_id: uuid.UUID | None = None) -> RetentionPolicy:
        """Most specific policy wins: site, then organization, then the platform default."""
        for key in ((organization_id, site_id, record_class), (organization_id, None, record_class), (None, None, record_class)):
            if key in self.rows:
                return self.rows[key]
        raise LookupError(f"No retention policy for {record_class}")

    def shortest(self, *classes: str) -> int:
        months = [p.retain_months for (_, _, c), p in self.rows.items() if c in classes]
        if not months:
            raise LookupError(f"No retention policy configured for {', '.join(classes)}")
        return min(months)


def sentinel(db: Session, organization_id: uuid.UUID) -> uuid.UUID:
    person_id = uuid.uuid5(SENTINEL_NAMESPACE, str(organization_id))
    db.execute(pg_insert(Person).values(id=person_id, organization_id=organization_id, full_name=SENTINEL_NAME, identity_status="anonymized",
                                        anonymized_at=utcnow(), version=1).on_conflict_do_nothing(index_elements=["id"]))
    return person_id


def held(db: Session) -> tuple[set[uuid.UUID], set[uuid.UUID]]:
    rows = db.execute(select(RetentionHold.entity_type, RetentionHold.entity_id).where(RetentionHold.released_at.is_(None))).all()
    return {e for t, e in rows if t == "visit"}, {e for t, e in rows if t == "person"}


def security_visit_ids(db: Session, visit_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    matched = select(BlacklistMatch.visit_id).where(BlacklistMatch.visit_id.in_(visit_ids), BlacklistMatch.confidence != "rejected")
    decided = select(SecurityApproval.visit_id).where(SecurityApproval.visit_id.in_(visit_ids))
    return set(db.scalars(matched.union(decided)).all())


def purge_visits(db: Session, now: datetime, dry_run: bool) -> dict:
    book = PolicyBook(db)
    held_visits, held_people = held(db)
    earliest_cutoff = add_months(now, -book.shortest("ordinary_visit", "security_visit"))
    counts = {"visits_anonymized": 0, "visits_held": 0, "people_anonymized": 0, "visit_events_deleted": 0, "visit_passes_deleted": 0,
              "visit_notifications_deleted": 0}
    skipped: set[uuid.UUID] = set()
    for _ in range(MAX_BATCHES):
        allow_history_changes(db)
        query = (select(Visit).where(Visit.retention_eligible_at < earliest_cutoff, Visit.anonymized_at.is_(None),
                                     Visit.status.in_([s.value for s in TERMINAL_STATUSES]))
                 .order_by(Visit.retention_eligible_at).limit(BATCH_SIZE).with_for_update(skip_locked=True))
        if skipped:
            query = query.where(Visit.id.not_in(skipped))
        candidates = db.scalars(query).all()
        if not candidates:
            break
        security = security_visit_ids(db, [v.id for v in candidates])
        due, policies_used = [], set()
        for visit in candidates:
            policy = book.get("security_visit" if visit.id in security else "ordinary_visit", visit.organization_id, visit.site_id)
            if visit.id in held_visits or visit.visitor_person_id in held_people:
                counts["visits_held"] += 1
                skipped.add(visit.id)
            elif visit.retention_eligible_at >= add_months(now, -policy.retain_months):
                skipped.add(visit.id)
            else:
                due.append(visit)
                policies_used.add(str(policy.id))
        if due:
            batch_counts = anonymize_batch(db, due, now)
            for key, value in batch_counts.items():
                counts[key] += value
            for organization_id in {v.organization_id for v in due}:
                in_org = [v for v in due if v.organization_id == organization_id]
                audit.record(db, "retention.visits_anonymized", entity_type="organization", entity_id=organization_id,
                             organization_id=organization_id, visits=len(in_org), policies=sorted(policies_used), dry_run=dry_run)
        if not dry_run:
            db.commit()
    return counts


def anonymize_batch(db: Session, visits: list[Visit], now: datetime) -> dict:
    ids = [v.id for v in visits]
    people = {v.visitor_person_id for v in visits}
    # 1. De-identified statistics survive the purge.
    day = func.date(func.coalesce(Visit.checked_in_at, Visit.starts_at))
    minutes = func.coalesce(func.sum(func.extract("epoch", Visit.checked_out_at - Visit.checked_in_at) / 60), 0).cast(VisitDailyStat.total_minutes_on_site.type)
    stats = (select(Visit.organization_id, Visit.site_id, day, Visit.source, Visit.category, Visit.status, func.count(), minutes)
             .where(Visit.id.in_(ids)).group_by(Visit.organization_id, Visit.site_id, day, Visit.source, Visit.category, Visit.status))
    upsert = pg_insert(VisitDailyStat).from_select(
        ["organization_id", "site_id", "day", "source", "category", "final_status", "visits", "total_minutes_on_site"], stats)
    db.execute(upsert.on_conflict_do_update(
        index_elements=["site_id", "day", "source", "category", "final_status"],
        set_={"visits": VisitDailyStat.visits + upsert.excluded.visits,
              "total_minutes_on_site": VisitDailyStat.total_minutes_on_site + upsert.excluded.total_minutes_on_site}))
    # 2. Dependent records, children first.
    pass_ids = select(Pass.id).where(Pass.visit_id.in_(ids))
    events = db.execute(delete(VisitEvent).where(VisitEvent.visit_id.in_(ids))).rowcount
    db.execute(delete(PassScan).where(PassScan.pass_id.in_(pass_ids)))
    passes = db.execute(delete(Pass).where(Pass.visit_id.in_(ids))).rowcount
    notifications = db.execute(delete(Notification).where(Notification.visit_id.in_(ids))).rowcount
    db.execute(delete(BlacklistMatch).where(BlacklistMatch.visit_id.in_(ids)))
    db.execute(delete(SecurityApproval).where(SecurityApproval.visit_id.in_(ids)))
    # 3. The visit rows stay for referential integrity and counts, without personal data.
    for organization_id in {v.organization_id for v in visits}:
        anonymous = sentinel(db, organization_id)
        org_ids = [v.id for v in visits if v.organization_id == organization_id]
        db.execute(update(Invitation).where(Invitation.id.in_(select(Visit.invitation_id).where(Visit.id.in_(org_ids))))
                   .values(visitor_person_id=anonymous, purpose="[removed]", cancel_reason=None, version=Invitation.version + 1))
        db.execute(update(Visit).where(Visit.id.in_(org_ids)).values(
            visitor_person_id=anonymous, purpose="[removed]", check_in_gate=None, privacy_consent_at=None, nda_signed_at=None,
            anonymized_at=now, version=Visit.version + 1))
    return {"visits_anonymized": len(ids), "visit_events_deleted": events, "visit_passes_deleted": passes,
            "visit_notifications_deleted": notifications, "people_anonymized": anonymize_people(db, people, now)}


def anonymize_people(db: Session, person_ids: set[uuid.UUID], now: datetime) -> int:
    """Anonymize visitors who no longer have anything identifiable that must be kept."""
    _, held_people = held(db)
    still_needed = or_(
        exists().where(User.person_id == Person.id),
        exists().where(Host.person_id == Person.id),
        exists().where(Visit.visitor_person_id == Person.id, Visit.anonymized_at.is_(None)),
        exists().where(BlacklistEntry.person_id == Person.id, BlacklistEntry.status == "active"),
    )
    targets = [pid for pid in db.scalars(select(Person.id).where(Person.id.in_(person_ids), Person.identity_status != "anonymized", ~still_needed)).all()
               if pid not in held_people]
    if not targets:
        return 0
    db.execute(delete(PersonContact).where(PersonContact.person_id.in_(targets)))
    db.execute(delete(VisitorProfile).where(VisitorProfile.person_id.in_(targets)))
    db.execute(update(Person).where(Person.id.in_(targets)).values(
        full_name=SENTINEL_NAME, email=None, phone=None, company=None, identity_status="anonymized", merged_into_id=None,
        anonymized_at=now, version=Person.version + 1))
    return len(targets)


def delete_in_chunks(db: Session, model, condition) -> int:
    total = 0
    pk = model.__mapper__.primary_key[0]
    while True:
        deleted = db.execute(delete(model).where(pk.in_(select(pk).where(condition).limit(DELETE_CHUNK)))).rowcount
        total += deleted
        if deleted < DELETE_CHUNK:
            return total


def purge_tables(db: Session, now: datetime, dry_run: bool) -> dict:
    """Age-based deletion of operational records. Organization overrides apply; site overrides apply to visits only."""
    book = PolicyBook(db)
    allow_history_changes(db)
    _, held_people = held(db)
    held_entities = set(db.scalars(select(RetentionHold.entity_id).where(RetentionHold.released_at.is_(None))).all())
    counts = {"pass_scans": 0, "notifications": 0, "auth_events": 0, "audit_logs": 0, "outbox_events": 0, "job_runs": 0, "idempotency_keys": 0}
    org_ids = [None, *db.scalars(select(Organization.id)).all()]
    for org in org_ids:
        org_match = (lambda column: column.is_(None)) if org is None else (lambda column: column == org)
        cutoff = lambda record_class: add_months(now, -book.get(record_class, org).retain_months)  # noqa: E731
        counts["pass_scans"] += delete_in_chunks(db, PassScan, and_(org_match(PassScan.organization_id), PassScan.scanned_at < cutoff("pass_scan")))
        counts["notifications"] += delete_in_chunks(db, Notification, and_(org_match(Notification.organization_id), Notification.created_at < cutoff("notification"),
                                                                         Notification.status.not_in(["queued", "attempting"])))
        counts["auth_events"] += delete_in_chunks(db, AuthenticationEvent, and_(org_match(AuthenticationEvent.organization_id),
                                                                                AuthenticationEvent.occurred_at < cutoff("auth_event")))
        audit_condition = and_(org_match(AuditLog.organization_id), AuditLog.created_at < cutoff("audit_log"))
        if held_entities:
            audit_condition = and_(audit_condition, or_(AuditLog.entity_id.is_(None), AuditLog.entity_id.not_in(held_entities)))
        counts["audit_logs"] += delete_in_chunks(db, AuditLog, audit_condition)
        counts["outbox_events"] += delete_in_chunks(db, OutboxEvent, and_(org_match(OutboxEvent.organization_id), OutboxEvent.processed_at.is_not(None),
                                                                          OutboxEvent.processed_at < cutoff("outbox_event")))
    counts["job_runs"] = delete_in_chunks(db, JobRun, and_(JobRun.started_at < add_months(now, -book.get("job_run").retain_months), JobRun.status != "running"))
    counts["idempotency_keys"] = db.execute(delete(IdempotencyKey).where(IdempotencyKey.expires_at < now)).rowcount
    if not dry_run:
        db.commit()
    return counts


def remind_overdue_holds(db: Session, now: datetime) -> int:
    reminded = 0
    for hold in db.scalars(select(RetentionHold).where(RetentionHold.released_at.is_(None), RetentionHold.review_due_at <= now)).all():
        recent = db.scalar(select(AuditLog.id).where(AuditLog.action == "retention.hold_review_reminder", AuditLog.entity_id == hold.id,
                                                     AuditLog.created_at > now - timedelta(days=7)).limit(1))
        if recent:
            continue
        notify.notify(db, organization_id=hold.organization_id, recipient_id=hold.placed_by, kind="retention_hold",
                      title="Retention hold due for review", message="A retention hold you placed has reached its review date. Extend or release it.")
        audit.record(db, "retention.hold_review_reminder", entity_type="retention_hold", entity_id=hold.id, organization_id=hold.organization_id)
        reminded += 1
    return reminded


def oldest_overdue_visit_days(db: Session, now: datetime | None = None) -> int:
    """Backlog indicator for monitoring: days by which the oldest eligible ordinary visit is past its policy."""
    now = now or utcnow()
    book = PolicyBook(db)
    oldest = db.scalar(select(func.min(Visit.retention_eligible_at)).where(Visit.anonymized_at.is_(None), Visit.retention_eligible_at.is_not(None)))
    if oldest is None:
        return 0
    due_at = add_months(oldest, book.get("ordinary_visit").retain_months)
    return max(0, (now - due_at).days)


def run(db: Session, dry_run: bool = False, now: datetime | None = None) -> dict:
    now = now or utcnow()
    counts = purge_visits(db, now, dry_run)
    counts.update({f"deleted_{k}": v for k, v in purge_tables(db, now, dry_run).items()})
    counts["hold_reminders"] = 0 if dry_run else remind_overdue_holds(db, now)
    if dry_run:
        db.rollback()
    return counts
