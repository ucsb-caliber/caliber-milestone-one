# Testing Guide for Supabase Authentication

This guide will walk you through testing the authentication implementation step-by-step.

## Prerequisites

Before testing, you need:
1. A Supabase account (free tier is sufficient)
2. A Supabase project created
3. Your Supabase credentials ready

## Step 1: Set Up Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/log in
2. Click **"New Project"**
3. Fill in:
   - Project name (e.g., "caliber-test")
   - Database password (save this!)
   - Region (choose closest to you)
4. Wait for project to finish setting up (~2 minutes)

## Step 2: Get Your Supabase Credentials

Once your project is ready:

1. Go to **Settings** → **API** in the left sidebar
2. Copy the following values:
   - **Project URL** (e.g., `https://abcdefghijklm.supabase.co`)
   - **anon public key** (long string starting with `eyJhbGc...`)
   - **Note**: You do NOT need the JWT Secret for modern projects (they use JWKS)
3. Go to **Settings** → **Database**
   - Note your database password (or reset if you forgot)

## Step 3: Configure Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and replace:
```bash
# Replace with your actual Supabase project details
DATABASE_URL=postgresql://postgres.yourprojectref:YOUR_PASSWORD@aws-0-us-west-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://yourprojectref.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...your-actual-anon-key...

# SUPABASE_JWT_SECRET is NOT needed for modern projects
# Only uncomment if you have a legacy project (pre-2024)
# SUPABASE_JWT_SECRET=your-jwt-secret-from-settings...
```

**Important**: 
- Get the full DATABASE_URL from Supabase: **Settings** → **Database** → **Connection string** → **URI** (Connection pooling mode)
- Copy it exactly and just replace `[YOUR-PASSWORD]` with your database password

**Run database migrations** (first time only):
```bash
alembic upgrade head
```

This creates the `user_id` column in your database. See `backend/MIGRATIONS.md` for details.

## Step 4: Configure Frontend

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env`:
```bash
VITE_SUPABASE_URL=https://yourprojectref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-actual-anon-key...
VITE_API_BASE=http://localhost:8000
```

## Step 5: Start the Servers

**Terminal 1 - Backend:**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

## Step 6: Test Authentication Flow

### Test 1: Sign Up New User

1. Open browser to http://localhost:5173
2. You should see the **Sign In** form (not the home page)
3. Click **"Don't have an account? Sign Up"** at the bottom
4. Enter:
   - Email: `test@example.com` (use a real email if you want to test email verification)
   - Password: `testpass123` (minimum 8 characters)
5. Click **"Sign Up"**
6. You should see a success message
7. You should be automatically signed in and see the **Home** page

**Expected Result**: ✅ You're now on the Home page with navigation showing your email and a "Sign Out" button

### Test 2: Upload a PDF

1. On the Home page, click **"Choose File"**
2. Select any PDF file from your computer
3. Click **"Upload PDF"**
4. You should see "Success! PDF upload successful. Processing in background."
5. Check the backend terminal - you should see processing logs

**Expected Result**: ✅ PDF uploads successfully and backend processes it

### Test 3: View Questions

1. Click **"Question Bank"** in the navigation
2. Wait a few seconds for processing to complete
3. Click **"Refresh"** if needed
4. You should see questions extracted from your PDF

**Expected Result**: ✅ Questions appear in the question bank

### Test 4: Sign Out and Sign In

1. Click **"Sign Out"** button in the navigation
2. You should be redirected back to the login screen
3. Enter the same credentials:
   - Email: `test@example.com`
   - Password: `testpass123`
4. Click **"Sign In"**
5. Navigate to **"Question Bank"**
6. Your questions should still be there

**Expected Result**: ✅ Data persists after sign out/sign in

### Test 5: Test Data Isolation

1. Click **"Sign Out"**
2. Sign up with a different email: `test2@example.com` / `testpass456`
3. Navigate to **"Question Bank"**
4. The question bank should be **empty** (no questions from first user)
5. Upload a PDF as this second user
6. Only this user's questions should appear

**Expected Result**: ✅ Each user only sees their own data

### Test 6: Test Protected Routes

1. While signed in, copy the URL: `http://localhost:5173/#home`
2. Sign out
3. Try to paste that URL in the browser
4. You should be redirected to the login screen

**Expected Result**: ✅ Cannot access pages without authentication

## Verification Checklist

- [ ] Sign up creates new account
- [ ] Sign in works with correct credentials
- [ ] Upload PDF requires authentication
- [ ] Questions are created and stored per user
- [ ] Question Bank shows only user's own questions
- [ ] Sign out works and redirects to login
- [ ] Data persists after sign out/sign in
- [ ] Different users have isolated data
- [ ] Protected routes require authentication
- [ ] User email shows in navigation when authenticated

## Common Issues

### Frontend won't start
**Error**: `VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set`
**Solution**: Make sure you created `frontend/.env` and added your credentials

### Backend auth fails
**Error**: `Invalid authentication credentials` or `Invalid token: The specified alg value is not allowed`
**Solution**: 
- **Modern Supabase Projects (2024+)**: You don't need JWT Secret! The backend now uses JWKS automatically.
  - Just make sure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly
  - Remove or comment out `SUPABASE_JWT_SECRET` from your `.env` file
  - Restart backend after changing .env
  
- **Legacy Supabase Projects (pre-2024)**: If your project uses HS256 algorithm:
  - Go to Supabase Dashboard → Settings → API → JWT Settings
  - Copy the **JWT Secret** (NOT the service_role key, NOT the anon key)
  - Uncomment and set in `backend/.env`: `SUPABASE_JWT_SECRET=...`
  - Restart backend

- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` match in both backend and frontend
- Make sure you copied the full anon key (starts with `eyJhbGc`)

### Database connection fails
**Error**: `could not connect to server`
**Solution**: 
- Get the full connection string from Supabase Dashboard: Settings → Database → Connection string → URI
- Make sure you're using the "Connection pooling" URI (has `pooler.supabase.com`)
- Replace `[YOUR-PASSWORD]` with your actual database password

### Questions not appearing
**Solution**: 
- Wait a few seconds for background processing
- Check backend terminal for processing logs
- Click "Refresh" in Question Bank

### "Failed to fetch" error
**Error**: Generic "failed to fetch" or "Failed to fetch questions"
**Solution**: 
1. **Check backend is running**: 
   - Look for the terminal running `uvicorn app.main:app --reload`
   - Should see: `INFO: Uvicorn running on http://127.0.0.1:8000`
   - If not running, start it with: `cd backend && uvicorn app.main:app --reload --port 8000`

2. **Verify backend is accessible**:
   - Open http://localhost:8000 in your browser
   - Should see JSON response with API info
   - If you get "connection refused", backend isn't running

3. **Check for CORS errors in browser console**:
   - Press F12 → Console tab
   - Look for red CORS errors
   - If you see CORS errors, verify backend is running on port 8000

4. **Verify JWT secret is set**:
   - Check `backend/.env` has `SUPABASE_JWT_SECRET=...`
   - The JWT secret must match your Supabase project
   - Get it from: Supabase Dashboard → Settings → API → JWT Settings

5. **Check backend logs for errors**:
   - Look at the terminal running the backend
   - Any Python errors or authentication failures will show here
   - Common: `ValueError: SUPABASE_JWT_SECRET must be set`

## Debugging Tips

1. **Check Backend Logs**: The backend terminal shows all authentication attempts and errors
2. **Check Browser Console**: Press F12 and look for errors in the Console tab
3. **Verify Environment Variables**: 
   ```bash
   # Backend
   cd backend
   cat .env
   
   # Frontend  
   cd frontend
   cat .env
   ```
4. **Test API Endpoint**: Visit http://localhost:8000/docs to see API documentation
5. **Test Backend Health**: 
   ```bash
   curl http://localhost:8000
   # Should return: {"message":"Caliber Milestone One API",...}
   ```
6. **Test with authentication**:
   ```bash
   # Get your token from browser console:
   # Open http://localhost:5173, press F12, go to Console, type:
   # (await supabase.auth.getSession()).data.session.access_token
   
   # Then test API with token:
   curl -H "Authorization: Bearer YOUR_TOKEN_HERE" http://localhost:8000/api/questions
   ```

## Using the FastAPI Docs (Swagger UI)

The FastAPI documentation interface at http://localhost:8000/docs now supports **automatic authentication via cookies**!

### Easy Method (Recommended) - Automatic Cookie Authentication

1. **Just log in via the frontend**:
   - Visit http://localhost:5173 and sign in
   - That's it! The authentication cookie is now set

2. **Use Swagger UI**:
   - Open http://localhost:8000/docs
   - Try any endpoint - authentication happens automatically! ✨
   - No need to copy tokens or click "Authorize"

Both the frontend (port 5173) and backend docs (port 8000) run on localhost, so they can share authentication cookies. Once you're logged in via the frontend, Swagger UI just works!

### Manual Method (Alternative) - If Cookie Auth Doesn't Work

If you prefer or if automatic auth isn't working:

1. **Get your access token**:
   - Login to the frontend at http://localhost:5173
   - Open browser DevTools (F12)
   - Go to **Application** → **Local Storage** → `http://localhost:5173`
   - Find the entry starting with `sb-` (Supabase session)
   - Expand it and copy the `access_token` value (long string starting with `eyJ...`)

2. **Authorize in Swagger**:
   - Open http://localhost:8000/docs
   - Click the **"Authorize"** button (🔓 icon) at the top right
   - In the "Value" field, enter: `Bearer YOUR_ACCESS_TOKEN`
   - Click **"Authorize"**
   - Click **"Close"**

3. **Test endpoints**:
   - Now you can test any endpoint in the docs
   - The Authorization header will be automatically included
   - Try `GET /api/questions` or `POST /api/upload-pdf`

**Note**: The access token expires after 1 hour. If you get 401 errors, simply refresh your login in the frontend (cookie auth will update automatically) or get a fresh token and re-authorize.

## Advanced Testing (Optional)

### Test Password Requirements
- Try signing up with password less than 8 characters
- Should see HTML5 validation error

### Test Invalid Credentials
- Sign out
- Try signing in with wrong password
- Should see error message

### Test Concurrent Users
- Open two browser windows (or one incognito)
- Sign in as different users in each
- Upload different PDFs
- Verify data isolation

### Test API Endpoints Directly
Once authenticated in Swagger UI, test:
- `GET /api/questions` - List your questions
- `GET /api/questions/{id}` - Get specific question
- `POST /api/questions` - Create question manually
- `PUT /api/questions/{id}` - Update question
- `DELETE /api/questions/{id}` - Delete question
- `GET /api/user` - Get user info

## Success!

If all tests pass, your authentication is working correctly! 🎉

Users must now:
1. Create an account before using the app
2. Sign in to access any features
3. All their PDFs and questions are private and scoped to their account
