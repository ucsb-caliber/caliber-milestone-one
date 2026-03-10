from datetime import datetime
import json
from typing import List, Optional

from sqlmodel import Session, func, select

from .models import Question


def generate_unique_question_qid(session: Session) -> str:
    """Generate a unique question QID in numeric format: Q########."""
    # Prefer continuing from the highest existing numeric QID.
    max_numeric_qid = session.exec(
        select(func.max(Question.qid)).where(Question.qid.op("~")(r"^Q[0-9]{8}$"))
    ).one()

    next_number = int(max_numeric_qid[1:]) + 1 if max_numeric_qid else 1

    while True:
        candidate = f"Q{next_number:08d}"
        existing = session.exec(select(Question).where(Question.qid == candidate)).first()
        if not existing:
            return candidate
        next_number += 1


def create_question(session: Session, text: str, title: str, tags: str, keywords: str, user_id: str, 
                   school: str = "", user_school: str = "", course: str = "", course_type: str = "",
                   question_type: str = "", blooms_taxonomy: str = "",
                   answer_choices: str = "[]", correct_answer: str = "",
                   pdf_url: Optional[str] = None, source_pdf: Optional[str] = None,
                   image_url: Optional[str] = None, is_verified: bool = False) -> Question:
    """Create and persist a new question, optionally marking it as verified."""
    question = Question(
        qid=generate_unique_question_qid(session),
        title=title,
        text=text,
        tags=tags,
        keywords=keywords,
        school=school,
        user_school=user_school,
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


def get_questions_by_ids(session: Session, question_ids: List[int]) -> List[Question]:
    """Get multiple questions by their IDs in a single query."""
    if not question_ids:
        return []
    statement = select(Question).where(Question.id.in_(question_ids))
    questions = list(session.exec(statement).all())
    # Return in the same order as the input IDs
    id_to_question = {q.id: q for q in questions}
    return [id_to_question[qid] for qid in question_ids if qid in id_to_question]


def update_question(session: Session, question_id: int, user_id: str, title: Optional[str] = None,
                   text: Optional[str] = None, tags: Optional[str] = None, keywords: Optional[str] = None, 
                   school: Optional[str] = None, user_school: Optional[str] = None, course: Optional[str] = None,
                   course_type: Optional[str] = None, question_type: Optional[str] = None,
                   blooms_taxonomy: Optional[str] = None, answer_choices: Optional[str] = None, 
                   correct_answer: Optional[str] = None, pdf_url: Optional[str] = None,
                   source_pdf: Optional[str] = None, image_url: Optional[str] = None,
                   is_verified: Optional[bool] = None) -> Optional[Question]:
    """Update an existing question in the database. Only the owner can update."""
    question = session.get(Question, question_id)
    if not question or question.user_id != user_id:
        return None
    
    if title is not None:
        question.title = title
    if text is not None:
        question.text = text
    if tags is not None:
        question.tags = tags
    if keywords is not None:
        question.keywords = keywords
    if school is not None:
        question.school = school
    if user_school is not None:
        question.user_school = user_school
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


def delete_unverified_questions_by_source(session: Session, user_id: str, source_pdf: str) -> int:
    """Delete all unverified questions for a user/source_pdf pair."""
    if not source_pdf:
        return 0

    questions = list(session.exec(
        select(Question).where(
            Question.user_id == user_id,
            Question.source_pdf == source_pdf,
            Question.is_verified == False  # noqa: E712
        )
    ).all())

    if not questions:
        return 0

    for question in questions:
        session.delete(question)
    session.commit()
    return len(questions)


def create_assignment_progress_rows(session: Session, assignment_id: int, student_ids: List[str]) -> None:
    """Ensure assignment progress rows exist for the provided students."""
    from .models import AssignmentProgress

    for student_id in student_ids:
        existing = session.exec(
            select(AssignmentProgress).where(
                AssignmentProgress.assignment_id == assignment_id,
                AssignmentProgress.student_id == student_id
            )
        ).first()
        if existing:
            continue
        session.add(AssignmentProgress(
            assignment_id=assignment_id,
            student_id=student_id,
            answers="{}",
            current_question_index=0,
            submitted=False
        ))
    session.commit()


def get_assignment_progress(session: Session, assignment_id: int, student_id: str):
    """Get progress row for an assignment/student pair."""
    from .models import AssignmentProgress
    return session.exec(
        select(AssignmentProgress).where(
            AssignmentProgress.assignment_id == assignment_id,
            AssignmentProgress.student_id == student_id
        )
    ).first()


def list_assignment_progress_for_students(session: Session, assignment_id: int, student_ids: List[str]):
    """Get progress rows for an assignment filtered to student IDs."""
    from .models import AssignmentProgress

    if not student_ids:
        return []

    return list(session.exec(
        select(AssignmentProgress).where(
            AssignmentProgress.assignment_id == assignment_id,
            AssignmentProgress.student_id.in_(student_ids)
        )
    ).all())


def upsert_assignment_progress(
    session: Session,
    assignment_id: int,
    student_id: str,
    answers: Optional[dict] = None,
    current_question_index: Optional[int] = None,
    submitted: Optional[bool] = None
):
    """Create/update assignment progress for a student."""
    from .models import AssignmentProgress

    progress = get_assignment_progress(session, assignment_id, student_id)
    if not progress:
        progress = AssignmentProgress(
            assignment_id=assignment_id,
            student_id=student_id,
            answers="{}",
            current_question_index=0,
            submitted=False
        )
        session.add(progress)
        session.commit()
        session.refresh(progress)

    if answers is not None:
        progress.answers = json.dumps(answers)
    if current_question_index is not None:
        progress.current_question_index = max(0, current_question_index)
    if submitted is not None:
        progress.submitted = submitted
        if submitted:
            progress.submitted_at = datetime.utcnow()

    progress.updated_at = datetime.utcnow()
    session.add(progress)
    session.commit()
    session.refresh(progress)
    return progress


def update_assignment_grading(
    session: Session,
    assignment_id: int,
    student_id: str,
    *,
    grading_data: dict,
    grade_submitted: Optional[bool] = None,
    score_earned: Optional[float] = None,
    score_total: Optional[float] = None,
):
    """Create/update persisted grading state for an assignment/student pair."""
    from .models import AssignmentProgress

    progress = get_assignment_progress(session, assignment_id, student_id)
    if not progress:
        progress = AssignmentProgress(
            assignment_id=assignment_id,
            student_id=student_id,
            answers="{}",
            grading_data="{}",
            current_question_index=0,
            submitted=False,
        )
        session.add(progress)
        session.commit()
        session.refresh(progress)

    progress.grading_data = json.dumps(grading_data or {})
    if score_earned is not None:
        progress.score_earned = float(score_earned)
    if score_total is not None:
        progress.score_total = float(score_total)
    if grade_submitted is not None:
        progress.grade_submitted = bool(grade_submitted)
        progress.grade_submitted_at = datetime.utcnow() if grade_submitted else None

    progress.updated_at = datetime.utcnow()
    session.add(progress)
    session.commit()
    session.refresh(progress)
    return progress


def get_course_assignments(session: Session, course_id: int) -> List['Assignment']:
    """Get list of assignments for a course."""
    from .models import Assignment
    
    statement = select(Assignment).where(Assignment.course_id == course_id)
    return list(session.exec(statement).all())


# Assignment CRUD operations

def create_assignment(session: Session, course_id: int, instructor_id: str,
                     title: str, type: str = "Other", description: str = "",
                     node_id: Optional[str] = None, release_date: Optional[datetime] = None,
                     due_date_soft: Optional[datetime] = None, due_date_hard: Optional[datetime] = None,
                     late_policy_id: Optional[str] = None, assignment_questions: Optional[List[int]] = None,
                     course_name: Optional[str] = None,
                     student_ids: Optional[List[str]] = None) -> 'Assignment':
    """Create a new assignment for a course."""
    from .models import Assignment
    
    if assignment_questions is None:
        assignment_questions = []
    
    # Course metadata always comes from roster payload in roster-managed mode.
    resolved_course_name = (course_name or "").strip()
    
    assignment = Assignment(
        course_id=course_id,
        instructor_id=instructor_id,
        course=resolved_course_name or "",
        title=title,
        type=type,
        description=description,
        node_id=node_id,
        release_date=release_date,
        due_date_soft=due_date_soft,
        due_date_hard=due_date_hard,
        late_policy_id=late_policy_id,
        assignment_questions=json.dumps(assignment_questions)
    )
    session.add(assignment)
    session.commit()
    session.refresh(assignment)

    # Initialize progress rows for currently enrolled students.
    if student_ids:
        create_assignment_progress_rows(session, assignment.id, student_ids)

    return assignment


def get_assignment(session: Session, assignment_id: int, instructor_id: Optional[str] = None) -> Optional['Assignment']:
    """Get an assignment by ID. Optionally filter by instructor_id."""
    from .models import Assignment
    
    assignment = session.get(Assignment, assignment_id)
    if assignment and instructor_id and assignment.instructor_id != instructor_id:
        return None
    return assignment


def get_assignments(session: Session, course_id: Optional[int] = None,
                   instructor_id: Optional[str] = None,
                   skip: int = 0, limit: int = 100) -> List['Assignment']:
    """Get list of assignments. Optionally filter by course_id or instructor_id."""
    from .models import Assignment
    
    statement = select(Assignment)
    if course_id:
        statement = statement.where(Assignment.course_id == course_id)
    if instructor_id:
        statement = statement.where(Assignment.instructor_id == instructor_id)
    statement = statement.offset(skip).limit(limit)
    return list(session.exec(statement).all())


def update_assignment(session: Session, assignment_id: int, instructor_id: str,
                     title: Optional[str] = None, type: Optional[str] = None,
                     description: Optional[str] = None, node_id: Optional[str] = None,
                     release_date: Optional[datetime] = None, due_date_soft: Optional[datetime] = None,
                     due_date_hard: Optional[datetime] = None, late_policy_id: Optional[str] = None,
                     assignment_questions: Optional[List[int]] = None) -> Optional['Assignment']:
    """Update an existing assignment. Only the instructor can update."""
    from .models import Assignment
    import json
    
    assignment = session.get(Assignment, assignment_id)
    if not assignment or assignment.instructor_id != instructor_id:
        return None
    
    if title is not None:
        trimmed_title = title.strip()
        if trimmed_title:
            assignment.title = trimmed_title
    if type is not None:
        assignment.type = type
    if description is not None:
        assignment.description = description
    if node_id is not None:
        assignment.node_id = node_id
    if release_date is not None:
        assignment.release_date = release_date
    if due_date_soft is not None:
        assignment.due_date_soft = due_date_soft
    if due_date_hard is not None:
        assignment.due_date_hard = due_date_hard
    if late_policy_id is not None:
        assignment.late_policy_id = late_policy_id
    if assignment_questions is not None:
        assignment.assignment_questions = json.dumps(assignment_questions)
    
    assignment.updated_at = datetime.utcnow()
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment


def delete_assignment(session: Session, assignment_id: int, instructor_id: str) -> bool:
    """Delete an assignment. Only the instructor can delete."""
    from .models import Assignment, AssignmentProgress
    
    assignment = session.get(Assignment, assignment_id)
    if not assignment or assignment.instructor_id != instructor_id:
        return False

    progress_rows = session.exec(
        select(AssignmentProgress).where(AssignmentProgress.assignment_id == assignment_id)
    ).all()
    for row in progress_rows:
        session.delete(row)
    
    session.delete(assignment)
    session.commit()
    return True
