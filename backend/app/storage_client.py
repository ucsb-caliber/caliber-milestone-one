import os
import re
import time
from pathlib import PurePosixPath
from urllib.parse import quote

import requests
from fastapi import HTTPException

DEFAULT_PDF_BUCKET = "question-pdfs"
_SAFE_SEGMENT_RE = re.compile(r"[^A-Za-z0-9._-]")
_SAFE_EXT_RE = re.compile(r"[^A-Za-z0-9]")


def _require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if value:
        return value
    raise HTTPException(status_code=500, detail=f"{name} is not configured on the backend")


def _safe_segment(raw: str, fallback: str) -> str:
    clean = _SAFE_SEGMENT_RE.sub("-", (raw or "").strip())
    clean = clean.strip(".-")
    return clean or fallback


def _safe_pdf_ext(filename: str) -> str:
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "pdf").lower()
    ext = _SAFE_EXT_RE.sub("", ext)[:10]
    return ext or "pdf"


def build_pdf_storage_path(user_id: str, filename: str, requested_path: str | None = None) -> str:
    safe_user_id = _safe_segment(user_id, "unknown-user")
    ext = _safe_pdf_ext(filename)

    if requested_path:
        raw = requested_path.strip().lstrip("/")
        path = PurePosixPath(raw)
        if any(part in ("..", "") for part in path.parts):
            raise HTTPException(status_code=400, detail="Invalid storage_path")
        leaf = _safe_segment(path.name, f"{int(time.time() * 1000)}.{ext}")
        if "." not in leaf:
            leaf = f"{leaf}.{ext}"
        return f"{safe_user_id}/{leaf}"

    return f"{safe_user_id}/{int(time.time() * 1000)}.{ext}"


def upload_pdf_to_storage(file_content: bytes, storage_path: str) -> None:
    supabase_url = _require_env("SUPABASE_URL").rstrip("/")
    service_role_key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
    bucket = (os.getenv("SUPABASE_STORAGE_PDF_BUCKET") or DEFAULT_PDF_BUCKET).strip() or DEFAULT_PDF_BUCKET
    timeout_sec = int((os.getenv("SUPABASE_STORAGE_TIMEOUT_SEC") or "25").strip() or "25")

    encoded_path = quote(storage_path, safe="/")
    url = f"{supabase_url}/storage/v1/object/{bucket}/{encoded_path}"
    headers = {
        "Authorization": f"Bearer {service_role_key}",
        "apikey": service_role_key,
        "Content-Type": "application/pdf",
        "x-upsert": "false",
    }

    try:
        response = requests.post(url, data=file_content, headers=headers, timeout=timeout_sec)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Failed to reach Supabase Storage: {exc}") from exc

    if response.ok:
        return

    detail = response.text
    try:
        payload = response.json()
        detail = payload.get("message") or payload.get("error") or detail
    except ValueError:
        pass
    raise HTTPException(
        status_code=502,
        detail=f"Supabase Storage upload failed ({response.status_code}): {detail}",
    )
