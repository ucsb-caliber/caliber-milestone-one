from typing import Any, Optional

from sqlmodel import Session, func, select

from .models import QuestionComment, QuestionLike


def question_social_metadata(
    session: Session,
    question_ids: list[Optional[int]],
    current_user_id: Optional[str] = None,
) -> dict[int, dict[str, Any]]:
    ids = [question_id for question_id in dict.fromkeys(question_ids) if question_id is not None]
    if not ids:
        return {}

    metadata: dict[int, dict[str, Any]] = {
        question_id: {
            "likes_count": 0,
            "comments_count": 0,
            "liked_by_me": False,
            "recent_comments": [],
        }
        for question_id in ids
    }

    like_counts = session.exec(
        select(QuestionLike.question_id, func.count(QuestionLike.id))
        .where(QuestionLike.question_id.in_(ids))
        .group_by(QuestionLike.question_id)
    ).all()
    for question_id, count in like_counts:
        metadata[int(question_id)]["likes_count"] = int(count or 0)

    comment_counts = session.exec(
        select(QuestionComment.question_id, func.count(QuestionComment.id))
        .where(QuestionComment.question_id.in_(ids))
        .group_by(QuestionComment.question_id)
    ).all()
    for question_id, count in comment_counts:
        metadata[int(question_id)]["comments_count"] = int(count or 0)

    if current_user_id:
        liked_question_ids = session.exec(
            select(QuestionLike.question_id).where(
                QuestionLike.question_id.in_(ids),
                QuestionLike.user_id == current_user_id,
            )
        ).all()
        for question_id in liked_question_ids:
            metadata[int(question_id)]["liked_by_me"] = True

    comments = session.exec(
        select(QuestionComment)
        .where(QuestionComment.question_id.in_(ids))
        .order_by(QuestionComment.question_id.asc(), QuestionComment.created_at.desc())
    ).all()
    for comment in comments:
        recent = metadata[int(comment.question_id)]["recent_comments"]
        if len(recent) < 3:
            recent.append(comment)

    for item in metadata.values():
        item["recent_comments"].reverse()

    return metadata
