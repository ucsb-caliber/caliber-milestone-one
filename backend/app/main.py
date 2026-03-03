import os
import threading
import uuid
import time
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from sqlmodel import Session, select, func
from dotenv import load_dotenv

from .database import create_db_and_tables, get_session, engine
from .models import Question, Assignment
from .schemas import (QuestionResponse, UploadResponse, QuestionListResponse, QuestionUpdate,
                     UserResponse, UserUpdate, UserProfileUpdate, UserOnboardingUpdate, UserPreferencesUpdate,
                     UserListResponse,
                     CourseResponse, CourseListResponse, CourseCreate, CourseUpdate, CourseJoinRequest,
                     CoursePinUpdate, CoursePinResponse, CoursePinsResponse,
                     AdminCourseOverviewResponse,
                     AssignmentResponse, AssignmentCreate, AssignmentUpdate, UploadStatusResponse,
                     VerifyBySourceRequest, VerifyBySourceResponse,
                     AssignmentProgressResponse, AssignmentProgressUpdate)
from .crud import (create_question, get_question, get_questions, get_questions_count, get_all_questions,
                  get_questions_by_ids, update_question, delete_question,
                  get_course_assignments, create_assignment, get_assignment, update_assignment, 
                  delete_assignment, get_assignment_progress, upsert_assignment_progress,
                  delete_unverified_questions_by_source)
from .utils import extract_text_from_pdf, send_to_agent_pipeline, extract_questions_from_pdf_bytes
from .m2_pipeline import extract_questions_with_m2
from .auth import get_current_user
from .storage_client import build_pdf_storage_path, upload_pdf_to_storage
from .roster_integration import (
    call_roster,
    delete_local_course,
)

load_dotenv()

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


def _create_upload_job(job_id: str, filename: str, storage_path: str, user_id: str):
    with _UPLOAD_JOBS_LOCK:
        _UPLOAD_JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress_percent": 5,
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


@app.on_event("startup")
def on_startup():
    """Initialize database on startup."""
    create_db_and_tables()
    backfill_existing_assignment_dates()


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
) -> AssignmentResponse:
    """Build assignment response with roster-sourced instructor email when available."""
    return AssignmentResponse.from_assignment(
        assignment,
        instructor_email=instructor_email,
    )


def _roster_call_for_user(
    session: Session,
    user_id: str,
    method: str,
    path: str,
    *,
    params: Optional[dict[str, Any]] = None,
    json_body: Optional[dict[str, Any]] = None,
):
    return call_roster(
        method,
        path,
        user_id=user_id,
        params=params,
        json_body=json_body,
    )


def _build_course_response_from_roster(session: Session, payload: dict[str, Any]) -> CourseResponse:
    # Keep roster as source-of-truth for course/user metadata and Caliber DB for assignments.
    course_id = int(payload["id"])
    instructor_email = payload.get("instructor_email")
    assignments = get_course_assignments(session, course_id)
    return CourseResponse(
        id=course_id,
        course_name=payload.get("course_name") or "",
        course_code=payload.get("course_code") or "",
        school_name=payload.get("school_name") or "",
        instructor_id=payload.get("instructor_id") or "",
        instructor_email=instructor_email,
        student_ids=payload.get("student_ids") or [],
        assignments=[
            build_assignment_response(session, a, instructor_email=instructor_email)
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

    def m2_progress(current: int, total: int, message: str):
        # Reserve 10%-70% for parse + formatting to show smooth progress during LLM cleanup.
        if total <= 0:
            pct = 20
        else:
            pct = 10 + int((current / total) * 60)
        _update_upload_job(
            job_id,
            status="cancelling" if cancel_requested() else "running",
            progress_percent=max(10, min(70, pct)),
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
        progress_percent=75,
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
                    progress = min(95, 75 + int((inserted_count / expected_count) * 20))
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
                    progress_percent=95,
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
        progress_percent=5,
        message="PDF upload successful. Processing in background."
    )


@app.get("/api/upload-status/{job_id}", response_model=UploadStatusResponse)
def get_upload_status(
    job_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get progress for a queued PDF upload job."""
    job = _get_upload_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found")
    if job.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    public_job = {k: v for k, v in job.items() if k not in {"user_id", "cancel_requested"}}
    return UploadStatusResponse(**public_job)


@app.post("/api/upload-status/{job_id}/cancel", response_model=UploadStatusResponse)
def cancel_upload_status(
    job_id: str,
    user_id: str = Depends(get_current_user),
):
    """Request cancellation for a queued/running upload job."""
    job = _get_upload_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found")
    if job.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

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
    assignment = update_assignment(
        session=session,
        assignment_id=assignment_id,
        instructor_id=user_id,
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

    course_payload = _roster_call_for_user(
        session,
        user_id,
        "GET",
        f"/api/courses/{assignment.course_id}",
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
    _ = course_payload

    progress = get_assignment_progress(session, assignment_id, user_id)
    if not progress:
        progress = upsert_assignment_progress(
            session=session,
            assignment_id=assignment_id,
            student_id=user_id,
            answers={},
            current_question_index=0,
            submitted=False
        )

    import json
    return AssignmentProgressResponse(
        assignment_id=progress.assignment_id,
        student_id=progress.student_id,
        answers=json.loads(progress.answers) if progress.answers else {},
        current_question_index=progress.current_question_index,
        submitted=progress.submitted,
        submitted_at=progress.submitted_at,
        updated_at=progress.updated_at
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
    _ = course_payload

    progress = upsert_assignment_progress(
        session=session,
        assignment_id=assignment_id,
        student_id=user_id,
        answers=progress_data.answers,
        current_question_index=progress_data.current_question_index,
        submitted=progress_data.submitted
    )

    import json
    return AssignmentProgressResponse(
        assignment_id=progress.assignment_id,
        student_id=progress.student_id,
        answers=json.loads(progress.answers) if progress.answers else {},
        current_question_index=progress.current_question_index,
        submitted=progress.submitted,
        submitted_at=progress.submitted_at,
        updated_at=progress.updated_at
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
