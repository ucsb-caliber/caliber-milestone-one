from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


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
    text: str
    tags: str = ""
    keywords: str = ""
    course: str = ""
    course_type: str = ""
    question_type: str = ""
    blooms_taxonomy: str = ""
    image_url: Optional[str] = None
    answer_choices: str = "[]"  # JSON string of answer choices
    correct_answer: str = ""
    source_pdf: Optional[str] = None
    
    @field_validator('question_type')
    @classmethod
    def validate_question_type(cls, v: str) -> str:
        """Validate question_type is one of the allowed values."""
        if v and v not in ['mcq', 'fr', 'short_answer', 'true_false', '']:
            raise ValueError(f"question_type must be one of: mcq, fr, short_answer, true_false (got '{v}')")
        return v
    
    @field_validator('blooms_taxonomy')
    @classmethod
    def validate_blooms_taxonomy(cls, v: str) -> str:
        """Validate blooms_taxonomy is one of the allowed values."""
        valid_levels = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating', '']
        if v and v not in valid_levels:
            raise ValueError(f"blooms_taxonomy must be one of: {', '.join(valid_levels[:-1])} (got '{v}')")
        return v


class QuestionUpdate(BaseModel):
    """Schema for updating a question."""
    text: Optional[str] = None
    tags: Optional[str] = None
    keywords: Optional[str] = None
    course: Optional[str] = None
    course_type: Optional[str] = None
    question_type: Optional[str] = None
    blooms_taxonomy: Optional[str] = None
    image_url: Optional[str] = None
    answer_choices: Optional[str] = None
    correct_answer: Optional[str] = None
    source_pdf: Optional[str] = None
    is_verified: Optional[bool] = None
    
    @field_validator('question_type')
    @classmethod
    def validate_question_type(cls, v: Optional[str]) -> Optional[str]:
        """Validate question_type is one of the allowed values."""
        if v and v not in ['mcq', 'fr', 'short_answer', 'true_false', '']:
            raise ValueError(f"question_type must be one of: mcq, fr, short_answer, true_false (got '{v}')")
        return v
    
    @field_validator('blooms_taxonomy')
    @classmethod
    def validate_blooms_taxonomy(cls, v: Optional[str]) -> Optional[str]:
        """Validate blooms_taxonomy is one of the allowed values."""
        valid_levels = ['Remembering', 'Understanding', 'Applying', 'Analyzing', 'Evaluating', 'Creating', '']
        if v and v not in valid_levels:
            raise ValueError(f"blooms_taxonomy must be one of: {', '.join(valid_levels[:-1])} (got '{v}')")
        return v



class QuestionResponse(BaseModel):
    """Schema for question response."""
    id: int
    text: str
    tags: str
    keywords: str
    course: str
    course_type: str
    question_type: str
    blooms_taxonomy: str
    image_url: Optional[str]
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
