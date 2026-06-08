"""
Hyderabad Tourism Knowledge Base Ingestion Script — v2

Reads the canonical places.json (79 curated places),
generates embeddings using sentence-transformers/all-MiniLM-L6-v2,
and stores them in ChromaDB with full rich metadata.

Run from the backend/ directory:
    python scripts/ingest.py

To force a full rebuild (clears existing ChromaDB):
    python scripts/ingest.py --rebuild
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure backend/ is on the Python path
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
logger = logging.getLogger("ingest_v2")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PLACES_FILE = BACKEND_DIR / "data" / "places.json"
COLLECTION_NAME = "hyderabad_tourism"
BATCH_SIZE = 32

# Coordinate bounds — widened to cover Hyderabad metro + day-trip radius
# Standard Hyderabad district: lat 17.20-17.60, lon 78.20-78.70
# Extended for places like Ananthagiri Hills, resorts near city boundary
LAT_MIN = 17.00
LAT_MAX = 17.70
LON_MIN = 77.80
LON_MAX = 79.00


# ---------------------------------------------------------------------------
# Safe type converters — handle None gracefully
# ---------------------------------------------------------------------------

def safe_int(value, default: int = 0) -> int:
    """Convert value to int, returning default if None or unconvertible."""
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value, default: float = 0.0) -> float:
    """Convert value to float, returning default if None or unconvertible."""
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def safe_str(value, default: str = "") -> str:
    """Convert value to str, returning default if None."""
    if value is None:
        return default
    return str(value)


def safe_bool(value, default: bool = False) -> bool:
    """Convert value to bool safely."""
    if value is None:
        return default
    return bool(value)


def safe_json_list(value, default: list | None = None) -> str:
    """Serialise a list to JSON string, handling None."""
    if default is None:
        default = []
    if value is None:
        return json.dumps(default)
    if isinstance(value, list):
        return json.dumps(value)
    return json.dumps(default)


# ---------------------------------------------------------------------------
# Document builder
# ---------------------------------------------------------------------------

def build_document_text(place: dict) -> str:
    """
    Build rich text for embedding from a places.json entry.

    Combines all meaningful fields into one searchable string.
    Quality of this text directly affects retrieval relevance.
    """
    name        = safe_str(place.get("name"))
    category    = safe_str(place.get("category"))
    subcategory = safe_str(place.get("subcategory"))
    neighborhood= safe_str(place.get("neighborhood"))
    description = safe_str(place.get("short_description"))
    interests   = ", ".join(place.get("interests") or [])
    tags        = ", ".join(place.get("tags") or [])
    best_time   = safe_str(place.get("best_time"), "any time")
    highlights  = ". ".join(place.get("highlights") or [])
    budget_level= safe_str(place.get("budget_level"))
    walking     = safe_str(place.get("walking_intensity"))
    duration    = safe_float(place.get("recommended_duration_hours"), 1.0)
    aliases     = ", ".join(place.get("aliases") or [])

    parts = [
        f"Name: {name}.",
        f"Also known as: {aliases}." if aliases else "",
        f"Category: {category}.",
        f"Type: {subcategory}.",
        f"Location: {neighborhood}, Hyderabad.",
        f"Description: {description}",
        f"Highlights: {highlights}." if highlights else "",
        f"Interests: {interests}." if interests else "",
        f"Tags: {tags}." if tags else "",
        f"Best time: {best_time}.",
        f"Budget: {budget_level}.",
        f"Walking intensity: {walking}.",
        f"Duration: {duration} hours.",
    ]

    return " ".join(p for p in parts if p)


def build_metadata(place: dict) -> dict:
    """
    Build ChromaDB metadata from a place dict.

    ChromaDB metadata values must be str, int, float, or bool.
    Lists must be JSON-serialised to strings.
    All None values are handled by safe_* converters.
    """
    coords    = place.get("coordinates") or {}
    entry_fee = place.get("entry_fee") or {}

    return {
        # ── Identity ──────────────────────────────────────────────
        "place_id":   safe_str(place.get("id")),
        "name":       safe_str(place.get("name")),
        "aliases":    safe_json_list(place.get("aliases")),

        # ── Classification ────────────────────────────────────────
        "category":    safe_str(place.get("category")),
        "subcategory": safe_str(place.get("subcategory")),
        "interests":   safe_json_list(place.get("interests")),
        "tags":        safe_json_list(place.get("tags")),

        # ── Location ──────────────────────────────────────────────
        "neighborhood": safe_str(place.get("neighborhood")),
        "address":      safe_str(place.get("address")),
        "lat":          safe_float(coords.get("lat")),
        "lon":          safe_float(coords.get("lon")),

        # ── Cost ──────────────────────────────────────────────────
        "budget_level":        safe_str(place.get("budget_level"), "mid-range"),
        "avg_cost_per_person": safe_int(place.get("avg_cost_per_person")),
        "entry_fee_indian":    safe_int(entry_fee.get("indian_adult")),
        "entry_fee_foreign":   safe_int(entry_fee.get("foreign_adult")),
        "entry_fee_child":     safe_int(entry_fee.get("child")),
        "entry_fee_notes":     safe_str(entry_fee.get("notes")),

        # ── Timing ────────────────────────────────────────────────
        "recommended_duration_hours": safe_float(
            place.get("recommended_duration_hours"), 1.0
        ),
        "duration_bucket": safe_str(place.get("duration_bucket"), "short"),
        "best_time":       safe_str(place.get("best_time"), "any time"),
        "seasonal_notes":  safe_str(place.get("seasonal_notes")),

        # ── Conditions ────────────────────────────────────────────
        "weather_preference": safe_str(
            place.get("weather_preference"), "any"
        ),
        "indoor":       safe_bool(place.get("indoor")),
        "crowd_level":  safe_str(place.get("crowd_level"), "moderate"),

        # ── Audience ──────────────────────────────────────────────
        "family_friendly": safe_bool(place.get("family_friendly"), True),
        "couple_friendly": safe_bool(place.get("couple_friendly"), True),
        "solo_friendly":   safe_bool(place.get("solo_friendly"), True),
        "group_friendly":  safe_bool(place.get("group_friendly"), True),
        "senior_friendly": safe_bool(place.get("senior_friendly"), True),
        "child_friendly":  safe_bool(place.get("child_friendly"), True),

        # ── Relationships (used by Phase 2 geographic clustering) ─
        "nearby_place_ids": safe_json_list(place.get("nearby_place_ids")),
        "pair_well_with":   safe_json_list(place.get("pair_well_with")),

        # ── Quality signals ───────────────────────────────────────
        "rating":     safe_float(place.get("rating"), 4.0),
        "popularity": safe_str(place.get("popularity"), "popular"),
        "must_visit": safe_bool(place.get("must_visit")),

        # ── Recommendation signals ────────────────────────────────
        "recommendation_tier": safe_str(
            place.get("recommendation_tier"), "C"
        ),
        "walking_intensity": safe_str(
            place.get("walking_intensity"), "moderate"
        ),

        # ── Description ───────────────────────────────────────────
        "description": safe_str(place.get("short_description"))[:500],
        "highlights":  safe_json_list(place.get("highlights")),

        # ── Safety ────────────────────────────────────────────────
        "safety_notes":       safe_str(place.get("safety_notes")),
        "accessibility_notes": safe_str(place.get("accessibility_notes")),
    }


# ---------------------------------------------------------------------------
# Validator — warns only, never excludes
# ---------------------------------------------------------------------------

def validate_place(place: dict, index: int) -> list[str]:
    """
    Validate a single place entry.
    Returns list of WARNING strings.
    Validation failures are warnings only — all places are ingested.
    """
    warnings = []
    name = safe_str(place.get("name"), f"place_{index}")

    # Required identity fields
    for field in ["id", "name", "category", "interests", "coordinates"]:
        if field not in place or place[field] is None:
            warnings.append(f"[{name}] Missing field: {field}")

    # Coordinate check (widened bounds for greater Hyderabad area)
    coords = place.get("coordinates") or {}
    if isinstance(coords, dict):
        lat = coords.get("lat")
        lon = coords.get("lon")
        if lat is None or lon is None:
            warnings.append(f"[{name}] Missing lat/lon in coordinates")
        else:
            lat_f = safe_float(lat)
            lon_f = safe_float(lon)
            if not (LAT_MIN <= lat_f <= LAT_MAX):
                warnings.append(
                    f"[{name}] lat={lat_f} outside extended range "
                    f"({LAT_MIN}-{LAT_MAX})"
                )
            if not (LON_MIN <= lon_f <= LON_MAX):
                warnings.append(
                    f"[{name}] lon={lon_f} outside extended range "
                    f"({LON_MIN}-{LON_MAX})"
                )
    else:
        warnings.append(f"[{name}] coordinates is not a dict")

    # Tier check
    tier = safe_str(place.get("recommendation_tier")).upper()
    if tier not in ("S", "A", "B", "C"):
        warnings.append(
            f"[{name}] recommendation_tier={tier!r} not in S/A/B/C"
        )

    # Optional field warnings (data quality, not blockers)
    if not place.get("best_time"):
        warnings.append(f"[{name}] best_time is missing (will default)")

    if not place.get("walking_intensity"):
        warnings.append(f"[{name}] walking_intensity is missing (will default)")

    if not place.get("nearby_place_ids"):
        warnings.append(f"[{name}] nearby_place_ids is empty")

    return warnings


# ---------------------------------------------------------------------------
# Main ingestion
# ---------------------------------------------------------------------------

def ingest(rebuild: bool = False) -> None:
    start_time = time.time()

    logger.info("=" * 60)
    logger.info("SafeRoute AI — Hyderabad Knowledge Base Ingestion v2")
    logger.info("Source: %s", PLACES_FILE)
    logger.info("=" * 60)

    # ------------------------------------------------------------------
    # Step 1: Load places.json
    # ------------------------------------------------------------------
    if not PLACES_FILE.exists():
        logger.error("places.json not found at: %s", PLACES_FILE)
        sys.exit(1)

    with open(PLACES_FILE, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    if isinstance(dataset, dict):
        places = dataset.get("places", [])
        version     = dataset.get("version", "unknown")
        description = dataset.get("description", "")
    elif isinstance(dataset, list):
        places      = dataset
        version     = "unknown"
        description = ""
    else:
        logger.error("places.json has unexpected format")
        sys.exit(1)

    logger.info("Dataset version     : %s", version)
    logger.info("Dataset description : %s", description)
    logger.info("Places loaded       : %d", len(places))

    if not places:
        logger.error("No places found in places.json")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Step 2: Validate all places (warnings only — never exclude)
    # ------------------------------------------------------------------
    logger.info("Validating all places...")

    total_warnings = 0
    for i, place in enumerate(places):
        place_warnings = validate_place(place, i)
        if place_warnings:
            for w in place_warnings:
                logger.warning("  WARN: %s", w)
            total_warnings += len(place_warnings)

    logger.info(
        "Validation complete | places=%d | warnings=%d",
        len(places),
        total_warnings,
    )

    if total_warnings == 0:
        logger.info("All places passed validation with no warnings")
    else:
        logger.info(
            "%d warnings found — all %d places will still be ingested",
            total_warnings,
            len(places),
        )

    # ------------------------------------------------------------------
    # Step 3: Initialise embedding service and ChromaDB
    # ------------------------------------------------------------------
    logger.info("Initialising embedding service...")
    svc = get_embedding_service()

    existing_count = svc.collection_count()
    logger.info(
        "ChromaDB collection '%s' currently has %d document(s)",
        COLLECTION_NAME,
        existing_count,
    )

    # Clear existing documents if rebuild requested
    if rebuild and existing_count > 0:
        logger.info("--rebuild flag set. Clearing existing collection...")
        try:
            existing = svc.collection.get(include=[])
            existing_ids = existing.get("ids", [])
            if existing_ids:
                svc.collection.delete(ids=existing_ids)
                logger.info(
                    "Deleted %d existing documents", len(existing_ids)
                )
        except Exception as exc:
            logger.warning("Could not clear collection: %s", exc)

    # ------------------------------------------------------------------
    # Step 4: Build documents, IDs, embeddings, metadata
    # ------------------------------------------------------------------
    logger.info("Building document texts for %d places...", len(places))

    documents:  list[str]  = []
    ids:        list[str]  = []
    metadatas:  list[dict] = []
    build_errors = 0

    for i, place in enumerate(places):
        try:
            doc_text  = build_document_text(place)
            doc_id    = f"place__{safe_str(place.get('id', f'unknown_{i}'))}"
            metadata  = build_metadata(place)

            documents.append(doc_text)
            ids.append(doc_id)
            metadatas.append(metadata)

        except Exception as exc:
            build_errors += 1
            name = safe_str(place.get("name", f"place_{i}"))
            logger.error(
                "Failed to build document for [%s]: %s", name, exc
            )
            # Do not skip — use minimal fallback
            fallback_text = f"Name: {name}. Location: Hyderabad."
            fallback_id   = f"place__fallback_{i}"
            fallback_meta = {
                "place_id":  safe_str(place.get("id", f"fallback_{i}")),
                "name":      name,
                "category":  safe_str(place.get("category")),
                "budget_level": safe_str(place.get("budget_level"), "mid-range"),
                "lat":       safe_float(
                    (place.get("coordinates") or {}).get("lat")
                ),
                "lon":       safe_float(
                    (place.get("coordinates") or {}).get("lon")
                ),
                "recommendation_tier": safe_str(
                    place.get("recommendation_tier"), "C"
                ),
                "walking_intensity": safe_str(
                    place.get("walking_intensity"), "moderate"
                ),
                "must_visit":   safe_bool(place.get("must_visit")),
                "rating":       safe_float(place.get("rating"), 4.0),
                "indoor":       safe_bool(place.get("indoor")),
                "interests":    safe_json_list(place.get("interests")),
                "tags":         safe_json_list(place.get("tags")),
                "nearby_place_ids": safe_json_list(
                    place.get("nearby_place_ids")
                ),
                "pair_well_with": safe_json_list(
                    place.get("pair_well_with")
                ),
                "description":  "",
                "highlights":   "[]",
                "best_time":    "any time",
                "neighborhood": safe_str(place.get("neighborhood")),
                "aliases":      safe_json_list(place.get("aliases")),
                "subcategory":  safe_str(place.get("subcategory")),
                "avg_cost_per_person": safe_int(
                    place.get("avg_cost_per_person")
                ),
                "entry_fee_indian":  0,
                "entry_fee_foreign": 0,
                "entry_fee_child":   0,
                "entry_fee_notes":   "",
                "duration_bucket":   safe_str(place.get("duration_bucket"), "short"),
                "recommended_duration_hours": safe_float(
                    place.get("recommended_duration_hours"), 1.0
                ),
                "seasonal_notes":     "",
                "weather_preference": safe_str(
                    place.get("weather_preference"), "any"
                ),
                "crowd_level":       safe_str(place.get("crowd_level"), "moderate"),
                "family_friendly":   safe_bool(place.get("family_friendly"), True),
                "couple_friendly":   safe_bool(place.get("couple_friendly"), True),
                "solo_friendly":     safe_bool(place.get("solo_friendly"), True),
                "group_friendly":    safe_bool(place.get("group_friendly"), True),
                "senior_friendly":   safe_bool(place.get("senior_friendly"), True),
                "child_friendly":    safe_bool(place.get("child_friendly"), True),
                "popularity":        safe_str(place.get("popularity"), "popular"),
                "address":           safe_str(place.get("address")),
                "safety_notes":      safe_str(place.get("safety_notes")),
                "accessibility_notes": safe_str(
                    place.get("accessibility_notes")
                ),
            }
            documents.append(fallback_text)
            ids.append(fallback_id)
            metadatas.append(fallback_meta)

    logger.info(
        "Documents built: %d | build_errors: %d",
        len(documents),
        build_errors,
    )

    # ------------------------------------------------------------------
    # Step 5: Generate embeddings in batches
    # ------------------------------------------------------------------
    logger.info(
        "Generating embeddings for %d documents (batch_size=%d)...",
        len(documents),
        BATCH_SIZE,
    )

    all_embeddings: list[list[float]] = []

    for batch_start in range(0, len(documents), BATCH_SIZE):
        batch_end   = min(batch_start + BATCH_SIZE, len(documents))
        batch       = documents[batch_start:batch_end]

        logger.info(
            "  Embedding batch %d-%d / %d",
            batch_start + 1,
            batch_end,
            len(documents),
        )

        batch_embeddings = svc.embed(batch)
        all_embeddings.extend(batch_embeddings)

    logger.info(
        "All embeddings generated: %d vectors",
        len(all_embeddings),
    )

    # ------------------------------------------------------------------
    # Step 6: Upsert into ChromaDB
    # ------------------------------------------------------------------
    logger.info(
        "Upserting %d documents into ChromaDB...", len(documents)
    )

    svc.collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=all_embeddings,
        metadatas=metadatas,
    )

    final_count = svc.collection_count()
    elapsed     = time.time() - start_time

    logger.info("=" * 60)
    logger.info("Ingestion complete")
    logger.info("  Source              : places.json")
    logger.info("  Places in dataset   : %d", len(places))
    logger.info("  Documents upserted  : %d", len(documents))
    logger.info("  Collection total    : %d", final_count)
    logger.info("  Validation warnings : %d", total_warnings)
    logger.info("  Build errors        : %d", build_errors)
    logger.info("  Time elapsed        : %.2f seconds", elapsed)
    logger.info("  ChromaDB location   : %s/chroma_db/", BACKEND_DIR)
    logger.info("=" * 60)

    if final_count == 79:
        logger.info("SUCCESS: All 79 places are in ChromaDB")
    elif final_count >= 75:
        logger.warning(
            "NEAR COMPLETE: %d/79 places in ChromaDB", final_count
        )
    else:
        logger.error(
            "INCOMPLETE: Only %d/79 places in ChromaDB", final_count
        )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest Hyderabad places.json into ChromaDB"
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Clear existing ChromaDB collection before ingesting",
    )
    args = parser.parse_args()
    ingest(rebuild=args.rebuild)