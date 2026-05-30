import logging
from functools import lru_cache

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CHROMA_COLLECTION_NAME = "hyderabad_tourism"
CHROMA_PERSIST_DIR = "./chroma_db"


class EmbeddingService:
    """
    Manages the SentenceTransformer embedding model and ChromaDB client.
    Provides a single shared instance via get_embedding_service().
    """

    def __init__(self) -> None:
        logger.info("Loading embedding model: %s", EMBEDDING_MODEL_NAME)
        self._model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        logger.info("Embedding model loaded successfully")

        logger.info("Initialising ChromaDB at: %s", CHROMA_PERSIST_DIR)
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