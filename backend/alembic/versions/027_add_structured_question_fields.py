"""add structured question fields

Revision ID: 027_add_structured_question_fields
Revises: 026_add_research_id_to_assignment_progress
Create Date: 2026-06-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "027_add_structured_question_fields"
down_revision: Union[str, None] = "026_add_research_id_to_assignment_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column_if_missing(table_name: str, column_name: str, column: sa.Column) -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name not in existing_columns:
        op.add_column(table_name, column)


def _add_index_if_missing(table_name: str, index_name: str, columns: list[str]) -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_indexes = {idx["name"] for idx in inspector.get_indexes(table_name)}
    if index_name not in existing_indexes:
        op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = {idx["name"]: idx for idx in inspector.get_indexes("question")}
    if indexes.get("ix_question_qid", {}).get("unique"):
        op.drop_index("ix_question_qid", table_name="question")
        op.create_index("ix_question_qid", "question", ["qid"], unique=False)

    _add_column_if_missing("question", "version", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    _add_column_if_missing("question", "content", sa.Column("content", sa.Text(), nullable=False, server_default=""))
    _add_column_if_missing("question", "owner_user_id", sa.Column("owner_user_id", sa.String(), nullable=True))
    _add_column_if_missing("question", "draft_state", sa.Column("draft_state", sa.String(), nullable=False, server_default="ready"))
    _add_column_if_missing("question", "visibility", sa.Column("visibility", sa.String(), nullable=False, server_default="private"))
    _add_column_if_missing("question", "origin", sa.Column("origin", sa.String(), nullable=False, server_default="manual"))
    _add_column_if_missing("question", "school_scope", sa.Column("school_scope", sa.String(), nullable=False, server_default=""))
    _add_column_if_missing("question", "course_scope", sa.Column("course_scope", sa.String(), nullable=True))
    _add_column_if_missing("question", "source_repo", sa.Column("source_repo", sa.String(), nullable=True))
    _add_column_if_missing("question", "source_path", sa.Column("source_path", sa.String(), nullable=True))
    _add_column_if_missing("question", "source_commit", sa.Column("source_commit", sa.String(), nullable=True))
    _add_column_if_missing("question", "content_hash", sa.Column("content_hash", sa.String(), nullable=False, server_default=""))
    _add_column_if_missing("question", "reviewed_at", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    _add_column_if_missing("question", "reviewed_by", sa.Column("reviewed_by", sa.String(), nullable=True))
    _add_column_if_missing("question", "updated_at", sa.Column("updated_at", sa.DateTime(), nullable=True))

    bind = op.get_bind()
    bind.execute(sa.text("UPDATE question SET owner_user_id = user_id WHERE owner_user_id IS NULL"))
    bind.execute(sa.text("UPDATE question SET draft_state = CASE WHEN is_verified THEN 'ready' ELSE 'draft' END WHERE draft_state IS NULL OR draft_state = ''"))
    bind.execute(sa.text("UPDATE question SET school_scope = COALESCE(NULLIF(user_school, ''), NULLIF(school, ''), '') WHERE school_scope IS NULL OR school_scope = ''"))
    bind.execute(sa.text("UPDATE question SET updated_at = created_at WHERE updated_at IS NULL"))

    _add_index_if_missing("question", "ix_question_version", ["version"])
    _add_index_if_missing("question", "ix_question_owner_user_id", ["owner_user_id"])
    _add_index_if_missing("question", "ix_question_draft_state", ["draft_state"])
    _add_index_if_missing("question", "ix_question_visibility", ["visibility"])
    _add_index_if_missing("question", "ix_question_origin", ["origin"])
    _add_index_if_missing("question", "ix_question_school_scope", ["school_scope"])
    _add_index_if_missing("question", "ix_question_course_scope", ["course_scope"])
    _add_index_if_missing("question", "ix_question_content_hash", ["content_hash"])
    _add_index_if_missing("question", "ix_question_reviewed_by", ["reviewed_by"])
    try:
        op.create_unique_constraint("uq_question_qid_version", "question", ["qid", "version"])
    except Exception:
        pass

    _add_column_if_missing("assignment", "assignment_question_refs", sa.Column("assignment_question_refs", sa.Text(), nullable=False, server_default="[]"))


def downgrade() -> None:
    for index_name in [
        "ix_question_content_hash",
        "ix_question_reviewed_by",
        "ix_question_course_scope",
        "ix_question_school_scope",
        "ix_question_origin",
        "ix_question_visibility",
        "ix_question_draft_state",
        "ix_question_owner_user_id",
        "ix_question_version",
    ]:
        try:
            op.drop_index(index_name, table_name="question")
        except Exception:
            pass

    try:
        op.drop_constraint("uq_question_qid_version", "question", type_="unique")
    except Exception:
        pass

    for column_name in [
        "updated_at",
        "reviewed_by",
        "reviewed_at",
        "content_hash",
        "source_commit",
        "source_path",
        "source_repo",
        "course_scope",
        "school_scope",
        "origin",
        "visibility",
        "draft_state",
        "owner_user_id",
        "content",
        "version",
    ]:
        try:
            op.drop_column("question", column_name)
        except Exception:
            pass

    try:
        op.drop_column("assignment", "assignment_question_refs")
    except Exception:
        pass
