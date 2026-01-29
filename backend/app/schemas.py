from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    user_id: str
    email: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    admin: bool
    teacher: bool
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


class UserProfileUpdate(BaseModel):
    """Schema for updating user profile (first/last name only - used after onboarding)."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)


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


class QuestionCreate(BaseModel):
    """Schema for creating a new question."""
    title: str
    text: str
    tags: str = ""
    keywords: str = ""
    school: str = ""
    course: str = ""
    course_type: str = ""
    question_type: str = ""
    blooms_taxonomy: str = ""
    answer_choices: str = "[]"  # JSON string of answer choices
    correct_answer: str = ""
    pdf_url: Optional[str] = None
    source_pdf: Optional[str] = None
    image_url: Optional[str] = None


class QuestionUpdate(BaseModel):
    """Schema for updating a question."""
    title: Optional[str] = None
    text: Optional[str] = None
    tags: Optional[str] = None
    keywords: Optional[str] = None
    school: Optional[str] = None
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
    title: str
    text: str
    tags: str
    keywords: str
    school: str
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
    message: str


class QuestionListResponse(BaseModel):
    """Schema for list of questions."""
    questions: List[QuestionResponse]
    total: int
