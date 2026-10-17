"""Retention policies and holds, de-identified visit statistics, backup run records.

Seeded platform defaults (organizations and sites may override; see docs/BACKEND.md "Retention"):
  ordinary_visit 5 months anonymize | security_visit 24 anonymize | pass_scan 5 delete | notification 3 delete
  auth_event 12 delete | audit_log 24 delete | outbox_event 1 delete | job_run 6 delete
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_retention_backups"
down_revision = "0007_security_audit_outbox"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
RECORD_CLASSES = ("ordinary_visit", "security_visit", "pass_scan", "notification", "auth_event", "audit_log", "outbox_event", "job_run")
DEFAULTS = [
    ("ordinary_visit", 5, "anonymize", "Configurable default for completed ordinary visits."),
    ("security_visit", 24, "anonymize", "Visits with a blacklist match or security decision; confirm against legal advice."),
    ("pass_scan", 5, "delete", None),
    ("notification", 3, "delete", None),
    ("auth_event", 12, "delete", None),
    ("audit_log", 24, "delete", None),
    ("outbox_event", 1, "delete", "Processed events only."),
    ("job_run", 6, "delete", None),
]


def upgrade():
    op.execute(sa.text("INSERT INTO permissions (id, code) SELECT COALESCE(max(id), 0) + 1, 'retention.hold' FROM permissions"))
    op.execute(sa.text("INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p "
                       "WHERE p.code = 'retention.hold' AND r.code IN ('super-admin', 'site-admin')"))

    policies = op.create_table(
        "retention_policies",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT")),
        sa.Column("site_id", UUID),
        sa.Column("record_class", sa.Text(), nullable=False),
        sa.Column("retain_months", sa.Integer(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("approved_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(f"record_class IN {RECORD_CLASSES}", name="ck_retention_record_class"),
        sa.CheckConstraint("retain_months BETWEEN 1 AND 120", name="ck_retention_months"),
        sa.CheckConstraint("action IN ('delete', 'anonymize')", name="ck_retention_action"),
        sa.CheckConstraint("site_id IS NULL OR organization_id IS NOT NULL", name="ck_retention_site_needs_org"),
        sa.ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"], name="fk_retention_site", ondelete="RESTRICT"),
    )
    op.execute("CREATE UNIQUE INDEX uq_retention_policy_scope ON retention_policies (organization_id, site_id, record_class) NULLS NOT DISTINCT")
    op.execute("CREATE TRIGGER trg_retention_policies_updated_at BEFORE UPDATE ON retention_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at()")
    op.bulk_insert(policies, [{"record_class": c, "retain_months": m, "action": a, "notes": n} for c, m, a, n in DEFAULTS])

    op.create_table(
        "retention_holds",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", UUID, nullable=False),
        sa.Column("hold_type", sa.Text(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("case_reference", sa.String(120)),
        sa.Column("placed_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("placed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("review_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("release_reason", sa.String(500)),
        sa.CheckConstraint("entity_type IN ('visit', 'person')", name="ck_retention_hold_entity"),
        sa.CheckConstraint("hold_type IN ('legal', 'investigation', 'security_incident')", name="ck_retention_hold_type"),
        sa.CheckConstraint("review_due_at > placed_at AND review_due_at <= placed_at + interval '12 months'", name="ck_retention_hold_review"),
        sa.CheckConstraint("(released_at IS NULL) = (released_by IS NULL)", name="ck_retention_hold_release"),
        sa.CheckConstraint("hold_type = 'security_incident' OR case_reference IS NOT NULL", name="ck_retention_hold_case_reference"),
    )
    op.create_index("ix_retention_holds_active", "retention_holds", ["entity_type", "entity_id"], postgresql_where=sa.text("released_at IS NULL"))

    op.create_table(
        "visit_daily_stats",
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("site_id", UUID, sa.ForeignKey("sites.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("source", sa.Text(), primary_key=True),
        sa.Column("category", sa.Text(), primary_key=True),
        sa.Column("final_status", sa.Text(), primary_key=True),
        sa.Column("visits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_minutes_on_site", sa.BigInteger(), nullable=False, server_default="0"),
    )

    op.add_column("visits", sa.Column("anonymized_at", sa.DateTime(timezone=True)))
    op.create_index("ix_visits_retention_pending", "visits", ["retention_eligible_at"],
                    postgresql_where=sa.text("retention_eligible_at IS NOT NULL AND anonymized_at IS NULL"))
    op.drop_index("ix_visits_retention", table_name="visits")

    op.create_table(
        "backup_runs",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.Text(), nullable=False, server_default="running"),
        sa.Column("location", sa.String(500)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("checksum", sa.String(64)),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("error", sa.String(1000)),
        sa.CheckConstraint("kind IN ('full', 'restore_test')", name="ck_backup_runs_kind"),
        sa.CheckConstraint("status IN ('running', 'succeeded', 'failed')", name="ck_backup_runs_status"),
    )
    op.create_index("ix_backup_runs_kind_started", "backup_runs", ["kind", sa.text("started_at DESC")])


def downgrade():
    op.drop_table("backup_runs")
    op.create_index("ix_visits_retention", "visits", ["retention_eligible_at"], postgresql_where=sa.text("retention_eligible_at IS NOT NULL"))
    op.drop_index("ix_visits_retention_pending", table_name="visits")
    op.drop_column("visits", "anonymized_at")
    op.drop_table("visit_daily_stats")
    op.drop_table("retention_holds")
    op.drop_table("retention_policies")
    op.execute("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'retention.hold')")
    op.execute("DELETE FROM permissions WHERE code = 'retention.hold'")
