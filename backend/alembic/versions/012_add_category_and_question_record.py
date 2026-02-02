"""add category and question_record tables

Revision ID: 012_add_category_and_question_record
Revises: 011_add_title_to_question
Create Date: 2026-02-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.types import JSON


# revision identifiers, used by Alembic.
revision = "012_add_category_and_question_record"
down_revision = "011_add_title_to_question"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create category table
    op.create_table(
        "category",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_category_name"), "category", ["name"], unique=True)

    # Create question_record table
    op.create_table(
        "question_record",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.String(), nullable=False),
        sa.Column("start_page", sa.Integer(), nullable=True),
        sa.Column("page_nums", JSON, nullable=True),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("text_hash", sa.String(), nullable=True),
        sa.Column("image_crops", JSON, nullable=True),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("metadata", JSON, nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("category_name", sa.String(), nullable=True),
        sa.Column("embedding", JSON, nullable=True),
        sa.ForeignKeyConstraint(["category_id"], ["category.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_question_record_question_id"), "question_record", ["question_id"], unique=True)
    op.create_index(op.f("ix_question_record_text"), "question_record", ["text"], unique=False)
    op.create_index(op.f("ix_question_record_text_hash"), "question_record", ["text_hash"], unique=False)
    op.create_index(op.f("ix_question_record_category_id"), "question_record", ["category_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_question_record_category_id"), table_name="question_record")
    op.drop_index(op.f("ix_question_record_text_hash"), table_name="question_record")
    op.drop_index(op.f("ix_question_record_text"), table_name="question_record")
    op.drop_index(op.f("ix_question_record_question_id"), table_name="question_record")
    op.drop_table("question_record")
    op.drop_index(op.f("ix_category_name"), table_name="category")
    op.drop_table("category")
