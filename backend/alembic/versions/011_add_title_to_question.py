"""add title to question

Revision ID: 011_add_title_to_question
Revises: 010_rename_class_tag_and_pdf_fields
Create Date: 2026-01-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '011_add_title_to_question'
down_revision = '010_rename_class_tag_and_pdf_fields'
branch_labels = None
depends_on = None


def upgrade():
    # Add title column to question table (required field, default empty string for existing records)
    op.add_column('question', sa.Column('title', sa.String(), nullable=False, server_default=''))


def downgrade():
    # Remove title column from question table
    op.drop_column('question', 'title')
