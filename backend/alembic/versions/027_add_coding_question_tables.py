"""add coding question private and run tables

Revision ID: 027_add_coding_question_tables
Revises: 026_add_research_id_to_assignment_progress
Create Date: 2026-04-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "027_add_coding_question_tables"
down_revision: Union[str, None] = "026_add_research_id_to_assignment_progress"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_tables() -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return set(inspector.get_table_names())


def _existing_indexes(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = inspect(bind)
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def upgrade() -> None:
    tables = _existing_tables()

    if "coding_question_private" not in tables:
        op.create_table(
            "coding_question_private",
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("question.id"), nullable=False),
            sa.Column("hidden_tests", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("question_id"),
        )

    if "coding_run" not in tables:
        op.create_table(
            "coding_run",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("assignment_id", sa.Integer(), nullable=True),
            sa.Column("question_id", sa.Integer(), sa.ForeignKey("question.id"), nullable=False),
            sa.Column("student_id", sa.String(), nullable=False),
            sa.Column("language", sa.String(), nullable=False, server_default="cpp"),
            sa.Column("source_code", sa.Text(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="queued"),
            sa.Column("verdict", sa.String(), nullable=False, server_default=""),
            sa.Column("compile_output", sa.Text(), nullable=False, server_default=""),
            sa.Column("runtime_output", sa.Text(), nullable=False, server_default=""),
            sa.Column("result_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("is_submit_run", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    indexes = _existing_indexes("coding_run")
    if "ix_coding_run_assignment_id" not in indexes:
        op.create_index("ix_coding_run_assignment_id", "coding_run", ["assignment_id"])
    if "ix_coding_run_question_id" not in indexes:
        op.create_index("ix_coding_run_question_id", "coding_run", ["question_id"])
    if "ix_coding_run_student_id" not in indexes:
        op.create_index("ix_coding_run_student_id", "coding_run", ["student_id"])


def downgrade() -> None:
    tables = _existing_tables()

    if "coding_run" in tables:
        indexes = _existing_indexes("coding_run")
        if "ix_coding_run_student_id" in indexes:
            op.drop_index("ix_coding_run_student_id", table_name="coding_run")
        if "ix_coding_run_question_id" in indexes:
            op.drop_index("ix_coding_run_question_id", table_name="coding_run")
        if "ix_coding_run_assignment_id" in indexes:
            op.drop_index("ix_coding_run_assignment_id", table_name="coding_run")
        op.drop_table("coding_run")

    tables = _existing_tables()
    if "coding_question_private" in tables:
        op.drop_table("coding_question_private")
