from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import TEXT, UniqueConstraint


class Question(SQLModel, table=True):
    """Question model stored in the database."""
    id: Optional[int] = Field(default=None, primary_key=True)
    qid: str = Field(index=True, unique=True)  # Stable unique question identifier (e.g., Q00000001)
    title: str = Field(default="")  # Question title (e.g., Invert a Linked List)
    text: str  # Do not index large freeform text; can exceed Postgres btree row limits.
    tags: str = Field(default="")  # Question tags (e.g., recursion, sorting, runtime analysis)
    keywords: str = Field(default="")  # Stored as comma-separated string
    school: str = Field(default="")  # School name (e.g., UCSB)
    user_school: str = Field(default="", index=True) # school of user
    course: str = Field(default="")  # Course name (kept for backward compatibility)
    course_type: str = Field(default="")  # Course type (e.g., intro CS, intermediate CS, linear algebra)
    question_type: str = Field(default="")  # Question type (e.g., mcq, fr, short answer)
    blooms_taxonomy: str = Field(default="")  # Bloom's taxonomy level (e.g., Remembering, Understanding)
    answer_choices: str = Field(sa_column=Column(TEXT), default="[]")  # JSON array of answer choices
    correct_answer: str = Field(default="")  # The correct answer text
    pdf_url: Optional[str] = Field(default=None)  # URL to PDF in object-storage bucket
    source_pdf: Optional[str] = Field(default=None)  # Original PDF filename
    image_url: Optional[str] = Field(default=None)  # URL to image stored in object-storage bucket
    user_id: str = Field(index=True)  # OIDC subject
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_verified: bool = Field(default=False)  # Whether question in database is verified


class Assignment(SQLModel, table=True):
    """Assignment model for course assignments."""
    id: Optional[int] = Field(default=None, primary_key=True)
    node_id: Optional[str] = Field(default=None)  # Foreign key to Course Tree Node (null for now)
    instructor_id: str = Field(default="")  # ID of instructor user who created assignment
    course: str = Field(default="")  # ID/name of course the assignment was created in
    # In roster-managed mode this is a plain roster course ID (no local FK dependency).
    course_id: int = Field(index=True)
    title: str = Field(index=True)
    type: str = Field(default="Other")  # Homework, Quiz, Lab, Exam, Reading, Other
    description: str = Field(default="")
    release_date: Optional[datetime] = Field(default=None)  # Visibility trigger for student portal
    due_date_soft: Optional[datetime] = Field(default=None)  # Target date; no points deducted
    due_date_hard: Optional[datetime] = Field(default=None)  # Final cut-off for Autograder
    late_policy_id: Optional[str] = Field(default=None)  # Reference to policy template
    assignment_questions: str = Field(sa_column=Column(TEXT), default="[]")  # JSON array of question IDs
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssignmentProgress(SQLModel, table=True):
    """Student progress state for an assignment."""
    __tablename__ = "assignment_progress"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_assignment_progress_assignment_student"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="assignment.id", index=True)
    # In roster-managed mode this stores the OIDC subject directly (no local FK dependency).
    student_id: str = Field(index=True)
    answers: str = Field(sa_column=Column(TEXT), default="{}")  # JSON object keyed by question id
    current_question_index: int = Field(default=0)
    submitted: bool = Field(default=False)
    submitted_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
