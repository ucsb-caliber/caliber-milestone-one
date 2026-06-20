# Question System Master Plan

## Purpose

This document is the planning spine for cleaning up Caliber Milestone One's question system. The main goals are:

- support true multi-part questions end to end
- let instructors manage questions in a GitHub-backed folder using local coding tools
- make question identifiers stable across local files, imports, exports, assignments, and student answers
- clarify database ownership, sharing, verification, drafts, and versioning
- reduce overloaded fields and implicit JSON contracts that currently make question behavior fragile

## Implementation Status

This branch implements the core of the plan:

- structured `question.content` validation and legacy conversion
- one-row simple questions and embedded multi-part questions
- stable `qid` plus `version` handling with database uniqueness on `(qid, version)`
- assignment question refs with qid/version snapshots while preserving legacy integer IDs
- qid-keyed student answers and grading data, with legacy integer-key fallback
- scoped question-bank visibility for private, course, school, and global questions
- zip-based local folder import, dry-run, conflict handling, and export
- folder asset files round-trip through zip import/export
- optional assignment export files keyed by qid/version refs
- import-result lookup and export-download endpoints for recent zip operations
- native multipart authoring with ordered mixed-type parts
- frontend rendering, student submission, grading, and question-bank flows that understand structured content
- review provenance fields (`reviewed_at`, `reviewed_by`) for draft/ready/archive workflows
- editor controls for `draft`, `ready`, and `archived` question states
- question-bank exports for owned, visible/filtered, and selected questions

The remaining work is mostly product hardening rather than the foundational contract:

- direct GitHub app/OAuth sync, if zip import/export is not enough
- optional normalized assignment-question tables if JSON refs become too limiting

## Current State

### Database shape

Questions live in the `question` table. Important fields:

- `id`: database primary key, currently used by assignments and student progress
- `qid`: globally unique generated ID like `Q00000001`
- `title`, `text`, `tags`, `keywords`, `school`, `user_school`, `course`, `course_type`
- `question_type`: values currently include `mcq`, `true_false`, `fr`, `short_answer`, and experimental `multipart`
- `answer_choices`: `TEXT` containing JSON, but with different meanings by question type
- `correct_answer`: flat string for auto-graded questions
- `source_pdf`, `pdf_url`, `image_url`
- `user_id`: owner
- `is_verified`: draft/verified flag

Assignments store `assignment_questions` as a JSON list of integer `question.id` values. Student progress stores `answers` as a JSON object keyed by stringified `question.id`. Instructor grading stores `grading_data` the same way.

### Current multi-part behavior

There is partial frontend support for a `multipart` question type in `CreateQuestion.jsx` and `StudentPreview.jsx`. The current implementation stores child question database IDs inside `answer_choices`. The backend currently returns `0.0` points for `multipart` in `_question_max_points`, and grading response construction only understands auto-graded flat questions or manually graded free-response/rubric questions.

This means multipart is not yet a real first-class question model. It is a UI experiment using an overloaded field.

### Current draft/shared behavior

`is_verified` currently does too much. It means "PDF-extracted draft has been approved" in upload workflows, but manual questions are automatically verified. It does not express whether a question is private to one instructor, shared within a school/course, available globally, archived, forked, or imported from a local folder.

`GET /api/questions` returns the authenticated user's questions. `GET /api/questions/all` returns all questions to any authenticated user. That is convenient for prototyping but too broad for a shared/private bank.

## Problems To Solve

1. Multi-part questions need a dedicated structure.
2. Question IDs need to be stable outside the database.
3. Assignments and student progress should not depend only on database integer IDs.
4. Import/export needs a clear file format and conflict behavior.
5. Sharing must be explicit, not inferred from all-questions endpoints.
6. Verification, draft state, and publication state need separate concepts.
7. Existing JSON blobs need schema versioning and validation.
8. Grading and point totals must work recursively for multi-part questions.
9. The UI needs one consistent authoring model for simple, rubric, and multi-part questions.
10. Migration must preserve current assignments and progress.

## Target Concepts

### Question identity

Use three identifiers with distinct meanings:

- `id`: internal database row ID. Never use this in exported files.
- `qid`: stable canonical question ID. Used in assignments, progress, imports, exports, and cross-environment references.
- `version`: content version for a `qid`.

Recommended `qid` format:

```text
<namespace>:<slug>
```

Examples:

```text
ucsb-cs16:arrays-count-positive
ucsb-cs24:linked-list-remove-node
demo:intro-binary-search
```

The current generated `Q00000001` IDs can remain valid as legacy IDs, but newly authored/imported questions should use human-readable namespaced IDs.

### Question publication state

Split the current `is_verified` idea into separate fields:

- `draft_state`: `draft`, `ready`, `archived`
- `visibility`: `private`, `course`, `school`, `global`
- `origin`: `manual`, `pdf_extract`, `github_import`, `system_seed`
- `owner_user_id`
- `school_scope`
- `course_scope`
- `reviewed_at`, `reviewed_by`

`is_verified` can be retained temporarily as a compatibility field mapped to `draft_state == ready`.

### Question content model

Introduce a structured `content` JSON field or normalized child tables. For speed and compatibility, a JSON-first approach is likely best for the next milestone, with validation at the API boundary.

Proposed `question.content` shape:

```json
{
  "schema_version": 1,
  "stem": "Question text in markdown.",
  "assets": [
    {
      "kind": "image",
      "path": "assets/diagram.png",
      "alt": "Diagram of a linked list"
    }
  ],
  "parts": [
    {
      "part_id": "a",
      "label": "Part A",
      "type": "mcq",
      "prompt": "Choose the best answer.",
      "choices": [
        { "id": "A", "text": "Option text" },
        { "id": "B", "text": "Option text" }
      ],
      "correct_answer": "A",
      "points": 1
    },
    {
      "part_id": "b",
      "label": "Part B",
      "type": "free_response",
      "prompt": "Explain your reasoning.",
      "rubric": [
        { "points": 4, "criteria": "Complete reasoning" },
        { "points": 2, "criteria": "Partial reasoning" },
        { "points": 0, "criteria": "Incorrect or missing" }
      ]
    }
  ]
}
```

Simple questions are represented as one part. Multi-part questions are represented as multiple parts. A multipart question should not be a list of other database question IDs unless we intentionally support "composite questions" as a separate feature.

### Composite question references

There are two plausible designs:

- Embedded parts: one question owns all parts in its `content.parts`.
- Composite references: one parent question references child `qid`s.

Recommendation: use embedded parts first. It makes import/export, assignment snapshots, grading, and student answers much simpler. Add composite references later only if instructors need to reuse the same child question independently.

## GitHub Folder Workflow

### Goal

Instructors should be able to keep a local question bank folder in a GitHub repo, use coding tools to create or modify questions, and import/export with Caliber.

### Proposed repository layout

```text
caliber-questions/
  manifest.json
  questions/
    arrays-count-positive/
      question.json
      prompt.md
      assets/
        diagram.png
    linked-list-remove-node/
      question.json
      prompt.md
  assignments/
    lab-03.json
  README.md
```

### `manifest.json`

```json
{
  "schema_version": 1,
  "namespace": "ucsb-cs16",
  "title": "UCSB CS16 Question Bank",
  "default_visibility": "private",
  "default_school_scope": "UCSB"
}
```

### `question.json`

```json
{
  "schema_version": 1,
  "qid": "ucsb-cs16:arrays-count-positive",
  "version": 1,
  "title": "Count Positive Values",
  "question_type": "multipart",
  "tags": ["arrays", "loops"],
  "keywords": ["array traversal", "counting"],
  "course_type": "intro CS",
  "visibility": "private",
  "draft_state": "ready",
  "prompt_file": "prompt.md",
  "content": {
    "stem": "Use the array shown below.",
    "parts": []
  }
}
```

The importer should allow either inline `content.stem` or `prompt_file`. Markdown files are friendlier for local editing; JSON is better for metadata and machine validation.

### Import behavior

Import should be deterministic and auditable:

- validate all files before writing anything
- resolve `qid` collisions by policy
- support dry-run mode
- report created, updated, skipped, archived, and errored questions
- never silently change `qid`
- preserve old versions when published questions are modified
- store import source metadata, including repo path, commit SHA if available, and imported timestamp

Conflict modes:

- `create_only`: fail if `qid` exists
- `update_draft`: update only if existing question is not used by released assignments
- `new_version`: create a new version for existing `qid`
- `fork`: create a new namespaced `qid`

### Export behavior

Export should write a local folder that can round-trip back into Caliber:

- include `manifest.json`
- write one folder per canonical `qid`
- export images/assets using stable relative paths
- preserve `qid`, `version`, visibility, tags, rubrics, and part IDs
- optionally export assignments by `qid`, not database ID

## Database Changes

### Recommended new columns on `question`

- `version`: integer, default `1`
- `content`: JSON/JSONB or `TEXT` with validated JSON
- `draft_state`: string
- `visibility`: string
- `origin`: string
- `owner_user_id`: replacement or alias for current `user_id`
- `school_scope`: string
- `course_scope`: nullable string/int depending on course model
- `parent_qid`: nullable, only if composite references are supported
- `source_repo`: nullable string
- `source_path`: nullable string
- `source_commit`: nullable string
- `content_hash`: string for import idempotency
- `updated_at`: datetime

### Recommended uniqueness

Use one of these:

- unique `(qid, version)`
- unique `(namespace, slug, version)` if qid is split

Also enforce one current/latest version per `qid`, either with `is_latest` or by querying max version.

### Assignment changes

Replace or augment `assignment.assignment_questions` with structured question references:

```json
[
  {
    "qid": "ucsb-cs16:arrays-count-positive",
    "version": 2,
    "points_override": null
  }
]
```

Eventually move this to an `assignment_question` table:

- `assignment_id`
- `qid`
- `version`
- `position`
- `points_override`
- `question_snapshot`

The snapshot is important: released assignments should not change when a professor edits the question bank later.

### Progress changes

Student answers should be keyed by stable refs:

```json
{
  "ucsb-cs16:arrays-count-positive": {
    "a": "A",
    "b": "The loop visits each element once."
  }
}
```

Grading data should follow the same structure:

```json
{
  "ucsb-cs16:arrays-count-positive": {
    "parts": {
      "b": {
        "score": 4,
        "comment": "Clear reasoning."
      }
    },
    "question_comment": ""
  }
}
```

During migration, support both old integer keys and new `qid` keys.

## Backend API Changes

### Question CRUD

Add JSON endpoints alongside the current multipart form endpoint:

- `POST /api/questions/json`
- `PUT /api/questions/{qid}`
- `GET /api/questions/by-qid/{qid}`
- `GET /api/questions/{qid}/versions`

Current `POST /api/questions` can remain for compatibility with image upload/form workflows.

### Import/export endpoints

Add:

- `POST /api/question-imports/dry-run`
- `POST /api/question-imports`
- `GET /api/question-imports/{import_id}`
- `POST /api/question-exports`
- `GET /api/question-exports/{export_id}/download`

The backend should accept a zip file first. Direct GitHub integration can come later; the immediate workflow can be "professor exports zip from local folder or uploads repo zip."

### Visibility-aware listing

Replace broad `GET /api/questions/all` usage with scoped query parameters:

- own questions
- shared with my course
- shared with my school
- global
- drafts
- archived

The backend should enforce visibility, not rely on frontend filtering.

## Frontend Changes

### Authoring

Build a single question editor around the structured content model:

- top-level metadata panel
- markdown stem editor
- ordered parts list
- part type selector
- MCQ/true-false answer controls
- free-response rubric controls
- point totals derived from parts
- asset picker/upload
- preview that uses the exact student renderer

Remove the current special case where multipart questions store child IDs inside `answer_choices`.

### Question bank

Add filters for:

- mine/shared/global
- draft/ready/archived
- origin
- course/school scope
- question type
- tags

Show `qid` prominently and support copy/search by `qid`.

### Import/export UI

Add an instructor-only import screen:

- upload zip
- run dry validation
- show diff summary
- choose conflict mode
- import
- show created/updated/skipped/errors

Add export actions:

- export selected questions
- export filtered bank
- export assignment question set

## Grading And Student Experience

### Rendering

The student renderer should render:

- question stem once
- each part in order
- per-part controls based on type
- progress/autosave using `{ qid: { part_id: answer } }`

### Scoring

Point total should be the sum of parts:

- MCQ/true-false: part points, default `1`
- free-response: max rubric score
- multipart: sum of child parts

Auto-grading should operate per part. Manual grading should display only manual parts but include auto-graded parts in total score.

### Backward compatibility

Existing questions can be adapted:

- `mcq` and `true_false`: one part with choices and correct answer
- `fr` and `short_answer`: one part with rubric data from `answer_choices`
- experimental `multipart`: migrate only after deciding whether the child-ID behavior should become composite references or be converted into embedded copies

## Migration Plan

### Phase 1: Contract and validation

- Add Pydantic schemas for structured question content.
- Add a converter from legacy fields to `content`.
- Add backend helpers that compute points from `content`.
- Add tests for MCQ, true/false, free-response, short-answer, and multipart content.

### Phase 2: Database compatibility layer

- Add new columns while keeping old columns.
- Backfill `content` from existing records.
- Continue returning legacy response fields until frontend migration is complete.
- Add read helpers by both `id` and `qid`.

### Phase 3: Stable assignment references

- Store assignment questions as `qid/version` refs and optionally snapshots.
- Preserve old `assignment_questions` during transition.
- Make grading/progress accept old integer keys and new qid/part keys.

### Phase 4: Editor and renderer

- Replace the current multipart picker with native parts editing.
- Update `StudentPreview`, `StudentAssignmentPage`, and grading pages to use structured parts.
- Ensure total points, autosave, submission, and released grade display use the same helpers.

### Phase 5: Import/export

- Define local folder schema.
- Build zip parser and validator.
- Add dry-run and import endpoints.
- Add export endpoint.
- Add instructor UI.

### Phase 6: Sharing model

- Replace `GET /api/questions/all` usage with visibility-aware endpoints.
- Add private/course/school/global filters.
- Add archive behavior.
- Add ownership/forking rules for shared questions.

### Phase 7: Cleanup

- Stop writing new data into overloaded `answer_choices` shapes.
- Keep compatibility reads for old records.
- Remove or hide legacy fields from editor internals.
- Document migration and round-trip workflows.

## Open Decisions

1. Should multipart mean embedded parts only, or can it also reference reusable child questions?
2. Should instructors be allowed to edit a shared question in place, or must shared edits create a new version/fork?
3. Should assignment release freeze a full question snapshot?
4. Should GitHub sync be zip import/export first, or direct GitHub OAuth/app integration?
5. What is the canonical namespace for Caliber-generated questions?
6. Should `qid` be globally unique across all schools, or unique only inside a namespace?
7. Do we need per-course visibility before school/global visibility?
8. Should imported draft questions default to private until explicitly shared?

## Critical Implementation Notes

- Do not use database integer IDs in exported files.
- Do not key new student answers by integer IDs.
- Do not overload `answer_choices` with unrelated JSON shapes for new work.
- Do not let editing a bank question mutate already released assignments unless that is explicitly intended.
- Do not expose all users' questions through a general authenticated endpoint once visibility exists.
- Treat local imports as untrusted input: validate markdown paths, asset paths, qid format, part IDs, and JSON schema.
- Keep migration idempotent and reversible where possible.

## Suggested First Pull Request

The first implementation PR should be small and foundational:

- add structured question content schemas
- add legacy-to-content conversion helpers
- add point-total helper based on content
- add unit tests for simple and multipart content
- add docs for the local folder schema

This gives the project a stable target without immediately rewriting the whole editor, assignment flow, and grading system at once.
