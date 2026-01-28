"""add_enhanced_question_fields

Revision ID: fa1679986660
Revises: 007_add_profile_preferences
Create Date: 2026-01-28 05:58:13.018766

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fa1679986660'
down_revision = '007_add_profile_preferences'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new fields to question table
    op.add_column('question', sa.Column('course_type', sa.String(), server_default='', nullable=False))
    op.add_column('question', sa.Column('question_type', sa.String(), server_default='', nullable=False))
    op.add_column('question', sa.Column('blooms_taxonomy', sa.String(), server_default='', nullable=False))
    op.add_column('question', sa.Column('image_url', sa.String(), nullable=True))
    
    # Make text column use TEXT type for longer content (markdown support)
    op.alter_column('question', 'text',
                    existing_type=sa.String(),
                    type_=sa.TEXT(),
                    existing_nullable=False)


def downgrade() -> None:
    # Revert text column to String
    op.alter_column('question', 'text',
                    existing_type=sa.TEXT(),
                    type_=sa.String(),
                    existing_nullable=False)
    
    # Remove new columns
    op.drop_column('question', 'image_url')
    op.drop_column('question', 'blooms_taxonomy')
    op.drop_column('question', 'question_type')
    op.drop_column('question', 'course_type')
