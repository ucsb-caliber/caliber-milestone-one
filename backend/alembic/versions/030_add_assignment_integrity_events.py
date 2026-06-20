"""add assignment integrity events

Revision ID: 030_add_assignment_integrity_events
Revises: 029_add_analytics_events
Create Date: 2026-06-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "030_add_assignment_integrity_events"
down_revision = "029_add_analytics_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assignment_integrity_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.String(), nullable=False),
        sa.Column("question_key", sa.String(), nullable=True),
        sa.Column("part_id", sa.String(), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("event_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("client_created_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignment.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assignment_integrity_events_assignment_id", "assignment_integrity_events", ["assignment_id"])
    op.create_index("ix_assignment_integrity_events_student_id", "assignment_integrity_events", ["student_id"])
    op.create_index("ix_assignment_integrity_events_question_key", "assignment_integrity_events", ["question_key"])
    op.create_index("ix_assignment_integrity_events_part_id", "assignment_integrity_events", ["part_id"])
    op.create_index("ix_assignment_integrity_events_event_type", "assignment_integrity_events", ["event_type"])
    op.create_index("ix_assignment_integrity_events_client_created_at", "assignment_integrity_events", ["client_created_at"])
    op.create_index("ix_assignment_integrity_events_created_at", "assignment_integrity_events", ["created_at"])
    op.create_index(
        "ix_integrity_assignment_student_created",
        "assignment_integrity_events",
        ["assignment_id", "student_id", "created_at"],
    )
    op.create_index(
        "ix_integrity_assignment_event_type",
        "assignment_integrity_events",
        ["assignment_id", "event_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_integrity_assignment_event_type", table_name="assignment_integrity_events")
    op.drop_index("ix_integrity_assignment_student_created", table_name="assignment_integrity_events")
    op.drop_index("ix_assignment_integrity_events_created_at", table_name="assignment_integrity_events")
    op.drop_index("ix_assignment_integrity_events_client_created_at", table_name="assignment_integrity_events")
    op.drop_index("ix_assignment_integrity_events_event_type", table_name="assignment_integrity_events")
    op.drop_index("ix_assignment_integrity_events_part_id", table_name="assignment_integrity_events")
    op.drop_index("ix_assignment_integrity_events_question_key", table_name="assignment_integrity_events")
    op.drop_index("ix_assignment_integrity_events_student_id", table_name="assignment_integrity_events")
    op.drop_index("ix_assignment_integrity_events_assignment_id", table_name="assignment_integrity_events")
    op.drop_table("assignment_integrity_events")
