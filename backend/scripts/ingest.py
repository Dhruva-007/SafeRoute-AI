"""
Hyderabad Tourism Knowledge Base Ingestion Script.

Reads all JSON files from backend/data/hyderabad/,
generates embeddings using sentence-transformers/all-MiniLM-L6-v2,
and stores them in ChromaDB with full metadata.

Run from the backend/ directory:
    python scripts/ingest.py
"""

import json
import logging
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure backend/ is on the Python path when running as a script
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from services.embeddings import get_embedding_service  # noqa: E402

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("ingest")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DATA_DIR = BACKEND_DIR / "data" / "hyderabad"

KNOWN_FILES = [
    "attractions.json",
    "food.json",
    "culture.json",
    "nature.json",
    "nightlife.json",
    "adventure.json",
    "history.json",
    "shopping.json",
    "relaxation.json",
]

REQUIRED_FIELDS = {
    "name",
    "category",
    "description",
    "budget_level",
    "recommended_duration_hours",
    "best_time",
    "tags",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_document_text(entry: dict) -> str:
    """
    Build the text string that will be embedded for semantic search.
    Combines all meaningful fields into one rich text representation.
    """
    tags_str = ", ".join(entry.get("tags", []))
    return (
        f"Name: {entry['name']}. "
        f"Category: {entry['category']}. "
        f"Description: {entry['description']} "
        f"Budget: {entry['budget_level']}. "
        f"Best time to visit: {entry['best_time']}. "
        f"Recommended duration: {entry['recommended_duration_hours']} hours. "
        f"Tags: {tags_str}."
    )


def build_document_id(category: str, name: str, index: int) -> str:
    """
    Build a stable, unique document ID for ChromaDB.
    Format: category__name_slug__index
    """
    name_slug = name.lower().replace(" ", "_").replace("/", "_")[:50]
    return f"{category}__{name_slug}__{index}"


def validate_entry(entry: dict, source_file: str, index: int) -> list[str]:
    """
    Validate a single knowledge base entry.
    Returns a list of validation error strings (empty if valid).
    """
    errors = []
    missing = REQUIRED_FIELDS - set(entry.keys())
    if missing:
        errors.append(
            f"[{source_file}][{index}] Missing fields: {missing}"
        )
    if "name" in entry and not entry["name"].strip():
        errors.append(f"[{source_file}][{index}] 'name' is empty")
    if "description" in entry and len(entry["description"]) < 50:
        errors.append(
            f"[{source_file}][{index}] 'description' too short "
            f"(got {len(entry['description'])} chars, min 50)"
        )
    if "tags" in entry and not isinstance(entry["tags"], list):
        errors.append(f"[{source_file}][{index}] 'tags' must be a list")
    return errors


def load_all_entries() -> list[dict]:
    """
    Load and validate all entries from all JSON files in DATA_DIR.
    Returns a flat list of validated entries with source file info added.
    """
    all_entries: list[dict] = []
    all_errors: list[str] = []

    for filename in KNOWN_FILES:
        filepath = DATA_DIR / filename
        if not filepath.exists():
            logger.warning("File not found, skipping: %s", filepath)
            continue

        logger.info("Loading: %s", filepath.name)

        with filepath.open("r", encoding="utf-8") as f:
            try:
                entries = json.load(f)
            except json.JSONDecodeError as exc:
                logger.error("JSON parse error in %s: %s", filename, exc)
                continue

        if not isinstance(entries, list):
            logger.error(
                "%s must contain a JSON array at the top level", filename
            )
            continue

        file_errors = []
        file_valid = 0

        for i, entry in enumerate(entries):
            errors = validate_entry(entry, filename, i)
            if errors:
                all_errors.extend(errors)
                file_errors.extend(errors)
            else:
                entry["_source_file"] = filename
                all_entries.append(entry)
                file_valid += 1

        logger.info(
            "  %s: %d valid, %d invalid",
            filename,
            file_valid,
            len(file_errors),
        )

    if all_errors:
        logger.warning(
            "Found %d validation error(s):", len(all_errors)
        )
        for err in all_errors:
            logger.warning("  %s", err)

    return all_entries


def ingest() -> None:
    """
    Main ingestion function.
    Loads all entries, generates embeddings, and upserts into ChromaDB.
    """
    start_time = time.time()

    logger.info("=" * 60)
    logger.info("SafeRoute AI — Hyderabad Knowledge Base Ingestion")
    logger.info("=" * 60)
    logger.info("Data directory: %s", DATA_DIR)

    # ------------------------------------------------------------------
    # Step 1: Load all entries
    # ------------------------------------------------------------------
    entries = load_all_entries()

    if not entries:
        logger.error(
            "No valid entries found. "
            "Check that %s contains valid JSON files.", DATA_DIR
        )
        sys.exit(1)

    logger.info("Total valid entries loaded: %d", len(entries))

    # ------------------------------------------------------------------
    # Step 2: Initialise embedding service and ChromaDB
    # ------------------------------------------------------------------
    logger.info("Initialising embedding service...")
    svc = get_embedding_service()

    existing_count = svc.collection_count()
    logger.info(
        "ChromaDB collection '%s' currently has %d document(s)",
        "hyderabad_tourism",
        existing_count,
    )

    # ------------------------------------------------------------------
    # Step 3: Build documents, IDs, embeddings, and metadata
    # ------------------------------------------------------------------
    logger.info("Building document texts for embedding...")

    documents: list[str] = []
    ids: list[str] = []
    metadatas: list[dict] = []

    for i, entry in enumerate(entries):
        doc_text = build_document_text(entry)
        doc_id = build_document_id(entry["category"], entry["name"], i)

        documents.append(doc_text)
        ids.append(doc_id)
        metadatas.append(
            {
                "name": entry["name"],
                "category": entry["category"],
                "budget_level": entry["budget_level"],
                "recommended_duration_hours": float(
                    entry["recommended_duration_hours"]
                ),
                "best_time": entry["best_time"],
                "tags": json.dumps(entry["tags"]),
                "source_file": entry["_source_file"],
                "description": entry["description"][:500],
            }
        )

    # ------------------------------------------------------------------
    # Step 4: Generate embeddings in batches
    # ------------------------------------------------------------------
    BATCH_SIZE = 32

    logger.info(
        "Generating embeddings for %d documents (batch size=%d)...",
        len(documents),
        BATCH_SIZE,
    )

    all_embeddings: list[list[float]] = []

    for batch_start in range(0, len(documents), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(documents))
        batch = documents[batch_start:batch_end]

        logger.info(
            "  Embedding batch %d-%d of %d...",
            batch_start + 1,
            batch_end,
            len(documents),
        )

        batch_embeddings = svc.embed(batch)
        all_embeddings.extend(batch_embeddings)

    logger.info("All embeddings generated: %d vectors", len(all_embeddings))

    # ------------------------------------------------------------------
    # Step 5: Upsert into ChromaDB
    # ------------------------------------------------------------------
    logger.info("Upserting documents into ChromaDB...")

    svc.collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=all_embeddings,
        metadatas=metadatas,
    )

    final_count = svc.collection_count()
    elapsed = time.time() - start_time

    logger.info("=" * 60)
    logger.info("Ingestion complete")
    logger.info("  Documents upserted : %d", len(entries))
    logger.info("  Collection total   : %d", final_count)
    logger.info("  Time elapsed       : %.2f seconds", elapsed)
    logger.info("  ChromaDB location  : %s/chroma_db/", BACKEND_DIR)
    logger.info("=" * 60)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    ingest()