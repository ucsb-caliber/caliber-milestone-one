"""
ChromaDB client and helpers for storing and querying word embeddings.
"""

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings

# Default persistent path: backend/vectordb/chroma_data
_VECTORDB_DIR = Path(__file__).resolve().parent
_DEFAULT_PERSIST_PATH = _VECTORDB_DIR / "chroma_data"

_COLLECTION_NAME = "word_embeddings"

_client: Optional[chromadb.PersistentClient] = None


def get_client(path: Optional[str] = None) -> chromadb.PersistentClient:
    """Get or create the ChromaDB persistent client."""
    global _client
    if _client is None:
        persist_path = path or os.getenv("CHROMA_PERSIST_PATH", str(_DEFAULT_PERSIST_PATH))
        Path(persist_path).mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=persist_path,
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def get_word_embeddings_collection():
    """Get or create the collection used for word embeddings."""
    client = get_client()
    return client.get_or_create_collection(
        name=_COLLECTION_NAME,
        metadata={"description": "Word embeddings"},
    )


def add_word_embeddings(
    ids: List[str],
    embeddings: List[List[float]],
    metadatas: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """
    Add word embeddings to the vector store.

    Args:
        ids: Unique ids for each embedding (e.g. word or "word_1").
        embeddings: List of embedding vectors (list of floats per item).
        metadatas: Optional list of metadata dicts (one per id).
    """
    collection = get_word_embeddings_collection()
    kwargs = {"ids": ids, "embeddings": embeddings}
    if metadatas is not None:
        kwargs["metadatas"] = metadatas
    collection.add(**kwargs)


def query_word_embeddings(
    query_embeddings: List[List[float]],
    n_results: int = 10,
    where: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Query the word embeddings by vector similarity.

    Args:
        query_embeddings: One or more query vectors.
        n_results: Max number of results per query vector.
        where: Optional metadata filter.

    Returns:
        Dict with "ids", "distances", "metadatas" (lists of lists).
    """
    collection = get_word_embeddings_collection()
    kwargs = {
        "query_embeddings": query_embeddings,
        "n_results": n_results,
    }
    if where is not None:
        kwargs["where"] = where
    return collection.query(**kwargs)
