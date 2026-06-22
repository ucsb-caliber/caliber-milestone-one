import os
import io
import threading
import uuid
import time
import json
import logging
import re
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import statistics
from collections import defaultdict
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Form, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer
from sqlmodel import Session, select, func
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv

from .database import create_db_and_tables, get_session, engine, session_with_rls, temporary_rls_mode
from .models import AnalyticsEvent, AssignmentIntegrityEvent, Question, QuestionComment, QuestionLike, Assignment, AssignmentProgress
from .schemas import (QuestionCreate, QuestionResponse, UploadResponse, QuestionListResponse, QuestionUpdate,
                     UserResponse, UserUpdate, UserProfileUpdate, UserOnboardingUpdate, UserPreferencesUpdate,
                     UserListResponse,
                     CourseResponse, CourseListResponse, CourseCreate, CourseUpdate, CourseJoinRequest,
                     CoursePinUpdate, CoursePinResponse, CoursePinsResponse,
                     AdminCourseOverviewResponse,
                     AssignmentResponse, AssignmentCreate, AssignmentUpdate, AssignmentPreviewRequest, UploadStatusResponse,
                     QuestionCommentCreate, QuestionCommentResponse,
                     VerifyBySourceRequest, VerifyBySourceResponse,
                     AssignmentProgressResponse, AssignmentProgressUpdate,
                     AssignmentIntegrityEventBatch, AssignmentIntegrityEventResponse,
                     AssignmentIntegrityStudentDetailResponse, AssignmentIntegrityStudentSummary,
                     AssignmentIntegritySummaryResponse,
                     AssignmentSubmissionStatusResponse, AssignmentStudentSubmissionStatus,
                     AssignmentGradingResponse, AssignmentGradeUpsertRequest,
                     AssignmentQuestionGradeResponse, RubricPartGradeResponse, RubricLevelCriteria,
                     AnalyticsEventBatch, AnalyticsEventIngestResponse,
                     AssignmentAnalyticsResponse, CourseAnalyticsResponse, QuestionAnalyticsResponse,
                     AnalyticsAssignmentSummary, AnalyticsFunnelStep, AnalyticsOverviewMetric,
                     AnalyticsQuestionSummary, AnalyticsStudentSummary,
                     QuestionImportItem, QuestionImportResponse, QuestionExportRequest,
                     CodingQuestionConfigResponse, CodingTestCase,
                     CodingRunRequest, CodingRunResponse, CodingRunTestResult,
                     InstructorAnalyticsResponse, AssignmentOption, AnalyticsSummaryStats,
                     ScoreDistributionItem, PerStudentTrendItem, StudentAtRiskItem,
                     PromptSummaryItem, AssignmentQuestionScoreSummaryItem,
                     AnalyticsTrendPoint, AnalyticsSubmissionRecord)
from .crud import (create_question, get_question, get_questions, get_questions_count, get_all_questions, get_all_questions_count,
                  get_draft_questions, get_draft_questions_count,
                  get_questions_by_ids, update_question, delete_question,
                  _visible_question_predicate,
                  build_assignment_question_refs,
                  get_course_assignments, create_assignment, get_assignment, update_assignment, 
                  delete_assignment, get_assignment_progress, upsert_assignment_progress,
                  list_assignment_progress_for_students,
                  create_assignment_integrity_events, list_assignment_integrity_events,
                  summarize_integrity_events,
                  update_assignment_grading,
                  delete_unverified_questions_by_source, get_coding_question_private,
                  upsert_coding_question_private, create_coding_run)
from .utils import extract_text_from_pdf, send_to_agent_pipeline, extract_questions_from_pdf_bytes
from .m2_pipeline import extract_questions_with_m2
from .auth import (
    get_current_user, get_current_user_email, get_current_user_name,
    get_optional_user, get_impersonator_sub, get_impersonator_name,
    get_current_user_id,
    get_current_user_token,
)
from .storage_client import build_pdf_storage_path, upload_pdf_to_storage
from .question_content import (
    QuestionContent,
    content_max_points,
    is_auto_part,
    is_coding_part,
    is_manual_part,
    part_max_points,
    question_content_from_question,
)
from .coding_autograder import grade_coding_part, sanitize_autograder_result
from .question_randomization import (
    RandomizationError,
    build_variant_record,
    randomization_enabled,
    render_question_with_variant,
    variant_key,
)
from .question_social import question_social_metadata
from .question_folder import (
    apply_question_import,
    build_question_export_zip,
    dry_run_question_import,
    prepare_question_zip,
)
from .roster_integration import (
    call_roster,
    delete_local_course,
    fetch_research_id,
)
from .coding import (
    normalize_coding_public_config,
    normalize_coding_tests,
    serialize_coding_public_config,
    serialize_coding_hidden_tests,
    execute_coding_request,
)
from .variant_gen import generate_variant, question_to_variant_gen_db

load_dotenv()

PACIFIC_TIMEZONE = ZoneInfo("America/Los_Angeles")

# Define security scheme for OpenAPI docs
security = HTTPBearer()

app = FastAPI(
    title="Caliber Milestone One API",
    version="1.0.0",
    description="""
    ## Authentication Required
    
    Most endpoints require authentication via Keycloak/OIDC JWT token.
    
    ### Browser Session Authentication (Recommended)
    
    If your browser is logged in through the portal, API auth works automatically via the `access_token` cookie.
    
    ### Manual Token Authentication (Alternative)
    
    If cookie auth is unavailable, provide a Bearer token manually using the "Authorize" button.
    """,
)

QUESTION_IMPORT_RESULTS: dict[str, QuestionImportResponse] = {}
QUESTION_EXPORT_BYTES: dict[str, bytes] = {}
integrity_logger = logging.getLogger("caliber.integrity")

# Configure CORS to allow frontend at localhost (multiple ports for dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure upload directory exists
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

# Ensure data directory exists for SQLite
Path("data").mkdir(parents=True, exist_ok=True)

# In-memory upload status for progress UI.
_UPLOAD_JOBS: Dict[str, Dict[str, Any]] = {}
_UPLOAD_JOBS_LOCK = threading.Lock()
_UPLOAD_TERMINAL_STATUSES = {"completed", "failed", "canceled"}
try:
    _UPLOAD_JOB_TOKEN_TTL_SEC = max(60, int(os.getenv("UPLOAD_JOB_TOKEN_TTL_SEC", "86400")))
except ValueError:
    _UPLOAD_JOB_TOKEN_TTL_SEC = 86400
_UPLOAD_JOB_TOKEN_SECRET = os.getenv("UPLOAD_JOB_TOKEN_SECRET") or os.getenv("SECRET_KEY") or "change-me"
_UPLOAD_JOB_TOKEN_ALG = "HS256"


def _create_upload_job(job_id: str, filename: str, storage_path: str, user_id: str):
    with _UPLOAD_JOBS_LOCK:
        _UPLOAD_JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress_percent": 10,
            "message": "Queued for processing",
            "expected_questions": None,
            "created_questions": 0,
            "storage_path": storage_path,
            "filename": filename,
            "user_id": user_id,
            "cancel_requested": False,
        }


def _update_upload_job(job_id: Optional[str], **updates):
    if not job_id:
        return
    with _UPLOAD_JOBS_LOCK:
        job = _UPLOAD_JOBS.get(job_id)
        if not job:
            return
        job.update(updates)


def _get_upload_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _UPLOAD_JOBS_LOCK:
        job = _UPLOAD_JOBS.get(job_id)
        return dict(job) if job else None


def _is_upload_cancel_requested(job_id: Optional[str]) -> bool:
    if not job_id:
        return False
    with _UPLOAD_JOBS_LOCK:
        job = _UPLOAD_JOBS.get(job_id)
        return bool(job and job.get("cancel_requested"))


def _request_upload_cancel(job_id: str) -> Optional[Dict[str, Any]]:
    with _UPLOAD_JOBS_LOCK:
        job = _UPLOAD_JOBS.get(job_id)
        if not job:
            return None
        if job.get("status") in _UPLOAD_TERMINAL_STATUSES:
            return dict(job)

        job["cancel_requested"] = True
        if job.get("status") in {"queued", "running"}:
            job["status"] = "cancelling"
        job["message"] = "Cancellation requested. Finishing current step..."
        return dict(job)


def _issue_upload_job_token(job_id: str, user_id: str) -> str:
    now = int(time.time())
    payload = {
        "job_id": job_id,
        "sub": user_id,
        "iat": now,
        "exp": now + _UPLOAD_JOB_TOKEN_TTL_SEC,
    }
    return jwt.encode(payload, _UPLOAD_JOB_TOKEN_SECRET, algorithm=_UPLOAD_JOB_TOKEN_ALG)


def _verify_upload_job_token(job_id: str, token: str) -> str:
    try:
        payload = jwt.decode(
            token,
            _UPLOAD_JOB_TOKEN_SECRET,
            algorithms=[_UPLOAD_JOB_TOKEN_ALG],
            options={"require": ["exp", "iat", "job_id", "sub"]},
        )
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Upload job token expired. Please sign in again.")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid upload job token.")

    token_job_id = str(payload.get("job_id") or "")
    token_user_id = str(payload.get("sub") or "")
    if token_job_id != job_id or not token_user_id:
        raise HTTPException(status_code=401, detail="Invalid upload job token.")
    return token_user_id


def _extract_upload_job_token(request: Request, query_token: Optional[str]) -> Optional[str]:
    token = (query_token or "").strip()
    if token:
        return token
    header_token = (request.headers.get("X-Upload-Job-Token") or "").strip()
    return header_token or None


def _authorize_upload_job_access(
    *,
    job_id: str,
    current_user_id: Optional[str],
    upload_job_token: Optional[str],
) -> Dict[str, Any]:
    job = _get_upload_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found")

    owner_user_id = str(job.get("user_id") or "")
    if current_user_id and current_user_id == owner_user_id:
        return job

    if upload_job_token:
        token_user_id = _verify_upload_job_token(job_id, upload_job_token)
        if token_user_id == owner_user_id:
            return job
        raise HTTPException(status_code=403, detail="Forbidden")

    if current_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    raise HTTPException(
        status_code=401,
        detail="Not authenticated. Please sign in again or provide a valid upload job token.",
    )


@app.on_event("startup")
def on_startup():
    """Initialize database on startup."""
    create_db_and_tables()
    ensure_question_structured_columns()
    ensure_assignment_question_ref_columns()
    ensure_question_social_columns()
    backfill_assignment_question_refs()
    ensure_assignment_progress_grading_columns()
    ensure_assignment_grade_release_columns()
    backfill_existing_assignment_dates()


@app.get("/health")
def health_check(session: Session = Depends(get_session)):
    """Health check endpoint. Verifies the service is running and the DB is reachable."""
    try:
        session.exec(select(Assignment).limit(1))
        db_status = "ok"
    except Exception:
        db_status = "error"
    return {"status": "ok" if db_status == "ok" else "degraded", "db": db_status}


def ensure_question_structured_columns():
    """Backward-compatible schema guard for structured question columns."""
    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        if "question" not in table_names:
            return

        existing_columns = {col["name"] for col in inspector.get_columns("question")}
        dialect = connection.dialect.name
        timestamp_type = "TIMESTAMP" if dialect == "postgresql" else "DATETIME"

        column_statements = {
            "version": "ALTER TABLE question ADD COLUMN version INTEGER NOT NULL DEFAULT 1",
            "content": "ALTER TABLE question ADD COLUMN content TEXT NOT NULL DEFAULT ''",
            "owner_user_id": "ALTER TABLE question ADD COLUMN owner_user_id VARCHAR NULL",
            "draft_state": "ALTER TABLE question ADD COLUMN draft_state VARCHAR NOT NULL DEFAULT 'ready'",
            "visibility": "ALTER TABLE question ADD COLUMN visibility VARCHAR NOT NULL DEFAULT 'local'",
            "origin": "ALTER TABLE question ADD COLUMN origin VARCHAR NOT NULL DEFAULT 'manual'",
            "school_scope": "ALTER TABLE question ADD COLUMN school_scope VARCHAR NOT NULL DEFAULT ''",
            "course_scope": "ALTER TABLE question ADD COLUMN course_scope VARCHAR NULL",
            "source_repo": "ALTER TABLE question ADD COLUMN source_repo VARCHAR NULL",
            "source_path": "ALTER TABLE question ADD COLUMN source_path VARCHAR NULL",
            "source_commit": "ALTER TABLE question ADD COLUMN source_commit VARCHAR NULL",
            "content_hash": "ALTER TABLE question ADD COLUMN content_hash VARCHAR NOT NULL DEFAULT ''",
            "reviewed_at": f"ALTER TABLE question ADD COLUMN reviewed_at {timestamp_type} NULL",
            "reviewed_by": "ALTER TABLE question ADD COLUMN reviewed_by VARCHAR NULL",
            "original_author_user_id": "ALTER TABLE question ADD COLUMN original_author_user_id VARCHAR NULL",
            "copied_from_question_id": "ALTER TABLE question ADD COLUMN copied_from_question_id INTEGER NULL",
            "copied_from_qid": "ALTER TABLE question ADD COLUMN copied_from_qid VARCHAR NULL",
            "updated_at": f"ALTER TABLE question ADD COLUMN updated_at {timestamp_type} NULL",
        }

        for column_name, stmt in column_statements.items():
            if column_name not in existing_columns:
                connection.execute(text(stmt))

        connection.execute(text("UPDATE question SET owner_user_id = user_id WHERE owner_user_id IS NULL"))
        connection.execute(text("UPDATE question SET original_author_user_id = COALESCE(owner_user_id, user_id) WHERE original_author_user_id IS NULL OR original_author_user_id = ''"))
        connection.execute(text("UPDATE question SET draft_state = CASE WHEN is_verified THEN 'ready' ELSE 'draft' END WHERE draft_state IS NULL OR draft_state = ''"))
        connection.execute(text("UPDATE question SET school_scope = COALESCE(NULLIF(user_school, ''), NULLIF(school, ''), '') WHERE school_scope IS NULL OR school_scope = ''"))
        connection.execute(text("UPDATE question SET updated_at = created_at WHERE updated_at IS NULL"))
        connection.commit()


def ensure_question_social_columns():
    """Backward-compatible schema guard for question social tables."""
    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        if "question" not in table_names:
            return
        dialect = connection.dialect.name
        id_type = "SERIAL PRIMARY KEY" if dialect == "postgresql" else "INTEGER PRIMARY KEY"
        timestamp_type = "TIMESTAMP" if dialect == "postgresql" else "DATETIME"

        if "question_like" not in table_names:
            connection.execute(text("""
                CREATE TABLE question_like (
                    id {id_type},
                    question_id INTEGER NOT NULL,
                    user_id VARCHAR NOT NULL,
                    created_at {timestamp_type} NOT NULL,
                    FOREIGN KEY(question_id) REFERENCES question (id),
                    CONSTRAINT uq_question_like_question_user UNIQUE (question_id, user_id)
                )
            """.format(id_type=id_type, timestamp_type=timestamp_type)))
            connection.execute(text("CREATE INDEX ix_question_like_question_id ON question_like (question_id)"))
            connection.execute(text("CREATE INDEX ix_question_like_user_id ON question_like (user_id)"))

        if "question_comment" not in table_names:
            connection.execute(text("""
                CREATE TABLE question_comment (
                    id {id_type},
                    question_id INTEGER NOT NULL,
                    user_id VARCHAR NOT NULL,
                    body TEXT NOT NULL,
                    created_at {timestamp_type} NOT NULL,
                    updated_at {timestamp_type} NOT NULL,
                    FOREIGN KEY(question_id) REFERENCES question (id)
                )
            """.format(id_type=id_type, timestamp_type=timestamp_type)))
            connection.execute(text("CREATE INDEX ix_question_comment_question_id ON question_comment (question_id)"))
            connection.execute(text("CREATE INDEX ix_question_comment_user_id ON question_comment (user_id)"))
            connection.execute(text("CREATE INDEX ix_question_comment_question_created ON question_comment (question_id, created_at)"))

        connection.commit()


def ensure_assignment_question_ref_columns():
    """Backward-compatible schema guard for stable assignment question refs."""
    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        if "assignment" not in table_names:
            return
        existing_columns = {col["name"] for col in inspector.get_columns("assignment")}
        if "assignment_question_refs" not in existing_columns:
            connection.execute(text("ALTER TABLE assignment ADD COLUMN assignment_question_refs TEXT NOT NULL DEFAULT '[]'"))
            connection.commit()


def backfill_assignment_question_refs():
    """Populate stable assignment refs for legacy assignments that only have integer ids."""
    with Session(engine) as session:
        assignments = list(session.exec(select(Assignment)).all())
        changed = False
        for assignment in assignments:
            existing_refs = _safe_json_loads(getattr(assignment, "assignment_question_refs", "[]"), [])
            if existing_refs:
                continue
            question_ids = _assignment_question_ids(assignment)
            if not question_ids:
                continue
            assignment.assignment_question_refs = json.dumps(build_assignment_question_refs(session, question_ids))
            assignment.updated_at = datetime.utcnow()
            session.add(assignment)
            changed = True
        if changed:
            session.commit()


def ensure_assignment_progress_grading_columns():
    """
    Backward-compatible schema guard for grading columns.

    If Alembic migration hasn't been run yet, add missing grading columns so
    AssignmentProgress ORM queries don't crash on undefined columns.
    """
    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        if "assignment_progress" not in table_names:
            return

        existing_columns = {col["name"] for col in inspector.get_columns("assignment_progress")}
        dialect = connection.dialect.name

        statements: list[str] = []
        if "grading_data" not in existing_columns:
            statements.append("ALTER TABLE assignment_progress ADD COLUMN grading_data TEXT NOT NULL DEFAULT '{}'")
        if "variant_data" not in existing_columns:
            statements.append("ALTER TABLE assignment_progress ADD COLUMN variant_data TEXT NOT NULL DEFAULT '{}'")
        if "grade_submitted" not in existing_columns:
            if dialect == "postgresql":
                statements.append("ALTER TABLE assignment_progress ADD COLUMN grade_submitted BOOLEAN NOT NULL DEFAULT FALSE")
            else:
                statements.append("ALTER TABLE assignment_progress ADD COLUMN grade_submitted BOOLEAN NOT NULL DEFAULT 0")
        if "grade_submitted_at" not in existing_columns:
            if dialect == "postgresql":
                statements.append("ALTER TABLE assignment_progress ADD COLUMN grade_submitted_at TIMESTAMP NULL")
            else:
                statements.append("ALTER TABLE assignment_progress ADD COLUMN grade_submitted_at DATETIME NULL")
        if "score_earned" not in existing_columns:
            if dialect == "postgresql":
                statements.append("ALTER TABLE assignment_progress ADD COLUMN score_earned DOUBLE PRECISION NULL")
            else:
                statements.append("ALTER TABLE assignment_progress ADD COLUMN score_earned REAL NULL")
        if "score_total" not in existing_columns:
            if dialect == "postgresql":
                statements.append("ALTER TABLE assignment_progress ADD COLUMN score_total DOUBLE PRECISION NULL")
            else:
                statements.append("ALTER TABLE assignment_progress ADD COLUMN score_total REAL NULL")

        for stmt in statements:
            connection.execute(text(stmt))

        if statements:
            connection.commit()


def ensure_assignment_grade_release_columns():
    """Backward-compatible schema guard for assignment-level grade release columns."""
    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        if "assignment" not in table_names:
            return

        existing_columns = {col["name"] for col in inspector.get_columns("assignment")}
        dialect = connection.dialect.name
        statements: list[str] = []

        if "grade_released" not in existing_columns:
            if dialect == "postgresql":
                statements.append("ALTER TABLE assignment ADD COLUMN grade_released BOOLEAN NOT NULL DEFAULT FALSE")
            else:
                statements.append("ALTER TABLE assignment ADD COLUMN grade_released BOOLEAN NOT NULL DEFAULT 0")
        if "grade_released_at" not in existing_columns:
            if dialect == "postgresql":
                statements.append("ALTER TABLE assignment ADD COLUMN grade_released_at TIMESTAMP NULL")
            else:
                statements.append("ALTER TABLE assignment ADD COLUMN grade_released_at DATETIME NULL")

        for stmt in statements:
            connection.execute(text(stmt))

        if statements:
            connection.commit()


def backfill_existing_assignment_dates():
    """
    Backfill missing assignment dates for legacy records.

    For previously created assignments with missing release/due dates, set:
    - release_date: Feb 14, 2026
    - due_date_soft: Feb 15, 2026
    - due_date_hard: Feb 15, 2026
    """
    default_release = datetime(2026, 2, 14, 0, 0, 0)
    default_due = datetime(2026, 2, 15, 0, 0, 0)

    with session_with_rls(mode="service") as session:
        assignments = list(session.exec(select(Assignment)).all())
        changed = False

        for assignment in assignments:
            assignment_changed = False
            if assignment.release_date is None:
                assignment.release_date = default_release
                assignment_changed = True
            if assignment.due_date_soft is None:
                assignment.due_date_soft = default_due
                assignment_changed = True
            if assignment.due_date_hard is None:
                assignment.due_date_hard = default_due
                assignment_changed = True

            if assignment_changed:
                changed = True
                session.add(assignment)

        if changed:
            session.commit()


def build_assignment_response(
    session: Session,
    assignment: Assignment,
    *,
    instructor_email: Optional[str] = None,
    all_students_graded: Optional[bool] = None,
    assignment_question_refs: Optional[list[dict[str, Any]]] = None,
) -> AssignmentResponse:
    """Build assignment response with roster-sourced instructor email when available."""
    return AssignmentResponse.from_assignment(
        assignment,
        instructor_email=instructor_email,
        all_students_graded=all_students_graded,
        assignment_question_refs=assignment_question_refs,
    )


def _normalize_datetime_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Normalize datetimes to timezone-aware UTC for safe comparisons."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_schedule_datetime_local(value: Optional[datetime]) -> Optional[datetime]:
    """
    Normalize assignment schedule datetimes to the assignment's intended timezone.

    Assignment release/due fields are commonly created from HTML datetime-local
    inputs (timezone-naive, local wall-clock). Treating those values as UTC can
    prematurely move assignments past their real local deadlines.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=PACIFIC_TIMEZONE)
    return value.astimezone(PACIFIC_TIMEZONE)


def _late_due_deadline_local(assignment: Assignment) -> Optional[datetime]:
    """Return the late-submission deadline in local time."""
    return (
        _normalize_schedule_datetime_local(assignment.due_date_hard)
        or _normalize_schedule_datetime_local(assignment.due_date_soft)
    )


def _late_due_deadline_utc(assignment: Assignment) -> Optional[datetime]:
    """Return the late-submission deadline as a UTC event timestamp."""
    deadline_local = _late_due_deadline_local(assignment)
    return deadline_local.astimezone(timezone.utc) if deadline_local else None


def _late_due_deadline_stored(assignment: Assignment) -> Optional[datetime]:
    """Return the deadline value in the same shape as assignment schedule fields."""
    return assignment.due_date_hard or assignment.due_date_soft


def _has_late_due_passed(assignment: Assignment, *, now: Optional[datetime] = None) -> bool:
    current = now or datetime.now(PACIFIC_TIMEZONE)
    if current.tzinfo is None:
        current = current.replace(tzinfo=PACIFIC_TIMEZONE)
    else:
        current = current.astimezone(PACIFIC_TIMEZONE)
    late_due = _late_due_deadline_local(assignment)
    return bool(late_due and current > late_due)


def _get_assignment_phase(assignment: Assignment, *, now: Optional[datetime] = None) -> str:
    """Return assignment lifecycle phase for release/visibility rules."""
    current = now or datetime.now(PACIFIC_TIMEZONE)
    if current.tzinfo is None:
        current = current.replace(tzinfo=PACIFIC_TIMEZONE)
    else:
        current = current.astimezone(PACIFIC_TIMEZONE)
    release_date = _normalize_schedule_datetime_local(assignment.release_date)

    if assignment.grade_released:
        return "graded"
    if release_date and current < release_date:
        return "unreleased"
    if _has_late_due_passed(assignment, now=current):
        return "ungraded"
    return "in_progress"


def _safe_json_loads(raw: Any, default: Any):
    if raw is None:
        return default
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str):
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _assignment_question_ids(assignment: Assignment) -> list[int]:
    """Return legacy DB ids from assignment_questions, preserving compatibility."""
    question_ids = _safe_json_loads(assignment.assignment_questions, [])
    return [int(qid) for qid in question_ids if isinstance(qid, int) or str(qid).isdigit()]


def _question_from_assignment_snapshot(ref: dict[str, Any]) -> Optional[Question]:
    snapshot = ref.get("question_snapshot") if isinstance(ref, dict) else None
    if not isinstance(snapshot, dict):
        return None
    content = snapshot.get("content")
    content_json = json.dumps(content) if isinstance(content, dict) else str(content or "")
    return Question(
        id=ref.get("id"),
        qid=str(snapshot.get("qid") or ref.get("qid") or ref.get("id") or ""),
        version=int(snapshot.get("version") or ref.get("version") or 1),
        title=str(snapshot.get("title") or ""),
        text=str(snapshot.get("text") or ""),
        content=content_json,
        question_type=str(snapshot.get("question_type") or ""),
        answer_choices=str(snapshot.get("answer_choices") or "[]"),
        correct_answer=str(snapshot.get("correct_answer") or ""),
        image_url=snapshot.get("image_url"),
        user_id="assignment-snapshot",
        is_verified=True,
    )


def _get_assignment_questions(session: Session, assignment: Assignment) -> list[Question]:
    """Resolve assignment questions using stable refs first, with legacy ID fallback."""
    refs = _safe_json_loads(getattr(assignment, "assignment_question_refs", "[]"), [])
    if isinstance(refs, list) and refs:
        resolved: list[Question] = []
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            question = None
            question_id = ref.get("id")
            if question_id is not None and str(question_id).isdigit():
                question = session.get(Question, int(question_id))
            if not question and ref.get("qid"):
                statement = select(Question).where(Question.qid == str(ref.get("qid")))
                if ref.get("version") is not None and str(ref.get("version")).isdigit():
                    statement = statement.where(Question.version == int(ref.get("version")))
                else:
                    statement = statement.order_by(Question.version.desc())
                question = session.exec(statement).first()
            if not question:
                question = _question_from_assignment_snapshot(ref)
            if question:
                resolved.append(question)
        if resolved:
            return resolved
    return get_questions_by_ids(session, _assignment_question_ids(assignment))


def _ensure_progress_variants(
    session: Session,
    *,
    assignment: Assignment,
    progress: AssignmentProgress,
    questions: Optional[list[Question]] = None,
) -> AssignmentProgress:
    questions = questions if questions is not None else _get_assignment_questions(session, assignment)
    variant_data = _safe_json_loads(getattr(progress, "variant_data", "{}"), {})
    if not isinstance(variant_data, dict):
        variant_data = {}

    changed = False
    for question in questions:
        content = question_content_from_question(question)
        if not randomization_enabled(content):
            continue
        key = variant_key(question)
        existing = variant_data.get(key)
        if isinstance(existing, dict) and isinstance(existing.get("values"), dict):
            continue
        try:
            variant_data[key] = build_variant_record(
                assignment_id=int(assignment.id or 0),
                student_id=str(progress.student_id),
                question=question,
                content=content,
            )
        except RandomizationError as exc:
            raise HTTPException(status_code=400, detail=f"Question randomization failed for {question.qid or question.id}: {exc}") from exc
        changed = True

    if changed:
        progress.variant_data = json.dumps(variant_data)
        progress.updated_at = datetime.utcnow()
        session.add(progress)
        session.commit()
        session.refresh(progress)
    return progress


def _render_questions_for_progress(
    session: Session,
    *,
    assignment: Assignment,
    progress: Optional[AssignmentProgress],
    questions: Optional[list[Question]] = None,
) -> list[Question]:
    questions = questions if questions is not None else _get_assignment_questions(session, assignment)
    if not progress:
        return questions
    progress = _ensure_progress_variants(session, assignment=assignment, progress=progress, questions=questions)
    variant_data = _safe_json_loads(getattr(progress, "variant_data", "{}"), {})
    if not isinstance(variant_data, dict):
        variant_data = {}

    rendered: list[Question] = []
    for question in questions:
        content = question_content_from_question(question)
        if not randomization_enabled(content):
            rendered.append(question)
            continue
        try:
            rendered.append(render_question_with_variant(question, content, variant_data.get(variant_key(question), {})))
        except RandomizationError as exc:
            raise HTTPException(status_code=400, detail=f"Question randomization failed for {question.qid or question.id}: {exc}") from exc
    return rendered


def _render_questions_for_preview(
    *,
    questions: list[Question],
    preview_student_id: str,
    assignment_id: int = 0,
) -> list[Question]:
    rendered: list[Question] = []
    for question in questions:
        content = question_content_from_question(question)
        if not randomization_enabled(content):
            rendered.append(question)
            continue
        try:
            variant = build_variant_record(
                assignment_id=int(assignment_id or 0),
                student_id=preview_student_id or "preview-student",
                question=question,
                content=content,
            )
            rendered.append(render_question_with_variant(question, content, variant))
        except RandomizationError as exc:
            raise HTTPException(status_code=400, detail=f"Question randomization failed for {question.qid or question.id}: {exc}") from exc
    return rendered


def _assignment_refs_for_questions(questions: list[Question]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for position, question in enumerate(questions):
        content = question_content_from_question(question)
        content_payload = content.model_dump(mode="json", exclude_none=True)
        content_payload.pop("randomization", None)
        for part in content_payload.get("parts", []):
            if isinstance(part, dict):
                part.pop("correct_answer", None)
            coding = part.get("coding") if isinstance(part, dict) else None
            tests = coding.get("tests") if isinstance(coding, dict) else None
            if not isinstance(tests, list):
                continue
            for test in tests:
                if isinstance(test, dict) and test.get("visibility") == "hidden":
                    test.pop("input", None)
                    test.pop("expected_output", None)
                    test.pop("harness", None)
        refs.append({
            "id": question.id,
            "qid": question.qid,
            "version": question.version,
            "position": position,
            "points_override": None,
            "question_snapshot": {
                "qid": question.qid,
                "version": question.version,
                "title": question.title,
                "text": content.stem or question.text or "",
                "content": content_payload,
                "question_type": question.question_type,
                "answer_choices": question.answer_choices,
                "correct_answer": "",
                "image_url": question.image_url,
            },
        })
    return refs


def _normalize_question_time_ms(raw: Any) -> dict[str, int]:
    parsed = _safe_json_loads(raw, {})
    if not isinstance(parsed, dict):
        return {}
    normalized: dict[str, int] = {}
    for key, value in parsed.items():
        try:
            millis = int(value)
        except (TypeError, ValueError):
            continue
        if millis < 0:
            continue
        normalized[str(key)] = millis
    return normalized


def _is_coding_question_type(question_type: str) -> bool:
    return (question_type or "").strip().lower() == "coding"


def _public_coding_config_from_question(question: Question) -> dict[str, Any]:
    if not _is_coding_question_type(question.question_type or ""):
        return {}
    return normalize_coding_public_config(question.answer_choices)


def _coding_response_from_question(
    session: Session,
    question: Question,
    *,
    include_hidden_tests: bool = False,
) -> Optional[CodingQuestionConfigResponse]:
    if not _is_coding_question_type(question.question_type or ""):
        return None

    public_config = _public_coding_config_from_question(question)
    hidden_tests = []
    if include_hidden_tests:
        private_row = get_coding_question_private(session, question.id)
        hidden_tests = normalize_coding_tests(private_row.hidden_tests if private_row else "[]")

    return CodingQuestionConfigResponse(
        language="cpp",
        function_signature=str(public_config.get("function_signature") or ""),
        starter_code=str(public_config.get("starter_code") or ""),
        visible_tests=[CodingTestCase(**test) for test in public_config.get("visible_tests") or []],
        hidden_tests=[CodingTestCase(**test) for test in hidden_tests],
        time_limit_ms=int(public_config.get("time_limit_ms") or 2000),
        memory_limit_mb=int(public_config.get("memory_limit_mb") or 256),
        points=float(public_config.get("points") or 1.0),
    )


def _build_question_response(
    session: Session,
    question: Question,
    *,
    include_hidden_coding: bool = False,
    current_user_id: Optional[str] = None,
    social_metadata: Optional[dict[str, Any]] = None,
) -> QuestionResponse:
    if social_metadata is None:
        social_metadata = question_social_metadata(session, [question.id], current_user_id).get(question.id, {})

    likes_count = int(social_metadata.get("likes_count") or 0)
    comments_count = int(social_metadata.get("comments_count") or 0)
    liked_by_me = bool(social_metadata.get("liked_by_me"))
    recent_comments = social_metadata.get("recent_comments") or []
    return QuestionResponse(
        id=question.id,
        qid=question.qid,
        version=question.version,
        title=question.title,
        text=question.text,
        content=question.content,
        tags=question.tags,
        keywords=question.keywords,
        school=question.school,
        user_school=question.user_school,
        course=question.course,
        course_type=question.course_type,
        question_type=question.question_type,
        blooms_taxonomy=question.blooms_taxonomy,
        answer_choices=question.answer_choices,
        correct_answer=question.correct_answer,
        pdf_url=question.pdf_url,
        source_pdf=question.source_pdf,
        image_url=question.image_url,
        user_id=question.user_id,
        owner_user_id=question.owner_user_id,
        draft_state=question.draft_state,
        visibility=question.visibility,
        origin=question.origin,
        school_scope=question.school_scope,
        course_scope=question.course_scope,
        source_repo=question.source_repo,
        source_path=question.source_path,
        source_commit=question.source_commit,
        content_hash=question.content_hash,
        reviewed_at=question.reviewed_at,
        reviewed_by=question.reviewed_by,
        original_author_user_id=question.original_author_user_id or question.owner_user_id or question.user_id,
        copied_from_question_id=question.copied_from_question_id,
        copied_from_qid=question.copied_from_qid,
        created_at=question.created_at,
        updated_at=question.updated_at,
        is_verified=question.is_verified,
        coding=_coding_response_from_question(
            session,
            question,
            include_hidden_tests=include_hidden_coding,
        ),
        likes_count=likes_count,
        liked_by_me=liked_by_me,
        comments_count=comments_count,
        recent_comments=[QuestionCommentResponse.model_validate(comment) for comment in recent_comments],
    )


def _question_response_for_user(
    session: Session,
    question: Question,
    user_id: str,
    *,
    include_hidden_coding: bool = False,
) -> QuestionResponse:
    return _build_question_response(
        session,
        question,
        include_hidden_coding=include_hidden_coding,
        current_user_id=user_id,
    )


def _question_responses_for_user(
    session: Session,
    questions: list[Question],
    user_id: str,
    *,
    include_hidden_coding: bool = False,
) -> list[QuestionResponse]:
    social_metadata = question_social_metadata(
        session,
        [question.id for question in questions],
        current_user_id=user_id,
    )
    return [
        _build_question_response(
            session,
            question,
            include_hidden_coding=include_hidden_coding,
            current_user_id=user_id,
            social_metadata=social_metadata.get(question.id),
        )
        for question in questions
    ]


def _normalize_visibility(value: Optional[str]) -> str:
    visibility = (value or "local").strip().lower()
    if visibility == "private":
        return "local"
    allowed = {"local", "locked", "global", "school", "course"}
    return visibility if visibility in allowed else "local"


def _question_scope_for_user(session: Session, user_id: str) -> tuple[str, list[str]]:
    school_scope = ""
    course_scope_ids: list[str] = []
    try:
        user_payload = _roster_call_for_user(session, user_id, "GET", "/api/user")
        school_scope = str(user_payload.get("school_name") or "").strip()
    except Exception:
        school_scope = ""
    try:
        courses_payload = _roster_call_for_user(
            session,
            user_id,
            "GET",
            "/api/courses",
            params={"skip": 0, "limit": 1000},
        )
        course_items = courses_payload.get("courses") if isinstance(courses_payload, dict) else courses_payload
        if isinstance(course_items, list):
            course_scope_ids = [str(item.get("id")) for item in course_items if isinstance(item, dict) and item.get("id") is not None]
    except Exception:
        course_scope_ids = []
    return school_scope, course_scope_ids


def _is_locked_question(question: Question) -> bool:
    return (question.visibility or "").strip().lower() == "locked"


def _require_question_bank_access(session: Session, question_id: int, user_id: str) -> Question:
    school_scope, course_scope_ids = _question_scope_for_user(session, user_id)
    question = session.exec(
        select(Question).where(
            Question.id == question_id,
            _visible_question_predicate(
                user_id=user_id,
                school_scope=school_scope,
                course_scope_ids=course_scope_ids,
            ),
        )
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


def _reject_locked_assignment_questions(session: Session, question_ids: list[int]) -> None:
    if not question_ids:
        return
    questions = get_questions_by_ids(session, question_ids)
    locked = [question for question in questions if _is_locked_question(question)]
    if locked:
        labels = ", ".join(question.qid or str(question.id) for question in locked[:5])
        raise HTTPException(
            status_code=400,
            detail=f"Locked questions are export-only and cannot be shown to students: {labels}",
        )


def _normalize_coding_answer(raw_answer: Any) -> dict[str, str]:
    parsed = _safe_json_loads(raw_answer, {})
    if not isinstance(parsed, dict):
        return {"language": "cpp", "source_code": ""}
    return {
        "language": str(parsed.get("language") or "cpp").strip().lower() or "cpp",
        "source_code": str(parsed.get("source_code") or ""),
    }


def _execute_coding_for_question(
    *,
    session: Session,
    question: Question,
    source_code: str,
    use_hidden_tests: bool,
) -> dict[str, Any]:
    public_config = _public_coding_config_from_question(question)
    hidden_tests = []
    if use_hidden_tests:
        current_user_id = get_current_user_id()
        with temporary_rls_mode(
            session,
            user_id=None,
            mode="service",
            restore_user_id=current_user_id,
            restore_mode="authenticated" if current_user_id else "anonymous",
        ):
            private_row = get_coding_question_private(session, question.id)
        hidden_tests = normalize_coding_tests(private_row.hidden_tests if private_row else "[]")
    tests = hidden_tests if use_hidden_tests else list(public_config.get("visible_tests") or [])

    return execute_coding_request(
        {
            "language": str(public_config.get("language") or "cpp"),
            "source_code": source_code,
            "tests": tests,
            "time_limit_ms": int(public_config.get("time_limit_ms") or 2000),
            "memory_limit_mb": int(public_config.get("memory_limit_mb") or 256),
        }
    )


def _coding_grading_result(question: Question, execution_result: dict[str, Any]) -> dict[str, Any]:
    public_config = _public_coding_config_from_question(question)
    points = max(0.0, float(public_config.get("points") or 1.0))
    tests = execution_result.get("tests") or []
    passed = sum(1 for test in tests if str(test.get("status") or "") == "passed")
    total = len(tests)
    verdict = str(execution_result.get("verdict") or "")
    earned = points if verdict == "accepted" and total == 0 else (0.0 if total == 0 else round(points * (passed / total), 4))
    return {
        "status": str(execution_result.get("status") or ""),
        "verdict": verdict,
        "compile_output": str(execution_result.get("compile_output") or ""),
        "runtime_output": str(execution_result.get("runtime_output") or ""),
        "elapsed_ms": int(execution_result.get("elapsed_ms") or 0),
        "tests": tests,
        "passed_count": passed,
        "total_count": total,
        "earned_points": earned,
        "max_points": points,
    }


def _validate_coding_authoring_payload(coding_payload: Any) -> None:
    public_config = normalize_coding_public_config(coding_payload)
    hidden_tests = normalize_coding_tests((coding_payload or {}).get("hidden_tests") if isinstance(coding_payload, dict) else [])

    if not str(public_config.get("function_signature") or "").strip():
        raise HTTPException(status_code=400, detail="Coding questions need a function signature.")
    if not str(public_config.get("starter_code") or "").strip():
        raise HTTPException(status_code=400, detail="Coding questions need starter code.")

    visible_tests = list(public_config.get("visible_tests") or [])
    if not visible_tests:
        raise HTTPException(status_code=400, detail="Coding questions need at least one visible test.")
    if not hidden_tests:
        raise HTTPException(status_code=400, detail="Coding questions need at least one hidden test.")

    for index, test in enumerate(visible_tests, start=1):
        if not str(test.get("input") or "").strip():
            raise HTTPException(status_code=400, detail=f"Visible test {index} needs a sample input.")
        if not str(test.get("output") or "").strip():
            raise HTTPException(status_code=400, detail=f"Visible test {index} needs an expected output.")
        if not str(test.get("code") or "").strip():
            raise HTTPException(status_code=400, detail=f"Visible test {index} needs an autograder check.")

    for index, test in enumerate(hidden_tests, start=1):
        if not str(test.get("code") or "").strip():
            raise HTTPException(status_code=400, detail=f"Hidden test {index} needs an autograder check.")


def _variant_question_type(variant_type: str) -> str:
    vt = (variant_type or "").strip().upper()
    if vt == "MCQ":
        return "mcq"
    if vt == "TRUE_FALSE":
        return "true_false"
    return "fr"


def _normalize_variant_answer_label(raw_answer: Any) -> str:
    answer = str(raw_answer or "").strip()
    if not answer:
        return ""
    if answer.upper() in {"TRUE", "T", "YES"}:
        return "True"
    if answer.upper() in {"FALSE", "F", "NO"}:
        return "False"
    match = re.match(r"^\s*(?:option\s*)?([A-Z1-9])(?:[\.\)]|\s|$)", answer, flags=re.I)
    return match.group(1).upper() if match else answer


def _variant_answer_choices_and_correct_answer(variant: dict[str, Any]) -> tuple[str, str]:
    qtype = _variant_question_type(str(variant.get("type") or ""))
    answer = str(variant.get("answer") or "").strip()

    if qtype == "true_false":
        normalized = _normalize_variant_answer_label(answer)
        correct = "False" if normalized.upper() == "FALSE" else "True"
        return json.dumps(["True", "False"]), correct

    if qtype != "mcq":
        return "[]", answer

    options = variant.get("options")
    if not isinstance(options, dict) or not options:
        return "[]", answer

    labels = [str(k).strip() for k in options.keys() if str(k).strip()]
    choices = [str(options[label]).strip() for label in labels if str(options.get(label) or "").strip()]
    answer_label = _normalize_variant_answer_label(answer)

    correct = ""
    for label in labels:
        if label.upper().rstrip(".):") == answer_label:
            correct = str(options.get(label) or "").strip()
            break
    if not correct and answer in choices:
        correct = answer
    if not correct:
        correct = answer

    return json.dumps(choices), correct


def _variant_draft_title(source_question: Question, number: int) -> str:
    base = (source_question.title or f"Question {source_question.id}").strip()
    return f"{base} Variant {number}"


def _variant_draft_tags(source_question: Question, run_tag: str) -> str:
    tags = [
        tag.strip()
        for tag in (source_question.tags or "").split(",")
        if tag.strip()
    ]
    tags.extend(["variant", "ai-generated", run_tag])
    seen = set()
    unique = []
    for tag in tags:
        if tag not in seen:
            unique.append(tag)
            seen.add(tag)
    return ",".join(unique)


def _save_variant_draft_question(
    *,
    session: Session,
    source_question: Question,
    variant: dict[str, Any],
    user_id: str,
    run_source: str,
    run_tag: str,
    number: int,
) -> Question:
    answer_choices, correct_answer = _variant_answer_choices_and_correct_answer(variant)
    question_type = _variant_question_type(str(variant.get("type") or ""))
    metadata_keywords = [
        str(variant.get("language") or "").strip(),
        str(variant.get("algorithm") or "").strip(),
        str(variant.get("scenario_domain") or "").strip(),
    ]
    merged_keywords = ",".join(
        item for item in [source_question.keywords or "", *metadata_keywords] if item
    )

    return create_question(
        session=session,
        text=str(variant.get("question") or "").strip(),
        title=_variant_draft_title(source_question, number),
        tags=_variant_draft_tags(source_question, run_tag),
        keywords=merged_keywords,
        school=source_question.school or "",
        user_school=source_question.user_school or source_question.school or "",
        course=source_question.course or "",
        course_type=source_question.course_type or "",
        question_type=question_type,
        blooms_taxonomy=source_question.blooms_taxonomy or "",
        answer_choices=answer_choices,
        correct_answer=correct_answer,
        pdf_url=source_question.pdf_url,
        source_pdf=None,
        image_url=None,
        user_id=user_id,
        is_verified=False,
    )


def _is_auto_graded_question(question: Question) -> bool:
    content = question_content_from_question(question)
    if content.parts:
        return all(is_auto_part(part) for part in content.parts)
    qtype = (question.question_type or "").strip().lower()
    return qtype in {"mcq", "true_false", "coding"}


def _is_manual_question(question: Question) -> bool:
    content = question_content_from_question(question)
    return any(is_manual_part(part) for part in content.parts)


def _has_coding_question(question: Question) -> bool:
    if _is_coding_question_type(question.question_type or ""):
        return True
    content = question_content_from_question(question)
    return any(is_coding_part(part) for part in content.parts)


def _question_max_points(question: Question) -> float:
    content = question_content_from_question(question)
    if content.parts:
        return content_max_points(content)
    qtype = (question.question_type or "").strip().lower()
    if qtype in {"mcq", "true_false"}:
        return 1.0
    if qtype == "coding":
        config = _public_coding_config_from_question(question)
        return max(0.0, float(config.get("points") or 1.0)) or 1.0
    return 0.0


def _question_answer_key(question: Question) -> str:
    return str(question.qid or question.id)


def _legacy_question_answer_key(question: Question) -> str:
    return str(question.id)


def _get_question_payload(payload_by_question: dict[str, Any], question: Question, default: Any):
    if not isinstance(payload_by_question, dict):
        return default
    stable_key = _question_answer_key(question)
    legacy_key = _legacy_question_answer_key(question)
    if stable_key in payload_by_question:
        return payload_by_question.get(stable_key, default)
    return payload_by_question.get(legacy_key, default)


def _get_part_payload(question_payload: Any, part_id: str, part_index: int):
    if isinstance(question_payload, dict):
        if part_id in question_payload:
            return question_payload.get(part_id)
        index_key = str(part_index)
        if index_key in question_payload:
            return question_payload.get(index_key)
    if part_index == 0:
        return question_payload
    return None


def _normalize_auto_answer(answer: Any) -> str:
    return str(answer).strip().lower() if answer is not None else ""


def _build_manual_rubric_parts(question: Question, selected_parts: dict[str, Any]) -> list[RubricPartGradeResponse]:
    content = question_content_from_question(question)
    parts: list[RubricPartGradeResponse] = []
    for idx, part in enumerate(content.parts):
        if not is_manual_part(part):
            continue
        selected = {}
        if isinstance(selected_parts, dict):
            selected = selected_parts.get(part.part_id, selected_parts.get(str(idx), {}))
        selected_score = selected.get("score")
        options = sorted({float(level.points or 0) for level in part.rubric}, reverse=True) if part.rubric else [part_max_points(part), 0.0]
        if 0.0 not in options:
            options.append(0.0)
        options = sorted(set(options), reverse=True)

        max_points = max(options) if options else 0.0
        level_criteria_list: list[RubricLevelCriteria] = []
        for level in part.rubric:
            level_criteria_list.append(RubricLevelCriteria(points=float(level.points or 0), criteria=str(level.criteria or "").strip()))
        level_criteria_list.sort(key=lambda x: (-x.points, x.criteria))
        parts.append(
            RubricPartGradeResponse(
                part_index=idx,
                label=part.label or f"Part {chr(ord('A') + idx)}",
                max_points=max_points,
                options=options,
                level_criteria=level_criteria_list,
                selected_score=float(selected_score) if selected_score is not None else None,
                comment=str(selected.get("comment") or ""),
                graded=selected_score is not None,
            )
        )
    return parts


def _build_grading_response(
    *,
    assignment: Assignment,
    student_id: str,
    questions: list[Question],
    answers_by_question_id: dict[str, Any],
    grading_data: dict[str, Any],
    grade_submitted: bool,
    submitted_at: Optional[datetime] = None,
    stored_score_earned: Optional[float] = None,
    stored_score_total: Optional[float] = None,
    include_hidden_autograder: bool = False,
) -> AssignmentGradingResponse:
    question_cards: list[AssignmentQuestionGradeResponse] = []
    total_earned = 0.0
    total_points = 0.0

    for question in questions:
        content = question_content_from_question(question)
        student_answer = _get_question_payload(answers_by_question_id, question, None)
        max_points = _question_max_points(question)
        total_points += max_points
        question_grade = _get_question_payload(grading_data, question, {}) if isinstance(grading_data, dict) else {}
        question_comment = str(question_grade.get("question_comment") or "")

        if _is_auto_graded_question(question):
            coding_result = None
            if _is_coding_question_type(question.question_type or ""):
                coding_result = question_grade.get("coding_result", {}) if isinstance(question_grade, dict) else {}
                earned = float(coding_result.get("earned_points") or 0.0)
            else:
                normalized_student = str(student_answer).strip().lower() if student_answer is not None else ""
                normalized_correct = str(question.correct_answer or "").strip().lower()
                earned = max_points if normalized_student and normalized_student == normalized_correct else 0.0
            total_earned += earned
            question_cards.append(
                AssignmentQuestionGradeResponse(
                    question_id=question.id,
                    question_title=question.title or f"Question {question.id}",
                    question_text=question.text or "",
                    question_type=question.question_type or "",
                    max_points=max_points,
                    earned_points=earned,
                    is_auto_graded=True,
                    requires_manual_grading=False,
                    is_fully_graded=True,
                    student_answer="" if student_answer is None else json.dumps(student_answer) if isinstance(student_answer, (dict, list)) else str(student_answer),
                    correct_answer=None if _is_coding_question_type(question.question_type or "") else (question.correct_answer or ""),
                    question_comment=question_comment,
                    rubric_parts=[],
                    coding_result=coding_result,
                )
            )
            continue

        selected_parts = question_grade.get("parts", {}) if isinstance(question_grade, dict) else {}
        rubric_parts = _build_manual_rubric_parts(question, selected_parts)
        manual_earned = sum(float(part.selected_score or 0) for part in rubric_parts)
        auto_earned = 0.0
        coding_earned = 0.0
        coding_parts_count = 0
        coding_parts_complete = 0
        autograder_result = None
        autograder_payload = question_grade.get("autograder", {}) if isinstance(question_grade, dict) else {}
        autograder_parts = autograder_payload.get("parts", {}) if isinstance(autograder_payload, dict) else {}
        correct_answers: dict[str, str] = {}
        for idx, part in enumerate(content.parts):
            if not is_auto_part(part):
                continue
            part_answer = _get_part_payload(student_answer, part.part_id, idx)
            normalized_student = _normalize_auto_answer(part_answer)
            normalized_correct = _normalize_auto_answer(part.correct_answer)
            matching_choice = next((choice for choice in part.choices if _normalize_auto_answer(choice.id) == normalized_correct), None)
            correct_text = matching_choice.text if matching_choice else part.correct_answer
            correct_answers[part.part_id] = str(correct_text or part.correct_answer or "")
            valid_correct_values = {_normalize_auto_answer(part.correct_answer)}
            if matching_choice:
                valid_correct_values.add(_normalize_auto_answer(matching_choice.text))
            if normalized_student and normalized_student in valid_correct_values:
                auto_earned += part_max_points(part)
        for idx, part in enumerate(content.parts):
            if not is_coding_part(part):
                continue
            coding_parts_count += 1
            part_key = part.part_id or str(idx)
            part_result = autograder_parts.get(part_key, autograder_parts.get(str(idx), {})) if isinstance(autograder_parts, dict) else {}
            if isinstance(part_result, dict):
                status = str(part_result.get("status") or "")
                if status in {"completed", "compile_error", "compile_timeout"}:
                    coding_parts_complete += 1
                    coding_earned += float(part_result.get("score") or 0)

        if isinstance(autograder_payload, dict) and autograder_payload:
            autograder_result = sanitize_autograder_result(autograder_payload, include_hidden=include_hidden_autograder)

        manual_fully_graded = all(part.graded for part in rubric_parts)
        coding_fully_graded = coding_parts_complete == coding_parts_count
        is_fully_graded = manual_fully_graded and coding_fully_graded
        earned = manual_earned + auto_earned + coding_earned
        total_earned += earned
        question_cards.append(
            AssignmentQuestionGradeResponse(
                question_id=question.id,
                question_qid=question.qid,
                question_title=question.title or f"Question {question.id}",
                question_text=content.stem or question.text or "",
                question_type=question.question_type or "",
                max_points=max_points,
                earned_points=earned,
                is_auto_graded=bool(content.parts) and all(is_auto_part(part) or is_coding_part(part) for part in content.parts),
                requires_manual_grading=_is_manual_question(question) or (coding_parts_count > 0 and not coding_fully_graded),
                is_fully_graded=is_fully_graded,
                student_answer="" if student_answer is None else json.dumps(student_answer) if isinstance(student_answer, (dict, list)) else str(student_answer),
                correct_answer=json.dumps(correct_answers) if len(correct_answers) > 1 else next(iter(correct_answers.values()), None),
                question_comment=question_comment,
                rubric_parts=rubric_parts,
                autograder_result=autograder_result,
            )
        )

    all_fully_graded = all(card.is_fully_graded for card in question_cards)
    raw_score_earned = total_earned
    final_score_earned = float(stored_score_earned) if (grade_submitted and stored_score_earned is not None) else total_earned
    final_score_total = float(stored_score_total) if (grade_submitted and stored_score_total is not None) else total_points
    score_percent = (final_score_earned / final_score_total * 100.0) if final_score_total > 0 else 0.0
    late_penalty_fraction = _late_penalty_fraction(assignment.late_policy_id) if _is_submission_late(assignment, submitted_at) else 0.0
    late_penalty_points = max(0.0, raw_score_earned - final_score_earned) if late_penalty_fraction > 0 else 0.0
    late_penalty_applied = late_penalty_points > 1e-6

    return AssignmentGradingResponse(
        assignment_id=assignment.id,
        assignment_title=assignment.title,
        student_id=student_id,
        grade_submitted=grade_submitted,
        raw_score_earned=round(raw_score_earned, 4),
        score_earned=round(final_score_earned, 4),
        score_total=round(final_score_total, 4),
        score_percent=round(score_percent, 4),
        late_penalty_applied=late_penalty_applied,
        late_penalty_fraction=round(late_penalty_fraction, 6),
        late_penalty_points=round(late_penalty_points, 4),
        all_questions_fully_graded=all_fully_graded,
        questions=question_cards,
    )


def _build_zero_grading_data_for_missing_submission(
    questions: list[Question],
    existing_grading_data: dict[str, Any],
) -> dict[str, Any]:
    normalized = dict(existing_grading_data or {}) if isinstance(existing_grading_data, dict) else {}

    for question in questions:
        if not _is_manual_question(question):
            continue

        qid = _question_answer_key(question)
        legacy_qid = _legacy_question_answer_key(question)
        output_key = qid if qid in normalized or legacy_qid not in normalized else legacy_qid
        existing_question_grade = normalized.get(output_key, normalized.get(qid, normalized.get(legacy_qid, {})))
        existing_parts = existing_question_grade.get("parts", {}) if isinstance(existing_question_grade, dict) else {}
        zero_parts = {}
        for part in _build_manual_rubric_parts(question, {}):
            existing_part = existing_parts.get(str(part.part_index), {}) if isinstance(existing_parts, dict) else {}
            existing_score = existing_part.get("score") if isinstance(existing_part, dict) else None
            try:
                normalized_score = float(existing_score) if existing_score is not None else 0.0
            except (TypeError, ValueError):
                normalized_score = 0.0
            zero_parts[str(part.part_index)] = {
                "score": normalized_score,
                "comment": str(existing_part.get("comment") or ""),
            }

        normalized[output_key] = {
            "question_comment": str(existing_question_grade.get("question_comment") or "") if isinstance(existing_question_grade, dict) else "",
            "parts": zero_parts,
        }

    return normalized


def _run_coding_autograding_for_progress(
    session: Session,
    *,
    assignment: Assignment,
    progress: AssignmentProgress,
) -> AssignmentProgress:
    questions = _render_questions_for_progress(session, assignment=assignment, progress=progress)
    answers = _safe_json_loads(progress.answers if progress else "{}", {})
    grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
    if not isinstance(answers, dict):
        answers = {}
    if not isinstance(grading_data, dict):
        grading_data = {}

    changed = False
    for question in questions:
        content = question_content_from_question(question)
        coding_parts = [(idx, part) for idx, part in enumerate(content.parts) if is_coding_part(part)]
        if not coding_parts:
            continue

        qid = _question_answer_key(question)
        legacy_qid = _legacy_question_answer_key(question)
        question_answer = _get_question_payload(answers, question, {})
        if not isinstance(question_answer, dict):
            question_answer = {"a": question_answer}

        existing_question_grade = _get_question_payload(grading_data, question, {})
        if not isinstance(existing_question_grade, dict):
            existing_question_grade = {}
        if legacy_qid in grading_data and legacy_qid != qid:
            grading_data[qid] = grading_data.pop(legacy_qid)
        grading_data.setdefault(qid, existing_question_grade)

        autograder = grading_data[qid].get("autograder", {}) if isinstance(grading_data[qid], dict) else {}
        if not isinstance(autograder, dict):
            autograder = {}
        part_results = autograder.get("parts", {})
        if not isinstance(part_results, dict):
            part_results = {}

        for idx, part in coding_parts:
            part_key = part.part_id or str(idx)
            part_answer = _get_part_payload(question_answer, part_key, idx)
            part_results[part_key] = grade_coding_part(part, part_answer)
            changed = True

        autograder["status"] = "completed"
        autograder["graded_at"] = datetime.utcnow().isoformat()
        autograder["parts"] = part_results
        grading_data[qid]["autograder"] = autograder

    if changed:
        progress.grading_data = json.dumps(grading_data)
        progress.updated_at = datetime.utcnow()
        session.add(progress)
        session.commit()
        session.refresh(progress)
    return progress


def _is_submission_late(assignment: Assignment, submitted_at: Optional[datetime]) -> bool:
    if not submitted_at:
        return False
    soft_due_local = _normalize_schedule_datetime_local(assignment.due_date_soft)
    soft_due_utc = soft_due_local.astimezone(timezone.utc) if soft_due_local else None
    submitted_utc = _normalize_datetime_utc(submitted_at)
    return bool(soft_due_utc and submitted_utc and submitted_utc > soft_due_utc)


def _late_penalty_fraction(late_policy_id: Optional[str]) -> float:
    raw = (str(late_policy_id or "")).strip()
    if not raw:
        return 0.0
    try:
        value = float(raw)
    except ValueError:
        return 0.0
    if value > 1.0:
        value = value / 100.0
    return max(0.0, min(1.0, value))


def _all_students_graded_for_assignment(
    session: Session,
    *,
    assignment: Assignment,
    student_ids: list[str],
) -> bool:
    if _get_assignment_phase(assignment) not in {"ungraded", "graded"}:
        return False

    if not student_ids:
        return True

    progress_rows = list_assignment_progress_for_students(session, assignment.id, student_ids)
    progress_by_student_id = {row.student_id: row for row in progress_rows}

    for student_id in student_ids:
        progress = progress_by_student_id.get(student_id)
        if not (progress and progress.grade_submitted_at):
            return False

    return True


def _score_band_label(score_percent: float) -> str:
    pct = max(0.0, min(100.0, float(score_percent)))
    if pct >= 90.0:
        return "90-100"
    if pct >= 80.0:
        return "80-89"
    if pct >= 70.0:
        return "70-79"
    if pct >= 60.0:
        return "60-69"
    return "<60"


def _analytics_cutoff_utc(date_range: str) -> Optional[datetime]:
    now_utc = datetime.now(timezone.utc)
    normalized = (date_range or "all").strip().lower()
    if normalized == "7d":
        return now_utc - timedelta(days=7)
    if normalized == "30d":
        return now_utc - timedelta(days=30)
    return None


def _mean_or_none(values: list[float]) -> Optional[float]:
    if not values:
        return None
    return float(sum(values) / len(values))


def _stddev_or_none(values: list[float]) -> Optional[float]:
    if not values:
        return None
    if len(values) == 1:
        return 0.0
    return float(statistics.pstdev(values))


def _sync_assignment_post_due_grading(
    session: Session,
    *,
    assignment: Assignment,
    student_ids: list[str],
) -> None:
    """
    After the late due date, persist grades for any submission that can already be finalized.

    This covers:
    - non-submissions, which become auto-zeroes
    - fully auto-graded submissions
    - manually graded submissions whose rubric parts are already complete
    """
    if assignment.grade_released or not student_ids or not _has_late_due_passed(assignment):
        return

    progress_rows = list_assignment_progress_for_students(session, assignment.id, student_ids)
    progress_by_student_id = {row.student_id: row for row in progress_rows}
    canonical_questions = _get_assignment_questions(session, assignment)
    assignment_total_points = sum(_question_max_points(question) for question in canonical_questions)

    changed = False
    updated_at = datetime.utcnow()
    finalized_at = datetime.utcnow()

    for student_id in student_ids:
        progress = progress_by_student_id.get(student_id)
        questions = _render_questions_for_progress(session, assignment=assignment, progress=progress, questions=canonical_questions)
        submitted_at = _normalize_datetime_utc(progress.submitted_at) if progress else None
        submitted = bool(progress and progress.submitted and submitted_at)
        answers = _safe_json_loads(progress.answers if progress else "{}", {})
        grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
        normalized_grading_data = grading_data if isinstance(grading_data, dict) else {}
        auto_graded_at = _late_due_deadline_stored(assignment) or finalized_at

        next_score_earned: Optional[float] = None
        next_score_total: Optional[float] = None
        should_finalize = False

        if not submitted:
            normalized_grading_data = _build_zero_grading_data_for_missing_submission(
                questions,
                normalized_grading_data,
            )
            computed = _build_grading_response(
                assignment=assignment,
                student_id=student_id,
                questions=questions,
                answers_by_question_id={},
                grading_data=normalized_grading_data,
                grade_submitted=False,
                submitted_at=None,
                stored_score_earned=None,
                stored_score_total=None,
            )
            should_finalize = True
            next_score_earned = computed.score_earned
            next_score_total = computed.score_total
        else:
            if progress and any(_has_coding_question(question) for question in questions):
                progress = _run_coding_autograding_for_progress(session, assignment=assignment, progress=progress)
                answers = _safe_json_loads(progress.answers if progress else "{}", {})
                normalized_grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
                if not isinstance(normalized_grading_data, dict):
                    normalized_grading_data = {}
            computed = _build_grading_response(
                assignment=assignment,
                student_id=student_id,
                questions=questions,
                answers_by_question_id=answers if isinstance(answers, dict) else {},
                grading_data=normalized_grading_data,
                grade_submitted=False,
                submitted_at=progress.submitted_at if progress else None,
                stored_score_earned=None,
                stored_score_total=None,
            )
            if computed.all_questions_fully_graded:
                should_finalize = True
                next_score_earned = computed.score_earned
                next_score_total = computed.score_total
                if _is_submission_late(assignment, submitted_at):
                    penalty_fraction = _late_penalty_fraction(assignment.late_policy_id)
                    next_score_earned = max(0.0, next_score_earned * (1.0 - penalty_fraction))

        if not should_finalize:
            continue

        if not progress:
            progress = AssignmentProgress(
                assignment_id=assignment.id,
                student_id=student_id,
                answers="{}",
                grading_data=json.dumps(normalized_grading_data),
                current_question_index=0,
                submitted=False,
            )
            session.add(progress)
            progress_by_student_id[student_id] = progress
            changed = True

        score_changed = (
            progress.score_earned is None
            or progress.score_total is None
            or abs(float(progress.score_earned) - float(next_score_earned)) > 1e-6
            or abs(float(progress.score_total) - float(next_score_total)) > 1e-6
        )
        submission_changed = not bool(progress.grade_submitted)
        graded_at_changed = (
            not submitted
            and progress.grade_submitted_at != auto_graded_at
        )
        cleared_auto_submitted_at = not submitted and progress.submitted_at is not None

        if not (score_changed or submission_changed or graded_at_changed or cleared_auto_submitted_at or progress.grade_submitted_at is None):
            continue

        progress.grading_data = json.dumps(normalized_grading_data)
        progress.grade_submitted = True
        if not submitted:
            progress.submitted_at = None
            progress.grade_submitted_at = auto_graded_at
        elif progress.grade_submitted_at is None:
            progress.grade_submitted_at = finalized_at
        progress.score_earned = float(next_score_earned)
        progress.score_total = float(next_score_total)
        progress.updated_at = updated_at
        session.add(progress)
        changed = True

    if changed:
        session.commit()


def _roster_call_for_user(
    session: Session,
    user_id: str,
    method: str,
    path: str,
    *,
    params: Optional[dict[str, Any]] = None,
    json_body: Optional[dict[str, Any]] = None,
):
    user_email = get_current_user_email()
    user_name = get_current_user_name()
    impersonator_sub = get_impersonator_sub()
    impersonator_name = get_impersonator_name()
    user_token = get_current_user_token()
    return call_roster(
        method,
        path,
        user_id=user_id,
        user_email=user_email,
        user_name=user_name,
        impersonator_sub=impersonator_sub,
        impersonator_name=impersonator_name,
        user_token=user_token,
        params=params,
        json_body=json_body,
    )


def _fetch_research_id_for_current_user(user_id: str) -> Optional[str]:
    return fetch_research_id(
        user_id,
        user_email=get_current_user_email(),
        user_name=get_current_user_name(),
        user_token=get_current_user_token(),
    )


def _display_name_from_user_payload(user_id: str, payload: dict[str, Any]) -> str:
    first_name = str(payload.get("first_name") or "").strip()
    last_name = str(payload.get("last_name") or "").strip()
    if first_name and last_name:
        return f"{first_name} {last_name}"

    full_name = str(payload.get("name") or payload.get("full_name") or "").strip()
    if full_name:
        return full_name

    email = str(payload.get("email") or "").strip()
    if email:
        return email

    return user_id


def _resolve_student_name_map(
    session: Session,
    current_user_id: str,
    student_ids: list[str],
    course_payload: dict[str, Any],
) -> dict[str, str]:
    provided = course_payload.get("student_name_by_id") or {}
    student_name_by_id: dict[str, str] = {}
    if isinstance(provided, dict):
        for student_id, name in provided.items():
            normalized_student_id = str(student_id)
            display_name = str(name or "").strip()
            if display_name and display_name != normalized_student_id:
                student_name_by_id[normalized_student_id] = display_name

    missing_ids = [sid for sid in student_ids if not student_name_by_id.get(sid)]
    for student_id in missing_ids:
        try:
            user_payload = _roster_call_for_user(
                session,
                current_user_id,
                "GET",
                f"/api/users/{student_id}",
            )
        except Exception:
            student_name_by_id[student_id] = student_id
            continue

        if isinstance(user_payload, dict):
            student_name_by_id[student_id] = _display_name_from_user_payload(student_id, user_payload)
        else:
            student_name_by_id[student_id] = student_id

    return student_name_by_id


def _build_course_response_from_roster(session: Session, payload: dict[str, Any]) -> CourseResponse:
    # Keep roster as source-of-truth for course/user metadata and Caliber DB for assignments.
    course_id = int(payload["id"])
    instructor_email = payload.get("instructor_email")
    student_ids = payload.get("student_ids") or []
    assignments = get_course_assignments(session, course_id)
    return CourseResponse(
        id=course_id,
        course_name=payload.get("course_name") or "",
        course_code=payload.get("course_code") or "",
        school_name=payload.get("school_name") or "",
        instructor_id=payload.get("instructor_id") or "",
        instructor_email=instructor_email,
        student_ids=student_ids,
        assignments=[
            build_assignment_response(
                session,
                a,
                instructor_email=instructor_email,
                all_students_graded=_all_students_graded_for_assignment(
                    session,
                    assignment=a,
                    student_ids=student_ids,
                ),
            )
            for a in assignments
        ],
        created_at=payload.get("created_at"),
        updated_at=payload.get("updated_at"),
    )


def _build_course_list_response_from_roster(session: Session, payload: dict[str, Any]) -> CourseListResponse:
    courses_payload = payload.get("courses") or []
    responses = [_build_course_response_from_roster(session, item) for item in courses_payload]
    return CourseListResponse(courses=responses, total=payload.get("total", len(responses)))


def process_pdf_background(
    storage_path: str,
    file_content: bytes,
    user_id: str,
    job_id: Optional[str] = None,
    school: str = "",
    user_school: str = "",
    course: str = "",
    course_type: str = ""
):
    """
    Background task to process PDF and create question records.
    
    This runs asynchronously after the upload endpoint returns.
    
    Args:
        storage_path: The object-storage path of the PDF (e.g., "user123/1234567890.pdf")
        file_content: The PDF file content as bytes
        user_id: The authenticated OIDC subject
    """
    inserted_count = 0
    text = ""
    question_dicts = []

    def cancel_requested() -> bool:
        return _is_upload_cancel_requested(job_id)

    def mark_canceled(phase: str):
        expected = len(question_dicts) if question_dicts else None
        _update_upload_job(
            job_id,
            status="canceled",
            progress_percent=100,
            message=f"Canceled during {phase}. Saved {inserted_count} questions.",
            created_questions=inserted_count,
            expected_questions=expected,
        )

    def _existing_progress(default: int = 0) -> int:
        existing = _get_upload_job(job_id) if job_id else None
        if not existing:
            return default
        try:
            return int(existing.get("progress_percent") or default)
        except (TypeError, ValueError):
            return default

    def m2_progress(current: int, total: int, message: str):
        # Keep progress monotonic and phase-bucketed:
        # Upload: 0-10
        # OCR:    10-40
        # LLM:    40-100
        msg = (message or "").lower()
        ratio = 0.0
        if total > 0:
            ratio = max(0.0, min(1.0, float(current) / float(total)))

        is_llm_phase = any(
            marker in msg
            for marker in ("formatting", "llm", "cleanup", "question records", "generated questions")
        )

        if is_llm_phase:
            pct = 40 + int(ratio * 60)
        else:
            pct = 10 + int(ratio * 30)

        existing_progress = _existing_progress(default=10)
        pct = max(existing_progress, pct)

        _update_upload_job(
            job_id,
            status="cancelling" if cancel_requested() else "running",
            progress_percent=max(10, min(99, pct)),
            message=message,
            expected_questions=total if total > 0 else None,
            created_questions=current if current > 0 else 0,
        )

    if cancel_requested():
        mark_canceled("before processing started")
        return

    # Primary path: run the copied Milestone 2 layout parser from this repo.
    _update_upload_job(job_id, status="running", progress_percent=10, message="Parsing PDF layout")
    try:
        m2_start = time.time()
        question_dicts = extract_questions_with_m2(
            file_content=file_content,
            source_name=storage_path,
            output_dir=Path(UPLOAD_DIR) / "layout_debug",
            progress_callback=m2_progress,
            should_cancel=cancel_requested,
        )
        print(
            f"[m2] completed source={storage_path} "
            f"questions={len(question_dicts)} elapsed={time.time() - m2_start:.1f}s"
        )
    except Exception as e:
        print(f"Error running copied M2 parser for {storage_path}: {e!r}")

    if cancel_requested() and not question_dicts:
        mark_canceled("PDF parsing")
        return

    try:
        # Secondary path: in-repo text + OCR extractor.
        if not question_dicts and not cancel_requested():
            _update_upload_job(job_id, status="running", progress_percent=25, message="Using fallback extractor")
            question_dicts = extract_questions_from_pdf_bytes(file_content, storage_path)
    except Exception as e:
        print(f"Error extracting structured questions from {storage_path}: {e!r}")

    # Compatibility fallback for edge-cases where the structured extractor fails.
    if not question_dicts and not cancel_requested():
        try:
            text = extract_text_from_pdf(file_content)
        except Exception as e:
            print(f"Error extracting text from {storage_path}: {e!r}")

        try:
            _update_upload_job(job_id, status="running", progress_percent=35, message="Using compatibility parser")
            question_dicts = send_to_agent_pipeline(text, storage_path)
        except Exception as e:
            print(f"Error in fallback agent pipeline for {storage_path}: {e!r}")

    if not question_dicts:
        if cancel_requested():
            mark_canceled("fallback parsing")
            return

        fallback_text = (text or "").strip()[:300]
        question_dicts = [{
            "title": "Extracted Preview",
            "text": fallback_text or f"Unable to parse content from {storage_path}.",
            "tags": "auto-generated,pdf-upload",
            "keywords": "pdf,upload,fallback"
        }]

    _update_upload_job(
        job_id,
        status="cancelling" if cancel_requested() else "running",
        progress_percent=max(40, _existing_progress(default=40)),
        message="Preparing question records",
        expected_questions=len(question_dicts),
        created_questions=max(0, len(question_dicts)),
    )

    try:
        with session_with_rls(user_id=user_id, mode="authenticated") as session:
            selected_school = (school or "").strip()
            selected_course = (course or "").strip()
            selected_course_type = (course_type or "").strip()
            effective_school = selected_school
            effective_user_school = (user_school or effective_school).strip()
            effective_course = selected_course
            effective_course_type = selected_course_type

            for q_dict in question_dicts:
                try:
                    question_text = (q_dict.get("text") or "").strip()
                    if not question_text:
                        continue

                    llm_called = bool(q_dict.get("llm_called", False))
                    merged_tags = ",".join([
                        "pdf-upload",
                        "ai-generated",
                        "llm-called" if llm_called else "llm-not-called",
                    ])

                    create_question(
                        session=session,
                        text=question_text,
                        title=q_dict.get("title", "Untitled Question"),
                        tags=merged_tags,
                        keywords="",
                        school=effective_school,
                        user_school=effective_user_school,
                        course=effective_course,
                        course_type=effective_course_type,
                        source_pdf=storage_path,
                        user_id=user_id,
                        is_verified=False
                    )
                    inserted_count += 1
                    expected_count = len(question_dicts) if question_dicts else 1
                    save_progress = min(99, 40 + int((inserted_count / expected_count) * 59))
                    progress = max(_existing_progress(default=40), save_progress)
                    _update_upload_job(
                        job_id,
                        status="cancelling" if cancel_requested() else "running",
                        progress_percent=progress,
                        message="Saving generated questions",
                        expected_questions=expected_count,
                        created_questions=inserted_count,
                    )
                except Exception as e:
                    print(f"Skipping bad generated question for {storage_path}: {e!r}")

            if inserted_count == 0 and not cancel_requested():
                create_question(
                    session=session,
                    text=f"Fallback draft generated for {storage_path}.",
                    title="Extracted Preview",
                    tags="pdf-upload,ai-generated,llm-not-called",
                    keywords="",
                    school=effective_school,
                    user_school=effective_user_school,
                    course=effective_course,
                    course_type=effective_course_type,
                    source_pdf=storage_path,
                    user_id=user_id,
                    is_verified=False
                )
                inserted_count = 1
                _update_upload_job(
                    job_id,
                    status="running",
                    progress_percent=max(_existing_progress(default=99), 99),
                    message="Saving generated questions",
                    expected_questions=max(1, len(question_dicts)),
                    created_questions=inserted_count,
                )

        print(f"Successfully processed {storage_path}: created {inserted_count} questions for user {user_id}")
        expected_total = max(inserted_count, len(question_dicts) if question_dicts else inserted_count)
        if cancel_requested():
            _update_upload_job(
                job_id,
                status="canceled",
                progress_percent=100,
                message=f"Canceled. Saved {inserted_count} questions parsed so far.",
                created_questions=inserted_count,
                expected_questions=expected_total,
            )
        else:
            _update_upload_job(
                job_id,
                status="completed",
                progress_percent=100,
                message=f"Created {inserted_count} questions",
                created_questions=inserted_count,
                expected_questions=expected_total,
            )
    except Exception as e:
        print(f"Error storing generated questions for {storage_path}: {e!r}")
        _update_upload_job(
            job_id,
            status="failed",
            progress_percent=100,
            message=f"Failed to process upload: {e}",
            created_questions=inserted_count,
        )


@app.post("/api/upload-pdf", response_model=UploadResponse)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    storage_path: Optional[str] = Form(None),
    school: str = Form(""),
    course: str = Form(""),
    course_type: str = Form(""),
    user_id: str = Depends(get_current_user)
):
    """
    Upload a PDF file for processing. Requires authentication.

    The backend stores the file in Supabase Storage using a service-role key,
    then queues a background parse job.
    A background task is queued to:
    1. Extract and segment questions from the PDF
    2. Use OCR fallback for scanned/image PDFs when available
    3. Store questions in the database associated with the user
       with the storage_path as source_pdf
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Read file content for processing
    file_content = await file.read()
    if not file_content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    resolved_storage_path = build_pdf_storage_path(user_id, file.filename, storage_path)
    upload_pdf_to_storage(file_content=file_content, storage_path=resolved_storage_path)

    job_id = uuid.uuid4().hex
    _create_upload_job(
        job_id=job_id,
        filename=file.filename,
        storage_path=resolved_storage_path,
        user_id=user_id,
    )
    
    # Queue background processing with user_id and storage_path
    background_tasks.add_task(
        process_pdf_background,
        resolved_storage_path,
        file_content,
        user_id,
        job_id=job_id,
        school=school,
        course=course,
        course_type=course_type,
    )
    
    return UploadResponse(
        status="queued",
        filename=file.filename,
        storage_path=resolved_storage_path,
        job_id=job_id,
        job_token=_issue_upload_job_token(job_id=job_id, user_id=user_id),
        progress_percent=10,
        message="PDF upload successful. Processing in background."
    )


@app.get("/api/upload-status/{job_id}", response_model=UploadStatusResponse)
def get_upload_status(
    job_id: str,
    request: Request,
    job_token: Optional[str] = None,
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Get progress for a queued PDF upload job."""
    upload_job_token = _extract_upload_job_token(request, job_token)
    job = _authorize_upload_job_access(
        job_id=job_id,
        current_user_id=user_id,
        upload_job_token=upload_job_token,
    )

    public_job = {k: v for k, v in job.items() if k not in {"user_id", "cancel_requested"}}
    return UploadStatusResponse(**public_job)


@app.post("/api/upload-status/{job_id}/cancel", response_model=UploadStatusResponse)
def cancel_upload_status(
    job_id: str,
    request: Request,
    job_token: Optional[str] = None,
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Request cancellation for a queued/running upload job."""
    upload_job_token = _extract_upload_job_token(request, job_token)
    _authorize_upload_job_access(
        job_id=job_id,
        current_user_id=user_id,
        upload_job_token=upload_job_token,
    )

    updated = _request_upload_cancel(job_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Upload job not found")

    public_job = {k: v for k, v in updated.items() if k not in {"user_id", "cancel_requested"}}
    return UploadStatusResponse(**public_job)


@app.get("/api/questions", response_model=QuestionListResponse)
def list_questions(
    skip: int = 0,
    limit: int = 100,
    verified_only: Optional[bool] = None,
    source_pdf: Optional[str] = None,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get a list of questions for the authenticated user with optional filters."""
    questions = get_questions(
        session, 
        user_id=user_id, 
        verified_only=verified_only,
        source_pdf=source_pdf,
        skip=skip, 
        limit=limit
    )
    total = get_questions_count(
        session, 
        user_id=user_id,
        verified_only=verified_only,
        source_pdf=source_pdf
    )
    
    return QuestionListResponse(
        questions=_question_responses_for_user(session, questions, user_id),
        total=total
    )


@app.get("/api/questions/drafts", response_model=QuestionListResponse)
def list_draft_questions(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get the current user's unverified draft questions."""
    questions = get_draft_questions(session, user_id=user_id, skip=skip, limit=limit)
    total = get_draft_questions_count(session, user_id=user_id)

    return QuestionListResponse(
        questions=_question_responses_for_user(session, questions, user_id),
        total=total
    )


@app.get("/api/questions/all", response_model=QuestionListResponse)
def list_all_questions(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get questions visible to the authenticated user."""
    school_scope = ""
    course_scope_ids: list[str] = []
    try:
        user_payload = _roster_call_for_user(session, user_id, "GET", "/api/user")
        school_scope = str(user_payload.get("school_name") or "").strip()
    except Exception:
        school_scope = ""
    try:
        courses_payload = _roster_call_for_user(
            session,
            user_id,
            "GET",
            "/api/courses",
            params={"skip": 0, "limit": 1000},
        )
        course_items = courses_payload.get("courses") if isinstance(courses_payload, dict) else courses_payload
        if isinstance(course_items, list):
            course_scope_ids = [str(item.get("id")) for item in course_items if isinstance(item, dict) and item.get("id") is not None]
    except Exception:
        course_scope_ids = []

    questions = get_all_questions(
        session,
        skip=skip,
        limit=limit,
        user_id=user_id,
        school_scope=school_scope,
        course_scope_ids=course_scope_ids,
    )
    total = get_all_questions_count(
        session,
        user_id=user_id,
        school_scope=school_scope,
        course_scope_ids=course_scope_ids,
    )
    
    return QuestionListResponse(
        questions=_question_responses_for_user(session, questions, user_id),
        total=total
    )


@app.post("/api/questions/json", response_model=QuestionResponse, status_code=201)
def create_question_json(
    question_data: QuestionCreate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Create a question using the structured JSON contract."""
    parsed_content = None
    if question_data.content is not None:
        try:
            parsed_content = QuestionContent.model_validate(question_data.content)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid question content: {exc}") from exc

    try:
        question = create_question(
            session=session,
            qid=question_data.qid,
            version=question_data.version,
            title=question_data.title,
            text=question_data.text,
            content=parsed_content,
            tags=question_data.tags,
            keywords=question_data.keywords,
            school=question_data.school,
            user_school=question_data.user_school,
            course=question_data.course,
            course_type=question_data.course_type,
            question_type=question_data.question_type,
            blooms_taxonomy=question_data.blooms_taxonomy,
            answer_choices=question_data.answer_choices,
            correct_answer=question_data.correct_answer,
            pdf_url=question_data.pdf_url,
            source_pdf=question_data.source_pdf,
            image_url=question_data.image_url,
            user_id=user_id,
            is_verified=question_data.is_verified,
            draft_state=question_data.draft_state,
            visibility=_normalize_visibility(question_data.visibility),
            origin=question_data.origin,
            school_scope=question_data.school_scope,
            course_scope=question_data.course_scope,
            source_repo=question_data.source_repo,
            source_path=question_data.source_path,
            source_commit=question_data.source_commit,
            reviewed_at=question_data.reviewed_at,
            reviewed_by=question_data.reviewed_by,
            original_author_user_id=question_data.original_author_user_id,
            copied_from_question_id=question_data.copied_from_question_id,
            copied_from_qid=question_data.copied_from_qid,
        )
        return _question_response_for_user(session, question, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/questions/by-qid/{qid}", response_model=QuestionResponse)
def get_question_by_qid(
    qid: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Get the latest stored question row for a stable qid."""
    question = session.exec(
        select(Question).where(Question.qid == qid).order_by(Question.version.desc())
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    question = _require_question_bank_access(session, question.id, user_id)
    return _question_response_for_user(session, question, user_id)


@app.get("/api/questions/by-qid/{qid}/versions", response_model=QuestionListResponse)
def list_question_versions(
    qid: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """List versions for a stable qid. Current schema keeps qid unique, so this returns 0 or 1 rows."""
    questions = list(session.exec(
        select(Question).where(Question.qid == qid).order_by(Question.version.desc())
    ).all())
    school_scope, course_scope_ids = _question_scope_for_user(session, user_id)
    visible_ids = set(session.exec(
        select(Question.id).where(
            Question.qid == qid,
            _visible_question_predicate(
                user_id=user_id,
                school_scope=school_scope,
                course_scope_ids=course_scope_ids,
            ),
        )
    ).all())
    questions = [question for question in questions if question.id in visible_ids]
    return QuestionListResponse(
        questions=_question_responses_for_user(session, questions, user_id),
        total=len(questions),
    )


@app.put("/api/questions/by-qid/{qid}", response_model=QuestionResponse)
def update_question_by_qid(
    qid: str,
    question_data: QuestionUpdate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Update a question using its stable qid."""
    question = session.exec(select(Question).where(Question.qid == qid).order_by(Question.version.desc())).first()
    if not question or question.id is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return update_existing_question(question.id, question_data, session=session, user_id=user_id)


def _import_response_from_items(items, *, dry_run: bool, import_id: Optional[str] = None) -> QuestionImportResponse:
    created = sum(1 for item in items if item.action == "create")
    updated = sum(1 for item in items if item.action == "update")
    skipped = sum(1 for item in items if item.action == "skip")
    errors = sum(1 for item in items if item.action == "error")
    return QuestionImportResponse(
        import_id=import_id,
        dry_run=dry_run,
        created_count=created,
        updated_count=updated,
        skipped_count=skipped,
        error_count=errors,
        items=[QuestionImportItem(qid=item.qid, path=item.path, action=item.action, message=item.message) for item in items],
    )


@app.post("/api/question-imports/dry-run", response_model=QuestionImportResponse)
async def dry_run_question_folder_import(
    file: UploadFile = File(...),
    conflict_mode: str = Form("create_only"),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Validate a zipped Caliber question folder without writing changes."""
    try:
        _, prepared, errors = prepare_question_zip(await file.read())
        items = dry_run_question_import(session, prepared, errors, conflict_mode, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response = _import_response_from_items(items, dry_run=True, import_id=str(uuid.uuid4()))
    if response.import_id:
        QUESTION_IMPORT_RESULTS[response.import_id] = response
    return response


@app.post("/api/question-imports", response_model=QuestionImportResponse)
async def import_question_folder(
    file: UploadFile = File(...),
    conflict_mode: str = Form("create_only"),
    source_repo: Optional[str] = Form(None),
    source_commit: Optional[str] = Form(None),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Import a zipped Caliber question folder."""
    try:
        _, prepared, errors = prepare_question_zip(await file.read())
        dry_items = dry_run_question_import(session, prepared, errors, conflict_mode, user_id)
        if any(item.action == "error" for item in dry_items):
            response = _import_response_from_items(dry_items, dry_run=False, import_id=str(uuid.uuid4()))
            QUESTION_IMPORT_RESULTS[response.import_id] = response
            return response
        applied_items = apply_question_import(
            session,
            prepared,
            user_id=user_id,
            source_repo=source_repo,
            source_commit=source_commit,
            conflict_mode=conflict_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response = _import_response_from_items(applied_items, dry_run=False, import_id=str(uuid.uuid4()))
    QUESTION_IMPORT_RESULTS[response.import_id] = response
    return response


@app.get("/api/question-imports/{import_id}", response_model=QuestionImportResponse)
def get_question_import_result(
    import_id: str,
    user_id: str = Depends(get_current_user),
):
    """Return a recent import or dry-run summary by id."""
    result = QUESTION_IMPORT_RESULTS.get(import_id)
    if not result:
        raise HTTPException(status_code=404, detail="Question import not found")
    return result


@app.post("/api/question-exports")
def export_question_folder(
    payload: QuestionExportRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Export selected questions as a Caliber question-folder zip."""
    school_scope, course_scope_ids = _question_scope_for_user(session, user_id)

    statement = select(Question).where(
        _visible_question_predicate(
            user_id=user_id,
            school_scope=school_scope,
            course_scope_ids=course_scope_ids,
        )
    )
    if payload.qids:
        statement = statement.where(Question.qid.in_(payload.qids))
    elif not payload.include_private:
        statement = statement.where(Question.visibility != "private")
    questions = list(session.exec(statement.order_by(Question.qid)).all())

    assignments: list[Assignment] = []
    if payload.assignment_ids:
        assignments = list(session.exec(
            select(Assignment).where(
                Assignment.id.in_(payload.assignment_ids),
                Assignment.instructor_id == user_id,
            ).order_by(Assignment.id)
        ).all())

    export_id = str(uuid.uuid4())
    zip_bytes = build_question_export_zip(questions, assignments=assignments)
    QUESTION_EXPORT_BYTES[export_id] = zip_bytes
    headers = {
        "Content-Disposition": 'attachment; filename="caliber-questions.zip"',
        "X-Caliber-Export-Id": export_id,
    }
    return StreamingResponse(io.BytesIO(zip_bytes), media_type="application/zip", headers=headers)


@app.get("/api/question-exports/{export_id}/download")
def download_question_export(
    export_id: str,
    user_id: str = Depends(get_current_user),
):
    """Download a recent question export by id."""
    zip_bytes = QUESTION_EXPORT_BYTES.get(export_id)
    if not zip_bytes:
        raise HTTPException(status_code=404, detail="Question export not found")
    headers = {"Content-Disposition": 'attachment; filename="caliber-questions.zip"'}
    return StreamingResponse(io.BytesIO(zip_bytes), media_type="application/zip", headers=headers)


@app.get("/api/questions/{question_id}", response_model=QuestionResponse)
def get_question_by_id(
    question_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get a specific question by ID. Returns the question if it exists (for assignment viewing)."""
    # Don't filter by user_id - allow fetching any question for assignment viewing
    question = _require_question_bank_access(session, question_id, user_id)
    return _build_question_response(
        session,
        question,
        include_hidden_coding=question.user_id == user_id,
        current_user_id=user_id,
    )


@app.post("/api/questions/{question_id}/like", response_model=QuestionResponse)
def toggle_question_like(
    question_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Toggle the current instructor's like on a visible question."""
    question = _require_question_bank_access(session, question_id, user_id)
    existing = session.exec(
        select(QuestionLike).where(
            QuestionLike.question_id == question.id,
            QuestionLike.user_id == user_id,
        )
    ).first()
    if existing:
        session.delete(existing)
    else:
        session.add(QuestionLike(question_id=question.id, user_id=user_id))
    session.commit()
    return _question_response_for_user(session, question, user_id, include_hidden_coding=question.user_id == user_id)


@app.get("/api/questions/{question_id}/comments", response_model=list[QuestionCommentResponse])
def list_question_comments(
    question_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """List instructor comments for a visible question."""
    question = _require_question_bank_access(session, question_id, user_id)
    comments = list(session.exec(
        select(QuestionComment)
        .where(QuestionComment.question_id == question.id)
        .order_by(QuestionComment.created_at.asc())
    ).all())
    return [QuestionCommentResponse.model_validate(comment) for comment in comments]


@app.post("/api/questions/{question_id}/comments", response_model=QuestionCommentResponse, status_code=201)
def create_question_comment(
    question_id: int,
    payload: QuestionCommentCreate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Add an instructor comment to a visible question."""
    question = _require_question_bank_access(session, question_id, user_id)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    comment = QuestionComment(
        question_id=question.id,
        user_id=user_id,
        body=body,
        updated_at=datetime.utcnow(),
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return QuestionCommentResponse.model_validate(comment)


@app.delete("/api/questions/{question_id}/comments/{comment_id}", status_code=204)
def delete_question_comment(
    question_id: int,
    comment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Delete one of the current instructor's comments."""
    _require_question_bank_access(session, question_id, user_id)
    comment = session.get(QuestionComment, comment_id)
    if not comment or comment.question_id != question_id or comment.user_id != user_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    session.delete(comment)
    session.commit()


@app.post("/api/questions/{question_id}/copy", response_model=QuestionResponse, status_code=201)
def copy_question_to_my_bank(
    question_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Copy a shared question into the current instructor's local bank while preserving author credit."""
    source_question = _require_question_bank_access(session, question_id, user_id)
    if source_question.user_id == user_id:
        raise HTTPException(status_code=400, detail="This question is already in your question bank")
    if _is_locked_question(source_question):
        raise HTTPException(status_code=400, detail="Locked questions are export-only and cannot be copied into assignments")

    source_content = question_content_from_question(source_question) if (source_question.content or "").strip() else None
    try:
        copied_question = create_question(
            session=session,
            title=source_question.title,
            text=source_question.text,
            content=source_content,
            tags=source_question.tags,
            keywords=source_question.keywords,
            school=source_question.school,
            user_school=source_question.user_school,
            course=source_question.course,
            course_type=source_question.course_type,
            question_type=source_question.question_type,
            blooms_taxonomy=source_question.blooms_taxonomy,
            answer_choices=source_question.answer_choices,
            correct_answer=source_question.correct_answer,
            pdf_url=source_question.pdf_url,
            source_pdf=source_question.source_pdf,
            image_url=source_question.image_url,
            user_id=user_id,
            owner_user_id=user_id,
            original_author_user_id=source_question.original_author_user_id or source_question.owner_user_id or source_question.user_id,
            is_verified=True,
            draft_state="ready",
            visibility="local",
            origin="global_copy",
            school_scope=source_question.school_scope,
            course_scope=source_question.course_scope,
            source_repo=source_question.source_repo,
            source_path=source_question.source_path,
            source_commit=source_question.source_commit,
            copied_from_question_id=source_question.id,
            copied_from_qid=source_question.qid,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if _is_coding_question_type(source_question.question_type):
        private_row = get_coding_question_private(session, source_question.id)
        if private_row:
            upsert_coding_question_private(session, copied_question.id, private_row.hidden_tests)

    return _question_response_for_user(session, copied_question, user_id, include_hidden_coding=True)


@app.post("/api/questions/{question_id}/variants", response_model=QuestionListResponse, status_code=201)
def generate_question_variants(
    question_id: int,
    count: int = 1,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Generate AI variants for a question and save them as unverified draft questions.

    The source question may be any verified question, or an unverified draft owned by
    the current user. Generated drafts are owned by the current user and tagged with
    their source question QID; they intentionally do not set ``source_pdf`` because
    they originate from a question, not a PDF upload.
    """
    requested = max(1, min(int(count or 1), 10))
    source_question = get_question(session, question_id, user_id=None)
    if not source_question:
        raise HTTPException(status_code=404, detail="Question not found")
    if not source_question.is_verified and source_question.user_id != user_id:
        raise HTTPException(status_code=404, detail="Question not found")
    if not (source_question.text or "").strip():
        raise HTTPException(status_code=400, detail="Source question has no text")

    source_db = question_to_variant_gen_db(source_question)
    generated_variants: list[dict[str, Any]] = []
    max_outer_attempts = requested * 2

    for _ in range(max_outer_attempts):
        if len(generated_variants) >= requested:
            break
        variant = generate_variant(0, ingestion_index=0, questions_db=source_db)
        if variant:
            generated_variants.append(variant)

    if len(generated_variants) < requested:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Generated {len(generated_variants)} of {requested} requested variants. "
                "No drafts were saved for this run."
            ),
        )

    source_label = source_question.qid or str(source_question.id)
    run_source = f"variant:{source_label}:{uuid.uuid4().hex[:12]}"
    run_tag = f"variant-source:{source_label}"
    drafts = [
        _save_variant_draft_question(
            session=session,
            source_question=source_question,
            variant=variant,
            user_id=user_id,
            run_source=run_source,
            run_tag=run_tag,
            number=i,
        )
        for i, variant in enumerate(generated_variants, start=1)
    ]

    return QuestionListResponse(
        questions=_question_responses_for_user(session, drafts, user_id),
        total=len(drafts),
    )


@app.post("/api/questions/batch", response_model=QuestionListResponse)
def get_questions_batch(
    question_ids: list[int],
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get multiple questions by IDs in a single request. More efficient than individual calls."""
    school_scope, course_scope_ids = _question_scope_for_user(session, user_id)
    questions = list(session.exec(
        select(Question).where(
            Question.id.in_(question_ids),
            _visible_question_predicate(
                user_id=user_id,
                school_scope=school_scope,
                course_scope_ids=course_scope_ids,
            ),
        )
    ).all())
    id_to_question = {question.id: question for question in questions}
    questions = [id_to_question[question_id] for question_id in question_ids if question_id in id_to_question]
    return QuestionListResponse(
        questions=_question_responses_for_user(session, questions, user_id),
        total=len(questions)
    )


@app.post("/api/questions", response_model=QuestionResponse, status_code=201)
def create_new_question(
    qid: Optional[str] = Form(None),
    version: int = Form(1),
    title: str = Form(...),
    text: str = Form(...),
    content: Optional[str] = Form(None),
    tags: str = Form(""),
    keywords: str = Form(""),
    school: str = Form(""),
    user_school: str = Form(""),
    course: str = Form(""),
    course_type: str = Form(""),
    question_type: str = Form(""),
    blooms_taxonomy: str = Form(""),
    answer_choices: str = Form("[]"),
    correct_answer: str = Form(""),
    coding_config: str = Form(""),
    pdf_url: Optional[str] = Form(None),
    source_pdf: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
    draft_state: Optional[str] = Form(None),
    visibility: str = Form("local"),
    origin: str = Form("manual"),
    school_scope: str = Form(""),
    course_scope: Optional[str] = Form(None),
    source_repo: Optional[str] = Form(None),
    source_path: Optional[str] = Form(None),
    source_commit: Optional[str] = Form(None),
    reviewed_at: Optional[datetime] = Form(None),
    reviewed_by: Optional[str] = Form(None),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Create a new question using form parameters.

    This endpoint requires authentication. If no ``source_pdf`` is provided
    (i.e., the question is created manually and not extracted from a PDF),
    the question is marked as verified by default.
    """
    # Manual questions are ready by default, but an explicit draft_state wins.
    effective_draft_state = draft_state or ("ready" if source_pdf is None else "draft")
    is_verified = effective_draft_state == "ready"
    parsed_content = None
    if content:
        try:
            parsed_content = QuestionContent.model_validate(_safe_json_loads(content, {}))
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid question content: {exc}") from exc

    coding_payload = _safe_json_loads(coding_config, {})
    normalized_answer_choices = answer_choices
    normalized_correct_answer = correct_answer
    if _is_coding_question_type(question_type):
        _validate_coding_authoring_payload(coding_payload)
        public_coding = normalize_coding_public_config(coding_payload)
        normalized_answer_choices = serialize_coding_public_config(public_coding)
        normalized_correct_answer = "coding"

    try:
        question = create_question(
            session=session,
            qid=qid,
            version=version,
            title=title,
            text=text,
            content=parsed_content,
            tags=tags,
            keywords=keywords,
            school=school,
            user_school=user_school,
            course=course,
            course_type=course_type,
            question_type=question_type,
            blooms_taxonomy=blooms_taxonomy,
            answer_choices=normalized_answer_choices,
            correct_answer=normalized_correct_answer,
            pdf_url=pdf_url,
            source_pdf=source_pdf,
            image_url=image_url,
            user_id=user_id,
            is_verified=is_verified,
            draft_state=effective_draft_state,
            visibility=_normalize_visibility(visibility),
            origin=origin,
            school_scope=school_scope,
            course_scope=course_scope,
            source_repo=source_repo,
            source_path=source_path,
            source_commit=source_commit,
            reviewed_at=reviewed_at,
            reviewed_by=reviewed_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if _is_coding_question_type(question_type):
        upsert_coding_question_private(
            session,
            question.id,
            serialize_coding_hidden_tests((coding_payload or {}).get("hidden_tests")),
        )
    return _question_response_for_user(session, question, user_id, include_hidden_coding=True)


@app.put("/api/questions/{question_id}", response_model=QuestionResponse)
def update_existing_question(
    question_id: int,
    question_data: QuestionUpdate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Update an existing question. Only accessible by the question owner."""
    parsed_content = None
    if question_data.content is not None:
        try:
            parsed_content = QuestionContent.model_validate(question_data.content)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid question content: {exc}") from exc

    try:
        question = update_question(
            session=session,
            question_id=question_id,
            user_id=user_id,
            qid=question_data.qid,
            version=question_data.version,
            title=question_data.title,
            text=question_data.text,
            content=parsed_content,
            tags=question_data.tags,
            keywords=question_data.keywords,
            school=question_data.school,
            user_school=question_data.user_school,
            course=question_data.course,
            course_type=question_data.course_type,
            question_type=question_data.question_type,
            blooms_taxonomy=question_data.blooms_taxonomy,
            answer_choices=question_data.answer_choices,
            correct_answer=question_data.correct_answer,
            pdf_url=question_data.pdf_url,
            source_pdf=question_data.source_pdf,
            image_url=question_data.image_url,
            is_verified=question_data.is_verified,
            draft_state=question_data.draft_state,
            visibility=_normalize_visibility(question_data.visibility) if question_data.visibility is not None else None,
            origin=question_data.origin,
            school_scope=question_data.school_scope,
            course_scope=question_data.course_scope,
            source_repo=question_data.source_repo,
            source_path=question_data.source_path,
            source_commit=question_data.source_commit,
            reviewed_at=question_data.reviewed_at,
            reviewed_by=question_data.reviewed_by,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if question_data.question_type is not None and _is_coding_question_type(question_data.question_type):
        coding_payload = question_data.coding_config or {}
        _validate_coding_authoring_payload(coding_payload)
        question = update_question(
            session=session,
            question_id=question_id,
            user_id=user_id,
            answer_choices=serialize_coding_public_config(coding_payload),
            correct_answer="coding",
        )
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        upsert_coding_question_private(
            session,
            question.id,
            serialize_coding_hidden_tests(coding_payload.get("hidden_tests")),
        )
    elif question.question_type == "coding" and question_data.coding_config is not None:
        coding_payload = question_data.coding_config or {}
        _validate_coding_authoring_payload(coding_payload)
        question = update_question(
            session=session,
            question_id=question_id,
            user_id=user_id,
            answer_choices=serialize_coding_public_config(coding_payload),
            correct_answer="coding",
        )
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        upsert_coding_question_private(
            session,
            question.id,
            serialize_coding_hidden_tests(coding_payload.get("hidden_tests")),
        )

    return _question_response_for_user(session, question, user_id, include_hidden_coding=True)


@app.delete("/api/questions/{question_id}", status_code=204)
def delete_existing_question(
    question_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Delete a question. Only accessible by the question owner."""
    success = delete_question(session, question_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Question not found")


@app.delete("/api/questions-by-source/unverified")
def delete_unverified_by_source(
    source_pdf: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Delete all unverified questions for the current user and a specific uploaded source_pdf."""
    deleted_count = delete_unverified_questions_by_source(session, user_id=user_id, source_pdf=source_pdf)
    return {"deleted_count": deleted_count}


@app.post("/api/questions/verify-by-source", response_model=VerifyBySourceResponse)
def verify_questions_by_source(
    payload: VerifyBySourceRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """
    Atomically verify selected draft questions and delete remaining drafts
    for the same source_pdf and current user.
    """
    source_pdf = (payload.source_pdf or "").strip()
    if not source_pdf:
        raise HTTPException(status_code=400, detail="source_pdf is required")

    selected_ids = {int(qid) for qid in (payload.selected_question_ids or []) if isinstance(qid, int) or str(qid).isdigit()}
    if not selected_ids:
        raise HTTPException(status_code=400, detail="At least one selected question id is required")

    drafts = list(session.exec(
        select(Question).where(
            Question.user_id == user_id,
            Question.source_pdf == source_pdf,
            Question.is_verified == False,  # noqa: E712
        )
    ).all())

    if not drafts:
        raise HTTPException(status_code=404, detail="No draft questions found for this source")

    draft_ids = {q.id for q in drafts if q.id is not None}
    verify_ids = selected_ids.intersection(draft_ids)
    if not verify_ids:
        raise HTTPException(status_code=400, detail="Selected questions are not valid drafts for this source")

    verified_count = 0
    deleted_count = 0

    for q in drafts:
        if q.id in verify_ids:
            q.is_verified = True
            session.add(q)
            verified_count += 1
        else:
            session.delete(q)
            deleted_count += 1

    session.commit()

    return VerifyBySourceResponse(
        verified_count=verified_count,
        deleted_count=deleted_count,
        total_drafts=len(drafts),
    )


@app.get("/api/user")
def get_user_info(
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get information about the authenticated user including admin, teacher status, and profile data."""
    return _roster_call_for_user(session, user_id, "GET", "/api/user")


@app.get("/api/me")
def get_me(user_id: str = Depends(get_current_user)):
    """Return authenticated user identity including active impersonation state."""
    imp_sub = get_impersonator_sub()
    imp_name = get_impersonator_name()
    return {
        "user_id": user_id,
        "name": get_current_user_name(),
        "impersonation": {
            "active": True,
            "impersonator_sub": imp_sub,
            "impersonator_name": imp_name,
        } if imp_sub else None,
    }


@app.post("/api/impersonate/exit")
def impersonate_exit(request: Request):
    """Clear the platform-wide impersonation cookie."""
    from fastapi.responses import JSONResponse as _JSONResponse
    resp = _JSONResponse({"success": True})
    resp.delete_cookie("platform_impersonate", path="/")
    return resp


@app.put("/api/user/profile", response_model=UserResponse)
def update_user_profile_endpoint(
    profile_data: UserProfileUpdate,
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update the authenticated user's profile (first name and last name only - not teacher status)."""
    return _roster_call_for_user(
        session,
        user_id,
        "PUT",
        "/api/user/profile",
        json_body=profile_data.model_dump(exclude_none=True),
    )


@app.put("/api/user/preferences", response_model=UserResponse)
def update_user_preferences_endpoint(
    preferences_data: UserPreferencesUpdate,
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update the authenticated user's profile preferences (icon shape, color, and initials)."""
    return _roster_call_for_user(
        session,
        user_id,
        "PUT",
        "/api/user/preferences",
        json_body=preferences_data.model_dump(exclude_none=True),
    )


@app.post("/api/user/onboarding", response_model=UserResponse)
def complete_user_onboarding(
    onboarding_data: UserOnboardingUpdate,
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Complete user onboarding with first/last name and optional instructor request."""
    return _roster_call_for_user(
        session,
        user_id,
        "POST",
        "/api/user/onboarding",
        json_body=onboarding_data.model_dump(exclude_none=True),
    )


@app.get("/api/users", response_model=UserListResponse)
def list_users(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    current_user_id: str = Depends(get_current_user)
):
    """
    Get a list of all users. Requires authentication.
    Used for selecting students to add to courses.
    """
    return _roster_call_for_user(
        session,
        current_user_id,
        "GET",
        "/api/users",
        params={"skip": skip, "limit": limit},
    )


@app.get("/api/users/{user_id}", response_model=UserResponse)
def get_user_by_id(
    user_id: str,
    session: Session = Depends(get_session),
    current_user_id: str = Depends(get_current_user)
):
    """
    Get user information by user_id. Requires authentication.
    All authenticated users can view basic profile information (for displaying user icons).
    """
    return _roster_call_for_user(
        session,
        current_user_id,
        "GET",
        f"/api/users/{user_id}",
    )


@app.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    user_data: UserUpdate,
    session: Session = Depends(get_session),
    current_user_id: str = Depends(get_current_user)
):
    """
    Update user admin/teacher status. Requires authentication and admin privileges.
    Only admin users can update user roles.
    """
    return _roster_call_for_user(
        session,
        current_user_id,
        "PUT",
        f"/api/users/{user_id}",
        json_body=user_data.model_dump(exclude_none=True),
    )


# Course endpoints

@app.post("/api/courses", response_model=CourseResponse, status_code=201)
def create_new_course(
    course_data: CourseCreate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Create a new course. Requires authentication and teacher status.
    Only teachers can create courses.
    """
    payload = _roster_call_for_user(
        session,
        user_id,
        "POST",
        "/api/courses",
        json_body=course_data.model_dump(exclude_none=True),
    )
    return _build_course_response_from_roster(session, payload)


@app.get("/api/courses", response_model=CourseListResponse)
def list_courses(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Get a list of courses for the authenticated user.
    Teachers see courses they instruct, students see courses they're enrolled in.
    """
    payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        "/api/courses",
        params={"skip": skip, "limit": limit},
    )
    return _build_course_list_response_from_roster(session, payload)


@app.get("/api/courses/all", response_model=CourseListResponse)
def list_all_courses_admin(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Admin-only endpoint to list all courses in the system."""
    payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        "/api/courses/all",
        params={"skip": skip, "limit": limit},
    )
    return _build_course_list_response_from_roster(session, payload)


@app.get("/api/admin/courses-overview", response_model=AdminCourseOverviewResponse)
def list_all_courses_admin_overview(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Admin-only compact all-courses endpoint optimized for dashboard cards."""
    payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        "/api/admin/courses-overview",
        params={"skip": skip, "limit": limit},
    )
    courses_payload = payload.get("courses") or []

    assignment_counts = dict(
        session.exec(
            select(Assignment.course_id, func.count(Assignment.id))
            .group_by(Assignment.course_id)
        ).all()
    )
    for item in courses_payload:
        course_id = item.get("id")
        if isinstance(course_id, int):
            item["assignment_count"] = int(assignment_counts.get(course_id, 0))
    payload["courses"] = courses_payload
    return payload


@app.get("/api/courses/pins", response_model=CoursePinsResponse)
def list_course_pins(
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Get pinned course IDs for the authenticated user."""
    return _roster_call_for_user(session, user_id, "GET", "/api/courses/pins")


@app.get("/api/courses/{course_id}", response_model=CourseResponse)
def get_course_by_id(
    course_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Get a specific course by ID. 
    Accessible by the instructor or enrolled students.
    """
    payload = _roster_call_for_user(session, user_id, "GET", f"/api/courses/{course_id}")
    return _build_course_response_from_roster(session, payload)


@app.put("/api/courses/{course_id}", response_model=CourseResponse)
def update_existing_course(
    course_id: int,
    course_data: CourseUpdate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Update an existing course. Only accessible by the course instructor.
    """
    payload = _roster_call_for_user(
        session,
        user_id,
        "PUT",
        f"/api/courses/{course_id}",
        json_body=course_data.model_dump(exclude_none=True),
    )
    return _build_course_response_from_roster(session, payload)


@app.delete("/api/courses/{course_id}", status_code=204)
def delete_existing_course(
    course_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Delete a course. Only accessible by the course instructor.
    """
    _roster_call_for_user(session, user_id, "DELETE", f"/api/courses/{course_id}")
    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        delete_local_course(session, course_id)
    return


@app.post("/api/courses/join", response_model=CourseResponse)
def join_course_by_code(
    join_data: CourseJoinRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Enroll the authenticated student in a course by course code."""
    payload = _roster_call_for_user(
        session,
        user_id,
        "POST",
        "/api/courses/join",
        json_body=join_data.model_dump(exclude_none=True),
    )
    return _build_course_response_from_roster(session, payload)


@app.put("/api/courses/{course_id}/pin", response_model=CoursePinResponse)
def update_course_pin(
    course_id: int,
    payload: CoursePinUpdate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Set or clear pin state for a course visible to the authenticated user."""
    return _roster_call_for_user(
        session,
        user_id,
        "PUT",
        f"/api/courses/{course_id}/pin",
        json_body=payload.model_dump(exclude_none=True),
    )


@app.get("/api/instructor/analytics", response_model=InstructorAnalyticsResponse)
def get_instructor_analytics(
    course_id: int,
    assignment_id: Optional[int] = None,
    date_range: str = "30d",
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    normalized_range = (date_range or "all").strip().lower()
    if normalized_range not in {"7d", "30d", "all"}:
        raise HTTPException(status_code=400, detail="date_range must be one of: 7d, 30d, all")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{course_id}",
    )
    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can view analytics")

    course_name = str(course_payload.get("course_name") or "")
    student_ids = [str(student_id) for student_id in list(course_payload.get("student_ids") or [])]
    student_name_by_id = _resolve_student_name_map(session, user_id, student_ids, course_payload)

    all_assignments = get_course_assignments(session, course_id)
    assignment_options = [
        AssignmentOption(id=assignment.id, title=assignment.title or f"Assignment {assignment.id}")
        for assignment in all_assignments
    ]

    selected_assignments = list(all_assignments)
    if assignment_id is not None:
        selected_assignments = [assignment for assignment in all_assignments if assignment.id == assignment_id]
        if not selected_assignments:
            raise HTTPException(status_code=404, detail="Assignment not found in this course")

    for assignment in selected_assignments:
        _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=student_ids)

    cutoff_utc = _analytics_cutoff_utc(normalized_range)
    records: list[AnalyticsSubmissionRecord] = []

    for assignment in selected_assignments:
        question_ids = _safe_json_loads(assignment.assignment_questions, [])
        assignment_question_id_set = {str(question_id) for question_id in question_ids}
        assignment_questions = get_questions_by_ids(session, question_ids)
        progress_rows = list_assignment_progress_for_students(session, assignment.id, student_ids)
        progress_by_student_id = {row.student_id: row for row in progress_rows}

        for student_id in student_ids:
            progress = progress_by_student_id.get(student_id)
            if not progress:
                continue
            if not bool(progress.submitted or progress.grade_submitted):
                continue

            submitted_at = _normalize_datetime_utc(progress.submitted_at)
            graded_at = _normalize_datetime_utc(progress.grade_submitted_at)
            event_time = submitted_at or graded_at
            if cutoff_utc is not None:
                if event_time is None or event_time < cutoff_utc:
                    continue

            answers = _safe_json_loads(progress.answers, {})
            question_time_ms_all = _normalize_question_time_ms(progress.question_time_ms)
            question_time_ms = {
                key: value
                for key, value in question_time_ms_all.items()
                if key in assignment_question_id_set
            }
            grading_data = _safe_json_loads(progress.grading_data, {})
            computed = _build_grading_response(
                assignment=assignment,
                student_id=student_id,
                questions=assignment_questions,
                answers_by_question_id=answers if isinstance(answers, dict) else {},
                grading_data=grading_data if isinstance(grading_data, dict) else {},
                grade_submitted=bool(progress.grade_submitted),
                submitted_at=progress.submitted_at,
                stored_score_earned=progress.score_earned,
                stored_score_total=progress.score_total,
            )
            if computed.score_total <= 0:
                continue

            question_scores: dict[str, dict[str, float]] = {}
            for question_card in computed.questions:
                q_percent = 0.0
                if question_card.max_points > 0:
                    q_percent = (float(question_card.earned_points) / float(question_card.max_points)) * 100.0
                question_scores[str(question_card.question_id)] = {
                    "earned": float(question_card.earned_points),
                    "max": float(question_card.max_points),
                    "percent": float(round(q_percent, 4)),
                }

            student_name = str(student_name_by_id.get(student_id) or student_id)
            score_percent = float(computed.score_percent)
            records.append(
                AnalyticsSubmissionRecord(
                    assignment_id=assignment.id,
                    assignment_title=assignment.title or f"Assignment {assignment.id}",
                    student_id=student_id,
                    student_name=student_name,
                    submitted_at=event_time,
                    score_percent=score_percent,
                    question_scores=question_scores,
                    question_time_ms=question_time_ms,
                )
            )

    assignment_score_percents = [float(record.score_percent) for record in records]
    question_score_percents: list[float] = []
    average_time_per_submission_seconds: list[float] = []
    for record in records:
        for question_data in record.question_scores.values():
            question_score_percents.append(float(question_data.get("percent") or 0.0))
        time_values_ms = [float(value) for value in (record.question_time_ms or {}).values() if float(value) >= 0]
        if time_values_ms:
            average_time_per_submission_seconds.append((sum(time_values_ms) / len(time_values_ms)) / 1000.0)

    summary = AnalyticsSummaryStats(
        average_assignment_score_percent=round(_mean_or_none(assignment_score_percents), 4) if assignment_score_percents else None,
        average_question_score_percent=round(_mean_or_none(question_score_percents), 4) if question_score_percents else None,
        average_time_per_question_seconds=round(_mean_or_none(average_time_per_submission_seconds), 4) if average_time_per_submission_seconds else None,
        average_overall_grade_percent=round(_mean_or_none(assignment_score_percents), 4) if assignment_score_percents else None,
        median_score_percent=round(float(statistics.median(assignment_score_percents)), 4) if assignment_score_percents else None,
        min_score_percent=round(min(assignment_score_percents), 4) if assignment_score_percents else None,
        max_score_percent=round(max(assignment_score_percents), 4) if assignment_score_percents else None,
        stddev_score_percent=round(_stddev_or_none(assignment_score_percents), 4) if assignment_score_percents else None,
        submission_count=len(records),
        graded_count=len(records),
    )

    score_bins = {
        "90-100": 0,
        "80-89": 0,
        "70-79": 0,
        "60-69": 0,
        "<60": 0,
    }
    for record in records:
        label = _score_band_label(record.score_percent)
        score_bins[label] = score_bins.get(label, 0) + 1
    score_distribution = [
        ScoreDistributionItem(band_label=label, count=count)
        for label, count in score_bins.items()
    ]

    assignment_question_map: dict[int, Question] = {}
    for assignment in selected_assignments:
        question_ids = _safe_json_loads(assignment.assignment_questions, [])
        for question in get_questions_by_ids(session, question_ids):
            assignment_question_map[question.id] = question

    prompt_agg: dict[tuple[int, int], dict[str, Any]] = {}
    for record in records:
        for question_id_raw, question_data in record.question_scores.items():
            try:
                question_id = int(question_id_raw)
            except (TypeError, ValueError):
                continue
            question = assignment_question_map.get(question_id)
            if not question:
                continue

            prompt_key = (record.assignment_id, question_id)
            agg = prompt_agg.setdefault(
                prompt_key,
                {
                    "prompt_id": question_id,
                    "prompt_title": question.title or f"Prompt {question_id}",
                    "assignment_id": record.assignment_id,
                    "assignment_title": record.assignment_title,
                    "count": 0,
                    "score_sum": 0.0,
                    "score_values": [],
                    "below_target_count": 0,
                },
            )
            q_percent = float(question_data.get("percent") or 0.0)
            agg["count"] += 1
            agg["score_sum"] += q_percent
            agg["score_values"].append(q_percent)
            if q_percent < 70.0:
                agg["below_target_count"] += 1

    per_prompt_summary = [
        PromptSummaryItem(
            prompt_id=data["prompt_id"],
            prompt_title=data["prompt_title"],
            assignment_id=data["assignment_id"],
            assignment_title=data["assignment_title"],
            submission_count=data["count"],
            mean_score_percent=round(data["score_sum"] / data["count"], 4) if data["count"] else None,
            median_score_percent=round(float(statistics.median(data["score_values"])), 4) if data["score_values"] else None,
            min_score_percent=round(min(data["score_values"]), 4) if data["score_values"] else None,
            max_score_percent=round(max(data["score_values"]), 4) if data["score_values"] else None,
            stddev_score_percent=round(_stddev_or_none(data["score_values"]), 4) if data["score_values"] else None,
            below_target_percent=round((data["below_target_count"] / data["count"]) * 100.0, 4) if data["count"] else 0.0,
        )
        for data in prompt_agg.values()
    ]
    per_prompt_summary.sort(key=lambda item: (-(item.below_target_percent or 0.0), item.prompt_title.lower()))

    student_records: dict[str, list[AnalyticsSubmissionRecord]] = defaultdict(list)
    for record in records:
        student_records[record.student_id].append(record)

    per_student_trend: list[PerStudentTrendItem] = []
    students_at_risk: list[StudentAtRiskItem] = []
    for student_id, entries in student_records.items():
        sorted_entries = sorted(
            entries,
            key=lambda item: (
                item.submitted_at or datetime.min.replace(tzinfo=timezone.utc),
                item.assignment_id,
            ),
        )
        streak = 0
        max_streak = 0
        for entry in sorted_entries:
            if float(entry.score_percent) < 70.0:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0

        avg_score = _mean_or_none([float(item.score_percent) for item in sorted_entries])
        score_values = [float(item.score_percent) for item in sorted_entries]
        total_question_time_ms = 0.0
        total_timed_questions = 0
        for item in sorted_entries:
            for value in (item.question_time_ms or {}).values():
                time_ms = float(value)
                if time_ms < 0:
                    continue
                total_question_time_ms += time_ms
                total_timed_questions += 1
        average_time_per_question_seconds = (
            (total_question_time_ms / total_timed_questions) / 1000.0
            if total_timed_questions > 0
            else None
        )
        last_submission = max(
            (item.submitted_at for item in sorted_entries if item.submitted_at is not None),
            default=None,
        )
        latest_entry = sorted_entries[-1]
        student_name = sorted_entries[0].student_name

        per_student_trend.append(
            PerStudentTrendItem(
                student_id=student_id,
                student_name=student_name,
                submission_count=len(sorted_entries),
                latest_assignment_id=latest_entry.assignment_id if latest_entry else None,
                average_score_percent=round(avg_score, 4) if avg_score is not None else None,
                average_time_per_question_seconds=round(average_time_per_question_seconds, 4) if average_time_per_question_seconds is not None else None,
                median_score_percent=round(float(statistics.median(score_values)), 4) if score_values else None,
                min_score_percent=round(min(score_values), 4) if score_values else None,
                max_score_percent=round(max(score_values), 4) if score_values else None,
                stddev_score_percent=round(_stddev_or_none(score_values), 4) if score_values else None,
                last_submission_date=last_submission,
            )
        )

        if max_streak >= 2:
            students_at_risk.append(
                StudentAtRiskItem(
                    student_id=student_id,
                    student_name=student_name,
                    consecutive_low_score_streak=max_streak,
                    latest_score_percent=round(float(latest_entry.score_percent), 4),
                    latest_submission_date=latest_entry.submitted_at,
                )
            )

    per_student_trend.sort(key=lambda item: (item.student_name.lower(), item.student_id))
    students_at_risk.sort(
        key=lambda item: (
            -item.consecutive_low_score_streak,
            item.student_name.lower(),
            item.student_id,
        )
    )

    assignment_question_score_agg: dict[int, dict[str, Any]] = {}
    for record in records:
        agg = assignment_question_score_agg.setdefault(
            record.assignment_id,
            {
                "assignment_title": record.assignment_title,
                "submission_count": 0,
                "scores": [],
                "question_time_total_ms": 0.0,
                "question_time_count": 0,
            },
        )
        agg["submission_count"] += 1
        for question_data in record.question_scores.values():
            q_percent = float(question_data.get("percent") or 0.0)
            agg["scores"].append(q_percent)
        for question_time_ms in (record.question_time_ms or {}).values():
            elapsed_ms = float(question_time_ms)
            if elapsed_ms < 0:
                continue
            agg["question_time_total_ms"] += elapsed_ms
            agg["question_time_count"] += 1

    assignment_question_score_summary = [
        AssignmentQuestionScoreSummaryItem(
            assignment_id=assignment_id_key,
            assignment_title=data["assignment_title"],
            submission_count=int(data["submission_count"]),
            average_time_per_question_seconds=(
                round((float(data["question_time_total_ms"]) / float(data["question_time_count"])) / 1000.0, 4)
                if data["question_time_count"]
                else None
            ),
            mean_score_percent=round(_mean_or_none(data["scores"]), 4) if data["scores"] else None,
            median_score_percent=round(float(statistics.median(data["scores"])), 4) if data["scores"] else None,
            min_score_percent=round(min(data["scores"]), 4) if data["scores"] else None,
            max_score_percent=round(max(data["scores"]), 4) if data["scores"] else None,
            stddev_score_percent=round(_stddev_or_none(data["scores"]), 4) if data["scores"] else None,
        )
        for assignment_id_key, data in assignment_question_score_agg.items()
    ]
    assignment_question_score_summary.sort(key=lambda item: item.assignment_title.lower())

    trend_agg: dict[str, dict[str, float]] = {}
    for record in records:
        if record.submitted_at:
            bucket = record.submitted_at.astimezone(timezone.utc).date().isoformat()
        else:
            bucket = "Undated"
        row = trend_agg.setdefault(bucket, {"count": 0.0, "score_sum": 0.0})
        row["count"] += 1.0
        row["score_sum"] += float(record.score_percent)

    trend_series: list[AnalyticsTrendPoint] = []
    sorted_buckets = sorted(trend_agg.keys(), key=lambda label: (label == "Undated", label))
    for label in sorted_buckets:
        count = int(trend_agg[label]["count"])
        score_sum = float(trend_agg[label]["score_sum"])
        trend_series.append(
            AnalyticsTrendPoint(
                bucket_label=label,
                submission_count=count,
                average_score_percent=round(score_sum / count, 4) if count > 0 else None,
            )
        )

    return InstructorAnalyticsResponse(
        course_id=course_id,
        course_name=course_name,
        assignment_options=assignment_options,
        selected_assignment_id=assignment_id,
        date_range=normalized_range,
        summary=summary,
        score_distribution=score_distribution,
        per_student_trend=per_student_trend,
        students_at_risk=students_at_risk,
        assignment_question_score_summary=assignment_question_score_summary,
        per_prompt_summary=per_prompt_summary,
        trend_series=trend_series,
    )


# Assignment endpoints

@app.post("/api/assignments", response_model=AssignmentResponse, status_code=201)
def create_new_assignment(
    assignment_data: AssignmentCreate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Create a new assignment. Requires authentication and instructor status.
    Only the course instructor can create assignments.
    """
    roster_course_payload: Optional[dict[str, Any]] = None
    course_name = ""
    student_ids_for_progress: Optional[list[str]] = None

    roster_course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment_data.course_id}",
    )
    if roster_course_payload.get("instructor_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course instructor can create assignments",
        )
    course_name = roster_course_payload.get("course_name") or ""
    student_ids_for_progress = roster_course_payload.get("student_ids") or []
    _reject_locked_assignment_questions(session, assignment_data.assignment_questions)

    # Create the assignment
    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        assignment = create_assignment(
            session=session,
            course_id=assignment_data.course_id,
            instructor_id=user_id,
            title=assignment_data.title,
            type=assignment_data.type,
            description=assignment_data.description,
            node_id=assignment_data.node_id,
            release_date=assignment_data.release_date,
            due_date_soft=assignment_data.due_date_soft,
            due_date_hard=assignment_data.due_date_hard,
            late_policy_id=assignment_data.late_policy_id,
            assignment_questions=assignment_data.assignment_questions,
            course_name=course_name,
            student_ids=student_ids_for_progress,
        )

    instructor_email = roster_course_payload.get("instructor_email") if roster_course_payload else None
    return build_assignment_response(session, assignment, instructor_email=instructor_email)


@app.post("/api/assignments/preview")
def preview_assignment_draft(
    preview_data: AssignmentPreviewRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Render a draft assignment for instructor preview without saving progress."""
    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{preview_data.course_id}",
    )
    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can preview assignments")

    questions = get_questions_by_ids(session, preview_data.assignment_questions)
    resolved_ids = {int(question.id) for question in questions if question.id is not None}
    missing_ids = [question_id for question_id in preview_data.assignment_questions if int(question_id) not in resolved_ids]
    if missing_ids:
        raise HTTPException(status_code=400, detail=f"Preview includes missing questions: {missing_ids}")
    _reject_locked_assignment_questions(session, preview_data.assignment_questions)
    rendered_questions = _render_questions_for_preview(
        questions=questions,
        preview_student_id=preview_data.preview_student_id,
        assignment_id=preview_data.assignment_id or 0,
    )
    return {
        "assignment": {
            "course_id": preview_data.course_id,
            "title": preview_data.title or "Untitled Assignment",
            "type": preview_data.type or "Homework",
            "description": preview_data.description or "",
            "assignment_questions": preview_data.assignment_questions,
        },
        "assignment_question_refs": _assignment_refs_for_questions(rendered_questions),
    }


@app.get("/api/assignments/{assignment_id}", response_model=AssignmentResponse)
def get_assignment_by_id(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Get a specific assignment by ID.
    Accessible by the course instructor or enrolled students.
    """
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    rendered_refs = None
    if course_payload.get("instructor_id") != user_id:
        progress = get_assignment_progress(session, assignment_id, user_id)
        if not progress:
            progress = upsert_assignment_progress(
                session=session,
                assignment_id=assignment_id,
                student_id=user_id,
                answers={},
                current_question_index=0,
                submitted=False,
                research_id=_fetch_research_id_for_current_user(user_id),
            )
        else:
            progress = upsert_assignment_progress(
                session=session,
                assignment_id=assignment.id,
                student_id=user_id,
                answers=None,
                current_question_index=None,
                submitted=None,
                research_id=_fetch_research_id_for_current_user(user_id),
            )
        rendered_questions = _render_questions_for_progress(session, assignment=assignment, progress=progress)
        rendered_refs = _assignment_refs_for_questions(rendered_questions)
    return build_assignment_response(
        session,
        assignment,
        instructor_email=course_payload.get("instructor_email"),
        assignment_question_refs=rendered_refs,
    )


@app.put("/api/assignments/{assignment_id}", response_model=AssignmentResponse)
def update_existing_assignment(
    assignment_id: int,
    assignment_data: AssignmentUpdate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Update an existing assignment. Only accessible by the course instructor.
    """
    existing_assignment = get_assignment(session, assignment_id)
    if not existing_assignment:
        raise HTTPException(status_code=404, detail="Assignment not found or you don't have permission to update it")

    # Auth source-of-truth is roster membership/role. This keeps assignment updates
    # working for legacy rows whose stored instructor_id predates auth migrations.
    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{existing_assignment.course_id}",
    )
    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can update assignments")
    if assignment_data.assignment_questions is not None:
        _reject_locked_assignment_questions(session, assignment_data.assignment_questions)

    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        assignment = update_assignment(
            session=session,
            assignment_id=assignment_id,
            # Use persisted owner value to satisfy legacy ownership checks in CRUD.
            instructor_id=existing_assignment.instructor_id,
            title=assignment_data.title,
            type=assignment_data.type,
            description=assignment_data.description,
            node_id=assignment_data.node_id,
            release_date=assignment_data.release_date,
            due_date_soft=assignment_data.due_date_soft,
            due_date_hard=assignment_data.due_date_hard,
            late_policy_id=assignment_data.late_policy_id,
            assignment_questions=assignment_data.assignment_questions
        )

        if assignment:
            _sync_assignment_post_due_grading(
                session,
                assignment=assignment,
                student_ids=list(course_payload.get("student_ids") or []),
            )

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found or you don't have permission to update it")

    instructor_email = course_payload.get("instructor_email")

    return build_assignment_response(session, assignment, instructor_email=instructor_email)


@app.post("/api/assignments/{assignment_id}/release-now", response_model=AssignmentResponse)
def release_assignment_now(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Release an assignment immediately by setting release_date to now (UTC)."""
    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        assignment = update_assignment(
            session=session,
            assignment_id=assignment_id,
            instructor_id=user_id,
            release_date=datetime.now(timezone.utc)
        )

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found or you don't have permission to release it")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    instructor_email = course_payload.get("instructor_email")

    return build_assignment_response(session, assignment, instructor_email=instructor_email)


@app.delete("/api/assignments/{assignment_id}", status_code=204)
def delete_existing_assignment(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Delete an assignment. Only accessible by the course instructor.
    """
    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        success = delete_assignment(session, assignment_id, instructor_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found or you don't have permission to delete it")


@app.get("/api/assignments/{assignment_id}/progress", response_model=AssignmentProgressResponse)
def get_student_assignment_progress(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get progress for the authenticated student on a specific assignment."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    # If roster grants access to this course endpoint, allow per-user progress access.
    # Relying on student_ids here can be transiently stale immediately after auth/login.
    user_is_instructor = course_payload.get("instructor_id") == user_id
    can_view_grade = bool(assignment.grade_released or user_is_instructor)

    progress = get_assignment_progress(session, assignment_id, user_id)
    if not progress:
        progress = upsert_assignment_progress(
            session=session,
            assignment_id=assignment_id,
            student_id=user_id,
            answers={},
            current_question_index=0,
            submitted=False,
            research_id=_fetch_research_id_for_current_user(user_id),
        )
    progress = _ensure_progress_variants(session, assignment=assignment, progress=progress)

    return AssignmentProgressResponse(
        assignment_id=progress.assignment_id,
        student_id=progress.student_id,
        answers=json.loads(progress.answers) if progress.answers else {},
        variant_data=_safe_json_loads(getattr(progress, "variant_data", "{}"), {}),
        question_time_ms=_normalize_question_time_ms(progress.question_time_ms),
        current_question_index=progress.current_question_index,
        submitted=progress.submitted,
        submitted_at=progress.submitted_at,
        grade_submitted=bool(progress.grade_submitted),
        grade_submitted_at=progress.grade_submitted_at,
        score_earned=progress.score_earned if can_view_grade else None,
        score_total=progress.score_total if can_view_grade else None,
        updated_at=progress.updated_at
    )


@app.get("/api/assignments/{assignment_id}/my-grade", response_model=AssignmentGradingResponse)
def get_my_assignment_grade(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Student-facing: get the authenticated student's full grade breakdown (points, rubrics, comments) when grades are released."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    user_is_instructor = course_payload.get("instructor_id") == user_id
    student_ids = list(course_payload.get("student_ids") or [])
    if not user_is_instructor and user_id not in student_ids:
        raise HTTPException(status_code=404, detail="You are not enrolled in this course")
    if not assignment.grade_released and not user_is_instructor:
        raise HTTPException(
            status_code=403,
            detail="Grades are not released yet for this assignment.",
        )

    progress = get_assignment_progress(session, assignment_id, user_id)
    answers = _safe_json_loads(progress.answers if progress else "{}", {})
    grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
    questions = _render_questions_for_progress(session, assignment=assignment, progress=progress)

    return _build_grading_response(
        assignment=assignment,
        student_id=user_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=grading_data if isinstance(grading_data, dict) else {},
        grade_submitted=bool(progress and progress.grade_submitted),
        submitted_at=progress.submitted_at if progress else None,
        stored_score_earned=progress.score_earned if progress else None,
        stored_score_total=progress.score_total if progress else None,
    )


@app.put("/api/assignments/{assignment_id}/progress", response_model=AssignmentProgressResponse)
def save_student_assignment_progress(
    assignment_id: int,
    progress_data: AssignmentProgressUpdate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Save progress for the authenticated student on a specific assignment."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    # If roster grants access to this course endpoint, allow per-user progress updates.
    # Relying on student_ids here can be transiently stale immediately after auth/login.
    user_is_instructor = course_payload.get("instructor_id") == user_id
    can_view_grade = bool(assignment.grade_released or user_is_instructor)

    # Once the late due date passes, student edits/submissions are locked.
    if _has_late_due_passed(assignment):
        raise HTTPException(
            status_code=403,
            detail="Assignment is closed because the late due date has passed.",
        )

    existing_progress = get_assignment_progress(session, assignment_id, user_id)
    existing_answers = _safe_json_loads(existing_progress.answers if existing_progress else "{}", {})
    merged_answers = dict(existing_answers if isinstance(existing_answers, dict) else {})
    if isinstance(progress_data.answers, dict):
        merged_answers.update(progress_data.answers)

    existing_grading_data = _safe_json_loads(existing_progress.grading_data if existing_progress else "{}", {})
    merged_grading_data = dict(existing_grading_data if isinstance(existing_grading_data, dict) else {})

    if progress_data.submitted:
        question_ids = _safe_json_loads(assignment.assignment_questions, [])
        questions = get_questions_by_ids(session, question_ids)
        for question in questions:
            if not _is_coding_question_type(question.question_type or ""):
                continue
            qid = str(question.id)
            answer_payload = _normalize_coding_answer(merged_answers.get(qid))
            source_code = answer_payload.get("source_code") or ""
            if not source_code.strip():
                continue
            execution_result = _execute_coding_for_question(
                session=session,
                question=question,
                source_code=source_code,
                use_hidden_tests=True,
            )
            grading_snapshot = _coding_grading_result(question, execution_result)
            merged_grading_data.setdefault(qid, {})
            merged_grading_data[qid]["coding_result"] = grading_snapshot
            run_row = create_coding_run(
                session,
                assignment_id=assignment_id,
                question_id=question.id,
                student_id=user_id,
                language=answer_payload.get("language") or "cpp",
                source_code=source_code,
                status=str(execution_result.get("status") or ""),
                verdict=str(execution_result.get("verdict") or ""),
                compile_output=str(execution_result.get("compile_output") or ""),
                runtime_output=str(execution_result.get("runtime_output") or ""),
                result_json=json.dumps(execution_result),
                is_submit_run=True,
            )
            merged_grading_data[qid]["latest_run_id"] = run_row.id

    progress = upsert_assignment_progress(
        session=session,
        assignment_id=assignment_id,
        student_id=user_id,
        answers=merged_answers if (progress_data.answers is not None or progress_data.submitted) else None,
        question_time_ms=progress_data.question_time_ms,
        grading_data=merged_grading_data if progress_data.submitted else None,
        current_question_index=progress_data.current_question_index,
        submitted=progress_data.submitted,
        research_id=_fetch_research_id_for_current_user(user_id),
    )
    progress = _ensure_progress_variants(session, assignment=assignment, progress=progress)

    if progress_data.submitted:
        progress.grade_submitted = False
        progress.grade_submitted_at = None
        progress.score_earned = None
        progress.score_total = None
        session.add(progress)
        session.commit()
        session.refresh(progress)
        progress = _run_coding_autograding_for_progress(session, assignment=assignment, progress=progress)

    return AssignmentProgressResponse(
        assignment_id=progress.assignment_id,
        student_id=progress.student_id,
        answers=json.loads(progress.answers) if progress.answers else {},
        variant_data=_safe_json_loads(getattr(progress, "variant_data", "{}"), {}),
        question_time_ms=_normalize_question_time_ms(progress.question_time_ms),
        current_question_index=progress.current_question_index,
        submitted=progress.submitted,
        submitted_at=progress.submitted_at,
        grade_submitted=bool(progress.grade_submitted),
        grade_submitted_at=progress.grade_submitted_at,
        score_earned=progress.score_earned if can_view_grade else None,
        score_total=progress.score_total if can_view_grade else None,
        updated_at=progress.updated_at
    )


def _integrity_request_id(request: Request) -> str:
    return request.headers.get("x-request-id") or str(uuid.uuid4())


def _integrity_event_response(event: AssignmentIntegrityEvent) -> AssignmentIntegrityEventResponse:
    return AssignmentIntegrityEventResponse(
        id=int(event.id or 0),
        assignment_id=event.assignment_id,
        student_id=event.student_id,
        question_key=event.question_key,
        part_id=event.part_id,
        event_type=event.event_type,
        metadata=event.event_metadata if isinstance(event.event_metadata, dict) else {},
        client_created_at=event.client_created_at,
        created_at=event.created_at,
    )


def _integrity_student_summary(summary: dict, student_id: str) -> AssignmentIntegrityStudentSummary:
    return AssignmentIntegrityStudentSummary(
        student_id=student_id,
        risk_score=int(summary.get("risk_score") or 0),
        risk_level=str(summary.get("risk_level") or "none"),
        event_count=int(summary.get("event_count") or 0),
        paste_count=int(summary.get("paste_count") or 0),
        copy_count=int(summary.get("copy_count") or 0),
        cut_count=int(summary.get("cut_count") or 0),
        focus_away_count=int(summary.get("focus_away_count") or 0),
        rapid_input_count=int(summary.get("rapid_input_count") or 0),
        large_delta_count=int(summary.get("large_delta_count") or 0),
        largest_paste_chars=int(summary.get("largest_paste_chars") or 0),
        last_event_at=summary.get("last_event_at"),
    )


@app.post("/api/assignments/{assignment_id}/integrity-events")
def record_assignment_integrity_events(
    assignment_id: int,
    payload: AssignmentIntegrityEventBatch,
    request: Request,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Record metadata-only integrity events for the authenticated student's assignment session."""
    request_id = _integrity_request_id(request)
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        integrity_logger.warning(
            "integrity_batch_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "student_id": user_id, "reason": "assignment_not_found"},
        )
        raise HTTPException(status_code=404, detail="Assignment not found")

    try:
        course_payload = _roster_call_for_user(
            session,
            user_id,
            "GET",
            f"/api/courses/{assignment.course_id}",
        )
    except HTTPException as exc:
        integrity_logger.warning(
            "integrity_batch_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "student_id": user_id, "reason": "course_access_denied"},
        )
        raise exc

    student_ids = course_payload.get("student_ids") or []
    if user_id not in student_ids:
        integrity_logger.warning(
            "integrity_batch_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "student_id": user_id, "reason": "not_enrolled"},
        )
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    rows = create_assignment_integrity_events(
        session,
        assignment_id=assignment_id,
        student_id=user_id,
        events=[event.model_dump() for event in payload.events],
    )
    summary = summarize_integrity_events(
        list_assignment_integrity_events(session, assignment_id=assignment_id, student_id=user_id)
    ).get(user_id, {})
    integrity_logger.info(
        "integrity_batch_accepted",
        extra={
            "request_id": request_id,
            "assignment_id": assignment_id,
            "student_id": user_id,
            "event_count": len(rows),
            "risk_score": int(summary.get("risk_score") or 0),
            "risk_level": str(summary.get("risk_level") or "none"),
        },
    )
    return {"accepted": len(rows)}


@app.get("/api/assignments/{assignment_id}/integrity-summary", response_model=AssignmentIntegritySummaryResponse)
def get_assignment_integrity_summary(
    assignment_id: int,
    request: Request,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Instructor-only assignment integrity summary."""
    request_id = _integrity_request_id(request)
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        integrity_logger.warning(
            "integrity_summary_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "instructor_id": user_id, "reason": "assignment_not_found"},
        )
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(session, user_id, "GET", f"/api/courses/{assignment.course_id}")
    if course_payload.get("instructor_id") != user_id:
        integrity_logger.warning(
            "integrity_summary_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "instructor_id": user_id, "reason": "not_instructor"},
        )
        raise HTTPException(status_code=403, detail="Only the course instructor can view integrity summaries")

    student_ids = list(course_payload.get("student_ids") or [])
    summaries_by_student = summarize_integrity_events(
        list_assignment_integrity_events(session, assignment_id=assignment_id, student_ids=student_ids)
    )
    summaries = [
        _integrity_student_summary(summaries_by_student.get(student_id, {"student_id": student_id}), student_id)
        for student_id in student_ids
    ]
    integrity_logger.info(
        "integrity_summary_read",
        extra={"request_id": request_id, "assignment_id": assignment_id, "instructor_id": user_id, "student_count": len(student_ids)},
    )
    return AssignmentIntegritySummaryResponse(assignment_id=assignment_id, students=summaries)


@app.get("/api/assignments/{assignment_id}/integrity-summary/{student_id}", response_model=AssignmentIntegrityStudentDetailResponse)
def get_assignment_integrity_student_summary(
    assignment_id: int,
    student_id: str,
    request: Request,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Instructor-only integrity event detail for one student."""
    request_id = _integrity_request_id(request)
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        integrity_logger.warning(
            "integrity_student_summary_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "instructor_id": user_id, "student_id": student_id, "reason": "assignment_not_found"},
        )
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(session, user_id, "GET", f"/api/courses/{assignment.course_id}")
    if course_payload.get("instructor_id") != user_id:
        integrity_logger.warning(
            "integrity_student_summary_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "instructor_id": user_id, "student_id": student_id, "reason": "not_instructor"},
        )
        raise HTTPException(status_code=403, detail="Only the course instructor can view integrity summaries")
    if student_id not in (course_payload.get("student_ids") or []):
        integrity_logger.warning(
            "integrity_student_summary_rejected",
            extra={"request_id": request_id, "assignment_id": assignment_id, "instructor_id": user_id, "student_id": student_id, "reason": "student_not_enrolled"},
        )
        raise HTTPException(status_code=404, detail="Student is not enrolled in this course")

    events = list_assignment_integrity_events(session, assignment_id=assignment_id, student_id=student_id)
    summary = _integrity_student_summary(
        summarize_integrity_events(events).get(student_id, {"student_id": student_id}),
        student_id,
    )
    integrity_logger.info(
        "integrity_student_summary_read",
        extra={"request_id": request_id, "assignment_id": assignment_id, "instructor_id": user_id, "student_id": student_id, "event_count": len(events)},
    )
    return AssignmentIntegrityStudentDetailResponse(
        **summary.model_dump(),
        assignment_id=assignment_id,
        events=[_integrity_event_response(event) for event in events],
    )


@app.post("/api/assignments/{assignment_id}/questions/{question_id}/coding/run", response_model=CodingRunResponse)
def run_assignment_coding_question(
    assignment_id: int,
    question_id: int,
    payload: CodingRunRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Run visible coding tests for one assignment question."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    user_is_instructor = course_payload.get("instructor_id") == user_id
    student_ids = list(course_payload.get("student_ids") or [])
    if not user_is_instructor and user_id not in student_ids:
        raise HTTPException(status_code=404, detail="You are not enrolled in this course")

    question_ids = _safe_json_loads(assignment.assignment_questions, [])
    if int(question_id) not in question_ids:
        raise HTTPException(status_code=404, detail="Question is not part of this assignment")

    question = get_question(session, question_id, user_id=None)
    if not question or not _is_coding_question_type(question.question_type or ""):
        raise HTTPException(status_code=404, detail="Coding question not found")

    execution_result = _execute_coding_for_question(
        session=session,
        question=question,
        source_code=payload.source_code,
        use_hidden_tests=False,
    )
    run_row = create_coding_run(
        session,
        assignment_id=assignment_id,
        question_id=question.id,
        student_id=user_id,
        language=(payload.language or "cpp").strip().lower() or "cpp",
        source_code=payload.source_code,
        status=str(execution_result.get("status") or ""),
        verdict=str(execution_result.get("verdict") or ""),
        compile_output=str(execution_result.get("compile_output") or ""),
        runtime_output=str(execution_result.get("runtime_output") or ""),
        result_json=json.dumps(execution_result),
        is_submit_run=False,
    )
    return CodingRunResponse(
        run_id=run_row.id,
        status=str(execution_result.get("status") or ""),
        verdict=str(execution_result.get("verdict") or ""),
        language=(payload.language or "cpp").strip().lower() or "cpp",
        compile_output=str(execution_result.get("compile_output") or ""),
        runtime_output=str(execution_result.get("runtime_output") or ""),
        elapsed_ms=int(execution_result.get("elapsed_ms") or 0),
        is_submit_run=False,
        tests=[CodingRunTestResult(**test) for test in (execution_result.get("tests") or [])],
    )


@app.get("/api/assignments/{assignment_id}/submission-status", response_model=AssignmentSubmissionStatusResponse)
def get_assignment_submission_status(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Instructor-only endpoint: per-student on-time/late submission status."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )

    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can view submission status")

    student_ids = list(course_payload.get("student_ids") or [])
    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=student_ids)
        progress_rows = list_assignment_progress_for_students(session, assignment_id, student_ids)
    progress_by_student_id = {row.student_id: row for row in progress_rows}
    integrity_summaries = summarize_integrity_events(
        list_assignment_integrity_events(session, assignment_id=assignment_id, student_ids=student_ids)
    )
    assignment_questions = _get_assignment_questions(session, assignment)
    assignment_total_points = sum(_question_max_points(question) for question in assignment_questions)

    students: list[AssignmentStudentSubmissionStatus] = []
    assignment_phase = _get_assignment_phase(assignment)
    all_students_graded = assignment_phase in {"ungraded", "graded"}
    for student_id in student_ids:
        progress = progress_by_student_id.get(student_id)
        submitted_at = _normalize_datetime_utc(progress.submitted_at) if progress else None
        submitted = bool(progress and progress.submitted and submitted_at)

        timing_status = "not_submitted"
        if submitted:
            if _is_submission_late(assignment, submitted_at):
                timing_status = "late"
            else:
                timing_status = "on_time"

        score_earned = progress.score_earned if progress else None
        score_total = progress.score_total if progress else None
        grade_submitted = bool(progress and progress.grade_submitted)
        grade_submitted_at = progress.grade_submitted_at if progress else None
        score_percent = None
        if grade_submitted and score_earned is not None and score_total not in (None, 0):
            score_percent = float(score_earned) / float(score_total) * 100.0
        if timing_status == "not_submitted":
            if assignment_phase in {"ungraded", "graded"}:
                grade_submitted = True
                grade_submitted_at = grade_submitted_at or _late_due_deadline_stored(assignment)
                score_earned = 0.0 if score_earned is None else score_earned
                score_total = assignment_total_points if score_total is None else score_total
                score_percent = 0.0 if assignment_total_points > 0 else None
        if assignment_phase == "ungraded" and not grade_submitted_at:
            all_students_graded = False
        integrity_summary = integrity_summaries.get(student_id, {})

        students.append(
            AssignmentStudentSubmissionStatus(
                student_id=student_id,
                submitted=submitted,
                submitted_at=submitted_at,
                timing_status=timing_status,
                grade_submitted=grade_submitted,
                grade_submitted_at=grade_submitted_at,
                score_earned=score_earned,
                score_total=score_total,
                score_percent=score_percent,
                integrity_risk_score=int(integrity_summary.get("risk_score") or 0),
                integrity_risk_level=str(integrity_summary.get("risk_level") or "none"),
                integrity_event_count=int(integrity_summary.get("event_count") or 0),
            )
        )

    return AssignmentSubmissionStatusResponse(
        assignment_id=assignment_id,
        assignment_phase=assignment_phase,
        assignment_total_points=assignment_total_points,
        grade_released=bool(assignment.grade_released),
        all_students_graded=all_students_graded,
        students=students,
    )


@app.get("/api/assignments/{assignment_id}/grading/{student_id}", response_model=AssignmentGradingResponse)
def get_assignment_grading_state(
    assignment_id: int,
    student_id: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Instructor-only endpoint to view/autograde + manual-grade one student submission."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can grade this assignment")
    if student_id not in (course_payload.get("student_ids") or []):
        raise HTTPException(status_code=404, detail="Student is not enrolled in this course")

    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=[student_id])
        progress = get_assignment_progress(session, assignment_id, student_id)
        answers = _safe_json_loads(progress.answers if progress else "{}", {})
        grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
    questions = _render_questions_for_progress(session, assignment=assignment, progress=progress)

    return _build_grading_response(
        assignment=assignment,
        student_id=student_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=grading_data if isinstance(grading_data, dict) else {},
        grade_submitted=bool(progress and progress.grade_submitted),
        submitted_at=progress.submitted_at if progress else None,
        stored_score_earned=progress.score_earned if progress else None,
        stored_score_total=progress.score_total if progress else None,
        include_hidden_autograder=True,
    )


@app.post("/api/assignments/{assignment_id}/grading/{student_id}/autograde", response_model=AssignmentGradingResponse)
def retry_assignment_coding_autograding(
    assignment_id: int,
    student_id: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Instructor-only endpoint to retry native coding autograding for one student."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can grade this assignment")
    if student_id not in (course_payload.get("student_ids") or []):
        raise HTTPException(status_code=404, detail="Student is not enrolled in this course")

    progress = get_assignment_progress(session, assignment_id, student_id)
    if not progress or not progress.submitted:
        raise HTTPException(status_code=400, detail="Student has not submitted this assignment")

    progress.grade_submitted = False
    progress.grade_submitted_at = None
    progress.score_earned = None
    progress.score_total = None
    session.add(progress)
    session.commit()
    session.refresh(progress)
    progress = _run_coding_autograding_for_progress(session, assignment=assignment, progress=progress)

    answers = _safe_json_loads(progress.answers if progress else "{}", {})
    grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
    questions = _render_questions_for_progress(session, assignment=assignment, progress=progress)
    return _build_grading_response(
        assignment=assignment,
        student_id=student_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=grading_data if isinstance(grading_data, dict) else {},
        grade_submitted=bool(progress and progress.grade_submitted),
        stored_score_earned=progress.score_earned if progress else None,
        stored_score_total=progress.score_total if progress else None,
        include_hidden_autograder=True,
    )


@app.put("/api/assignments/{assignment_id}/grading/{student_id}", response_model=AssignmentGradingResponse)
def upsert_assignment_grading_state(
    assignment_id: int,
    student_id: str,
    payload: AssignmentGradeUpsertRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Instructor-only endpoint to save draft grading or submit final grade."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can grade this assignment")
    if student_id not in (course_payload.get("student_ids") or []):
        raise HTTPException(status_code=404, detail="Student is not enrolled in this course")

    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=[student_id])
        progress = get_assignment_progress(session, assignment_id, student_id)
        answers = _safe_json_loads(progress.answers if progress else "{}", {})
        existing_grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
    if not isinstance(existing_grading_data, dict):
        existing_grading_data = {}

    updates = payload.question_grades or []
    questions = _render_questions_for_progress(session, assignment=assignment, progress=progress)
    assignment_questions_by_id = {question.id: question for question in questions}
    for update in updates:
        question_for_update = assignment_questions_by_id.get(update.question_id)
        qid = str(update.question_qid or (question_for_update.qid if question_for_update else update.question_id))
        legacy_qid = str(update.question_id)
        if legacy_qid in existing_grading_data and legacy_qid != qid:
            existing_grading_data[qid] = existing_grading_data.pop(legacy_qid)
        existing_grading_data.setdefault(qid, {})
        existing_grading_data[qid]["question_comment"] = update.question_comment or ""
        parts_payload = {}
        for part in update.parts:
            parts_payload[str(part.part_index)] = {
                "score": float(part.score),
                "comment": part.comment or "",
            }
        existing_grading_data[qid]["parts"] = parts_payload

    computed = _build_grading_response(
        assignment=assignment,
        student_id=student_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=existing_grading_data,
        grade_submitted=False,
        submitted_at=progress.submitted_at if progress else None,
        stored_score_earned=None,
        stored_score_total=None,
    )

    if payload.submit_grade and not computed.all_questions_fully_graded:
        raise HTTPException(
            status_code=400,
            detail="All manual rubric parts must be graded before submitting the final grade.",
        )

    already_submitted_grade = bool(progress and progress.grade_submitted)
    should_submit_grade = bool(payload.submit_grade or already_submitted_grade)

    final_score_earned = computed.score_earned
    final_score_total = computed.score_total
    if should_submit_grade and progress and _is_submission_late(assignment, progress.submitted_at):
        penalty_fraction = _late_penalty_fraction(assignment.late_policy_id)
        final_score_earned = max(0.0, final_score_earned * (1.0 - penalty_fraction))

    # Once a grade has been submitted, subsequent saves must keep it finalized
    # so autosave/edit flows do not silently revert the assignment to ungraded.
    score_earned_to_write = final_score_earned if should_submit_grade else None
    score_total_to_write = final_score_total if should_submit_grade else None
    grade_submitted_state = should_submit_grade if (payload.submit_grade or already_submitted_grade) else None

    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        updated_progress = update_assignment_grading(
            session=session,
            assignment_id=assignment_id,
            student_id=student_id,
            grading_data=existing_grading_data,
            grade_submitted=grade_submitted_state,
            score_earned=score_earned_to_write,
            score_total=score_total_to_write,
        )

    return _build_grading_response(
        assignment=assignment,
        student_id=student_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=existing_grading_data,
        grade_submitted=bool(updated_progress.grade_submitted),
        submitted_at=updated_progress.submitted_at,
        stored_score_earned=updated_progress.score_earned,
        stored_score_total=updated_progress.score_total,
        include_hidden_autograder=True,
    )


@app.post("/api/assignments/{assignment_id}/release-grades")
def release_assignment_grades(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Instructor-only endpoint to release grades after all students are graded."""
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
    )
    if course_payload.get("instructor_id") != user_id:
        raise HTTPException(status_code=403, detail="Only the course instructor can release grades")

    student_ids = list(course_payload.get("student_ids") or [])
    if _get_assignment_phase(assignment) != "ungraded":
        raise HTTPException(
            status_code=400,
            detail="Grades can only be released after the late due date has passed.",
        )

    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=student_ids)
        progress_rows = list_assignment_progress_for_students(session, assignment_id, student_ids)
    progress_by_student_id = {row.student_id: row for row in progress_rows}

    for sid in student_ids:
        progress = progress_by_student_id.get(sid)
        if not (progress and progress.grade_submitted_at):
            raise HTTPException(
                status_code=400,
                detail="All student assignments must have a graded date before release.",
            )

    with temporary_rls_mode(
        session,
        user_id=None,
        mode="service",
        restore_user_id=user_id,
        restore_mode="authenticated",
    ):
        assignment.grade_released = True
        assignment.grade_released_at = datetime.utcnow()
        assignment.updated_at = datetime.utcnow()
        session.add(assignment)
        session.commit()
        session.refresh(assignment)

    return {
        "assignment_id": assignment_id,
        "grade_released": True,
        "grade_released_at": assignment.grade_released_at,
    }


ANALYTICS_EVENT_NAMES = {
    "assignment_opened",
    "assignment_loaded",
    "assignment_autosave_started",
    "assignment_autosave_succeeded",
    "assignment_autosave_failed",
    "assignment_submit_clicked",
    "assignment_submit_succeeded",
    "assignment_submit_failed",
    "assignment_resubmit_started",
    "assignment_closed_viewed",
    "question_viewed",
    "question_left",
    "question_nav_next",
    "question_nav_previous",
    "question_nav_jump",
    "question_answer_changed",
    "question_choice_selected",
    "question_text_changed",
    "question_code_language_changed",
    "question_code_changed",
    "question_part_answer_changed",
    "question_image_loaded",
    "question_image_failed",
    "page_viewed",
    "page_left",
    "tap",
    "modal_opened",
    "modal_closed",
    "visibility_hidden",
    "visibility_visible",
    "idle_started",
    "idle_ended",
    "api_error_seen",
}

ANALYTICS_ALLOWED_METADATA_KEYS = {
    "action",
    "answer_length",
    "answered_count",
    "attempt_count",
    "choice_index",
    "code_length",
    "duration_ms",
    "active_seconds",
    "error",
    "error_category",
    "from_index",
    "from_question_id",
    "from_question_qid",
    "hard_due_passed",
    "is_resubmit",
    "language",
    "next_index",
    "part_type",
    "question_count",
    "question_index",
    "question_type",
    "status",
    "submitted",
    "test_failed_count",
    "test_passed_count",
    "to_index",
    "to_question_id",
    "to_question_qid",
    "visible",
}


def _parse_client_datetime(value: Optional[datetime]) -> datetime:
    parsed = value or datetime.utcnow()
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _analytics_metadata(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for key, value in raw.items():
        if key not in ANALYTICS_ALLOWED_METADATA_KEYS:
            continue
        if isinstance(value, bool) or value is None:
            cleaned[key] = value
        elif isinstance(value, int):
            cleaned[key] = max(-1_000_000, min(value, 1_000_000))
        elif isinstance(value, float):
            cleaned[key] = max(-1_000_000.0, min(value, 1_000_000.0))
        elif isinstance(value, str):
            cleaned[key] = value[:160]
        elif isinstance(value, list):
            cleaned[key] = [v for v in value[:20] if isinstance(v, (int, float, bool)) or v is None]
    return cleaned


def _analytics_assignment_question_keys(session: Session, assignment: Assignment) -> tuple[set[int], set[str]]:
    questions = _get_assignment_questions(session, assignment)
    ids = {int(question.id) for question in questions if question.id is not None}
    qids = {str(question.qid or question.id) for question in questions if question.qid or question.id is not None}
    return ids, qids


def _median(values: list[float]) -> Optional[float]:
    finite = sorted(v for v in values if isinstance(v, (int, float)) and v == v)
    if not finite:
        return None
    mid = len(finite) // 2
    if len(finite) % 2:
        return float(finite[mid])
    return float((finite[mid - 1] + finite[mid]) / 2)


def _score_percent(earned: Optional[float], total: Optional[float]) -> Optional[float]:
    if earned is None or total in (None, 0):
        return None
    return float(earned) / float(total) * 100.0


def _require_analytics_course_access(session: Session, user_id: str, course_id: int) -> dict[str, Any]:
    course_payload = _roster_call_for_user(session, user_id, "GET", f"/api/courses/{course_id}")
    user_payload = _roster_call_for_user(session, user_id, "GET", "/api/user")
    if course_payload.get("instructor_id") != user_id and not bool(user_payload.get("admin")):
        raise HTTPException(status_code=403, detail="Only the course instructor or an admin can view analytics")
    return course_payload


def _analytics_actor_role(course_payload: Optional[dict[str, Any]], user_payload: Optional[dict[str, Any]], user_id: str) -> str:
    if user_payload and user_payload.get("admin"):
        return "admin"
    if course_payload and course_payload.get("instructor_id") == user_id:
        return "instructor"
    if user_payload and user_payload.get("teacher"):
        return "instructor"
    return "student"


def _analytics_assignment_events(session: Session, assignment_ids: list[int]) -> list[AnalyticsEvent]:
    if not assignment_ids:
        return []
    return list(session.exec(
        select(AnalyticsEvent).where(AnalyticsEvent.assignment_id.in_(assignment_ids))
    ).all())


def _active_seconds_from_events(events: list[AnalyticsEvent]) -> float:
    total = 0.0
    for event in events:
        if event.event_name not in {"question_left", "page_left"}:
            continue
        metadata = event.event_metadata or {}
        seconds = metadata.get("active_seconds")
        if seconds is None and metadata.get("duration_ms") is not None:
            seconds = float(metadata.get("duration_ms") or 0) / 1000.0
        try:
            total += max(0.0, min(float(seconds or 0), 60 * 60 * 8))
        except (TypeError, ValueError):
            continue
    return total


def _question_key_for_answer(question: Question) -> str:
    return str(question.qid or question.id)


def _is_answer_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, dict):
        return any(_is_answer_present(v.get("code") if isinstance(v, dict) and "code" in v else v) for v in value.values())
    if isinstance(value, list):
        return any(_is_answer_present(v) for v in value)
    return True


def _build_assignment_analytics(
    session: Session,
    assignment: Assignment,
    course_payload: dict[str, Any],
    *,
    include_detail: bool = True,
) -> AssignmentAnalyticsResponse:
    student_ids = list(course_payload.get("student_ids") or [])
    student_id_set = set(student_ids)
    progress_rows = list_assignment_progress_for_students(session, int(assignment.id), student_ids)
    progress_by_student = {row.student_id: row for row in progress_rows}
    events = [
        event for event in _analytics_assignment_events(session, [int(assignment.id)])
        if event.actor_user_id in student_id_set and event.actor_role == "student"
    ]
    events_by_student: dict[str, list[AnalyticsEvent]] = {}
    for event in events:
        events_by_student.setdefault(event.actor_user_id, []).append(event)

    questions = _get_assignment_questions(session, assignment)
    question_by_qid = {str(question.qid or question.id): question for question in questions}
    question_by_id = {int(question.id): question for question in questions if question.id is not None}

    opened_students = {e.actor_user_id for e in events if e.event_name in {"assignment_opened", "assignment_loaded"}}
    started_students = {e.actor_user_id for e in events if e.event_name in {"question_answer_changed", "question_choice_selected", "question_text_changed", "question_code_changed", "question_part_answer_changed"}}

    submitted_count = 0
    late_count = 0
    graded_count = 0
    score_percents: list[float] = []
    student_rows: list[AnalyticsStudentSummary] = []
    active_times: list[float] = []

    for student_number, student_id in enumerate(student_ids, start=1):
        progress = progress_by_student.get(student_id)
        submitted_at = _normalize_datetime_utc(progress.submitted_at) if progress else None
        submitted = bool(progress and progress.submitted and submitted_at)
        timing_status = "not_submitted"
        if submitted:
            submitted_count += 1
            timing_status = "late" if _is_submission_late(assignment, submitted_at) else "on_time"
            if timing_status == "late":
                late_count += 1
        if progress and progress.grade_submitted and progress.score_earned is not None and progress.score_total is not None:
            graded_count += 1
            pct = _score_percent(progress.score_earned, progress.score_total)
            if pct is not None:
                score_percents.append(pct)

        student_events = sorted(events_by_student.get(student_id, []), key=lambda e: e.occurred_at)
        active_seconds = _active_seconds_from_events(student_events)
        active_times.append(active_seconds)
        viewed_qids = {str(e.question_qid or e.question_id) for e in student_events if e.event_name == "question_viewed" and (e.question_qid or e.question_id)}
        answers = _safe_json_loads(progress.answers if progress else "{}", {})
        unanswered = 0
        for question in questions:
            value = answers.get(_question_key_for_answer(question), answers.get(str(question.id), answers.get(question.id)))
            if not _is_answer_present(value):
                unanswered += 1

        student_rows.append(AnalyticsStudentSummary(
            student_id=f"Student {student_number}",
            first_opened_at=student_events[0].occurred_at if student_events else None,
            last_activity_at=student_events[-1].occurred_at if student_events else None,
            active_seconds=active_seconds,
            questions_viewed=len(viewed_qids),
            unanswered_count=unanswered,
            submitted=submitted,
            timing_status=timing_status,
            score_percent=_score_percent(progress.score_earned, progress.score_total) if progress else None,
        ))

    grading_backlog = max(0, submitted_count - graded_count)
    summary = AnalyticsAssignmentSummary(
        assignment_id=int(assignment.id),
        title=assignment.title,
        course_id=assignment.course_id,
        enrolled_count=len(student_ids),
        opened_count=len(opened_students),
        started_count=len(started_students),
        submitted_count=submitted_count,
        missing_count=max(0, len(student_ids) - submitted_count),
        late_count=late_count,
        graded_count=graded_count,
        grading_backlog=grading_backlog,
        average_score_percent=(sum(score_percents) / len(score_percents)) if score_percents else None,
        median_active_seconds=_median(active_times),
    )

    question_score_data: dict[str, list[float]] = {qid: [] for qid in question_by_qid}
    rubric_part_scores: dict[str, dict[str, list[float]]] = {}
    failed_tests: dict[str, dict[str, int]] = {}
    if include_detail:
        for progress in progress_rows:
            if not progress.grade_submitted:
                continue
            answers = _safe_json_loads(progress.answers if progress else "{}", {})
            grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
            rendered_questions = _render_questions_for_progress(session, assignment=assignment, progress=progress)
            grading_response = _build_grading_response(
                assignment=assignment,
                student_id=progress.student_id,
                questions=rendered_questions,
                answers_by_question_id=answers if isinstance(answers, dict) else {},
                grading_data=grading_data if isinstance(grading_data, dict) else {},
                grade_submitted=bool(progress.grade_submitted),
                stored_score_earned=progress.score_earned,
                stored_score_total=progress.score_total,
                include_hidden_autograder=True,
            )
            for q_grade in grading_response.questions:
                qid = str(q_grade.question_qid or q_grade.question_id)
                pct = _score_percent(q_grade.earned_points, q_grade.max_points)
                if pct is not None:
                    question_score_data.setdefault(qid, []).append(pct)
                for part in q_grade.rubric_parts or []:
                    if part.selected_score is not None and part.max_points not in (None, 0):
                        label = part.label or f"Part {part.part_index}"
                        rubric_part_scores.setdefault(qid, {}).setdefault(label, []).append(float(part.selected_score) / float(part.max_points) * 100.0)
                autograder = q_grade.autograder_result or {}
                for part_result in (autograder.get("parts") or {}).values():
                    for test in part_result.get("tests") or []:
                        if not test.get("passed"):
                            name = str(test.get("name") or "Unnamed test")
                            failed_tests.setdefault(qid, {})[name] = failed_tests.setdefault(qid, {}).get(name, 0) + 1

    question_rows: list[AnalyticsQuestionSummary] = []
    if include_detail:
        question_events = [event for event in events if event.question_qid or event.question_id]
        for qid, question in question_by_qid.items():
            related = [
                event for event in question_events
                if str(event.question_qid or event.question_id) in {qid, str(question.id)}
            ]
            viewed_by: dict[str, int] = {}
            changed_by: set[str] = set()
            choice_counts: dict[str, int] = {}
            for event in related:
                if event.event_name == "question_viewed":
                    viewed_by[event.actor_user_id] = viewed_by.get(event.actor_user_id, 0) + 1
                if event.event_name in {"question_answer_changed", "question_choice_selected", "question_text_changed", "question_code_changed", "question_part_answer_changed"}:
                    changed_by.add(event.actor_user_id)
                if event.event_name == "question_choice_selected":
                    choice_index = (event.event_metadata or {}).get("choice_index")
                    if isinstance(choice_index, int):
                        label = f"Choice {choice_index + 1}"
                        choice_counts[label] = choice_counts.get(label, 0) + 1

            active_seconds = [
                float((event.event_metadata or {}).get("active_seconds") or ((event.event_metadata or {}).get("duration_ms") or 0) / 1000.0)
                for event in related
                if event.event_name == "question_left"
            ]
            scores = question_score_data.get(qid, [])
            weak_parts = [
                {"label": label, "average_score_percent": sum(values) / len(values), "graded_count": len(values)}
                for label, values in (rubric_part_scores.get(qid) or {}).items()
                if values
            ]
            weak_parts.sort(key=lambda item: item["average_score_percent"])
            failed = [
                {"name": name, "failed_count": count}
                for name, count in (failed_tests.get(qid) or {}).items()
            ]
            failed.sort(key=lambda item: item["failed_count"], reverse=True)
            wrong_choices = [
                {"choice": choice, "count": count}
                for choice, count in sorted(choice_counts.items(), key=lambda item: item[1], reverse=True)[:5]
            ]
            unique_students = len(viewed_by)
            question_rows.append(AnalyticsQuestionSummary(
                question_id=question.id,
                question_qid=qid,
                title=question.title or f"Question {question.id}",
                question_type=question.question_type or "",
                views=sum(viewed_by.values()),
                unique_students=unique_students,
                avg_active_seconds=(sum(active_seconds) / len(active_seconds)) if active_seconds else None,
                answer_changes=sum(1 for event in related if event.event_name in {"question_answer_changed", "question_choice_selected", "question_text_changed", "question_code_changed", "question_part_answer_changed"}),
                skip_rate=((unique_students - len(changed_by)) / unique_students * 100.0) if unique_students else None,
                return_rate=(sum(1 for count in viewed_by.values() if count > 1) / unique_students * 100.0) if unique_students else None,
                average_score_percent=(sum(scores) / len(scores)) if scores else None,
                median_score_percent=_median(scores),
                zero_score_rate=(sum(1 for score in scores if score <= 0) / len(scores) * 100.0) if scores else None,
                common_wrong_choices=wrong_choices,
                weakest_rubric_parts=weak_parts[:5],
                failed_tests=failed[:5],
            ))

    needs_attention: list[dict[str, Any]] = []
    for question in question_rows:
        if question.skip_rate is not None and question.skip_rate >= 40:
            needs_attention.append({"type": "high_skip_rate", "label": question.title, "value": question.skip_rate})
        if question.average_score_percent is not None and question.average_score_percent < 60:
            needs_attention.append({"type": "low_question_score", "label": question.title, "value": question.average_score_percent})
        if question.avg_active_seconds is not None and question.average_score_percent is not None and question.avg_active_seconds >= 300 and question.average_score_percent < 70:
            needs_attention.append({"type": "high_time_low_score", "label": question.title, "value": question.avg_active_seconds})
    if grading_backlog:
        needs_attention.append({"type": "grading_backlog", "label": assignment.title, "value": grading_backlog})
    opened_not_submitted = max(0, len(opened_students) - submitted_count)
    if opened_not_submitted:
        needs_attention.append({"type": "opened_not_submitted", "label": assignment.title, "value": opened_not_submitted})

    funnel = [
        AnalyticsFunnelStep(label="Enrolled", count=len(student_ids)),
        AnalyticsFunnelStep(label="Opened", count=len(opened_students)),
        AnalyticsFunnelStep(label="Started", count=len(started_students)),
        AnalyticsFunnelStep(label="Submitted", count=submitted_count),
        AnalyticsFunnelStep(label="Graded", count=graded_count),
    ]

    return AssignmentAnalyticsResponse(
        assignment=summary,
        funnel=funnel,
        questions=question_rows if include_detail else [],
        students=student_rows if include_detail else [],
        needs_attention=needs_attention,
    )


@app.post("/api/analytics/events", response_model=AnalyticsEventIngestResponse)
def ingest_analytics_events(
    payload: AnalyticsEventBatch,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    """Best-effort ingestion for privacy-preserving behavioral analytics."""
    if not payload.events:
        return AnalyticsEventIngestResponse(accepted=0)

    user_payload: Optional[dict[str, Any]] = None
    course_cache: dict[int, dict[str, Any]] = {}
    assignment_cache: dict[int, Assignment] = {}
    assignment_question_cache: dict[int, tuple[set[int], set[str]]] = {}
    accepted = 0
    duplicates = 0
    rejected = 0
    research_id = fetch_research_id(user_id)
    client_event_ids = [event.client_event_id for event in payload.events]
    existing_event_ids = set(session.exec(
        select(AnalyticsEvent.client_event_id).where(AnalyticsEvent.client_event_id.in_(client_event_ids))
    ).all()) if client_event_ids else set()
    seen_event_ids: set[str] = set()
    rows: list[AnalyticsEvent] = []

    for event in payload.events:
        if event.event_name not in ANALYTICS_EVENT_NAMES:
            rejected += 1
            continue
        if event.client_event_id in existing_event_ids or event.client_event_id in seen_event_ids:
            duplicates += 1
            continue
        seen_event_ids.add(event.client_event_id)

        course_id = event.course_id
        assignment_id = event.assignment_id
        if event.assignment_id is not None:
            assignment = assignment_cache.get(event.assignment_id)
            if assignment is None:
                assignment = get_assignment(session, event.assignment_id)
                if not assignment:
                    rejected += 1
                    continue
                assignment_cache[event.assignment_id] = assignment
                assignment_question_cache[event.assignment_id] = _analytics_assignment_question_keys(session, assignment)
            if course_id is not None and int(course_id) != int(assignment.course_id):
                rejected += 1
                continue
            course_id = int(assignment.course_id)
            question_ids, question_qids = assignment_question_cache.get(event.assignment_id, (set(), set()))
            if event.question_id is not None and int(event.question_id) not in question_ids:
                rejected += 1
                continue
            if event.question_qid is not None and str(event.question_qid) not in question_qids:
                rejected += 1
                continue

        course_payload = None
        if course_id is not None:
            try:
                course_payload = course_cache.get(int(course_id))
                if course_payload is None:
                    course_payload = _roster_call_for_user(session, user_id, "GET", f"/api/courses/{int(course_id)}")
                    course_cache[int(course_id)] = course_payload
            except HTTPException:
                rejected += 1
                continue
        if user_payload is None:
            try:
                user_payload = _roster_call_for_user(session, user_id, "GET", "/api/user")
            except Exception:
                user_payload = {}

        actor_role = _analytics_actor_role(course_payload, user_payload, user_id)
        if assignment_id is not None and actor_role != "student":
            assignment_id = None

        analytics_event = AnalyticsEvent(
            client_event_id=event.client_event_id,
            session_id=event.session_id,
            event_name=event.event_name,
            actor_user_id=user_id,
            actor_role=actor_role,
            research_id=research_id,
            course_id=course_id,
            assignment_id=assignment_id,
            question_id=event.question_id if assignment_id is not None else None,
            question_qid=event.question_qid if assignment_id is not None else None,
            part_id=event.part_id if assignment_id is not None else None,
            route=event.route or "",
            event_metadata=_analytics_metadata(event.metadata),
            occurred_at=_parse_client_datetime(event.occurred_at),
            received_at=datetime.utcnow(),
        )
        session.add(analytics_event)
        rows.append(analytics_event)

    if rows:
        try:
            session.commit()
            accepted = len(rows)
        except IntegrityError:
            session.rollback()
            duplicates += len(rows)

    return AnalyticsEventIngestResponse(accepted=accepted, duplicates=duplicates, rejected=rejected)


@app.get("/api/analytics/course/{course_id}", response_model=CourseAnalyticsResponse)
def get_course_analytics(
    course_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    course_payload = _require_analytics_course_access(session, user_id, course_id)
    assignments = get_course_assignments(session, course_id)
    assignment_responses = [
        _build_assignment_analytics(session, assignment, course_payload, include_detail=False)
        for assignment in assignments
    ]
    summaries = [response.assignment for response in assignment_responses]
    total_enrolled = max((summary.enrolled_count for summary in summaries), default=len(course_payload.get("student_ids") or []))
    total_opened = sum(summary.opened_count for summary in summaries)
    total_submitted = sum(summary.submitted_count for summary in summaries)
    total_backlog = sum(summary.grading_backlog for summary in summaries)
    score_values = [summary.average_score_percent for summary in summaries if summary.average_score_percent is not None]
    needs_attention = []
    for response in assignment_responses:
        needs_attention.extend(response.needs_attention[:3])

    return CourseAnalyticsResponse(
        course_id=course_id,
        course_name=course_payload.get("course_name") or "",
        overview=[
            AnalyticsOverviewMetric(label="Assignments", value=len(summaries)),
            AnalyticsOverviewMetric(label="Students", value=total_enrolled),
            AnalyticsOverviewMetric(label="Assignment opens", value=total_opened),
            AnalyticsOverviewMetric(label="Submissions", value=total_submitted),
            AnalyticsOverviewMetric(label="Grading backlog", value=total_backlog),
            AnalyticsOverviewMetric(label="Average score", value=(sum(score_values) / len(score_values)) if score_values else None),
        ],
        assignments=summaries,
        needs_attention=needs_attention[:12],
    )


@app.get("/api/analytics/assignments/{assignment_id}", response_model=AssignmentAnalyticsResponse)
def get_assignment_analytics(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    assignment = get_assignment(session, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    course_payload = _require_analytics_course_access(session, user_id, assignment.course_id)
    return _build_assignment_analytics(session, assignment, course_payload, include_detail=True)


@app.get("/api/analytics/questions/{question_qid}", response_model=QuestionAnalyticsResponse)
def get_question_analytics(
    question_qid: str,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user),
):
    course_list = _roster_call_for_user(session, user_id, "GET", "/api/courses")
    user_payload = _roster_call_for_user(session, user_id, "GET", "/api/user")
    courses = course_list.get("courses") or []
    if user_payload.get("admin"):
        try:
            admin_payload = _roster_call_for_user(session, user_id, "GET", "/api/courses/all")
            courses = admin_payload.get("courses") or courses
        except Exception:
            pass

    matching_assignments: list[AnalyticsAssignmentSummary] = []
    matching_questions: list[AnalyticsQuestionSummary] = []
    for course in courses:
        course_id = course.get("id")
        if course_id is None:
            continue
        try:
            course_payload = _require_analytics_course_access(session, user_id, int(course_id))
        except HTTPException:
            continue
        for assignment in get_course_assignments(session, int(course_id)):
            refs = _safe_json_loads(getattr(assignment, "assignment_question_refs", "[]"), [])
            question_ids = _assignment_question_ids(assignment)
            contains_qid = any(str(ref.get("qid")) == str(question_qid) for ref in refs if isinstance(ref, dict))
            if not contains_qid:
                questions = get_questions_by_ids(session, question_ids)
                contains_qid = any(str(question.qid or question.id) == str(question_qid) for question in questions)
            if not contains_qid:
                continue
            analytics = _build_assignment_analytics(session, assignment, course_payload, include_detail=True)
            matching_assignments.append(analytics.assignment)
            matching_questions.extend([
                question for question in analytics.questions
                if str(question.question_qid or question.question_id) == str(question_qid)
            ])

    return QuestionAnalyticsResponse(
        question_qid=question_qid,
        assignments=matching_assignments,
        questions=matching_questions,
    )


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "message": "Caliber Milestone One API",
        "version": "1.0.0",
        "endpoints": [
            "/api/upload-pdf",
            "/api/questions",
            "/api/questions/{question_id}",
            "POST /api/questions",
            "PUT /api/questions/{question_id}",
            "DELETE /api/questions/{question_id}",
            "/api/user",
            "PUT /api/user/profile",
            "PUT /api/user/preferences",
            "POST /api/user/onboarding",
            "GET /api/users/{user_id}",
            "PUT /api/users/{user_id}",
            "GET /api/courses",
            "POST /api/courses",
            "GET /api/courses/{course_id}",
            "PUT /api/courses/{course_id}",
            "DELETE /api/courses/{course_id}",
            "POST /api/assignments",
            "GET /api/assignments/{assignment_id}",
            "PUT /api/assignments/{assignment_id}",
            "POST /api/assignments/{assignment_id}/release-now",
            "DELETE /api/assignments/{assignment_id}",
            "GET /api/assignments/{assignment_id}/progress",
            "PUT /api/assignments/{assignment_id}/progress"
        ]
    }


@app.get("/internal/assignment-progress")
def internal_assignment_progress(
    course_id: Optional[int] = None,
    request: Request = None,
    session: Session = Depends(get_session),
):
    """Research-manager-only endpoint. Returns anonymized assignment progress.

    Strips student_id — only research_id is returned to identify students.
    Gated by X-Internal-Secret header matching ROSTER_INTERNAL_SECRET env var.
    """
    from .roster_integration import ROSTER_INTERNAL_SECRET
    secret = (ROSTER_INTERNAL_SECRET or "").strip()
    provided = (request.headers.get("x-internal-secret") or "").strip() if request else ""
    if not secret or provided != secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

    query = select(AssignmentProgress)
    if course_id is not None:
        query = query.join(Assignment).where(Assignment.course_id == course_id)

    rows = session.exec(query).all()
    return [
        {
            "research_id": r.research_id,
            "assignment_id": r.assignment_id,
            "submitted": r.submitted,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "grade_submitted": r.grade_submitted,
            "score_earned": r.score_earned,
            "score_total": r.score_total,
            "current_question_index": r.current_question_index,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
