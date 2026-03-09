from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    user_id: str
    email: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    school_name: str
    admin: bool
    teacher: bool
    pending: bool
    icon_shape: str
    icon_color: str
    initials: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """Schema for updating user admin/teacher status."""
    admin: Optional[bool] = None
    teacher: Optional[bool] = None
    pending: Optional[bool] = None


class UserProfileUpdate(BaseModel):
    """Schema for updating user profile (first/last name only - used after onboarding)."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    school_name: Optional[str] = Field(None, min_length=1, max_length=100)


class UserPreferencesUpdate(BaseModel):
    """Schema for updating user profile preferences (icon shape, color, initials)."""
    icon_shape: Optional[str] = Field(None, pattern="^(circle|square|hex)$")
    icon_color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    initials: Optional[str] = Field(None, min_length=0, max_length=2)


class UserOnboardingUpdate(BaseModel):
    """Schema for onboarding user profile (first/last name and teacher status)."""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    teacher: bool = False


class UserListResponse(BaseModel):
    """Schema for list of users."""
    users: List[UserResponse]
    total: int


class QuestionCreate(BaseModel):
    """Schema for creating a new question."""
    title: str = Field(..., min_length=1)
    text: str
    tags: str = ""
    keywords: str = ""
    school: str = ""
    user_school: str = Field(..., min_length=1)
    course: str = ""
    course_type: str = ""
    question_type: str = ""
    blooms_taxonomy: str = ""
    answer_choices: str = "[]"  # JSON string of answer choices
    correct_answer: str = ""
    pdf_url: Optional[str] = None
    source_pdf: Optional[str] = None
    image_url: Optional[str] = None
    is_verified: bool = False


class QuestionUpdate(BaseModel):
    """Schema for updating a question."""
    title: Optional[str] = None
    text: Optional[str] = None
    tags: Optional[str] = None
    keywords: Optional[str] = None
    school: Optional[str] = None
    user_school: Optional[str] = None
    course: Optional[str] = None
    course_type: Optional[str] = None
    question_type: Optional[str] = None
    blooms_taxonomy: Optional[str] = None
    answer_choices: Optional[str] = None
    correct_answer: Optional[str] = None
    pdf_url: Optional[str] = None
    source_pdf: Optional[str] = None
    image_url: Optional[str] = None
    is_verified: Optional[bool] = None



class QuestionResponse(BaseModel):
    """Schema for question response."""
    id: int
    qid: str
    title: str
    text: str
    tags: str
    keywords: str
    school: str
    user_school: str
    course: str
    course_type: str
    question_type: str
    blooms_taxonomy: str
    answer_choices: str
    correct_answer: str
    pdf_url: Optional[str]
    source_pdf: Optional[str]
    image_url: Optional[str]
    user_id: str
    created_at: datetime
    is_verified: bool

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    """Schema for upload response."""
    status: str
    filename: str
    storage_path: Optional[str] = None
    job_id: Optional[str] = None
    job_token: Optional[str] = None
    progress_percent: Optional[int] = None
    message: str


class UploadStatusResponse(BaseModel):
    """Schema for upload processing status."""
    job_id: str
    status: str
    progress_percent: int = 0
    message: str = ""
    expected_questions: Optional[int] = None
    created_questions: int = 0
    storage_path: Optional[str] = None
    filename: Optional[str] = None


class VerifyBySourceRequest(BaseModel):
    """Request payload for atomically verifying selected draft questions from a source PDF."""
    source_pdf: str = Field(..., min_length=1)
    selected_question_ids: List[int] = []


class VerifyBySourceResponse(BaseModel):
    """Response payload for verify-by-source operation."""
    verified_count: int
    deleted_count: int
    total_drafts: int


class QuestionListResponse(BaseModel):
    """Schema for list of questions."""
    questions: List[QuestionResponse]
    total: int


class AssignmentCreate(BaseModel):
    """Schema for creating a new assignment."""
    course_id: int
    title: str = Field(..., min_length=1)
    type: str = "Other"  # Homework, Quiz, Lab, Exam, Reading, Other
    description: str = ""
    node_id: Optional[str] = None
    release_date: Optional[datetime] = None
    due_date_soft: Optional[datetime] = None
    due_date_hard: Optional[datetime] = None
    late_policy_id: Optional[str] = None
    assignment_questions: List[int] = []  # List of question IDs

    @model_validator(mode='after')
    def validate_required_dates_and_late_policy(self):
        """Require release/due dates and late policy percentage for new assignments."""
        if self.release_date is None:
            raise ValueError("Release date is required")
        if self.due_date_soft is None:
            raise ValueError("Due date is required")
        if self.due_date_hard is None:
            raise ValueError("Due date (late) is required")
        if self.late_policy_id is None or not str(self.late_policy_id).strip():
            raise ValueError("Late policy percentage is required")
        if not self.assignment_questions or len(self.assignment_questions) < 1:
            raise ValueError("At least one question is required")

        try:
            late_percentage = int(str(self.late_policy_id).strip())
        except ValueError as exc:
            raise ValueError("Late policy percentage must be an integer between 0 and 100") from exc

        if late_percentage < 0 or late_percentage > 100:
            raise ValueError("Late policy percentage must be between 0 and 100")

        if self.due_date_hard < self.due_date_soft:
            raise ValueError("Due date (late) must be on or after due date")
        return self


class AssignmentUpdate(BaseModel):
    """Schema for updating an assignment."""
    title: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    node_id: Optional[str] = None
    release_date: Optional[datetime] = None
    due_date_soft: Optional[datetime] = None
    due_date_hard: Optional[datetime] = None
    late_policy_id: Optional[str] = None
    assignment_questions: Optional[List[int]] = None

    @model_validator(mode='after')
    def validate_late_policy_if_present(self):
        """Validate late policy percentage format when provided."""
        if self.late_policy_id is None:
            return self

        raw_value = str(self.late_policy_id).strip()
        if not raw_value:
            raise ValueError("Late policy percentage is required")

        try:
            late_percentage = int(raw_value)
        except ValueError as exc:
            raise ValueError("Late policy percentage must be an integer between 0 and 100") from exc

        if late_percentage < 0 or late_percentage > 100:
            raise ValueError("Late policy percentage must be between 0 and 100")

        return self


class AssignmentResponse(BaseModel):
    """Schema for assignment response."""
    id: int
    node_id: Optional[str]
    instructor_email: Optional[str] = None
    instructor_id: str
    course: str
    course_id: int
    title: str
    type: str
    description: str
    release_date: Optional[datetime]
    due_date_soft: Optional[datetime]
    due_date_hard: Optional[datetime]
    late_policy_id: Optional[str]
    assignment_questions: List[int]  # Parsed from JSON string
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator('assignment_questions', mode='before')
    @classmethod
    def parse_assignment_questions(cls, v):
        """Parse assignment_questions from JSON string if needed."""
        import json
        if isinstance(v, str):
            return json.loads(v) if v else []
        return v if v else []

    @classmethod
    def from_assignment(cls, obj, instructor_email: Optional[str] = None):
        """Build assignment response while sourcing PII externally."""
        import json
        data = {
            'id': obj.id,
            'node_id': obj.node_id,
            'instructor_email': instructor_email,
            'instructor_id': obj.instructor_id,
            'course': obj.course,
            'course_id': obj.course_id,
            'title': obj.title,
            'type': obj.type,
            'description': obj.description,
            'release_date': obj.release_date,
            'due_date_soft': obj.due_date_soft,
            'due_date_hard': obj.due_date_hard,
            'late_policy_id': obj.late_policy_id,
            'assignment_questions': json.loads(obj.assignment_questions) if obj.assignment_questions else [],
            'created_at': obj.created_at,
            'updated_at': obj.updated_at,
        }
        return cls(**data)


class CourseCreate(BaseModel):
    """Schema for creating a new course."""
    course_name: str = Field(..., min_length=1)
    school_name: str = ""
    student_ids: List[str] = []  # List of student OIDC subject IDs


class CourseUpdate(BaseModel):
    """Schema for updating a course."""
    course_name: Optional[str] = None
    school_name: Optional[str] = None
    student_ids: Optional[List[str]] = None  # List of student OIDC subject IDs to replace existing students


class CourseResponse(BaseModel):
    """Schema for course response."""
    id: int
    course_name: str
    course_code: str
    school_name: str
    instructor_id: str
    instructor_email: Optional[str] = None  # Populated from roster service
    student_ids: List[str] = []  # List of student OIDC subject IDs
    assignments: List[AssignmentResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CourseListResponse(BaseModel):
    """Schema for list of courses."""
    courses: List[CourseResponse]
    total: int


class CourseJoinRequest(BaseModel):
    """Schema for joining a course by course code."""
    course_code: str = Field(..., min_length=3)


class CoursePinUpdate(BaseModel):
    """Set or clear pin state for a course for the current user."""
    pinned: bool


class CoursePinResponse(BaseModel):
    course_id: int
    pinned: bool


class CoursePinsResponse(BaseModel):
    pinned_course_ids: List[int]


class AdminCourseOverview(BaseModel):
    """Compact course payload optimized for admin all-courses page."""
    id: int
    course_name: str
    course_code: str
    school_name: str
    instructor_id: str
    assignment_count: int = 0
    student_ids: List[str] = []
    student_name_by_id: dict = Field(default_factory=dict)


class AdminCourseOverviewResponse(BaseModel):
    """List response for admin all-courses overview."""
    courses: List[AdminCourseOverview]
    total: int


class AssignmentProgressResponse(BaseModel):
    """Schema for student assignment progress."""
    assignment_id: int
    student_id: str
    answers: dict = Field(default_factory=dict)
    current_question_index: int = 0
    submitted: bool = False
    submitted_at: Optional[datetime] = None
    updated_at: datetime


class AssignmentProgressUpdate(BaseModel):
    """Schema for updating student assignment progress."""
    answers: Optional[dict] = None
    current_question_index: Optional[int] = None
    submitted: Optional[bool] = None


class AssignmentStudentSubmissionStatus(BaseModel):
    """Per-student assignment submission timing status for instructors."""
    student_id: str
    submitted: bool
    submitted_at: Optional[datetime] = None
    timing_status: str  # on_time | late | not_submitted


class AssignmentSubmissionStatusResponse(BaseModel):
    """Instructor-facing submission status list for an assignment."""
    assignment_id: int
    assignment_phase: str  # unreleased | open | late_window | interim
    students: List[AssignmentStudentSubmissionStatus] = []
