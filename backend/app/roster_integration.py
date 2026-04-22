import os
from typing import Any, Optional

import requests
from fastapi import HTTPException, status
from sqlmodel import Session, select

from .models import Assignment


ROSTER_BASE_URL = (os.getenv("ROSTER_BASE_URL") or "").rstrip("/")
ROSTER_MANAGEMENT_ENABLED = (os.getenv("ROSTER_MANAGEMENT_ENABLED") or "false").lower() in {"1", "true", "yes"}
ROSTER_INTERNAL_SECRET = os.getenv("ROSTER_INTERNAL_SECRET") or ""
ROSTER_TIMEOUT_SEC = float(os.getenv("ROSTER_TIMEOUT_SEC") or "10")


def roster_management_enabled() -> bool:
    return ROSTER_MANAGEMENT_ENABLED and bool(ROSTER_BASE_URL)


def _build_headers(
    user_id: str,
    user_email: Optional[str],
    user_name: Optional[str],
    user_token: Optional[str],
) -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/json"}
    if user_token:
        headers["Authorization"] = f"Bearer {user_token}"
    if ROSTER_INTERNAL_SECRET:
        headers["X-Internal-Secret"] = ROSTER_INTERNAL_SECRET
        headers["X-Internal-User-Sub"] = user_id
        if user_email:
            headers["X-Internal-User-Email"] = user_email
        if user_name:
            headers["X-Internal-User-Name"] = user_name
    return headers


def _extract_error_message(response: requests.Response) -> str:
    try:
        payload = response.json()
        detail = payload.get("detail")
        if isinstance(detail, str) and detail:
            return detail
        if isinstance(payload.get("error_description"), str):
            return payload["error_description"]
        if isinstance(payload.get("error"), str):
            return payload["error"]
    except Exception:
        pass
    text = (response.text or "").strip()
    if text:
        return text[:500]
    return f"Roster service request failed ({response.status_code})"


def call_roster(
    method: str,
    path: str,
    *,
    user_id: str,
    user_email: Optional[str] = None,
    user_name: Optional[str] = None,
    user_token: Optional[str] = None,
    params: Optional[dict[str, Any]] = None,
    json_body: Optional[dict[str, Any]] = None,
) -> Any:
    if not roster_management_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Roster management integration is disabled",
        )
    if not ROSTER_INTERNAL_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Roster integration missing ROSTER_INTERNAL_SECRET",
        )

    url = f"{ROSTER_BASE_URL}{path}"
    headers = _build_headers(
        user_id=user_id,
        user_email=user_email,
        user_name=user_name,
        user_token=user_token,
    )
    method_upper = method.upper()
    try:
        response = requests.request(
            method=method_upper,
            url=url,
            headers=headers,
            params=params,
            json=json_body,
            timeout=ROSTER_TIMEOUT_SEC,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Roster service unavailable: {exc}",
        ) from exc

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Roster service rejected Caliber internal credentials",
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=_extract_error_message(response),
        )

    if response.status_code == 204 or not response.content:
        return None
    try:
        return response.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Roster service returned non-JSON response",
        ) from exc


def fetch_research_id(
    user_id: str,
    *,
    user_email: Optional[str] = None,
    user_name: Optional[str] = None,
    user_token: Optional[str] = None,
) -> Optional[str]:
    """Fetch the anonymous research_id for a student from the roster service.

    Only returns a research_id if the student has explicitly consented to
    research data collection (research_consent is True). Returns None when
    consent is False or has not yet been answered (None), and on any failure —
    submissions are never blocked by this.
    """
    if not roster_management_enabled() or not ROSTER_INTERNAL_SECRET:
        return None
    try:
        result = call_roster(
            "GET",
            f"/api/users/{user_id}",
            user_id=user_id,
            user_email=user_email,
            user_name=user_name,
            user_token=user_token,
        )
        if isinstance(result, dict):
            research_consent = result.get("research_consent")
            # Only tag data with a research_id when the student explicitly consented.
            if research_consent is not True:
                return None
            return result.get("research_id") or None
    except Exception:
        pass
    return None


def delete_local_course(session: Session, course_id: int) -> None:
    # Caliber DB remains the source for assignment content only.
    assignments = session.exec(select(Assignment).where(Assignment.course_id == course_id)).all()
    for assignment in assignments:
        session.delete(assignment)
    session.commit()
