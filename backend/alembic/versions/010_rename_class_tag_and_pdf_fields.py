"""rename class_tag to school and replace pdf page fields with pdf_url

Revision ID: 010_rename_class_tag_and_pdf_fields
Revises: 009_add_new_question_fields
Create Date: 2026-01-29 05:51:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '010_rename_class_tag_and_pdf_fields'
down_revision = '009_add_new_question_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename class_tag to school
    with op.batch_alter_table('question') as batch_op:
        batch_op.alter_column('class_tag', new_column_name='school')
    
    # Remove PDF page fields
    op.drop_column('question', 'pdf_page')
    op.drop_column('question', 'pdf_start_page')
    op.drop_column('question', 'pdf_end_page')
    
    # Add pdf_url field
    op.add_column('question', sa.Column('pdf_url', sa.String(), nullable=True))


def downgrade() -> None:
    # Remove pdf_url
    op.drop_column('question', 'pdf_url')
    
    # Re-add PDF page fields
    op.add_column('question', sa.Column('pdf_page', sa.Integer(), nullable=True))
    op.add_column('question', sa.Column('pdf_start_page', sa.Integer(), nullable=True))
    op.add_column('question', sa.Column('pdf_end_page', sa.Integer(), nullable=True))
    
    # Rename school back to class_tag
    with op.batch_alter_table('question') as batch_op:
        batch_op.alter_column('school', new_column_name='class_tag')
