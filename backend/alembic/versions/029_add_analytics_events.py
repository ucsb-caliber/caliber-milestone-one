"""add analytics events

Revision ID: 029_add_analytics_events
Revises: 028_add_assignment_progress_variant_data
Create Date: 2026-06-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "029_add_analytics_events"
down_revision = "028_add_assignment_progress_variant_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analytics_event",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_event_id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("event_name", sa.String(), nullable=False),
        sa.Column("actor_user_id", sa.String(), nullable=False),
        sa.Column("actor_role", sa.String(), nullable=False, server_default="student"),
        sa.Column("research_id", sa.String(), nullable=True),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("assignment_id", sa.Integer(), nullable=True),
        sa.Column("question_id", sa.Integer(), nullable=True),
        sa.Column("question_qid", sa.String(), nullable=True),
        sa.Column("part_id", sa.String(), nullable=True),
        sa.Column("route", sa.String(), nullable=False, server_default=""),
        sa.Column("event_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_event_id", name="uq_analytics_event_client_event_id"),
    )
    op.create_index(op.f("ix_analytics_event_client_event_id"), "analytics_event", ["client_event_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_session_id"), "analytics_event", ["session_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_event_name"), "analytics_event", ["event_name"], unique=False)
    op.create_index(op.f("ix_analytics_event_actor_user_id"), "analytics_event", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_actor_role"), "analytics_event", ["actor_role"], unique=False)
    op.create_index(op.f("ix_analytics_event_research_id"), "analytics_event", ["research_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_course_id"), "analytics_event", ["course_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_assignment_id"), "analytics_event", ["assignment_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_question_id"), "analytics_event", ["question_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_question_qid"), "analytics_event", ["question_qid"], unique=False)
    op.create_index(op.f("ix_analytics_event_part_id"), "analytics_event", ["part_id"], unique=False)
    op.create_index(op.f("ix_analytics_event_occurred_at"), "analytics_event", ["occurred_at"], unique=False)
    op.create_index(op.f("ix_analytics_event_received_at"), "analytics_event", ["received_at"], unique=False)
    op.create_index("ix_analytics_assignment_occurred", "analytics_event", ["assignment_id", "occurred_at"], unique=False)
    op.create_index("ix_analytics_question_occurred", "analytics_event", ["question_qid", "occurred_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_analytics_question_occurred", table_name="analytics_event")
    op.drop_index("ix_analytics_assignment_occurred", table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_received_at"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_occurred_at"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_part_id"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_question_qid"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_question_id"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_assignment_id"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_course_id"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_research_id"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_actor_role"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_actor_user_id"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_event_name"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_session_id"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_client_event_id"), table_name="analytics_event")
    op.drop_table("analytics_event")
