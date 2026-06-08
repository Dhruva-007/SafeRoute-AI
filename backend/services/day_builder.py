"""
Day Builder Service for SafeRoute AI.

Algorithmically constructs a multi-day itinerary from scored, clustered places.

The LLM does NOT choose which places appear in the itinerary.
This service makes all placement decisions. The LLM only writes
descriptions for places that this service has already selected.

Algorithm overview:
  1. Receive scored places from RecommendationEngine
  2. Cluster them geographically via GeographicClusterEngine
  3. Rank zones by priority (must-visit count, tier count, avg score)
  4. Assign zones to days with ROTATION ENFORCEMENT:
     - Each zone can be primary for at most MAX_DAYS_PER_ZONE days
     - A zone used yesterday gets a cooldown penalty
     - The system forces variety before exhausting any single zone
  5. Fill each day respecting:
     - Duration budget (8 hours/day max)
     - Category diversity (max 2 same-category per day)
     - Must-visit priority
     - Score ordering
  6. Borrow from adjacent zones if primary zone runs short
  7. Return list of BuiltDay objects ready for route optimizer
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

from services.geographic_cluster import (
    ClusteringResult,
    GeoCluster,
    GeographicClusterEngine,
    get_cluster_engine,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum total visit hours budget per day
MAX_HOURS_PER_DAY = 8.0

# Minimum hours per day before we try to borrow from adjacent zones
MIN_HOURS_PER_DAY = 3.0

# Maximum activities per day
MAX_ACTIVITIES_PER_DAY = 5

# Minimum activities per day
MIN_ACTIVITIES_PER_DAY = 3

# Maximum places of the same category allowed in a single day
MAX_SAME_CATEGORY_PER_DAY = 2

# Zone priority weights
MUST_VISIT_WEIGHT = 50
TOP_TIER_WEIGHT   = 20
AVG_SCORE_WEIGHT  = 1.0

# Cooldown penalty applied to a zone that was primary the previous day
# Large enough to force rotation but not infinite
COOLDOWN_PENALTY = 10000.0

# How many days a single zone can be the primary zone
# For a 3-day trip with 5 major zones, no zone should dominate more than 1 day
# This is calculated dynamically in _calculate_zone_day_caps()
BASE_MAX_DAYS_PER_ZONE = 1

# Minimum places remaining in a zone before it's considered "exhausted"
ZONE_EXHAUSTION_THRESHOLD = 2

# Zones that require a minimum trip length to be included
PERIPHERAL_ZONE_MIN_DAYS: dict[str, int] = {
    "DAY_TRIP":       4,
    "EAST_HYDERABAD": 3,
    "AMEERPET":       5,
    "SECUNDERABAD":   4,
}

# Default duration if place has none
DEFAULT_DURATION_HOURS = 1.5


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class BuiltActivity:
    """
    A single activity selected by the Day Builder.
    Contains all data needed by route optimizer and LLM description generator.
    """
    place_id:              str
    name:                  str
    category:              str
    subcategory:           str
    zone_id:               str
    lat:                   float
    lon:                   float
    duration_hours:        float
    budget_level:          str
    recommendation_tier:   str
    must_visit:            bool
    score:                 float
    indoor:                bool
    weather_preference:    str
    walking_intensity:     str
    neighborhood:          str
    short_description:     str
    highlights:            list[str]
    best_time:             str
    nearby_place_ids:      list[str]
    pair_well_with:        list[str]
    avg_cost_per_person:   int
    entry_fee_indian:      int
    safety_notes:          str
    accessibility_notes:   str
    # Set by route optimizer in Phase 4
    visit_order:           int = 0
    suggested_start_time:  str = ""
    suggested_end_time:    str = ""

    @property
    def is_food(self) -> bool:
        return self.category == "food"

    @property
    def is_outdoor(self) -> bool:
        return not self.indoor

    def to_dict(self) -> dict:
        return {
            "place_id":             self.place_id,
            "name":                 self.name,
            "category":             self.category,
            "subcategory":          self.subcategory,
            "zone_id":              self.zone_id,
            "lat":                  self.lat,
            "lon":                  self.lon,
            "duration_hours":       self.duration_hours,
            "budget_level":         self.budget_level,
            "recommendation_tier":  self.recommendation_tier,
            "must_visit":           self.must_visit,
            "score":                self.score,
            "indoor":               self.indoor,
            "weather_preference":   self.weather_preference,
            "walking_intensity":    self.walking_intensity,
            "neighborhood":         self.neighborhood,
            "short_description":    self.short_description,
            "highlights":           self.highlights,
            "best_time":            self.best_time,
            "nearby_place_ids":     self.nearby_place_ids,
            "pair_well_with":       self.pair_well_with,
            "avg_cost_per_person":  self.avg_cost_per_person,
            "entry_fee_indian":     self.entry_fee_indian,
            "safety_notes":         self.safety_notes,
            "accessibility_notes":  self.accessibility_notes,
            "visit_order":          self.visit_order,
            "suggested_start_time": self.suggested_start_time,
            "suggested_end_time":   self.suggested_end_time,
        }


@dataclass
class BuiltDay:
    """
    A single day of the itinerary as produced by the Day Builder.
    """
    day_number:            int
    primary_zone_id:       str
    primary_zone_name:     str
    activities:            list[BuiltActivity] = field(default_factory=list)
    borrowed_from_zones:   list[str]           = field(default_factory=list)

    @property
    def total_duration_hours(self) -> float:
        return sum(a.duration_hours for a in self.activities)

    @property
    def activity_count(self) -> int:
        return len(self.activities)

    @property
    def place_ids(self) -> list[str]:
        return [a.place_id for a in self.activities]

    @property
    def place_names(self) -> list[str]:
        return [a.name for a in self.activities]

    @property
    def has_food(self) -> bool:
        return any(a.is_food for a in self.activities)

    @property
    def estimated_cost_per_person(self) -> int:
        return sum(a.avg_cost_per_person for a in self.activities)

    def to_dict(self) -> dict:
        return {
            "day_number":                self.day_number,
            "primary_zone_id":           self.primary_zone_id,
            "primary_zone_name":         self.primary_zone_name,
            "activities":                [a.to_dict() for a in self.activities],
            "borrowed_from_zones":       self.borrowed_from_zones,
            "total_duration_hours":      self.total_duration_hours,
            "activity_count":            self.activity_count,
            "has_food":                  self.has_food,
            "estimated_cost_per_person": self.estimated_cost_per_person,
        }

    def __repr__(self) -> str:
        return (
            f"BuiltDay(day={self.day_number}, "
            f"zone={self.primary_zone_id}, "
            f"activities={self.activity_count}, "
            f"hours={self.total_duration_hours:.1f})"
        )


# ---------------------------------------------------------------------------
# Zone rotation state — tracks usage across the planning session
# ---------------------------------------------------------------------------

@dataclass
class ZoneUsageTracker:
    """
    Tracks how many times each zone has been used as a primary zone.
    Used to enforce rotation and prevent any single zone from dominating.
    """
    # zone_id → number of days it has been the primary zone
    days_as_primary:   dict[str, int]   = field(default_factory=dict)
    # Ordered list of zones used (most recent last)
    zone_history:      list[str]        = field(default_factory=list)
    # zone_id → max days allowed as primary (set during planning)
    max_days_allowed:  dict[str, int]   = field(default_factory=dict)

    def record_use(self, zone_id: str) -> None:
        self.days_as_primary[zone_id] = (
            self.days_as_primary.get(zone_id, 0) + 1
        )
        self.zone_history.append(zone_id)

    def times_used(self, zone_id: str) -> int:
        return self.days_as_primary.get(zone_id, 0)

    def is_at_cap(self, zone_id: str) -> bool:
        """True if this zone has been primary as many times as allowed."""
        cap = self.max_days_allowed.get(zone_id, BASE_MAX_DAYS_PER_ZONE)
        return self.times_used(zone_id) >= cap

    def was_used_yesterday(self, zone_id: str) -> bool:
        """True if this zone was the primary zone for the previous day."""
        if not self.zone_history:
            return False
        return self.zone_history[-1] == zone_id

    def was_used_two_days_ago(self, zone_id: str) -> bool:
        """True if zone was primary two days ago."""
        if len(self.zone_history) < 2:
            return False
        return self.zone_history[-2] == zone_id


# ---------------------------------------------------------------------------
# Day Builder
# ---------------------------------------------------------------------------

class DayBuilder:
    """
    Constructs a geographically coherent multi-day itinerary.

    No LLM involved. All decisions are algorithmic and deterministic.

    Key design: Zone Rotation
    ─────────────────────────
    For a 3-day trip with zones OLD_CITY(24), GOLCONDA(12),
    HUSSAIN_SAGAR(10), BANJARA_HILLS(9):

    Without rotation: OLD_CITY for all 3 days (it always has most places)
    With rotation:    Day1=OLD_CITY, Day2=GOLCONDA, Day3=HUSSAIN_SAGAR

    Rotation is enforced by:
    1. Calculating a per-zone day cap based on total days and zone count
    2. Applying a cooldown penalty to the previous day's zone
    3. Marking zones as "capped" when they reach their day limit
    """

    def __init__(self) -> None:
        self._cluster_engine: GeographicClusterEngine = get_cluster_engine()
        logger.info("DayBuilder initialised")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def build_days(
        self,
        scored_places: list[dict],
        days: int,
        interests: list[str] | None = None,
        budget: str = "mid-range",
    ) -> list[BuiltDay]:
        """
        Build a complete multi-day itinerary.

        Args:
            scored_places:  Output of RecommendationEngine.recommend()
                            Format: [{"id": ..., "score": ..., "place": ...}]
            days:           Number of days to plan.
            interests:      User interests (for logging/context).
            budget:         User budget level.

        Returns:
            List of BuiltDay objects, one per day.
        """
        if not scored_places:
            raise ValueError("scored_places cannot be empty")

        if days < 1 or days > 14:
            raise ValueError(
                f"days must be between 1 and 14, got {days}"
            )

        logger.info(
            "DayBuilder.build_days | days=%d | budget=%s | "
            "interests=%s | scored_places=%d",
            days, budget, interests, len(scored_places),
        )

        # Step 1: Cluster scored places geographically
        clustering: ClusteringResult = self._cluster_engine.cluster(
            scored_places=scored_places
        )

        # Step 2: Get eligible zones (respects peripheral zone min-days)
        eligible_zones = self._get_eligible_zones(clustering, days)

        # Step 3: Calculate per-zone day caps
        tracker = ZoneUsageTracker()
        tracker.max_days_allowed = self._calculate_zone_day_caps(
            eligible_zones, days
        )

        logger.info(
            "Zone day caps for %d-day trip: %s",
            days,
            tracker.max_days_allowed,
        )

        # Step 4: Score zones initially (without rotation penalties)
        base_scores = self._score_zones(eligible_zones, clustering)

        logger.info("Initial zone scores:")
        for zone_id, score in sorted(
            base_scores.items(), key=lambda x: -x[1]
        ):
            cluster = clustering.get_cluster(zone_id)
            if cluster:
                logger.info(
                    "  %-22s base_score=%.1f | places=%d | "
                    "must_visit=%d | top_tier=%d",
                    zone_id,
                    score,
                    cluster.place_count,
                    sum(
                        1 for p in cluster.places
                        if p.get("must_visit", False)
                    ),
                    cluster.top_tier_count,
                )

        # Step 5: Build each day with rotation enforcement
        used_place_ids: set[str] = set()
        built_days:     list[BuiltDay] = []

        for day_num in range(1, days + 1):
            # Select zone with rotation enforcement
            zone_id, cluster = self._select_zone_with_rotation(
                eligible_zones=eligible_zones,
                base_scores=base_scores,
                tracker=tracker,
                clustering=clustering,
                used_place_ids=used_place_ids,
                day_num=day_num,
            )

            if cluster is None:
                logger.warning(
                    "No zone found for Day %d — using remaining places",
                    day_num,
                )
                built_day = self._build_day_from_remaining(
                    day_num, clustering, used_place_ids
                )
                built_days.append(built_day)
                continue

            # Build the day
            built_day = self._build_day(
                day_num=day_num,
                primary_zone_id=zone_id,
                primary_cluster=cluster,
                clustering=clustering,
                used_place_ids=used_place_ids,
                budget=budget,
            )

            # Register places used
            for activity in built_day.activities:
                used_place_ids.add(activity.place_id)

            # Record zone usage for rotation
            tracker.record_use(zone_id)

            built_days.append(built_day)

            logger.info(
                "Day %d | Zone=%-22s | Activities=%d | Hours=%.1f | "
                "Places=%s",
                day_num,
                zone_id,
                built_day.activity_count,
                built_day.total_duration_hours,
                built_day.place_names,
            )

        logger.info(
            "DayBuilder complete | days=%d | total_activities=%d | "
            "zone_sequence=%s",
            len(built_days),
            sum(d.activity_count for d in built_days),
            [d.primary_zone_id for d in built_days],
        )

        return built_days

    # ------------------------------------------------------------------
    # Zone eligibility + caps
    # ------------------------------------------------------------------

    def _get_eligible_zones(
        self,
        clustering: ClusteringResult,
        days: int,
    ) -> dict[str, GeoCluster]:
        """
        Return zones eligible for this trip length.
        Peripheral zones are excluded for short trips.
        Zones with 0 places are excluded.
        """
        eligible: dict[str, GeoCluster] = {}

        for zone_id, cluster in clustering.clusters.items():
            if cluster.place_count == 0:
                continue
            min_days = PERIPHERAL_ZONE_MIN_DAYS.get(zone_id, 0)
            if days < min_days:
                logger.debug(
                    "Excluding peripheral zone %s (requires %d days, "
                    "got %d)",
                    zone_id, min_days, days,
                )
                continue
            eligible[zone_id] = cluster

        logger.info(
            "Eligible zones for %d-day trip: %s",
            days,
            list(eligible.keys()),
        )
        return eligible

    def _calculate_zone_day_caps(
        self,
        eligible_zones: dict[str, GeoCluster],
        days: int,
    ) -> dict[str, int]:
        """
        Calculate how many days each zone is allowed to be primary.

        Strategy:
        - Count zones with >= MIN_ACTIVITIES_PER_DAY places (substantial zones)
        - Distribute days across substantial zones evenly
        - Large zones (>= 15 places) get an extra day allowance
        - Small zones get at most 1 day

        Example — 3-day trip, 5 substantial zones:
          OLD_CITY(24):     cap = 1  (large, but we force variety)
          GOLCONDA(12):     cap = 1
          HUSSAIN_SAGAR(10):cap = 1
          BANJARA_HILLS(9): cap = 1
          HITECH_CITY(11):  cap = 1

        Example — 7-day trip, 5 substantial zones:
          OLD_CITY(24):     cap = 2  (gets extra day for large size)
          GOLCONDA(12):     cap = 2
          HUSSAIN_SAGAR(10):cap = 1
          BANJARA_HILLS(9): cap = 1
          HITECH_CITY(11):  cap = 1
        """
        caps: dict[str, int] = {}

        # Classify zones by size
        substantial_zones = {
            zid: c for zid, c in eligible_zones.items()
            if c.place_count >= MIN_ACTIVITIES_PER_DAY
        }
        small_zones = {
            zid: c for zid, c in eligible_zones.items()
            if c.place_count < MIN_ACTIVITIES_PER_DAY
        }

        n_substantial = len(substantial_zones)

        if n_substantial == 0:
            # All zones are small — give each a cap of 1
            for zone_id in eligible_zones:
                caps[zone_id] = 1
            return caps

        # Base cap: how many times can each substantial zone be used?
        # For short trips: mostly 1. For longer trips: may be 2.
        base_cap = max(1, math.ceil(days / max(n_substantial, 1)))

        # For very long trips (7+ days), large zones can repeat
        for zone_id, cluster in substantial_zones.items():
            if cluster.place_count >= 15:
                # Large zone: can be primary for up to 2 days
                # on longer trips, 1 day on short trips
                if days <= 3:
                    caps[zone_id] = 1
                elif days <= 6:
                    caps[zone_id] = 2
                else:
                    caps[zone_id] = min(3, base_cap)
            elif cluster.place_count >= 8:
                # Medium zone: base cap
                caps[zone_id] = min(2, base_cap)
            else:
                # Small-medium zone: at most 1 day
                caps[zone_id] = 1

        for zone_id in small_zones:
            caps[zone_id] = 1

        return caps

    # ------------------------------------------------------------------
    # Zone scoring
    # ------------------------------------------------------------------

    def _score_zones(
        self,
        eligible_zones: dict[str, GeoCluster],
        clustering: ClusteringResult,
    ) -> dict[str, float]:
        """
        Compute base priority score for each eligible zone.
        This is the score WITHOUT rotation penalties.

        Priority = (must_visit_count × 50) + (top_tier_count × 20)
                   + (avg_score × 1.0)
        """
        scores: dict[str, float] = {}

        for zone_id, cluster in eligible_zones.items():
            must_visit_count = sum(
                1 for p in cluster.places if p.get("must_visit", False)
            )
            priority = (
                must_visit_count * MUST_VISIT_WEIGHT
                + cluster.top_tier_count * TOP_TIER_WEIGHT
                + cluster.avg_score * AVG_SCORE_WEIGHT
            )
            scores[zone_id] = priority

        return scores

    # ------------------------------------------------------------------
    # Zone selection with rotation
    # ------------------------------------------------------------------

    def _select_zone_with_rotation(
        self,
        eligible_zones: dict[str, GeoCluster],
        base_scores: dict[str, float],
        tracker: ZoneUsageTracker,
        clustering: ClusteringResult,
        used_place_ids: set[str],
        day_num: int,
    ) -> tuple[str | None, GeoCluster | None]:
        """
        Select the best zone for the given day with rotation enforcement.

        Rotation rules applied:
        1. Zones at their day cap are EXCLUDED entirely
        2. The zone used yesterday gets a COOLDOWN_PENALTY subtracted
        3. The zone used two days ago gets a partial penalty
        4. Among remaining zones, pick highest adjusted score
           that still has enough unused places

        This guarantees a different zone is chosen on most days.
        """
        # Build adjusted scores
        adjusted: list[tuple[str, float, GeoCluster]] = []

        for zone_id, cluster in eligible_zones.items():
            # Count unused places in this zone
            unused_count = sum(
                1 for p in cluster.places
                if p.get("id", "") not in used_place_ids
            )

            # Skip zones with too few unused places
            # (unless it's late in the trip and we're scraping)
            if unused_count < MIN_ACTIVITIES_PER_DAY:
                logger.debug(
                    "Zone %s skipped: only %d unused places",
                    zone_id, unused_count,
                )
                continue

            # Skip zones at their day cap
            if tracker.is_at_cap(zone_id):
                logger.debug(
                    "Zone %s at cap (%d/%d), skipping",
                    zone_id,
                    tracker.times_used(zone_id),
                    tracker.max_days_allowed.get(zone_id, 1),
                )
                continue

            # Start with base score
            score = base_scores.get(zone_id, 0.0)

            # Apply cooldown penalties for recently used zones
            if tracker.was_used_yesterday(zone_id):
                score -= COOLDOWN_PENALTY
                logger.debug(
                    "Zone %s cooldown penalty (used yesterday): "
                    "%.1f → %.1f",
                    zone_id, score + COOLDOWN_PENALTY, score,
                )
            elif tracker.was_used_two_days_ago(zone_id):
                score -= COOLDOWN_PENALTY * 0.5
                logger.debug(
                    "Zone %s partial cooldown (used 2 days ago): "
                    "%.1f → %.1f",
                    zone_id, score + COOLDOWN_PENALTY * 0.5, score,
                )

            # Bonus for zones not yet visited
            if tracker.times_used(zone_id) == 0:
                score += 100.0  # Fresh zone bonus

            adjusted.append((zone_id, score, cluster))

        if not adjusted:
            # All zones at cap or exhausted — relax constraints
            logger.warning(
                "Day %d: All zones at cap or exhausted. "
                "Relaxing rotation constraints.",
                day_num,
            )
            return self._select_zone_relaxed(
                eligible_zones, clustering, used_place_ids
            )

        # Sort by adjusted score
        adjusted.sort(key=lambda x: x[1], reverse=True)

        logger.debug(
            "Day %d zone candidates: %s",
            day_num,
            [(z, f"{s:.1f}") for z, s, _ in adjusted[:5]],
        )

        # Return best candidate
        best_zone_id, best_score, best_cluster = adjusted[0]
        logger.info(
            "Day %d: Selected zone=%s (adjusted_score=%.1f, "
            "times_used=%d, cap=%d)",
            day_num,
            best_zone_id,
            best_score,
            tracker.times_used(best_zone_id),
            tracker.max_days_allowed.get(best_zone_id, 1),
        )
        return best_zone_id, best_cluster

    def _select_zone_relaxed(
        self,
        eligible_zones: dict[str, GeoCluster],
        clustering: ClusteringResult,
        used_place_ids: set[str],
    ) -> tuple[str | None, GeoCluster | None]:
        """
        Relaxed zone selection when all zones are at cap.
        Picks the zone with the most unused places.
        """
        best_zone_id = None
        best_cluster = None
        max_unused   = 0

        for zone_id, cluster in eligible_zones.items():
            unused = sum(
                1 for p in cluster.places
                if p.get("id", "") not in used_place_ids
            )
            if unused > max_unused:
                max_unused   = unused
                best_zone_id = zone_id
                best_cluster = cluster

        return best_zone_id, best_cluster

    # ------------------------------------------------------------------
    # Day construction
    # ------------------------------------------------------------------

    def _build_day(
        self,
        day_num: int,
        primary_zone_id: str,
        primary_cluster: GeoCluster,
        clustering: ClusteringResult,
        used_place_ids: set[str],
        budget: str,
    ) -> BuiltDay:
        """
        Build a single day from a primary zone.

        Selection order within zone:
          1. Must-visit S-tier places
          2. Must-visit A-tier places
          3. Must-visit lower-tier places
          4. Non-must-visit high-scoring places

        After filling from primary zone, borrows from adjacent zones
        if the day is short (< MIN_HOURS_PER_DAY or < MIN_ACTIVITIES).
        """
        built_day = BuiltDay(
            day_number=day_num,
            primary_zone_id=primary_zone_id,
            primary_zone_name=primary_cluster.display_name,
        )

        # Get unused places from primary zone, sorted with must-visits first
        available = [
            p for p in primary_cluster.places
            if p.get("id", "") not in used_place_ids
        ]
        available = self._sort_candidates(available)

        # Fill from primary zone
        self._fill_activities(
            built_day=built_day,
            candidates=available,
            used_place_ids=used_place_ids,
            source_zone_id=primary_zone_id,
        )

        # Borrow from adjacent zones if day is too short
        if (built_day.activity_count < MIN_ACTIVITIES_PER_DAY
                or built_day.total_duration_hours < MIN_HOURS_PER_DAY):

            adjacent_clusters = clustering.get_adjacent_clusters(
                primary_zone_id
            )

            logger.info(
                "Day %d: %d activities (%.1fh) from primary zone %s. "
                "Borrowing from %d adjacent zones.",
                day_num,
                built_day.activity_count,
                built_day.total_duration_hours,
                primary_zone_id,
                len(adjacent_clusters),
            )

            for adj_cluster in adjacent_clusters:
                if built_day.activity_count >= MIN_ACTIVITIES_PER_DAY:
                    break

                adj_available = [
                    p for p in adj_cluster.places
                    if p.get("id", "") not in used_place_ids
                ]
                adj_available = self._sort_candidates(adj_available)

                before = built_day.activity_count
                self._fill_activities(
                    built_day=built_day,
                    candidates=adj_available,
                    used_place_ids=used_place_ids,
                    source_zone_id=adj_cluster.zone_id,
                )
                after = built_day.activity_count

                if after > before:
                    built_day.borrowed_from_zones.append(
                        adj_cluster.zone_id
                    )
                    logger.info(
                        "Day %d: Borrowed %d places from %s",
                        day_num,
                        after - before,
                        adj_cluster.zone_id,
                    )

        # Ensure food is included
        if not built_day.has_food:
            self._try_add_food(
                built_day=built_day,
                primary_cluster=primary_cluster,
                clustering=clustering,
                used_place_ids=used_place_ids,
            )

        return built_day

    def _sort_candidates(self, candidates: list[dict]) -> list[dict]:
        """
        Sort candidates for activity selection:
          1. Must-visit S-tier first
          2. Must-visit A-tier
          3. Must-visit B/C-tier
          4. Non-must-visit by score

        This ensures highest-quality must-visit places fill slots first.
        """
        tier_order = {"S": 0, "A": 1, "B": 2, "C": 3}

        def sort_key(p: dict) -> tuple:
            is_must  = 0 if p.get("must_visit", False) else 1
            tier_val = tier_order.get(
                str(p.get("recommendation_tier", "C")).upper(), 3
            )
            score    = -(p.get("_score", 0.0))  # negative for desc sort
            return (is_must, tier_val, score)

        return sorted(candidates, key=sort_key)

    def _fill_activities(
        self,
        built_day: BuiltDay,
        candidates: list[dict],
        used_place_ids: set[str],
        source_zone_id: str,
    ) -> None:
        """
        Fill activities into a day from a sorted candidate list.

        Respects:
          - MAX_ACTIVITIES_PER_DAY
          - MAX_HOURS_PER_DAY duration budget
          - MAX_SAME_CATEGORY_PER_DAY category diversity cap
        """
        # Category counter for diversity enforcement
        category_counts: dict[str, int] = {}
        for existing in built_day.activities:
            cat = existing.category
            category_counts[cat] = category_counts.get(cat, 0) + 1

        for place in candidates:
            if built_day.activity_count >= MAX_ACTIVITIES_PER_DAY:
                break

            hours_used = built_day.total_duration_hours
            if hours_used >= MAX_HOURS_PER_DAY:
                break

            place_id = place.get("id", "")
            if not place_id or place_id in used_place_ids:
                continue

            # Duration check
            duration = self._get_duration(place)
            if hours_used + duration > MAX_HOURS_PER_DAY + 1.0:
                # Allow 1h overflow only for must-visit places
                if not place.get("must_visit", False):
                    continue

            # Category diversity check
            category     = str(place.get("category", "other")).lower()
            current_cat  = category_counts.get(category, 0)
            if current_cat >= MAX_SAME_CATEGORY_PER_DAY:
                continue

            # Build and add activity
            activity = self._place_to_activity(place, source_zone_id)
            built_day.activities.append(activity)
            used_place_ids.add(place_id)
            category_counts[category] = current_cat + 1

    def _try_add_food(
        self,
        built_day: BuiltDay,
        primary_cluster: GeoCluster,
        clustering: ClusteringResult,
        used_place_ids: set[str],
    ) -> None:
        """
        Try to add a food place to a day that has none.
        Searches primary zone first, then adjacent zones.
        """
        if built_day.activity_count >= MAX_ACTIVITIES_PER_DAY:
            return
        if built_day.total_duration_hours >= MAX_HOURS_PER_DAY:
            return

        food_candidates: list[dict] = []

        # Primary zone first
        food_candidates.extend([
            p for p in primary_cluster.places
            if p.get("category", "") == "food"
            and p.get("id", "") not in used_place_ids
        ])

        # Adjacent zones if needed
        if not food_candidates:
            for adj in clustering.get_adjacent_clusters(
                built_day.primary_zone_id
            ):
                food_candidates.extend([
                    p for p in adj.places
                    if p.get("category", "") == "food"
                    and p.get("id", "") not in used_place_ids
                ])

        if food_candidates:
            food_candidates.sort(
                key=lambda p: p.get("_score", 0.0), reverse=True
            )
            best      = food_candidates[0]
            food_zone = best.get("_zone_id", built_day.primary_zone_id)
            activity  = self._place_to_activity(best, food_zone)
            built_day.activities.append(activity)
            used_place_ids.add(best.get("id", ""))

            logger.info(
                "Day %d: Added food '%s' from zone %s",
                built_day.day_number,
                best.get("name", "?"),
                food_zone,
            )

    def _build_day_from_remaining(
        self,
        day_num: int,
        clustering: ClusteringResult,
        used_place_ids: set[str],
    ) -> BuiltDay:
        """
        Fallback: build a day from all remaining unused places,
        regardless of zone. Used when all zones are exhausted.
        """
        logger.warning(
            "Day %d: Building from remaining unused places",
            day_num,
        )

        all_unused: list[dict] = []
        for cluster in clustering.clusters.values():
            for place in cluster.places:
                if place.get("id", "") not in used_place_ids:
                    all_unused.append(place)

        all_unused = self._sort_candidates(all_unused)

        if not all_unused:
            return BuiltDay(
                day_number=day_num,
                primary_zone_id="MIXED",
                primary_zone_name="Mixed",
            )

        top_place   = all_unused[0]
        top_zone_id = top_place.get("_zone_id", "MIXED")

        built_day = BuiltDay(
            day_number=day_num,
            primary_zone_id=top_zone_id,
            primary_zone_name=f"Mixed",
        )

        self._fill_activities(
            built_day=built_day,
            candidates=all_unused,
            used_place_ids=used_place_ids,
            source_zone_id="MIXED",
        )

        return built_day

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_duration(self, place: dict) -> float:
        """Get duration in hours, with a safe default."""
        raw = place.get("recommended_duration_hours")
        if raw is None:
            return DEFAULT_DURATION_HOURS
        try:
            return max(0.5, float(raw))
        except (TypeError, ValueError):
            return DEFAULT_DURATION_HOURS

    def _place_to_activity(
        self,
        place: dict,
        source_zone_id: str,
    ) -> BuiltActivity:
        """Convert a raw place dict (from cluster) to BuiltActivity."""
        coords = place.get("coordinates", {}) or {}
        if isinstance(coords, dict):
            lat = float(coords.get("lat", 0.0) or 0.0)
            lon = float(coords.get("lon", 0.0) or 0.0)
        else:
            lat = 0.0
            lon = 0.0

        entry_fee = place.get("entry_fee", {}) or {}

        return BuiltActivity(
            place_id=str(place.get("id", "")),
            name=str(place.get("name", "")),
            category=str(
                place.get("category", "attractions")
            ).lower(),
            subcategory=str(place.get("subcategory", "")),
            zone_id=source_zone_id,
            lat=lat,
            lon=lon,
            duration_hours=self._get_duration(place),
            budget_level=str(
                place.get("budget_level", "mid-range")
            ),
            recommendation_tier=str(
                place.get("recommendation_tier", "C")
            ).upper(),
            must_visit=bool(place.get("must_visit", False)),
            score=float(place.get("_score", 0.0)),
            indoor=bool(place.get("indoor", False)),
            weather_preference=str(
                place.get("weather_preference", "any")
            ),
            walking_intensity=str(
                place.get("walking_intensity", "moderate")
            ),
            neighborhood=str(place.get("neighborhood", "")),
            short_description=str(
                place.get("short_description", "")
            ),
            highlights=list(place.get("highlights", []) or []),
            best_time=str(place.get("best_time", "") or ""),
            nearby_place_ids=list(
                place.get("nearby_place_ids", []) or []
            ),
            pair_well_with=list(
                place.get("pair_well_with", []) or []
            ),
            avg_cost_per_person=int(
                place.get("avg_cost_per_person", 0) or 0
            ),
            entry_fee_indian=int(
                entry_fee.get("indian_adult", 0) or 0
            ),
            safety_notes=str(
                place.get("safety_notes", "") or ""
            ),
            accessibility_notes=str(
                place.get("accessibility_notes", "") or ""
            ),
        )


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_day_builder: DayBuilder | None = None


def get_day_builder() -> DayBuilder:
    """Returns singleton DayBuilder. Initialised on first call."""
    global _day_builder
    if _day_builder is None:
        _day_builder = DayBuilder()
    return _day_builder