from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime
from .models import Question, User


def create_question(session: Session, text: str, tags: str, keywords: str, user_id: str, 
                   course: str = "", answer_choices: str = "[]", correct_answer: str = "",
                   source_pdf: Optional[str] = None, is_verified: bool = False) -> Question:
    """Create a new question in the database. Default verified status is False."""
    question = Question(
        text=text,
        tags=tags,
        keywords=keywords,
        course=course,
        answer_choices=answer_choices,
        correct_answer=correct_answer,
        source_pdf=source_pdf,
        user_id=user_id
        is_verified=is_verified
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


def get_all_questions(session: Session, skip: int = 0, limit: int = 100) -> List[Question]:
    """Get all questions from all users."""
    statement = select(Question).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def update_question(session: Session, question_id: int, user_id: str, text: Optional[str] = None, 
                   tags: Optional[str] = None, keywords: Optional[str] = None, 
                   course: Optional[str] = None, answer_choices: Optional[str] = None, 
                   correct_answer: Optional[str] = None, source_pdf: Optional[str] = None) -> Optional[Question]:
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
    if course is not None:
        question.course = course
    if answer_choices is not None:
        question.answer_choices = answer_choices
    if correct_answer is not None:
        question.correct_answer = correct_answer
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


# User CRUD operations

def get_or_create_user(session: Session, user_id: str) -> User:
    """Get a user by user_id or create if it doesn't exist."""
    statement = select(User).where(User.user_id == user_id)
    user = session.exec(statement).first()
    
    if not user:
        user = User(user_id=user_id, admin=False, teacher=False)
        session.add(user)
        session.commit()
        session.refresh(user)
    
    return user


def get_user_by_user_id(session: Session, user_id: str) -> Optional[User]:
    """Get a user by their Supabase user_id."""
    statement = select(User).where(User.user_id == user_id)
    return session.exec(statement).first()


def update_user_roles(session: Session, user_id: str, admin: Optional[bool] = None, 
                      teacher: Optional[bool] = None) -> Optional[User]:
    """Update user admin/teacher status."""
    user = get_user_by_user_id(session, user_id)
    if not user:
        return None
    
    if admin is not None:
        user.admin = admin
    if teacher is not None:
        user.teacher = teacher
    
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

