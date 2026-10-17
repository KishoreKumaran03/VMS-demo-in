"""Organization and site structure: status lifecycle, site settings, departments, gates, devices.

Expand-only except for two reversible changes:
- organizations.is_active / sites.is_active become generated columns derived from the new
  `status` column (values are backfilled first, so no information is lost).
- sites.organization_id no longer cascades on delete (history must never disappear with a parent).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_org_site_structure"
down_revision = "0002_deduplicate_unique_indexes"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def add_updated_at_trigger(table: str) -> None:
    op.execute(f"CREATE TRIGGER trg_{table}_updated_at BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()")


def status_with_generated_is_active(table: str, statuses: tuple[str, ...]) -> None:
    allowed = ", ".join(f"'{s}'" for s in statuses)
    op.add_column(table, sa.Column("status", sa.Text(), nullable=False, server_default="active"))
    op.execute(f"UPDATE {table} SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END")
    op.create_check_constraint(f"ck_{table}_status", table, f"status IN ({allowed})")
    op.drop_column(table, "is_active")
    op.execute(f"ALTER TABLE {table} ADD COLUMN is_active boolean GENERATED ALWAYS AS (status = 'active') STORED")


def restore_plain_is_active(table: str) -> None:
    op.execute(f"ALTER TABLE {table} DROP COLUMN is_active")
    op.add_column(table, sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute(f"UPDATE {table} SET is_active = (status = 'active')")
    op.drop_constraint(f"ck_{table}_status", table, type_="check")
    op.drop_column(table, "status")


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
        BEGIN
            NEW.updated_at := now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )

    # organizations ---------------------------------------------------------------------------
    # 'inactive' is accepted so the is_active backfill has a target; the API uses active/suspended/archived.
    status_with_generated_is_active("organizations", ("active", "inactive", "suspended", "archived"))
    op.add_column("organizations", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column("organizations", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    add_updated_at_trigger("organizations")

    # sites -----------------------------------------------------------------------------------
    status_with_generated_is_active("sites", ("active", "inactive", "archived"))
    op.add_column("sites", sa.Column("code", sa.String(40)))
    op.add_column("sites", sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"))
    op.add_column("sites", sa.Column("archived_at", sa.DateTime(timezone=True)))
    op.add_column("sites", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column("sites", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.create_check_constraint("ck_sites_archived_at", "sites", "(status = 'archived') = (archived_at IS NOT NULL)")
    op.create_unique_constraint("uq_sites_organization_id_id", "sites", ["organization_id", "id"])
    op.create_index("uq_sites_organization_code", "sites", ["organization_id", sa.text("lower(code)")], unique=True, postgresql_where=sa.text("code IS NOT NULL"))
    op.drop_constraint("sites_organization_id_fkey", "sites", type_="foreignkey")
    op.create_foreign_key("sites_organization_id_fkey", "sites", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")
    add_updated_at_trigger("sites")

    # site_settings: one row per site ----------------------------------------------------------
    op.create_table(
        "site_settings",
        sa.Column("site_id", UUID, sa.ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("operating_hours", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("default_visit_hours", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("walk_in_requires_host_approval", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("overdue_grace_minutes", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("allow_reentry", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("require_nda", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *timestamps(),
        sa.CheckConstraint("default_visit_hours BETWEEN 1 AND 72", name="ck_site_settings_default_visit_hours"),
        sa.CheckConstraint("overdue_grace_minutes BETWEEN 0 AND 1440", name="ck_site_settings_overdue_grace"),
    )
    add_updated_at_trigger("site_settings")
    op.execute("INSERT INTO site_settings (site_id) SELECT id FROM sites")

    # departments ------------------------------------------------------------------------------
    op.create_table(
        "departments",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        *timestamps(),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_departments_status"),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_departments_name_not_blank"),
        sa.UniqueConstraint("organization_id", "id", name="uq_departments_organization_id_id"),
    )
    op.create_index("uq_departments_organization_name", "departments", ["organization_id", sa.text("lower(name)")], unique=True)
    add_updated_at_trigger("departments")
    # Seed from the free-text department names already used by hosts; hosts link to them in Phase 4.
    op.execute(
        """
        INSERT INTO departments (organization_id, name)
        SELECT DISTINCT ON (organization_id, lower(trim(department))) organization_id, trim(department)
        FROM hosts WHERE trim(department) <> ''
        ORDER BY organization_id, lower(trim(department)), trim(department)
        """
    )

    # gates ------------------------------------------------------------------------------------
    op.create_table(
        "gates",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("site_id", UUID, nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
        *timestamps(),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_gates_status"),
        sa.ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"], name="fk_gates_site", ondelete="RESTRICT"),
        sa.UniqueConstraint("site_id", "name", name="uq_gates_site_name"),
        sa.UniqueConstraint("organization_id", "id", name="uq_gates_organization_id_id"),
    )
    add_updated_at_trigger("gates")

    # devices ----------------------------------------------------------------------------------
    op.create_table(
        "devices",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("site_id", UUID, nullable=False),
        sa.Column("gate_id", UUID),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("device_type", sa.Text(), nullable=False),
        sa.Column("credential_hash", sa.String(64)),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("enrolled_at", sa.DateTime(timezone=True)),
        sa.Column("enrolled_by", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint("device_type IN ('kiosk', 'scanner', 'badge_printer')", name="ck_devices_type"),
        sa.CheckConstraint("status IN ('pending', 'active', 'disabled', 'retired')", name="ck_devices_status"),
        sa.CheckConstraint("status <> 'active' OR (credential_hash IS NOT NULL AND enrolled_at IS NOT NULL)", name="ck_devices_active_enrolled"),
        sa.ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"], name="fk_devices_site", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id", "gate_id"], ["gates.organization_id", "gates.id"], name="fk_devices_gate", ondelete="RESTRICT"),
        sa.UniqueConstraint("site_id", "name", name="uq_devices_site_name"),
    )
    op.create_index("ix_devices_site_active", "devices", ["site_id"], postgresql_where=sa.text("status = 'active'"))
    op.create_index("uq_devices_credential_hash", "devices", ["credential_hash"], unique=True, postgresql_where=sa.text("credential_hash IS NOT NULL"))
    add_updated_at_trigger("devices")


def downgrade():
    op.drop_table("devices")
    op.drop_table("gates")
    op.drop_table("departments")
    op.drop_table("site_settings")

    op.execute("DROP TRIGGER IF EXISTS trg_sites_updated_at ON sites")
    op.drop_constraint("sites_organization_id_fkey", "sites", type_="foreignkey")
    op.create_foreign_key("sites_organization_id_fkey", "sites", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.drop_index("uq_sites_organization_code", table_name="sites")
    op.drop_constraint("uq_sites_organization_id_id", "sites", type_="unique")
    op.drop_constraint("ck_sites_archived_at", "sites", type_="check")
    for column in ("version", "updated_at", "archived_at", "timezone", "code"):
        op.drop_column("sites", column)
    restore_plain_is_active("sites")

    op.execute("DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations")
    op.drop_column("organizations", "version")
    op.drop_column("organizations", "updated_at")
    restore_plain_is_active("organizations")

    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")
