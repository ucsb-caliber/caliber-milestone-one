# Caliber - Milestone One Prototype

A minimal fullstack application for PDF upload, background parsing (with stubbed agent pipeline), and a question bank UI.

## Overview

This prototype demonstrates:
- **Frontend**: React + Vite UI with Home (PDF upload) and Question Bank pages
- **Backend**: FastAPI API that accepts PDF uploads, extracts text, runs a stubbed "agent pipeline" in a background task to parse questions, and stores them in a SQLite database using SQLModel

## Architecture

### Backend (FastAPI)
- **POST /api/upload-pdf**: Accepts multipart PDF uploads, saves file to UPLOAD_DIR, and schedules a background task to process the PDF and create Question records
- **GET /api/questions**: List all questions (supports optional `skip` and `limit` query parameters)
- **GET /api/questions/{id}**: Get a specific question by ID
- **POST /api/questions**: Create a new question using individual form fields (`text` required, `tags`, `keywords`, and `source_pdf` optional)
- **PUT /api/questions/{id}**: Update an existing question
- **DELETE /api/questions/{id}**: Delete a question
- Uses SQLModel with SQLite (default) for easy local development
- Can be switched to PostgreSQL via DATABASE_URL in .env
- Uses PyPDF2 to extract text from PDFs
- Implements `send_to_agent_pipeline` as a stub that splits text into chunks and returns question dictionaries
- Background processing uses FastAPI BackgroundTasks
- CORS enabled for http://localhost:5173

### Frontend (React + Vite)
- Home page with upload form (POSTs PDF to backend)
- Question Bank page that fetches /api/questions and displays stored questions
- API helper with configurable API_BASE (default: http://localhost:8000)
- Simple hash-based navigation between pages

## Quick Start

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Replace PASSWORD in the DATABASE_URL variable in your .env file.
uvicorn app.main:app --reload --port 8000
```

The backend will be available at http://localhost:8000

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at http://localhost:5173

## Usage

### Upload PDF
1. Navigate to http://localhost:5173
2. Upload a PDF file using the Home page
3. The backend returns `{status: 'queued'}` and processes the PDF in the background
4. Visit the Question Bank page to view parsed questions (click Refresh if needed)

### Create Questions Manually
You can also create questions directly using the API with individual form fields:

```bash
# Create a question with all fields
curl -X POST http://localhost:8000/api/questions \
  -F "text=What is the capital of France?" \
  -F "tags=geography,europe" \
  -F "keywords=capital,france,paris" \
  -F "source_pdf=sample.pdf"

# Create a question with only required field
curl -X POST http://localhost:8000/api/questions \
  -F "text=What is the largest planet in our solar system?"
```

The create question endpoint now accepts individual form parameters similar to GET endpoints, making it easier to test and use from tools like curl or Postman.

## Stubbed Agent Pipeline

The agentic AI pipeline is currently stubbed in `backend/app/utils.py` (`send_to_agent_pipeline` function). 

**Current implementation:**
- Splits PDF text into chunks (~500 characters)
- Extracts simple keywords from each chunk
- Creates mock question records with tags and keywords

**Future implementation:**
Replace this stub with your AGI pipeline that:
- Intelligently splits/extracts questions
- Generates semantic tags and keywords
- Stores embeddings (pgvector or similar)
- Performs advanced semantic analysis

## Database Options

### SQLite (Default)
Zero-friction local testing. Database file stored at `backend/data/questionbank.db`.

### PostgreSQL
To use PostgreSQL instead:
1. Set `DATABASE_URL` in `backend/.env`:
   ```
   DATABASE_URL=postgresql://user:password@localhost/dbname
   ```
2. Ensure PostgreSQL is running
3. Restart the backend

## Cloudflare Zero Trust Integration

The repository supports Cloudflare Zero Trust integration for production deployments, though it's not enforced by default for local development.

**To enable Cloudflare Access:**
1. Configure Cloudflare Access policies for your application
2. Add Cloudflare Access headers validation middleware to the backend
3. Configure your frontend to work with CF Access authentication

Refer to [Cloudflare Zero Trust documentation](https://developers.cloudflare.com/cloudflare-one/) for setup details.

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI app and endpoints
│   │   ├── database.py      # Database connection and session
│   │   ├── models.py        # SQLModel database models
│   │   ├── schemas.py       # Pydantic response schemas
│   │   ├── crud.py          # Database operations
│   │   └── utils.py         # PDF processing and stubbed agent pipeline
│   ├── data/                # SQLite database (gitignored)
│   ├── uploads/             # Uploaded PDFs (gitignored)
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment variables template
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx           # PDF upload page
│   │   │   └── QuestionBank.jsx   # Questions list page
│   │   ├── main.jsx         # App entry point with routing
│   │   └── api.js           # API helper functions
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .gitignore
└── README.md
```

## Testing

**Upload a PDF:**
1. Start both backend and frontend
2. Navigate to http://localhost:5173
3. Upload a PDF file
4. Check backend logs to see processing status
5. Visit Question Bank page to see extracted questions

**Expected behavior:**
- Upload returns immediately with `{status: 'queued'}`
- Backend processes PDF in background
- Questions appear in the database and Question Bank UI

## Development Notes

- The backend defaults to SQLite for zero-friction local testing
- Background processing may take a few seconds depending on PDF size
- The stubbed agent pipeline is intentionally simple - replace it with your AI pipeline
- CORS is configured for localhost:5173 - update for production domains
- All uploaded PDFs are stored in `backend/uploads/` (gitignored)

## Future Enhancements

- Replace stubbed agent pipeline with actual AGI implementation
- Add authentication and user management
- Implement vector search with embeddings
- Add question filtering and search functionality
- Deploy to production with Cloudflare Zero Trust
- Add unit and integration tests
- Implement proper error handling and logging
