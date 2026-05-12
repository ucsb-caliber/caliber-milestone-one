"""add question_time_ms to assignment_progress

Revision ID: 029_add_question_time_ms_to_assignment_progress
Revises: 028_add_rls_to_caliber_db
Create Date: 2026-05-10 23:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "029_add_question_time_ms_to_assignment_progress"
down_revision: Union[str, None] = "028_add_rls_to_caliber_db"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _existing_columns("assignment_progress")
    if "question_time_ms" not in columns:
        op.add_column(
            "assignment_progress",
            sa.Column("question_time_ms", sa.Text(), nullable=False, server_default="{}"),
        )


def downgrade() -> None:
    columns = _existing_columns("assignment_progress")
    if "question_time_ms" in columns:
        op.drop_column("assignment_progress", "question_time_ms")
