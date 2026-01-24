import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session
from dotenv import load_dotenv

from .database import create_db_and_tables, get_session, engine
from .models import Question
from .schemas import QuestionResponse, UploadResponse, QuestionListResponse, QuestionCreate, QuestionUpdate
from .crud import create_question, get_question, get_questions, get_questions_count, update_question, delete_question
from .utils import extract_text_from_pdf, send_to_agent_pipeline

load_dotenv()

app = FastAPI(title="Caliber Milestone One API", version="1.0.0")

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


def process_pdf_background(filename: str, file_content: bytes):
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
                    source_pdf=filename
                )
        
        print(f"Successfully processed {filename}: created {len(question_dicts)} questions")
    except Exception as e:
        print(f"Error processing PDF {filename}: {e}")


@app.post("/api/upload-pdf", response_model=UploadResponse)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Upload a PDF file for processing.
    
    The file is saved and a background task is queued to:
    1. Extract text from the PDF
    2. Send to agent pipeline (stubbed)
    3. Store questions in the database
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Read file content
    file_content = await file.read()
    
    # Save file to uploads directory
    file_path = Path(UPLOAD_DIR) / file.filename
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    # Queue background processing
    background_tasks.add_task(process_pdf_background, file.filename, file_content)
    
    return UploadResponse(
        status="queued",
        filename=file.filename,
        message="PDF upload successful. Processing in background."
    )


@app.get("/api/questions", response_model=QuestionListResponse)
def list_questions(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session)
):
    """Get a list of all questions."""
    questions = get_questions(session, skip=skip, limit=limit)
    total = get_questions_count(session)
    
    return QuestionListResponse(
        questions=questions,
        total=total
    )


@app.get("/api/questions/{question_id}", response_model=QuestionResponse)
def get_question_by_id(
    question_id: int,
    session: Session = Depends(get_session)
):
    """Get a specific question by ID."""
    question = get_question(session, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@app.post("/api/questions", response_model=QuestionResponse, status_code=201)
def create_new_question(
    text: str = Form(...),
    tags: str = Form(""),
    keywords: str = Form(""),
    source_pdf: Optional[str] = Form(None),
    session: Session = Depends(get_session)
):
    """Create a new question using form parameters."""
    question = create_question(
        session=session,
        text=text,
        tags=tags,
        keywords=keywords,
        source_pdf=source_pdf
    )
    return question


@app.put("/api/questions/{question_id}", response_model=QuestionResponse)
def update_existing_question(
    question_id: int,
    question_data: QuestionUpdate,
    session: Session = Depends(get_session)
):
    """Update an existing question."""
    question = update_question(
        session=session,
        question_id=question_id,
        text=question_data.text,
        tags=question_data.tags,
        keywords=question_data.keywords,
        source_pdf=question_data.source_pdf
    )
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@app.delete("/api/questions/{question_id}", status_code=204)
def delete_existing_question(
    question_id: int,
    session: Session = Depends(get_session)
):
    """Delete a question."""
    success = delete_question(session, question_id)
    if not success:
        raise HTTPException(status_code=404, detail="Question not found")


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
            "DELETE /api/questions/{question_id}"
        ]
    }
