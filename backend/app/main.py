import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from sqlmodel import Session, select
from dotenv import load_dotenv

from .database import create_db_and_tables, get_session, engine
from .models import Question
from .schemas import QuestionResponse, UploadResponse, QuestionListResponse, QuestionCreate, QuestionUpdate
from .crud import create_question, get_question, get_questions, get_questions_count, get_all_questions, update_question, delete_question
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

# Configure CORS to allow frontend at localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


def process_pdf_background(filename: str, file_content: bytes, user_id: str):
    """
    Background task to process PDF and create question records.
    
    This runs asynchronously after the upload endpoint returns.
    """
    try:
        # Extract text from PDF
        text = extract_text_from_pdf(file_content)
        
        # Send to stubbed agent pipeline
        question_dicts = send_to_agent_pipeline(text, filename)
        
        # Create a new session for the background task
        with Session(engine) as session:
            # Store questions in database
            for q_dict in question_dicts:
                create_question(
                    session=session,
                    text=q_dict["text"],
                    tags=q_dict["tags"],
                    keywords=q_dict["keywords"],
                    source_pdf=filename,
                    user_id=user_id
                )
        
        print(f"Successfully processed {filename}: created {len(question_dicts)} questions for user {user_id}")
    except Exception as e:
        print(f"Error processing PDF {filename}: {e}")


@app.post("/api/upload-pdf", response_model=UploadResponse)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """
    Upload a PDF file for processing. Requires authentication.
    
    The file is saved and a background task is queued to:
    1. Extract text from the PDF
    2. Send to agent pipeline (stubbed)
    3. Store questions in the database associated with the user
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Read file content
    file_content = await file.read()
    
    # Save file to uploads directory
    file_path = Path(UPLOAD_DIR) / file.filename
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    # Queue background processing with user_id
    background_tasks.add_task(process_pdf_background, file.filename, file_content, user_id)
    
    return UploadResponse(
        status="queued",
        filename=file.filename,
        message="PDF upload successful. Processing in background."
    )


@app.get("/api/questions", response_model=QuestionListResponse)
def list_questions(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Get a list of questions for the authenticated user."""
    questions = get_questions(session, user_id=user_id, skip=skip, limit=limit)
    total = get_questions_count(session, user_id=user_id)
    
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
    # Get total count of all questions (not filtered by user)
    total = len(list(session.exec(select(Question)).all()))
    
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
    """Get a specific question by ID. Only accessible by the question owner."""
    question = get_question(session, question_id, user_id=user_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@app.post("/api/questions", response_model=QuestionResponse, status_code=201)
def create_new_question(
    text: str = Form(...),
    tags: str = Form(""),
    keywords: str = Form(""),
    course: str = Form(""),
    answer_choices: str = Form("[]"),
    correct_answer: str = Form(""),
    source_pdf: Optional[str] = Form(None),
    session: Session = Depends(get_session),
    user_id: str = Depends(get_current_user)
):
    """Create a new question using form parameters. Requires authentication."""
    question = create_question(
        session=session,
        text=text,
        tags=tags,
        keywords=keywords,
        course=course,
        answer_choices=answer_choices,
        correct_answer=correct_answer,
        source_pdf=source_pdf,
        user_id=user_id
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
        text=question_data.text,
        tags=question_data.tags,
        keywords=question_data.keywords,
        course=question_data.course,
        answer_choices=question_data.answer_choices,
        correct_answer=question_data.correct_answer,
        source_pdf=question_data.source_pdf
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
def get_user_info(user_id: str = Depends(get_current_user)):
    """Get information about the authenticated user."""
    return {
        "user_id": user_id,
        "authenticated": True
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
            "/api/user"
        ]
    }
