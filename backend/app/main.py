import os
import threading
import uuid
import time
import json
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Form, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from sqlmodel import Session, select, func
from sqlalchemy import inspect, text
from dotenv import load_dotenv

from .database import create_db_and_tables, get_session, engine
from .models import Question, Assignment, AssignmentProgress
from .schemas import (QuestionResponse, UploadResponse, QuestionListResponse, QuestionUpdate,
                     UserResponse, UserUpdate, UserProfileUpdate, UserOnboardingUpdate, UserPreferencesUpdate,
                     UserListResponse,
                     CourseResponse, CourseListResponse, CourseCreate, CourseUpdate, CourseJoinRequest,
                     CoursePinUpdate, CoursePinResponse, CoursePinsResponse,
                     AdminCourseOverviewResponse,
                     AssignmentResponse, AssignmentCreate, AssignmentUpdate, UploadStatusResponse,
                     VerifyBySourceRequest, VerifyBySourceResponse,
                     AssignmentProgressResponse, AssignmentProgressUpdate,
                     AssignmentSubmissionStatusResponse, AssignmentStudentSubmissionStatus,
                     AssignmentGradingResponse, AssignmentGradeUpsertRequest,
                     AssignmentQuestionGradeResponse, RubricPartGradeResponse, RubricLevelCriteria)
from .crud import (create_question, get_question, get_questions, get_questions_count, get_all_questions,
                  get_questions_by_ids, update_question, delete_question,
                  get_course_assignments, create_assignment, get_assignment, update_assignment, 
                  delete_assignment, get_assignment_progress, upsert_assignment_progress,
                  list_assignment_progress_for_students,
                  update_assignment_grading,
                  delete_unverified_questions_by_source)
from .utils import extract_text_from_pdf, send_to_agent_pipeline, extract_questions_from_pdf_bytes
from .m2_pipeline import extract_questions_with_m2
from .auth import get_current_user, get_current_user_email, get_current_user_name, get_optional_user
from .storage_client import build_pdf_storage_path, upload_pdf_to_storage
from .roster_integration import (
    call_roster,
    delete_local_course,
    fetch_research_id,
)

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

    with Session(engine) as session:
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
) -> AssignmentResponse:
    """Build assignment response with roster-sourced instructor email when available."""
    return AssignmentResponse.from_assignment(
        assignment,
        instructor_email=instructor_email,
        all_students_graded=all_students_graded,
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


def _is_auto_graded_question(question: Question) -> bool:
    qtype = (question.question_type or "").strip().lower()
    return qtype in {"mcq", "true_false"}


def _is_manual_question(question: Question) -> bool:
    qtype = (question.question_type or "").strip().lower()
    return qtype in {"fr", "short_answer"}


def _question_max_points(question: Question) -> float:
    answer_choices = _safe_json_loads(question.answer_choices, [])
    qtype = (question.question_type or "").strip().lower()

    if qtype in {"mcq", "true_false"}:
        return 1.0

    if isinstance(answer_choices, list) and answer_choices and isinstance(answer_choices[0], dict):
        total = 0.0
        for part in answer_choices:
            levels = part.get("rubric_levels") or []
            if isinstance(levels, list) and levels:
                max_pts = max(float(level.get("points") or 0) for level in levels)
                total += max(0.0, max_pts)
            else:
                total += max(0.0, float(part.get("points") or 0))
        return total if total > 0 else 1.0

    return 1.0


def _build_manual_rubric_parts(question: Question, selected_parts: dict[str, Any]) -> list[RubricPartGradeResponse]:
    answer_choices = _safe_json_loads(question.answer_choices, [])
    if not (isinstance(answer_choices, list) and answer_choices and isinstance(answer_choices[0], dict)):
        return [
            RubricPartGradeResponse(
                part_index=0,
                label="Part A",
                max_points=1.0,
                options=[1.0, 0.0],
                level_criteria=[],
                selected_score=float(selected_parts.get("0", {}).get("score")) if selected_parts.get("0", {}).get("score") is not None else None,
                comment=str(selected_parts.get("0", {}).get("comment") or ""),
                graded=selected_parts.get("0", {}).get("score") is not None,
            )
        ]

    parts: list[RubricPartGradeResponse] = []
    for idx, part in enumerate(answer_choices):
        levels = part.get("rubric_levels") or []
        part_key = str(idx)
        selected = selected_parts.get(part_key, {}) if isinstance(selected_parts, dict) else {}
        selected_score = selected.get("score")
        options = []
        if isinstance(levels, list) and levels:
            options = sorted({float(level.get("points") or 0) for level in levels}, reverse=True)
        else:
            options = [float(part.get("points") or 0)]
        if 0.0 not in options:
            options.append(0.0)
        options = sorted(set(options), reverse=True)

        max_points = max(options) if options else 0.0
        level_criteria_list: list[RubricLevelCriteria] = []
        if isinstance(levels, list):
            for lev in levels:
                pts = float(lev.get("points") or 0)
                criteria = str(lev.get("criteria") or "").strip()
                level_criteria_list.append(RubricLevelCriteria(points=pts, criteria=criteria))
            level_criteria_list.sort(key=lambda x: (-x.points, x.criteria))
        parts.append(
            RubricPartGradeResponse(
                part_index=idx,
                label=part.get("part_label") or f"Part {chr(ord('A') + idx)}",
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
    stored_score_earned: Optional[float],
    stored_score_total: Optional[float],
) -> AssignmentGradingResponse:
    question_cards: list[AssignmentQuestionGradeResponse] = []
    total_earned = 0.0
    total_points = 0.0

    for question in questions:
        qid = str(question.id)
        student_answer = answers_by_question_id.get(qid)
        max_points = _question_max_points(question)
        total_points += max_points
        question_grade = (grading_data or {}).get(qid, {}) if isinstance(grading_data, dict) else {}
        question_comment = str(question_grade.get("question_comment") or "")

        if _is_auto_graded_question(question):
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
                    correct_answer=question.correct_answer or "",
                    question_comment=question_comment,
                    rubric_parts=[],
                )
            )
            continue

        selected_parts = question_grade.get("parts", {}) if isinstance(question_grade, dict) else {}
        rubric_parts = _build_manual_rubric_parts(question, selected_parts)
        is_fully_graded = all(part.graded for part in rubric_parts)
        earned = sum(float(part.selected_score or 0) for part in rubric_parts)
        total_earned += earned
        question_cards.append(
            AssignmentQuestionGradeResponse(
                question_id=question.id,
                question_title=question.title or f"Question {question.id}",
                question_text=question.text or "",
                question_type=question.question_type or "",
                max_points=max_points,
                earned_points=earned,
                is_auto_graded=False,
                requires_manual_grading=_is_manual_question(question),
                is_fully_graded=is_fully_graded,
                student_answer="" if student_answer is None else json.dumps(student_answer) if isinstance(student_answer, (dict, list)) else str(student_answer),
                correct_answer=None,
                question_comment=question_comment,
                rubric_parts=rubric_parts,
            )
        )

    all_fully_graded = all(card.is_fully_graded for card in question_cards)
    final_score_earned = float(stored_score_earned) if (grade_submitted and stored_score_earned is not None) else total_earned
    final_score_total = float(stored_score_total) if (grade_submitted and stored_score_total is not None) else total_points
    score_percent = (final_score_earned / final_score_total * 100.0) if final_score_total > 0 else 0.0

    return AssignmentGradingResponse(
        assignment_id=assignment.id,
        assignment_title=assignment.title,
        student_id=student_id,
        grade_submitted=grade_submitted,
        score_earned=round(final_score_earned, 4),
        score_total=round(final_score_total, 4),
        score_percent=round(score_percent, 4),
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

        qid = str(question.id)
        existing_question_grade = normalized.get(qid, {})
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

        normalized[qid] = {
            "question_comment": str(existing_question_grade.get("question_comment") or "") if isinstance(existing_question_grade, dict) else "",
            "parts": zero_parts,
        }

    return normalized


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
    question_ids = _safe_json_loads(assignment.assignment_questions, [])
    questions = get_questions_by_ids(session, question_ids)
    assignment_total_points = sum(_question_max_points(question) for question in questions)

    changed = False
    updated_at = datetime.utcnow()
    finalized_at = datetime.utcnow()

    for student_id in student_ids:
        progress = progress_by_student_id.get(student_id)
        submitted_at = _normalize_datetime_utc(progress.submitted_at) if progress else None
        submitted = bool(progress and progress.submitted and submitted_at)
        answers = _safe_json_loads(progress.answers if progress else "{}", {})
        grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
        normalized_grading_data = grading_data if isinstance(grading_data, dict) else {}
        auto_graded_at = assignment.due_date_hard or finalized_at

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
                stored_score_earned=None,
                stored_score_total=None,
            )
            should_finalize = True
            next_score_earned = computed.score_earned
            next_score_total = computed.score_total
        else:
            computed = _build_grading_response(
                assignment=assignment,
                student_id=student_id,
                questions=questions,
                answers_by_question_id=answers if isinstance(answers, dict) else {},
                grading_data=normalized_grading_data,
                grade_submitted=False,
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
    return call_roster(
        method,
        path,
        user_id=user_id,
        user_email=user_email,
        user_name=user_name,
        params=params,
        json_body=json_body,
    )


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
        with Session(engine) as session:
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
        questions=questions,
        total=total
    )


@app.get("/api/questions/all", response_model=QuestionListResponse)
def list_all_questions(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get all questions from all users. Requires authentication."""
    questions = get_all_questions(session, skip=skip, limit=limit)
    # Get total count of all questions efficiently
    total = session.exec(select(func.count(Question.id))).one()
    
    return QuestionListResponse(
        questions=questions,
        total=total
    )


@app.get("/api/questions/{question_id}", response_model=QuestionResponse)
def get_question_by_id(
    question_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get a specific question by ID. Returns the question if it exists (for assignment viewing)."""
    # Don't filter by user_id - allow fetching any question for assignment viewing
    question = get_question(session, question_id, user_id=None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@app.post("/api/questions/batch", response_model=QuestionListResponse)
def get_questions_batch(
    question_ids: list[int],
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get multiple questions by IDs in a single request. More efficient than individual calls."""
    questions = get_questions_by_ids(session, question_ids)
    return QuestionListResponse(
        questions=questions,
        total=len(questions)
    )


@app.post("/api/questions", response_model=QuestionResponse, status_code=201)
def create_new_question(
    title: str = Form(...),
    text: str = Form(...),
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
    pdf_url: Optional[str] = Form(None),
    source_pdf: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Create a new question using form parameters.

    This endpoint requires authentication. If no ``source_pdf`` is provided
    (i.e., the question is created manually and not extracted from a PDF),
    the question is marked as verified by default.
    """
    # Manual questions (without a source PDF) are verified by default.
    is_verified = source_pdf is None

    question = create_question(
        session=session,
        title=title,
        text=text,
        tags=tags,
        keywords=keywords,
        school=school,
        user_school=user_school,
        course=course,
        course_type=course_type,
        question_type=question_type,
        blooms_taxonomy=blooms_taxonomy,
        answer_choices=answer_choices,
        correct_answer=correct_answer,
        pdf_url=pdf_url,
        source_pdf=source_pdf,
        image_url=image_url,
        user_id=user_id,
        is_verified=is_verified
    )
    return question


@app.put("/api/questions/{question_id}", response_model=QuestionResponse)
def update_existing_question(
    question_id: int,
    question_data: QuestionUpdate,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Update an existing question. Only accessible by the question owner."""
    question = update_question(
        session=session,
        question_id=question_id,
        user_id=user_id,
        title=question_data.title,
        text=question_data.text,
        tags=question_data.tags,
        keywords=question_data.keywords,
        school=question_data.school,
        course=question_data.course,
        course_type=question_data.course_type,
        question_type=question_data.question_type,
        blooms_taxonomy=question_data.blooms_taxonomy,
        answer_choices=question_data.answer_choices,
        correct_answer=question_data.correct_answer,
        pdf_url=question_data.pdf_url,
        source_pdf=question_data.source_pdf,
        image_url=question_data.image_url,
        is_verified=question_data.is_verified
    )
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


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

    # Create the assignment
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
    return build_assignment_response(
        session,
        assignment,
        instructor_email=course_payload.get("instructor_email"),
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
    
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found or you don't have permission to update it")

    _sync_assignment_post_due_grading(
        session,
        assignment=assignment,
        student_ids=list(course_payload.get("student_ids") or []),
    )

    instructor_email = course_payload.get("instructor_email")

    return build_assignment_response(session, assignment, instructor_email=instructor_email)


@app.post("/api/assignments/{assignment_id}/release-now", response_model=AssignmentResponse)
def release_assignment_now(
    assignment_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Release an assignment immediately by setting release_date to now (UTC)."""
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
            research_id=fetch_research_id(user_id),
        )

    import json
    return AssignmentProgressResponse(
        assignment_id=progress.assignment_id,
        student_id=progress.student_id,
        answers=json.loads(progress.answers) if progress.answers else {},
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
    question_ids = _safe_json_loads(assignment.assignment_questions, [])
    questions = get_questions_by_ids(session, question_ids)

    return _build_grading_response(
        assignment=assignment,
        student_id=user_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=grading_data if isinstance(grading_data, dict) else {},
        grade_submitted=bool(progress and progress.grade_submitted),
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

    progress = upsert_assignment_progress(
        session=session,
        assignment_id=assignment_id,
        student_id=user_id,
        answers=progress_data.answers,
        current_question_index=progress_data.current_question_index,
        submitted=progress_data.submitted,
        research_id=fetch_research_id(user_id),
    )

    import json
    return AssignmentProgressResponse(
        assignment_id=progress.assignment_id,
        student_id=progress.student_id,
        answers=json.loads(progress.answers) if progress.answers else {},
        current_question_index=progress.current_question_index,
        submitted=progress.submitted,
        submitted_at=progress.submitted_at,
        grade_submitted=bool(progress.grade_submitted),
        grade_submitted_at=progress.grade_submitted_at,
        score_earned=progress.score_earned if can_view_grade else None,
        score_total=progress.score_total if can_view_grade else None,
        updated_at=progress.updated_at
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
    _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=student_ids)
    progress_rows = list_assignment_progress_for_students(session, assignment_id, student_ids)
    progress_by_student_id = {row.student_id: row for row in progress_rows}
    assignment_question_ids = _safe_json_loads(assignment.assignment_questions, [])
    assignment_questions = get_questions_by_ids(session, assignment_question_ids)
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
                grade_submitted_at = grade_submitted_at or assignment.due_date_hard
                score_earned = 0.0 if score_earned is None else score_earned
                score_total = assignment_total_points if score_total is None else score_total
                score_percent = 0.0 if assignment_total_points > 0 else None
        if assignment_phase == "ungraded" and not grade_submitted_at:
            all_students_graded = False

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

    _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=[student_id])

    progress = get_assignment_progress(session, assignment_id, student_id)
    answers = _safe_json_loads(progress.answers if progress else "{}", {})
    grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
    question_ids = _safe_json_loads(assignment.assignment_questions, [])
    questions = get_questions_by_ids(session, question_ids)

    return _build_grading_response(
        assignment=assignment,
        student_id=student_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=grading_data if isinstance(grading_data, dict) else {},
        grade_submitted=bool(progress and progress.grade_submitted),
        stored_score_earned=progress.score_earned if progress else None,
        stored_score_total=progress.score_total if progress else None,
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

    _sync_assignment_post_due_grading(session, assignment=assignment, student_ids=[student_id])

    progress = get_assignment_progress(session, assignment_id, student_id)
    answers = _safe_json_loads(progress.answers if progress else "{}", {})
    existing_grading_data = _safe_json_loads(progress.grading_data if progress else "{}", {})
    if not isinstance(existing_grading_data, dict):
        existing_grading_data = {}

    updates = payload.question_grades or []
    for update in updates:
        qid = str(update.question_id)
        existing_grading_data.setdefault(qid, {})
        existing_grading_data[qid]["question_comment"] = update.question_comment or ""
        parts_payload = {}
        for part in update.parts:
            parts_payload[str(part.part_index)] = {
                "score": float(part.score),
                "comment": part.comment or "",
            }
        existing_grading_data[qid]["parts"] = parts_payload

    question_ids = _safe_json_loads(assignment.assignment_questions, [])
    questions = get_questions_by_ids(session, question_ids)
    computed = _build_grading_response(
        assignment=assignment,
        student_id=student_id,
        questions=questions,
        answers_by_question_id=answers if isinstance(answers, dict) else {},
        grading_data=existing_grading_data,
        grade_submitted=False,
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
        stored_score_earned=updated_progress.score_earned,
        stored_score_total=updated_progress.score_total,
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
