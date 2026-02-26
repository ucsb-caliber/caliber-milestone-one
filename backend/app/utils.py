import io
import re
import shutil
from typing import Dict, List, Tuple

import PyPDF2
import pdfplumber

# OCR path is optional. We import lazily and only run when needed.
try:
    import pypdfium2 as pdfium  # type: ignore
    import pytesseract  # type: ignore
except Exception:  # pragma: no cover - optional runtime dependency path
    pdfium = None
    pytesseract = None


QUESTION_START_PATTERNS = [
    r"^\s*Problem\s+\d+\b",
    r"^\s*Question\s+\d+\b",
    r"^\s*Q\s*\d+\b",
    r"^\s*\d+[\.)]\s+",
]
QUESTION_START_RE = re.compile("|".join(QUESTION_START_PATTERNS), re.IGNORECASE)


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def _extract_pages_text(file_content: bytes) -> List[Tuple[int, str]]:
    """Extract per-page text using pdfplumber first, then PyPDF2 fallback."""
    pages: List[Tuple[int, str]] = []

    try:
        with pdfplumber.open(io.BytesIO(file_content)) as pdf:
            for idx, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                pages.append((idx, text))
    except Exception:
        pages = []

    if any((text or "").strip() for _, text in pages):
        return pages

    # fallback for tricky documents that pdfplumber doesn't parse well
    pages = []
    reader = PyPDF2.PdfReader(io.BytesIO(file_content))
    for idx, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        pages.append((idx, page_text))
    return pages


def _ocr_pages_text(file_content: bytes) -> List[Tuple[int, str]]:
    """OCR each page if pytesseract + pypdfium2 + tesseract binary are available."""
    if pdfium is None or pytesseract is None:
        return []
    if shutil.which("tesseract") is None:
        return []

    pages: List[Tuple[int, str]] = []
    doc = pdfium.PdfDocument(io.BytesIO(file_content))
    try:
        for idx in range(len(doc)):
            page = doc[idx]
            bitmap = page.render(scale=2.0)
            pil_img = bitmap.to_pil()
            text = pytesseract.image_to_string(pil_img, config="--oem 3 --psm 6 -l eng")
            pages.append((idx + 1, text or ""))
    finally:
        doc.close()

    return pages


def _split_questions_from_pages(pages: List[Tuple[int, str]]) -> List[Dict[str, str]]:
    questions: List[Dict[str, str]] = []
    current_lines: List[str] = []

    def flush_question():
        if not current_lines:
            return
        text = "\n".join(current_lines).strip()
        if not text:
            return
        first_line = _normalize_space(current_lines[0])
        title = first_line[:80] if first_line else "Extracted Question"
        keywords = _keywords_from_text(text)
        questions.append(
            {
                "title": title,
                "text": text,
                "tags": "auto-generated,pdf-upload",
                "keywords": keywords,
            }
        )

    for _, page_text in pages:
        if not page_text:
            continue

        lines = [ln.strip() for ln in page_text.splitlines()]
        lines = [ln for ln in lines if ln]

        for line in lines:
            if QUESTION_START_RE.match(line):
                flush_question()
                current_lines = [line]
            else:
                if current_lines:
                    current_lines.append(line)

    flush_question()

    # fallback if no explicit numbered starts were found
    if not questions:
        merged = "\n".join((text or "") for _, text in pages).strip()
        if not merged:
            return []

        paragraphs = [p.strip() for p in re.split(r"\n\s*\n+", merged) if p.strip()]
        for idx, para in enumerate(paragraphs[:30], start=1):
            snippet = _normalize_space(para)
            questions.append(
                {
                    "title": f"Extracted Question {idx}",
                    "text": para,
                    "tags": "auto-generated,pdf-upload",
                    "keywords": _keywords_from_text(snippet),
                }
            )

    return questions


def _keywords_from_text(text: str, max_keywords: int = 8) -> str:
    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9]{3,}", text)]
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


def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract plain text from PDF bytes for debugging or fallback paths."""
    pages = _extract_pages_text(file_content)
    return "\n".join((text or "") for _, text in pages)


def send_to_agent_pipeline(text: str, filename: str) -> List[Dict[str, str]]:
    """
    Backward-compatible parser entrypoint.

    This now performs regex-based question extraction from already-extracted text.
    For the upload pipeline, prefer extract_questions_from_pdf_bytes().
    """
    if not text or not text.strip():
        return [
            {
                "title": "Extracted Preview 1",
                "text": f"No text could be extracted from {filename}.",
                "tags": "auto-generated,pdf-upload",
                "keywords": "pdf,upload,empty",
            }
        ]

    pages = [(1, text)]
    questions = _split_questions_from_pages(pages)
    return questions[:100]


def extract_questions_from_pdf_bytes(file_content: bytes, filename: str) -> List[Dict[str, str]]:
    """Main extraction path for uploaded PDFs with OCR fallback for scanned pages."""
    pages = _extract_pages_text(file_content)
    questions = _split_questions_from_pages(pages)

    # OCR fallback: useful for image-based/scanned PDFs where text extractors return little.
    if len(questions) < 2:
        ocr_pages = _ocr_pages_text(file_content)
        if ocr_pages:
            ocr_questions = _split_questions_from_pages(ocr_pages)
            if len(ocr_questions) > len(questions):
                questions = ocr_questions

    if not questions:
        preview_text = _normalize_space("\n".join((t or "") for _, t in pages))[:300]
        return [
            {
                "title": "Extracted Preview",
                "text": preview_text or f"Unable to parse content from {filename}.",
                "tags": "auto-generated,pdf-upload,fallback",
                "keywords": "pdf,upload,fallback",
            }
        ]

    return questions[:100]
