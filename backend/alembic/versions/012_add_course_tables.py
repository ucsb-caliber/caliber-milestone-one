"""add course tables

Revision ID: 012_add_course_tables
Revises: 011_add_title_to_question
Create Date: 2026-02-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '012_add_course_tables'
down_revision = '011_add_title_to_question'
branch_labels = None
depends_on = None


def upgrade():
    # Create course table
    op.create_table(
        'course',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_name', sa.String(), nullable=False),
        sa.Column('school_name', sa.String(), nullable=False, server_default=''),
        sa.Column('instructor_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['instructor_id'], ['user.user_id'], ondelete='RESTRICT'),
    )
    op.create_index(op.f('ix_course_course_name'), 'course', ['course_name'])
    op.create_index(op.f('ix_course_instructor_id'), 'course', ['instructor_id'])

    # Create assignment table
    op.create_table(
        'assignment',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False, server_default=''),
        sa.Column('due_date', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['course_id'], ['course.id'], ),
    )
    op.create_index(op.f('ix_assignment_course_id'), 'assignment', ['course_id'])
    op.create_index(op.f('ix_assignment_title'), 'assignment', ['title'])

    # Create course_student association table
    op.create_table(
        'course_student',
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('enrolled_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('course_id', 'student_id'),
        sa.ForeignKeyConstraint(['course_id'], ['course.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['user.user_id'], ondelete='CASCADE'),
    )


def downgrade():
    # Drop tables in reverse order
    op.drop_table('course_student')
    op.drop_index(op.f('ix_assignment_title'), table_name='assignment')
    op.drop_index(op.f('ix_assignment_course_id'), table_name='assignment')
    op.drop_table('assignment')
    op.drop_index(op.f('ix_course_instructor_id'), table_name='course')
    op.drop_index(op.f('ix_course_course_name'), table_name='course')
    op.drop_table('course')
