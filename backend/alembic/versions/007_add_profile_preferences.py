"""add profile preferences to user table

Revision ID: 007_add_profile_preferences
Revises: 006_add_email_to_user
Create Date: 2026-01-28 05:32:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007_add_profile_preferences'
down_revision = '006_add_email_to_user'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add profile preference columns to user table."""
    # Add icon_shape column with default 'circle'
    op.add_column('user', sa.Column('icon_shape', sa.String(), nullable=False, server_default='circle'))
    
    # Add icon_color column with default '#4f46e5'
    op.add_column('user', sa.Column('icon_color', sa.String(), nullable=False, server_default='#4f46e5'))
    
    # Add initials column (nullable, max 2 chars)
    op.add_column('user', sa.Column('initials', sa.String(length=2), nullable=True))


def downgrade() -> None:
    """Remove profile preference columns from user table."""
    # Drop columns
    op.drop_column('user', 'initials')
    op.drop_column('user', 'icon_color')
    op.drop_column('user', 'icon_shape')
