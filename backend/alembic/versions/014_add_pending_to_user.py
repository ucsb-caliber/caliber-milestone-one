"""add pending to user table

Revision ID: 014_add_pending_to_user
Revises: 013_update_assignment_fields
Create Date: 2026-02-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '014_add_pending_to_user'
down_revision = '013_update_assignment_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add pending column to user table."""
    op.add_column('user', sa.Column('pending', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    """Remove pending column from user table."""
    op.drop_column('user', 'pending')
