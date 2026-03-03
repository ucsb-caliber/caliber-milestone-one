"""
Idempotent startup schema maintenance for Caliber backend.

This script keeps additive schema changes in place and removes legacy local
roster tables/FKs from caliber-db.
"""
import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")


def _exec(cur, statement: str) -> None:
    try:
        cur.execute(statement)
        print(f"OK: {statement.strip()[:96]}")
    except Exception as exc:  # noqa: BLE001
        print(f"SKIP ({exc}): {statement.strip()[:96]}")


def _run_postgres_migrations() -> None:
    import psycopg2

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cur = conn.cursor()

    additive_statements = [
        # Historical additive fields retained for compatibility.
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS node_id VARCHAR",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS instructor_email VARCHAR NOT NULL DEFAULT ''",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS instructor_id VARCHAR NOT NULL DEFAULT ''",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS course VARCHAR NOT NULL DEFAULT ''",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS type VARCHAR NOT NULL DEFAULT 'Other'",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS release_date TIMESTAMP",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS due_date_soft TIMESTAMP",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS due_date_hard TIMESTAMP",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS late_policy_id VARCHAR",
        "ALTER TABLE assignment ADD COLUMN IF NOT EXISTS assignment_questions TEXT NOT NULL DEFAULT '[]'",
        # Correct assignment_progress table (the old script accidentally created assignmentprogress).
        """
        CREATE TABLE IF NOT EXISTS assignment_progress (
            id SERIAL PRIMARY KEY,
            assignment_id INTEGER NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
            student_id VARCHAR NOT NULL,
            answers TEXT NOT NULL DEFAULT '{}',
            current_question_index INTEGER NOT NULL DEFAULT 0,
            submitted BOOLEAN NOT NULL DEFAULT FALSE,
            submitted_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_assignment_progress_assignment_student UNIQUE (assignment_id, student_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_assignment_course_id ON assignment(course_id)",
        "CREATE INDEX IF NOT EXISTS ix_assignment_progress_assignment_id ON assignment_progress(assignment_id)",
        "CREATE INDEX IF NOT EXISTS ix_assignment_progress_student_id ON assignment_progress(student_id)",
    ]

    for statement in additive_statements:
        _exec(cur, statement)

    # Cleanup old typo table from previous startup migration.
    _exec(cur, "DROP TABLE IF EXISTS assignmentprogress")

    roster_cleanup_statements = [
        # Remove legacy FKs so course/user tables can be dropped.
        "ALTER TABLE assignment DROP CONSTRAINT IF EXISTS assignment_course_id_fkey",
        "ALTER TABLE assignment_progress DROP CONSTRAINT IF EXISTS assignment_progress_student_id_fkey",
        # Remove Supabase-RLS policies that reference dropped legacy tables.
        "DROP POLICY IF EXISTS ap_admin_select_all ON assignment_progress",
        "DROP POLICY IF EXISTS ap_instructor_select_course ON assignment_progress",
        "DROP POLICY IF EXISTS ap_student_update_own ON assignment_progress",
        "DROP POLICY IF EXISTS ap_student_insert_own ON assignment_progress",
        "DROP POLICY IF EXISTS ap_student_select_own ON assignment_progress",
        "ALTER TABLE assignment_progress NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE assignment_progress DISABLE ROW LEVEL SECURITY",
        # Drop legacy roster mirror tables from caliber-db.
        "DROP TABLE IF EXISTS course_pin",
        "DROP TABLE IF EXISTS course_student",
        "DROP TABLE IF EXISTS course",
        "DROP TABLE IF EXISTS \"user\"",
    ]
    for statement in roster_cleanup_statements:
        _exec(cur, statement)

    cur.close()
    conn.close()
    print("Schema migration complete.")


def main() -> None:
    if not DATABASE_URL or DATABASE_URL.startswith("sqlite"):
        print("Skipping schema migration for non-PostgreSQL database.")
        return
    _run_postgres_migrations()


if __name__ == "__main__":
    main()
