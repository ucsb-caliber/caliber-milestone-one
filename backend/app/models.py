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
    text: str = Field(sa_column=Column(TEXT), index=True)  # Question text (supports markdown)
    tags: str = Field(default="")  # Stored as comma-separated string
    keywords: str = Field(default="")  # Stored as comma-separated string
    course: str = Field(default="")  # UCSB class tag (e.g., CS16, CS24, MATH 3A)
    course_type: str = Field(default="")  # Course type (e.g., intro CS, intermediate CS, linear algebra)
    question_type: str = Field(default="")  # Question type (e.g., mcq, fr, short_answer, true_false)
    blooms_taxonomy: str = Field(default="")  # Bloom's taxonomy level (e.g., Remembering, Understanding, Applying, Analyzing, Evaluating, Creating)
    image_url: Optional[str] = Field(default=None)  # Optional image URL/path
    answer_choices: str = Field(sa_column=Column(TEXT), default="[]")  # JSON array of answer choices
    correct_answer: str = Field(default="")  # The correct answer text
    source_pdf: Optional[str] = Field(default=None)  # Original PDF filename
    user_id: str = Field(index=True)  # Supabase user ID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = Field(default=False)  # Whether question in database is verified
