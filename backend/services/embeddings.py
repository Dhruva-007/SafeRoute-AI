"""
Embedding Service for SafeRoute AI.

Manages the SentenceTransformer model and ChromaDB client.
Provides a single shared instance via get_embedding_service().

Fixes applied:
  Issue 6: TRANSFORMERS_OFFLINE=1 and HF_HUB_OFFLINE=1 set before model
           load so HuggingFace is never contacted when model is cached.
           Reduces load time from ~52s to ~2-3s.
  Issue 7: anonymized_telemetry=False passed to ChromaDB client to
           suppress the Posthog version-mismatch ERROR log spam.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

EMBEDDING_MODEL_NAME  = "sentence-transformers/all-MiniLM-L6-v2"
CHROMA_COLLECTION_NAME = "hyderabad_tourism"
CHROMA_PERSIST_DIR     = "./chroma_db"


def _set_offline_mode() -> None:
    """
    Force HuggingFace libraries to use only the local model cache.

    When the model is already downloaded, these flags prevent any
    outbound HTTP requests to huggingface.co — eliminating the 40–50
    second HEAD-request sequence that occurred on every cold start.

    Only set if not already configured so the caller can override
    (e.g. during initial model download or CI environments).
    """
    if os.environ.get("TRANSFORMERS_OFFLINE") != "0":
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

    if os.environ.get("HF_DATASETS_OFFLINE") != "0":
        os.environ["HF_DATASETS_OFFLINE"] = "1"

    # HF_HUB_OFFLINE is the newer canonical flag used by huggingface_hub >= 0.14
    if os.environ.get("HF_HUB_OFFLINE") != "0":
        os.environ["HF_HUB_OFFLINE"] = "1"

    logger.debug(
        "HuggingFace offline mode active — "
        "TRANSFORMERS_OFFLINE=1 HF_HUB_OFFLINE=1 HF_DATASETS_OFFLINE=1"
    )


class EmbeddingService:
    """
    Manages the SentenceTransformer embedding model and ChromaDB client.
    Provides a single shared instance via get_embedding_service().
    """

    def __init__(self) -> None:
        # Issue 6 fix: force offline mode before SentenceTransformer import
        # resolves the model — this must happen before the model loads,
        # not at module import time, so it is safe to set here.
        _set_offline_mode()

        logger.info("Loading embedding model: %s", EMBEDDING_MODEL_NAME)
        self._model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        logger.info("Embedding model loaded successfully")

        logger.info("Initialising ChromaDB at: %s", CHROMA_PERSIST_DIR)
        # Issue 7 fix: anonymized_telemetry=False suppresses the Posthog
        # capture() argument-count error that pollutes logs with ERROR lines.
        self._client = chromadb.PersistentClient(
            path=CHROMA_PERSIST_DIR,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        logger.info("ChromaDB client initialised")

        self._collection = self._client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "Collection '%s' ready | documents=%d",
            CHROMA_COLLECTION_NAME,
            self._collection.count(),
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Convert a list of text strings into embedding vectors.

        Args:
            texts: List of strings to embed.

        Returns:
            List of embedding vectors as Python float lists.
        """
        if not texts:
            raise ValueError("Cannot embed an empty list of texts")

        logger.debug("Embedding %d text(s)", len(texts))
        vectors = self._model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        return vectors.tolist()

    def embed_single(self, text: str) -> list[float]:
        """
        Embed a single string and return its vector.

        Args:
            text: String to embed.

        Returns:
            Embedding vector as a Python float list.
        """
        return self.embed([text])[0]

    @property
    def collection(self) -> chromadb.Collection:
        """Direct access to the ChromaDB collection."""
        return self._collection

    @property
    def client(self) -> chromadb.PersistentClient:
        """Direct access to the ChromaDB client."""
        return self._client

    def collection_count(self) -> int:
        """Return number of documents currently stored in the collection."""
        return self._collection.count()


@lru_cache(maxsize=1)
def get_embedding_service() -> EmbeddingService:
    """
    Returns a singleton EmbeddingService instance.
    The model and ChromaDB client are loaded only once.
    """
    return EmbeddingService()