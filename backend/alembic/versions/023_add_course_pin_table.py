"""add course pin table

Revision ID: 023_add_course_pin_table
Revises: 022_add_user_school_to_question
Create Date: 2026-02-24 00:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "023_add_course_pin_table"
down_revision: Union[str, None] = "022_add_user_school_to_question"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "course_pin" not in tables:
        op.create_table(
            "course_pin",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("course_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["user.user_id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("course_id", "user_id", name="uq_course_pin_course_user"),
        )
        inspector = inspect(bind)

    indexes = {idx["name"] for idx in inspector.get_indexes("course_pin")}
    idx_course = op.f("ix_course_pin_course_id")
    idx_user = op.f("ix_course_pin_user_id")
    if idx_course not in indexes:
        op.create_index(idx_course, "course_pin", ["course_id"], unique=False)
    if idx_user not in indexes:
        op.create_index(idx_user, "course_pin", ["user_id"], unique=False)

    unique_constraints = {uc["name"] for uc in inspector.get_unique_constraints("course_pin")}
    if "uq_course_pin_course_user" not in unique_constraints:
        op.create_unique_constraint("uq_course_pin_course_user", "course_pin", ["course_id", "user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "course_pin" not in tables:
        return

    indexes = {idx["name"] for idx in inspector.get_indexes("course_pin")}
    idx_user = op.f("ix_course_pin_user_id")
    idx_course = op.f("ix_course_pin_course_id")
    if idx_user in indexes:
        op.drop_index(idx_user, table_name="course_pin")
    if idx_course in indexes:
        op.drop_index(idx_course, table_name="course_pin")

    unique_constraints = {uc["name"] for uc in inspector.get_unique_constraints("course_pin")}
    if "uq_course_pin_course_user" in unique_constraints:
        op.drop_constraint("uq_course_pin_course_user", "course_pin", type_="unique")

    op.drop_table("course_pin")
