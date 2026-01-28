# Supabase Storage Setup for PDF Files

This document explains how to set up a Supabase Storage bucket for storing uploaded PDF files with **private, authenticated-only access**.

## Prerequisites

- A Supabase project (you should already have one configured in `.env`)
- Access to your Supabase dashboard

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

1. Testing PDF upload through the application
2. Checking the Storage tab in Supabase to see uploaded files
3. PDFs should NOT be accessible via direct URL without authentication

## Bucket Configuration Summary

- **Bucket name**: `question-pdfs`
- **Public**: No (requires authentication to access)
- **File structure**: `{user_id}/{timestamp}_{original_filename}.pdf`
  - Example: `abc123-def456/1643123456789_myfile.pdf`
- **Storage**: File paths are stored in database `source_pdf` field

## PDF Upload and Processing Flow

1. User uploads a PDF file via the frontend
2. Backend authenticates the user
3. PDF is uploaded to Supabase Storage bucket with user-specific path
4. The **storage file path** is saved in questions' `source_pdf` field
5. Background processing retrieves PDF content from Supabase Storage
6. PDF text is extracted and processed by the agentic pipeline
7. Questions are created in the database with reference to the source PDF path

## Security Model

### How Authenticated-Only Access Works

1. **Upload**: Only authenticated users can upload files (enforced by RLS INSERT policy)
2. **Storage**: File paths (e.g., `user123/1234567890_document.pdf`) are stored in the database
3. **Processing**: Backend can retrieve PDFs using service credentials
4. **Access Control**: Unauthenticated users cannot:
   - Upload PDFs (requires auth token)
   - Access PDFs directly (bucket is private)
   - Download PDFs (requires authentication)

### Why This Is Truly Private

- **Private Bucket**: Direct file access is blocked
- **RLS Policies**: Only authenticated users can access files
- **User-Scoped Paths**: Each user's PDFs are organized in their own folder
- **Backend Access**: Backend can access all files using service credentials for processing
- **No Public URLs**: PDFs are not accessible via public URLs

## Security Considerations

- PDFs stored in a **private bucket** (not publicly accessible)
- PDFs organized in user-specific folders (by user ID)
- Only authenticated users can upload PDFs
- Only authenticated users can access their own PDFs
- Users can only delete their own PDFs
- Backend service has access to process all PDFs for the agentic pipeline
- File paths stored in database, not full URLs
- Maximum file size should be enforced in frontend (recommended: 10MB)
- Only PDF file types are accepted

## Troubleshooting

### Upload fails with "new row violates row-level security policy"
- Check that the INSERT policy is correctly configured
- Ensure the user is authenticated
- Verify the file path includes the user ID as the first folder

### Processing fails
- Verify the backend has valid Supabase credentials
- Check that the `source_pdf` field contains valid storage paths
- Ensure the bucket exists and is named `question-pdfs`

### Cannot delete PDFs
- Verify the DELETE policy is configured
- Ensure the user is authenticated and owns the PDF
- Check that the file path matches the user's ID

## Benefits for Agentic Pipeline

Storing PDFs in Supabase Storage (rather than local filesystem) provides several advantages for the agentic pipeline:

1. **Scalability**: Cloud storage handles large volumes without local disk constraints
2. **Accessibility**: Multiple backend instances can access the same PDFs
3. **Durability**: PDFs are backed up and highly available
4. **Processing**: Backend can retrieve PDFs on-demand for re-processing
5. **Organization**: User-scoped folders make it easy to track and manage PDFs
6. **Security**: Private bucket ensures sensitive exam/question PDFs are protected
