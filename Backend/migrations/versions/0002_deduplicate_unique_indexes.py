"""Remove legacy unique constraints duplicated by named unique indexes."""
from alembic import op
import sqlalchemy as sa

revision = "0002_deduplicate_unique_indexes"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    for table, column in (("users", "email"), ("visits", "pass_digest")):
        for constraint in inspector.get_unique_constraints(table):
            if constraint.get("column_names") == [column]:
                op.drop_constraint(constraint["name"], table, type_="unique")


def downgrade():
    op.create_unique_constraint("users_email_key", "users", ["email"])
    op.create_unique_constraint("visits_pass_digest_key", "visits", ["pass_digest"])
