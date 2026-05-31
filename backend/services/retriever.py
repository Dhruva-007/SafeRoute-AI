import json
import logging
from dataclasses import dataclass

from services.embeddings import get_embedding_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# How many documents to retrieve per query
# ---------------------------------------------------------------------------
DEFAULT_N_RESULTS = 10
MAX_N_RESULTS = 20


@dataclass
class RetrievedDocument:
    """
    A single document retrieved from ChromaDB with its metadata and
    relevance score.
    """
    doc_id: str
    name: str
    category: str
    description: str
    budget_level: str
    recommended_duration_hours: float
    best_time: str
    tags: list[str]
    relevance_score: float  # lower cosine distance = more relevant


class RetrieverService:
    """
    Semantic retrieval service over the Hyderabad tourism ChromaDB collection.

    Given a natural language query, it embeds the query using the same
    sentence-transformers model used during ingestion, queries ChromaDB
    for the nearest neighbours, and returns structured RetrievedDocument
    objects ready for prompt injection.
    """

    def __init__(self) -> None:
        self._svc = get_embedding_service()
        logger.info(
            "RetrieverService initialised | collection_size=%d",
            self._svc.collection_count(),
        )

    def retrieve(
        self,
        query: str,
        n_results: int = DEFAULT_N_RESULTS,
        filter_categories: list[str] | None = None,
        filter_budget: str | None = None,
    ) -> list[RetrievedDocument]:
        """
        Retrieve the most semantically relevant tourism documents.

        Args:
            query:             Natural language query string.
            n_results:         Number of documents to return.
            filter_categories: Optional list of categories to restrict
                               results to e.g. ['food', 'nature'].
            filter_budget:     Optional budget level filter:
                               'budget', 'mid-range', or 'premium'.

        Returns:
            List of RetrievedDocument sorted by relevance (best first).
        """
        if not query.strip():
            raise ValueError("Query string cannot be empty")

        n_results = min(n_results, MAX_N_RESULTS)

        logger.info(
            "Retrieving | query=%r | n=%d | categories=%s | budget=%s",
            query,
            n_results,
            filter_categories,
            filter_budget,
        )

        # Build ChromaDB where filter
        where_filter = self._build_where_filter(
            filter_categories, filter_budget
        )

        # Embed the query
        query_embedding = self._svc.embed_single(query)

        # Query ChromaDB
        try:
            results = self._svc.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where=where_filter,
                include=["metadatas", "distances", "documents"],
            )
        except Exception as exc:
            logger.exception(
                "ChromaDB query failed for query=%r: %s", query, exc
            )
            raise RuntimeError(
                f"Retrieval failed: {str(exc)}"
            ) from exc

        documents = self._parse_results(results)

        logger.info(
            "Retrieved %d documents for query=%r",
            len(documents),
            query,
        )

        return documents

    def retrieve_by_interests(
        self,
        interests: list[str],
        budget: str,
        n_results: int = DEFAULT_N_RESULTS,
    ) -> list[RetrievedDocument]:
        """
        Retrieve documents relevant to a user's travel interests and budget.

        Builds a rich query string from the interests list and optionally
        filters by budget level. Designed to be called by the planner
        before itinerary generation.

        Args:
            interests:  List of interest strings e.g.
                        ['food', 'history', 'nature'].
            budget:     User budget string: 'budget', 'mid-range',
                        or 'premium'.
            n_results:  Number of documents to return.

        Returns:
            List of RetrievedDocument sorted by relevance.
        """
        if not interests:
            raise ValueError("Interests list cannot be empty")

        # Map user-facing interest labels to category names and
        # query keywords for richer semantic search
        interest_query_map = {
            "culture":      "cultural heritage arts craft tradition",
            "food":         "restaurant food dining biryani street food",
            "nature":       "nature park lake wildlife outdoor green",
            "nightlife":    "nightlife bars evening entertainment show",
            "shopping":     "shopping market bazaar mall craft souvenirs",
            "history":      "history fort palace monument museum heritage",
            "photography":  "photography scenic viewpoint architecture",
            "adventure":    "adventure trekking outdoor sports activities",
            "relaxation":   "relaxation spa wellness peaceful calm lake",
        }

        # Build composite query from all interests
        query_parts = [
            interest_query_map.get(interest.lower(), interest)
            for interest in interests
        ]
        composite_query = (
            f"Hyderabad tourism: {' '.join(query_parts)}"
        )

        # Map budget to allowed budget levels
        budget_filter = self._normalise_budget(budget)

        logger.info(
            "Interest-based retrieval | interests=%s | budget=%s | "
            "composite_query=%r",
            interests,
            budget_filter,
            composite_query,
        )

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

        This ensures representation from each interest category
        even when some interests have fewer matching documents.

        Args:
            interests:    List of interest strings.
            budget:       User budget level.
            n_per_query:  Documents to retrieve per interest query.

        Returns:
            Deduplicated list of RetrievedDocument sorted by relevance.
        """
        if not interests:
            raise ValueError("Interests list cannot be empty")

        budget_filter = self._normalise_budget(budget)
        seen_ids: set[str] = set()
        all_documents: list[RetrievedDocument] = []

        for interest in interests:
            query = f"Hyderabad {interest} tourism places activities"

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

        # Sort merged results by relevance score ascending
        all_documents.sort(key=lambda d: d.relevance_score)

        logger.info(
            "Multi-query retrieval | interests=%s | "
            "total_unique_docs=%d",
            interests,
            len(all_documents),
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
        Useful for the "swap activity" feature.

        Args:
            place_name: Current place name to find alternatives for
            category:   Optional category to restrict alternatives to
                        ('food', 'attractions', etc.)
            budget:     Optional budget filter
            n_results:  Number of alternatives to return

        Returns:
            List of RetrievedDocument excluding the original place.
        """
        if not place_name.strip():
            raise ValueError("place_name cannot be empty")

        logger.info(
            "Finding alternatives | place=%r | category=%s | budget=%s",
            place_name, category, budget,
        )

        # Build query — semantic search will find similar places
        query = f"Hyderabad places similar to {place_name}"

        categories_list = [category] if category else None

        docs = self.retrieve(
            query=query,
            n_results=n_results + 5,  # fetch extra to filter out the original
            filter_categories=categories_list,
            filter_budget=budget,
        )

        # Filter out the original place (case-insensitive name match)
        original_lower = place_name.lower().strip()
        filtered = [
            d for d in docs
            if d.name.lower().strip() not in original_lower
            and original_lower not in d.name.lower().strip()
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
        Build a ChromaDB where filter dict from optional category and
        budget constraints.
        """
        conditions = []

        if categories:
            normalised = [c.lower().strip() for c in categories]
            if len(normalised) == 1:
                conditions.append({"category": {"$eq": normalised[0]}})
            else:
                conditions.append(
                    {"category": {"$in": normalised}}
                )

        if budget:
            allowed_budgets = self._budget_to_allowed_levels(budget)
            if len(allowed_budgets) == 1:
                conditions.append(
                    {"budget_level": {"$eq": allowed_budgets[0]}}
                )
            else:
                conditions.append(
                    {"budget_level": {"$in": allowed_budgets}}
                )

        if not conditions:
            return None
        if len(conditions) == 1:
            return conditions[0]
        return {"$and": conditions}

    def _budget_to_allowed_levels(self, budget: str) -> list[str]:
        """
        Map a user budget string to allowed ChromaDB budget_level values.

        Budget tiers are inclusive downward:
          - 'budget'    → only 'budget'
          - 'mid-range' → 'budget' and 'mid-range'
          - 'premium'   → all levels
        """
        budget_lower = budget.lower().strip()
        if budget_lower in ("budget", "low", "cheap"):
            return ["budget"]
        if budget_lower in ("mid-range", "mid", "medium", "moderate"):
            return ["budget", "mid-range"]
        if budget_lower in ("premium", "luxury", "high"):
            return ["budget", "mid-range", "premium"]
        # Unknown budget — allow all
        logger.warning(
            "Unknown budget value '%s', allowing all budget levels", budget
        )
        return ["budget", "mid-range", "premium"]

    def _normalise_budget(self, budget: str) -> str:
        """
        Normalise various budget strings to a canonical form.
        """
        budget_lower = budget.lower().strip()
        if budget_lower in ("budget", "low", "cheap"):
            return "budget"
        if budget_lower in ("mid-range", "mid", "medium", "moderate"):
            return "mid-range"
        if budget_lower in ("premium", "luxury", "high"):
            return "premium"
        return "mid-range"

    def _parse_results(
        self, results: dict
    ) -> list[RetrievedDocument]:
        """
        Parse raw ChromaDB query results into RetrievedDocument objects.
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

            documents.append(
                RetrievedDocument(
                    doc_id=doc_id,
                    name=meta.get("name", ""),
                    category=meta.get("category", ""),
                    description=meta.get("description", ""),
                    budget_level=meta.get("budget_level", ""),
                    recommended_duration_hours=float(
                        meta.get("recommended_duration_hours", 1.0)
                    ),
                    best_time=meta.get("best_time", ""),
                    tags=tags,
                    relevance_score=float(distance),
                )
            )

        return documents


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_retriever_instance: RetrieverService | None = None


def get_retriever() -> RetrieverService:
    """
    Returns a singleton RetrieverService instance.
    Initialised once on first call.
    """
    global _retriever_instance
    if _retriever_instance is None:
        _retriever_instance = RetrieverService()
    return _retriever_instance