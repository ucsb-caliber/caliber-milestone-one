from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, TEXT, Index, UniqueConstraint


class Question(SQLModel, table=True):
    """Question model stored in the database."""
    __table_args__ = (
        UniqueConstraint("qid", "version", name="uq_question_qid_version"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    qid: str = Field(index=True)  # Stable question identifier; unique with version
    version: int = Field(default=1, index=True)  # Stable content version for imports/exports
    title: str = Field(default="")  # Question title (e.g., Invert a Linked List)
    text: str  # Do not index large freeform text; can exceed Postgres btree row limits.
    content: str = Field(sa_column=Column(TEXT), default="")  # Structured question content JSON
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
    owner_user_id: Optional[str] = Field(default=None, index=True)  # Canonical owner; falls back to user_id
    draft_state: str = Field(default="ready", index=True)  # draft, ready, archived
    visibility: str = Field(default="private", index=True)  # private, course, school, global
    origin: str = Field(default="manual", index=True)  # manual, pdf_extract, github_import, system_seed
    school_scope: str = Field(default="", index=True)
    course_scope: Optional[str] = Field(default=None, index=True)
    source_repo: Optional[str] = Field(default=None)
    source_path: Optional[str] = Field(default=None)
    source_commit: Optional[str] = Field(default=None)
    content_hash: str = Field(default="", index=True)
    reviewed_at: Optional[datetime] = Field(default=None)
    reviewed_by: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
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
    assignment_question_refs: str = Field(sa_column=Column(TEXT), default="[]")  # JSON array of qid/version refs with snapshots
    grade_released: bool = Field(default=False)
    grade_released_at: Optional[datetime] = Field(default=None)
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
    research_id: Optional[str] = Field(default=None, index=True)
    answers: str = Field(sa_column=Column(TEXT), default="{}")  # JSON object keyed by question id
    grading_data: str = Field(sa_column=Column(TEXT), default="{}")  # JSON object keyed by question id with rubric-part scores/comments
    variant_data: str = Field(sa_column=Column(TEXT), default="{}")  # JSON object keyed by question qid with generated randomization values
    current_question_index: int = Field(default=0)
    submitted: bool = Field(default=False)
    submitted_at: Optional[datetime] = Field(default=None)
    grade_submitted: bool = Field(default=False)
    grade_submitted_at: Optional[datetime] = Field(default=None)
    score_earned: Optional[float] = Field(default=None)
    score_total: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssignmentIntegrityEvent(SQLModel, table=True):
    """Append-only metadata events used for assignment integrity review."""
    __tablename__ = "assignment_integrity_events"
    __table_args__ = (
        Index("ix_integrity_assignment_student_created", "assignment_id", "student_id", "created_at"),
        Index("ix_integrity_assignment_event_type", "assignment_id", "event_type"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="assignment.id", index=True)
    student_id: str = Field(index=True)
    question_key: Optional[str] = Field(default=None, index=True)
    part_id: Optional[str] = Field(default=None, index=True)
    event_type: str = Field(index=True)
    event_metadata: dict = Field(default_factory=dict, sa_column=Column(JSON))
    client_created_at: Optional[datetime] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class AnalyticsEvent(SQLModel, table=True):
    """Raw behavioral analytics events for assignment and question activity."""
    __tablename__ = "analytics_event"
    __table_args__ = (
        UniqueConstraint("client_event_id", name="uq_analytics_event_client_event_id"),
        Index("ix_analytics_assignment_occurred", "assignment_id", "occurred_at"),
        Index("ix_analytics_question_occurred", "question_qid", "occurred_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    client_event_id: str = Field(index=True)
    session_id: str = Field(index=True)
    event_name: str = Field(index=True)
    actor_user_id: str = Field(index=True)
    actor_role: str = Field(default="student", index=True)
    research_id: Optional[str] = Field(default=None, index=True)
    course_id: Optional[int] = Field(default=None, index=True)
    assignment_id: Optional[int] = Field(default=None, index=True)
    question_id: Optional[int] = Field(default=None, index=True)
    question_qid: Optional[str] = Field(default=None, index=True)
    part_id: Optional[str] = Field(default=None, index=True)
    route: str = Field(default="")
    event_metadata: dict = Field(default_factory=dict, sa_column=Column(JSON))
    occurred_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    received_at: datetime = Field(default_factory=datetime.utcnow, index=True)
