from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    user_id: str
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
