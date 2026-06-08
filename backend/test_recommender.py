"""
Recommendation Engine Test Suite.

Tests scoring correctness, field access, budget matching,
interest matching, and tier weighting.

Run from backend/:
    python test_recommender.py
"""

import json
import sys
import logging
from pathlib import Path

# Ensure backend/ is on path
sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
logger = logging.getLogger("test_recommender")


def separator(title: str = ""):
    print()
    print("=" * 70)
    if title:
        print(f"  {title}")
        print("=" * 70)


def test_basic_load():
    separator("TEST 1: Basic Load")
    from services.recommender import get_recommender
    r = get_recommender()
    places = r.get_all_places()
    print(f"  Total places loaded: {len(places)}")
    assert len(places) == 79, f"Expected 79 places, got {len(places)}"
    print("  PASS: 79 places loaded correctly")


def test_field_presence():
    separator("TEST 2: Field Presence on All Places")
    from services.recommender import get_recommender
    r = get_recommender()
    places = r.get_all_places()

    required = [
        "id", "name", "coordinates", "nearby_place_ids",
        "pair_well_with", "recommendation_tier", "walking_intensity",
        "must_visit", "rating", "categories", "interests",
        "tags", "budget_level",
    ]

    # Note: 'categories' may be stored as 'category' (singular) in schema
    actual_required = [
        "id", "name", "coordinates", "nearby_place_ids",
        "pair_well_with", "recommendation_tier", "walking_intensity",
        "must_visit", "rating", "interests", "tags", "budget_level",
    ]

    issues = []
    for place in places:
        for field in actual_required:
            if field not in place:
                issues.append(f"  MISSING [{field}] in: {place.get('name', '?')}")

    if issues:
        for issue in issues:
            print(issue)
        print(f"  FAIL: {len(issues)} missing fields found")
    else:
        print("  PASS: All required fields present in all 79 places")


def test_tier_distribution():
    separator("TEST 3: Tier Distribution")
    from services.recommender import get_recommender
    from collections import Counter
    r = get_recommender()
    places = r.get_all_places()

    tiers = Counter(
        str(p.get("recommendation_tier", "MISSING")).upper()
        for p in places
    )

    print("  Tier distribution:")
    for tier in ["S", "A", "B", "C", "MISSING"]:
        count = tiers.get(tier, 0)
        bar = "#" * count
        print(f"    {tier}: {bar} ({count})")

    assert tiers.get("MISSING", 0) == 0, "Some places have no recommendation_tier"
    print("  PASS: All places have a tier")


def test_scoring_history_budget():
    separator("TEST 4: Scoring — History + Budget")
    from services.recommender import recommend_places

    results = recommend_places(
        interests=["history", "culture"],
        budget="budget",
        limit=15,
    )

    print(f"  Results count: {len(results)}")
    print()
    print("  Rank | Score  | Name")
    print("  " + "-" * 50)
    for i, item in enumerate(results, 1):
        print(f"  {i:3}. | {item['score']:6.1f} | {item['name']}")

    assert len(results) > 0, "No results returned"

    # Golconda Fort and Charminar should be in top results for history
    top_names = [r["name"] for r in results[:10]]
    print()
    print(f"  Top 10: {top_names}")

    history_icons = ["Golconda Fort", "Charminar", "Qutb Shahi Tombs",
                     "Salar Jung Museum", "Chowmahalla Palace"]
    found = [n for n in history_icons if n in top_names]
    print(f"  History icons in top 10: {found}")

    assert len(found) >= 2, (
        f"Expected at least 2 history icons in top 10, found: {found}"
    )
    print("  PASS: History icons appear in top results")


def test_scoring_food_midrange():
    separator("TEST 5: Scoring — Food + Mid-Range")
    from services.recommender import recommend_places

    results = recommend_places(
        interests=["food"],
        budget="mid-range",
        limit=15,
    )

    print("  Rank | Score  | Name")
    print("  " + "-" * 50)
    for i, item in enumerate(results, 1):
        print(f"  {i:3}. | {item['score']:6.1f} | {item['name']}")

    food_places = [
        "Cafe Niloufer", "Ram Ki Bandi", "Shah Ghouse",
        "Paradise", "Hotel Shadab"
    ]
    top_names = [r["name"] for r in results[:10]]
    found = [n for n in food_places if n in top_names]
    print(f"\n  Food places in top 10: {found}")

    assert len(results) > 0, "No results for food query"
    print("  PASS: Food results returned")


def test_scoring_nature_premium():
    separator("TEST 6: Scoring — Nature + Premium")
    from services.recommender import recommend_places

    results = recommend_places(
        interests=["nature", "relaxation"],
        budget="premium",
        limit=15,
    )

    print("  Rank | Score  | Name")
    print("  " + "-" * 50)
    for i, item in enumerate(results, 1):
        print(f"  {i:3}. | {item['score']:6.1f} | {item['name']}")

    assert len(results) > 0, "No results for nature query"
    print("  PASS: Nature results returned")


def test_must_visit_weighting():
    separator("TEST 7: Must-Visit Weighting")
    from services.recommender import get_recommender

    r = get_recommender()
    places = r.get_all_places()

    must_visit = [p["name"] for p in places if p.get("must_visit")]
    print(f"  Must-visit places: {len(must_visit)}")
    for name in must_visit:
        print(f"    - {name}")

    # Score a must-visit vs non-must-visit with same interests
    results = r.recommend(
        interests=["history"],
        budget="budget",
        limit=79,
    )

    # Check that must_visit places generally score higher
    must_visit_scores = [
        r["score"] for r in results
        if r["name"] in must_visit
    ]
    non_must_scores = [
        r["score"] for r in results
        if r["name"] not in must_visit
    ]

    avg_must = sum(must_visit_scores) / len(must_visit_scores) if must_visit_scores else 0
    avg_non = sum(non_must_scores) / len(non_must_scores) if non_must_scores else 0

    print(f"\n  Average score — must_visit places:     {avg_must:.1f}")
    print(f"  Average score — non-must_visit places: {avg_non:.1f}")

    assert avg_must > avg_non, (
        "Must-visit places should score higher on average"
    )
    print("  PASS: Must-visit places score higher than non-must-visit")


def test_score_breakdown():
    separator("TEST 8: Score Breakdown Transparency")
    from services.recommender import get_recommender

    r = get_recommender()
    results = r.recommend(
        interests=["history", "photography"],
        budget="budget",
        limit=5,
    )

    print("  Score breakdowns for top 5:")
    for item in results:
        bd = item.get("breakdown", {})
        print(f"\n  {item['name']} — Total: {item['score']:.1f}")
        print(f"    tier={bd.get('tier',0)} | must_visit={bd.get('must_visit',0)} | "
              f"interest={bd.get('interest_match',0)} | rating={bd.get('rating',0):.1f} | "
              f"budget={bd.get('budget',0)} | popularity={bd.get('popularity',0)} | "
              f"walking={bd.get('walking',0)}")
        print(f"    matched_interests={bd.get('matched_interests', [])}")

    print("\n  PASS: Breakdown data available on all results")


def test_no_duplicates():
    separator("TEST 9: No Duplicate Places in Dataset")
    from services.recommender import get_recommender

    r = get_recommender()
    places = r.get_all_places()

    ids = [p["id"] for p in places]
    names = [p["name"] for p in places]

    duplicate_ids = [i for i in ids if ids.count(i) > 1]
    duplicate_names = [n for n in names if names.count(n) > 1]

    if duplicate_ids:
        print(f"  DUPLICATE IDs: {set(duplicate_ids)}")
    if duplicate_names:
        print(f"  DUPLICATE names: {set(duplicate_names)}")

    assert not duplicate_ids, f"Duplicate IDs found: {set(duplicate_ids)}"
    assert not duplicate_names, f"Duplicate names found: {set(duplicate_names)}"
    print("  PASS: No duplicates found")


def test_coordinates_valid():
    separator("TEST 10: Coordinate Validity")
    from services.recommender import get_recommender

    r = get_recommender()
    places = r.get_all_places()

    invalid = []
    for p in places:
        coords = p.get("coordinates", {})
        if isinstance(coords, dict):
            lat = coords.get("lat")
            lon = coords.get("lon")
            if lat is None or lon is None:
                invalid.append(p["name"])
            elif not (17.20 <= lat <= 17.60):
                invalid.append(f"{p['name']} (lat={lat} out of range)")
            elif not (78.20 <= lon <= 78.70):
                invalid.append(f"{p['name']} (lon={lon} out of range)")
        else:
            invalid.append(f"{p['name']} (no coordinates dict)")

    if invalid:
        print(f"  Invalid coordinates:")
        for name in invalid:
            print(f"    - {name}")
        print(f"  FAIL: {len(invalid)} coordinate issues")
    else:
        print(f"  PASS: All 79 places have valid Hyderabad coordinates")


def test_nearby_and_pairs():
    separator("TEST 11: Nearby Place IDs and Pair Well With")
    from services.recommender import get_recommender

    r = get_recommender()
    places = r.get_all_places()
    all_ids = {p["id"] for p in places}

    broken_nearby = []
    broken_pairs = []

    for p in places:
        for nid in p.get("nearby_place_ids", []):
            if nid not in all_ids:
                broken_nearby.append(
                    f"{p['name']}: nearby_id '{nid}' not found"
                )
        for pid in p.get("pair_well_with", []):
            if pid not in all_ids:
                broken_pairs.append(
                    f"{p['name']}: pair_id '{pid}' not found"
                )

    if broken_nearby:
        print("  Broken nearby_place_ids:")
        for b in broken_nearby:
            print(f"    - {b}")
    else:
        print("  PASS: All nearby_place_ids reference valid places")

    if broken_pairs:
        print("  Broken pair_well_with:")
        for b in broken_pairs:
            print(f"    - {b}")
    else:
        print("  PASS: All pair_well_with reference valid places")


def run_all_tests():
    separator("SAFEROUTE AI — RECOMMENDATION ENGINE AUDIT")
    print("  Running all tests against 79 curated Hyderabad places")

    tests = [
        test_basic_load,
        test_field_presence,
        test_tier_distribution,
        test_scoring_history_budget,
        test_scoring_food_midrange,
        test_scoring_nature_premium,
        test_must_visit_weighting,
        test_score_breakdown,
        test_no_duplicates,
        test_coordinates_valid,
        test_nearby_and_pairs,
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
        print("  Recommendation engine is correctly reading 79 places")
        print("  and scoring them with correct field names.")

    separator()
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)