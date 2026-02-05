"""update assignment fields

Revision ID: 013_update_assignment_fields
Revises: 012_add_course_tables
Create Date: 2026-02-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '013_update_assignment_fields'
down_revision = '012_add_course_tables'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to assignment table
    op.add_column('assignment', sa.Column('node_id', sa.String(), nullable=True))
    op.add_column('assignment', sa.Column('instructor_email', sa.String(), nullable=False, server_default=''))
    op.add_column('assignment', sa.Column('instructor_id', sa.String(), nullable=False, server_default=''))
    op.add_column('assignment', sa.Column('course', sa.String(), nullable=False, server_default=''))
    op.add_column('assignment', sa.Column('type', sa.String(), nullable=False, server_default='Other'))
    op.add_column('assignment', sa.Column('release_date', sa.DateTime(), nullable=True))
    op.add_column('assignment', sa.Column('due_date_soft', sa.DateTime(), nullable=True))
    op.add_column('assignment', sa.Column('due_date_hard', sa.DateTime(), nullable=True))
    op.add_column('assignment', sa.Column('late_policy_id', sa.String(), nullable=True))
    op.add_column('assignment', sa.Column('assignment_questions', sa.Text(), nullable=False, server_default='[]'))
    
    # Migrate due_date values to due_date_soft if due_date column exists, then drop it
    # Using a try/except pattern via raw SQL to handle case where column was already dropped
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('assignment')]
    if 'due_date' in columns:
        op.execute('UPDATE assignment SET due_date_soft = due_date WHERE due_date IS NOT NULL')
        op.drop_column('assignment', 'due_date')


def downgrade():
    # Re-add the due_date column that was dropped
    op.add_column('assignment', sa.Column('due_date', sa.DateTime(), nullable=True))
    
    # Remove new columns
    op.drop_column('assignment', 'assignment_questions')
    op.drop_column('assignment', 'late_policy_id')
    op.drop_column('assignment', 'due_date_hard')
    op.drop_column('assignment', 'due_date_soft')
    op.drop_column('assignment', 'release_date')
    op.drop_column('assignment', 'type')
    op.drop_column('assignment', 'course')
    op.drop_column('assignment', 'instructor_id')
    op.drop_column('assignment', 'instructor_email')
    op.drop_column('assignment', 'node_id')
