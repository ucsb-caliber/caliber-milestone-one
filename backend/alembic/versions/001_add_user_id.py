"""add user_id column to question table

Revision ID: 001_add_user_id
Revises: 
Create Date: 2026-01-25 02:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001_add_user_id'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add user_id column to question table for per-user data isolation."""
    # Add user_id column
    op.add_column('question', sa.Column('user_id', sa.String(), nullable=True))
    
    # Create index on user_id for query performance
    op.create_index(op.f('ix_question_user_id'), 'question', ['user_id'], unique=False)
    
    # Note: We're making it nullable initially to avoid breaking existing data
    # If you want to make it NOT NULL, you'd need to:
    # 1. Set a default value for existing rows first
    # 2. Then alter the column to NOT NULL


def downgrade() -> None:
    """Remove user_id column from question table."""
    # Drop index first
    op.drop_index(op.f('ix_question_user_id'), table_name='question')
    
    # Drop column
    op.drop_column('question', 'user_id')
