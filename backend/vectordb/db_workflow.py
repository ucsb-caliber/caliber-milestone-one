"""
DB workflow: populate SQL + ChromaDB from labeled data, or add unlabeled
questions (assign category first) then persist to both DBs.
"""

from typing import Any, Dict, List, Literal

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
        self.embedding_model = None  # BGE-M3

    def get_embedding(self, text: str) -> List[float]:
        """Convert string text into a vector embedding."""
        pass

    def assign_category(self, question_text: str) -> str:
        """Assign a category from the question text. Returns the category (e.g. category name or 'Review')."""
        pass

    def populate(self, data: Dict[str, Any]) -> None:
        """Load questions with category labels from data; add each to SQL and ChromaDB (using get_embedding)."""
        pass

    def add(self, data: Dict[str, Any]) -> None:
        """Load questions with NO category labels; assign_category for each, then add to SQL and ChromaDB."""
        pass

    def run(self, data: Dict[str, Any]) -> None:
        """Run the workflow using self.mode: populate (labeled data) or add (unlabeled, assign category then persist)."""
        pass
