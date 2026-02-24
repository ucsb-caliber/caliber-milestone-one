"""add school_name to user

Revision ID: 021_add_school_name_to_user
Revises: 020_add_qid_to_question
Create Date: 2026-02-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "021_add_school_name_to_user"
down_revision = "020_add_qid_to_question"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("school_name", sa.String(), nullable=False, server_default=""))
    op.alter_column("user", "school_name", server_default=None)


def downgrade() -> None:
    op.drop_column("user", "school_name")

