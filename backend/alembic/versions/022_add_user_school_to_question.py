"""add user_school to question

Revision ID: 022_add_user_school_to_question
Revises: 021_add_school_name_to_user
Create Date: 2026-02-24 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "022_add_user_school_to_question"
down_revision = "021_add_school_name_to_user"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    columns = {col["name"] for col in inspector.get_columns("question")}
    if "user_school" not in columns:
        op.add_column("question", sa.Column("user_school", sa.String(), nullable=True))

    indexes = {idx["name"] for idx in inspector.get_indexes("question")}
    idx_name = op.f("ix_question_user_school")
    if idx_name not in indexes:
        op.create_index(idx_name, "question", ["user_school"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    indexes = {idx["name"] for idx in inspector.get_indexes("question")}
    idx_name = op.f("ix_question_user_school")
    if idx_name in indexes:
        op.drop_index(idx_name, table_name="question")

    columns = {col["name"] for col in inspector.get_columns("question")}
    if "user_school" in columns:
        op.drop_column("question", "user_school")
