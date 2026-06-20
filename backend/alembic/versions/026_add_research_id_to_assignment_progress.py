"""add research_id to assignment_progress

Revision ID: 026_add_research_id_to_assignment_progress
Revises: 025_add_assignment_grade_release_columns
Create Date: 2026-04-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "026_add_research_id_to_assignment_progress"
down_revision: Union[str, None] = "025_add_assignment_grade_release_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_columns(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {col["name"] for col in inspector.get_columns(table_name)}


def _existing_indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    columns = _existing_columns("assignment_progress")
    if "research_id" not in columns:
        op.add_column(
            "assignment_progress",
            sa.Column("research_id", sa.String(), nullable=True),
        )

    indexes = _existing_indexes("assignment_progress")
    if "ix_assignment_progress_research_id" not in indexes:
        op.create_index(
            "ix_assignment_progress_research_id",
            "assignment_progress",
            ["research_id"],
        )


def downgrade() -> None:
    indexes = _existing_indexes("assignment_progress")
    if "ix_assignment_progress_research_id" in indexes:
        op.drop_index("ix_assignment_progress_research_id", table_name="assignment_progress")

    columns = _existing_columns("assignment_progress")
    if "research_id" in columns:
        op.drop_column("assignment_progress", "research_id")
