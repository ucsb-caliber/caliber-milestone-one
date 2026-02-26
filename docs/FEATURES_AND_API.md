# Caliber Features and API

## Scope
Caliber Milestone One is a fullstack teaching platform prototype for:
- authenticating users and onboarding them into student/instructor/admin experiences
- extracting question drafts from uploaded PDFs
- curating a question bank
- managing courses and enrollment
- authoring, releasing, and delivering assignments with saved student progress

## Architecture Snapshot
- Frontend: React + Vite (hash-based routing)
- Backend: FastAPI + SQLModel
- Database/Auth/Storage: Supabase (Postgres + Auth + Storage)
- Migrations: Alembic
- PDF extraction: in-repo Milestone 2 layout parser with fallback extractor
- Optional cleanup pass: local Ollama model for markdown cleanup

## Role Model
| Area | Student | Instructor | Admin |
|---|---|---|---|
| Sign in / onboarding | Yes | Yes | Yes |
| Question bank CRUD | No | Yes | Yes |
| Verify extracted questions | No | Yes | Yes |
| Create and manage courses | No | Yes (own courses) | Yes |
| Join course by code | Yes | Optional (student view) | Optional |
| Pin/unpin courses | Yes | Yes | Yes |
| Create/edit/delete assignments | No | Yes (own courses) | Yes |
| Student assignment page | Yes | Preview mode on own assignments | Yes |
| Assignment progress write | Yes | No (preview is read-only for progress) | Yes |
| Manage users and roles | No | No | Yes |
| Admin all-courses overview | No | No | Yes |

## Current Feature Set

### Authentication and user lifecycle
- Supabase auth with JWT-protected backend endpoints.
- Onboarding completion gate before full app access.
- Profile and preferences endpoints (`/api/user/profile`, `/api/user/preferences`, `/api/user/onboarding`).
- Admin role management in `/api/users` and `/api/users/{user_id}`.

### Question ingestion and curation
- PDF upload starts async background processing (`POST /api/upload-pdf`).
- Upload status polling (`GET /api/upload-status/{job_id}`) for progress UI.
- Question drafts support verification workflow by source PDF (`POST /api/questions/verify-by-source`).
- Bulk delete of unverified drafts by source (`DELETE /api/questions-by-source/unverified`).
- Question CRUD supports optional `image_url` and `source_pdf` references.

### Storage model
- `question-images` bucket for question images (private; signed URLs on demand).
- `question-pdfs` bucket for source PDFs (private; signed URLs on demand).
- DB stores storage paths, not permanent public URLs.

### Courses
- Instructor/admin course CRUD.
- Student join by invite code (`POST /api/courses/join`).
- Course pinning (`GET /api/courses/pins`, `PUT /api/courses/{course_id}/pin`).
- Admin all-courses view (`GET /api/admin/courses-overview`).

### Assignments and delivery
- Assignment CRUD with required scheduling + question selection.
- Create-time validation includes:
  - release date
  - soft due date
  - hard due date on/after soft due date
  - late policy percentage (0-100)
  - at least one selected question
- Assignment release-now endpoint (`POST /api/assignments/{assignment_id}/release-now`).
- Instructor assignment view/editor with question replacement/removal.
- Student assignment page with autosave/resume via assignment progress endpoints.
- Submission/resubmission behavior on student assignment experience.

### Dashboard behavior
- Instructor course dashboard groups assignment timeline into in-progress, completed, and unreleased.
- Student dashboard shows released assignments and submission state.
- Admin has user management and all-course operational visibility.

## Frontend Route Map (hash routes)
- Auth + onboarding: `#home` (authenticated landing), onboarding gate managed in app state
- Question workflows: `#questions`, `#create-question`, `#edit-question`
- Profile: `#profile`
- Admin: `#admin/users`, `#admin/courses`
- Instructor courses: `#courses`, `#course/{courseId}`
- Assignment authoring/view:
  - `#course/{courseId}/assignment/new`
  - `#course/{courseId}/assignment/{assignmentId}/edit`
  - `#course/{courseId}/assignment/{assignmentId}/view`
- Student experience:
  - `#student-courses`
  - `#student-course/{courseId}`
  - `#student-course/{courseId}/assignment/{assignmentId}`

## Backend API Groups
- Upload and parsing
  - `POST /api/upload-pdf`
  - `GET /api/upload-status/{job_id}`
- Questions
  - `GET /api/questions`, `GET /api/questions/all`, `GET /api/questions/{id}`
  - `POST /api/questions`, `POST /api/questions/batch`
  - `PUT /api/questions/{id}`, `DELETE /api/questions/{id}`
  - `POST /api/questions/verify-by-source`
  - `DELETE /api/questions-by-source/unverified`
- Current user
  - `GET /api/user`
  - `PUT /api/user/profile`, `PUT /api/user/preferences`, `POST /api/user/onboarding`
- Admin users
  - `GET /api/users`, `GET /api/users/{user_id}`, `PUT /api/users/{user_id}`
- Courses
  - `POST /api/courses`, `GET /api/courses`, `GET /api/courses/all`
  - `GET /api/courses/{course_id}`, `PUT /api/courses/{course_id}`, `DELETE /api/courses/{course_id}`
  - `POST /api/courses/join`
  - `GET /api/courses/pins`, `PUT /api/courses/{course_id}/pin`
  - `GET /api/admin/courses-overview`
- Assignments and progress
  - `POST /api/assignments`, `GET /api/assignments/{assignment_id}`
  - `PUT /api/assignments/{assignment_id}`, `DELETE /api/assignments/{assignment_id}`
  - `POST /api/assignments/{assignment_id}/release-now`
  - `GET /api/assignments/{assignment_id}/progress`
  - `PUT /api/assignments/{assignment_id}/progress`

## Known Gaps / Follow-ups
- Release-now exists as API; most scheduling is currently set through assignment edit/create flow.
- Question ordering in assignments is list-based; there is no dedicated drag-drop reordering UI.
- Markdown docs are consolidated here and in `docs/SETUP_OPERATIONS_AND_TESTING.md`.
