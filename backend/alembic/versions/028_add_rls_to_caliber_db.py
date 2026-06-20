"""add row level security to caliber application tables

Revision ID: 028_add_rls_to_caliber_db
Revises: 027_add_coding_question_tables
Create Date: 2026-05-01 12:00:00.000000

"""
from alembic import op


revision = "028_add_rls_to_caliber_db"
down_revision = "027_add_coding_question_tables"
branch_labels = None
depends_on = None


CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')"
CURRENT_MODE = "COALESCE(NULLIF(current_setting('app.rls_mode', true), ''), 'anonymous')"
PRIVILEGED = f"{CURRENT_MODE} IN ('service', 'internal')"
AUTHENTICATED = f"({PRIVILEGED} OR {CURRENT_USER} IS NOT NULL)"


def _is_postgres() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


def upgrade() -> None:
    if not _is_postgres():
        return

    for table_name in (
        "question",
        "assignment",
        "assignment_progress",
        "coding_question_private",
        "coding_run",
    ):
        op.execute(f"ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE public.{table_name} FORCE ROW LEVEL SECURITY")

    op.execute("DROP POLICY IF EXISTS question_select_access ON public.question")
    op.execute("DROP POLICY IF EXISTS question_insert_owner ON public.question")
    op.execute("DROP POLICY IF EXISTS question_update_owner ON public.question")
    op.execute("DROP POLICY IF EXISTS question_delete_owner ON public.question")

    op.execute(
        f"""
        CREATE POLICY question_select_access
        ON public.question
        FOR SELECT
        USING (
          {PRIVILEGED}
          OR user_id = {CURRENT_USER}
          OR is_verified = true
          OR EXISTS (
            SELECT 1
            FROM public.assignment a
            LEFT JOIN public.assignment_progress ap
              ON ap.assignment_id = a.id
             AND ap.student_id = {CURRENT_USER}
            WHERE a.assignment_questions IS NOT NULL
              AND a.assignment_questions <> ''
              AND a.assignment_questions::jsonb @> jsonb_build_array(question.id)
              AND ap.id IS NOT NULL
          )
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY question_insert_owner
        ON public.question
        FOR INSERT
        WITH CHECK (
          {PRIVILEGED}
          OR user_id = {CURRENT_USER}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY question_update_owner
        ON public.question
        FOR UPDATE
        USING (
          {PRIVILEGED}
          OR user_id = {CURRENT_USER}
        )
        WITH CHECK (
          {PRIVILEGED}
          OR user_id = {CURRENT_USER}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY question_delete_owner
        ON public.question
        FOR DELETE
        USING (
          {PRIVILEGED}
          OR user_id = {CURRENT_USER}
        )
        """
    )

    op.execute("DROP POLICY IF EXISTS assignment_select_authenticated ON public.assignment")
    op.execute("DROP POLICY IF EXISTS assignment_insert_owner ON public.assignment")
    op.execute("DROP POLICY IF EXISTS assignment_update_service ON public.assignment")
    op.execute("DROP POLICY IF EXISTS assignment_delete_service ON public.assignment")

    op.execute(
        f"""
        CREATE POLICY assignment_select_authenticated
        ON public.assignment
        FOR SELECT
        USING ({AUTHENTICATED})
        """
    )
    op.execute(
        f"""
        CREATE POLICY assignment_insert_owner
        ON public.assignment
        FOR INSERT
        WITH CHECK (
          {PRIVILEGED}
          OR instructor_id = {CURRENT_USER}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY assignment_update_service
        ON public.assignment
        FOR UPDATE
        USING ({PRIVILEGED})
        WITH CHECK ({PRIVILEGED})
        """
    )
    op.execute(
        f"""
        CREATE POLICY assignment_delete_service
        ON public.assignment
        FOR DELETE
        USING ({PRIVILEGED})
        """
    )

    op.execute("DROP POLICY IF EXISTS ap_student_select_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_student_insert_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_student_update_own ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_instructor_select_course ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS ap_admin_select_all ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS assignment_progress_select_access ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS assignment_progress_insert_access ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS assignment_progress_update_access ON public.assignment_progress")
    op.execute("DROP POLICY IF EXISTS assignment_progress_delete_access ON public.assignment_progress")

    op.execute(
        f"""
        CREATE POLICY assignment_progress_select_access
        ON public.assignment_progress
        FOR SELECT
        USING (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY assignment_progress_insert_access
        ON public.assignment_progress
        FOR INSERT
        WITH CHECK (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY assignment_progress_update_access
        ON public.assignment_progress
        FOR UPDATE
        USING (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
        )
        WITH CHECK (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY assignment_progress_delete_access
        ON public.assignment_progress
        FOR DELETE
        USING (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
        )
        """
    )

    op.execute("DROP POLICY IF EXISTS coding_question_private_owner_access ON public.coding_question_private")
    op.execute(
        f"""
        CREATE POLICY coding_question_private_owner_access
        ON public.coding_question_private
        FOR ALL
        USING (
          {PRIVILEGED}
          OR EXISTS (
            SELECT 1
            FROM public.question q
            WHERE q.id = coding_question_private.question_id
              AND q.user_id = {CURRENT_USER}
          )
        )
        WITH CHECK (
          {PRIVILEGED}
          OR EXISTS (
            SELECT 1
            FROM public.question q
            WHERE q.id = coding_question_private.question_id
              AND q.user_id = {CURRENT_USER}
          )
        )
        """
    )

    op.execute("DROP POLICY IF EXISTS coding_run_select_access ON public.coding_run")
    op.execute("DROP POLICY IF EXISTS coding_run_insert_access ON public.coding_run")
    op.execute("DROP POLICY IF EXISTS coding_run_delete_access ON public.coding_run")

    op.execute(
        f"""
        CREATE POLICY coding_run_select_access
        ON public.coding_run
        FOR SELECT
        USING (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
          OR EXISTS (
            SELECT 1
            FROM public.question q
            WHERE q.id = coding_run.question_id
              AND q.user_id = {CURRENT_USER}
          )
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY coding_run_insert_access
        ON public.coding_run
        FOR INSERT
        WITH CHECK (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
        )
        """
    )
    op.execute(
        f"""
        CREATE POLICY coding_run_delete_access
        ON public.coding_run
        FOR DELETE
        USING (
          {PRIVILEGED}
          OR student_id = {CURRENT_USER}
          OR EXISTS (
            SELECT 1
            FROM public.question q
            WHERE q.id = coding_run.question_id
              AND q.user_id = {CURRENT_USER}
          )
        )
        """
    )


def downgrade() -> None:
    if not _is_postgres():
        return

    for policy_name, table_name in (
        ("coding_run_delete_access", "coding_run"),
        ("coding_run_insert_access", "coding_run"),
        ("coding_run_select_access", "coding_run"),
        ("coding_question_private_owner_access", "coding_question_private"),
        ("assignment_progress_delete_access", "assignment_progress"),
        ("assignment_progress_update_access", "assignment_progress"),
        ("assignment_progress_insert_access", "assignment_progress"),
        ("assignment_progress_select_access", "assignment_progress"),
        ("assignment_delete_service", "assignment"),
        ("assignment_update_service", "assignment"),
        ("assignment_insert_owner", "assignment"),
        ("assignment_select_authenticated", "assignment"),
        ("question_delete_owner", "question"),
        ("question_update_owner", "question"),
        ("question_insert_owner", "question"),
        ("question_select_access", "question"),
    ):
        op.execute(f"DROP POLICY IF EXISTS {policy_name} ON public.{table_name}")

    for table_name in (
        "coding_run",
        "coding_question_private",
        "assignment_progress",
        "assignment",
        "question",
    ):
        op.execute(f"ALTER TABLE public.{table_name} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE public.{table_name} DISABLE ROW LEVEL SECURITY")
