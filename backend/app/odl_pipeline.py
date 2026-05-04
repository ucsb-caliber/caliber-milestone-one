"""
opendataloader-pdf based extraction pipeline.

This is the Tier 1 replacement for the M2 (Detectron2/EfficientDet + Tesseract)
parser. It runs the `opendataloader-pdf` Java CLI (via the Python wrapper) on
the uploaded PDF, walks the resulting JSON tree in reading order, segments
question boundaries with the same regexes used by `m2/layout_ingest.py`,
re-emits per-question Markdown, and runs the existing LLM cleanup guardrails.

Public API mirrors `extract_questions_with_m2` so `process_pdf_background`
can swap implementations behind the `PDF_PARSER` env flag.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from .llm_cleanup import local_llm_markdown_cleanup_with_meta
from .m2_pipeline import _keywords_from_text, _stable_title


# ===================== QUESTION DETECTION =====================
# Mirrors m2/layout_ingest.QUESTION_START_PATTERNS so behavior matches the
# legacy pipeline exactly.
QUESTION_START_PATTERNS = [
    r"^\s*Problem\s+\d+\b",
    r"^\s*Question\s+\d+\b",
    r"^\s*Q\s*\d+\b",
    r"^\s*\d+\.\s+.+[. ?:].*",
]
QUESTION_START_RE = re.compile("|".join(QUESTION_START_PATTERNS), re.IGNORECASE)


# ===================== ID HELPERS =====================

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _stable_hash16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _normalize_exam_id(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return "exam_unknown"
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9_\-]+", "", s)
    return s or "exam_unknown"


def _make_question_id(exam_id: str, ingestion_id: str, question_index: int) -> str:
    seed = f"{exam_id}::{ingestion_id}::q{question_index}"
    return "q_" + _stable_hash16(seed)


def _make_ingestion_id(created_at: str, source_pdf: str, exam_id: str) -> str:
    seed = f"{created_at}::{source_pdf}::{exam_id}"
    return "ing_" + _stable_hash16(seed)


# ===================== ENV =====================

def _truthy(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _odl_hybrid_enabled() -> bool:
    return _truthy(os.getenv("ODL_HYBRID_ENABLED", "false"))


def _odl_timeout_sec() -> int:
    try:
        return max(10, int(os.getenv("ODL_TIMEOUT_SEC", "120")))
    except ValueError:
        return 120


# ===================== JSON WALK + MARKDOWN EMITTER =====================
# JSON shape (per opendataloader-pdf docs):
#   { "file name": ..., "kids": [ {page-level node}, ... ] }
# Each page node contains `kids` with content elements: paragraph, heading,
# list, table, caption, image, header, footer, text block, ...
#
# We DFS the tree and emit a flat list of (element, page_number, markdown_chunk).
# Question boundaries are detected by matching QUESTION_START_RE against the
# rendered chunk's first non-empty line.

_TEXT_TYPES = {"paragraph", "heading", "caption", "list item"}
_CONTAINER_TYPES = {"page", "header", "footer", "text block", "table cell"}
# Container types we transparently descend through when flattening the tree.
# `page` is included so we accept both the legacy "root.kids=[page, ...]"
# shape and the current flat "root.kids=[content elements]" shape that
# opendataloader-pdf actually emits.
_DESCEND_TYPES = {"page", "text block", "header", "footer"}
_ORDERED_LIST_HINTS = ("ordered", "decimal", "number", "arabic", "roman")
_NUMERIC_LIST_PREFIX_RE = re.compile(r"^\s*\d+\.\s+")


def _safe_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    return str(v)


def _render_paragraph(node: Dict[str, Any]) -> str:
    return _safe_str(node.get("content")).strip()


def _render_heading(node: Dict[str, Any]) -> str:
    level_raw = node.get("heading level")
    try:
        level = max(1, min(6, int(level_raw))) if level_raw is not None else 2
    except (TypeError, ValueError):
        level = 2
    content = _safe_str(node.get("content")).strip()
    if not content:
        return ""
    return f"{'#' * level} {content}"


def _render_caption(node: Dict[str, Any]) -> str:
    content = _safe_str(node.get("content")).strip()
    if not content:
        return ""
    return f"_{content}_"


def _render_list_item(node: Dict[str, Any], marker: str) -> str:
    content = _safe_str(node.get("content")).strip()
    nested_lines: List[str] = []
    for child in node.get("kids") or []:
        rendered = _render_node(child)
        if rendered:
            nested_lines.extend(
                "    " + ln if ln else "" for ln in rendered.splitlines()
            )

    # opendataloader-pdf often inlines the numeral into the item's `content`
    # (e.g. content="1. (15 points) Write..."). Prepending an ordered marker
    # blindly produces "1. 1. (15 points) ..." which breaks downstream title
    # extraction and question-start regexes.
    is_ordered_marker = bool(re.fullmatch(r"\d+\.", marker.strip()))
    if is_ordered_marker and content and _NUMERIC_LIST_PREFIX_RE.match(content):
        head = content
    elif content:
        head = f"{marker} {content}".rstrip()
    else:
        head = marker

    if nested_lines:
        return "\n".join([head, *nested_lines])
    return head


def _render_list(node: Dict[str, Any]) -> str:
    style = (_safe_str(node.get("numbering style")) or "").lower()
    items = node.get("list items") or []
    is_ordered = "ordered" in style or "decimal" in style or "number" in style
    out_lines: List[str] = []
    for idx, item in enumerate(items, start=1):
        marker = f"{idx}." if is_ordered else "-"
        out_lines.append(_render_list_item(item, marker))
    return "\n".join([ln for ln in out_lines if ln is not None])


def _cell_text(cell: Dict[str, Any]) -> str:
    parts: List[str] = []
    for child in cell.get("kids") or []:
        rendered = _render_node(child)
        if rendered:
            parts.append(rendered.replace("\n", " ").strip())
    return " ".join(p for p in parts if p).strip()


def _render_table(node: Dict[str, Any]) -> str:
    rows = node.get("rows") or []
    if not rows:
        return ""

    grid: List[List[str]] = []
    max_cols = 0
    for row in rows:
        cells = row.get("cells") or []
        row_out: List[str] = []
        for cell in cells:
            text = _cell_text(cell).replace("|", "\\|")
            span = max(1, int(cell.get("column span") or 1))
            row_out.append(text)
            for _ in range(span - 1):
                row_out.append("")
        grid.append(row_out)
        max_cols = max(max_cols, len(row_out))

    if not grid or max_cols == 0:
        return ""

    for row in grid:
        while len(row) < max_cols:
            row.append("")

    header = grid[0]
    body = grid[1:]
    sep = ["---"] * max_cols

    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(sep) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def _render_image(node: Dict[str, Any]) -> str:
    src = _safe_str(node.get("source"))
    if src:
        return f"![image]({src})"
    return ""


def _render_node(node: Dict[str, Any]) -> str:
    """Render a single JSON content node into markdown."""
    if not isinstance(node, dict):
        return ""
    ntype = (_safe_str(node.get("type")) or "").lower()

    if ntype == "paragraph":
        return _render_paragraph(node)
    if ntype == "heading":
        return _render_heading(node)
    if ntype == "caption":
        return _render_caption(node)
    if ntype == "list":
        return _render_list(node)
    if ntype == "table":
        return _render_table(node)
    if ntype in {"image", "picture"}:
        return _render_image(node)
    if ntype in _CONTAINER_TYPES:
        # Container: render children top-to-bottom.
        parts: List[str] = []
        for child in node.get("kids") or []:
            rendered = _render_node(child)
            if rendered:
                parts.append(rendered)
        return "\n\n".join(parts)
    # Unknown leaf - try `content`, else give up.
    content = _safe_str(node.get("content")).strip()
    return content


def _coerce_page_num(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _flatten_top_level_elements(
    root: Dict[str, Any],
) -> Iterable[Tuple[Dict[str, Any], int]]:
    """
    Yield (element_node, page_number) pairs in reading order.

    Handles two JSON shapes that opendataloader-pdf has emitted across
    versions:
      1. flat   - root.kids = [paragraph, heading, list, ...]   (current)
      2. paged  - root.kids = [page, page, ...]; page.kids = [...]
    We transparently descend through container elements (`page`, `text
    block`, `header`, `footer`) and yield one event per block-level element
    (paragraph, heading, list, table, caption, image, ...).
    """

    def _walk(container: Dict[str, Any], inherited_page: int) -> Iterable[Tuple[Dict[str, Any], int]]:
        page_num = _coerce_page_num(container.get("page number"), inherited_page)
        for child in container.get("kids") or []:
            if not isinstance(child, dict):
                continue
            child_type = (_safe_str(child.get("type")) or "").lower()
            child_page = _coerce_page_num(child.get("page number"), page_num)
            if child_type in _DESCEND_TYPES:
                yield from _walk(child, child_page)
            else:
                yield child, child_page

    yield from _walk(root, 0)


def _is_ordered_numbered_list(node: Dict[str, Any]) -> bool:
    if not isinstance(node, dict):
        return False
    if (_safe_str(node.get("type")) or "").lower() != "list":
        return False
    style = (_safe_str(node.get("numbering style")) or "").lower()
    return any(hint in style for hint in _ORDERED_LIST_HINTS)


def _iter_question_candidates(
    root: Dict[str, Any],
) -> Iterable[Tuple[Dict[str, Any], int, str]]:
    """
    Yield (element, page_number, rendered_markdown) tuples in reading order.

    Special-cases ordered/numbered top-level lists so each list item is
    emitted as its own candidate; without this, opendataloader-pdf's habit of
    grouping every numbered question into one `list` element would collapse
    all questions into a single chunk and our segmenter would only see one
    question-start line.
    """
    for element, page_num in _flatten_top_level_elements(root):
        if _is_ordered_numbered_list(element):
            items = element.get("list items") or []
            for idx, item in enumerate(items, start=1):
                if not isinstance(item, dict):
                    continue
                rendered = _render_list_item(item, f"{idx}.")
                item_page = _coerce_page_num(item.get("page number"), page_num)
                yield item, item_page, rendered
        else:
            yield element, page_num, _render_node(element)


# ===================== ODL EXECUTION =====================

class OdlRunError(RuntimeError):
    pass


def _resolve_cli() -> Optional[str]:
    return shutil.which("opendataloader-pdf")


def _build_cli_args(
    *,
    pdf_path: Path,
    output_dir: Path,
    hybrid: bool,
    hybrid_url: Optional[str],
) -> List[str]:
    args = [
        "opendataloader-pdf",
        str(pdf_path),
        "--output-dir",
        str(output_dir),
        "--format",
        "json,markdown",
        "--quiet",
    ]
    if hybrid:
        args.extend(["--hybrid", "docling-fast"])
        if hybrid_url:
            args.extend(["--hybrid-url", hybrid_url])
    return args


def _run_odl_subprocess(
    *,
    pdf_path: Path,
    output_dir: Path,
    should_cancel: Callable[[], bool],
    progress_callback: Optional[Callable[[int, int, str], None]],
) -> None:
    cli = _resolve_cli()
    hybrid = _odl_hybrid_enabled()
    hybrid_url = (os.getenv("ODL_HYBRID_URL") or "").strip() or None
    timeout_sec = _odl_timeout_sec()

    if cli:
        args = _build_cli_args(
            pdf_path=pdf_path,
            output_dir=output_dir,
            hybrid=hybrid,
            hybrid_url=hybrid_url,
        )
        try:
            proc = subprocess.Popen(
                args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except FileNotFoundError as exc:
            raise OdlRunError(f"opendataloader-pdf CLI not found: {exc}") from exc

        deadline = time.time() + timeout_sec
        last_heartbeat = time.time()
        while True:
            if proc.poll() is not None:
                break
            if should_cancel():
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                raise OdlRunError("canceled")
            if time.time() > deadline:
                proc.terminate()
                try:
                    proc.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    proc.kill()
                raise OdlRunError(f"timeout after {timeout_sec}s")
            now = time.time()
            if progress_callback and now - last_heartbeat >= 2.0:
                progress_callback(0, 1, "Parsing PDF (opendataloader)")
                last_heartbeat = now
            time.sleep(0.2)

        stdout, stderr = proc.communicate()
        if proc.returncode != 0:
            raise OdlRunError(
                f"opendataloader-pdf exited {proc.returncode}: {stderr.strip() or stdout.strip()}"
            )
        return

    # Fallback: in-process Python wrapper. No mid-call cancel.
    try:
        import opendataloader_pdf  # type: ignore
    except Exception as exc:
        raise OdlRunError(
            "opendataloader-pdf is not installed. "
            "Run `pip install opendataloader-pdf` (Java 11+ required)."
        ) from exc

    convert_kwargs: Dict[str, Any] = {
        "input_path": [str(pdf_path)],
        "output_dir": str(output_dir),
        "format": "json,markdown",
    }
    if hybrid:
        convert_kwargs["hybrid"] = "docling-fast"
        if hybrid_url:
            convert_kwargs["hybrid_url"] = hybrid_url

    if progress_callback:
        progress_callback(0, 1, "Parsing PDF (opendataloader)")

    done = threading.Event()
    error_holder: Dict[str, BaseException] = {}

    def _runner() -> None:
        try:
            opendataloader_pdf.convert(**convert_kwargs)
        except BaseException as exc:  # noqa: BLE001
            error_holder["err"] = exc
        finally:
            done.set()

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    deadline = time.time() + timeout_sec
    last_heartbeat = time.time()
    while not done.is_set():
        if time.time() > deadline:
            raise OdlRunError(f"timeout after {timeout_sec}s")
        if progress_callback and time.time() - last_heartbeat >= 2.0:
            progress_callback(0, 1, "Parsing PDF (opendataloader)")
            last_heartbeat = time.time()
        time.sleep(0.2)
    if "err" in error_holder:
        raise OdlRunError(f"opendataloader-pdf convert failed: {error_holder['err']!r}")


def _find_output_files(output_dir: Path, pdf_stem: str) -> Tuple[Optional[Path], Optional[Path]]:
    """Locate the .json / .md outputs that opendataloader-pdf wrote."""
    json_path: Optional[Path] = None
    md_path: Optional[Path] = None

    direct_json = output_dir / f"{pdf_stem}.json"
    direct_md = output_dir / f"{pdf_stem}.md"
    if direct_json.exists():
        json_path = direct_json
    if direct_md.exists():
        md_path = direct_md

    if json_path is None:
        for candidate in output_dir.rglob(f"{pdf_stem}.json"):
            json_path = candidate
            break
    if md_path is None:
        for candidate in output_dir.rglob(f"{pdf_stem}.md"):
            md_path = candidate
            break
    if json_path is None:
        for candidate in output_dir.rglob("*.json"):
            json_path = candidate
            break
    return json_path, md_path


# ===================== QUESTION SEGMENTATION =====================

def _is_question_start(rendered_md: str) -> bool:
    if not rendered_md:
        return False
    first_line = rendered_md.lstrip().splitlines()[0] if rendered_md.strip() else ""
    # Strip leading markdown heading markers before matching the regex.
    first_line = re.sub(r"^#{1,6}\s+", "", first_line).strip()
    return bool(QUESTION_START_RE.match(first_line))


def _segment_questions(
    root: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Walk JSON in reading order, group elements into question buckets."""
    questions: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for _element, page_num, rendered in _iter_question_candidates(root):
        if not rendered or not rendered.strip():
            continue

        if _is_question_start(rendered):
            if current is not None:
                questions.append(current)
            current = {
                "start_page": page_num or 1,
                "pages": {page_num} if page_num else set(),
                "chunks": [rendered],
            }
            continue

        if current is None:
            # Skip preamble before the first question marker.
            continue

        if page_num:
            current["pages"].add(page_num)
        current["chunks"].append(rendered)

    if current is not None:
        questions.append(current)
    return questions


def _summarize_top_level_shape(root: Dict[str, Any]) -> str:
    kids = root.get("kids") or []
    types: List[str] = []
    for child in kids[:8]:
        if isinstance(child, dict):
            types.append((_safe_str(child.get("type")) or "?").lower())
    suffix = "" if len(kids) <= 8 else f",+{len(kids) - 8}"
    return f"top_kids={len(kids)} types=[{','.join(types)}{suffix}]"


def _join_chunks(chunks: List[str]) -> str:
    return "\n\n".join(c.strip() for c in chunks if c and c.strip()).strip()


# ===================== PUBLIC ENTRY POINT =====================

def extract_questions_with_odl(
    file_content: bytes,
    source_name: str,
    output_dir: Path,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> List[Dict[str, str]]:
    """
    Parse a PDF with opendataloader-pdf and return Milestone 1 question dicts.

    Mirrors the contract of `extract_questions_with_m2`:
    - returns `[]` on cancellation or non-fatal errors so callers fall back
      to the secondary extractor.
    - emits progress through `progress_callback(current, total, message)`
      with phase-bucketed values that `m2_progress` already understands.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    def cancel_requested() -> bool:
        return bool(should_cancel and should_cancel())

    if cancel_requested():
        if progress_callback:
            progress_callback(0, 1, "Canceled before parser start")
        return []

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file_content)
        tmp_pdf_path = Path(tmp.name)

    # Per-run output dir keeps multiple uploads from clobbering each other.
    run_dir = output_dir / f"odl_{int(time.time() * 1000)}_{os.getpid()}"
    run_dir.mkdir(parents=True, exist_ok=True)

    created_at = _utc_now_iso()
    exam_id = _normalize_exam_id(Path(source_name).stem or "upload")
    ingestion_id = _make_ingestion_id(
        created_at=created_at,
        source_pdf=str(tmp_pdf_path),
        exam_id=exam_id,
    )

    try:
        if progress_callback:
            progress_callback(0, 1, "Parsing PDF (opendataloader)")

        parse_start = time.time()
        try:
            _run_odl_subprocess(
                pdf_path=tmp_pdf_path,
                output_dir=run_dir,
                should_cancel=cancel_requested,
                progress_callback=progress_callback,
            )
        except OdlRunError as exc:
            if str(exc) == "canceled":
                print("[odl] canceled mid-run")
                return []
            print(f"[odl] parser failed: {exc}")
            return []
        print(f"[odl] parsed source={source_name} in {time.time() - parse_start:.1f}s")

        if cancel_requested():
            return []

        json_path, _md_path = _find_output_files(run_dir, tmp_pdf_path.stem)
        if json_path is None or not json_path.exists():
            print(f"[odl] no JSON output found in {run_dir}")
            return []

        try:
            root = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"[odl] failed to read JSON output: {exc!r}")
            return []

        if progress_callback:
            progress_callback(0, 1, "Segmenting questions")

        raw_questions = _segment_questions(root)
        print(
            f"[odl] segmented {len(raw_questions)} raw questions "
            f"({_summarize_top_level_shape(root)})"
        )
        if not raw_questions:
            print(
                "[odl] no question markers found - falling back to legacy extractor; "
                f"json_path={json_path}"
            )

        formatting_total = max(1, len(raw_questions))
        if progress_callback:
            progress_callback(0, formatting_total, "Formatting extracted questions")

        out: List[Dict[str, str]] = []
        for idx, q in enumerate(raw_questions, start=1):
            if cancel_requested():
                if progress_callback:
                    progress_callback(
                        idx - 1,
                        formatting_total,
                        f"Formatting canceled after {idx - 1}/{formatting_total} questions",
                    )
                break

            text = _join_chunks(q.get("chunks") or [])
            if not text:
                if progress_callback:
                    progress_callback(idx, formatting_total, f"Formatting question {idx}/{formatting_total}")
                continue

            cleaned_text, llm_called = local_llm_markdown_cleanup_with_meta(text)

            qid = _make_question_id(
                exam_id=exam_id,
                ingestion_id=ingestion_id,
                question_index=idx,
            )
            run_tag = hashlib.sha1(qid.encode("utf-8")).hexdigest()[:10]

            out.append(
                {
                    "title": _stable_title(cleaned_text, fallback=f"Extracted Question {idx}"),
                    "text": cleaned_text,
                    "tags": f"auto-generated,pdf-upload,odl,run:{run_tag}",
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
