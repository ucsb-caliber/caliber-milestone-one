"""drop assignment instructor_email column

Revision ID: 018_drop_assignment_instructor_email
Revises: 017_drop_question_text_index
Create Date: 2026-02-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '018_drop_assignment_instructor_email'
down_revision = '017_drop_question_text_index'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns('assignment')]
    if 'instructor_email' in columns:
        op.drop_column('assignment', 'instructor_email')


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [col['name'] for col in inspector.get_columns('assignment')]
    if 'instructor_email' not in columns:
        op.add_column(
            'assignment',
            sa.Column('instructor_email', sa.String(), nullable=False, server_default='')
        )
