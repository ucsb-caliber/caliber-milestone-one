"""add user table with admin and teacher fields

Revision ID: 003_add_user_table
Revises: 002_add_question_fields
Create Date: 2026-01-25 22:46:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_add_user_table'
down_revision = '002_add_question_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create user table with admin and teacher boolean fields."""
    # Create user table
    op.create_table(
        'user',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('admin', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('teacher', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create index on user_id for query performance
    op.create_index(op.f('ix_user_user_id'), 'user', ['user_id'], unique=True)


def downgrade() -> None:
    """Drop user table."""
    # Drop index first
    op.drop_index(op.f('ix_user_user_id'), table_name='user')
    
    # Drop table
    op.drop_table('user')
