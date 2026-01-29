from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
import json
from sqlalchemy import TEXT


class User(SQLModel, table=True):
    """User model stored in the database."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, unique=True)  # Supabase user ID
    email: Optional[str] = Field(default=None, index=True)  # User's email address
    first_name: Optional[str] = Field(default=None)  # User's first name
    last_name: Optional[str] = Field(default=None)  # User's last name
    admin: bool = Field(default=False)  # Whether user is an admin
    teacher: bool = Field(default=False)  # Whether user is a teacher/instructor
    icon_shape: str = Field(default="circle")  # Profile icon shape: circle, square, or hex
    icon_color: str = Field(default="#4f46e5")  # Profile icon color (hex code)
    initials: Optional[str] = Field(default=None, max_length=2)  # User's custom initials (max 2 chars)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Question(SQLModel, table=True):
    """Question model stored in the database."""
    id: Optional[int] = Field(default=None, primary_key=True)
    text: str = Field(index=True)
    tags: str = Field(default="")  # Question tags (e.g., recursion, sorting, runtime analysis)
    keywords: str = Field(default="")  # Stored as comma-separated string
    class_tag: str = Field(default="")  # UCSB class tag (e.g., CS16, CS24)
    course: str = Field(default="")  # Course name (kept for backward compatibility)
    course_type: str = Field(default="")  # Course type (e.g., intro CS, intermediate CS, linear algebra)
    question_type: str = Field(default="")  # Question type (e.g., mcq, fr, short answer)
    blooms_taxonomy: str = Field(default="")  # Bloom's taxonomy level (e.g., Remembering, Understanding)
    answer_choices: str = Field(sa_column=Column(TEXT), default="[]")  # JSON array of answer choices
    correct_answer: str = Field(default="")  # The correct answer text
    # PDF page fields: pdf_page is for single-page questions, start/end are for multi-page questions
    pdf_page: Optional[int] = Field(default=None)  # PDF page number (for single-page questions)
    pdf_start_page: Optional[int] = Field(default=None)  # Starting PDF page (for multi-page questions)
    pdf_end_page: Optional[int] = Field(default=None)  # Ending PDF page (for multi-page questions)
    source_pdf: Optional[str] = Field(default=None)  # Original PDF filename
    image_url: Optional[str] = Field(default=None)  # URL to image stored in Supabase bucket
    user_id: str = Field(index=True)  # Supabase user ID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = Field(default=False)  # Whether question in database is verified
