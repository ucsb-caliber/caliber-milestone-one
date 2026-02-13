"""add course_code to course table

Revision ID: 015_add_course_code_to_course
Revises: 014_add_pending_to_user
Create Date: 2026-02-13 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa
import re
import secrets
import string


# revision identifiers, used by Alembic.
revision = '015_add_course_code_to_course'
down_revision = '014_add_pending_to_user'
branch_labels = None
depends_on = None


def _base_from_name(name: str) -> str:
    base = re.sub(r"\s+", "", (name or "").strip())
    base = re.sub(r"[^A-Za-z0-9]", "", base)
    return (base[:16] or "COURSE").upper()


def _candidate(base: str) -> str:
    suffix = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    return f"{base}_{suffix}"


def upgrade() -> None:
    op.add_column('course', sa.Column('course_code', sa.String(), nullable=True))

    bind = op.get_bind()
    rows = list(bind.execute(sa.text("SELECT id, course_name FROM course")))
    used_codes = set()

    for row in rows:
        course_id = row[0]
        course_name = row[1]
        base = _base_from_name(course_name)
        code = _candidate(base)
        while code in used_codes:
            code = _candidate(base)
        used_codes.add(code)
        bind.execute(
            sa.text("UPDATE course SET course_code = :code WHERE id = :id"),
            {"code": code, "id": course_id}
        )

    op.create_index(op.f('ix_course_course_code'), 'course', ['course_code'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_course_course_code'), table_name='course')
    op.drop_column('course', 'course_code')
