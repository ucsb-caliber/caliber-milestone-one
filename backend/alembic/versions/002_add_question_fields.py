"""add course, answer_choices, and correct_answer columns to question table

Revision ID: 002_add_question_fields
Revises: 001_add_user_id
Create Date: 2026-01-25 07:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002_add_question_fields'
down_revision = '001_add_user_id'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add course, answer_choices, and correct_answer columns to question table."""
    # Add new columns with default values
    op.add_column('question', sa.Column('course', sa.String(), nullable=True, server_default=''))
    op.add_column('question', sa.Column('answer_choices', sa.TEXT(), nullable=True, server_default='[]'))
    op.add_column('question', sa.Column('correct_answer', sa.String(), nullable=True, server_default=''))


def downgrade() -> None:
    """Remove course, answer_choices, and correct_answer columns from question table."""
    # Drop columns
    op.drop_column('question', 'correct_answer')
    op.drop_column('question', 'answer_choices')
    op.drop_column('question', 'course')
