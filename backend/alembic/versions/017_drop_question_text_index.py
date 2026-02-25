"""drop question.text btree index

Revision ID: 017_drop_question_text_index
Revises: 016_add_assignment_progress_table
Create Date: 2026-02-18 19:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '017_drop_question_text_index'
down_revision = '016_add_assignment_progress_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This index can fail on Postgres when long extracted text is inserted.
    op.execute(sa.text("DROP INDEX IF EXISTS ix_question_text"))


def downgrade() -> None:
    op.create_index('ix_question_text', 'question', ['text'], unique=False)
