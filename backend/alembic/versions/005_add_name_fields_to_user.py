"""add first_name and last_name to user table

Revision ID: 005_add_name_fields_to_user
Revises: 004_add_is_verified_to_question
Create Date: 2026-01-28 04:36:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '005_add_name_fields_to_user'
down_revision = '004_add_is_verified_to_question'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add first_name and last_name columns to user table."""
    # Add first_name column
    op.add_column('user', sa.Column('first_name', sa.String(), nullable=True))
    
    # Add last_name column
    op.add_column('user', sa.Column('last_name', sa.String(), nullable=True))


def downgrade() -> None:
    """Remove first_name and last_name columns from user table."""
    # Drop columns
    op.drop_column('user', 'last_name')
    op.drop_column('user', 'first_name')
