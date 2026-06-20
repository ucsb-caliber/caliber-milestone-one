from datetime import datetime
import json
from typing import List, Optional

from sqlmodel import Session, delete, func, select
from sqlalchemy import and_, or_

from .models import AssignmentIntegrityEvent, CodingQuestionPrivate, CodingRun, Question
from .question_content import QuestionContent, question_content_from_question, question_content_hash, question_content_to_json


def _student_safe_content_payload(question: Question) -> tuple[QuestionContent, dict]:
    content = question_content_from_question(question)
    payload = content.model_dump(mode="json", exclude_none=True)
    payload.pop("randomization", None)
    for part in payload.get("parts", []):
        if not isinstance(part, dict):
            continue
        part.pop("correct_answer", None)
        coding = part.get("coding")
        tests = coding.get("tests") if isinstance(coding, dict) else None
        if not isinstance(tests, list):
            continue
        for test in tests:
            if isinstance(test, dict) and test.get("visibility") == "hidden":
                test.pop("input", None)
                test.pop("expected_output", None)
                test.pop("harness", None)
    return content, payload


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
                   image_url: Optional[str] = None, is_verified: bool = False,
                   qid: Optional[str] = None, version: int = 1,
                   content: Optional[QuestionContent] = None,
                   draft_state: Optional[str] = None, visibility: str = "private",
                   origin: str = "manual", owner_user_id: Optional[str] = None,
                   school_scope: str = "", course_scope: Optional[str] = None,
                   source_repo: Optional[str] = None, source_path: Optional[str] = None,
                   source_commit: Optional[str] = None,
                   reviewed_at: Optional[datetime] = None,
                   reviewed_by: Optional[str] = None) -> Question:
    """Create and persist a new question, optionally marking it as verified."""
    effective_qid = (qid or "").strip() or generate_unique_question_qid(session)
    effective_version = max(1, int(version or 1))
    existing = session.exec(select(Question).where(Question.qid == effective_qid, Question.version == effective_version)).first()
    if existing:
        raise ValueError(f"Question qid/version already exists: {effective_qid} v{effective_version}")

    content_json = question_content_to_json(content) if content else ""
    effective_draft_state = draft_state or ("ready" if is_verified else "draft")
    effective_owner = owner_user_id or user_id
    effective_school_scope = school_scope or user_school or school or ""
    question = Question(
        qid=effective_qid,
        version=effective_version,
        title=title,
        text=text,
        content=content_json,
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
        owner_user_id=effective_owner,
        draft_state=effective_draft_state,
        visibility=visibility,
        origin=origin,
        school_scope=effective_school_scope,
        course_scope=course_scope,
        source_repo=source_repo,
        source_path=source_path,
        source_commit=source_commit,
        content_hash=question_content_hash(content) if content else "",
        reviewed_at=reviewed_at,
        reviewed_by=reviewed_by,
        updated_at=datetime.utcnow(),
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


def get_draft_questions(session: Session, user_id: str, skip: int = 0, limit: int = 100) -> List[Question]:
    """Get unverified questions for the current user."""
    return get_questions(
        session,
        user_id=user_id,
        verified_only=False,
        skip=skip,
        limit=limit,
    )


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


def _visible_question_predicate(
    *,
    user_id: Optional[str],
    school_scope: Optional[str] = None,
    course_scope_ids: Optional[List[str]] = None,
):
    shared_predicates = [Question.visibility == "global"]
    if school_scope:
        shared_predicates.append(
            and_(
                Question.visibility == "school",
                Question.school_scope == school_scope,
            )
        )
    if course_scope_ids:
        shared_predicates.append(
            and_(
                Question.visibility == "course",
                Question.course_scope.in_(course_scope_ids),
            )
        )

    if user_id:
        return or_(
            Question.user_id == user_id,
            Question.owner_user_id == user_id,
            *shared_predicates,
        )
    return or_(*shared_predicates)


def get_all_questions(
    session: Session,
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[str] = None,
    school_scope: Optional[str] = None,
    course_scope_ids: Optional[List[str]] = None,
) -> List[Question]:
    """Get questions visible to the current user, not literally every private row."""
    statement = select(Question).where(Question.draft_state != "archived")
    statement = statement.where(_visible_question_predicate(user_id=user_id, school_scope=school_scope, course_scope_ids=course_scope_ids))
    statement = statement.order_by(Question.qid, Question.version.desc())
    rows = list(session.exec(statement).all())
    latest_by_qid: dict[str, Question] = {}
    for question in rows:
        if question.qid not in latest_by_qid:
            latest_by_qid[question.qid] = question
    return list(latest_by_qid.values())[skip:skip + limit]


def get_all_questions_count(
    session: Session,
    user_id: Optional[str] = None,
    school_scope: Optional[str] = None,
    course_scope_ids: Optional[List[str]] = None,
) -> int:
    """Count questions visible to the current user."""
    statement = select(Question.qid).where(Question.draft_state != "archived")
    statement = statement.where(_visible_question_predicate(user_id=user_id, school_scope=school_scope, course_scope_ids=course_scope_ids))
    qids = list(session.exec(statement).all())
    return len(set(qids))


def get_draft_questions_count(session: Session, user_id: str) -> int:
    """Count unverified questions for the current user."""
    return get_questions_count(session, user_id=user_id, verified_only=False)


def get_questions_by_ids(session: Session, question_ids: List[int]) -> List[Question]:
    """Get multiple questions by their IDs in a single query."""
    if not question_ids:
        return []
    statement = select(Question).where(Question.id.in_(question_ids))
    questions = list(session.exec(statement).all())
    # Return in the same order as the input IDs
    id_to_question = {q.id: q for q in questions}
    return [id_to_question[qid] for qid in question_ids if qid in id_to_question]


def build_assignment_question_refs(session: Session, question_ids: List[int]) -> list[dict]:
    """Build stable qid/version refs and snapshots for assignment question membership."""
    questions = get_questions_by_ids(session, question_ids)
    id_to_question = {q.id: q for q in questions}
    refs: list[dict] = []
    for position, question_id in enumerate(question_ids):
        question = id_to_question.get(question_id)
        if not question:
            refs.append({
                "id": question_id,
                "qid": None,
                "version": None,
                "position": position,
                "missing": True,
                "question_snapshot": None,
            })
            continue
        content, content_payload = _student_safe_content_payload(question)
        refs.append({
            "id": question.id,
            "qid": question.qid,
            "version": question.version,
            "position": position,
            "points_override": None,
            "question_snapshot": {
                "qid": question.qid,
                "version": question.version,
                "title": question.title,
                "text": content.stem or question.text or "",
                "content": content_payload,
                "question_type": question.question_type,
                "answer_choices": question.answer_choices,
                "correct_answer": "",
                "image_url": question.image_url,
            },
        })
    return refs


def update_question(session: Session, question_id: int, user_id: str, title: Optional[str] = None,
                   text: Optional[str] = None, tags: Optional[str] = None, keywords: Optional[str] = None, 
                   school: Optional[str] = None, user_school: Optional[str] = None, course: Optional[str] = None,
                   course_type: Optional[str] = None, question_type: Optional[str] = None,
                   blooms_taxonomy: Optional[str] = None, answer_choices: Optional[str] = None, 
                   correct_answer: Optional[str] = None, pdf_url: Optional[str] = None,
                   source_pdf: Optional[str] = None, image_url: Optional[str] = None,
                   is_verified: Optional[bool] = None, qid: Optional[str] = None,
                   version: Optional[int] = None, content: Optional[QuestionContent] = None,
                   draft_state: Optional[str] = None, visibility: Optional[str] = None,
                   origin: Optional[str] = None, owner_user_id: Optional[str] = None,
                   school_scope: Optional[str] = None, course_scope: Optional[str] = None,
                   source_repo: Optional[str] = None, source_path: Optional[str] = None,
                   source_commit: Optional[str] = None,
                   reviewed_at: Optional[datetime] = None,
                   reviewed_by: Optional[str] = None) -> Optional[Question]:
    """Update an existing question in the database. Only the owner can update."""
    question = session.get(Question, question_id)
    if not question or question.user_id != user_id:
        return None
    
    if title is not None:
        question.title = title
    if qid is not None:
        next_qid = qid.strip()
        if next_qid and next_qid != question.qid:
            existing = session.exec(select(Question).where(Question.qid == next_qid, Question.version == question.version)).first()
            if existing:
                raise ValueError(f"Question qid/version already exists: {next_qid} v{question.version}")
            question.qid = next_qid
    if version is not None:
        next_version = max(1, int(version))
        existing = session.exec(select(Question).where(Question.qid == question.qid, Question.version == next_version, Question.id != question.id)).first()
        if existing:
            raise ValueError(f"Question qid/version already exists: {question.qid} v{next_version}")
        question.version = next_version
    if text is not None:
        question.text = text
    if content is not None:
        question.content = question_content_to_json(content)
        question.content_hash = question_content_hash(content)
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
        if draft_state is None:
            question.draft_state = "ready" if is_verified else "draft"
        if is_verified and reviewed_at is None and question.reviewed_at is None:
            question.reviewed_at = datetime.utcnow()
        if is_verified and reviewed_by is None and not question.reviewed_by:
            question.reviewed_by = user_id
    if draft_state is not None:
        question.draft_state = draft_state
        if draft_state == "ready" and reviewed_at is None and question.reviewed_at is None:
            question.reviewed_at = datetime.utcnow()
        if draft_state == "ready" and reviewed_by is None and not question.reviewed_by:
            question.reviewed_by = user_id
    if visibility is not None:
        question.visibility = visibility
    if origin is not None:
        question.origin = origin
    if owner_user_id is not None:
        question.owner_user_id = owner_user_id
    if school_scope is not None:
        question.school_scope = school_scope
    if course_scope is not None:
        question.course_scope = course_scope
    if source_repo is not None:
        question.source_repo = source_repo
    if source_path is not None:
        question.source_path = source_path
    if source_commit is not None:
        question.source_commit = source_commit
    if reviewed_at is not None:
        question.reviewed_at = reviewed_at
    if reviewed_by is not None:
        question.reviewed_by = reviewed_by

    question.updated_at = datetime.utcnow()
    
    session.add(question)
    session.commit()
    session.refresh(question)
    return question


def get_coding_question_private(session: Session, question_id: int) -> Optional[CodingQuestionPrivate]:
    """Get private hidden-test config for a coding question."""
    return session.get(CodingQuestionPrivate, question_id)


def upsert_coding_question_private(session: Session, question_id: int, hidden_tests: str = "[]") -> CodingQuestionPrivate:
    """Create/update hidden tests for a coding question."""
    row = get_coding_question_private(session, question_id)
    if not row:
        row = CodingQuestionPrivate(question_id=question_id, hidden_tests=hidden_tests or "[]")
    else:
        row.hidden_tests = hidden_tests or "[]"
        row.updated_at = datetime.utcnow()

    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def create_coding_run(
    session: Session,
    *,
    assignment_id: Optional[int],
    question_id: int,
    student_id: str,
    language: str,
    source_code: str,
    status: str,
    verdict: str,
    compile_output: str,
    runtime_output: str,
    result_json: str,
    is_submit_run: bool,
) -> CodingRun:
    """Persist one coding execution attempt."""
    row = CodingRun(
        assignment_id=assignment_id,
        question_id=question_id,
        student_id=student_id,
        language=language,
        source_code=source_code,
        status=status,
        verdict=verdict,
        compile_output=compile_output,
        runtime_output=runtime_output,
        result_json=result_json,
        is_submit_run=is_submit_run,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_question(session: Session, question_id: int, user_id: str) -> bool:
    """Delete a question from the database. Only the owner can delete."""
    question = session.get(Question, question_id)
    if not question or question.user_id != user_id:
        return False

    private_row = session.get(CodingQuestionPrivate, question_id)
    if private_row:
        session.delete(private_row)
    coding_runs = session.exec(select(CodingRun).where(CodingRun.question_id == question_id)).all()
    for row in coding_runs:
        session.delete(row)
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
            question_time_ms="{}",
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


ALLOWED_INTEGRITY_EVENT_TYPES = {
    "paste",
    "copy",
    "cut",
    "visibility_hidden",
    "visibility_visible",
    "blur",
    "focus",
    "rapid_input",
    "large_delta",
    "navigation_jump",
    "submit",
}

INTEGRITY_METADATA_ALLOWLIST: dict[str, set[str]] = {
    "paste": {"paste_length", "answer_length_before"},
    "copy": {"selection_length"},
    "cut": {"selection_length"},
    "visibility_hidden": set(),
    "visibility_visible": set(),
    "blur": set(),
    "focus": set(),
    "rapid_input": {"delta_chars", "chars_per_second", "time_since_last_input_ms"},
    "large_delta": {"delta_chars", "answer_length_before", "answer_length_after", "time_since_last_input_ms"},
    "navigation_jump": {"from_index", "to_index", "question_count"},
    "submit": {"answered_count", "question_count"},
}


def _bounded_integrity_value(value):
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int):
        return max(-1_000_000, min(value, 1_000_000))
    if isinstance(value, float):
        return max(-1_000_000.0, min(value, 1_000_000.0))
    return None


def _sanitize_integrity_metadata(event_type: str, metadata: Optional[dict]) -> dict:
    """Keep only known numeric/boolean metadata for each event type."""
    if not isinstance(metadata, dict):
        return {}

    allowed_keys = INTEGRITY_METADATA_ALLOWLIST.get(event_type, set())
    sanitized: dict = {}
    for key in allowed_keys:
        cleaned = _bounded_integrity_value(metadata.get(key))
        if cleaned is not None:
            sanitized[key] = cleaned

    return sanitized


def create_assignment_integrity_events(
    session: Session,
    *,
    assignment_id: int,
    student_id: str,
    events: List[dict],
) -> List[AssignmentIntegrityEvent]:
    """Persist a batch of metadata-only integrity events."""
    rows: List[AssignmentIntegrityEvent] = []
    for event in events[:100]:
        event_type = str(event.get("event_type") or "").strip()[:64]
        if event_type not in ALLOWED_INTEGRITY_EVENT_TYPES:
            continue

        row = AssignmentIntegrityEvent(
            assignment_id=assignment_id,
            student_id=student_id,
            question_key=str(event.get("question_key") or "")[:128] or None,
            part_id=str(event.get("part_id") or "")[:128] or None,
            event_type=event_type,
            event_metadata=_sanitize_integrity_metadata(event_type, event.get("metadata")),
            client_created_at=event.get("client_created_at"),
        )
        session.add(row)
        rows.append(row)

    if rows:
        session.commit()
        for row in rows:
            session.refresh(row)

    return rows


def list_assignment_integrity_events(
    session: Session,
    *,
    assignment_id: int,
    student_ids: Optional[List[str]] = None,
    student_id: Optional[str] = None,
) -> List[AssignmentIntegrityEvent]:
    """List integrity events for an assignment, optionally filtered by student."""
    statement = select(AssignmentIntegrityEvent).where(
        AssignmentIntegrityEvent.assignment_id == assignment_id
    )
    if student_id:
        statement = statement.where(AssignmentIntegrityEvent.student_id == student_id)
    elif student_ids is not None:
        if not student_ids:
            return []
        statement = statement.where(AssignmentIntegrityEvent.student_id.in_(student_ids))
    return list(session.exec(statement.order_by(AssignmentIntegrityEvent.created_at.asc())).all())


def _metadata_number(metadata: dict, *keys: str) -> float:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        try:
            if value is not None:
                return float(str(value))
        except ValueError:
            continue
    return 0.0


def _risk_level(score: int) -> str:
    if score >= 8:
        return "high"
    if score >= 3:
        return "review"
    return "none"


def summarize_integrity_events(events: List[AssignmentIntegrityEvent]) -> dict[str, dict]:
    """Compute deterministic assignment-integrity summaries by student."""
    by_student: dict[str, List[AssignmentIntegrityEvent]] = {}
    for event in events:
        by_student.setdefault(event.student_id, []).append(event)

    summaries: dict[str, dict] = {}
    for student_id, student_events in by_student.items():
        sorted_events = sorted(student_events, key=lambda event: event.client_created_at or event.created_at)
        paste_count = 0
        copy_count = 0
        cut_count = 0
        focus_away_count = 0
        rapid_input_count = 0
        large_delta_count = 0
        largest_paste_chars = 0
        score = 0
        focus_score_count = 0
        recent_large_paste_at: Optional[datetime] = None

        for event in sorted_events:
            metadata = event.event_metadata if isinstance(event.event_metadata, dict) else {}
            event_type = event.event_type
            if event_type == "paste":
                paste_count += 1
                paste_chars = int(_metadata_number(metadata, "paste_length", "clipboard_length", "length", "delta_chars"))
                largest_paste_chars = max(largest_paste_chars, paste_chars)
                score += 4 if paste_chars > 500 else 2
                if paste_chars > 500:
                    recent_large_paste_at = event.client_created_at or event.created_at
            elif event_type == "copy":
                copy_count += 1
            elif event_type == "cut":
                cut_count += 1
            elif event_type == "large_delta":
                large_delta_count += 1
                score += 2
            elif event_type == "rapid_input":
                rapid_input_count += 1
                score += 2
            elif event_type in {"visibility_hidden", "blur"}:
                focus_away_count += 1
                if focus_score_count < 5:
                    score += 1
                    focus_score_count += 1
            elif event_type == "submit" and recent_large_paste_at:
                event_time = event.client_created_at or event.created_at
                elapsed = (event_time - recent_large_paste_at).total_seconds()
                if 0 <= elapsed <= 120:
                    score += 3

        summaries[student_id] = {
            "student_id": student_id,
            "risk_score": score,
            "risk_level": _risk_level(score),
            "event_count": len(sorted_events),
            "paste_count": paste_count,
            "copy_count": copy_count,
            "cut_count": cut_count,
            "focus_away_count": focus_away_count,
            "rapid_input_count": rapid_input_count,
            "large_delta_count": large_delta_count,
            "largest_paste_chars": largest_paste_chars,
            "last_event_at": sorted_events[-1].created_at if sorted_events else None,
        }

    return summaries


def upsert_assignment_progress(
    session: Session,
    assignment_id: int,
    student_id: str,
    answers: Optional[dict] = None,
    question_time_ms: Optional[dict] = None,
    grading_data: Optional[dict] = None,
    current_question_index: Optional[int] = None,
    submitted: Optional[bool] = None,
    research_id: Optional[str] = None,
):
    """Create/update assignment progress for a student."""
    from .models import AssignmentProgress

    progress = get_assignment_progress(session, assignment_id, student_id)
    if not progress:
        progress = AssignmentProgress(
            assignment_id=assignment_id,
            student_id=student_id,
            research_id=research_id,
            answers="{}",
            question_time_ms="{}",
            current_question_index=0,
            submitted=False
        )
        session.add(progress)
        session.commit()
        session.refresh(progress)
    elif research_id and not progress.research_id:
        # Backfill research_id if not yet set (e.g. pre-existing record)
        progress.research_id = research_id

    if answers is not None:
        progress.answers = json.dumps(answers)
    if question_time_ms is not None:
        existing_question_time = {}
        try:
            existing_question_time = json.loads(progress.question_time_ms or "{}")
        except Exception:
            existing_question_time = {}
        if not isinstance(existing_question_time, dict):
            existing_question_time = {}
        merged_question_time: dict[str, int] = dict(existing_question_time)
        if isinstance(question_time_ms, dict):
            for key, value in question_time_ms.items():
                key_str = str(key)
                try:
                    millis = int(value)
                except (TypeError, ValueError):
                    continue
                if millis < 0:
                    continue
                previous = merged_question_time.get(key_str)
                try:
                    previous_int = int(previous) if previous is not None else 0
                except (TypeError, ValueError):
                    previous_int = 0
                merged_question_time[key_str] = max(previous_int, millis)
        progress.question_time_ms = json.dumps(merged_question_time)
    if grading_data is not None:
        progress.grading_data = json.dumps(grading_data)
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
            question_time_ms="{}",
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
        next_grade_submitted = bool(grade_submitted)
        if next_grade_submitted != bool(progress.grade_submitted):
            progress.grade_submitted = next_grade_submitted
            progress.grade_submitted_at = datetime.utcnow() if next_grade_submitted else None

    progress.updated_at = datetime.utcnow()
    session.add(progress)
    session.commit()
    session.refresh(progress)
    return progress


def reset_assignment_grading_state(session: Session, assignment_id: int) -> None:
    """Clear finalized grading state while preserving saved rubric data/comments."""
    from .models import AssignmentProgress

    progress_rows = session.exec(
        select(AssignmentProgress).where(AssignmentProgress.assignment_id == assignment_id)
    ).all()
    reset_at = datetime.utcnow()

    for progress in progress_rows:
        progress.grade_submitted = False
        progress.grade_submitted_at = None
        progress.score_earned = None
        progress.score_total = None
        progress.updated_at = reset_at
        session.add(progress)


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
        assignment_questions=json.dumps(assignment_questions),
        assignment_question_refs=json.dumps(build_assignment_question_refs(session, assignment_questions)),
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

    assignment_changed = False
    grading_logic_changed = False

    if title is not None:
        trimmed_title = title.strip()
        if trimmed_title and trimmed_title != assignment.title:
            assignment.title = trimmed_title
            assignment_changed = True
    if type is not None:
        if type != assignment.type:
            assignment.type = type
            assignment_changed = True
    if description is not None:
        if description != assignment.description:
            assignment.description = description
            assignment_changed = True
    if node_id is not None:
        if node_id != assignment.node_id:
            assignment.node_id = node_id
            assignment_changed = True
    if release_date is not None:
        if release_date != assignment.release_date:
            assignment.release_date = release_date
            assignment_changed = True
    if due_date_soft is not None:
        if due_date_soft != assignment.due_date_soft:
            assignment.due_date_soft = due_date_soft
            assignment_changed = True
    if due_date_hard is not None:
        if due_date_hard != assignment.due_date_hard:
            assignment.due_date_hard = due_date_hard
            assignment_changed = True
    if late_policy_id is not None:
        if late_policy_id != assignment.late_policy_id:
            assignment.late_policy_id = late_policy_id
            assignment_changed = True
            grading_logic_changed = True
    if assignment_questions is not None:
        next_assignment_questions = json.dumps(assignment_questions)
        if next_assignment_questions != assignment.assignment_questions:
            assignment.assignment_questions = next_assignment_questions
            assignment.assignment_question_refs = json.dumps(build_assignment_question_refs(session, assignment_questions))
            assignment_changed = True
            grading_logic_changed = True

    if grading_logic_changed:
        reset_assignment_grading_state(session, assignment_id)
        assignment.grade_released = False
        assignment.grade_released_at = None

    assignment.updated_at = datetime.utcnow()
    session.add(assignment)
    session.commit()
    session.refresh(assignment)
    return assignment


def delete_assignment(session: Session, assignment_id: int, instructor_id: str) -> bool:
    """Delete an assignment. Only the instructor can delete."""
    from .models import Assignment, AssignmentIntegrityEvent, AssignmentProgress
    
    assignment = session.get(Assignment, assignment_id)
    if not assignment or assignment.instructor_id != instructor_id:
        return False
    if session.exec(
        select(AssignmentIntegrityEvent.id).where(AssignmentIntegrityEvent.assignment_id == assignment_id)
    ).first() is not None:
        return False

    session.exec(
        delete(AssignmentProgress).where(AssignmentProgress.assignment_id == assignment_id)
    )
    session.delete(assignment)
    session.commit()
    return True
