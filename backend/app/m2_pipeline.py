from __future__ import annotations

import hashlib
import os
import re
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .llm_cleanup import local_llm_markdown_cleanup_with_meta

_MODEL_LOCK = threading.Lock()
_CACHED_MODEL: Any = None


def _get_model(layout_ingest_mod: Any) -> Any:
    global _CACHED_MODEL
    if _CACHED_MODEL is not None:
        return _CACHED_MODEL

    with _MODEL_LOCK:
        if _CACHED_MODEL is None:
            _CACHED_MODEL = layout_ingest_mod.load_layout_model()
    return _CACHED_MODEL


def _keywords_from_text(text: str, max_keywords: int = 8) -> str:
    import re

    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9]{3,}", text or "")]
    stop = {
        "that", "this", "with", "from", "your", "have", "will", "what", "when",
        "where", "which", "their", "there", "into", "about", "after", "before",
        "question", "problem", "points", "show", "using", "given", "suppose",
    }
    uniq: List[str] = []
    seen = set()
    for w in words:
        if w in stop or w in seen:
            continue
        seen.add(w)
        uniq.append(w)
        if len(uniq) >= max_keywords:
            break
    return ",".join(uniq) if uniq else "pdf,upload"


def _stable_title(text: str, fallback: str = "Extracted Question") -> str:
    first_line = (text or "").strip().splitlines()[0] if (text or "").strip() else ""
    # Guard against markdown heading prefixes leaking into stored title.
    candidate = first_line.strip()
    candidate = re.sub(r"^#{1,6}\s*", "", candidate).strip()
    candidate = candidate[:80]
    return candidate or fallback


def extract_questions_with_m2(
    file_content: bytes,
    source_name: str,
    output_dir: Path,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> List[Dict[str, str]]:
    """
    Run the copied Milestone 2 layout pipeline on an uploaded PDF and map results
    into Milestone 1's question-dict format.
    """
    from .m2 import layout_ingest as m2

    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_content)
        tmp_pdf_path = Path(tmp.name)

    try:
        def cancel_requested() -> bool:
            return bool(should_cancel and should_cancel())

        if cancel_requested():
            if progress_callback:
                progress_callback(0, 1, "Canceled before parser start")
            return []

        m2.SHOW_CROPS = False
        m2.SAVE_CROPS = False
        m2.START_PAGE = 1
        m2.END_PAGE = 0
        m2.OUTPUT_DIR = str(output_dir)

        created_at = m2.utc_now_iso()
        exam_id = m2.normalize_exam_id(Path(source_name).stem or "upload")
        ingestion_id = m2.make_ingestion_id(
            created_at=created_at,
            source_pdf=str(tmp_pdf_path),
            exam_id=exam_id,
        )

        if progress_callback:
            progress_callback(0, 1, "Loading parser model")
        model_start = time.time()
        model = _get_model(m2)
        print(f"[m2] model ready in {time.time() - model_start:.1f}s")

        if cancel_requested():
            if progress_callback:
                progress_callback(0, 1, "Canceled before rendering pages")
            return []

        if progress_callback:
            progress_callback(0, 1, "Rendering PDF pages")
        render_start = time.time()
        render_dpi = max(120, int(os.getenv("M2_RENDER_DPI", "170")))
        pages = m2.convert_from_path(str(tmp_pdf_path), dpi=render_dpi)
        print(
            f"[m2] rendered {len(pages)} pages at {render_dpi} dpi "
            f"in {time.time() - render_start:.1f}s"
        )

        if cancel_requested():
            if progress_callback:
                progress_callback(0, max(1, len(pages)), "Canceled before parsing pages")
            return []

        if progress_callback:
            progress_callback(0, max(1, len(pages)), f"Parsing {len(pages)} pages")
        parse_start = time.time()
        questions = m2.parse_pdf_to_questions(
            pages,
            model,
            progress_callback=progress_callback,
            should_cancel=cancel_requested,
        )
        print(f"[m2] extracted {len(questions)} raw questions in {time.time() - parse_start:.1f}s")

        formatting_total = max(1, len(questions))
        if progress_callback:
            progress_callback(0, formatting_total, "Formatting extracted questions")

        out: List[Dict[str, str]] = []
        for idx, q in enumerate(questions, start=1):
            if cancel_requested():
                if progress_callback:
                    progress_callback(
                        idx - 1,
                        formatting_total,
                        f"Formatting canceled after {idx - 1}/{formatting_total} questions",
                    )
                break

            qid = m2.make_question_id(exam_id=exam_id, ingestion_id=ingestion_id, question_index=idx)
            text = (q.text or "").strip()
            if not text:
                if progress_callback:
                    progress_callback(idx, formatting_total, f"Formatting question {idx}/{formatting_total}")
                continue
            cleaned_text, llm_called = local_llm_markdown_cleanup_with_meta(text)

            # Keep a deterministic tag to trace provenance back to M2 parser runs.
            run_tag = hashlib.sha1(qid.encode("utf-8")).hexdigest()[:10]
            out.append(
                {
                    "title": _stable_title(cleaned_text, fallback=f"Extracted Question {idx}"),
                    "text": cleaned_text,
                    "tags": f"auto-generated,pdf-upload,m2-layout,run:{run_tag}",
                    "keywords": _keywords_from_text(cleaned_text),
                    "llm_called": llm_called,
                }
            )
            if progress_callback:
                progress_callback(idx, formatting_total, f"Formatting question {idx}/{formatting_total}")

        return out
    finally:
        try:
            tmp_pdf_path.unlink(missing_ok=True)
        except Exception:
            pass
