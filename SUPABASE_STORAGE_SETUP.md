# Supabase Storage Setup for Question Images

This document explains how to set up a Supabase Storage bucket for storing question images with **private access** (only logged-in users can view images).

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
   - **Name**: `question-images`
   - **Public bucket**: ❌ **No** (leave unchecked for private access)
   - Click **Create bucket**

### 2. Set Up Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies to control access:

1. In the Storage page, click on the `question-images` bucket
2. Click on **Policies** tab
3. Add the following policies:

#### Policy 1: Allow authenticated users to upload images
- **Policy name**: `Allow authenticated users to upload`
- **Allowed operation**: `INSERT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
(bucket_id = 'question-images'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
```

#### Policy 2: Allow authenticated users to read images
- **Policy name**: `Authenticated read access`
- **Allowed operation**: `SELECT`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
true
```

#### Policy 3: Allow users to delete their own images
- **Policy name**: `Allow users to delete own images`
- **Allowed operation**: `DELETE`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
(bucket_id = 'question-images'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
```

### 3. Verify the Setup

You can verify the bucket is working by:

1. Testing image upload through the application's Create Question page
2. Checking the Storage tab in Supabase to see uploaded files
3. Images should NOT be accessible via direct URL without authentication

## Bucket Configuration Summary

- **Bucket name**: `question-images`
- **Public**: No (requires authentication to view)
- **File structure**: `{user_id}/{timestamp}.{extension}`
  - Example: `abc123-def456/1643123456789.jpg`

## Image Upload Flow

1. User selects an image in the Create Question form
2. Frontend validates the image (type, size)
3. Image is uploaded to Supabase Storage bucket using the Supabase client
4. Upload returns a signed URL (valid for 1 year) that requires authentication
5. The signed URL is saved in the question's `image_url` field
6. Question is created with the image URL
7. When displaying questions, images are loaded using the signed URL (only accessible to authenticated users)

## Security Considerations

- Images are stored in a **private bucket** (not publicly accessible)
- Images are stored in user-specific folders (by user ID)
- Only authenticated users can upload images
- Only authenticated users can view images (via signed URLs)
- Users can only delete their own images
- Signed URLs expire after 1 year for security
- Maximum file size is enforced in the frontend (5MB)
- Only image file types are accepted

## Troubleshooting

### Upload fails with "new row violates row-level security policy"
- Check that the INSERT policy is correctly configured
- Ensure the user is authenticated

### Images don't display
- Verify the bucket is set to **Private** (not public)
- Check that the SELECT policy allows authenticated access
- Confirm the user is logged in when viewing questions
- Ensure signed URLs are being generated correctly

### Cannot delete images
- Verify the DELETE policy is configured
- Ensure the user is authenticated and owns the image

### "Failed to create signed URL" error
- Check that RLS policies allow SELECT for authenticated users
- Verify the bucket exists and is named `question-images`
- Ensure the file path is correct

## Migration from Public to Private Bucket

If you previously set up a public bucket and want to migrate to private:

1. In Supabase Dashboard, go to Storage → `question-images`
2. Click the settings icon (gear) for the bucket
3. Uncheck "Public bucket" 
4. Update the SELECT policy to target `authenticated` instead of `public`
5. Existing public URLs will stop working
6. New uploads will generate signed URLs automatically
7. Consider regenerating URLs for existing questions if needed
