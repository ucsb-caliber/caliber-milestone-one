"""Adapt Milestone 1 database questions into variant_gen's ingestion shape."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Iterable, Optional


_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _safe_json_loads(raw: Any, default: Any) -> Any:
    if raw is None:
        return default
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(str(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _clean_identifier(value: Any, fallback: str) -> str:
    text = str(value or "").strip() or fallback
    text = re.sub(r"[^A-Za-z0-9_.:-]+", "_", text)
    return text.strip("_") or fallback


def _iso_or_none(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def _question_type(question: Any) -> str:
    return str(getattr(question, "question_type", "") or "").strip().lower()


def _text_has_labeled_choices(text: str) -> bool:
    if not text:
        return False
    patterns = (
        r"(?m)^\s*[A-E][\.\)]\s+\S",
        r"(?m)^\s*\(\s*[a-e]\s*\)\s+\S",
        r"(?m)^\s*[1-5][\.\)]\s+\S",
    )
    return any(len(re.findall(pattern, text)) >= 2 for pattern in patterns)


def _choice_text(choice: Any) -> str:
    if choice is None:
        return ""
    if isinstance(choice, (str, int, float, bool)):
        return str(choice).strip()
    if isinstance(choice, dict):
        for key in ("text", "choice", "answer", "value", "label"):
            val = choice.get(key)
            if val is not None and str(val).strip():
                return str(val).strip()
        try:
            return json.dumps(choice, ensure_ascii=False)
        except TypeError:
            return str(choice)
    if isinstance(choice, (list, tuple)):
        return ", ".join(part for part in (_choice_text(x) for x in choice) if part)
    return str(choice).strip()


def _choice_label(choice: Any, index: int) -> str:
    if isinstance(choice, dict):
        raw = choice.get("label") or choice.get("key")
        label = str(raw or "").strip()
        if label and len(label) <= 3:
            return label.rstrip(".):")
    return _LABELS[index] if index < len(_LABELS) else str(index + 1)


def _format_choices_block(choices: Iterable[Any]) -> str:
    lines = []
    for i, choice in enumerate(choices):
        text = _choice_text(choice)
        if not text:
            continue
        label = _choice_label(choice, i)
        lines.append(f"{label}. {text}")
    if len(lines) < 2:
        return ""
    return "Options:\n" + "\n".join(lines)


def source_text_for_variant_generation(question: Any) -> str:
    """
    Build the source stem sent to variant_gen.

    Milestone 1 often stores MCQ options separately from ``Question.text``. The
    stem router only sees text, so append answer choices for MCQ-like rows when
    they are not already embedded in the question body.
    """
    text = str(getattr(question, "text", "") or "").strip()
    qtype = _question_type(question)

    if qtype in {"mcq", "multiple_choice", "multiple choice"} and not _text_has_labeled_choices(text):
        choices = _safe_json_loads(getattr(question, "answer_choices", "[]"), [])
        if isinstance(choices, list):
            block = _format_choices_block(choices)
            if block:
                return f"{text}\n\n{block}".strip()

    if qtype in {"true_false", "true/false", "tf"}:
        tl = text.lower()
        if "true" not in tl or "false" not in tl:
            return f"{text}\n\nAnswer True or False.".strip()

    return text


def question_to_variant_gen_question(question: Any) -> dict[str, Any]:
    """Return the single-question record expected inside a variant_gen ingestion."""
    db_id = getattr(question, "id", None)
    qid = getattr(question, "qid", None)
    stable_id = _clean_identifier(qid or db_id, "unknown")
    return {
        "question_id": f"caliber_{stable_id}",
        "start_page": None,
        "page_nums": [],
        "text": source_text_for_variant_generation(question),
        "text_hash": None,
        # Milestone 1 stores image_url as a storage path/URL, not a local crop file.
        # Keep this empty until the API endpoint has a safe download/signing step.
        "image_crops": [],
        "type": getattr(question, "question_type", None),
        "metadata": {
            "source": "caliber_milestone_one_db",
            "caliber_id": db_id,
            "caliber_qid": qid,
            "title": getattr(question, "title", "") or "",
            "course": getattr(question, "course", "") or "",
            "course_type": getattr(question, "course_type", "") or "",
            "school": getattr(question, "school", "") or "",
            "blooms_taxonomy": getattr(question, "blooms_taxonomy", "") or "",
            "source_pdf": getattr(question, "source_pdf", None),
            "image_url": getattr(question, "image_url", None),
        },
    }


def question_to_variant_gen_db(question: Any) -> dict[str, Any]:
    """
    Wrap one Milestone 1 question row in the questions.json-shaped DB.

    The returned object can be passed directly to
    ``generate_variant(0, ingestion_index=0, questions_db=...)``.
    """
    db_id = getattr(question, "id", None)
    qid = getattr(question, "qid", None)
    stable_id = _clean_identifier(qid or db_id, "unknown")
    return {
        "schema_version": "1.0",
        "ingestions": [
            {
                "ingestion_id": f"ing_caliber_{stable_id}",
                "created_at": _iso_or_none(getattr(question, "created_at", None)),
                "source_pdf": getattr(question, "source_pdf", None),
                "exam_id": f"caliber_question_{stable_id}",
                "questions": [question_to_variant_gen_question(question)],
            }
        ],
    }
