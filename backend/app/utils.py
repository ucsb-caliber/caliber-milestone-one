import PyPDF2
from typing import List, Dict
import io
from datetime import datetime
import re


def get_supabase_client():
    """Get Supabase client for storage operations."""
    from .auth import get_supabase_client
    return get_supabase_client()


def upload_pdf_to_storage(file_content: bytes, filename: str, user_id: str) -> str:
    """
    Upload a PDF file to Supabase Storage.
    
    Args:
        file_content: The PDF file content as bytes
        filename: Original filename of the PDF
        user_id: ID of the user uploading the file
        
    Returns:
        str: The storage path of the uploaded PDF
        
    Raises:
        Exception: If upload fails
    """
    supabase = get_supabase_client()
    
    # Create a unique filename with user ID, timestamp, and original filename
    timestamp = int(datetime.now().timestamp() * 1000)
    
    # Sanitize filename to prevent path traversal and other issues
    # Remove or replace potentially problematic characters
    safe_filename = re.sub(r'[^\w\s\-\.]', '_', filename)
    safe_filename = safe_filename.replace(' ', '_')
    
    storage_path = f"{user_id}/{timestamp}_{safe_filename}"
    
    # Upload to Supabase Storage
    try:
        response = supabase.storage.from_('question-pdfs').upload(
            path=storage_path,
            file=file_content,
            file_options={
                'content-type': 'application/pdf',
                'cache-control': '3600',
                'upsert': False
            }
        )
        
        # Check if upload was successful
        if hasattr(response, 'error') and response.error:
            error_msg = str(response.error) if response.error else "Unknown error"
            raise Exception(f"Failed to upload PDF to storage: {error_msg}")
        
        return storage_path
    except Exception as e:
        # Re-raise with more context if it's not already our custom exception
        if "Failed to upload PDF to storage" not in str(e):
            raise Exception(f"Failed to upload PDF '{filename}' to storage: {str(e)}")
        raise


def download_pdf_from_storage(storage_path: str) -> bytes:
    """
    Download a PDF file from Supabase Storage.
    
    Args:
        storage_path: The storage path of the PDF
        
    Returns:
        bytes: The PDF file content
        
    Raises:
        Exception: If download fails
    """
    supabase = get_supabase_client()
    
    try:
        # Download from Supabase Storage
        response = supabase.storage.from_('question-pdfs').download(storage_path)
        
        if not response:
            raise Exception(f"Download returned empty response for path: {storage_path}")
        
        return response
    except Exception as e:
        # Provide helpful error message with context
        if "Download returned empty response" in str(e):
            raise
        raise Exception(f"Failed to download PDF from storage path '{storage_path}': {str(e)}")


def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from a PDF file."""
    pdf_file = io.BytesIO(file_content)
    pdf_reader = PyPDF2.PdfReader(pdf_file)
    
    text = ""
    for page in pdf_reader.pages:
        text += page.extract_text() + "\n"
    
    return text


def send_to_agent_pipeline(text: str, filename: str) -> List[Dict[str, str]]:
    """
    Stubbed agent pipeline that processes PDF text and returns question dicts.
    
    This is a placeholder for the future AGI pipeline that will:
    - Split the text into meaningful chunks
    - Extract questions, tags, and keywords
    - Generate embeddings (pgvector/etc)
    - Perform semantic analysis
    
    For now, it simply splits text into chunks and creates mock questions.
    
    Args:
        text: Extracted text from the PDF
        filename: Name of the source PDF file
    
    Returns:
        List of question dictionaries with keys: text, tags, keywords
    """
    # Simple chunking: split by double newlines or every ~500 characters
    chunks = []
    current_chunk = ""
    
    for line in text.split('\n'):
        if len(current_chunk) + len(line) > 500 and current_chunk:
            chunks.append(current_chunk.strip())
            current_chunk = line
        else:
            current_chunk += " " + line
    
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    
    # Create mock questions from chunks
    questions = []
    for i, chunk in enumerate(chunks[:10]):  # Limit to 10 questions for demo
        if not chunk or len(chunk) < 20:  # Skip very short chunks
            continue
        
        # Mock extraction of tags and keywords
        words = chunk.split()[:50]  # First 50 words
        keywords = [w.strip('.,!?;:') for w in words if len(w) > 5][:5]
        
        questions.append({
            "text": chunk[:500],  # Limit text length
            "tags": f"chunk-{i+1},auto-generated",
            "keywords": ",".join(keywords[:5]) if keywords else "sample"
        })
    
    return questions
