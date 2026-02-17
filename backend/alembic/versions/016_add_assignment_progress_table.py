"""add assignment_progress table

Revision ID: 016_add_assignment_progress_table
Revises: 015_add_course_code_to_course
Create Date: 2026-02-13 00:00:02.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '016_add_assignment_progress_table'
down_revision = '015_add_course_code_to_course'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'assignment_progress',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('assignment_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('answers', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('current_question_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('submitted', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['assignment_id'], ['assignment.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['user.user_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('assignment_id', 'student_id', name='uq_assignment_progress_assignment_student')
    )
    op.create_index(op.f('ix_assignment_progress_assignment_id'), 'assignment_progress', ['assignment_id'], unique=False)
    op.create_index(op.f('ix_assignment_progress_student_id'), 'assignment_progress', ['student_id'], unique=False)

    bind = op.get_bind()
    rows = list(bind.execute(sa.text("""
        SELECT a.id AS assignment_id, cs.student_id AS student_id
        FROM assignment a
        JOIN course_student cs ON cs.course_id = a.course_id
    """)))
    for row in rows:
        bind.execute(sa.text("""
            INSERT INTO assignment_progress (assignment_id, student_id, answers, current_question_index, submitted, created_at, updated_at)
            VALUES (:assignment_id, :student_id, '{}', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (assignment_id, student_id) DO NOTHING
        """), {
            "assignment_id": row[0],
            "student_id": row[1]
        })


def downgrade() -> None:
    op.drop_index(op.f('ix_assignment_progress_student_id'), table_name='assignment_progress')
    op.drop_index(op.f('ix_assignment_progress_assignment_id'), table_name='assignment_progress')
    op.drop_table('assignment_progress')
