import PyPDF2
from typing import List, Dict
import io


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
