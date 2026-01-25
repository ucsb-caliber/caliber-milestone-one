from sqlmodel import Session, select
from typing import List, Optional
from .models import Question


def create_question(session: Session, text: str, tags: str, keywords: str, user_id: str, source_pdf: Optional[str] = None) -> Question:
    """Create a new question in the database."""
    question = Question(
        text=text,
        tags=tags,
        keywords=keywords,
        source_pdf=source_pdf,
        user_id=user_id
    )
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def get_question(session: Session, question_id: int, user_id: Optional[str] = None) -> Optional[Question]:
    """Get a question by ID. Optionally filter by user_id."""
    question = session.get(Question, question_id)
    if question and user_id and question.user_id != user_id:
        return None
    return question


def get_questions(session: Session, user_id: Optional[str] = None, skip: int = 0, limit: int = 100) -> List[Question]:
    """Get a list of questions. Optionally filter by user_id."""
    statement = select(Question)
    if user_id:
        statement = statement.where(Question.user_id == user_id)
    statement = statement.offset(skip).limit(limit)
    return list(session.exec(statement).all())


def get_questions_count(session: Session, user_id: Optional[str] = None) -> int:
    """Get total count of questions. Optionally filter by user_id."""
    statement = select(Question)
    if user_id:
        statement = statement.where(Question.user_id == user_id)
    return len(list(session.exec(statement).all()))


def update_question(session: Session, question_id: int, user_id: str, text: Optional[str] = None, 
                   tags: Optional[str] = None, keywords: Optional[str] = None, 
                   source_pdf: Optional[str] = None) -> Optional[Question]:
    """Update an existing question in the database. Only the owner can update."""
    question = session.get(Question, question_id)
    if not question or question.user_id != user_id:
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


def delete_question(session: Session, question_id: int, user_id: str) -> bool:
    """Delete a question from the database. Only the owner can delete."""
    question = session.get(Question, question_id)
    if not question or question.user_id != user_id:
        return False
    
    session.delete(question)
    session.commit()
    return True
