"""add qid to question

Revision ID: 020_add_qid_to_question
Revises: 019_add_rls_assignment_progress
Create Date: 2026-02-24 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '020_add_qid_to_question'
down_revision: Union[str, None] = '019_add_rls_assignment_progress'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Add column as nullable for safe backfill.
    with op.batch_alter_table('question') as batch_op:
        batch_op.add_column(sa.Column('qid', sa.String(), nullable=True))

    # 2) Backfill existing rows with deterministic unique IDs.
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id FROM question WHERE qid IS NULL OR qid = ''")).fetchall()
    for row in rows:
        qid = f"Q{int(row.id):08d}"
        bind.execute(
            sa.text("UPDATE question SET qid = :qid WHERE id = :id"),
            {"qid": qid, "id": row.id},
        )

    # 3) Enforce uniqueness and non-nullability.
    with op.batch_alter_table('question') as batch_op:
        batch_op.alter_column('qid', existing_type=sa.String(), nullable=False)
        batch_op.create_index('ix_question_qid', ['qid'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('question') as batch_op:
        batch_op.drop_index('ix_question_qid')
        batch_op.drop_column('qid')
