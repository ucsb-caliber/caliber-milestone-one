from __future__ import annotations

import os
import re
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

import requests


_DEFAULT_STYLE_GUIDE = """\
- Return GitHub-flavored Markdown only (no prose before/after).
- Keep the first question line as plain text; do not add heading markers.
- Preserve meaning and all important details from the source text.
- Normalize spacing and punctuation for readability.
- Convert repeated attributes/method items into bullet lists when appropriate.
- If code or pseudocode appears, place it in fenced code blocks with a language tag when clear.
- Preserve equations and symbols exactly when possible.
- Do not solve the question or add new instructional content.
"""


def _truthy(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _debug_enabled() -> bool:
    return _truthy(os.getenv("LLM_CLEANUP_DEBUG", "false"))


def _debug_log(message: str) -> None:
    if _debug_enabled():
        print(f"[llm-cleanup] {message}")


def _load_style_guide() -> str:
    """
    Optional style-guide injection for prompt tuning.

    If LLM_CLEANUP_STYLE_GUIDE_PATH is provided, read that file.
    Otherwise, use app/prompts/llm_cleanup_style.md if present.
    """
    override_path = (os.getenv("LLM_CLEANUP_STYLE_GUIDE_PATH") or "").strip()
    if override_path:
        try:
            custom = Path(override_path).read_text(encoding="utf-8").strip()
            if custom:
                return custom
        except Exception as exc:
            _debug_log(f"failed to read style guide override: {exc!r}")

    default_path = Path(__file__).resolve().parent / "prompts" / "llm_cleanup_style.md"
    try:
        default_guide = default_path.read_text(encoding="utf-8").strip()
        if default_guide:
            return default_guide
    except Exception:
        pass

    return _DEFAULT_STYLE_GUIDE


def _normalize_lines(text: str) -> str:
    lines = [(ln or "").rstrip() for ln in (text or "").splitlines()]
    cleaned = []
    prev_blank = False
    in_fence = False
    for ln in lines:
        marker = ln.strip()
        if marker.startswith("```"):
            cleaned.append(marker)
            prev_blank = False
            in_fence = not in_fence
            continue

        if in_fence:
            cleaned.append(ln)
            prev_blank = False
            continue

        is_blank = not ln.strip()
        if is_blank and prev_blank:
            continue
        cleaned.append(ln)
        prev_blank = is_blank
    return "\n".join(cleaned).strip()


def _looks_like_code_line(line: str) -> bool:
    s = (line or "").strip()
    if not s:
        return False
    if s.startswith("```"):
        return True

    if re.match(r"^class\s+[A-Za-z_][A-Za-z0-9_]*\s*:", s):
        return True
    if re.match(r"^def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(", s):
        return True

    strong_prefixes = ("return ", "for ", "while ", "if ", "elif ", "else:", "import ", "from ", "print(", "self.", "@")
    if s.startswith(strong_prefixes):
        return True

    if "self." in s:
        return True

    if re.match(r"^[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+$", s):
        return True

    if re.search(r"\bdef\s+[A-Za-z_][A-Za-z0-9_]*\s*\(", s):
        return True
    if re.search(r"\bclass\s+[A-Za-z_][A-Za-z0-9_]*\s*:", s):
        return True

    return False


def _detect_code_language(code: str) -> str:
    lower = (code or "").lower()
    if re.search(r"\b(class|def|self|print\(|import)\b", lower):
        return "python"
    if re.search(r"#include|std::|cout\s*<<|int\s+main\s*\(", lower):
        return "cpp"
    if re.search(r"\bpublic\s+class\b|\bsystem\.out\.println", lower):
        return "java"
    if re.search(r"\b(function|const|let|var)\b|console\.log", lower):
        return "javascript"
    return ""


def _reflow_inline_python(code_text: str) -> str:
    raw = re.sub(r"\s+", " ", code_text or "").strip()
    if not raw:
        return ""

    # Break the one-line OCR stream into likely statement boundaries.
    break_markers = [
        "class ",
        "def ",
        "for ",
        "while ",
        "if ",
        "elif ",
        "else:",
        "return ",
        "print(",
        "import ",
        "from ",
    ]
    for marker in break_markers:
        raw = re.sub(rf"\s+(?={re.escape(marker)})", "\n", raw)
    raw = re.sub(r"(?<!return)\s+(?=self\.)", "\n", raw, flags=re.IGNORECASE)

    raw = re.sub(
        r"\s*:\s+(?=(?:self\.|for\b|while\b|if\b|return\b|print\(|def\b|class\b|[A-Za-z_][A-Za-z0-9_]*\s*=))",
        ":\n",
        raw,
    )

    lines = []
    in_class = False
    in_function = False
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue

        if s.startswith("class "):
            in_class = True
            in_function = False
            lines.append(s)
            continue

        if s.startswith("def "):
            in_function = True
            lines.append(("    " if in_class else "") + s)
            continue

        if s.startswith(("for ", "while ", "if ", "elif ", "else:")):
            indent = "        " if in_class and in_function else ("    " if (in_class or in_function) else "")
            if ":" in s:
                head, tail = s.split(":", 1)
                lines.append(indent + head.strip() + ":")
                if tail.strip():
                    lines.append(indent + "    " + tail.strip())
                continue
            lines.append(indent + s)
            continue

        if s.startswith(("return ", "print(", "self.")) or re.match(r"^[A-Za-z_][A-Za-z0-9_]*\s*=", s):
            indent = "        " if in_class and in_function else ("    " if (in_class or in_function) else "")
            lines.append(indent + s)
            continue

        lines.append(s)

    return "\n".join(lines).strip()


def _fence_code_blocks(text: str) -> str:
    if not text or "```" in text:
        return text

    lines = [(ln or "").rstrip() for ln in text.splitlines()]
    code_start = None
    for idx, line in enumerate(lines):
        if _looks_like_code_line(line):
            remaining = lines[idx:]
            code_like = sum(1 for ln in remaining if _looks_like_code_line(ln))
            if code_like >= 2:
                code_start = idx
                break

    if code_start is not None:
        prose = "\n".join(lines[:code_start]).strip()
        code = "\n".join(ln.strip() for ln in lines[code_start:] if ln.strip())
        if "\n" not in code:
            code = _reflow_inline_python(code)
        language = _detect_code_language(code)
        fence = "```" + language if language else "```"
        if prose:
            return f"{prose}\n\n{fence}\n{code}\n```"
        return f"{fence}\n{code}\n```"

    # Handle OCR extractions where code is appended inline in a long sentence.
    inline_match = re.search(
        r"\b(class\s+[A-Za-z_][A-Za-z0-9_]*\s*:|def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(|import\s+[A-Za-z_]|from\s+[A-Za-z_].+\s+import\s+)",
        text,
        flags=re.IGNORECASE,
    )
    if inline_match:
        prose = text[:inline_match.start()].strip()
        code_inline = text[inline_match.start():].strip()
        code = _reflow_inline_python(code_inline)
        if code:
            language = _detect_code_language(code)
            fence = "```" + language if language else "```"
            if prose:
                return f"{prose}\n\n{fence}\n{code}\n```"
            return f"{fence}\n{code}\n```"

    return text


def _finalize_markdown(text: str) -> str:
    return _normalize_lines(_fence_code_blocks(text))


def _rule_based_markdown(text: str) -> str:
    if not text or not text.strip():
        return text

    text = re.sub(r"\s*[•●◦]\s+", "\n- ", text)
    text = re.sub(r"([.:])\s+[eE]\s+(?=[A-Za-z_])", r"\1\n- ", text)
    lines = [(ln or "").rstrip() for ln in text.splitlines()]
    out = []
    in_choices = False
    in_fence = False

    for raw in lines:
        fence_marker = raw.strip()
        if fence_marker.startswith("```"):
            out.append(fence_marker)
            in_fence = not in_fence
            in_choices = False
            continue

        if in_fence:
            out.append(raw.rstrip())
            continue

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

        # Normalize OCR bullet artifacts ("e item" / "o item") into markdown bullets.
        bullet = re.match(r"^(?:[\-\*\u2022]|[eEoO0])\s+(.+)$", line)
        if bullet and len(bullet.group(1)) > 2:
            out.append(f"- {bullet.group(1).strip()}")
            in_choices = False
            continue

        out.append(line)

    return _finalize_markdown("\n".join(out))


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
    has_code_without_fence = (
        "```" not in text
        and bool(re.search(r"\b(class|def|return|self\.|print\(|for\s+|if\s+)\b", text))
    )
    has_ocr_bullets = bool(re.search(r"(?:^|\n)\s*[eEoO0]\s+[A-Za-z_]", text))
    return (
        score < 0.43
        or has_ocr_artifacts
        or long_unbroken_lines
        or has_code_without_fence
        or has_ocr_bullets
    )


def _llm_markdown_cleanup(text: str) -> str:
    """
    Optional local LLM cleanup using Ollama.

    Env vars:
    - LLM_CLEANUP_ENABLED: true/false (default false)
    - LLM_CLEANUP_BASE_URL: default http://127.0.0.1:11434
    - LLM_CLEANUP_MODEL: default llama3.1:8b
    - LLM_CLEANUP_MODEL_FALLBACKS: comma-separated model list to try if primary fails
    - LLM_CLEANUP_STYLE_GUIDE_PATH: optional file path for custom markdown style guide
    - LLM_CLEANUP_TIMEOUT_SEC: default 45
    - LLM_CLEANUP_DEBUG: true/false, emit backend logs for model calls
    """
    if not text or not text.strip():
        return text

    if not _truthy(os.getenv("LLM_CLEANUP_ENABLED", "false")):
        return text

    base_url = os.getenv("LLM_CLEANUP_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("LLM_CLEANUP_MODEL", "llama3.1:8b")
    fallback_models = [
        m.strip()
        for m in os.getenv("LLM_CLEANUP_MODEL_FALLBACKS", "").split(",")
        if m.strip() and m.strip() != model
    ]
    timeout = int(os.getenv("LLM_CLEANUP_TIMEOUT_SEC", "45"))
    style_guide = _load_style_guide()

    system_prompt = (
        "You are a deterministic formatter for OCR-extracted exam questions.\n"
        "Follow this style guide exactly:\n"
        f"{style_guide}\n"
        "Important constraints:\n"
        "- Keep semantics unchanged.\n"
        "- Keep all major content.\n"
        "- Use fenced code blocks for code.\n"
        "- Return markdown only."
    )
    user_prompt = (
        "Convert the raw text below into clean GitHub Markdown.\n"
        "RAW_INPUT_START\n"
        f"{text}\n"
        "RAW_INPUT_END"
    )

    models_to_try = [model, *fallback_models]

    for selected_model in models_to_try:
        payload = {
            "model": selected_model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "options": {
                "temperature": 0.0,
            },
        }
        started = time.time()
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
            elapsed = time.time() - started
            _debug_log(f"model={selected_model} elapsed={elapsed:.2f}s chars={len(formatted)}")
            if formatted:
                return formatted
        except Exception as exc:
            _debug_log(f"model={selected_model} request failed: {exc!r}")

    # Keep ingestion resilient; if local LLM is unavailable, use raw text.
    return text


def local_llm_markdown_cleanup_with_meta(text: str) -> tuple[str, bool]:
    """
    Hybrid strategy:
    1) deterministic formatter always
    2) local LLM only for low-quality extraction
    3) similarity guardrails to prevent hallucinated rewrites
    """
    base = _finalize_markdown(_rule_based_markdown(text))
    llm_enabled = _truthy(os.getenv("LLM_CLEANUP_ENABLED", "false"))
    if not llm_enabled:
        return base, False

    force_llm = _truthy(os.getenv("LLM_CLEANUP_FORCE", "false"))
    if not force_llm and not _needs_llm_cleanup(base):
        return base, False

    if force_llm:
        _debug_log("LLM cleanup forced by LLM_CLEANUP_FORCE=true")

    candidate = _llm_markdown_cleanup(base)
    if not candidate:
        return base, True
    candidate = _finalize_markdown(candidate)

    # Guardrail: if the model rewrites too aggressively, keep deterministic version.
    norm_base = re.sub(r"\s+", " ", base).strip().lower()
    norm_candidate = re.sub(r"\s+", " ", candidate).strip().lower()
    ratio = SequenceMatcher(None, norm_base, norm_candidate).ratio()
    length_ratio = len(norm_candidate) / max(1, len(norm_base))
    if ratio < 0.58 or length_ratio < 0.50 or length_ratio > 1.85:
        _debug_log(
            f"guardrail rejected candidate ratio={ratio:.3f} length_ratio={length_ratio:.3f}"
        )
        return base, True

    return _normalize_lines(candidate), True


def local_llm_markdown_cleanup(text: str) -> str:
    cleaned, _ = local_llm_markdown_cleanup_with_meta(text)
    return cleaned
