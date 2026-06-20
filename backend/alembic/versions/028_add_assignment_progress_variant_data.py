"""add assignment progress variant data

Revision ID: 028_add_assignment_progress_variant_data
Revises: 027_add_structured_question_fields
Create Date: 2026-06-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "028_add_assignment_progress_variant_data"
down_revision = "027_add_structured_question_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assignment_progress",
        sa.Column("variant_data", sa.Text(), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("assignment_progress", "variant_data")
