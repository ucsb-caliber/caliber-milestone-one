from sqlmodel import Session, select, func
from typing import List, Optional
from datetime import datetime
import re
import secrets
import string
import json
from .models import Question, User


def create_question(session: Session, text: str, title: str, tags: str, keywords: str, user_id: str, 
                   school: str = "", course: str = "", course_type: str = "",
                   question_type: str = "", blooms_taxonomy: str = "",
                   answer_choices: str = "[]", correct_answer: str = "",
                   pdf_url: Optional[str] = None, source_pdf: Optional[str] = None,
                   image_url: Optional[str] = None, is_verified: bool = False) -> Question:
    """Create and persist a new question, optionally marking it as verified."""
    question = Question(
        title=title,
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
        user = User(user_id=user_id, email=email, admin=False, teacher=False, pending=False)
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
                      teacher: Optional[bool] = None, pending: Optional[bool] = None) -> Optional[User]:
    """Update user admin/teacher/pending status."""
    user = get_user_by_user_id(session, user_id)
    if not user:
        return None
    
    if admin is not None:
        user.admin = admin
    if teacher is not None:
        user.teacher = teacher
    if pending is not None:
        user.pending = pending
    if teacher is True:
        user.pending = False
    if pending is True:
        user.teacher = False
    
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user_profile(session: Session, user_id: str, first_name: Optional[str] = None,
                       last_name: Optional[str] = None, teacher: Optional[bool] = None,
                       pending: Optional[bool] = None) -> Optional[User]:
    """Update user profile information (first/last name, teacher status, pending status)."""
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
    if pending is not None:
        user.pending = pending
    if teacher is True:
        user.pending = False
    if pending is True:
        user.teacher = False
    
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


# Course CRUD operations

def _build_course_code_base(course_name: str) -> str:
    base = re.sub(r"\s+", "", (course_name or "").strip())
    base = re.sub(r"[^A-Za-z0-9]", "", base)
    return (base[:16] or "COURSE").upper()


def _generate_course_code(base: str) -> str:
    suffix = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    return f"{base}_{suffix}"


def generate_unique_course_code(session: Session, course_name: str) -> str:
    """Generate a unique course code: CourseNameWithoutSpaces_RANDOM6."""
    from .models import Course

    base = _build_course_code_base(course_name)
    while True:
        candidate = _generate_course_code(base)
        existing = session.exec(select(Course).where(Course.course_code == candidate)).first()
        if not existing:
            return candidate

def create_course(session: Session, course_name: str, instructor_id: str, 
                 school_name: str = "", student_ids: Optional[List[str]] = None) -> 'Course':
    """Create a new course with optional students."""
    from .models import Course, CourseStudent
    
    if student_ids is None:
        student_ids = []
    
    course = Course(
        course_name=course_name,
        course_code=generate_unique_course_code(session, course_name),
        school_name=school_name,
        instructor_id=instructor_id
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    
    # Add students to the course
    for student_id in student_ids:
        course_student = CourseStudent(course_id=course.id, student_id=student_id)
        session.add(course_student)
    
    session.commit()
    session.refresh(course)
    return course


def get_course(session: Session, course_id: int, instructor_id: Optional[str] = None) -> Optional['Course']:
    """Get a course by ID. Optionally filter by instructor_id."""
    from .models import Course
    
    course = session.get(Course, course_id)
    if course and instructor_id and course.instructor_id != instructor_id:
        return None
    return course


def get_course_by_code(session: Session, course_code: str) -> Optional['Course']:
    """Get a course by its course code."""
    from .models import Course

    normalized = (course_code or "").strip().upper()
    statement = select(Course).where(Course.course_code == normalized)
    return session.exec(statement).first()


def get_courses(session: Session, instructor_id: Optional[str] = None, 
               skip: int = 0, limit: int = 100) -> List['Course']:
    """Get list of courses. Optionally filter by instructor_id."""
    from .models import Course
    
    statement = select(Course)
    if instructor_id:
        statement = statement.where(Course.instructor_id == instructor_id)
    statement = statement.offset(skip).limit(limit)
    return list(session.exec(statement).all())


def get_courses_count(session: Session, instructor_id: Optional[str] = None) -> int:
    """Get total count of courses with optional filters."""
    from .models import Course
    
    statement = select(func.count(Course.id))
    if instructor_id:
        statement = statement.where(Course.instructor_id == instructor_id)
    return session.exec(statement).one()


def get_all_courses(session: Session, skip: int = 0, limit: int = 100) -> List['Course']:
    """Get all courses in the system."""
    from .models import Course

    statement = select(Course).offset(skip).limit(limit)
    return list(session.exec(statement).all())


def get_all_courses_count(session: Session) -> int:
    """Get total count of all courses."""
    from .models import Course

    statement = select(func.count(Course.id))
    return session.exec(statement).one()


def get_course_students(session: Session, course_id: int) -> List[str]:
    """Get list of student IDs enrolled in a course."""
    from .models import CourseStudent
    
    statement = select(CourseStudent.student_id).where(CourseStudent.course_id == course_id)
    return list(session.exec(statement).all())


def enroll_student_in_course(session: Session, course_id: int, student_id: str) -> bool:
    """Enroll a student into a course. Returns True if added, False if already enrolled."""
    from .models import CourseStudent

    existing = session.exec(
        select(CourseStudent).where(
            CourseStudent.course_id == course_id,
            CourseStudent.student_id == student_id
        )
    ).first()
    if existing:
        return False

    enrollment = CourseStudent(course_id=course_id, student_id=student_id)
    session.add(enrollment)
    session.commit()
    create_assignment_progress_for_student_in_course(session, course_id, student_id)
    return True


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


def create_assignment_progress_for_student_in_course(session: Session, course_id: int, student_id: str) -> None:
    """Ensure a student has progress rows for all assignments in a course."""
    from .models import Assignment

    assignments = list(session.exec(select(Assignment.id).where(Assignment.course_id == course_id)).all())
    if not assignments:
        return
    for assignment_id in assignments:
        create_assignment_progress_rows(session, assignment_id, [student_id])


def get_assignment_progress(session: Session, assignment_id: int, student_id: str):
    """Get progress row for an assignment/student pair."""
    from .models import AssignmentProgress
    return session.exec(
        select(AssignmentProgress).where(
            AssignmentProgress.assignment_id == assignment_id,
            AssignmentProgress.student_id == student_id
        )
    ).first()


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


def get_course_assignments(session: Session, course_id: int) -> List['Assignment']:
    """Get list of assignments for a course."""
    from .models import Assignment
    
    statement = select(Assignment).where(Assignment.course_id == course_id)
    return list(session.exec(statement).all())


def update_course(session: Session, course_id: int, instructor_id: str,
                 course_name: Optional[str] = None, school_name: Optional[str] = None,
                 student_ids: Optional[List[str]] = None) -> Optional['Course']:
    """Update an existing course. Only the instructor can update."""
    from .models import Course, CourseStudent
    
    course = session.get(Course, course_id)
    if not course or course.instructor_id != instructor_id:
        return None
    
    if course_name is not None:
        trimmed_course_name = course_name.strip()
        if trimmed_course_name:
            course.course_name = trimmed_course_name
    if school_name is not None:
        course.school_name = school_name
    
    # Update students if provided
    if student_ids is not None:
        existing_statement = select(CourseStudent.student_id).where(CourseStudent.course_id == course_id)
        existing_student_ids = set(session.exec(existing_statement).all())

        # Remove existing students
        statement = select(CourseStudent).where(CourseStudent.course_id == course_id)
        existing_enrollments = session.exec(statement).all()
        for enrollment in existing_enrollments:
            session.delete(enrollment)
        
        # Add new students
        enrolled_student_ids = set()
        for student_id in student_ids:
            # Validate that the user exists and is not a teacher before creating association
            user = get_user_by_user_id(session, student_id)
            if not user:
                continue
            if user.teacher:
                continue
            course_student = CourseStudent(course_id=course_id, student_id=student_id)
            session.add(course_student)
            enrolled_student_ids.add(student_id)

        added_students = enrolled_student_ids - existing_student_ids
        for student_id in added_students:
            create_assignment_progress_for_student_in_course(session, course_id, student_id)
    
    course.updated_at = datetime.utcnow()
    session.add(course)
    session.commit()
    session.refresh(course)
    return course


def delete_course(session: Session, course_id: int, instructor_id: str) -> bool:
    """Delete a course. Only the instructor can delete."""
    from .models import Course, CourseStudent, Assignment
    
    course = session.get(Course, course_id)
    if not course or course.instructor_id != instructor_id:
        return False
    
    # Delete associated students
    statement = select(CourseStudent).where(CourseStudent.course_id == course_id)
    enrollments = session.exec(statement).all()
    for enrollment in enrollments:
        session.delete(enrollment)
    
    # Delete associated assignments
    statement = select(Assignment).where(Assignment.course_id == course_id)
    assignments = session.exec(statement).all()
    for assignment in assignments:
        session.delete(assignment)
    
    # Delete the course
    session.delete(course)
    session.commit()
    return True


# Assignment CRUD operations

def create_assignment(session: Session, course_id: int, instructor_id: str, instructor_email: str,
                     title: str, type: str = "Other", description: str = "",
                     node_id: Optional[str] = None, release_date: Optional[datetime] = None,
                     due_date_soft: Optional[datetime] = None, due_date_hard: Optional[datetime] = None,
                     late_policy_id: Optional[str] = None, assignment_questions: Optional[List[int]] = None) -> 'Assignment':
    """Create a new assignment for a course."""
    from .models import Assignment
    
    if assignment_questions is None:
        assignment_questions = []
    
    # Get course name for the 'course' field
    course = get_course(session, course_id)
    course_name = course.course_name if course else ""
    
    assignment = Assignment(
        course_id=course_id,
        instructor_id=instructor_id,
        instructor_email=instructor_email,
        course=course_name,
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

    # Initialize progress rows for currently enrolled students
    student_ids = get_course_students(session, course_id)
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
