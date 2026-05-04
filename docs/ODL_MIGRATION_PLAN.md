# PDF Parser Migration Plan: M2 Layout + Tesseract → opendataloader-pdf

Status: Proposed
Owner: TBD
Target: replace Tier 1 of the upload pipeline (and most of the Ollama cleanup pass) with [`opendataloader-pdf`](https://github.com/opendataloader-project/opendataloader-pdf) to reduce per-upload latency by an order of magnitude on the common case.

## Why

Current bottlenecks in `process_pdf_background` (`backend/app/main.py`) and the M2 pipeline (`backend/app/m2_pipeline.py`, `backend/app/m2/layout_ingest.py`):

- Detectron2 / EfficientDet PubLayNet model load (first-run download + per-process load).
- `pdf2image.convert_from_path` rasterization at 170 DPI.
- Per-page `pytesseract.image_to_data` OCR with a 45 s timeout.
- Per-question Ollama cleanup pass (`local_llm_markdown_cleanup_with_meta`), gated by `_needs_llm_cleanup` heuristics that frequently fire on OCR output.

`opendataloader-pdf` (Apache-2.0, Java + Python wrapper) reports 0.02 s/page in local mode and 0.46 s/page in hybrid mode on CPU, with #1-ranked accuracy in their public benchmark. It emits structured Markdown + JSON (with bounding boxes, semantic types, reading order) directly, which removes most of the deterministic-cleanup and LLM-cleanup work we do today.

## Expected latency change (8-page digital exam PDF)

| Stage | Today | After (local) | After (hybrid, scanned) |
|---|---|---|---|
| Rasterize | 1-3 s | 0 | 0 |
| Layout detect | ~5 s | ~1-2 s JVM cold start | ~1-2 s JVM cold start |
| OCR | 8-24 s | 0 | ~3-4 s |
| Per-question LLM cleanup | 0-200 s | ~0 (heuristics skip) | ~0 |
| **Total** | **15-225 s** | **~2-5 s** | **~5-10 s** |

## Scope

### Replaced

| Current | After |
|---|---|
| `extract_questions_with_m2` (`backend/app/m2_pipeline.py`) | New `extract_questions_with_odl` (`backend/app/odl_pipeline.py`) |
| `_get_model` / `load_layout_model` | Removed - odl is deterministic Java, no PyTorch model load |
| `pdf2image.convert_from_path` rasterization | Removed - odl operates on PDF bytes directly |
| Per-page `pytesseract.image_to_data` (45 s timeout) | Removed for digital PDFs; replaced by odl hybrid OCR for scanned pages |
| `parse_pdf_to_questions` block-grouping state machine | Reimplemented over odl JSON elements (`paragraph`/`heading`/`list`/`table`) |
| `_rule_based_markdown` + `_fence_code_blocks` + `_reflow_inline_python` | Largely unnecessary; keep a thin code-fence shim |
| `_llm_markdown_cleanup` Ollama call | Becomes rare; same gating, but `_needs_llm_cleanup` should mostly skip |

### Kept

- `/api/upload-pdf` endpoint surface, `UploadResponse`, upload-job table + token, cancel polling, progress phases.
- `local_llm_markdown_cleanup_with_meta` and the `SequenceMatcher` / length-ratio guardrail.
- Tier 2 (`extract_questions_from_pdf_bytes`) and Tier 3 (`send_to_agent_pipeline`) as safety nets behind a feature flag for ~2 weeks, then deleted.
- Frontend - no changes.

## Concrete steps

### Step 0 - Smoke test

Pick 5-10 representative PDFs from past uploads (digital exam, scanned exam, code-heavy, math-heavy, multi-column). Run:

```bash
pip install "opendataloader-pdf[hybrid]"
opendataloader-pdf-hybrid --port 5002 &
opendataloader-pdf --hybrid docling-fast --format json,markdown <pdf>
```

Verify:
- `Problem N` / `Question N` paragraphs land as discrete `paragraph`/`heading` elements.
- `page number` and `bounding box` are sensible.
- Code blocks survive (we will re-fence them).
- Math/formula handling acceptable for our exam corpus (or accept hybrid + `--enrich-formula`).

If quality is unacceptable, stop here.

### Step 1 - Dependencies + env

- `backend/requirements.txt`: add `opendataloader-pdf>=2.4` (hybrid extra optional).
- `README.md` + `docs/SETUP_OPERATIONS_AND_TESTING.md`: replace `brew install poppler tesseract` with Java 11+ install (`brew install --cask temurin` / `apt install openjdk-17-jre`). Python 3.10/3.11 still required.
- `backend/.env.example`: add
  - `PDF_PARSER=odl` (`odl` | `m2` for rollback)
  - `ODL_HYBRID_ENABLED=false`
  - `ODL_HYBRID_URL=http://127.0.0.1:5002`
  - `ODL_OCR_LANG=eng`
  - `ODL_TIMEOUT_SEC=120`
- Optional: docker-compose service for `opendataloader-pdf-hybrid` (mirrors `coding-runner` pattern).

### Step 2 - New module `backend/app/odl_pipeline.py`

Public API mirrors the M2 one so `process_pdf_background` swaps by flag:

```python
def extract_questions_with_odl(
    file_content: bytes,
    source_name: str,
    output_dir: Path,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> List[Dict[str, str]]: ...
```

Internals:

1. Write bytes to `tempfile.NamedTemporaryFile(suffix=".pdf")`.
2. Two execution modes:
   - **Subprocess (preferred)**: `subprocess.Popen(["opendataloader-pdf", tmp_pdf, "--output-dir", out_dir, "--format", "json,markdown", *hybrid_args])`. A watchdog thread polls `should_cancel()` and `proc.kill()`s on cancel. Hybrid args (`--hybrid docling-fast`, `--hybrid-mode full`, `--hybrid-url ...`) added when `ODL_HYBRID_ENABLED=true`.
   - **In-process fallback**: `opendataloader_pdf.convert(...)` if CLI not on PATH.
3. Read `out_dir/<stem>.json`.
4. Walk elements in `id` order (XY-Cut++ reading order). Run question segmenter (Step 3).
5. Reuse `_stable_title`, `_keywords_from_text`, `local_llm_markdown_cleanup_with_meta`, `_finalize_markdown` - no duplication.

### Step 3 - Question segmentation over odl JSON

Port of `parse_pdf_to_questions` operating on `{type, content, page number, bounding box, heading level}`:

- `is_question_start(element)`: same regexes as `m2/layout_ingest.QUESTION_START_PATTERNS` applied to `content`. Treat `heading` elements matching those patterns as starts too.
- Aggregate elements between starts. Preserve markdown structure:
  - `heading` → `#`/`##` from `heading level`
  - `list` → leave as-is from odl Markdown, or rebuild from JSON list items
  - `table` → use the corresponding region from odl's Markdown output (GFM tables)
  - `paragraph` → join with blank lines

Two assembly strategies; do the simpler first:

- **A (ship first)**: use JSON for question boundary detection (start `id` → end `id`), then concatenate `content` per element.
- **B (defer)**: pure JSON Markdown emitter for full control.

### Step 4 - Wire into `process_pdf_background`

In `backend/app/main.py` near line 1298:

```python
parser_choice = os.getenv("PDF_PARSER", "odl").strip().lower()
extractor = extract_questions_with_odl if parser_choice == "odl" else extract_questions_with_m2
question_dicts = extractor(
    file_content=file_content,
    source_name=storage_path,
    output_dir=Path(UPLOAD_DIR) / "layout_debug",
    progress_callback=m2_progress,
    should_cancel=cancel_requested,
)
```

Tier 2/3 fallbacks intact for now.

### Step 5 - Progress phases

odl runs as a single batch instead of per-page hooks. Re-bucket `m2_progress`:

- 0-10: Upload received (unchanged)
- 10-25: "Parsing PDF" (emit at start and on subprocess exit)
- 25-40: "Segmenting questions"
- 40-100: "Formatting + saving" (existing)

Subprocess watchdog emits a heartbeat every ~2 s so the UI doesn't freeze.

### Step 6 - Cancellation

- Subprocess mode: `proc.terminate()` then `proc.kill()` after 2 s grace.
- In-process mode: cancel checked only between `convert()` returning and per-question formatting.

### Step 7 - LLM cleanup interaction

Don't remove `local_llm_markdown_cleanup_with_meta`. Tighten:

- `LLM_CLEANUP_FORCE=false` default (already).
- Confirm `_needs_llm_cleanup` heuristics don't over-fire on odl output. If they do (e.g., long lines in code blocks), tune thresholds or short-circuit when source is odl.
- Net: most questions skip Ollama, biggest perceived latency win.

### Step 8 - Rollout

1. Land behind `PDF_PARSER=odl` flag, default `m2` for one release.
2. Shadow run both extractors on ~50 uploads, log question counts + diffs to `layout_debug/`.
3. Flip default to `odl`.
4. After 2 weeks of clean signal:
   - Delete `backend/app/m2/`.
   - Drop `torch`, `effdet`, `layoutparser`, `pdf2image`, `pytesseract` from `requirements.txt`.
   - Drop `brew install poppler tesseract` from README.
   - Big install-size + CI-time win.

### Step 9 - Docs + ops

- Update `README.md` "Question Pipeline" section.
- Update `docs/FEATURES_AND_API.md` if it describes the parser.
- Add to `docs/SETUP_OPERATIONS_AND_TESTING.md`:
  - Java install (`brew install --cask temurin` / `apt install openjdk-17-jre`).
  - Optional hybrid server: `opendataloader-pdf-hybrid --port 5002 --force-ocr --ocr-lang eng`.
  - Verification: `opendataloader-pdf --version`, `java -version`.

## Risks / decisions to make now

1. **Java in the runtime image.** Adds ~150-200 MB; acceptable trade for losing torch+effdet (which is bigger).
2. **Hybrid mode infra.** Separate `opendataloader-pdf-hybrid` HTTP server.
   - (a) Skip hybrid - rely on local mode; scanned PDFs fall through to current Tier 2 OCR.
   - (b) Run hybrid as docker-compose sidecar like `coding-runner`. Required for math/formula and high-quality scanned exams.
   - **Recommendation**: start with (a), add (b) if smoke test shows need.
3. **Per-call JVM cold start (~1-2 s).** odl README warns each `convert()` spawns a JVM. Fine for background tasks; for sub-second uploads, switch to hybrid HTTP mode (warm JVM).
4. **Mid-call cancellation.** Acceptable to only honor cancel before/after `convert()` given typical 1-5 s runs. Subprocess + kill gives mid-call cancel if needed.
5. **Question segmentation accuracy.** odl gives `paragraph` granularity, not OCR-word granularity. `Problem N` / `N.` regexes should match `paragraph.content` cleanly, but verify against our exam corpus before deleting `m2/`.

## Implementation order

Step 0 → Step 1-2 → Step 3-4 → Step 5-6 → Step 8 shadow → Step 8 flip → Step 8 cleanup → Step 9 docs.
