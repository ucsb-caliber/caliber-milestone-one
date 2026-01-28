# Image Upload Feature for Questions

## Overview
This feature allows users to optionally attach image files to questions. Images are stored in Supabase Storage and displayed alongside questions in the Question Bank.

## Features

### For Question Creators
- Upload images when creating new questions (optional)
- Preview images before submission
- Remove/change images before saving
- Automatic validation of file type and size
- User-friendly error messages

### For Question Viewers
- Images display between question text and answer choices
- Images are properly sized and styled
- Images load from Supabase CDN for fast performance

## Usage

### Creating a Question with an Image

1. Navigate to the "Create Question" page
2. Fill in the question details (text, course, keywords, etc.)
3. Click "Choose File" in the Image section
4. Select an image file (JPG, PNG, GIF, etc.)
5. Preview appears - you can remove it if needed
6. Complete the rest of the form and click "Create Question"
7. Image is automatically uploaded to Supabase Storage
8. Question is saved with a reference to the image

### Viewing Questions with Images

1. Navigate to the "Question Bank"
2. Questions with images will display them below the question text
3. Images are automatically sized to fit the card layout
4. Click on images to view them in full size (browser default behavior)

## Technical Specifications

### Supported Image Formats
- JPEG/JPG
- PNG
- GIF
- WebP
- SVG
- BMP

### File Size Limits
- Maximum file size: 5MB
- Enforced on the frontend before upload

### Storage Location
- Bucket: `question-images` (private bucket)
- Path structure: `{user_id}/{timestamp}.{extension}`
- Example: `a1b2c3d4-e5f6/.../1643123456789.jpg`
- Access: Signed URLs valid for 1 year

### Security
- Bucket is **private** - only authenticated users can view images
- Only authenticated users can upload images
- Users can only delete their own images
- Images accessible via signed URLs (expire after 1 year)
- File type and size validation on upload
- Extension validation to prevent malicious files

## Database Schema

The `question` table includes a new optional field:
- `image_url` (VARCHAR, nullable): URL to the image in Supabase Storage

## API Changes

### Create Question Endpoint
```
POST /api/questions
```
New optional parameter:
- `image_url` (string): URL to image in Supabase Storage

### Update Question Endpoint
```
PUT /api/questions/{id}
```
New optional parameter:
- `image_url` (string): URL to image in Supabase Storage

### Get Question Endpoint
```
GET /api/questions/{id}
```
Response includes:
- `image_url` (string|null): URL to image if one exists

## Troubleshooting

### Image won't upload
1. Check file size (must be < 5MB)
2. Verify file is an image type
3. Ensure you're authenticated
4. Check Supabase Storage bucket is created and configured as **private**

### Image doesn't display
1. Verify bucket is set to "Private" (not public)
2. Check image_url is correctly saved in database
3. Ensure signed URL was generated successfully
4. Verify you're logged in when viewing questions
5. Check RLS policies allow authenticated users to SELECT

### "Failed to upload image" error
1. Check Supabase credentials in `.env` file
2. Verify Storage bucket exists and is named `question-images`
3. Check RLS policies are configured correctly for authenticated users
4. Review browser console for detailed error messages

### Images stop working after some time
- Signed URLs expire after 1 year
- If URLs expire, questions will need to be updated with new signed URLs
- Consider implementing a background job to refresh expiring URLs

## Future Enhancements

Potential improvements for future versions:
- Image cropping/editing before upload
- Multiple images per question
- Image galleries
- Drag-and-drop upload
- Automatic image optimization/compression
- Support for image captions
- Copy/paste images from clipboard
