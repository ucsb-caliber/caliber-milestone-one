from __future__ import annotations

import os
import re
from difflib import SequenceMatcher
from typing import Optional

import requests


def _truthy(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _normalize_lines(text: str) -> str:
    lines = [(ln or "").rstrip() for ln in (text or "").splitlines()]
    cleaned = []
    prev_blank = False
    for ln in lines:
        is_blank = not ln.strip()
        if is_blank and prev_blank:
            continue
        cleaned.append(ln)
        prev_blank = is_blank
    return "\n".join(cleaned).strip()


def _rule_based_markdown(text: str) -> str:
    if not text or not text.strip():
        return text

    lines = [ln.strip() for ln in text.splitlines()]
    out = []
    in_choices = False

    for raw in lines:
        line = re.sub(r"\s+", " ", raw).strip()
        if not line:
            out.append("")
            in_choices = False
            continue

        # Keep obvious question starts as plain text (no markdown heading markers).
        if re.match(r"^(Problem|Question|Q)\s*\d+\b", line, flags=re.IGNORECASE):
            out.append(line)
            in_choices = False
            continue

        # Convert answer-choice like lines into markdown checklist bullets.
        m = re.match(r"^([A-Ha-h]|[1-9][0-9]*)[\)\.\:]?\s+(.+)$", line)
        if m and len(m.group(2)) > 0 and len(line) < 180:
            label = m.group(1)
            body = m.group(2).strip()
            if re.match(r"^[A-Ha-h]$", label):
                out.append(f"- [ ] {label.upper()}. {body}")
                in_choices = True
                continue

        if in_choices and re.match(r"^[\-\u2022]\s+.+$", line):
            cleaned_choice = re.sub(r"^[\-\u2022]\s+", "", line)
            out.append(f"- [ ] {cleaned_choice}")
            continue

        out.append(line)

    return _normalize_lines("\n".join(out))


def _quality_score(text: str) -> float:
    if not text:
        return 0.0
    total = max(1, len(text))
    letters = sum(ch.isalpha() for ch in text)
    spaces = sum(ch.isspace() for ch in text)
    weird = sum(ch in "@#$%^*_+=<>`~|" for ch in text)
    alpha_ratio = letters / total
    space_ratio = spaces / total
    weird_ratio = weird / total

    # Heuristic: good extraction has decent alpha/space and low symbol noise.
    return (alpha_ratio * 0.7) + (space_ratio * 0.3) - (weird_ratio * 0.8)


def _needs_llm_cleanup(text: str) -> bool:
    if not text or len(text.strip()) < 80:
        return False
    score = _quality_score(text)
    has_ocr_artifacts = bool(re.search(r"\b(?:l{3,}|I{3,}|0{3,}|[A-Za-z]\d[A-Za-z]\d)\b", text))
    long_unbroken_lines = any(len(ln) > 280 for ln in text.splitlines())
    return score < 0.43 or has_ocr_artifacts or long_unbroken_lines


def _llm_markdown_cleanup(text: str) -> str:
    """
    Optional local LLM cleanup using Ollama.

    Env vars:
    - LLM_CLEANUP_ENABLED: true/false (default false)
    - LLM_CLEANUP_BASE_URL: default http://127.0.0.1:11434
    - LLM_CLEANUP_MODEL: default llama3.1:8b
    - LLM_CLEANUP_TIMEOUT_SEC: default 45
    """
    if not text or not text.strip():
        return text

    if not _truthy(os.getenv("LLM_CLEANUP_ENABLED", "false")):
        return text

    base_url = os.getenv("LLM_CLEANUP_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("LLM_CLEANUP_MODEL", "llama3.1:8b")
    timeout = int(os.getenv("LLM_CLEANUP_TIMEOUT_SEC", "45"))

    system_prompt = (
        "You are a strict formatter. Convert extracted exam question text into clean Markdown only. "
        "Do NOT change meaning, do NOT solve the question, do NOT add facts, and do NOT delete content. "
        "Preserve equations/symbols/order. Only normalize spacing and list formatting. "
        "Do not add markdown heading markers ('#', '##', etc.) to title or first line."
    )
    user_prompt = (
        "Return only Markdown for the following extracted question text.\n\n"
        f"{text}"
    )

    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "options": {
            "temperature": 0.0,
        },
    }

    try:
        resp = requests.post(
            f"{base_url}/api/chat",
            json=payload,
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        formatted = (data.get("message") or {}).get("content", "")
        formatted = formatted.strip()
        return formatted if formatted else text
    except Exception:
        # Keep ingestion resilient; if local LLM is unavailable, use raw text.
        return text


def local_llm_markdown_cleanup_with_meta(text: str) -> tuple[str, bool]:
    """
    Hybrid strategy:
    1) deterministic formatter always
    2) local LLM only for low-quality extraction
    3) similarity guardrails to prevent hallucinated rewrites
    """
    base = _rule_based_markdown(text)
    if not _needs_llm_cleanup(base):
        return base, False

    candidate = _llm_markdown_cleanup(base)
    if not candidate:
        return base, True

    # Guardrail: if the model rewrites too aggressively, keep deterministic version.
    norm_base = re.sub(r"\s+", " ", base).strip().lower()
    norm_candidate = re.sub(r"\s+", " ", candidate).strip().lower()
    ratio = SequenceMatcher(None, norm_base, norm_candidate).ratio()
    if ratio < 0.72:
        return base, True

    return _normalize_lines(candidate), True


def local_llm_markdown_cleanup(text: str) -> str:
    cleaned, _ = local_llm_markdown_cleanup_with_meta(text)
    return cleaned
