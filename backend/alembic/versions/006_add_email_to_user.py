"""add email to user table

Revision ID: 006_add_email_to_user
Revises: 005_add_name_fields_to_user
Create Date: 2026-01-28 05:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006_add_email_to_user'
down_revision = '005_add_name_fields_to_user'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add email column to user table."""
    # Add email column
    op.add_column('user', sa.Column('email', sa.String(), nullable=True))
    
    # Create index on email for query performance
    op.create_index(op.f('ix_user_email'), 'user', ['email'], unique=False)


def downgrade() -> None:
    """Remove email column from user table."""
    # Drop index first
    op.drop_index(op.f('ix_user_email'), table_name='user')
    
    # Drop column
    op.drop_column('user', 'email')
