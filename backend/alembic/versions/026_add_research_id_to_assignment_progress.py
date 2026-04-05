"""add research_id to assignment_progress

Revision ID: 026_add_research_id_to_assignment_progress
Revises: 025_add_assignment_grade_release_columns
Create Date: 2026-04-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "026_add_research_id_to_assignment_progress"
down_revision: Union[str, None] = "025_add_assignment_grade_release_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assignment_progress",
        sa.Column("research_id", sa.String(), nullable=True),
    )
    op.create_index(
        "ix_assignment_progress_research_id",
        "assignment_progress",
        ["research_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_assignment_progress_research_id", table_name="assignment_progress")
    op.drop_column("assignment_progress", "research_id")
