# Caliber - Milestone One Prototype

A minimal fullstack application for PDF upload, background parsing (with stubbed agent pipeline), and a question bank UI with **Supabase authentication**.

## Overview

This prototype demonstrates:
- **Authentication**: Supabase-powered user authentication with sign up, sign in, and sign out
- **Frontend**: React + Vite UI with protected Home (PDF upload) and Question Bank pages
- **Backend**: FastAPI API that accepts authenticated PDF uploads, extracts text, runs a stubbed "agent pipeline" in a background task to parse questions, and stores them in a PostgreSQL database using SQLModel
- **User Data Isolation**: All user data (PDFs, questions) is stored per user and only accessible by the owner

## Architecture

### Backend (FastAPI)
- **POST /api/upload-pdf**: Accepts multipart PDF uploads, uploads to Supabase Storage bucket, and schedules a background task to process the PDF and create Question records
- **GET /api/questions**: List all questions (supports optional `skip` and `limit` query parameters)
- **GET /api/questions/{id}**: Get a specific question by ID
- **POST /api/questions**: Create a new question using individual form fields (`text` required, `tags`, `keywords`, and `source_pdf` optional)
- **PUT /api/questions/{id}**: Update an existing question
- **DELETE /api/questions/{id}**: Delete a question
- Uses SQLModel with SQLite (default) for easy local development
- Can be switched to PostgreSQL via DATABASE_URL in .env
- Uses PyPDF2 to extract text from PDFs
- **PDF Storage**: PDFs are stored in Supabase Storage bucket `question-pdfs` with private access
- **Image Storage**: Question images are stored in Supabase Storage bucket `question-images` with private access
- Implements `send_to_agent_pipeline` as a stub that splits text into chunks and returns question dictionaries
- Background processing uses FastAPI BackgroundTasks
- CORS enabled for http://localhost:5173
- All API endpoints (except root) require authentication

### Frontend (React + Vite)
- **Authentication Flow**: Users must sign in or sign up before accessing the app
- **Protected Routes**: Home and Question Bank pages require authentication
- **Auth Context**: Global authentication state management with React Context
- Home page with upload form (POSTs PDF to backend with auth token)
- Question Bank page that fetches /api/questions with auth token and displays user's questions
- API helper with automatic auth token injection
- Simple hash-based navigation between pages
- Sign out functionality in navigation bar

## Quick Start

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit your `.env` file and replace the placeholders:
- Replace `your-project-id` in `DATABASE_URL` with your actual Supabase project details
- Replace `your-password` in `DATABASE_URL` with your Supabase database password
- Replace `your-project-id.supabase.co` in `SUPABASE_URL` with your actual Supabase URL
- Replace `your-anon-key-here` in `SUPABASE_ANON_KEY` with your Supabase anon key from step 2 above
- **SUPABASE_JWT_SECRET**: Not needed for modern projects! Only set if you have a legacy project.

**Run database migrations** (first time setup):
```bash
alembic upgrade head
```
If you're getting some weird errors here you need to make sure you're using python v3.12 to create your venv!

See `backend/MIGRATIONS.md` for more details on how to use alembic.

**Start the backend server:**
```bash
uvicorn app.main:app --reload --port 8000
```

The backend will be available at http://localhost:8000

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit your frontend `.env` file and replace the placeholders:
- Replace `your-project-id.supabase.co` with your actual Supabase URL
- Replace `your-anon-key-here` with your Supabase anon key

```bash
npm run dev
```

The frontend will be available at http://localhost:5173

## Usage

### Upload PDF
1. Navigate to http://localhost:5173
2. **Sign up** with your email and password (or **sign in** if you already have an account)
3. **Complete your profile** by entering your first name, last name, and selecting if you are a teacher (new users only)
4. After completing onboarding, you'll be redirected to the Home page
5. Upload a PDF file using the Home page
6. The backend returns `{status: 'queued'}` and processes the PDF in the background
7. Visit the Question Bank page to view your parsed questions (click Refresh if needed)
8. All your data (PDFs and questions) is stored under your user ID
9. View your profile information by clicking on your email in the navigation bar
10. Sign out when done using the button in the navigation bar

## Authentication

### How It Works

- **Supabase Authentication**: The app uses Supabase's built-in authentication system
- **JWT Tokens**: Upon sign in, Supabase provides a JWT token that's automatically included in all API requests
- **Protected Routes**: All backend API endpoints (except root) require authentication
- **User Data Isolation**: Each user can only access their own questions and uploads
- **Automatic Token Refresh**: The Supabase client handles token refresh automatically

### User Sign Up Flow

1. User enters email and password
2. Supabase creates the user account
3. Supabase sends a confirmation email (if email confirmation is enabled)
4. User can sign in immediately
5. **New**: User is prompted to complete their profile with first name, last name, and student/teacher selection

### User Sign In Flow

1. User enters email and password
2. Supabase validates credentials and returns a session with JWT token
3. The token is automatically stored in local storage
4. All API requests include the token in the Authorization header
5. Backend validates the token with Supabase on each request
6. **New**: If profile is incomplete, user is redirected to onboarding page

### User Profile

The application now stores additional user information in the database:
- **First Name**: User's first name (collected during onboarding)
- **Last Name**: User's last name (collected during onboarding)
- **Teacher Status**: Whether the user is a teacher/instructor or a student (set during onboarding)
- **Admin Status**: Whether the user has admin privileges (set by admin users)

Each user record has:
- `id`: Auto-incrementing integer ID (starting from 1) for easy searching
- `user_id`: UUID from Supabase authentication (used as foreign key)
- User profile is accessible via the Profile page

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

### PostgreSQL with Supabase (Recommended)
The application is configured to use Supabase's PostgreSQL database by default. This provides:
- Production-ready relational database
- Automatic backups
- Connection pooling
- Easy scaling

Set `DATABASE_URL` in `backend/.env` using the connection string from your Supabase project.

### SQLite (Local Development Only)
For local testing without Supabase, you can use SQLite:
1. Comment out the PostgreSQL DATABASE_URL in `backend/.env`
2. Uncomment the SQLite DATABASE_URL:
   ```
   DATABASE_URL=sqlite:///./data/questionbank.db
   ```
3. **Note**: SQLite is for local development only. Use PostgreSQL for production.

## Authentication vs Cloudflare Zero Trust

This application now uses **Supabase Authentication** for user management. Supabase provides:
- Built-in user sign up and sign in
- JWT-based authentication
- Email verification
- Password reset functionality
- Social auth providers (optional)

**Cloudflare Zero Trust** is a separate, optional layer that can be added for:
- Network-level access control
- Corporate SSO integration
- Additional security policies

Refer to [Cloudflare Zero Trust documentation](https://developers.cloudflare.com/cloudflare-one/) if you want to add this additional layer.

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI app and endpoints
│   │   ├── auth.py          # Supabase authentication utilities
│   │   ├── database.py      # Database connection and session
│   │   ├── models.py        # SQLModel database models (User and Question)
│   │   ├── schemas.py       # Pydantic response schemas
│   │   ├── crud.py          # Database operations (user-filtered)
│   │   └── utils.py         # PDF processing and stubbed agent pipeline
│   ├── alembic/             # Database migrations
│   │   └── versions/        # Migration files
│   ├── data/                # SQLite database (gitignored, for local dev)
│   ├── uploads/             # Uploaded PDFs (gitignored)
│   ├── requirements.txt     # Python dependencies
│   └── .env.example         # Environment variables template
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx           # PDF upload page (protected)
│   │   │   ├── QuestionBank.jsx   # Questions list page (protected)
│   │   │   ├── Auth.jsx           # Login/signup page
│   │   │   ├── Onboarding.jsx     # Profile completion page (new)
│   │   │   └── Profile.jsx        # User profile page
│   │   ├── main.jsx         # App entry point with routing and auth
│   │   ├── AuthContext.jsx  # Authentication state management
│   │   ├── supabaseClient.js # Supabase client configuration
│   │   └── api.js           # API helper functions with auth
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example         # Frontend environment variables
├── .gitignore
└── README.md
```

## Testing
## Testing

**Authentication and Upload Flow:**
1. Start both backend and frontend
2. Navigate to http://localhost:5173
3. **Sign up** with a new account or **sign in** with existing credentials
4. Once authenticated, upload a PDF file
5. Check backend logs to see processing status
6. Visit Question Bank page to see your extracted questions
7. Sign out and sign back in to verify your data persists

**Expected behavior:**
- Users must authenticate before accessing any features
- Upload returns immediately with `{status: 'queued'}`
- Backend processes PDF in background and associates questions with user
- Questions appear in the database and Question Bank UI
- Each user can only see their own questions
- Data is isolated per user account

## Development Notes

- **Authentication**: All endpoints (except root) require valid JWT tokens from Supabase
- **User Data Isolation**: Questions are automatically filtered by user_id
- **PDF Storage**: PDFs are stored in Supabase Storage bucket `question-pdfs` (see PDF_STORAGE_SETUP.md)
- **Image Storage**: Question images are stored in Supabase Storage bucket `question-images` (see SUPABASE_STORAGE_SETUP.md)
- Background processing may take a few seconds depending on PDF size
- The stubbed agent pipeline is intentionally simple - replace it with your AI pipeline
- CORS is configured for localhost:5173 - update for production domains
- User sessions are stored in browser local storage
- The Supabase client automatically handles token refresh

## Future Enhancements

- Replace stubbed agent pipeline with actual AGI implementation
- Implement vector search with embeddings (pgvector)
- Add question filtering and search functionality
- Add password reset functionality
- Add social authentication providers (Google, GitHub, etc.)
- Implement user profile management
- Add file upload limits per user
- Deploy to production with Cloudflare Zero Trust as additional security layer
- Add unit and integration tests
- Implement proper error handling and logging
