"""
Geographic Clustering Engine Test Suite.

Verifies that all 79 places are assigned to zones correctly,
that zone compositions match expected geography, and that
the clustering result is usable by DayBuilder.

Run from backend/:
    python test_geographic_cluster.py
"""

import sys
import logging
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)

logger = logging.getLogger("test_cluster")


def separator(title: str = ""):
    print()
    print("=" * 70)
    if title:
        print(f"  {title}")
        print("=" * 70)


def load_places_json() -> list[dict]:
    places_path = Path(__file__).resolve().parent / "data" / "places.json"
    with open(places_path, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    if isinstance(dataset, dict):
        return dataset.get("places", [])
    if isinstance(dataset, list):
        return dataset
    raise ValueError("Unexpected places.json format")


def get_place_id_by_name(places: list[dict], target_name: str) -> str:
    target = target_name.strip().lower()
    for p in places:
        if str(p.get("name", "")).strip().lower() == target:
            pid = p.get("id")
            if not pid:
                raise AssertionError(f"Found place name '{target_name}' but id is missing")
            return pid
    raise AssertionError(f"Could not find place name '{target_name}' in places.json")


def test_engine_loads():
    separator("TEST 1: Engine Loads")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    places = engine._places
    print(f"  Places loaded: {len(places)}")
    assert len(places) == 79, f"Expected 79, got {len(places)}"
    print("  PASS: Engine loaded 79 places")


def test_all_places_assigned():
    separator("TEST 2: All 79 Places Assigned to a Zone")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    total = result.total_places
    print(f"  Total places in clusters: {total}")

    assert total == 79, f"Expected 79 places in clusters, got {total}"
    print("  PASS: All 79 places are assigned to a zone")


def test_zone_compositions():
    separator("TEST 3: Zone Compositions")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    print(f"  Total zones: {len(result.clusters)}")
    print()

    for zone_id, cluster in sorted(
        result.clusters.items(),
        key=lambda x: x[1].place_count,
        reverse=True,
    ):
        print(f"  {cluster.display_name} ({zone_id})")
        print(f"    Places: {cluster.place_count}")
        print(f"    Top tier (S/A): {cluster.top_tier_count}")
        print(f"    Has must-visit: {cluster.has_must_visit}")
        print(f"    Centre: ({cluster.centre_lat:.4f}, {cluster.centre_lon:.4f})")
        print(f"    Places: {', '.join(cluster.place_names)}")
        print()

    # Every zone should have at least 1 place
    empty_zones = [
        z for z, c in result.clusters.items()
        if c.place_count == 0
    ]
    assert not empty_zones, f"Empty zones found: {empty_zones}"
    print("  PASS: No empty zones")


def test_old_city_cluster():
    separator("TEST 4: Old City Cluster")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    old_city = result.get_cluster("OLD_CITY")
    assert old_city is not None, "OLD_CITY cluster not found"

    print(f"  OLD_CITY places: {old_city.place_count}")
    print(f"  Names: {old_city.place_names}")

    expected = [
        "Charminar", "Mecca Masjid", "Laad Bazaar",
        "Chowmahalla Palace", "Nimrah Cafe",
    ]
    found = [n for n in expected if n in old_city.place_names]
    print(f"  Expected places found: {found}")

    assert len(found) >= 3, (
        f"OLD_CITY should contain at least 3 of {expected}, "
        f"found: {found}"
    )
    print(f"  PASS: Old City contains {len(found)}/{len(expected)} expected places")


def test_golconda_cluster():
    separator("TEST 5: Golconda Cluster")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    golconda = result.get_cluster("GOLCONDA")
    assert golconda is not None, "GOLCONDA cluster not found"

    print(f"  GOLCONDA places: {golconda.place_count}")
    print(f"  Names: {golconda.place_names}")

    expected = ["Golconda Fort", "Qutb Shahi Tombs", "Taramati Baradari"]
    found = [n for n in expected if n in golconda.place_names]
    print(f"  Expected places found: {found}")

    assert len(found) >= 2, (
        f"GOLCONDA should contain at least 2 of {expected}, "
        f"found: {found}"
    )
    print(f"  PASS: Golconda contains {len(found)}/{len(expected)} expected places")


def test_hitech_cluster():
    separator("TEST 6: Hitech City Cluster")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    hitech = result.get_cluster("HITECH_CITY")
    assert hitech is not None, "HITECH_CITY cluster not found"

    print(f"  HITECH_CITY places: {hitech.place_count}")
    print(f"  Names: {hitech.place_names}")

    expected = [
        "Shilparamam", "Durgam Cheruvu",
        "KBR National Park", "Durgam Cheruvu Cable Bridge",
    ]
    found = [n for n in expected if n in hitech.place_names]
    print(f"  Expected places found: {found}")

    assert len(found) >= 2, (
        f"HITECH_CITY should contain at least 2 of {expected}, "
        f"found: {found}"
    )
    print(f"  PASS: Hitech City contains {len(found)}/{len(expected)} expected places")


def test_score_sorting():
    separator("TEST 7: Places Sorted By Score Within Cluster")
    from services.geographic_cluster import get_cluster_engine
    from services.recommender import get_recommender

    engine = get_cluster_engine()
    recommender = get_recommender()

    scored = recommender.recommend(
        interests=["history", "culture"],
        budget="budget",
        limit=79,
    )

    result = engine.cluster(scored_places=scored)

    old_city = result.get_cluster("OLD_CITY")
    if old_city:
        print(f"  OLD_CITY sorted by score:")
        for place in old_city.places:
            print(
                f"    {place.get('_score', 0):6.1f} | "
                f"{place.get('name', '?')}"
            )

        scores = [p.get("_score", 0.0) for p in old_city.places]
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1], (
                f"Scores not sorted: {scores[i]} < {scores[i+1]}"
            )
        print("  PASS: Places are sorted by score within cluster")


def test_place_to_zone_lookup():
    separator("TEST 8: Place-to-Zone Lookup (robust by name)")

    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    places = load_places_json()

    # Use place NAMES to find the correct dataset IDs.
    # This avoids brittleness if the dataset ID differs.
    test_cases = [
        ("Golconda Fort", "GOLCONDA"),
        ("Charminar", "OLD_CITY"),
        ("Shilparamam", "HITECH_CITY"),
        ("Hussain Sagar Lake", "HUSSAIN_SAGAR"),
    ]

    for place_name, expected_zone in test_cases:
        place_id = get_place_id_by_name(places, place_name)
        actual_zone = result.get_zone_for_place(place_id)
        status = "PASS" if actual_zone == expected_zone else "FAIL"

        print(
            f"  {status}: {place_id:30} ({place_name}) → "
            f"expected={expected_zone:15} actual={actual_zone}"
        )

        assert actual_zone == expected_zone, (
            f"Zone mismatch for '{place_name}' (place_id={place_id}): "
            f"expected {expected_zone}, got {actual_zone}"
        )

    print("  PASS: All name-based place-to-zone lookups passed")


def test_adjacent_zones():
    separator("TEST 9: Adjacent Zone Relationships")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    print("  Adjacent zone pairs:")
    for zone_id, cluster in result.clusters.items():
        adj = result.get_adjacent_clusters(zone_id)
        adj_names = [a.zone_id for a in adj]
        print(f"    {zone_id:20} → {adj_names}")

    # OLD_CITY and GOLCONDA should be adjacent
    adj_to_old_city = result.get_adjacent_clusters("OLD_CITY")
    adj_ids = [c.zone_id for c in adj_to_old_city]

    assert "GOLCONDA" in adj_ids, (
        f"GOLCONDA should be adjacent to OLD_CITY. Got: {adj_ids}"
    )
    print("  PASS: Zone adjacency relationships are correct")


def test_pair_well_with():
    separator("TEST 10: Pair Well With Lookup")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()

    pairs = engine.get_pairs_for_place("golconda_fort")
    pair_names = [p.get("name") for p in pairs]
    print(f"  Golconda Fort pairs with: {pair_names}")

    assert len(pairs) > 0, "Golconda Fort should have pairs"
    assert any("Qutb" in (n or "") for n in pair_names), (
        "Qutb Shahi Tombs should pair with Golconda Fort"
    )
    print("  PASS: pair_well_with lookup works correctly")


def test_indoor_outdoor_split():
    separator("TEST 11: Indoor/Outdoor Place Split")
    from services.geographic_cluster import get_cluster_engine
    engine = get_cluster_engine()
    result = engine.cluster()

    total_indoor = 0
    total_outdoor = 0

    for cluster in result.clusters.values():
        total_indoor += len(cluster.get_indoor_places())
        total_outdoor += len(cluster.get_outdoor_places())

    print(f"  Indoor places:  {total_indoor}")
    print(f"  Outdoor places: {total_outdoor}")
    print(f"  Total:          {total_indoor + total_outdoor}")

    assert total_indoor > 0, "Should have some indoor places"
    assert total_outdoor > 0, "Should have some outdoor places"
    assert (total_indoor + total_outdoor) == 79, (
        f"Indoor + outdoor should equal 79, got {total_indoor + total_outdoor}"
    )
    print("  PASS: Indoor/outdoor split is correct")


def test_full_cluster_report():
    separator("TEST 12: Full Cluster Report with Scores")
    from services.geographic_cluster import get_cluster_engine
    from services.recommender import get_recommender

    engine = get_cluster_engine()
    recommender = get_recommender()

    scored = recommender.recommend(
        interests=["history", "culture", "food"],
        budget="budget",
        limit=79,
    )

    result = engine.cluster(scored_places=scored)

    print(f"  Zones sorted by average score:")
    for cluster in result.get_zones_sorted_by_score():
        top3 = [p.get("name", "?") for p in cluster.get_top_places(3)]
        print(
            f"    {cluster.display_name:35} "
            f"avg={cluster.avg_score:6.1f} "
            f"places={cluster.place_count:2} "
            f"top3={top3}"
        )

    print()
    print("  Zones with must-visit places:")
    for cluster in result.get_zones_with_must_visit():
        mv_names = [
            p.get("name") for p in cluster.places
            if p.get("must_visit")
        ]
        print(f"    {cluster.display_name}: {mv_names}")

    print("  PASS: Full report generated successfully")


def run_all_tests():
    separator("GEOGRAPHIC CLUSTERING ENGINE TEST SUITE")
    print("  Testing geographic zone assignment for 79 Hyderabad places")

    tests = [
        test_engine_loads,
        test_all_places_assigned,
        test_zone_compositions,
        test_old_city_cluster,
        test_golconda_cluster,
        test_hitech_cluster,
        test_score_sorting,
        test_place_to_zone_lookup,
        test_adjacent_zones,
        test_pair_well_with,
        test_indoor_outdoor_split,
        test_full_cluster_report,
    ]

    passed = 0
    failed = 0
    errors = []

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL: {e}")
            failed += 1
            errors.append(f"{test.__name__}: {e}")
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
            errors.append(f"{test.__name__}: {e}")

    separator("RESULTS")
    print(f"  Passed: {passed}")
    print(f"  Failed: {failed}")

    if errors:
        print("\n  Failures:")
        for err in errors:
            print(f"    - {err}")
    else:
        print()
        print("  ALL TESTS PASSED")
        print("  Geographic clustering is working correctly.")
        print("  All 79 places are assigned to logical zones.")
        print("  Ready for Phase 3: Day Builder")

    separator()
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)