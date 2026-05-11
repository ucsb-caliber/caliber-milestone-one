# ODL Question Segmentation Fix

Status: Proposed
Target: `backend/app/odl_pipeline.py`
Related: `docs/ODL_MIGRATION_PLAN.md`

## Problem

On uploads where a single question contains a bulleted sub-list, the ODL pipeline splits each bullet into its own question. Example: a database-design exam where "Question 2" has six bulleted sub-points yields six separate `Q4`/`Q5`/`Q6`/... entries in the question bank, each titled just `"2."` / `"3."` / `"4."` / ...

### Root cause

Two interacting bugs in `_iter_question_candidates` + `_render_list_item` + `_is_question_start`:

1. **Loose list classification.** `_is_ordered_numbered_list` matches any `numbering style` containing `ordered`, `decimal`, `number`, `arabic`, or `roman`. opendataloader-pdf sometimes labels bullet lists with one of those styles, especially when the list-recognition heuristic sees a vertical run of similarly-formatted items.
2. **Synthetic numerals leaked into rendered text.** When `_iter_question_candidates` unrolls a list it calls `_render_list_item(item, f"{idx}.")`, which prepends `"1."`, `"2."`, `"3."`, … to each item's text. If the list-item's own `content` is empty (children render as `nested_lines`), the rendered chunk becomes `"2.\nThe airport accommodates..."`.
3. **Weak question-start regex.** The fourth pattern `r"^\s*\d+\.\s+.+[. ?:].*"` then matches the synthetic numeral on every unrolled bullet, so each bullet is treated as a new question start.
4. **First-line title extraction.** `_stable_title` then grabs `"2."` (the first line) as the question title, hiding the real content from the UI.

### What this fix does NOT change

ODL still ingests the entire PDF and emits JSON for every page-level element. The fix is purely in the segmentation step that runs after ingestion — which already-parsed elements get grouped into which question bucket and which get dropped as preamble.

## Plan

### Step 1 — Diagnose, don't guess

Before changing logic, capture the actual JSON for a problematic PDF.

- Run the parser locally on the bad PDF, save the run dir (`uploads/layout_debug/odl_<ts>_<pid>/<stem>.json`).
- Inspect the element with the bullets:
  - What `type` and `numbering style` does opendataloader-pdf assign?
  - What is the tree depth — is the bullet list nested inside another `list item`, a `text block`, or a paragraph? Or is it a direct child of root?
  - What are the bounding-box left-x values for the question's lead paragraph vs the bullets?
- The answers dictate which of the heuristics below are actually needed.

Add a debug switch (e.g. `ODL_DEBUG=1`) to `_segment_questions` that prints `(page, type, first_40_chars, is_start?)` for every candidate. Cheap, very high signal during tuning.

### Step 2 — Stop synthesizing list numerals into the rendered text (one-line fix)

The single most impactful change. In `_iter_question_candidates`, render unrolled list items with **no marker prefix**, because the marker is only added for human-readable markdown and is causing both the regex misfire and the title bug.

Two ways to implement:

- Pass an empty marker: `_render_list_item(item, "")` and handle the empty-marker case in `_render_list_item` so it doesn't emit a leading space.
- Or add a `for_segmentation: bool` flag to `_render_list_item` that skips the `f"{marker} {content}"` join.

After this, even if a list still gets unrolled, the resulting chunk starts with `"The airport accommodates..."` instead of `"2.\nThe airport accommodates..."`. That alone:

- Fixes the `title == "2."` bug because `_stable_title` now sees the real first line.
- Prevents the `^\s*\d+\.` regex from misfiring on synthetic numbers.

### Step 3 — Only unroll the outermost ordered list

A sub-list nested inside a question is never a list of questions; it's content of the parent question. Carry depth/parent context through the tree walk.

- Change `_flatten_top_level_elements` to yield `(element, page, depth, parent_type)` instead of `(element, page)`.
- In `_iter_question_candidates`, only unroll when `depth == 0` (or when `parent_type == "page"` for the paged JSON shape). Otherwise yield the list element whole and let `_render_list` produce a normal bulleted block inside the current question.
- Even safer alternative: only unroll a list when **every** item's rendered first line independently matches a strong question marker (`Problem N` / `Question N` / `Q N`). If items don't look like question starts, the list is content, not a question index.

### Step 4 — Tighten `_is_question_start` (two-pass segmentation)

Current patterns:

```python
QUESTION_START_PATTERNS = [
    r"^\s*Problem\s+\d+\b",
    r"^\s*Question\s+\d+\b",
    r"^\s*Q\s*\d+\b",
    r"^\s*\d+\.\s+.+[. ?:].*",
]
```

Two changes:

1. **Minimum content guard on the bare-numeric pattern.** Require at least ~12 non-whitespace chars after the `\d+\.`, and require the next non-numeric token to start with a capital letter. Bare `"2."` and `"2. foo"` will no longer match.
2. **Anchored / two-pass segmentation.** Run `_segment_questions` twice:
   - **Pass 1** uses only the three strong patterns (`Problem N` / `Question N` / `Q N`).
   - If Pass 1 returns ≥ 2 questions, use it and skip the bare-numeric pattern entirely. This mirrors the `max(qstarts, nstarts, key=len)` trick in `backend/app/m2/layout_ingest.py` on the `opendataloader-m2` branch.
   - Otherwise fall back to a Pass 2 that also accepts the (now-tightened) bare-numeric pattern.

This single change handles most exams correctly because almost every exam labels its questions `Problem N` or `Question N` explicitly.

### Step 5 — Bbox left-margin tiebreaker (optional, only if Steps 2–4 aren't enough)

Geometry-based fallback for PDFs where opendataloader-pdf flattens nested lists to the top level.

- Compute the mode of `bounding box[0]` (left-x) across all paragraph-typed elements on the first 2–3 pages — that's the page's main left margin.
- Reject a `_is_question_start` match whose own left-x is more than ~20 PDF points to the right of that mode. Sub-bullets are indented; top-level question numbers aren't.

This is the most robust fix and matches how a human eye distinguishes "Question 2" from a bullet at a glance, but it's also the most code. Only reach for it if the corpus still has misclassifications after Steps 2–4.

### Step 6 — Skip marker lines when computing the title

Belt-and-suspenders for the title display even if a stray `"2."` line sneaks through. In `_stable_title`:

- Skip leading lines that are pure markers: `^\s*\d+\.?\s*$`, `^\s*Problem\s+\d+\s*$`, `^\s*Question\s+\d+\s*$`, `^\s*Q\s*\d+\s*$`.
- Use the next non-empty line as the title candidate.
- Keep the existing 80-char truncation and markdown-heading-strip behavior as a fallback.

This change alone would have prevented the screenshot's `"2."` titles even without fixing segmentation.

### Step 7 — Validate

Add an `ODL_DEBUG=1`-gated diagnostic dump in `odl_pipeline.py` that, on every parse, also writes:

- The raw JSON path.
- `(question_index, page, first_60_chars, len)` for each segmented question.
- Which pass was used (`strong` vs `fallback`).

Re-run against:

- The database-design exam from the original bug screenshot.
- 2–3 more representative PDFs (code-heavy, math-heavy, multi-column if available).

Acceptance criteria:

- Question count matches a human count within ±1.
- No question whose title is a bare number, a single bullet, or just `"Problem N"` with no body.
- No question whose body is empty.

## Recommended implementation order

1. **Step 1 + Step 2 + Step 6** — do these first. ~20 lines of code total. Step 2 alone removes the title-is-just-`"2."` bug; Step 6 is cheap insurance.
2. **Step 4 (two-pass)** — biggest segmentation quality win for the smallest risk. Most exams have `Problem N` / `Question N` markers; let those dominate.
3. **Step 3 (depth-aware unrolling)** — removes the entire class of "sub-bullet became its own question."
4. **Step 5 (bbox left-margin)** — only if there's still a long tail of misclassifications after 1–3.

## Files touched

- `backend/app/odl_pipeline.py` — segmentation/render changes, debug switch, two-pass orchestration.
- `backend/app/m2_pipeline.py` — `_stable_title` updated to skip marker lines (used by both M2 and ODL paths).
- `backend/.env.example` — add `ODL_DEBUG=false`.
- (Optional) a small test fixture: 1–2 anonymized JSON outputs under `backend/tests/fixtures/odl/` plus a unit test for `_segment_questions` that asserts question counts and titles.

## Out of scope

- Changing what opendataloader-pdf ingests (still the whole PDF).
- LLM-generated titles (today both pipelines use the first non-empty line; an LLM-summarized title would be a separate change).
- Sub-question detection within a question (e.g. detecting `(a)` / `(b)` parts as structured sub-questions) — left for a future pass.
