# Setup, Operations, and Testing

## 1) Local Development Setup

### Prerequisites
- Python 3.10 or 3.11 (recommended for parser stack compatibility)
- Node.js + npm
- Supabase project (URL, anon key, database connection string)
- System tools for PDF/OCR:
  - macOS: `brew install poppler tesseract`
  - Ubuntu/Debian: `sudo apt-get install -y poppler-utils tesseract-ocr`

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Required backend env values (`backend/.env`):
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Optional backend env values:
- `UPLOAD_DIR` (default: `uploads`)
- `LLM_CLEANUP_ENABLED`, `LLM_CLEANUP_BASE_URL`, `LLM_CLEANUP_MODEL`, `LLM_CLEANUP_TIMEOUT_SEC`

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Required frontend env values (`frontend/.env`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE` (defaults to `http://localhost:8000`)

## 2) Supabase Configuration

### Auth
- Enable email/password auth in Supabase.
- Use project URL + anon key in both backend and frontend env files.
- Backend validates access tokens per request.

### Storage buckets (private)
Create both buckets as private:
- `question-images`
- `question-pdfs`

Recommended RLS policies for each bucket:
- INSERT (authenticated): owner folder only
- SELECT (authenticated): allow read for signed URL generation
- DELETE (authenticated): owner folder only

Policy shape (replace bucket ID as needed):
```sql
(bucket_id = 'question-images'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
```
```sql
true
```
```sql
(bucket_id = 'question-images'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
```

Use the same expressions for `question-pdfs` by replacing `'question-images'` with `'question-pdfs'`.

## 3) Database Migrations (Alembic)

From `backend/`:
```bash
alembic current
alembic history --verbose
alembic upgrade head
```

Create migrations:
```bash
alembic revision --autogenerate -m "describe change"
# or
alembic revision -m "manual migration"
```

Rollback:
```bash
alembic downgrade -1
alembic downgrade <revision_id>
```

If a migration was already applied manually and Alembic is behind:
```bash
alembic stamp <revision_id>
alembic upgrade head
```

## 4) Testing and Smoke Checks

### Core smoke test
1. Sign up/sign in via frontend.
2. Complete onboarding.
3. Upload a PDF and verify `upload-status` progresses.
4. Confirm draft questions appear in Question Bank.
5. Verify or edit questions.
6. Create a course and join it from a student account (course code).
7. Create an assignment (release + due dates + late policy + at least one question).
8. Open assignment as student and confirm autosave/resume works.
9. Submit assignment and verify submitted state in student course view.
10. As admin, verify Users and All Courses pages load and role updates work.

### API docs testing
- Backend docs at `http://localhost:8000/docs`.
- If logged in at `http://localhost:5173`, cookie-based auth usually works automatically.
- Manual fallback: use `Authorize` with `Bearer <access_token>`.

## 5) Troubleshooting

### Frontend cannot start (missing Vite vars)
- Confirm `frontend/.env` exists and has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Restart Vite after env changes.

### Backend auth failures (401/invalid token)
- Verify backend `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Verify frontend and backend point to the same Supabase project.
- Sign out/in to refresh token.

### Database connection issues
- Use Supabase connection pooling URI in `DATABASE_URL`.
- Confirm password and host are correct.

### Upload parsing or OCR issues
- Check `tesseract` and poppler binaries are installed and on `PATH`.
- First parse can be slower due to model initialization/downloads.

### Storage upload/sign URL failures
- Confirm bucket names exactly match (`question-images`, `question-pdfs`).
- Confirm buckets are private.
- Confirm RLS policies are present for authenticated role.

## 6) UI Component Workflow (shadcn)
- Components are copied into project source, not used as a runtime package.
- Add component:
```bash
cd frontend
npx shadcn@latest add <component-name>
```
- Installed components live under `frontend/src/components/ui/` and are safe to customize directly.
