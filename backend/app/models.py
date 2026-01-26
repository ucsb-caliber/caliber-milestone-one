from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
import json
from sqlalchemy import TEXT


class User(SQLModel, table=True):
    """User model stored in the database."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True, unique=True)  # Supabase user ID
    admin: bool = Field(default=False)  # Whether user is an admin
    teacher: bool = Field(default=False)  # Whether user is a teacher/instructor
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Question(SQLModel, table=True):
    """Question model stored in the database."""
    id: Optional[int] = Field(default=None, primary_key=True)
    text: str = Field(index=True)
    tags: str = Field(default="")  # Stored as comma-separated string
    keywords: str = Field(default="")  # Stored as comma-separated string
    course: str = Field(default="")  # Course name
    answer_choices: str = Field(sa_column=Column(TEXT), default="[]")  # JSON array of answer choices
    correct_answer: str = Field(default="")  # The correct answer text
    source_pdf: Optional[str] = Field(default=None)  # Original PDF filename
    user_id: str = Field(index=True)  # Supabase user ID
    created_at: datetime = Field(default_factory=datetime.utcnow)
