# Supabase Storage Setup for Question Images

This document explains how to set up a Supabase Storage bucket for storing question images with **private, authenticated-only access**.

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
- **Public**: No (requires authentication to access)
- **File structure**: `{user_id}/{timestamp}.{extension}`
  - Example: `abc123-def456/1643123456789.jpg`
- **Storage**: File paths are stored in database, signed URLs generated on-demand

## Image Upload and Display Flow

1. User selects an image in the Create Question form
2. Frontend validates the image (type, size)
3. Image is uploaded to Supabase Storage bucket
4. The **storage file path** (not URL) is saved in the question's `image_url` field
5. When displaying questions, the app generates temporary signed URLs on-the-fly
6. Signed URLs are valid for 1 hour and require active authentication to generate
7. This ensures only currently logged-in users can view images

## Security Model

### How Authenticated-Only Access Works

1. **Upload**: Only authenticated users can upload files (enforced by RLS INSERT policy)
2. **Storage**: File paths (e.g., `user123/1234567890.jpg`) are stored in the database
3. **Display**: When an authenticated user views questions:
   - The app requests signed URLs for image paths using the user's auth token
   - Supabase verifies authentication before generating signed URLs
   - Signed URLs are temporary (1 hour) and cached in memory
4. **Access Control**: Unauthenticated users cannot:
   - Generate signed URLs (requires auth token)
   - Access images directly (bucket is private)
   - View images in questions (no signed URL available)

### Why This Is Truly Private

- **Private Bucket**: Direct file access is blocked
- **RLS Policies**: Only authenticated users can read files
- **Signed URLs Generated On-Demand**: Created only when authenticated users load questions
- **Short Expiration**: URLs expire after 1 hour, preventing sharing
- **No Permanent URLs**: Database stores paths, not URLs, so URLs can't be shared permanently

## Security Considerations

- Images stored in a **private bucket** (not publicly accessible)
- Images organized in user-specific folders (by user ID)
- Only authenticated users can upload images
- **Only authenticated users can view images** (signed URLs generated on-demand)
- Users can only delete their own images
- Signed URLs expire after 1 hour
- Maximum file size enforced in frontend (5MB)
- Only image file types are accepted

## Troubleshooting

### Upload fails with "new row violates row-level security policy"
- Check that the INSERT policy is correctly configured
- Ensure the user is authenticated

### Images don't display
- Verify the bucket is set to **Private** (not public)
- Check that the SELECT policy allows authenticated access
- Confirm the user is logged in when viewing questions
- Check browser console for signed URL generation errors
- Verify the file path is correctly stored in the database

### Cannot delete images
- Verify the DELETE policy is configured
- Ensure the user is authenticated and owns the image

### "Failed to create signed URL" error
- Check that RLS policies allow SELECT for authenticated users
- Verify the bucket exists and is named `question-images`
- Ensure the user is authenticated
- Check that the file path exists in storage

## Migration from Public to Private Bucket

If you previously set up a public bucket and want to migrate to private:

1. **Change Bucket Settings**:
   - In Supabase Dashboard, go to Storage → `question-images`
   - Click the settings icon (gear) for the bucket
   - Uncheck "Public bucket"

2. **Update RLS Policies**:
   - Change SELECT policy from `public` to `authenticated` role
   
3. **Migrate Existing Data**:
   - If storing full URLs: Extract file paths from URLs in database
   - Update all `image_url` fields to contain just the storage path
   - Example: Change `https://...storage.../user123/123.jpg` to `user123/123.jpg`
   
4. **Update Frontend Code**:
   - Ensure you're using the latest version that generates signed URLs on-demand
   - The app will automatically handle generating signed URLs for the paths

5. **Test**:
   - Verify images display correctly for logged-in users
   - Confirm images are NOT accessible to logged-out users
