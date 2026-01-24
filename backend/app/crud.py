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


def update_question(session: Session, question_id: int, text: Optional[str] = None, 
                   tags: Optional[str] = None, keywords: Optional[str] = None, 
                   source_pdf: Optional[str] = None) -> Optional[Question]:
    """Update an existing question in the database."""
    question = session.get(Question, question_id)
    if not question:
        return None
    
    if text is not None:
        question.text = text
    if tags is not None:
        question.tags = tags
    if keywords is not None:
        question.keywords = keywords
    if source_pdf is not None:
        question.source_pdf = source_pdf
    
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def delete_question(session: Session, question_id: int) -> bool:
    """Delete a question from the database."""
    question = session.get(Question, question_id)
    if not question:
        return False
    
    session.delete(question)
    session.commit()
    return True
