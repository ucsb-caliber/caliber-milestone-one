import io
import json
import base64
import mimetypes
import posixpath
import zipfile
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from sqlmodel import Session, select

from .crud import create_question, update_question
from .models import Assignment, Question
from .question_content import (
    QuestionContent,
    question_content_from_question,
    validate_canonical_qidish,
    validate_ready_question_content,
)


ALLOWED_CONFLICT_MODES = {"create_only", "update_draft", "new_version", "fork"}


@dataclass
class ImportItem:
    qid: str
    path: str
    action: str
    message: str = ""


@dataclass
class PreparedQuestion:
    path: str
    qid: str
    version: int
    title: str
    text: str
    content: QuestionContent
    tags: str
    keywords: str
    school: str
    user_school: str
    course: str
    course_type: str
    question_type: str
    visibility: str
    draft_state: str
    source_path: str
    school_scope: str
    course_scope: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None


def _safe_zip_path(path: str) -> str:
    normalized = posixpath.normpath(path).replace("\\", "/")
    if normalized.startswith("../") or normalized == ".." or normalized.startswith("/"):
        raise ValueError(f"Unsafe path in archive: {path}")
    return normalized


def _read_json(zf: zipfile.ZipFile, path: str) -> dict[str, Any]:
    with zf.open(path) as handle:
        return json.loads(handle.read().decode("utf-8"))


def _read_text(zf: zipfile.ZipFile, path: str) -> str:
    with zf.open(path) as handle:
        return handle.read().decode("utf-8")


def _read_bytes(zf: zipfile.ZipFile, path: str) -> bytes:
    with zf.open(path) as handle:
        return handle.read()


def _string_list(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item).strip() for item in value if str(item).strip())
    return str(value or "")


def _optional_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _content_with_embedded_assets(zf: zipfile.ZipFile, names: set[str], base_dir: str, content: QuestionContent) -> QuestionContent:
    embedded_assets = []
    for asset in content.assets:
        asset_path = _safe_zip_path(posixpath.join(base_dir, asset.path))
        if not asset_path.startswith(f"{base_dir}/"):
            raise ValueError(f"Asset path escapes question folder: {asset.path}")
        if asset_path not in names:
            raise ValueError(f"asset not found: {asset.path}")
        asset_bytes = _read_bytes(zf, asset_path)
        media_type = asset.media_type or mimetypes.guess_type(asset.path)[0] or "application/octet-stream"
        embedded_assets.append(asset.model_copy(update={
            "media_type": media_type,
            "data_base64": base64.b64encode(asset_bytes).decode("ascii"),
        }))
    if not embedded_assets:
        return content
    return content.model_copy(update={"assets": embedded_assets})


def _explicitly_allows_zero_points(data: dict[str, Any]) -> bool:
    grading_policy = str(data.get("grading_policy") or "").strip().lower()
    return bool(data.get("allow_zero_points") or data.get("unscored") or grading_policy == "unscored")


def _fork_qid(session: Session, user_id: str, qid: str) -> str:
    owner_slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in user_id).strip("-")[:32] or "user"
    base_qid = qid.strip()
    candidate_base = f"fork:{owner_slug}:{base_qid}"
    candidate = candidate_base
    suffix = 2
    while session.exec(select(Question).where(Question.qid == candidate)).first():
        candidate = f"{candidate_base}-{suffix}"
        suffix += 1
    return candidate


def _prepare_question(zf: zipfile.ZipFile, names: set[str], manifest: dict[str, Any], question_path: str) -> PreparedQuestion:
    data = _read_json(zf, question_path)
    qid = str(data.get("qid") or "")
    if not qid.strip():
        raise ValueError("question.json is missing qid")
    validate_canonical_qidish(qid, "qid")

    base_dir = posixpath.dirname(question_path)
    content_data = dict(data.get("content") or {})
    prompt_file = data.get("prompt_file")
    prompt_text = ""
    if prompt_file:
        prompt_path = _safe_zip_path(posixpath.join(base_dir, str(prompt_file)))
        if prompt_path not in zf.namelist():
            raise ValueError(f"prompt_file not found: {prompt_file}")
        prompt_text = _read_text(zf, prompt_path)
    if prompt_text:
        content_data["stem"] = content_data.get("stem") or prompt_text

    content = QuestionContent.model_validate(content_data or {"schema_version": 1, "stem": prompt_text, "parts": []})
    content = _content_with_embedded_assets(zf, names, base_dir, content)
    text = str(data.get("text") or content.stem or prompt_text or "")
    draft_state = str(data.get("draft_state") or "ready")
    if draft_state == "ready":
        validate_ready_question_content(
            content,
            text=text,
            allow_zero_points=_explicitly_allows_zero_points(data),
        )
    default_scope = str(manifest.get("default_school_scope") or "")
    return PreparedQuestion(
        path=question_path,
        qid=qid,
        version=max(1, int(data.get("version") or 1)),
        title=str(data.get("title") or qid),
        text=text,
        content=content,
        tags=_string_list(data.get("tags")),
        keywords=_string_list(data.get("keywords")),
        school=str(data.get("school") or default_scope),
        user_school=str(data.get("user_school") or data.get("school_scope") or default_scope),
        course=str(data.get("course") or ""),
        course_type=str(data.get("course_type") or ""),
        question_type=str(data.get("question_type") or ("multipart" if len(content.parts) > 1 else (content.parts[0].type if content.parts else ""))),
        visibility=str(data.get("visibility") or manifest.get("default_visibility") or "private"),
        draft_state=draft_state,
        source_path=question_path,
        school_scope=str(data.get("school_scope") or data.get("school") or default_scope),
        course_scope=str(data.get("course_scope") or "") or None,
        reviewed_at=_optional_datetime(data.get("reviewed_at")),
        reviewed_by=str(data.get("reviewed_by") or "") or None,
    )


def prepare_question_zip(file_bytes: bytes) -> tuple[dict[str, Any], list[PreparedQuestion], list[ImportItem]]:
    errors: list[ImportItem] = []
    prepared: list[PreparedQuestion] = []
    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes))
    except zipfile.BadZipFile as exc:
        raise ValueError("Uploaded file is not a valid zip archive") from exc

    with zf:
        names = {_safe_zip_path(name) for name in zf.namelist() if not name.endswith("/")}
        manifest = _read_json(zf, "manifest.json") if "manifest.json" in names else {"schema_version": 1}
        question_paths = sorted(name for name in names if name.endswith("/question.json") and name.startswith("questions/"))
        if not question_paths:
            raise ValueError("No questions/*/question.json files found")

        seen_qids: set[str] = set()
        for question_path in question_paths:
            try:
                item = _prepare_question(zf, names, manifest, question_path)
                if item.qid in seen_qids:
                    raise ValueError(f"Duplicate qid in archive: {item.qid}")
                seen_qids.add(item.qid)
                prepared.append(item)
            except Exception as exc:
                errors.append(ImportItem(qid="", path=question_path, action="error", message=str(exc)))
    return manifest, prepared, errors


def dry_run_question_import(session: Session, prepared: list[PreparedQuestion], errors: list[ImportItem], conflict_mode: str, user_id: str) -> list[ImportItem]:
    if conflict_mode not in ALLOWED_CONFLICT_MODES:
        errors.append(ImportItem(qid="", path="", action="error", message=f"Invalid conflict mode: {conflict_mode}"))
        return errors

    items = list(errors)
    for item in prepared:
        existing = session.exec(select(Question).where(Question.qid == item.qid).order_by(Question.version.desc())).first()
        if not existing:
            items.append(ImportItem(qid=item.qid, path=item.path, action="create"))
        elif existing.user_id != user_id:
            items.append(ImportItem(qid=item.qid, path=item.path, action="skip", message="Existing question is owned by another user"))
        elif conflict_mode == "create_only":
            items.append(ImportItem(qid=item.qid, path=item.path, action="error", message="Question qid already exists"))
        elif conflict_mode == "update_draft" and (existing.draft_state or ("ready" if existing.is_verified else "draft")) != "draft":
            items.append(ImportItem(qid=item.qid, path=item.path, action="skip", message="Existing question is not a draft"))
        elif conflict_mode == "fork":
            forked_qid = _fork_qid(session, user_id, item.qid)
            items.append(ImportItem(qid=forked_qid, path=item.path, action="create", message=f"Would fork {item.qid}"))
        elif conflict_mode == "new_version":
            items.append(ImportItem(qid=item.qid, path=item.path, action="create", message=f"Would create version {max(existing.version + 1, item.version)}"))
        else:
            items.append(ImportItem(qid=item.qid, path=item.path, action="update"))
    return items


def apply_question_import(
    session: Session,
    prepared: list[PreparedQuestion],
    *,
    user_id: str,
    source_repo: Optional[str],
    source_commit: Optional[str],
    conflict_mode: str,
) -> list[ImportItem]:
    items: list[ImportItem] = []
    for item in prepared:
        existing = session.exec(select(Question).where(Question.qid == item.qid).order_by(Question.version.desc())).first()
        if not existing:
            create_question(
                session=session,
                qid=item.qid,
                version=item.version,
                title=item.title,
                text=item.text,
                content=item.content,
                tags=item.tags,
                keywords=item.keywords,
                school=item.school,
                user_school=item.user_school,
                course=item.course,
                course_type=item.course_type,
                question_type=item.question_type,
                answer_choices="[]",
                correct_answer="",
                user_id=user_id,
                is_verified=item.draft_state == "ready",
                draft_state=item.draft_state,
                visibility=item.visibility,
                origin="github_import",
                school_scope=item.school_scope,
                course_scope=item.course_scope,
                source_repo=source_repo,
                source_path=item.source_path,
                source_commit=source_commit,
                reviewed_at=item.reviewed_at,
                reviewed_by=item.reviewed_by,
            )
            items.append(ImportItem(qid=item.qid, path=item.path, action="create"))
            continue

        if existing.id is None:
            items.append(ImportItem(qid=item.qid, path=item.path, action="error", message="Existing question has no id"))
            continue
        if existing.user_id != user_id:
            items.append(ImportItem(qid=item.qid, path=item.path, action="skip", message="Existing question is owned by another user"))
            continue
        if conflict_mode == "create_only":
            items.append(ImportItem(qid=item.qid, path=item.path, action="error", message="Question qid already exists"))
            continue
        if conflict_mode == "update_draft" and (existing.draft_state or ("ready" if existing.is_verified else "draft")) != "draft":
            items.append(ImportItem(qid=item.qid, path=item.path, action="skip", message="Existing question is not a draft"))
            continue
        if conflict_mode == "fork":
            forked_qid = _fork_qid(session, user_id, item.qid)
            create_question(
                session=session,
                qid=forked_qid,
                version=1,
                title=item.title,
                text=item.text,
                content=item.content,
                tags=item.tags,
                keywords=item.keywords,
                school=item.school,
                user_school=item.user_school,
                course=item.course,
                course_type=item.course_type,
                question_type=item.question_type,
                answer_choices="[]",
                correct_answer="",
                user_id=user_id,
                is_verified=item.draft_state == "ready",
                draft_state=item.draft_state,
                visibility="private",
                origin="github_import",
                school_scope=item.school_scope,
                course_scope=item.course_scope,
                source_repo=source_repo,
                source_path=item.source_path,
                source_commit=source_commit,
                reviewed_at=item.reviewed_at,
                reviewed_by=item.reviewed_by,
            )
            items.append(ImportItem(qid=forked_qid, path=item.path, action="create", message=f"Forked from {item.qid}"))
            continue
        if conflict_mode == "new_version":
            next_version = max(existing.version + 1, item.version)
            try:
                create_question(
                    session=session,
                    qid=item.qid,
                    version=next_version,
                    title=item.title,
                    text=item.text,
                    content=item.content,
                    tags=item.tags,
                    keywords=item.keywords,
                    school=item.school,
                    user_school=item.user_school,
                    course=item.course,
                    course_type=item.course_type,
                    question_type=item.question_type,
                    answer_choices="[]",
                    correct_answer="",
                    user_id=user_id,
                    is_verified=item.draft_state == "ready",
                    draft_state=item.draft_state,
                    visibility=item.visibility,
                    origin="github_import",
                    school_scope=item.school_scope,
                    course_scope=item.course_scope,
                    source_repo=source_repo,
                    source_path=item.source_path,
                    source_commit=source_commit,
                    reviewed_at=item.reviewed_at,
                    reviewed_by=item.reviewed_by,
                )
                items.append(ImportItem(qid=item.qid, path=item.path, action="create", message=f"Created version {next_version}"))
            except ValueError as exc:
                items.append(ImportItem(qid=item.qid, path=item.path, action="error", message=str(exc)))
            continue

        update_question(
            session=session,
            question_id=existing.id,
            user_id=user_id,
            version=item.version,
            title=item.title,
            text=item.text,
            content=item.content,
            tags=item.tags,
            keywords=item.keywords,
            school=item.school,
            user_school=item.user_school,
            course=item.course,
            course_type=item.course_type,
            question_type=item.question_type,
            is_verified=item.draft_state == "ready",
            draft_state=item.draft_state,
            visibility=item.visibility,
            origin="github_import",
            school_scope=item.school_scope,
            course_scope=item.course_scope,
            source_repo=source_repo,
            source_path=item.source_path,
            source_commit=source_commit,
            reviewed_at=item.reviewed_at,
            reviewed_by=item.reviewed_by,
        )
        items.append(ImportItem(qid=item.qid, path=item.path, action="update"))
    return items


def _content_payload_without_embedded_asset_bytes(content: QuestionContent) -> dict[str, Any]:
    payload = content.model_dump(mode="json", exclude_none=True)
    for asset in payload.get("assets", []):
        asset.pop("data_base64", None)
    return payload


def _write_embedded_assets(zf: zipfile.ZipFile, folder: str, content: QuestionContent) -> None:
    written_paths: set[str] = set()
    for asset in content.assets:
        if not asset.data_base64:
            continue
        relative_path = _safe_zip_path(asset.path)
        if relative_path.startswith("../") or relative_path.startswith("/"):
            raise ValueError(f"Unsafe asset path: {asset.path}")
        if relative_path in written_paths:
            raise ValueError(f"Duplicate asset path: {asset.path}")
        written_paths.add(relative_path)
        try:
            asset_bytes = base64.b64decode(asset.data_base64.encode("ascii"), validate=True)
        except Exception as exc:
            raise ValueError(f"Invalid embedded asset data for {asset.path}") from exc
        zf.writestr(f"{folder}/{relative_path}", asset_bytes)


def _assignment_export_payload(assignment: Assignment) -> dict[str, Any]:
    refs = []
    try:
        raw_refs = json.loads(assignment.assignment_question_refs or "[]")
    except Exception:
        raw_refs = []
    for index, ref in enumerate(raw_refs if isinstance(raw_refs, list) else []):
        if not isinstance(ref, dict):
            continue
        refs.append({
            "qid": ref.get("qid"),
            "version": ref.get("version"),
            "position": ref.get("position", index),
            "points_override": ref.get("points_override"),
        })

    return {
        "schema_version": 1,
        "title": assignment.title,
        "type": assignment.type,
        "description": assignment.description,
        "course": assignment.course,
        "course_id": assignment.course_id,
        "release_date": assignment.release_date.isoformat() if assignment.release_date else None,
        "due_date_soft": assignment.due_date_soft.isoformat() if assignment.due_date_soft else None,
        "due_date_hard": assignment.due_date_hard.isoformat() if assignment.due_date_hard else None,
        "late_policy_id": assignment.late_policy_id,
        "questions": refs,
    }


def build_question_export_zip(questions: list[Question], assignments: Optional[list[Assignment]] = None) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "schema_version": 1,
            "namespace": "caliber-export",
            "title": "Caliber Question Export",
            "default_visibility": "private",
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, sort_keys=True))
        for question in questions:
            safe_slug = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in (question.qid or str(question.id))).strip("-") or str(question.id)
            folder = f"questions/{safe_slug}"
            content = question_content_from_question(question)
            zf.writestr(f"{folder}/prompt.md", content.stem or question.text or "")
            _write_embedded_assets(zf, folder, content)
            payload = {
                "schema_version": 1,
                "qid": question.qid,
                "version": question.version,
                "title": question.title,
                "question_type": question.question_type,
                "tags": [part.strip() for part in (question.tags or "").split(",") if part.strip()],
                "keywords": [part.strip() for part in (question.keywords or "").split(",") if part.strip()],
                "school": question.school,
                "user_school": question.user_school,
                "course": question.course,
                "course_type": question.course_type,
                "visibility": question.visibility,
                "draft_state": question.draft_state or ("ready" if question.is_verified else "draft"),
                "school_scope": question.school_scope,
                "course_scope": question.course_scope,
                "source_repo": question.source_repo,
                "source_path": question.source_path,
                "source_commit": question.source_commit,
                "reviewed_at": question.reviewed_at.isoformat() if question.reviewed_at else None,
                "reviewed_by": question.reviewed_by,
                "prompt_file": "prompt.md",
                "content": _content_payload_without_embedded_asset_bytes(content),
            }
            zf.writestr(f"{folder}/question.json", json.dumps(payload, indent=2, sort_keys=True))
        for assignment in assignments or []:
            safe_slug = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in (assignment.title or str(assignment.id))).strip("-") or str(assignment.id)
            zf.writestr(
                f"assignments/{safe_slug}.json",
                json.dumps(_assignment_export_payload(assignment), indent=2, sort_keys=True),
            )
    return buffer.getvalue()
