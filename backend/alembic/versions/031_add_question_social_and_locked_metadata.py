"""add question social and locked metadata

Revision ID: 031_add_question_social_and_locked_metadata
Revises: 030_add_assignment_integrity_events
Create Date: 2026-06-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "031_add_question_social_and_locked_metadata"
down_revision = "030_add_assignment_integrity_events"
branch_labels = None
depends_on = None


def _existing_columns(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _existing_tables() -> set[str]:
    return set(inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    question_columns = _existing_columns("question")
    if "original_author_user_id" not in question_columns:
        op.add_column("question", sa.Column("original_author_user_id", sa.String(), nullable=True))
        op.create_index(op.f("ix_question_original_author_user_id"), "question", ["original_author_user_id"], unique=False)
        op.execute("UPDATE question SET original_author_user_id = COALESCE(owner_user_id, user_id) WHERE original_author_user_id IS NULL OR original_author_user_id = ''")
    if "copied_from_question_id" not in question_columns:
        op.add_column("question", sa.Column("copied_from_question_id", sa.Integer(), nullable=True))
        op.create_index(op.f("ix_question_copied_from_question_id"), "question", ["copied_from_question_id"], unique=False)
    if "copied_from_qid" not in question_columns:
        op.add_column("question", sa.Column("copied_from_qid", sa.String(), nullable=True))
        op.create_index(op.f("ix_question_copied_from_qid"), "question", ["copied_from_qid"], unique=False)

    tables = _existing_tables()
    if "question_like" not in tables:
        op.create_table(
            "question_like",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("question_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["question_id"], ["question.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("question_id", "user_id", name="uq_question_like_question_user"),
        )
        op.create_index(op.f("ix_question_like_question_id"), "question_like", ["question_id"], unique=False)
        op.create_index(op.f("ix_question_like_user_id"), "question_like", ["user_id"], unique=False)

    if "question_comment" not in tables:
        op.create_table(
            "question_comment",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("question_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["question_id"], ["question.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_question_comment_question_id"), "question_comment", ["question_id"], unique=False)
        op.create_index(op.f("ix_question_comment_user_id"), "question_comment", ["user_id"], unique=False)
        op.create_index("ix_question_comment_question_created", "question_comment", ["question_id", "created_at"], unique=False)


def downgrade() -> None:
    tables = _existing_tables()
    if "question_comment" in tables:
        op.drop_index("ix_question_comment_question_created", table_name="question_comment")
        op.drop_index(op.f("ix_question_comment_user_id"), table_name="question_comment")
        op.drop_index(op.f("ix_question_comment_question_id"), table_name="question_comment")
        op.drop_table("question_comment")

    if "question_like" in tables:
        op.drop_index(op.f("ix_question_like_user_id"), table_name="question_like")
        op.drop_index(op.f("ix_question_like_question_id"), table_name="question_like")
        op.drop_table("question_like")

    question_columns = _existing_columns("question")
    if "copied_from_qid" in question_columns:
        op.drop_index(op.f("ix_question_copied_from_qid"), table_name="question")
        op.drop_column("question", "copied_from_qid")
    if "copied_from_question_id" in question_columns:
        op.drop_index(op.f("ix_question_copied_from_question_id"), table_name="question")
        op.drop_column("question", "copied_from_question_id")
    if "original_author_user_id" in question_columns:
        op.drop_index(op.f("ix_question_original_author_user_id"), table_name="question")
        op.drop_column("question", "original_author_user_id")
