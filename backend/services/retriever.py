"""
Semantic Retrieval Service for SafeRoute AI.

Queries ChromaDB (populated by ingest.py from places.json)
using sentence-transformer embeddings for semantic search.

ChromaDB v0.6.0 compatible.
"""

import json
import logging
from dataclasses import dataclass, field

from services.embeddings import get_embedding_service

logger = logging.getLogger(__name__)

DEFAULT_N_RESULTS = 10
MAX_N_RESULTS = 30


@dataclass
class RetrievedDocument:
    """
    A single document retrieved from ChromaDB.
    Now includes the full rich metadata from places.json ingestion.
    """
    doc_id:                     str
    place_id:                   str
    name:                       str
    category:                   str
    subcategory:                str
    description:                str
    budget_level:               str
    recommended_duration_hours: float
    best_time:                  str
    tags:                       list[str]
    interests:                  list[str]
    neighborhood:               str
    lat:                        float
    lon:                        float
    indoor:                     bool
    weather_preference:         str
    recommendation_tier:        str
    walking_intensity:          str
    must_visit:                 bool
    rating:                     float
    nearby_place_ids:           list[str]
    pair_well_with:             list[str]
    highlights:                 list[str]
    relevance_score:            float


class RetrieverService:
    """
    Semantic retrieval service over the Hyderabad tourism ChromaDB collection.
    Compatible with ChromaDB v0.6.0+.
    """

    def __init__(self) -> None:
        self._svc = get_embedding_service()
        count = self._svc.collection_count()
        logger.info(
            "RetrieverService initialised | collection_size=%d", count
        )
        if count == 0:
            logger.warning(
                "ChromaDB collection is EMPTY. "
                "Run: python scripts/ingest.py --rebuild"
            )
        elif count < 79:
            logger.warning(
                "ChromaDB has only %d documents, expected 79. "
                "Run: python scripts/ingest.py --rebuild",
                count,
            )

    def retrieve(
        self,
        query: str,
        n_results: int = DEFAULT_N_RESULTS,
        filter_categories: list[str] | None = None,
        filter_budget: str | None = None,
    ) -> list[RetrievedDocument]:
        """
        Retrieve most semantically relevant tourism documents.

        Args:
            query:             Natural language query string.
            n_results:         Number of documents to return.
            filter_categories: Optional category filter list.
            filter_budget:     Optional budget level filter.

        Returns:
            List of RetrievedDocument sorted by relevance (best first).
        """
        if not query.strip():
            raise ValueError("Query string cannot be empty")

        n_results = min(n_results, MAX_N_RESULTS)

        where_filter = self._build_where_filter(
            filter_categories, filter_budget
        )

        query_embedding = self._svc.embed_single(query)

        try:
            kwargs = dict(
                query_embeddings=[query_embedding],
                n_results=n_results,
                include=["metadatas", "distances", "documents"],
            )
            if where_filter is not None:
                kwargs["where"] = where_filter

            results = self._svc.collection.query(**kwargs)

        except Exception as exc:
            logger.exception(
                "ChromaDB query failed for query=%r: %s", query, exc
            )
            raise RuntimeError(f"Retrieval failed: {str(exc)}") from exc

        documents = self._parse_results(results)

        logger.info(
            "Retrieved %d documents for query=%r",
            len(documents), query,
        )

        return documents

    def retrieve_by_interests(
        self,
        interests: list[str],
        budget: str,
        n_results: int = DEFAULT_N_RESULTS,
    ) -> list[RetrievedDocument]:
        """
        Retrieve documents relevant to user travel interests and budget.
        """
        if not interests:
            raise ValueError("Interests list cannot be empty")

        interest_query_map = {
            "culture":      "cultural heritage arts craft tradition festival",
            "food":         "restaurant food dining biryani street food haleem",
            "nature":       "nature park lake wildlife outdoor green garden",
            "nightlife":    "nightlife bars evening entertainment show",
            "shopping":     "shopping market bazaar mall craft souvenirs laad",
            "history":      "history fort palace monument museum heritage qutb",
            "photography":  "photography scenic viewpoint architecture panoramic",
            "adventure":    "adventure trekking outdoor sports activities climbing",
            "relaxation":   "relaxation spa wellness peaceful calm lake resort",
            "architecture": "architecture design monument heritage building dome",
        }

        query_parts = [
            interest_query_map.get(i.lower(), i)
            for i in interests
        ]
        composite_query = f"Hyderabad tourism: {' '.join(query_parts)}"

        budget_filter = self._normalise_budget(budget)

        return self.retrieve(
            query=composite_query,
            n_results=n_results,
            filter_budget=budget_filter,
        )

    def retrieve_multi_query(
        self,
        interests: list[str],
        budget: str,
        n_per_query: int = 5,
    ) -> list[RetrievedDocument]:
        """
        Run one retrieval query per interest and merge results.
        Ensures representation from each interest category.
        """
        if not interests:
            raise ValueError("Interests list cannot be empty")

        budget_filter = self._normalise_budget(budget)
        seen_ids: set[str] = set()
        all_documents: list[RetrievedDocument] = []

        for interest in interests:
            query = f"Hyderabad {interest} tourism places activities attractions"
            try:
                docs = self.retrieve(
                    query=query,
                    n_results=n_per_query,
                    filter_budget=budget_filter,
                )
            except RuntimeError:
                logger.warning(
                    "Retrieval failed for interest=%r, skipping", interest
                )
                continue

            for doc in docs:
                if doc.doc_id not in seen_ids:
                    seen_ids.add(doc.doc_id)
                    all_documents.append(doc)

        all_documents.sort(key=lambda d: d.relevance_score)

        logger.info(
            "Multi-query retrieval | interests=%s | unique_docs=%d",
            interests, len(all_documents),
        )

        return all_documents

    def get_alternatives(
        self,
        place_name: str,
        category: str | None = None,
        budget: str | None = None,
        n_results: int = 5,
    ) -> list[RetrievedDocument]:
        """
        Find alternative places similar to the given one.
        Used by the activity swap feature.
        """
        if not place_name.strip():
            raise ValueError("place_name cannot be empty")

        query = f"Hyderabad places similar to {place_name}"
        categories_list = [category] if category else None

        docs = self.retrieve(
            query=query,
            n_results=n_results + 5,
            filter_categories=categories_list,
            filter_budget=budget,
        )

        original_lower = place_name.lower().strip()
        filtered = [
            d for d in docs
            if original_lower not in d.name.lower()
            and d.name.lower() not in original_lower
        ]

        return filtered[:n_results]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_where_filter(
        self,
        categories: list[str] | None,
        budget: str | None,
    ) -> dict | None:
        """
        Build ChromaDB where filter from optional constraints.
        Returns None if no filters (avoids passing empty where dict).
        """
        conditions = []

        if categories:
            normalised = [c.lower().strip() for c in categories]
            if len(normalised) == 1:
                conditions.append({"category": {"$eq": normalised[0]}})
            else:
                conditions.append({"category": {"$in": normalised}})

        if budget:
            allowed = self._budget_to_allowed_levels(budget)
            if len(allowed) == 1:
                conditions.append({"budget_level": {"$eq": allowed[0]}})
            else:
                conditions.append({"budget_level": {"$in": allowed}})

        if not conditions:
            return None
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def _budget_to_allowed_levels(self, budget: str) -> list[str]:
        """Map user budget to allowed ChromaDB budget_level values."""
        b = budget.lower().strip()
        if b in ("budget", "low", "cheap"):
            return ["free", "budget"]
        if b in ("mid-range", "mid", "medium", "moderate"):
            return ["free", "budget", "mid-range"]
        if b in ("premium", "luxury", "high"):
            return ["free", "budget", "mid-range", "premium"]
        logger.warning("Unknown budget '%s', allowing all levels", budget)
        return ["free", "budget", "mid-range", "premium"]

    def _normalise_budget(self, budget: str) -> str:
        """Normalise budget strings to canonical form."""
        b = budget.lower().strip()
        if b in ("budget", "low", "cheap"):
            return "budget"
        if b in ("mid-range", "mid", "medium", "moderate"):
            return "mid-range"
        if b in ("premium", "luxury", "high"):
            return "premium"
        return "mid-range"

    def _parse_results(self, results: dict) -> list[RetrievedDocument]:
        """
        Parse raw ChromaDB query results into RetrievedDocument objects.
        Handles missing fields gracefully.
        """
        documents: list[RetrievedDocument] = []

        ids = results.get("ids", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for doc_id, meta, distance in zip(ids, metadatas, distances):
            try:
                tags = json.loads(meta.get("tags", "[]"))
            except (json.JSONDecodeError, TypeError):
                tags = []

            try:
                interests = json.loads(meta.get("interests", "[]"))
            except (json.JSONDecodeError, TypeError):
                interests = []

            try:
                nearby = json.loads(meta.get("nearby_place_ids", "[]"))
            except (json.JSONDecodeError, TypeError):
                nearby = []

            try:
                pairs = json.loads(meta.get("pair_well_with", "[]"))
            except (json.JSONDecodeError, TypeError):
                pairs = []

            try:
                highlights = json.loads(meta.get("highlights", "[]"))
            except (json.JSONDecodeError, TypeError):
                highlights = []

            documents.append(
                RetrievedDocument(
                    doc_id=doc_id,
                    place_id=str(meta.get("place_id", "")),
                    name=str(meta.get("name", "")),
                    category=str(meta.get("category", "")),
                    subcategory=str(meta.get("subcategory", "")),
                    description=str(meta.get("description", "")),
                    budget_level=str(meta.get("budget_level", "")),
                    recommended_duration_hours=float(
                        meta.get("recommended_duration_hours", 1.0)
                    ),
                    best_time=str(meta.get("best_time", "")),
                    tags=tags,
                    interests=interests,
                    neighborhood=str(meta.get("neighborhood", "")),
                    lat=float(meta.get("lat", 0.0)),
                    lon=float(meta.get("lon", 0.0)),
                    indoor=bool(meta.get("indoor", False)),
                    weather_preference=str(
                        meta.get("weather_preference", "any")
                    ),
                    recommendation_tier=str(
                        meta.get("recommendation_tier", "C")
                    ),
                    walking_intensity=str(
                        meta.get("walking_intensity", "moderate")
                    ),
                    must_visit=bool(meta.get("must_visit", False)),
                    rating=float(meta.get("rating", 4.0)),
                    nearby_place_ids=nearby,
                    pair_well_with=pairs,
                    highlights=highlights,
                    relevance_score=float(distance),
                )
            )

        return documents


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_retriever_instance: RetrieverService | None = None


def get_retriever() -> RetrieverService:
    """Returns singleton RetrieverService. Initialised once on first call."""
    global _retriever_instance
    if _retriever_instance is None:
        _retriever_instance = RetrieverService()
    return _retriever_instance