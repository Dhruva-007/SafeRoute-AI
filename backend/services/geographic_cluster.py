"""
Geographic Clustering Engine for SafeRoute AI.

Groups all 79 Hyderabad places into logical geographic zones
based on coordinates, neighborhood names, nearby_place_ids,
and pair_well_with relationships.

This engine is used by the Day Builder (Phase 3) to ensure
every day's places are geographically coherent — minimising
unnecessary travel between distant parts of the city.

Zone definitions are based on actual Hyderabad geography:
  - Old City:       Charminar, Laad Bazaar, Mecca Masjid, Nimrah Cafe
  - Golconda:       Golconda Fort, Qutb Shahi Tombs, Taramati Baradari
  - Hitech City:    Shilparamam, Durgam Cheruvu, IKEA, Inorbit Mall
  - Banjara Hills:  KBR Park, Necklace Road, Birla Mandir
  - Secunderabad:   Railway Museum, Public Gardens, Hussain Sagar
  - Jubilee Hills:  Film City Road, restaurants
  - Outer/Day Trip: Ananthagiri Hills, Ramoji Film City, Wonderla
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Zone Definitions
# ---------------------------------------------------------------------------
# Maps neighborhood strings (from places.json) to canonical zone IDs.
# A zone is a logical travel area — places within a zone can be
# comfortably visited in a single day without excessive travel.

NEIGHBORHOOD_TO_ZONE: dict[str, str] = {
    # OLD CITY zone
    "Charminar":                    "OLD_CITY",
    "Old City":                     "OLD_CITY",
    "Charminar Area":               "OLD_CITY",
    "Laad Bazaar":                  "OLD_CITY",
    "Pathergatti":                  "OLD_CITY",
    "Moghalpura":                   "OLD_CITY",
    "Shalibanda":                   "OLD_CITY",
    "Nampally":                     "OLD_CITY",
    "Afzalgunj":                    "OLD_CITY",
    "Dar-ul-Shifa":                 "OLD_CITY",
    "Shah Ali Banda":               "OLD_CITY",
    "Abids":                        "OLD_CITY",
    "Falaknuma":                    "OLD_CITY",

    # GOLCONDA zone
    "Ibrahim Bagh":                 "GOLCONDA",
    "Golconda":                     "GOLCONDA",
    "Golconda Fort Area":           "GOLCONDA",
    "Karwan":                       "GOLCONDA",
    "Tolichowki":                   "GOLCONDA",
    "Langar Houz":                  "GOLCONDA",
    "Karmanghat":                   "GOLCONDA",
    "Rajendranagar":                "GOLCONDA",
    "Chilkur":                      "GOLCONDA",
    "Bandlaguda":                   "GOLCONDA",

    # HITECH CITY zone
    "Madhapur":                     "HITECH_CITY",
    "Hitech City":                  "HITECH_CITY",
    "HITEC City":                   "HITECH_CITY",
    "Cyberabad":                    "HITECH_CITY",
    "Gachibowli":                   "HITECH_CITY",
    "Kondapur":                     "HITECH_CITY",
    "Shilparamam":                  "HITECH_CITY",
    "Raidurgam":                    "HITECH_CITY",
    "Nanakramguda":                 "HITECH_CITY",
    "Financial District":           "HITECH_CITY",
    "Manikonda":                    "HITECH_CITY",

    # BANJARA HILLS / JUBILEE HILLS zone
    "Banjara Hills":                "BANJARA_HILLS",
    "Jubilee Hills":                "BANJARA_HILLS",
    "Road No. 2":                   "BANJARA_HILLS",
    "Road No. 36":                  "BANJARA_HILLS",
    "Somajiguda":                   "BANJARA_HILLS",
    "Panjagutta":                   "BANJARA_HILLS",
    "Khairatabad":                  "BANJARA_HILLS",
    "Raj Bhavan Area":              "BANJARA_HILLS",
    "Lakdikapul":                   "BANJARA_HILLS",
    "Masab Tank":                   "BANJARA_HILLS",

    # HUSSAIN SAGAR / NECKLACE ROAD zone
    "Hussain Sagar":                "HUSSAIN_SAGAR",
    "Necklace Road":                "HUSSAIN_SAGAR",
    "Tank Bund":                    "HUSSAIN_SAGAR",
    "Lower Tank Bund":              "HUSSAIN_SAGAR",
    "Sanjeevaiah Park":             "HUSSAIN_SAGAR",
    "Buddha Statue":                "HUSSAIN_SAGAR",
    "Lumbini Park":                 "HUSSAIN_SAGAR",
    "NTR Gardens":                  "HUSSAIN_SAGAR",

    # SECUNDERABAD zone
    "Secunderabad":                 "SECUNDERABAD",
    "Trimulgherry":                 "SECUNDERABAD",
    "Marredpally":                  "SECUNDERABAD",
    "Begumpet":                     "SECUNDERABAD",
    "Bolaram":                      "SECUNDERABAD",
    "Parade Grounds":               "SECUNDERABAD",

    # AMEERPET / SR NAGAR zone
    "Ameerpet":                     "AMEERPET",
    "SR Nagar":                     "AMEERPET",
    "Erragadda":                    "AMEERPET",
    "Sanathnagar":                  "AMEERPET",

    # UPPAL / LB NAGAR zone (East Hyderabad)
    "Uppal":                        "EAST_HYDERABAD",
    "LB Nagar":                     "EAST_HYDERABAD",
    "Hayathnagar":                  "EAST_HYDERABAD",
    "Ramoji Film City":             "EAST_HYDERABAD",
    "Abdullapurmet":                "EAST_HYDERABAD",

    # OUTER / DAY TRIPS zone
    "Vikarabad":                    "DAY_TRIP",
    "Ananthagiri":                  "DAY_TRIP",
    "Chevella":                     "DAY_TRIP",
    "Kotpally":                     "DAY_TRIP",
    "Shamshabad":                   "DAY_TRIP",
    "Ibrahimpatnam":                "DAY_TRIP",
    "Budvel":                       "DAY_TRIP",
    "Shankarpally":                 "DAY_TRIP",
    "Maheshwaram":                  "DAY_TRIP",
}

# Human-readable zone names for display
ZONE_DISPLAY_NAMES: dict[str, str] = {
    "OLD_CITY":       "Old City & Heritage",
    "GOLCONDA":       "Golconda & Surrounds",
    "HITECH_CITY":    "Hitech City & Gachibowli",
    "BANJARA_HILLS":  "Banjara Hills & Jubilee Hills",
    "HUSSAIN_SAGAR":  "Hussain Sagar & Necklace Road",
    "SECUNDERABAD":   "Secunderabad",
    "AMEERPET":       "Ameerpet & SR Nagar",
    "EAST_HYDERABAD": "East Hyderabad & Ramoji",
    "DAY_TRIP":       "Day Trips from Hyderabad",
    "CENTRAL":        "Central Hyderabad",
}

# Zones that are geographically adjacent — used to suggest
# cross-zone pairings for longer days or multi-zone days
ADJACENT_ZONES: dict[str, list[str]] = {
    "OLD_CITY":       ["GOLCONDA", "HUSSAIN_SAGAR", "BANJARA_HILLS"],
    "GOLCONDA":       ["OLD_CITY", "BANJARA_HILLS"],
    "HITECH_CITY":    ["BANJARA_HILLS", "HUSSAIN_SAGAR"],
    "BANJARA_HILLS":  ["HITECH_CITY", "HUSSAIN_SAGAR", "OLD_CITY", "GOLCONDA"],
    "HUSSAIN_SAGAR":  ["OLD_CITY", "BANJARA_HILLS", "SECUNDERABAD", "HITECH_CITY"],
    "SECUNDERABAD":   ["HUSSAIN_SAGAR", "BANJARA_HILLS", "AMEERPET"],
    "AMEERPET":       ["SECUNDERABAD", "BANJARA_HILLS", "HUSSAIN_SAGAR"],
    "EAST_HYDERABAD": ["DAY_TRIP"],
    "DAY_TRIP":       ["EAST_HYDERABAD"],
    "CENTRAL":        ["OLD_CITY", "HUSSAIN_SAGAR", "BANJARA_HILLS"],
}

# Approximate zone centre coordinates (lat, lon)
# Used for fallback coordinate-based zone assignment
ZONE_CENTRES: dict[str, tuple[float, float]] = {
    "OLD_CITY":       (17.3604, 78.4736),
    "GOLCONDA":       (17.3833, 78.4011),
    "HITECH_CITY":    (17.4435, 78.3772),
    "BANJARA_HILLS":  (17.4156, 78.4347),
    "HUSSAIN_SAGAR":  (17.4239, 78.4738),
    "SECUNDERABAD":   (17.4399, 78.4983),
    "AMEERPET":       (17.4374, 78.4482),
    "EAST_HYDERABAD": (17.3562, 78.6214),
    "DAY_TRIP":       (17.2500, 78.0000),
    "CENTRAL":        (17.3850, 78.4867),
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class GeoCluster:
    """
    A geographic cluster representing one logical travel zone.

    Contains all places in the zone, sorted by recommendation score.
    Used by DayBuilder to construct geographically coherent days.
    """
    zone_id:        str
    display_name:   str
    places:         list[dict] = field(default_factory=list)
    centre_lat:     float = 0.0
    centre_lon:     float = 0.0
    adjacent_zones: list[str] = field(default_factory=list)

    @property
    def place_count(self) -> int:
        return len(self.places)

    @property
    def place_names(self) -> list[str]:
        return [p.get("name", "") for p in self.places]

    @property
    def has_must_visit(self) -> bool:
        return any(p.get("must_visit", False) for p in self.places)

    @property
    def top_tier_count(self) -> int:
        """Number of S and A tier places in this cluster."""
        return sum(
            1 for p in self.places
            if str(p.get("recommendation_tier", "C")).upper() in ("S", "A")
        )

    @property
    def avg_score(self) -> float:
        """Average recommendation score (set after scoring pass)."""
        scores = [p.get("_score", 0.0) for p in self.places]
        return sum(scores) / len(scores) if scores else 0.0

    def get_indoor_places(self) -> list[dict]:
        """Return places suitable for rainy or very hot weather."""
        return [p for p in self.places if p.get("indoor", False)]

    def get_outdoor_places(self) -> list[dict]:
        """Return places best visited in good weather."""
        return [p for p in self.places if not p.get("indoor", False)]

    def get_places_by_tier(self, tier: str) -> list[dict]:
        """Return places matching the given tier (S/A/B/C)."""
        return [
            p for p in self.places
            if str(p.get("recommendation_tier", "C")).upper() == tier.upper()
        ]

    def get_top_places(self, n: int) -> list[dict]:
        """Return top N places sorted by _score descending."""
        sorted_places = sorted(
            self.places,
            key=lambda p: p.get("_score", 0.0),
            reverse=True,
        )
        return sorted_places[:n]

    def __repr__(self) -> str:
        return (
            f"GeoCluster(zone={self.zone_id!r}, "
            f"places={self.place_count}, "
            f"top_tier={self.top_tier_count})"
        )


@dataclass
class ClusteringResult:
    """
    Complete output of the clustering engine.

    Contains all clusters and lookup utilities used by DayBuilder.
    """
    clusters:           dict[str, GeoCluster]
    place_to_zone:      dict[str, str]          # place_id → zone_id
    place_to_cluster:   dict[str, GeoCluster]   # place_id → GeoCluster

    @property
    def zone_ids(self) -> list[str]:
        return list(self.clusters.keys())

    @property
    def total_places(self) -> int:
        return sum(c.place_count for c in self.clusters.values())

    def get_cluster(self, zone_id: str) -> GeoCluster | None:
        return self.clusters.get(zone_id)

    def get_zone_for_place(self, place_id: str) -> str | None:
        return self.place_to_zone.get(place_id)

    def get_cluster_for_place(self, place_id: str) -> GeoCluster | None:
        return self.place_to_cluster.get(place_id)

    def get_zones_sorted_by_score(self) -> list[GeoCluster]:
        """
        Return clusters sorted by average recommendation score.
        Used by DayBuilder to prioritise the best zones first.
        """
        return sorted(
            self.clusters.values(),
            key=lambda c: c.avg_score,
            reverse=True,
        )

    def get_zones_with_must_visit(self) -> list[GeoCluster]:
        """Return only clusters that contain must-visit places."""
        return [c for c in self.clusters.values() if c.has_must_visit]

    def get_adjacent_clusters(self, zone_id: str) -> list[GeoCluster]:
        """Return GeoCluster objects adjacent to the given zone."""
        adjacent_ids = ADJACENT_ZONES.get(zone_id, [])
        return [
            self.clusters[zid]
            for zid in adjacent_ids
            if zid in self.clusters
        ]


# ---------------------------------------------------------------------------
# Main clustering engine
# ---------------------------------------------------------------------------

class GeographicClusterEngine:
    """
    Groups all Hyderabad places into geographic zones.

    Algorithm:
      1. Load all places from places.json
      2. Assign each place to a zone using neighborhood → zone mapping
      3. For unmatched neighborhoods, use coordinate proximity to
         find the nearest zone centre
      4. Apply nearby_place_ids consistency check — if a place's
         nearby places are mostly in a different zone, re-evaluate
      5. Apply recommendation scores to places within each cluster
      6. Sort places within each cluster by score

    This engine is stateless after __init__. Call cluster() with
    scored places from the RecommendationEngine.
    """

    def __init__(self) -> None:
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

        if isinstance(dataset, dict):
            self._places = dataset.get("places", [])
        elif isinstance(dataset, list):
            self._places = dataset
        else:
            raise ValueError("places.json has unexpected format")

        # Build fast lookup by place ID
        self._place_by_id: dict[str, dict] = {
            p["id"]: p for p in self._places if "id" in p
        }

        logger.info(
            "GeographicClusterEngine loaded %d places",
            len(self._places),
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def cluster(
        self,
        scored_places: list[dict] | None = None,
    ) -> ClusteringResult:
        """
        Build geographic clusters from all 79 places.

        Args:
            scored_places: Optional list of scored place dicts from
                           RecommendationEngine.recommend(). If provided,
                           recommendation scores are attached to places
                           within clusters so DayBuilder can sort by score.
                           Format: [{"id": ..., "score": ..., "place": ...}]

        Returns:
            ClusteringResult with all clusters and lookup maps.
        """
        # Build score lookup if provided
        score_lookup: dict[str, float] = {}
        if scored_places:
            for item in scored_places:
                pid   = item.get("id", "")
                score = item.get("score", 0.0)
                if pid:
                    score_lookup[pid] = score

        # Step 1: Assign each place to a zone
        place_zone_map: dict[str, str] = {}
        for place in self._places:
            pid  = place.get("id", "")
            zone = self._assign_zone(place)
            place_zone_map[pid] = zone

        # Step 2: Apply nearby_place_ids consistency check
        place_zone_map = self._apply_nearby_consistency(place_zone_map)

        # Step 3: Build GeoCluster objects
        clusters: dict[str, GeoCluster] = {}

        for place in self._places:
            pid      = place.get("id", "")
            zone_id  = place_zone_map.get(pid, "CENTRAL")

            if zone_id not in clusters:
                clusters[zone_id] = GeoCluster(
                    zone_id=zone_id,
                    display_name=ZONE_DISPLAY_NAMES.get(
                        zone_id, zone_id.replace("_", " ").title()
                    ),
                    adjacent_zones=ADJACENT_ZONES.get(zone_id, []),
                    centre_lat=ZONE_CENTRES.get(zone_id, (0.0, 0.0))[0],
                    centre_lon=ZONE_CENTRES.get(zone_id, (0.0, 0.0))[1],
                )

            # Attach score to place dict (non-destructive copy)
            place_copy = dict(place)
            place_copy["_score"]  = score_lookup.get(pid, 0.0)
            place_copy["_zone_id"] = zone_id

            clusters[zone_id].places.append(place_copy)

        # Step 4: Sort places within each cluster by score descending
        for cluster in clusters.values():
            cluster.places.sort(
                key=lambda p: p.get("_score", 0.0),
                reverse=True,
            )
            # Recalculate cluster centre from actual place coordinates
            self._update_cluster_centre(cluster)

        # Step 5: Build reverse lookup maps
        place_to_zone:    dict[str, str]        = {}
        place_to_cluster: dict[str, GeoCluster] = {}

        for zone_id, cluster in clusters.items():
            for place in cluster.places:
                pid = place.get("id", "")
                if pid:
                    place_to_zone[pid]    = zone_id
                    place_to_cluster[pid] = cluster

        result = ClusteringResult(
            clusters=clusters,
            place_to_zone=place_to_zone,
            place_to_cluster=place_to_cluster,
        )

        self._log_clustering_result(result)

        return result

    def get_pairs_for_place(self, place_id: str) -> list[dict]:
        """
        Return all places that pair well with the given place,
        including both pair_well_with and nearby_place_ids.

        Returns list of full place dicts.
        """
        place = self._place_by_id.get(place_id)
        if not place:
            return []

        pair_ids = set(
            place.get("pair_well_with", [])
            + place.get("nearby_place_ids", [])
        )

        return [
            self._place_by_id[pid]
            for pid in pair_ids
            if pid in self._place_by_id
        ]

    def get_all_places_in_zone(self, zone_id: str) -> list[dict]:
        """Return all raw place dicts in a given zone."""
        return [
            p for p in self._places
            if self._assign_zone(p) == zone_id
        ]

    # ------------------------------------------------------------------
    # Zone assignment
    # ------------------------------------------------------------------

    def _assign_zone(self, place: dict) -> str:
        """
        Assign a zone to a place using the following priority:

        1. Direct neighborhood → zone mapping
        2. Partial neighborhood string match
        3. Coordinate-based nearest zone centre
        4. Fallback: CENTRAL
        """
        neighborhood = str(place.get("neighborhood", "")).strip()

        # 1. Exact match
        if neighborhood in NEIGHBORHOOD_TO_ZONE:
            return NEIGHBORHOOD_TO_ZONE[neighborhood]

        # 2. Partial match — check if any key is a substring
        neighborhood_lower = neighborhood.lower()
        for key, zone in NEIGHBORHOOD_TO_ZONE.items():
            if key.lower() in neighborhood_lower:
                return zone
            if neighborhood_lower in key.lower():
                return zone

        # 3. Coordinate-based nearest zone
        coords = place.get("coordinates", {})
        if isinstance(coords, dict):
            lat = coords.get("lat")
            lon = coords.get("lon")
            if lat is not None and lon is not None:
                zone = self._nearest_zone_by_coords(
                    float(lat), float(lon)
                )
                logger.debug(
                    "Place '%s' neighborhood='%s' not in map — "
                    "assigned to %s by coordinates",
                    place.get("name", "?"),
                    neighborhood,
                    zone,
                )
                return zone

        logger.warning(
            "Could not assign zone for place '%s' (neighborhood=%r) — "
            "defaulting to CENTRAL",
            place.get("name", "?"),
            neighborhood,
        )
        return "CENTRAL"

    def _nearest_zone_by_coords(self, lat: float, lon: float) -> str:
        """
        Find the nearest zone centre using Haversine distance.
        Returns the zone_id of the closest zone centre.
        """
        min_dist  = float("inf")
        best_zone = "CENTRAL"

        for zone_id, (clat, clon) in ZONE_CENTRES.items():
            dist = _haversine_km(lat, lon, clat, clon)
            if dist < min_dist:
                min_dist  = dist
                best_zone = zone_id

        return best_zone

    def _apply_nearby_consistency(
        self,
        place_zone_map: dict[str, str],
    ) -> dict[str, str]:
        """
        Consistency check: if a place's nearby_place_ids are mostly
        in a different zone than the place itself, and the place's
        zone assignment came from coordinate fallback (not exact
        neighborhood match), move it to the majority zone.

        This handles edge cases like a restaurant on a zone boundary.
        """
        updated = dict(place_zone_map)

        for place in self._places:
            pid   = place.get("id", "")
            if not pid:
                continue

            neighborhood = str(place.get("neighborhood", "")).strip()
            # Only adjust places that didn't have an exact neighborhood match
            if neighborhood in NEIGHBORHOOD_TO_ZONE:
                continue  # Exact match — trust it

            nearby_ids = place.get("nearby_place_ids", [])
            if not nearby_ids:
                continue

            # Count zone votes from nearby places
            zone_votes: dict[str, int] = {}
            for nid in nearby_ids:
                if nid in updated:
                    nzone = updated[nid]
                    zone_votes[nzone] = zone_votes.get(nzone, 0) + 1

            if not zone_votes:
                continue

            # Find the majority zone among nearby places
            majority_zone = max(zone_votes, key=lambda z: zone_votes[z])
            majority_count = zone_votes[majority_zone]
            current_zone = updated.get(pid, "CENTRAL")

            # If majority is different and strong, switch
            if (majority_zone != current_zone
                    and majority_count >= 2):
                logger.debug(
                    "Consistency: moving '%s' from %s → %s "
                    "(nearby majority votes: %d)",
                    place.get("name", "?"),
                    current_zone,
                    majority_zone,
                    majority_count,
                )
                updated[pid] = majority_zone

        return updated

    def _update_cluster_centre(self, cluster: GeoCluster) -> None:
        """
        Recalculate cluster centre coordinates as the centroid
        of all place coordinates in the cluster.
        """
        lats = []
        lons = []
        for place in cluster.places:
            coords = place.get("coordinates", {})
            if isinstance(coords, dict):
                lat = coords.get("lat")
                lon = coords.get("lon")
                if lat is not None and lon is not None:
                    lats.append(float(lat))
                    lons.append(float(lon))

        if lats and lons:
            cluster.centre_lat = sum(lats) / len(lats)
            cluster.centre_lon = sum(lons) / len(lons)

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def _log_clustering_result(self, result: ClusteringResult) -> None:
        logger.info(
            "Clustering complete | zones=%d | total_places=%d",
            len(result.clusters),
            result.total_places,
        )
        for zone_id, cluster in sorted(
            result.clusters.items(),
            key=lambda x: x[1].place_count,
            reverse=True,
        ):
            logger.info(
                "  %-20s | places=%2d | top_tier=%2d | "
                "must_visit=%s | centre=(%.4f, %.4f)",
                cluster.display_name,
                cluster.place_count,
                cluster.top_tier_count,
                cluster.has_must_visit,
                cluster.centre_lat,
                cluster.centre_lon,
            )


# ---------------------------------------------------------------------------
# Haversine distance helper
# ---------------------------------------------------------------------------

def _haversine_km(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
) -> float:
    """
    Calculate great-circle distance between two coordinates in km.
    Used for coordinate-based zone assignment fallback.
    """
    R = 6371.0  # Earth radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_cluster_engine: GeographicClusterEngine | None = None


def get_cluster_engine() -> GeographicClusterEngine:
    """Returns singleton GeographicClusterEngine."""
    global _cluster_engine
    if _cluster_engine is None:
        _cluster_engine = GeographicClusterEngine()
    return _cluster_engine