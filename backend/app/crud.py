from sqlmodel import Session, select
from typing import List, Optional
from .models import Question


def create_question(session: Session, text: str, tags: str, keywords: str, source_pdf: Optional[str] = None) -> Question:
    """Create a new question in the database."""
    question = Question(
        text=text,
        tags=tags,
        keywords=keywords,
        source_pdf=source_pdf
    )
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def get_question(session: Session, question_id: int) -> Optional[Question]:
    """Get a question by ID."""
    return session.get(Question, question_id)


def get_questions(session: Session, skip: int = 0, limit: int = 100) -> List[Question]:
    """Get a list of questions."""
    statement = select(Question).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def get_questions_count(session: Session) -> int:
    """Get total count of questions."""
    statement = select(Question)
    return len(list(session.exec(statement).all()))
