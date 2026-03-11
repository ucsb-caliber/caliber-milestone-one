"""add assignment grade release columns

Revision ID: 025_add_assignment_grade_release_columns
Revises: 024_add_assignment_grading_columns
Create Date: 2026-03-10 00:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "025_add_assignment_grade_release_columns"
down_revision: Union[str, None] = "024_add_assignment_grading_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    columns = _existing_columns("assignment")

    if "grade_released" not in columns:
        op.add_column(
            "assignment",
            sa.Column("grade_released", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )
    if "grade_released_at" not in columns:
        op.add_column(
            "assignment",
            sa.Column("grade_released_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    columns = _existing_columns("assignment")
    if "grade_released_at" in columns:
        op.drop_column("assignment", "grade_released_at")
    if "grade_released" in columns:
        op.drop_column("assignment", "grade_released")
