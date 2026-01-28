"""
Supabase Storage module for handling question image uploads.

This module uses Supabase Storage with private buckets and signed URLs.
It requires the following dependencies:
- supabase==2.3.4
- httpx==0.25.2 (required by supabase-py)

If you see errors about "Supabase client initialization failed", run:
    pip install -r requirements.txt

For setup instructions, see IMAGE_UPLOAD_SETUP.md
"""

import os
import uuid
from supabase import create_client, Client
from fastapi import UploadFile, HTTPException

# Initialize Supabase client
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service key for storage operations

# Bucket name for question images
QUESTION_IMAGES_BUCKET = "question-images"

# Allowed image MIME types
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png", 
    "image/gif",
    "image/webp",
    "image/svg+xml"
}

# Max file size: 5MB
MAX_FILE_SIZE = 5 * 1024 * 1024


def get_storage_client() -> Client:
    """Get Supabase client for storage operations."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set for storage operations")
    try:
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    except TypeError as exc:
        # Some httpx versions renamed the proxy argument; ensure httpx is pinned appropriately
        if "proxy" in str(exc).lower() or "httpx" in str(exc).lower():
            raise HTTPException(
                status_code=500, 
                detail="Supabase client initialization failed. Ensure httpx==0.25.2 is installed: pip install httpx==0.25.2"
            ) from exc
        raise
    except Exception as exc:
        # Other initialization errors - but don't catch HTTPException
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize Supabase storage client: {str(exc)}"
        ) from exc


def validate_image_file(file: UploadFile) -> None:
    """
    Validate uploaded image file for MIME type and size.
    Raises HTTPException if validation fails.
    """
    # Check MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{file.content_type}'. Allowed types: {', '.join(ALLOWED_MIME_TYPES)}"
        )
    
    # Check file size by reading content
    # Note: This reads the file into memory, which is fine for our 5MB limit
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB"
        )


async def upload_question_image(file: UploadFile, user_id: str) -> str:
    """
    Upload an image to Supabase Storage (private bucket).
    Returns the file path for generating signed URLs later.
    
    Args:
        file: The uploaded file from FastAPI
        user_id: The user's ID for organizing files
        
    Returns:
        The file path in the bucket (not a URL)
    """
    # Validate file before upload
    validate_image_file(file)
    
    client = get_storage_client()
    
    # Generate unique filename with user folder
    file_extension = os.path.splitext(file.filename)[1].lower() if file.filename else ".png"
    # Sanitize extension
    if file_extension not in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"]:
        file_extension = ".png"
    
    unique_filename = f"{user_id}/{uuid.uuid4()}{file_extension}"
    
    # Read file content
    content = await file.read()
    
    # Upload to Supabase Storage
    result = client.storage.from_(QUESTION_IMAGES_BUCKET).upload(
        path=unique_filename,
        file=content,
        file_options={"content-type": file.content_type or "image/png"}
    )
    
    # Return just the path - signed URLs generated on demand
    return unique_filename


def get_signed_url(file_path: str, expires_in: int = 3600) -> str:
    """
    Generate a signed URL for accessing a private file.
    
    Args:
        file_path: The path to the file in the bucket
        expires_in: URL expiration time in seconds (default 1 hour)
        
    Returns:
        A signed URL that expires after the specified time
    """
    if not file_path:
        return None
    
    try:
        client = get_storage_client()
        result = client.storage.from_(QUESTION_IMAGES_BUCKET).create_signed_url(
            path=file_path,
            expires_in=expires_in
        )
        # Handle different response formats from supabase-py
        return result.get("signedURL") or result.get("signedUrl")
    except Exception as e:
        print(f"Error generating signed URL: {e}")
        return None


def delete_question_image(file_path: str) -> bool:
    """
    Delete an image from Supabase Storage.
    
    Args:
        file_path: The path to the file in the bucket
        
    Returns:
        True if deletion was successful, False otherwise
    """
    if not file_path:
        return True
    
    try:
        client = get_storage_client()
        client.storage.from_(QUESTION_IMAGES_BUCKET).remove([file_path])
        return True
    except Exception as e:
        print(f"Error deleting image: {e}")
        return False
