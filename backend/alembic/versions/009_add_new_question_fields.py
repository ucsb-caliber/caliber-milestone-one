"""add new question fields

Revision ID: 779d665eb1b2
Revises: 008_add_image_url_to_question
Create Date: 2026-01-29 03:57:25.270806

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '009_add_new_question_fields'
down_revision = '008_add_image_url_to_question'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new fields to question table
    op.add_column('question', sa.Column('class_tag', sa.String(), nullable=False, server_default=''))
    op.add_column('question', sa.Column('course_type', sa.String(), nullable=False, server_default=''))
    op.add_column('question', sa.Column('question_type', sa.String(), nullable=False, server_default=''))
    op.add_column('question', sa.Column('blooms_taxonomy', sa.String(), nullable=False, server_default=''))
    op.add_column('question', sa.Column('pdf_page', sa.Integer(), nullable=True))
    op.add_column('question', sa.Column('pdf_start_page', sa.Integer(), nullable=True))
    op.add_column('question', sa.Column('pdf_end_page', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Remove the new fields in reverse order
    op.drop_column('question', 'pdf_end_page')
    op.drop_column('question', 'pdf_start_page')
    op.drop_column('question', 'pdf_page')
    op.drop_column('question', 'blooms_taxonomy')
    op.drop_column('question', 'question_type')
    op.drop_column('question', 'course_type')
    op.drop_column('question', 'class_tag')
