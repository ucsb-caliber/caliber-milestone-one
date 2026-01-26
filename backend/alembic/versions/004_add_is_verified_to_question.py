"""add is_verified column to question table

Revision ID: 004_add_is_verified_to_question
Revises: 003_add_user_table
Create Date: 2026-01-26 20:32:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004_add_is_verified_to_question'
down_revision = '003_add_user_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add is_verified column to question table."""
    # Add is_verified column with default value of false
    op.add_column('question', sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    """Remove is_verified column from question table."""
    # Drop is_verified column
    op.drop_column('question', 'is_verified')
