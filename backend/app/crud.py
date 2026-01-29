from sqlmodel import Session, select, func
from typing import List, Optional
from datetime import datetime
from .models import Question, User


def create_question(session: Session, text: str, tags: str, keywords: str, user_id: str, 
                   school: str = "", course: str = "", course_type: str = "",
                   question_type: str = "", blooms_taxonomy: str = "",
                   answer_choices: str = "[]", correct_answer: str = "",
                   pdf_url: Optional[str] = None, source_pdf: Optional[str] = None,
                   image_url: Optional[str] = None, is_verified: bool = False) -> Question:
    """Create and persist a new question, optionally marking it as verified."""
    question = Question(
        text=text,
        tags=tags,
        keywords=keywords,
        school=school,
        course=course,
        course_type=course_type,
        question_type=question_type,
        blooms_taxonomy=blooms_taxonomy,
        answer_choices=answer_choices,
        correct_answer=correct_answer,
        pdf_url=pdf_url,
        source_pdf=source_pdf,
        image_url=image_url,
        user_id=user_id,
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


def get_questions(session: Session, user_id: Optional[str] = None, 
                  verified_only: Optional[bool] = None, 
                  source_pdf: Optional[str] = None,
                  skip: int = 0, limit: int = 100) -> List[Question]:
    statement = select(Question)
    if user_id:
        statement = statement.where(Question.user_id == user_id)
    
    # Allows the frontend to ask for "just the drafts"
    if verified_only is not None:
        statement = statement.where(Question.is_verified == verified_only)
    
    # Allows the frontend to find questions from a specific upload
    if source_pdf:
        statement = statement.where(Question.source_pdf == source_pdf)
        
    statement = statement.offset(skip).limit(limit)
    return list(session.exec(statement).all())


def get_questions_count(session: Session, user_id: Optional[str] = None,
                       verified_only: Optional[bool] = None,
                       source_pdf: Optional[str] = None) -> int:
    """Get total count of questions with optional filters."""
    statement = select(func.count(Question.id))
    if user_id:
        statement = statement.where(Question.user_id == user_id)
    if verified_only is not None:
        statement = statement.where(Question.is_verified == verified_only)
    if source_pdf:
        statement = statement.where(Question.source_pdf == source_pdf)
    return session.exec(statement).one()


def get_all_questions(session: Session, skip: int = 0, limit: int = 100) -> List[Question]:
    """Get all questions from all users."""
    statement = select(Question).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def update_question(session: Session, question_id: int, user_id: str, text: Optional[str] = None, 
                   tags: Optional[str] = None, keywords: Optional[str] = None, 
                   school: Optional[str] = None, course: Optional[str] = None,
                   course_type: Optional[str] = None, question_type: Optional[str] = None,
                   blooms_taxonomy: Optional[str] = None, answer_choices: Optional[str] = None, 
                   correct_answer: Optional[str] = None, pdf_url: Optional[str] = None,
                   source_pdf: Optional[str] = None, image_url: Optional[str] = None,
                   is_verified: Optional[bool] = None) -> Optional[Question]:
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
    if school is not None:
        question.school = school
    if course is not None:
        question.course = course
    if course_type is not None:
        question.course_type = course_type
    if question_type is not None:
        question.question_type = question_type
    if blooms_taxonomy is not None:
        question.blooms_taxonomy = blooms_taxonomy
    if answer_choices is not None:
        question.answer_choices = answer_choices
    if correct_answer is not None:
        question.correct_answer = correct_answer
    if pdf_url is not None:
        question.pdf_url = pdf_url
    if source_pdf is not None:
        question.source_pdf = source_pdf
    if image_url is not None:
        question.image_url = image_url
    if is_verified is not None:
        question.is_verified = is_verified # question becomes verified
    
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

def get_or_create_user(session: Session, user_id: str, email: Optional[str] = None) -> User:
    """Get a user by user_id or create if it doesn't exist. Updates email if provided."""
    statement = select(User).where(User.user_id == user_id)
    user = session.exec(statement).first()
    
    if not user:
        user = User(user_id=user_id, email=email, admin=False, teacher=False)
        session.add(user)
        session.commit()
        session.refresh(user)
    else:
        # Update email if provided and different
        if email and user.email != email:
            user.email = email
            user.updated_at = datetime.utcnow()
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


def update_user_profile(session: Session, user_id: str, first_name: Optional[str] = None,
                       last_name: Optional[str] = None, teacher: Optional[bool] = None) -> Optional[User]:
    """Update user profile information (first/last name and teacher status)."""
    user = get_user_by_user_id(session, user_id)
    if not user:
        return None
    
    if first_name is not None:
        # Strip whitespace and validate
        first_name = first_name.strip()
        if first_name:  # Only update if not empty after stripping
            user.first_name = first_name
    if last_name is not None:
        # Strip whitespace and validate
        last_name = last_name.strip()
        if last_name:  # Only update if not empty after stripping
            user.last_name = last_name
    if teacher is not None:
        user.teacher = teacher
    
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user_preferences(session: Session, user_id: str, icon_shape: Optional[str] = None,
                           icon_color: Optional[str] = None, initials: Optional[str] = None) -> Optional[User]:
    """Update user profile preferences (icon shape, color, and initials)."""
    user = get_user_by_user_id(session, user_id)
    if not user:
        return None
    
    if icon_shape is not None:
        user.icon_shape = icon_shape
    if icon_color is not None:
        user.icon_color = icon_color
    if initials is not None:
        # Allow empty string to reset initials
        user.initials = initials.strip() if initials else None
    
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

