# Supabase Storage Setup for Question PDFs

This document explains how to set up a Supabase Storage bucket for storing PDF files with **private, authenticated-only access**.

## Prerequisites

- A Supabase project (you should already have one configured in `.env`)
- Access to your Supabase dashboard
- The `question-images` bucket should already be set up (see SUPABASE_STORAGE_SETUP.md)

## Setup Instructions

### 1. Create the Storage Bucket

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Select your project
3. Navigate to **Storage** in the left sidebar
4. Click **New bucket**
5. Configure the bucket:
   - **Name**: `question-pdfs`
   - **Public bucket**: ❌ **No** (leave unchecked for private access)
   - Click **Create bucket**

### 2. Set Up Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies to control access:

1. In the Storage page, click on the `question-pdfs` bucket
2. Click on **Policies** tab
3. Add the following policies:

#### Policy 1: Allow authenticated users to upload PDFs
- **Policy name**: `Allow authenticated users to upload`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
(bucket_id = 'question-pdfs'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
```

#### Policy 2: Allow authenticated users to read PDFs
- **Policy name**: `Authenticated read access`
- **Allowed operation**: `SELECT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
true
```

#### Policy 3: Allow users to delete their own PDFs
- **Policy name**: `Allow users to delete own PDFs`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
(bucket_id = 'question-pdfs'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
```

### 3. Verify the Setup

You can verify the bucket is working by:

1. Testing PDF upload through the application's Home page
2. Checking the Storage tab in Supabase to see uploaded files
3. PDFs should NOT be accessible via direct URL without authentication

## Bucket Configuration Summary

- **Bucket name**: `question-pdfs`
- **Public**: No (requires authentication to access)
- **File structure**: `{user_id}/{timestamp}.{extension}`
  - Example: `abc123-def456/1643123456789.pdf`
- **Storage**: File paths are stored in the `source_pdf` database field, signed URLs can be generated on-demand

## PDF Upload and Storage Flow

1. User selects a PDF file in the Home page upload form
2. Frontend validates the PDF file type
3. PDF is uploaded to Supabase Storage bucket using `uploadPDFToStorage()`
4. The **storage file path** (not URL) is saved in the question's `source_pdf` field
5. The PDF file is also sent to the backend for text extraction and question generation
6. When displaying PDFs (if needed), the app can generate temporary signed URLs on-the-fly using `getPDFSignedUrl()`
7. Signed URLs are valid for 1 hour and require active authentication to generate

## Security Model

### How Authenticated-Only Access Works

1. **Upload**: Only authenticated users can upload files (enforced by RLS INSERT policy)
2. **Storage**: File paths (e.g., `user123/1234567890.pdf`) are stored in the database
3. **Access**: When an authenticated user needs to access a PDF:
   - The app requests signed URLs for PDF paths using the user's auth token
   - Supabase verifies authentication before generating signed URLs
   - Signed URLs are temporary (1 hour)
4. **Access Control**: Unauthenticated users cannot:
   - Generate signed URLs (requires auth token)
   - Access PDFs directly (bucket is private)
   - Upload PDFs

### Why This Is Truly Private

- **Private Bucket**: Direct file access is blocked
- **RLS Policies**: Only authenticated users can read files
- **Signed URLs Generated On-Demand**: Created only when authenticated users need to access PDFs
- **Short Expiration**: URLs expire after 1 hour, preventing sharing
- **No Permanent URLs**: Database stores paths, not URLs, so URLs can't be shared permanently

## Security Considerations

- PDFs stored in a **private bucket** (not publicly accessible)
- PDFs organized in user-specific folders (by user ID)
- Only authenticated users can upload PDFs
- **Only authenticated users can access PDFs** (signed URLs generated on-demand)
- Users can only delete their own PDFs
- Signed URLs expire after 1 hour
- Only PDF file types are accepted

## Troubleshooting

### Upload fails with "new row violates row-level security policy"
- Check that the INSERT policy is correctly configured
- Ensure the user is authenticated

### Cannot generate signed URLs
- Verify the bucket is set to **Private** (not public)
- Check that the SELECT policy allows authenticated access
- Confirm the user is logged in
- Check browser console for signed URL generation errors
- Verify the file path is correctly stored in the database

### Cannot delete PDFs
- Verify the DELETE policy is configured
- Ensure the user is authenticated and owns the PDF

### "Failed to create signed URL" error
- Check that RLS policies allow SELECT for authenticated users
- Verify the bucket exists and is named `question-pdfs`
- Ensure the user is authenticated
- Check that the file path exists in storage

## Differences from Image Storage

While the PDF storage follows the same pattern as image storage:

1. **Bucket name**: `question-pdfs` instead of `question-images`
2. **Field name**: Stored in `source_pdf` field instead of `image_url`
3. **Processing**: PDFs are also sent to backend for text extraction and question generation
4. **Display**: PDFs are typically not displayed inline like images, but signed URLs can be generated if needed for download links

## Migration Notes

If you have existing PDFs stored in the local `uploads/` directory:

1. The old PDFs will remain in `uploads/` directory
2. New PDFs uploaded after this update will be stored in Supabase Storage
3. Old questions will have `source_pdf` containing just the filename (e.g., "document.pdf")
4. New questions will have `source_pdf` containing the storage path (e.g., "user123/1234567890.pdf")
5. You can differentiate by checking if `source_pdf` contains a "/" character
