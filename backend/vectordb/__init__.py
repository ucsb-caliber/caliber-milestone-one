"""
ChromaDB vector database for word embeddings.
"""

from .chroma_client import (
    add_word_embeddings,
    get_client,
    get_word_embeddings_collection,
    query_word_embeddings,
)

__all__ = [
    "get_client",
    "get_word_embeddings_collection",
    "add_word_embeddings",
    "query_word_embeddings",
]
