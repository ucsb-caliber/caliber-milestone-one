# Supabase Storage Setup for Question Images

This document explains how to set up a Supabase Storage bucket for storing question images.

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
   - **Public bucket**: ✅ **Yes** (check this box)
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
true
```
or for user-specific folders:
```sql
(bucket_id = 'question-images'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
```

#### Policy 2: Allow public read access
- **Policy name**: `Public read access`
- **Allowed operation**: `SELECT`
- **Target roles**: `public`
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
3. Accessing an image URL directly in your browser to confirm public read access

## Bucket Configuration Summary

- **Bucket name**: `question-images`
- **Public**: Yes (allows unauthenticated read access)
- **File structure**: `{user_id}/{timestamp}.{extension}`
  - Example: `abc123-def456/1643123456789.jpg`

## Image Upload Flow

1. User selects an image in the Create Question form
2. Frontend validates the image (type, size)
3. Image is uploaded to Supabase Storage bucket using the Supabase client
4. Upload returns a public URL
5. The public URL is saved in the question's `image_url` field
6. Question is created with the image URL
7. When displaying questions, images are loaded from Supabase Storage using the public URL

## Security Considerations

- Images are stored in user-specific folders (by user ID)
- Only authenticated users can upload images
- Users can only delete their own images
- All images are publicly readable (necessary for display)
- Maximum file size is enforced in the frontend (5MB)
- Only image file types are accepted

## Troubleshooting

### Upload fails with "new row violates row-level security policy"
- Check that the INSERT policy is correctly configured
- Ensure the user is authenticated

### Images don't display
- Verify the bucket is set to **Public**
- Check that the SELECT policy allows public access
- Confirm the image URL is correctly stored in the database

### Cannot delete images
- Verify the DELETE policy is configured
- Ensure the user is authenticated and owns the image
