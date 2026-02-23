"""add user_school to questions

Revision ID: 322e870b69de
Revises: 017_drop_question_text_index
Create Date: 2026-02-22 21:39:31.340802

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '322e870b69de'
down_revision = '017_drop_question_text_index'
branch_labels = None
depends_on = None


def upgrade() -> None:
    #Adding the column as nullable=True FIRST (so old questions don't break)
    op.add_column('question', sa.Column('user_school', sa.String(), nullable=True))
    
    # Creating the index for faster searching
    op.create_index(op.f('ix_question_user_school'), 'question', ['user_school'], unique=False)


def downgrade() -> None:
    # Removing the index and the column if we need to undo this
    op.drop_index(op.f('ix_question_user_school'), table_name='question')
    op.drop_column('question', 'user_school')
    # ### end Alembic commands ###
