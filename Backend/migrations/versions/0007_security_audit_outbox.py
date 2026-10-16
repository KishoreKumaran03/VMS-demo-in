"""Blacklist and security approvals; structured append-only audit log; notification delivery tracking;
transactional outbox; background job runs.

- audit_events becomes audit_logs: event_type -> action, actor_id -> actor_user_id, the visit reference
  becomes a generic (entity_type, entity_id) with no foreign key (audit must outlive the rows it describes),
  free-text detail moves into metadata.detail.
- audit_logs, visit_events, authentication_events and pass_scans become append-only: UPDATE/DELETE raise
  unless the transaction ran `SET LOCAL vms.allow_history_changes = 'on'` (only the retention job does).
- notifications gain kind/channel/status/read_at and stop cascading from users and organizations.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_security_audit_outbox"
down_revision = "0006_visits_passes_identity"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
APPEND_ONLY = ("audit_logs", "visit_events", "authentication_events", "pass_scans")
NEW_PERMISSIONS = {"blacklist.manage": ["super-admin", "site-admin"], "security.approve": ["super-admin", "site-admin"]}


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def add_updated_at_trigger(table: str) -> None:
    op.execute(f"CREATE TRIGGER trg_{table}_updated_at BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()")


def upgrade():
    for code, holders in NEW_PERMISSIONS.items():
        op.execute(sa.text("INSERT INTO permissions (id, code) SELECT COALESCE(max(id), 0) + 1, :code FROM permissions").bindparams(code=code))
        op.execute(sa.text("INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p "
                           "WHERE p.code = :code AND r.code = ANY(:holders)").bindparams(code=code, holders=holders))

    # Phone matching compares the last 10 digits (see services/identity.phone_digits).
    op.drop_index("ix_people_org_phone_digits", table_name="people")
    op.create_index("ix_people_org_phone_key", "people", ["organization_id", sa.text("right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)")],
                    postgresql_where=sa.text("phone IS NOT NULL"))

    # blacklist ------------------------------------------------------------------------------------
    op.create_table(
        "blacklist_entries",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("site_id", UUID),
        sa.Column("person_id", UUID),
        sa.Column("match_name", sa.String(160)),
        sa.Column("match_email", sa.String(320)),
        sa.Column("match_phone_digits", sa.String(40)),
        sa.Column("reason_category", sa.Text(), nullable=False),
        sa.Column("reason_detail", sa.String(1000)),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("effective_until", sa.DateTime(timezone=True)),
        sa.Column("review_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("lifted_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("lifted_at", sa.DateTime(timezone=True)),
        sa.Column("lift_reason", sa.String(500)),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *timestamps(),
        sa.CheckConstraint("reason_category IN ('safety', 'theft', 'harassment', 'trespass', 'legal_order', 'policy_violation', 'other')", name="ck_blacklist_reason"),
        sa.CheckConstraint("severity IN ('deny', 'require_approval')", name="ck_blacklist_severity"),
        sa.CheckConstraint("status IN ('active', 'expired', 'lifted')", name="ck_blacklist_status"),
        sa.CheckConstraint("person_id IS NOT NULL OR match_email IS NOT NULL OR match_phone_digits IS NOT NULL OR match_name IS NOT NULL", name="ck_blacklist_identifier"),
        sa.CheckConstraint("match_email IS NULL OR match_email = lower(match_email)", name="ck_blacklist_email_lowercase"),
        sa.CheckConstraint("effective_until IS NULL OR effective_until > effective_from", name="ck_blacklist_period"),
        sa.CheckConstraint("(status = 'lifted') = (lifted_at IS NOT NULL)", name="ck_blacklist_lifted"),
        sa.ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"], name="fk_blacklist_site", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id", "person_id"], ["people.organization_id", "people.id"], name="fk_blacklist_person", ondelete="RESTRICT"),
    )
    op.create_index("ix_blacklist_person", "blacklist_entries", ["organization_id", "person_id"], postgresql_where=sa.text("status = 'active'"))
    op.create_index("ix_blacklist_email", "blacklist_entries", ["organization_id", "match_email"], postgresql_where=sa.text("status = 'active'"))
    op.create_index("ix_blacklist_phone", "blacklist_entries", ["organization_id", "match_phone_digits"], postgresql_where=sa.text("status = 'active'"))
    op.create_index("ix_blacklist_review_due", "blacklist_entries", ["review_due_at"], postgresql_where=sa.text("status = 'active'"))
    add_updated_at_trigger("blacklist_entries")

    op.create_table(
        "blacklist_matches",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("blacklist_entry_id", UUID, sa.ForeignKey("blacklist_entries.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("visit_id", UUID, nullable=False),
        sa.Column("match_basis", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Text(), nullable=False),
        sa.Column("reviewed_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("match_basis IN ('person', 'email', 'phone', 'name')", name="ck_blacklist_match_basis"),
        sa.CheckConstraint("confidence IN ('confirmed', 'uncertain', 'rejected')", name="ck_blacklist_match_confidence"),
        sa.CheckConstraint("(reviewed_by IS NULL) = (reviewed_at IS NULL)", name="ck_blacklist_match_review"),
        sa.ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"], name="fk_blacklist_match_visit", ondelete="RESTRICT"),
        sa.UniqueConstraint("blacklist_entry_id", "visit_id", name="uq_blacklist_match_entry_visit"),
    )
    op.create_index("ix_blacklist_matches_visit", "blacklist_matches", ["visit_id"])

    op.create_table(
        "security_approvals",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("visit_id", UUID, nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("decided_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decision_reason", sa.String(500)),
        sa.CheckConstraint("status IN ('pending', 'approved', 'denied', 'superseded')", name="ck_security_approval_status"),
        sa.CheckConstraint("status IN ('pending', 'superseded') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)",
                           name="ck_security_approval_decision"),
        sa.ForeignKeyConstraint(["organization_id", "visit_id"], ["visits.organization_id", "visits.id"], name="fk_security_approval_visit", ondelete="RESTRICT"),
    )
    op.create_index("uq_security_approval_pending", "security_approvals", ["visit_id"], unique=True, postgresql_where=sa.text("status = 'pending'"))
    op.create_index("ix_security_approvals_org_status", "security_approvals", ["organization_id", "status", "requested_at"])

    # audit_events -> audit_logs ---------------------------------------------------------------------
    op.rename_table("audit_events", "audit_logs")
    op.alter_column("audit_logs", "event_type", new_column_name="action")
    op.alter_column("audit_logs", "actor_id", new_column_name="actor_user_id")
    op.add_column("audit_logs", sa.Column("actor_device_id", UUID, sa.ForeignKey("devices.id", ondelete="RESTRICT")))
    op.add_column("audit_logs", sa.Column("entity_type", sa.String(40)))
    op.add_column("audit_logs", sa.Column("entity_id", UUID))
    op.add_column("audit_logs", sa.Column("site_id", UUID))
    op.add_column("audit_logs", sa.Column("correlation_id", sa.String(64)))
    op.add_column("audit_logs", sa.Column("ip", postgresql.INET()))
    op.add_column("audit_logs", sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.execute(
        """
        UPDATE audit_logs a SET
            entity_type = CASE WHEN a.visit_id IS NOT NULL THEN 'visit' ELSE split_part(a.action, '.', 1) END,
            -- Phase 3 details start with "<kind>=<uuid>"; keep that id as the entity reference.
            entity_id = COALESCE(a.visit_id,
                CASE WHEN a.detail ~ '^[a-z]+=[0-9a-f-]{36}' THEN CAST(substring(a.detail from '^[a-z]+=([0-9a-f-]{36})') AS uuid) END),
            site_id = (SELECT v.site_id FROM visits v WHERE v.id = a.visit_id),
            metadata = CASE WHEN a.detail IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('detail', a.detail) END
        """
    )
    op.alter_column("audit_logs", "entity_type", nullable=False)
    op.drop_constraint("audit_events_visit_id_fkey", "audit_logs", type_="foreignkey")
    op.drop_column("audit_logs", "visit_id")
    op.drop_column("audit_logs", "detail")
    op.alter_column("audit_logs", "organization_id", nullable=True)
    op.drop_constraint("audit_events_organization_id_fkey", "audit_logs", type_="foreignkey")
    op.create_foreign_key("fk_audit_logs_organization", "audit_logs", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")
    op.drop_constraint("audit_events_actor_id_fkey", "audit_logs", type_="foreignkey")
    op.create_foreign_key("fk_audit_logs_actor", "audit_logs", "users", ["actor_user_id"], ["id"], ondelete="RESTRICT")
    op.execute("ALTER INDEX audit_events_pkey RENAME TO audit_logs_pkey")
    op.drop_index("ix_audit_events_organization_id", table_name="audit_logs")
    op.drop_index("ix_audit_events_event_type", table_name="audit_logs")
    op.create_index("ix_audit_logs_org_created", "audit_logs", ["organization_id", sa.text("created_at DESC")])
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"])
    op.create_index("ix_audit_logs_actor", "audit_logs", ["actor_user_id", sa.text("created_at DESC")])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action", sa.text("created_at DESC")])
    op.create_index("ix_audit_logs_site_created", "audit_logs", ["site_id", sa.text("created_at DESC")], postgresql_where=sa.text("site_id IS NOT NULL"))

    op.execute(
        """
        CREATE OR REPLACE FUNCTION reject_history_change() RETURNS trigger AS $$
        BEGIN
            IF current_setting('vms.allow_history_changes', true) = 'on' THEN
                RETURN COALESCE(NEW, OLD);
            END IF;
            RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table in APPEND_ONLY:
        op.execute(f"CREATE TRIGGER trg_{table}_append_only BEFORE UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION reject_history_change()")

    # notifications ------------------------------------------------------------------------------------
    op.add_column("notifications", sa.Column("kind", sa.String(40), nullable=False, server_default="general"))
    op.add_column("notifications", sa.Column("channel", sa.Text(), nullable=False, server_default="in_app"))
    op.add_column("notifications", sa.Column("status", sa.Text(), nullable=False, server_default="delivered"))
    op.add_column("notifications", sa.Column("read_at", sa.DateTime(timezone=True)))
    op.add_column("notifications", sa.Column("delivered_at", sa.DateTime(timezone=True)))
    op.execute("UPDATE notifications SET read_at = CASE WHEN read THEN created_at END, delivered_at = created_at")
    op.create_check_constraint("ck_notifications_channel", "notifications", "channel IN ('in_app', 'email', 'sms')")
    op.create_check_constraint("ck_notifications_status", "notifications", "status IN ('queued', 'attempting', 'accepted', 'delivered', 'failed', 'unknown')")
    op.drop_constraint("notifications_organization_id_fkey", "notifications", type_="foreignkey")
    op.create_foreign_key("notifications_organization_id_fkey", "notifications", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")
    op.drop_constraint("notifications_recipient_id_fkey", "notifications", type_="foreignkey")
    op.create_foreign_key("notifications_recipient_id_fkey", "notifications", "users", ["recipient_id"], ["id"], ondelete="RESTRICT")
    op.create_index("ix_notifications_queued", "notifications", ["created_at"], postgresql_where=sa.text("status IN ('queued', 'attempting')"))

    op.create_table(
        "notification_attempts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("notification_id", UUID, sa.ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("provider", sa.String(40)),
        sa.Column("provider_message_id", sa.String(200)),
        sa.Column("outcome", sa.Text(), nullable=False),
        sa.Column("error_code", sa.String(80)),
        sa.CheckConstraint("outcome IN ('accepted', 'delivered', 'failed', 'unknown')", name="ck_notification_attempt_outcome"),
    )
    op.create_index("ix_notification_attempts_notification", "notification_attempts", ["notification_id"])

    # outbox and jobs -------------------------------------------------------------------------------------
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("event_id", UUID, nullable=False, unique=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT")),
        sa.Column("aggregate_type", sa.String(40), nullable=False),
        sa.Column("aggregate_id", UUID, nullable=False),
        sa.Column("aggregate_version", sa.Integer()),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(500)),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("dead_lettered_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("NOT (processed_at IS NOT NULL AND dead_lettered_at IS NOT NULL)", name="ck_outbox_single_outcome"),
    )
    op.create_index("ix_outbox_pending", "outbox_events", ["available_at", "id"], postgresql_where=sa.text("processed_at IS NULL AND dead_lettered_at IS NULL"))
    op.create_index("ix_outbox_dead", "outbox_events", ["dead_lettered_at"], postgresql_where=sa.text("dead_lettered_at IS NOT NULL"))
    op.create_index("ix_outbox_aggregate", "outbox_events", ["aggregate_type", "aggregate_id", "id"])

    op.create_table(
        "job_runs",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_name", sa.String(60), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.Text(), nullable=False, server_default="running"),
        sa.Column("dry_run", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("counts", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("error", sa.String(1000)),
        sa.CheckConstraint("status IN ('running', 'succeeded', 'failed', 'partial')", name="ck_job_runs_status"),
        sa.CheckConstraint("(status = 'running') = (finished_at IS NULL)", name="ck_job_runs_finished"),
    )
    op.create_index("ix_job_runs_name_started", "job_runs", ["job_name", sa.text("started_at DESC")])


def downgrade():
    op.drop_table("job_runs")
    op.drop_table("outbox_events")
    op.drop_table("notification_attempts")
    op.drop_index("ix_notifications_queued", table_name="notifications")
    op.drop_constraint("notifications_recipient_id_fkey", "notifications", type_="foreignkey")
    op.create_foreign_key("notifications_recipient_id_fkey", "notifications", "users", ["recipient_id"], ["id"], ondelete="CASCADE")
    op.drop_constraint("notifications_organization_id_fkey", "notifications", type_="foreignkey")
    op.create_foreign_key("notifications_organization_id_fkey", "notifications", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.drop_constraint("ck_notifications_status", "notifications", type_="check")
    op.drop_constraint("ck_notifications_channel", "notifications", type_="check")
    op.execute("DELETE FROM notifications WHERE channel <> 'in_app'")
    for column in ("delivered_at", "read_at", "status", "channel", "kind"):
        op.drop_column("notifications", column)

    for table in APPEND_ONLY:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_append_only ON {table}")
    op.execute("DROP FUNCTION IF EXISTS reject_history_change()")

    for name in ("ix_audit_logs_site_created", "ix_audit_logs_action", "ix_audit_logs_actor", "ix_audit_logs_entity", "ix_audit_logs_org_created"):
        op.drop_index(name, table_name="audit_logs")
    op.add_column("audit_logs", sa.Column("detail", sa.Text()))
    op.add_column("audit_logs", sa.Column("visit_id", UUID))
    op.execute("UPDATE audit_logs SET detail = metadata->>'detail', visit_id = CASE WHEN entity_type = 'visit' AND entity_id IN (SELECT id FROM visits) THEN entity_id END")
    op.execute("DELETE FROM audit_logs WHERE organization_id IS NULL")
    op.alter_column("audit_logs", "organization_id", nullable=False)
    op.drop_constraint("fk_audit_logs_actor", "audit_logs", type_="foreignkey")
    op.drop_constraint("fk_audit_logs_organization", "audit_logs", type_="foreignkey")
    for column in ("metadata", "ip", "correlation_id", "site_id", "entity_id", "entity_type", "actor_device_id"):
        op.drop_column("audit_logs", column)
    op.alter_column("audit_logs", "actor_user_id", new_column_name="actor_id")
    op.alter_column("audit_logs", "action", new_column_name="event_type")
    op.execute("ALTER INDEX audit_logs_pkey RENAME TO audit_events_pkey")
    op.rename_table("audit_logs", "audit_events")
    op.create_foreign_key("audit_events_organization_id_fkey", "audit_events", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("audit_events_actor_id_fkey", "audit_events", "users", ["actor_id"], ["id"])
    op.create_foreign_key("audit_events_visit_id_fkey", "audit_events", "visits", ["visit_id"], ["id"])
    op.create_index("ix_audit_events_organization_id", "audit_events", ["organization_id"])
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])

    op.drop_table("security_approvals")
    op.drop_table("blacklist_matches")
    op.drop_table("blacklist_entries")
    op.drop_index("ix_people_org_phone_key", table_name="people")
    op.create_index("ix_people_org_phone_digits", "people", ["organization_id", sa.text("regexp_replace(phone, '[^0-9]', '', 'g')")],
                    postgresql_where=sa.text("phone IS NOT NULL"))
    op.execute("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ('blacklist.manage', 'security.approve'))")
    op.execute("DELETE FROM permissions WHERE code IN ('blacklist.manage', 'security.approve')")
