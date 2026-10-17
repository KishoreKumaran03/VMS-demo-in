"""Move account data into the identity/auth tables and retire the legacy users columns.

For every existing user this creates:
- one `people` row (full name + email) and a primary, unverified email contact,
- one `user_credentials` row holding the existing Argon2id hash,
- one `user_roles` row from the legacy role/site columns (super-admin is platform-scoped, so its site is dropped).

Then users.password_hash, full_name, role and site_id are dropped and users.is_active becomes a
generated column derived from account_status. downgrade() copies everything back.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_backfill_identity_auth"
down_revision = "0004_identity_auth_tables"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE users SET person_id = gen_random_uuid()")
    op.execute(
        """
        INSERT INTO people (id, organization_id, full_name, email, created_at)
        SELECT person_id, organization_id, full_name, lower(email), created_at FROM users
        """
    )
    op.execute(
        """
        INSERT INTO person_contacts (person_id, channel, value, is_primary)
        SELECT person_id, 'email', lower(email), true FROM users
        """
    )
    op.execute("INSERT INTO user_credentials (user_id, password_hash) SELECT id, password_hash FROM users")
    op.execute(
        """
        INSERT INTO user_roles (user_id, role_id, organization_id, site_id)
        SELECT u.id, r.id, u.organization_id, CASE WHEN r.scope = 'platform' THEN NULL ELSE u.site_id END
        FROM users u JOIN roles r ON r.code = u.role::text
        """
    )
    op.execute("UPDATE users SET account_status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END")

    op.alter_column("users", "person_id", nullable=False)
    op.create_foreign_key("fk_users_person", "users", "people", ["organization_id", "person_id"], ["organization_id", "id"], ondelete="RESTRICT")
    op.create_unique_constraint("uq_users_person_id", "users", ["person_id"])
    op.drop_constraint("users_organization_id_fkey", "users", type_="foreignkey")
    op.create_foreign_key("users_organization_id_fkey", "users", "organizations", ["organization_id"], ["id"], ondelete="RESTRICT")

    op.drop_index("ix_users_site_id", table_name="users")
    for column in ("password_hash", "full_name", "role", "site_id", "is_active"):
        op.drop_column("users", column)
    op.execute("ALTER TABLE users ADD COLUMN is_active boolean GENERATED ALWAYS AS (account_status = 'active') STORED")
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)

    # Installed after the backfill so legacy rows (e.g. an org-wide receptionist) are grandfathered.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_user_role_scope() RETURNS trigger AS $$
        DECLARE role_scope text;
        BEGIN
            SELECT scope INTO role_scope FROM roles WHERE id = NEW.role_id;
            IF role_scope = 'platform' AND NEW.site_id IS NOT NULL THEN
                RAISE EXCEPTION 'Role % is platform-wide and cannot be site-scoped', NEW.role_id USING ERRCODE = 'check_violation';
            END IF;
            IF role_scope = 'site' AND NEW.site_id IS NULL THEN
                RAISE EXCEPTION 'Role % requires a site', NEW.role_id USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute("CREATE TRIGGER trg_user_roles_scope BEFORE INSERT OR UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION enforce_user_role_scope()")


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_user_roles_scope ON user_roles")
    op.execute("DROP FUNCTION IF EXISTS enforce_user_role_scope()")

    user_role = postgresql.ENUM("super-admin", "site-admin", "host", "receptionist", name="user_role")
    user_role.create(op.get_bind(), checkfirst=True)
    op.execute("ALTER TABLE users DROP COLUMN is_active")
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("users", sa.Column("site_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sites.id", ondelete="SET NULL")))
    op.add_column("users", sa.Column("role", postgresql.ENUM(name="user_role", create_type=False)))
    op.add_column("users", sa.Column("full_name", sa.String(160)))
    op.add_column("users", sa.Column("password_hash", sa.String(255)))
    op.create_index("ix_users_site_id", "users", ["site_id"])

    op.execute("UPDATE users SET is_active = (account_status = 'active')")
    op.execute("UPDATE users u SET full_name = p.full_name FROM people p WHERE p.id = u.person_id")
    op.execute("UPDATE users u SET password_hash = c.password_hash FROM user_credentials c WHERE c.user_id = u.id")
    # The legacy schema holds one role and one site; keep the highest-priority role and its first site.
    op.execute(
        """
        UPDATE users u SET role = pick.code::user_role, site_id = pick.site_id
        FROM (
            SELECT DISTINCT ON (ur.user_id) ur.user_id, r.code, ur.site_id
            FROM user_roles ur JOIN roles r ON r.id = ur.role_id
            ORDER BY ur.user_id, r.priority DESC, ur.site_id NULLS FIRST
        ) pick
        WHERE pick.user_id = u.id
        """
    )
    for column in ("role", "full_name", "password_hash"):
        op.alter_column("users", column, nullable=False)

    op.drop_constraint("users_organization_id_fkey", "users", type_="foreignkey")
    op.create_foreign_key("users_organization_id_fkey", "users", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.drop_constraint("uq_users_person_id", "users", type_="unique")
    op.drop_constraint("fk_users_person", "users", type_="foreignkey")
    op.alter_column("users", "person_id", nullable=True)
    op.execute("DELETE FROM user_roles")
    op.execute("DELETE FROM user_credentials")
    op.execute("DELETE FROM person_contacts")
    op.execute("UPDATE users SET person_id = NULL")
    op.execute("DELETE FROM people")
