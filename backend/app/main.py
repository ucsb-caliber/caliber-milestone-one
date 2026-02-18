import os
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from sqlmodel import Session, select, func
from dotenv import load_dotenv

from .database import create_db_and_tables, get_session, engine
from .models import Question, User, Course, Assignment
from .schemas import (QuestionResponse, UploadResponse, QuestionListResponse, QuestionCreate, QuestionUpdate, 
                     UserResponse, UserUpdate, UserProfileUpdate, UserOnboardingUpdate, UserPreferencesUpdate,
                     UserListResponse,
                     CourseResponse, CourseListResponse, CourseCreate, CourseUpdate, CourseJoinRequest,
                     AdminCourseOverview, AdminCourseOverviewResponse,
                     AssignmentResponse, AssignmentCreate, AssignmentUpdate,
                     AssignmentProgressResponse, AssignmentProgressUpdate)
from .crud import (create_question, get_question, get_questions, get_questions_count, get_all_questions,
                  get_questions_by_ids, update_question, delete_question, get_user_by_user_id, update_user_roles, 
                  get_or_create_user, update_user_profile, update_user_preferences, create_course, get_course, 
                  get_courses, get_courses_count, update_course, delete_course, get_course_students, get_course_by_code,
                  enroll_student_in_course,
                  get_all_courses, get_all_courses_count,
                  get_course_assignments, create_assignment, get_assignment, get_assignments, update_assignment, 
                  delete_assignment, get_assignment_progress, upsert_assignment_progress)
from .utils import extract_text_from_pdf, send_to_agent_pipeline
from .auth import get_current_user

load_dotenv()

# Define security scheme for OpenAPI docs
security = HTTPBearer()

app = FastAPI(
    title="Caliber Milestone One API",
    version="1.0.0",
    description="""
    ## Authentication Required
    
    Most endpoints require authentication via Supabase JWT token.
    
    ### Using Swagger UI (Easy - Recommended)
    
    **If you're logged in via the frontend**, Swagger UI works automatically! Just:
    1. Make sure you're logged in at http://localhost:5173
    2. Come back to this page and try any endpoint
    3. Authentication happens automatically via cookies ✨
    
    ### Manual Token Authentication (Alternative)
    
    If automatic cookie auth doesn't work, you can manually provide a token:
    1. Sign up/login via the frontend application
    2. Open browser DevTools → Application → Local Storage
    3. Find the Supabase session and copy the `access_token`
    4. Click the "Authorize" button (🔓) at the top right
    5. Enter: `Bearer YOUR_ACCESS_TOKEN`
    6. Click "Authorize" and close the dialog
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


def process_pdf_background(storage_path: str, file_content: bytes, user_id: str):
    """
    Background task to process PDF and create question records.
    
    This runs asynchronously after the upload endpoint returns.
    
    Args:
        storage_path: The Supabase Storage path of the PDF (e.g., "user123/1234567890.pdf")
        file_content: The PDF file content as bytes
        user_id: The Supabase user ID
    """
    try:
        # Extract text from PDF
        text = extract_text_from_pdf(file_content)
        
        # Send to stubbed agent pipeline
        question_dicts = send_to_agent_pipeline(text, storage_path)
        
        # Create a new session for the background task
        with Session(engine) as session:
            # Store questions in database
            for q_dict in question_dicts:
                create_question(
                    session=session,
                    text=q_dict["text"],
                    title=q_dict.get("title", "Untitled Question"),  # Use provided title or default
                    tags=q_dict["tags"],
                    keywords=q_dict["keywords"],
                    source_pdf=storage_path,  # Store the Supabase Storage path
                    user_id=user_id,
                    is_verified=False  # applies pending status to new questions
                )
        
        print(f"Successfully processed {storage_path}: created {len(question_dicts)} questions for user {user_id}")
    except Exception as e:
        print(f"Error processing PDF {storage_path}: {e}")


@app.post("/api/upload-pdf", response_model=UploadResponse)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    storage_path: str = Form(...),
    user_id: str = Depends(get_current_user)
):
    """
    Upload a PDF file for processing. Requires authentication.
    
    The PDF is already uploaded to Supabase Storage, and storage_path is provided.
    A background task is queued to:
    1. Extract text from the PDF
    2. Send to agent pipeline (stubbed)
    3. Store questions in the database associated with the user
       with the storage_path as source_pdf
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Read file content for processing
    file_content = await file.read()
    
    # Queue background processing with user_id and storage_path
    background_tasks.add_task(process_pdf_background, storage_path, file_content, user_id)
    
    return UploadResponse(
        status="queued",
        filename=file.filename,
        message="PDF upload successful. Processing in background."
    )


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


@app.get("/api/user")
def get_user_info(
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get information about the authenticated user including admin, teacher status, and profile data."""
    # User should exist since get_current_user creates it, but use get_or_create for safety
    user = get_or_create_user(session, user_id)
    
    # Check if profile is complete (first_name and last_name are set and not empty)
    profile_complete = bool(user.first_name and user.first_name.strip() and 
                           user.last_name and user.last_name.strip())
    
    return {
        "user_id": user_id,
        "authenticated": True,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "admin": user.admin,
        "teacher": user.teacher,
        "pending": user.pending,
        "icon_shape": user.icon_shape,
        "icon_color": user.icon_color,
        "initials": user.initials,
        "profile_complete": profile_complete
    }


@app.put("/api/user/profile", response_model=UserResponse)
def update_user_profile_endpoint(
    profile_data: UserProfileUpdate,
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update the authenticated user's profile (first name and last name only - not teacher status)."""
    user = update_user_profile(
        session=session,
        user_id=user_id,
        first_name=profile_data.first_name,
        last_name=profile_data.last_name,
        teacher=None,  # Don't allow changing teacher status after onboarding
        pending=None
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.put("/api/user/preferences", response_model=UserResponse)
def update_user_preferences_endpoint(
    preferences_data: UserPreferencesUpdate,
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update the authenticated user's profile preferences (icon shape, color, and initials)."""
    user = update_user_preferences(
        session=session,
        user_id=user_id,
        icon_shape=preferences_data.icon_shape,
        icon_color=preferences_data.icon_color,
        initials=preferences_data.initials
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.post("/api/user/onboarding", response_model=UserResponse)
def complete_user_onboarding(
    onboarding_data: UserOnboardingUpdate,
    user_id: str = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Complete user onboarding with first/last name and optional instructor request."""
    user = get_user_by_user_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if profile is already complete
    if user.first_name and user.first_name.strip() and user.last_name and user.last_name.strip():
        raise HTTPException(
            status_code=400, 
            detail="Profile already completed. Use PUT /api/user/profile to update name."
        )
    
    # Complete onboarding
    user = update_user_profile(
        session=session,
        user_id=user_id,
        first_name=onboarding_data.first_name,
        last_name=onboarding_data.last_name,
        teacher=False,
        pending=onboarding_data.teacher
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


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
    statement = select(User).offset(skip).limit(limit)
    users = list(session.exec(statement).all())
    
    total_statement = select(func.count(User.id))
    total = session.exec(total_statement).one()
    
    return UserListResponse(users=users, total=total)


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
    user = get_user_by_user_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


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
    # Check if the current user is an admin
    current_user = get_user_by_user_id(session, current_user_id)
    if not current_user or not current_user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can update user roles"
        )
    
    # Ensure target user exists (create if they haven't logged in yet)
    target_user = get_or_create_user(session, user_id)
    
    # Update the roles
    user = update_user_roles(
        session=session,
        user_id=user_id,
        admin=user_data.admin,
        teacher=user_data.teacher,
        pending=user_data.pending
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


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
    # Check if user is a teacher
    user = get_user_by_user_id(session, user_id)
    if not user or not user.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can create courses"
        )
    
    # Create the course
    course = create_course(
        session=session,
        course_name=course_data.course_name,
        school_name=course_data.school_name,
        instructor_id=user_id,
        student_ids=course_data.student_ids
    )
    
    # Build response with additional data
    instructor = get_user_by_user_id(session, course.instructor_id)
    student_ids = get_course_students(session, course.id)
    assignments = get_course_assignments(session, course.id)
    
    return CourseResponse(
        id=course.id,
        course_name=course.course_name,
        course_code=course.course_code,
        school_name=course.school_name,
        instructor_id=course.instructor_id,
        instructor_email=instructor.email if instructor else None,
        student_ids=student_ids,
        assignments=[AssignmentResponse.model_validate(a) for a in assignments],
        created_at=course.created_at,
        updated_at=course.updated_at
    )


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
    user = get_user_by_user_id(session, user_id)
    
    if user and user.teacher:
        # Teachers see their own courses
        courses = get_courses(session, instructor_id=user_id, skip=skip, limit=limit)
        total = get_courses_count(session, instructor_id=user_id)
    else:
        # Students see courses they're enrolled in
        from .models import CourseStudent
        statement = select(CourseStudent.course_id).where(CourseStudent.student_id == user_id)
        course_ids = list(session.exec(statement).all())
        
        if course_ids:
            statement = select(Course).where(Course.id.in_(course_ids)).offset(skip).limit(limit)
            courses = list(session.exec(statement).all())
            total = len(course_ids)
        else:
            courses = []
            total = 0
    
    # Build response with additional data
    course_responses = []
    for course in courses:
        instructor = get_user_by_user_id(session, course.instructor_id)
        student_ids = get_course_students(session, course.id)
        assignments = get_course_assignments(session, course.id)
        
        course_responses.append(CourseResponse(
            id=course.id,
            course_name=course.course_name,
            course_code=course.course_code,
            school_name=course.school_name,
            instructor_id=course.instructor_id,
            instructor_email=instructor.email if instructor else None,
            student_ids=student_ids,
            assignments=[AssignmentResponse.model_validate(a) for a in assignments],
            created_at=course.created_at,
            updated_at=course.updated_at
        ))
    
    return CourseListResponse(courses=course_responses, total=total)


@app.get("/api/courses/all", response_model=CourseListResponse)
def list_all_courses_admin(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Admin-only endpoint to list all courses in the system."""
    user = get_user_by_user_id(session, user_id)
    if not user or not user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can view all courses"
        )

    courses = get_all_courses(session, skip=skip, limit=limit)
    total = get_all_courses_count(session)

    course_responses = []
    for course in courses:
        instructor = get_user_by_user_id(session, course.instructor_id)
        student_ids = get_course_students(session, course.id)
        assignments = get_course_assignments(session, course.id)

        course_responses.append(CourseResponse(
            id=course.id,
            course_name=course.course_name,
            course_code=course.course_code,
            school_name=course.school_name,
            instructor_id=course.instructor_id,
            instructor_email=instructor.email if instructor else None,
            student_ids=student_ids,
            assignments=[AssignmentResponse.model_validate(a) for a in assignments],
            created_at=course.created_at,
            updated_at=course.updated_at
        ))

    return CourseListResponse(courses=course_responses, total=total)


@app.get("/api/admin/courses-overview", response_model=AdminCourseOverviewResponse)
def list_all_courses_admin_overview(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Admin-only compact all-courses endpoint optimized for dashboard cards."""
    from .models import CourseStudent, Assignment

    user = get_user_by_user_id(session, user_id)
    if not user or not user.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can view all courses"
        )

    assignment_counts_subquery = (
        select(
            Assignment.course_id.label("course_id"),
            func.count(Assignment.id).label("assignment_count")
        )
        .group_by(Assignment.course_id)
        .subquery()
    )

    course_rows = list(session.exec(
        select(
            Course.id,
            Course.course_name,
            Course.course_code,
            Course.school_name,
            Course.instructor_id,
            func.coalesce(assignment_counts_subquery.c.assignment_count, 0).label("assignment_count")
        )
        .outerjoin(assignment_counts_subquery, assignment_counts_subquery.c.course_id == Course.id)
        .offset(skip)
        .limit(limit)
    ).all())

    total = get_all_courses_count(session)
    if not course_rows:
        return AdminCourseOverviewResponse(courses=[], total=total)

    course_ids = [row[0] for row in course_rows]
    student_rows = list(session.exec(
        select(
            CourseStudent.course_id,
            CourseStudent.student_id,
            User.first_name,
            User.last_name,
            User.email
        )
        .join(User, User.user_id == CourseStudent.student_id)
        .where(CourseStudent.course_id.in_(course_ids))
    ).all())

    students_by_course = {course_id: [] for course_id in course_ids}
    student_name_by_course = {course_id: {} for course_id in course_ids}
    for course_id, student_id, first_name, last_name, email in student_rows:
        students_by_course[course_id].append(student_id)
        full_name = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
        student_name_by_course[course_id][student_id] = full_name or email or student_id

    courses = []
    for course_id, course_name, course_code, school_name, instructor_id, assignment_count in course_rows:
        courses.append(AdminCourseOverview(
            id=course_id,
            course_name=course_name,
            course_code=course_code,
            school_name=school_name,
            instructor_id=instructor_id,
            assignment_count=int(assignment_count or 0),
            student_ids=students_by_course.get(course_id, []),
            student_name_by_id=student_name_by_course.get(course_id, {})
        ))

    return AdminCourseOverviewResponse(courses=courses, total=total)


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
    course = get_course(session, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Check access: must be instructor or enrolled student
    user = get_user_by_user_id(session, user_id)
    is_instructor = course.instructor_id == user_id
    is_admin = bool(user and user.admin)
    
    student_ids = get_course_students(session, course_id)
    is_enrolled_student = user_id in student_ids
    
    if not (is_instructor or is_enrolled_student or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this course"
        )
    
    # Build response
    instructor = get_user_by_user_id(session, course.instructor_id)
    assignments = get_course_assignments(session, course.id)
    
    return CourseResponse(
        id=course.id,
        course_name=course.course_name,
        course_code=course.course_code,
        school_name=course.school_name,
        instructor_id=course.instructor_id,
        instructor_email=instructor.email if instructor else None,
        student_ids=student_ids,
        assignments=[AssignmentResponse.from_orm(a) for a in assignments],
        created_at=course.created_at,
        updated_at=course.updated_at
    )


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
    course = update_course(
        session=session,
        course_id=course_id,
        instructor_id=user_id,
        course_name=course_data.course_name,
        school_name=course_data.school_name,
        student_ids=course_data.student_ids
    )
    
    if not course:
        raise HTTPException(status_code=404, detail="Course not found or you don't have permission to update it")
    
    # Build response
    instructor = get_user_by_user_id(session, course.instructor_id)
    student_ids = get_course_students(session, course.id)
    assignments = get_course_assignments(session, course.id)
    
    return CourseResponse(
        id=course.id,
        course_name=course.course_name,
        course_code=course.course_code,
        school_name=course.school_name,
        instructor_id=course.instructor_id,
        instructor_email=instructor.email if instructor else None,
        student_ids=student_ids,
        assignments=[AssignmentResponse.from_orm(a) for a in assignments],
        created_at=course.created_at,
        updated_at=course.updated_at
    )


@app.delete("/api/courses/{course_id}", status_code=204)
def delete_existing_course(
    course_id: int,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """
    Delete a course. Only accessible by the course instructor.
    """
    success = delete_course(session, course_id, instructor_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Course not found or you don't have permission to delete it")


@app.post("/api/courses/join", response_model=CourseResponse)
def join_course_by_code(
    join_data: CourseJoinRequest,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Enroll the authenticated student in a course by course code."""
    user = get_user_by_user_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.teacher:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Instructors cannot join courses using student course codes"
        )

    code = join_data.course_code.strip().upper()
    course = get_course_by_code(session, code)
    if not course:
        raise HTTPException(status_code=404, detail="Invalid course code")

    enroll_student_in_course(session, course.id, user_id)

    instructor = get_user_by_user_id(session, course.instructor_id)
    student_ids = get_course_students(session, course.id)
    assignments = get_course_assignments(session, course.id)
    return CourseResponse(
        id=course.id,
        course_name=course.course_name,
        course_code=course.course_code,
        school_name=course.school_name,
        instructor_id=course.instructor_id,
        instructor_email=instructor.email if instructor else None,
        student_ids=student_ids,
        assignments=[AssignmentResponse.model_validate(a) for a in assignments],
        created_at=course.created_at,
        updated_at=course.updated_at
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
    # Verify user is the instructor of the course
    course = get_course(session, assignment_data.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if course.instructor_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the course instructor can create assignments"
        )
    
    # Get user info for instructor email
    user = get_user_by_user_id(session, user_id)
    instructor_email = user.email if user else ""
    
    # Create the assignment
    assignment = create_assignment(
        session=session,
        course_id=assignment_data.course_id,
        instructor_id=user_id,
        instructor_email=instructor_email,
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
    
    return AssignmentResponse.from_orm(assignment)


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
    
    # Check access: must be instructor or enrolled student
    course = get_course(session, assignment.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    user = get_user_by_user_id(session, user_id)
    is_instructor = course.instructor_id == user_id
    is_admin = bool(user and user.admin)
    student_ids = get_course_students(session, assignment.course_id)
    is_enrolled_student = user_id in student_ids
    
    if not (is_instructor or is_enrolled_student or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this assignment"
        )
    
    return AssignmentResponse.from_orm(assignment)


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
    
    return AssignmentResponse.from_orm(assignment)


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

    return AssignmentResponse.from_orm(assignment)


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

    course = get_course(session, assignment.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    student_ids = get_course_students(session, assignment.course_id)
    is_enrolled_student = user_id in student_ids
    if not is_enrolled_student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this assignment progress"
        )

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

    course = get_course(session, assignment.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    student_ids = get_course_students(session, assignment.course_id)
    is_enrolled_student = user_id in student_ids
    if not is_enrolled_student:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only enrolled students can save assignment progress"
        )

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
