import PyPDF2
from typing import List, Dict, Optional
import io
import os
import uuid
from supabase import create_client, Client


def get_supabase_client() -> Client:
    """Get Supabase client for storage operations."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        raise ValueError("SUPABASE_URL and SUPABASE_ANON_KEY must be set")
    
    return create_client(supabase_url, supabase_key)


async def upload_image_to_supabase(file_content: bytes, file_name: str, user_id: str) -> str:
    """
    Upload an image to Supabase storage bucket and return the public URL.
    
    Args:
        file_content: The image file content as bytes
        file_name: Original filename
        user_id: User ID for organizing files
    
    Returns:
        Public URL of the uploaded image
    """
    try:
        supabase = get_supabase_client()
        
        # Generate unique filename with user_id prefix
        file_ext = file_name.split('.')[-1] if '.' in file_name else 'jpg'
        unique_name = f"{user_id}/{uuid.uuid4()}.{file_ext}"
        
        # Upload to 'question-images' bucket
        bucket_name = "question-images"
        
        # Upload the file
        response = supabase.storage.from_(bucket_name).upload(
            unique_name,
            file_content,
            file_options={"content-type": f"image/{file_ext}"}
        )
        
        # Get public URL
        public_url = supabase.storage.from_(bucket_name).get_public_url(unique_name)
        
        return public_url
    except Exception as e:
        print(f"Error uploading image to Supabase: {e}")
        # Return None if upload fails - image is optional
        return None


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
