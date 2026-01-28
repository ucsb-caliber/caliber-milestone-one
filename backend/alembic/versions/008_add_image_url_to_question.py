"""add image_url to question

Revision ID: 008_add_image_url_to_question
Revises: 007_add_profile_preferences
Create Date: 2026-01-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '008_add_image_url_to_question'
down_revision = '007_add_profile_preferences'
branch_labels = None
depends_on = None


def upgrade():
    # Add image_url column to question table
    op.add_column('question', sa.Column('image_url', sa.String(), nullable=True))


def downgrade():
    # Remove image_url column from question table
    op.drop_column('question', 'image_url')
