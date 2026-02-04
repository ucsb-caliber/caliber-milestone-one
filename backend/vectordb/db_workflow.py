"""
DB workflow: populate SQL + ChromaDB from labeled data, or add unlabeled
questions (assign category first) then persist to both DBs.
"""

from typing import Any, Dict, List, Literal
from transformers import AutoModel, AutoTokenizer
import torch
from app.vectordb.chroma_client import query_word_embeddings

# SQL database (session/engine)
# from sqlmodel import Session, create_engine

# ChromaDB vector store
# import chromadb

# Embedding model (e.g. BGE-M3 for get_embedding)


class DBWorkflow:
    """
    Run either: populate (labeled questions → SQL + ChromaDB) or
    add (unlabeled questions → assign_category → SQL + ChromaDB).
    """

    def __init__(self, mode: Literal["populate", "add"]) -> None:
        # Whether this workflow is populating (labeled) or adding (unlabeled) questions
        self.mode = mode
        # SQL: engine and/or session factory
        self.sql_engine = None  # create_engine(...)
        # ChromaDB: persistent client and word_embeddings (or question) collection
        self.chroma_client = None  # chromadb.PersistentClient(path=...)
        self.chroma_collection = None  # client.get_or_create_collection(...)
        # Embedding model for get_embedding(text) -> vector
        self.embedding_model_name = "BGE-M3-model-name"  # Replace with actual model name
        self.tokenizer = AutoTokenizer.from_pretrained(self.embedding_model_name)
        self.model = AutoModel.from_pretrained(self.embedding_model_name)

    def get_embedding(self, text: str) -> List[float]:
        """Convert string text into a vector embedding."""
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            outputs = self.model(**inputs)
        # Assuming the pooled output is the embedding
        embedding = outputs.last_hidden_state.mean(dim=1).squeeze().tolist()
        return embedding

    def assign_category(self, question_text: str) -> str:
        """Assign a category from the question text using vector similarity."""
        # Generate the embedding for the question text
        embedding = self.get_embedding(question_text)

        # Query the top 5 closest embeddings from the word embeddings collection
        results = query_word_embeddings(query_embeddings=[embedding], n_results=5)

        # Extract the closest category from the metadata of the top result
        if results and "metadatas" in results and results["metadatas"]:
            top_metadata = results["metadatas"][0]  # First query's top result
            if top_metadata:
                return top_metadata[0].get("category", "General")

        # Default to "General" if no match is found
        return "General"

    def populate(self, data: Dict[str, Any]) -> None:
        """Load questions with category labels from data; add each to SQL and ChromaDB (using get_embedding)."""
        pass

    def add(self, data: Dict[str, Any]) -> None:
        """Load questions with NO category labels; assign_category for each, then add to SQL and ChromaDB."""
        pass

    def run(self, data: Dict[str, Any]) -> None:
        """Run the workflow using self.mode: populate (labeled data) or add (unlabeled, assign category then persist)."""
        pass
