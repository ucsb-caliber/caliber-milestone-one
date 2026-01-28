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


class UserOnboardingUpdate(BaseModel):
    """Schema for onboarding user profile (first/last name and teacher status)."""
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    teacher: bool = False


class QuestionCreate(BaseModel):
    """Schema for creating a new question."""
    text: str
    tags: str = ""
    keywords: str = ""
    course: str = ""
    answer_choices: str = "[]"  # JSON string of answer choices
    correct_answer: str = ""
    source_pdf: Optional[str] = None


class QuestionUpdate(BaseModel):
    """Schema for updating a question."""
    text: Optional[str] = None
    tags: Optional[str] = None
    keywords: Optional[str] = None
    course: Optional[str] = None
    answer_choices: Optional[str] = None
    correct_answer: Optional[str] = None
    source_pdf: Optional[str] = None
    is_verified: Optional[bool] = None



class QuestionResponse(BaseModel):
    """Schema for question response."""
    id: int
    text: str
    tags: str
    keywords: str
    course: str
    answer_choices: str
    correct_answer: str
    source_pdf: Optional[str]
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
