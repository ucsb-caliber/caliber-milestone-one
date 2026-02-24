"""add rls policies for assignment_progress

Revision ID: 019_add_rls_assignment_progress
Revises: 018_drop_assignment_instructor_email
Create Date: 2026-02-20 00:30:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '019_add_rls_assignment_progress'
down_revision = '018_drop_assignment_instructor_email'
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == 'postgresql'


def upgrade() -> None:
    if not _is_postgres():
        return

    op.execute("ALTER TABLE public.assignment_progress ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.assignment_progress FORCE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS ap_student_select_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_student_insert_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_student_update_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_instructor_select_course ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_admin_select_all ON public.assignment_progress")

    op.execute("""
    CREATE POLICY ap_student_select_own
    ON public.assignment_progress
    FOR SELECT
    TO authenticated
    USING (
      student_id = auth.uid()::text
      AND EXISTS (
        SELECT 1
        FROM public.assignment a
        JOIN public.course_student cs ON cs.course_id = a.course_id
        WHERE a.id = assignment_progress.assignment_id
          AND cs.student_id = auth.uid()::text
      )
    )
    """)

    op.execute("""
    CREATE POLICY ap_student_insert_own
    ON public.assignment_progress
    FOR INSERT
    TO authenticated
    WITH CHECK (
      student_id = auth.uid()::text
      AND EXISTS (
        SELECT 1
        FROM public.assignment a
        JOIN public.course_student cs ON cs.course_id = a.course_id
        WHERE a.id = assignment_progress.assignment_id
          AND cs.student_id = auth.uid()::text
      )
    )
    """)

    op.execute("""
    CREATE POLICY ap_student_update_own
    ON public.assignment_progress
    FOR UPDATE
    TO authenticated
    USING (
      student_id = auth.uid()::text
      AND EXISTS (
        SELECT 1
        FROM public.assignment a
        JOIN public.course_student cs ON cs.course_id = a.course_id
        WHERE a.id = assignment_progress.assignment_id
          AND cs.student_id = auth.uid()::text
      )
    )
    WITH CHECK (
      student_id = auth.uid()::text
      AND EXISTS (
        SELECT 1
        FROM public.assignment a
        JOIN public.course_student cs ON cs.course_id = a.course_id
        WHERE a.id = assignment_progress.assignment_id
          AND cs.student_id = auth.uid()::text
      )
    )
    """)

    op.execute("""
    CREATE POLICY ap_instructor_select_course
    ON public.assignment_progress
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.assignment a
        JOIN public.course c ON c.id = a.course_id
        WHERE a.id = assignment_progress.assignment_id
          AND c.instructor_id = auth.uid()::text
      )
    )
    """)

    op.execute("""
    CREATE POLICY ap_admin_select_all
    ON public.assignment_progress
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public."user" u
        WHERE u.user_id = auth.uid()::text
          AND u.admin = true
      )
    )
    """)

    op.execute("GRANT SELECT, INSERT, UPDATE ON public.assignment_progress TO authenticated")
    op.execute("REVOKE DELETE ON public.assignment_progress FROM authenticated")


def downgrade() -> None:
    if not _is_postgres():
        return

    op.execute("DROP POLICY IF EXISTS ap_admin_select_all ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_instructor_select_course ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_student_update_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_student_insert_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_student_select_own ON public.assignment_progress")

    op.execute("ALTER TABLE public.assignment_progress NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE public.assignment_progress DISABLE ROW LEVEL SECURITY")
