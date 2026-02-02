from datetime import datetime
from typing import Optional, List, Dict, Any

from sqlalchemy import TEXT
from sqlalchemy.types import JSON
from sqlmodel import Column, Field, Relationship, SQLModel


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
    title: str = Field(default="")  # Question title (e.g., Invert a Linked List)
    text: str = Field(index=True)
    tags: str = Field(default="")  # Question tags (e.g., recursion, sorting, runtime analysis)
    keywords: str = Field(default="")  # Stored as comma-separated string
    school: str = Field(default="")  # School name (e.g., UCSB)
    course: str = Field(default="")  # Course name (kept for backward compatibility)
    course_type: str = Field(default="")  # Course type (e.g., intro CS, intermediate CS, linear algebra)
    question_type: str = Field(default="")  # Question type (e.g., mcq, fr, short answer)
    blooms_taxonomy: str = Field(default="")  # Bloom's taxonomy level (e.g., Remembering, Understanding)
    answer_choices: str = Field(sa_column=Column(TEXT), default="[]")  # JSON array of answer choices
    correct_answer: str = Field(default="")  # The correct answer text
    pdf_url: Optional[str] = Field(default=None)  # URL to PDF in Supabase bucket
    source_pdf: Optional[str] = Field(default=None)  # Original PDF filename
    image_url: Optional[str] = Field(default=None)  # URL to image stored in Supabase bucket
    user_id: str = Field(index=True)  # Supabase user ID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = Field(default=False)  # Whether question in database is verified


class Category(SQLModel, table=True):
    """Category model. One category has many questions (QuestionRecords)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    question_records: List["QuestionRecord"] = Relationship(back_populates="category")


class QuestionRecord(SQLModel, table=True):
    """
    One question as received from the pipeline: question_id, pages, text, hash,
    image crops, type, metadata; plus category and embedding for the vector pipeline.
    """
    __tablename__ = "question_record"

    id: Optional[int] = Field(default=None, primary_key=True)
    question_id: str = Field(index=True, unique=True)  # e.g. "q_ef2a9689e7466caf"
    start_page: Optional[int] = Field(default=None)
    page_nums: Optional[List[int]] = Field(default=None, sa_column=Column("page_nums", JSON))
    text: str = Field(index=True)
    text_hash: Optional[str] = Field(default=None, index=True)
    image_crops: Optional[List[str]] = Field(default=None, sa_column=Column("image_crops", JSON))
    type: Optional[str] = Field(default=None)
    metadata_: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column("metadata", JSON))
    # Category and embedding (vector pipeline)
    category_id: Optional[int] = Field(default=None, foreign_key="category.id", index=True)
    category_name: Optional[str] = Field(default=None)
    embedding: Optional[List[float]] = Field(default=None, sa_column=Column("embedding", JSON))
    category: Optional["Category"] = Relationship(back_populates="question_records")
