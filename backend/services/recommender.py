"""
Recommendation Engine for SafeRoute AI.

Scores all 79 Hyderabad places against user preferences and returns
ranked results. This is a PURE algorithmic scorer — no LLM involved.

Scoring breakdown:
  - Tier (S/A/B/C):        60 / 40 / 20 / 0 points
  - Must visit bonus:      30 points
  - Interest match:        20 points per matched interest
  - Rating (1.0-5.0):      rating × 10 points
  - Budget match:          15 points
  - Popularity bonus:      iconic=15, popular=8, lesser_known=3, hidden_gem=5
  - Walking penalty:       high=-8, moderate=0, low=+3
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scoring constants — tuned for Hyderabad dataset
# ---------------------------------------------------------------------------

TIER_SCORES = {
    "S": 60,
    "A": 40,
    "B": 20,
    "C": 0,
}

POPULARITY_SCORES = {
    "iconic":       15,
    "popular":       8,
    "lesser_known":  3,
    "hidden_gem":    5,   # slight bonus for unique experiences
}

WALKING_ADJUSTMENTS = {
    "low":      +3,
    "moderate":  0,
    "high":     -8,
}

BUDGET_MATCH_SCORE = 15

MUST_VISIT_BONUS = 30

INTEREST_MATCH_SCORE = 20  # per matched interest

RATING_MULTIPLIER = 10  # rating × 10, so 4.7 → 47 points


class RecommendationEngine:
    """
    Algorithmic place recommender for Hyderabad.

    Loads all 79 places from places.json on init.
    Scores each place deterministically against user inputs.
    Returns ranked list with scores and full place data.
    """

    def __init__(self):
        data_file = (
            Path(__file__).resolve().parent.parent
            / "data"
            / "places.json"
        )

        if not data_file.exists():
            raise FileNotFoundError(
                f"places.json not found at {data_file}"
            )

        with open(data_file, "r", encoding="utf-8") as f:
            dataset = json.load(f)

        # Handle both top-level dict and bare list formats
        if isinstance(dataset, dict):
            self.places = dataset.get("places", [])
        elif isinstance(dataset, list):
            self.places = dataset
        else:
            raise ValueError("places.json has unexpected format")

        if not self.places:
            raise ValueError("No places found in places.json")

        logger.info(
            "RecommendationEngine loaded %d places from places.json",
            len(self.places),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def recommend(
        self,
        interests: list[str],
        budget: str,
        limit: int = 25,
    ) -> list[dict]:
        """
        Score and rank all places against user preferences.

        Args:
            interests:  List of interest strings e.g. ['history', 'food']
            budget:     Budget level: 'budget', 'mid-range', or 'premium'
            limit:      Maximum number of results to return

        Returns:
            List of dicts with keys: id, name, score, place
            Sorted by score descending.
        """
        normalised_interests = [i.lower().strip() for i in interests]
        normalised_budget = budget.lower().strip()

        scored = []

        for place in self.places:
            score, breakdown = self._score_place(
                place,
                normalised_interests,
                normalised_budget,
            )
            scored.append({
                "id":    place.get("id", ""),
                "name":  place.get("name", ""),
                "score": score,
                "breakdown": breakdown,
                "place": place,
            })

        scored.sort(key=lambda x: x["score"], reverse=True)

        logger.info(
            "Recommendation complete | interests=%s | budget=%s | "
            "top_place=%s (%.1f) | total=%d",
            normalised_interests,
            normalised_budget,
            scored[0]["name"] if scored else "none",
            scored[0]["score"] if scored else 0,
            len(scored),
        )

        return scored[:limit]

    def score_place(
        self,
        place: dict,
        interests: list[str],
        budget: str,
    ) -> float:
        """
        Public single-place scorer. Returns numeric score only.
        Used by external callers that need just the score.
        """
        score, _ = self._score_place(
            place,
            [i.lower().strip() for i in interests],
            budget.lower().strip(),
        )
        return score

    # ------------------------------------------------------------------
    # Private scoring engine
    # ------------------------------------------------------------------

    def _score_place(
        self,
        place: dict,
        interests: list[str],
        budget: str,
    ) -> tuple[float, dict]:
        """
        Core scoring function. Returns (total_score, breakdown_dict).

        All scoring is deterministic and explainable.
        """
        breakdown = {}

        # ── 1. Tier score ─────────────────────────────────────────────
        tier = str(place.get("recommendation_tier", "C")).upper().strip()
        tier_score = TIER_SCORES.get(tier, 0)
        breakdown["tier"] = tier_score

        # ── 2. Must visit bonus ───────────────────────────────────────
        must_visit_score = MUST_VISIT_BONUS if place.get("must_visit", False) else 0
        breakdown["must_visit"] = must_visit_score

        # ── 3. Interest match ─────────────────────────────────────────
        place_interests = [
            i.lower().strip()
            for i in place.get("interests", [])
        ]
        place_tags = [
            t.lower().strip()
            for t in place.get("tags", [])
        ]

        # Match against both interests and tags for broader coverage
        matched_interests = set(interests) & set(place_interests)
        # Tag matching (half score to avoid over-weighting)
        tag_matches = len(set(interests) & set(place_tags))

        interest_score = (
            len(matched_interests) * INTEREST_MATCH_SCORE
            + tag_matches * (INTEREST_MATCH_SCORE // 2)
        )
        breakdown["interest_match"] = interest_score
        breakdown["matched_interests"] = list(matched_interests)

        # ── 4. Rating score ───────────────────────────────────────────
        raw_rating = place.get("rating", 4.0)
        try:
            rating = float(raw_rating)
        except (TypeError, ValueError):
            rating = 4.0
        rating_score = rating * RATING_MULTIPLIER
        breakdown["rating"] = rating_score

        # ── 5. Budget compatibility ───────────────────────────────────
        place_budget = str(
            place.get("budget_level", "mid-range")
        ).lower().strip()

        budget_score = self._score_budget(budget, place_budget)
        breakdown["budget"] = budget_score

        # ── 6. Popularity bonus ───────────────────────────────────────
        popularity = str(
            place.get("popularity", "popular")
        ).lower().strip()
        popularity_score = POPULARITY_SCORES.get(popularity, 0)
        breakdown["popularity"] = popularity_score

        # ── 7. Walking intensity adjustment ───────────────────────────
        walking = str(
            place.get("walking_intensity", "moderate")
        ).lower().strip()
        walking_adjustment = WALKING_ADJUSTMENTS.get(walking, 0)
        breakdown["walking"] = walking_adjustment

        # ── Total ─────────────────────────────────────────────────────
        total = (
            tier_score
            + must_visit_score
            + interest_score
            + rating_score
            + budget_score
            + popularity_score
            + walking_adjustment
        )

        breakdown["total"] = total

        return total, breakdown

    def _score_budget(self, user_budget: str, place_budget: str) -> float:
        """
        Score budget compatibility.

        Budget tolerance rules:
          - 'budget' user: full score for 'budget' and 'free', partial for 'mid-range'
          - 'mid-range' user: full score for 'budget', 'free', 'mid-range'
          - 'premium' user: full score for everything
        """
        # Normalise variants
        user = self._normalise_budget(user_budget)
        place = self._normalise_budget(place_budget)

        if user == "budget":
            if place in ("free", "budget"):
                return BUDGET_MATCH_SCORE
            if place == "mid-range":
                return BUDGET_MATCH_SCORE * 0.5
            return 0  # premium — out of budget

        if user == "mid-range":
            if place in ("free", "budget", "mid-range"):
                return BUDGET_MATCH_SCORE
            return BUDGET_MATCH_SCORE * 0.5  # premium — slightly penalised

        if user == "premium":
            return BUDGET_MATCH_SCORE  # premium users can afford anything

        return BUDGET_MATCH_SCORE * 0.5  # unknown budget

    def _normalise_budget(self, budget: str) -> str:
        """Normalise budget strings to canonical form."""
        b = budget.lower().strip()
        if b in ("free",):
            return "free"
        if b in ("budget", "low", "cheap"):
            return "budget"
        if b in ("mid-range", "mid", "medium", "moderate"):
            return "mid-range"
        if b in ("premium", "luxury", "high"):
            return "premium"
        return "mid-range"

    def get_place_by_id(self, place_id: str) -> dict | None:
        """Retrieve a single place by its ID."""
        for place in self.places:
            if place.get("id") == place_id:
                return place
        return None

    def get_all_places(self) -> list[dict]:
        """Return all 79 places."""
        return self.places


# ---------------------------------------------------------------------------
# Backward-compatible function API
# ---------------------------------------------------------------------------

def recommend_places(
    interests: list[str],
    budget: str,
    limit: int = 25,
) -> list[dict]:
    """
    Backward-compatible function wrapper.
    Returns same format as RecommendationEngine.recommend().
    """
    return get_recommender().recommend(
        interests=interests,
        budget=budget,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_recommender: RecommendationEngine | None = None


def get_recommender() -> RecommendationEngine:
    """
    Returns singleton RecommendationEngine.
    Loaded once on first call.
    """
    global _recommender
    if _recommender is None:
        _recommender = RecommendationEngine()
    return _recommender