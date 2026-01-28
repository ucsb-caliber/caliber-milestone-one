# Image Upload Setup Guide

This guide will help you set up image uploads for questions using Supabase Storage.

## Quick Setup Checklist

- [ ] Install Python dependencies: `pip install -r requirements.txt`
- [ ] Create `question-images` bucket in Supabase (keep it **Private**)
- [ ] Get your Supabase service role key
- [ ] Add `SUPABASE_SERVICE_KEY` to your `.env` file
- [ ] Restart the backend server

## Detailed Setup Instructions

### 1. Install Dependencies

First, ensure all Python packages are installed, especially `httpx==0.25.2` which is required by the Supabase client:

```bash
cd backend
pip install -r requirements.txt
```

**Note**: If you see an error like "Supabase client init failed; install httpx==0.25.2", it means this step wasn't completed.

### 2. Create Supabase Storage Bucket

1. Go to your Supabase project dashboard at https://supabase.com
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Name the bucket: `question-images`
5. **Important**: Keep the bucket **Private** (not Public)
   - Private buckets require authentication to access
   - Images will be accessed via signed URLs that expire
6. Click **Create bucket**

### 3. Get Your Service Role Key

The service role key has admin privileges and is used by the backend to upload images and generate signed URLs.

1. In Supabase dashboard, go to **Settings** > **API**
2. Find the **service_role** key section
3. Copy the `service_role` key (NOT the `anon` key)
4. **Security Warning**: Never expose this key in frontend code or commit it to version control

### 4. Configure Environment Variables

Add the service role key to your `backend/.env` file:

```env
# Existing variables
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Add this line with your actual service role key
SUPABASE_SERVICE_KEY=eyJhbGc...your-actual-service-role-key-here
```

### 5. Restart the Backend

After updating the `.env` file, restart your backend server:

```bash
cd backend
uvicorn app.main:app --reload
```

## Troubleshooting

### Error: "Supabase client init failed; install httpx==0.25.2"

**Cause**: The `httpx` package is not installed or the wrong version is installed.

**Solution**:
```bash
cd backend
pip install httpx==0.25.2
# Or reinstall all dependencies:
pip install -r requirements.txt
```

### Error: "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"

**Cause**: The `SUPABASE_SERVICE_KEY` environment variable is not set in your `.env` file.

**Solution**:
1. Check that your `backend/.env` file exists
2. Ensure it contains the line `SUPABASE_SERVICE_KEY=your-key-here`
3. Make sure you copied the **service_role** key, not the **anon** key
4. Restart the backend server after updating `.env`

### Error: "Storage not configured. Image uploads will be disabled."

**Cause**: This is just a warning that appears when `SUPABASE_SERVICE_KEY` is not set.

**Solution**: This doesn't prevent the app from running, but image uploads won't work. Follow step 4 above to configure the service key.

### Error: "Failed to upload image" or "bucket not found"

**Cause**: The `question-images` bucket doesn't exist in your Supabase project.

**Solution**: Follow step 2 above to create the bucket. Make sure it's named exactly `question-images` (all lowercase, with hyphen).

### Images upload but don't display

**Possible causes**:
1. The bucket is public instead of private (images need signed URLs for private buckets)
2. The frontend can't reach the backend `/api/image/{questionId}` endpoint

**Solution**:
1. Check that the bucket is set to **Private** in Supabase Storage settings
2. Check browser console for errors when viewing questions
3. Verify backend logs show "Image uploaded successfully" messages

## How It Works

The image upload system uses a **private bucket with signed URLs** for security:

1. **Upload** (Backend):
   - User selects an image in the CreateQuestion form
   - Frontend sends the image file to `/api/questions` endpoint
   - Backend validates the file (type, size)
   - Backend uploads to `question-images` bucket using service role key
   - Backend stores the file **path** (not URL) in the database

2. **Display** (Frontend + Backend):
   - Frontend loads questions from `/api/questions`
   - For each question with an image, frontend calls `/api/image/{questionId}`
   - Backend generates a signed URL that expires in 1 hour
   - Frontend displays the image using the signed URL

3. **Security**:
   - Only authenticated users can upload images
   - Only authenticated users can request signed URLs
   - Signed URLs expire after 1 hour
   - Service role key never exposed to frontend

## File Upload Limits

| Restriction | Value |
|-------------|-------|
| **Max file size** | 5 MB |
| **Allowed types** | JPEG, PNG, GIF, WebP, SVG |
| **MIME types** | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml` |

## Testing the Setup

To verify everything is working:

1. Start the backend server:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. Check the console output for warnings:
   - ✅ No warnings = Storage is configured correctly
   - ⚠️ "Warning: Storage not configured" = Missing `SUPABASE_SERVICE_KEY`

3. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

4. Try creating a question with an image:
   - Navigate to Create Question page
   - Fill in the question details
   - Upload a small test image (< 5MB)
   - Click Create Question

5. Check the Question Bank:
   - Go to Question Bank page
   - Your new question should display with the image
   - If you see "Loading image..." that never resolves, check backend logs

## Need More Help?

- Check the backend console for detailed error messages
- Look in the browser console (F12) for frontend errors
- Verify your Supabase project is active and accessible
- Make sure you're using the correct Supabase project (check `SUPABASE_URL`)
