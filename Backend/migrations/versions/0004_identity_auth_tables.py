"""Identity and authentication tables: people, contacts, credentials, roles/permissions, sessions,
password resets and authentication events. Expand-only; data is moved in 0005."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_identity_auth_tables"
down_revision = "0003_org_site_structure"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)

# (id, code, scope, priority). Priority picks the effective role if an account holds several.
# scope: platform = no site allowed; organization_or_site = optional site (NULL = whole organization);
# site = a site is required.
ROLES = [
    (1, "super-admin", "platform", 100),
    (2, "site-admin", "organization_or_site", 80),
    (3, "receptionist", "site", 40),
    (4, "host", "site", 20),
]

# Mirrors the role checks the API enforced before this migration; the API now checks these codes.
PERMISSIONS = {
    "organization.manage": ["super-admin"],
    "site.manage": ["super-admin", "site-admin"],
    "user.read": ["super-admin", "site-admin"],
    "user.manage": ["super-admin", "site-admin"],
    "user.reset_password": ["super-admin", "site-admin"],
    "host.manage": ["super-admin", "site-admin"],
    "host.read": ["super-admin", "site-admin", "receptionist", "host"],
    "visit.read": ["super-admin", "site-admin", "receptionist", "host"],
    "visit.create": ["super-admin", "site-admin", "host"],
    "visit.update": ["super-admin", "site-admin", "host"],
    "visit.approve": ["super-admin", "site-admin", "host"],
    "visit.reject": ["super-admin", "site-admin"],
    "pass.revoke": ["super-admin", "site-admin", "host"],
    "visitor.update": ["super-admin", "site-admin", "receptionist"],
    "visitor.deactivate": ["super-admin", "site-admin"],
    "walk_in.register": ["super-admin", "site-admin", "receptionist"],
    "audit.read": ["super-admin", "site-admin", "receptionist", "host"],
}


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def add_updated_at_trigger(table: str) -> None:
    op.execute(f"CREATE TRIGGER trg_{table}_updated_at BEFORE UPDATE ON {table} FOR EACH ROW EXECUTE FUNCTION set_updated_at()")


def upgrade():
    # people ------------------------------------------------------------------------------------
    op.create_table(
        "people",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("email", sa.String(320)),
        sa.Column("phone", sa.String(40)),
        sa.Column("company", sa.String(160)),
        sa.Column("identity_status", sa.Text(), nullable=False, server_default="active"),
        sa.Column("merged_into_id", UUID, sa.ForeignKey("people.id", ondelete="RESTRICT")),
        sa.Column("anonymized_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *timestamps(),
        sa.CheckConstraint("length(trim(full_name)) > 0", name="ck_people_full_name_not_blank"),
        sa.CheckConstraint("identity_status IN ('active', 'merged', 'anonymized')", name="ck_people_identity_status"),
        sa.CheckConstraint("(identity_status = 'merged') = (merged_into_id IS NOT NULL)", name="ck_people_merged_into"),
        sa.CheckConstraint("(identity_status = 'anonymized') = (anonymized_at IS NOT NULL)", name="ck_people_anonymized_at"),
        sa.CheckConstraint("email IS NULL OR email = lower(email)", name="ck_people_email_lowercase"),
        sa.UniqueConstraint("organization_id", "id", name="uq_people_organization_id_id"),
    )
    op.create_index("ix_people_org_email", "people", ["organization_id", sa.text("lower(email)")], postgresql_where=sa.text("email IS NOT NULL"))
    op.create_index("ix_people_org_phone", "people", ["organization_id", "phone"], postgresql_where=sa.text("phone IS NOT NULL"))
    op.create_index("ix_people_full_name_trgm", "people", ["full_name"], postgresql_using="gin", postgresql_ops={"full_name": "gin_trgm_ops"})
    add_updated_at_trigger("people")

    op.create_table(
        "person_contacts",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("person_id", UUID, sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.Text(), nullable=False),
        sa.Column("value", sa.String(320), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        *timestamps(),
        sa.CheckConstraint("channel IN ('email', 'phone')", name="ck_person_contacts_channel"),
        sa.CheckConstraint("channel <> 'email' OR value = lower(value)", name="ck_person_contacts_email_lowercase"),
        sa.UniqueConstraint("person_id", "channel", "value", name="uq_person_contacts_value"),
    )
    op.create_index("uq_person_contacts_primary", "person_contacts", ["person_id", "channel"], unique=True, postgresql_where=sa.text("is_primary"))
    add_updated_at_trigger("person_contacts")

    # users: new account-level columns (person_id becomes NOT NULL in 0005) ----------------------
    op.add_column("users", sa.Column("person_id", UUID))
    op.add_column("users", sa.Column("account_status", sa.Text(), nullable=False, server_default="active"))
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("failed_login_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column("users", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.create_check_constraint("ck_users_account_status", "users", "account_status IN ('invited', 'active', 'locked', 'disabled')")
    op.create_check_constraint("ck_users_failed_login_count", "users", "failed_login_count >= 0")
    op.create_unique_constraint("uq_users_organization_id_id", "users", ["organization_id", "id"])
    add_updated_at_trigger("users")

    op.create_table(
        "user_credentials",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("must_change", sa.Boolean(), nullable=False, server_default=sa.false()),
        *timestamps(),
        # Rejects plaintext or non-Argon2id values even if application code is bypassed.
        sa.CheckConstraint("password_hash LIKE '$argon2id$%'", name="ck_user_credentials_argon2id"),
    )
    add_updated_at_trigger("user_credentials")

    # roles and permissions ---------------------------------------------------------------------
    roles = op.create_table(
        "roles",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("code", sa.String(40), nullable=False, unique=True),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("priority", sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("scope IN ('platform', 'organization_or_site', 'site')", name="ck_roles_scope"),
    )
    permissions = op.create_table(
        "permissions",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("code", sa.String(60), nullable=False, unique=True),
    )
    role_permissions = op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.SmallInteger(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", sa.SmallInteger(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )
    op.bulk_insert(roles, [{"id": i, "code": c, "scope": s, "priority": p} for i, c, s, p in ROLES])
    permission_ids = {code: index for index, code in enumerate(PERMISSIONS, start=1)}
    op.bulk_insert(permissions, [{"id": i, "code": c} for c, i in permission_ids.items()])
    role_ids = {code: i for i, code, _, _ in ROLES}
    op.bulk_insert(role_permissions, [
        {"role_id": role_ids[role], "permission_id": permission_ids[code]}
        for code, holders in PERMISSIONS.items() for role in holders
    ])

    op.create_table(
        "user_roles",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("role_id", sa.SmallInteger(), sa.ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("site_id", UUID),
        sa.Column("granted_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id", "user_id"], ["users.organization_id", "users.id"], name="fk_user_roles_user", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id", "site_id"], ["sites.organization_id", "sites.id"], name="fk_user_roles_site", ondelete="RESTRICT"),
    )
    op.create_index("uq_user_roles_assignment", "user_roles", ["user_id", "role_id", sa.text("COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid)")], unique=True)
    op.create_index("ix_user_roles_site", "user_roles", ["site_id"])
    # The scope trigger is installed in 0005, after legacy rows are backfilled.

    # sessions, password resets, authentication events -----------------------------------------
    op.create_table(
        "user_sessions",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoke_reason", sa.String(40)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("ip", postgresql.INET()),
        sa.CheckConstraint("expires_at > created_at", name="ck_user_sessions_expiry"),
        sa.CheckConstraint("(revoked_at IS NULL) = (revoke_reason IS NULL)", name="ck_user_sessions_revoke_reason"),
    )
    op.create_index("ix_user_sessions_user_active", "user_sessions", ["user_id"], postgresql_where=sa.text("revoked_at IS NULL"))

    op.create_table(
        "password_reset_requests",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.Text(), nullable=False),
        sa.Column("contact_id", UUID, sa.ForeignKey("person_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("initiated_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("request_ip", postgresql.INET()),
        sa.CheckConstraint("channel IN ('email', 'sms')", name="ck_password_reset_channel"),
        sa.CheckConstraint("expires_at > created_at", name="ck_password_reset_expiry"),
        sa.CheckConstraint("attempt_count BETWEEN 0 AND max_attempts", name="ck_password_reset_attempts"),
        sa.CheckConstraint("NOT (consumed_at IS NOT NULL AND cancelled_at IS NOT NULL)", name="ck_password_reset_single_outcome"),
    )
    op.create_index("ix_password_reset_user_created", "password_reset_requests", ["user_id", sa.text("created_at DESC")])
    op.create_index("uq_password_reset_live", "password_reset_requests", ["user_id"], unique=True, postgresql_where=sa.text("consumed_at IS NULL AND cancelled_at IS NULL"))

    op.create_table(
        "authentication_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("ip", postgresql.INET()),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_authentication_events_user", "authentication_events", ["user_id", sa.text("occurred_at DESC")])
    op.create_index("ix_authentication_events_occurred", "authentication_events", ["occurred_at"])
    op.create_index("ix_authentication_events_ip_type", "authentication_events", ["ip", "event_type", sa.text("occurred_at DESC")])


def downgrade():
    op.drop_table("authentication_events")
    op.drop_table("password_reset_requests")
    op.drop_table("user_sessions")
    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("user_credentials")
    op.execute("DROP TRIGGER IF EXISTS trg_users_updated_at ON users")
    op.drop_constraint("uq_users_organization_id_id", "users", type_="unique")
    op.drop_constraint("ck_users_failed_login_count", "users", type_="check")
    op.drop_constraint("ck_users_account_status", "users", type_="check")
    for column in ("version", "updated_at", "locked_until", "failed_login_count", "last_login_at", "account_status", "person_id"):
        op.drop_column("users", column)
    op.drop_table("person_contacts")
    op.drop_table("people")
