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
- `SUPABASE_SERVICE_ROLE_KEY`

Optional backend env values:
- `SUPABASE_STORAGE_PDF_BUCKET` (default: `question-pdfs`)
- `SUPABASE_STORAGE_TIMEOUT_SEC` (default: `25`)
- `M2_TESSERACT_TIMEOUT_SEC` (default: `45`, per-page OCR timeout safeguard)
- `M2_RENDER_DPI` (default: `170`, lower = faster PDF rasterization/OCR)
- `UPLOAD_DIR` (default: `uploads`)
- `LLM_CLEANUP_ENABLED`, `LLM_CLEANUP_BASE_URL`, `LLM_CLEANUP_MODEL`, `LLM_CLEANUP_TIMEOUT_SEC`
- `LLM_CLEANUP_MODEL_FALLBACKS` (comma-separated model fallback chain)
- `LLM_CLEANUP_FORCE` (run LLM cleanup for every question)
- `LLM_CLEANUP_STYLE_GUIDE_PATH` (override markdown style-guide file path)
- `LLM_CLEANUP_DEBUG` (emit formatter logs)

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
- Keycloak/OIDC auth is used for API authentication.
- Supabase Storage writes for PDF uploads are done server-side with `SUPABASE_SERVICE_ROLE_KEY`.
- Frontend still uses Supabase client vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) for signed URL/image helpers.

### Storage buckets (private)
Create both buckets as private:
- `question-images`
- `question-pdfs`

Recommended RLS policies for each bucket:
- For `question-pdfs`: backend service-role writes bypass RLS, so end-user INSERT policy is not required.
- For browser-managed buckets (for example `question-images`), keep owner-folder policies if you use Supabase-authenticated users.

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

If you still do direct browser uploads to `question-pdfs`, use the same expressions by replacing `'question-images'` with `'question-pdfs'`.

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
- Verify backend `OIDC_ISSUER` / `OIDC_JWKS_URL` / `OIDC_AUDIENCE`.
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
- Confirm backend `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set for PDF uploads.
- Confirm `question-pdfs` exists and backend can write to it.

## 6) UI Component Workflow (shadcn)
- Components are copied into project source, not used as a runtime package.
- Add component:
```bash
cd frontend
npx shadcn@latest add <component-name>
```
- Installed components live under `frontend/src/components/ui/` and are safe to customize directly.
