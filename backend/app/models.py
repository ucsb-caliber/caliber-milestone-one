from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field


class Question(SQLModel, table=True):
    """Question model stored in the database."""
    id: Optional[int] = Field(default=None, primary_key=True)
    text: str = Field(index=True)
    tags: str = Field(default="")  # Stored as comma-separated string
    keywords: str = Field(default="")  # Stored as comma-separated string
    source_pdf: Optional[str] = Field(default=None)  # Original PDF filename
    user_id: str = Field(index=True)  # Supabase user ID
    created_at: datetime = Field(default_factory=datetime.utcnow)
