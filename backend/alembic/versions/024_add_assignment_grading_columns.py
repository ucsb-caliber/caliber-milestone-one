"""add assignment grading columns

Revision ID: 024_add_assignment_grading_columns
Revises: 023_add_course_pin_table
Create Date: 2026-03-10 00:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "024_add_assignment_grading_columns"
down_revision: Union[str, None] = "023_add_course_pin_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _existing_columns("assignment_progress")

    if "grading_data" not in columns:
        op.add_column(
            "assignment_progress",
            sa.Column("grading_data", sa.Text(), nullable=False, server_default="{}"),
        )
    if "grade_submitted" not in columns:
        op.add_column(
            "assignment_progress",
            sa.Column("grade_submitted", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )
    if "grade_submitted_at" not in columns:
        op.add_column(
            "assignment_progress",
            sa.Column("grade_submitted_at", sa.DateTime(), nullable=True),
        )
    if "score_earned" not in columns:
        op.add_column(
            "assignment_progress",
            sa.Column("score_earned", sa.Float(), nullable=True),
        )
    if "score_total" not in columns:
        op.add_column(
            "assignment_progress",
            sa.Column("score_total", sa.Float(), nullable=True),
        )


def downgrade() -> None:
    columns = _existing_columns("assignment_progress")
    if "score_total" in columns:
        op.drop_column("assignment_progress", "score_total")
    if "score_earned" in columns:
        op.drop_column("assignment_progress", "score_earned")
    if "grade_submitted_at" in columns:
        op.drop_column("assignment_progress", "grade_submitted_at")
    if "grade_submitted" in columns:
        op.drop_column("assignment_progress", "grade_submitted")
    if "grading_data" in columns:
        op.drop_column("assignment_progress", "grading_data")
