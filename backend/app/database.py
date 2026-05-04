import os
from contextlib import contextmanager
from collections.abc import Iterator
from typing import Optional

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session
from dotenv import load_dotenv

from .auth import resolve_request_user_context, security

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/questionbank.db")
ROSTER_INTERNAL_SECRET = (os.getenv("ROSTER_INTERNAL_SECRET") or "").strip()

# Create engine
if DATABASE_URL.startswith("sqlite"):
    # SQLite specific settings
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False}, echo=True)
else:
    # For PostgreSQL or other databases
    engine = create_engine(DATABASE_URL, echo=True)


def create_db_and_tables():
    """Create core Caliber persistence tables."""
    from .models import Question, CodingQuestionPrivate, CodingRun, Assignment, AssignmentProgress

    SQLModel.metadata.create_all(
        engine,
        tables=[
            Question.__table__,
            CodingQuestionPrivate.__table__,
            CodingRun.__table__,
            Assignment.__table__,
            AssignmentProgress.__table__,
        ],
    )


def _set_rls_context(
    session: Session,
    *,
    user_id: Optional[str],
    mode: str,
) -> None:
    if engine.dialect.name != "postgresql":
        return

    session.execute(
        text(
            """
            SELECT
              set_config('app.current_user_id', :user_id, false),
              set_config('app.rls_mode', :mode, false)
            """
        ),
        {
            "user_id": user_id or "",
            "mode": mode,
        },
    )


def _clear_rls_context(session: Session) -> None:
    if engine.dialect.name != "postgresql":
        return

    session.rollback()
    _set_rls_context(session, user_id=None, mode="anonymous")


def _resolve_request_rls_mode(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> tuple[Optional[str], str]:
    provided_secret = (request.headers.get("x-internal-secret") or "").strip()
    if ROSTER_INTERNAL_SECRET and provided_secret == ROSTER_INTERNAL_SECRET:
        return None, "internal"

    resolved = resolve_request_user_context(
        request,
        credentials,
        raise_on_error=False,
    )
    if resolved:
        return resolved[0], "authenticated"
    return None, "anonymous"


@contextmanager
def session_with_rls(
    *,
    user_id: Optional[str] = None,
    mode: str = "service",
) -> Iterator[Session]:
    with Session(engine) as session:
        _set_rls_context(session, user_id=user_id, mode=mode)
        try:
            yield session
        finally:
            _clear_rls_context(session)


@contextmanager
def temporary_rls_mode(
    session: Session,
    *,
    user_id: Optional[str] = None,
    mode: str,
    restore_user_id: Optional[str] = None,
    restore_mode: str = "anonymous",
) -> Iterator[None]:
    if engine.dialect.name != "postgresql":
        yield
        return

    session.rollback()
    _set_rls_context(session, user_id=user_id, mode=mode)
    try:
        yield
    finally:
        session.rollback()
        _set_rls_context(session, user_id=restore_user_id, mode=restore_mode)


def get_session(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Dependency to get a database session with request-scoped RLS context."""
    with Session(engine) as session:
        user_id, mode = _resolve_request_rls_mode(request, credentials)
        _set_rls_context(session, user_id=user_id, mode=mode)
        try:
            yield session
        finally:
            _clear_rls_context(session)
