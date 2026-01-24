from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class QuestionCreate(BaseModel):
    """Schema for creating a new question."""
    text: str
    tags: str = ""
    keywords: str = ""
    source_pdf: Optional[str] = None


class QuestionUpdate(BaseModel):
    """Schema for updating a question."""
    text: Optional[str] = None
    tags: Optional[str] = None
    keywords: Optional[str] = None
    source_pdf: Optional[str] = None


class QuestionResponse(BaseModel):
    """Schema for question response."""
    id: int
    text: str
    tags: str
    keywords: str
    source_pdf: Optional[str]
    created_at: datetime

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
