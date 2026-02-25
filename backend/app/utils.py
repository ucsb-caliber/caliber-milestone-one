import PyPDF2
from typing import List, Dict
import io
import re


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
        List of question dictionaries with keys: title, text, tags, keywords
    """
    # Very simple parser: tokenize words and build a few short excerpts.
    words = re.findall(r"[A-Za-z0-9']+", text or "")

    if not words:
        return [{
            "title": "Extracted Preview 1",
            "text": f"No text could be extracted from {filename}.",
            "tags": "auto-generated,pdf-upload",
            "keywords": "pdf,upload,empty"
        }]

    excerpt_size = 14
    max_questions = 5
    questions: List[Dict[str, str]] = []

    for i in range(max_questions):
        start = i * excerpt_size
        end = start + excerpt_size
        if start >= len(words):
            break

        excerpt_words = words[start:end]
        excerpt = " ".join(excerpt_words)
        keywords = [w.lower() for w in excerpt_words if len(w) >= 5][:5]

        questions.append({
            "title": f"Extracted Preview {i + 1}",
            "text": excerpt,
            "tags": "auto-generated,pdf-upload",
            "keywords": ",".join(keywords) if keywords else "pdf,upload"
        })

    return questions
