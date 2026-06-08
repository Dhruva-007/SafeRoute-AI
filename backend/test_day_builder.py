"""
Day Builder Test Suite.

Run from backend/:
    python test_day_builder.py
"""

import sys
import logging
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)


def separator(title: str = ""):
    print()
    print("=" * 70)
    if title:
        print(f"  {title}")
        print("=" * 70)


def build_test_itinerary(
    days: int,
    interests: list,
    budget: str,
) -> list:
    from services.recommender import get_recommender
    from services.day_builder import get_day_builder

    recommender = get_recommender()
    builder     = get_day_builder()

    scored = recommender.recommend(
        interests=interests,
        budget=budget,
        limit=79,
    )

    return builder.build_days(
        scored_places=scored,
        days=days,
        interests=interests,
        budget=budget,
    )


def print_itinerary(built_days):
    for day in built_days:
        print(
            f"\n  Day {day.day_number} | "
            f"Zone: {day.primary_zone_name} | "
            f"Activities: {day.activity_count} | "
            f"Hours: {day.total_duration_hours:.1f}h | "
            f"Cost: ₹{day.estimated_cost_per_person}"
        )
        if day.borrowed_from_zones:
            print(f"    (Borrowed from: {day.borrowed_from_zones})")

        for i, act in enumerate(day.activities, 1):
            food_tag = " 🍽" if act.is_food else ""
            mv_tag   = " ⭐" if act.must_visit else ""
            print(
                f"    {i}. [{act.recommendation_tier}] "
                f"{act.name}{mv_tag}{food_tag}"
                f"  ({act.duration_hours:.1f}h | "
                f"{act.walking_intensity} walk)"
            )


def test_3_day_history_budget():
    separator("TEST 1: 3-Day History + Budget Trip")
    days = build_test_itinerary(
        days=3,
        interests=["history", "culture", "food"],
        budget="budget",
    )

    print(f"  Days built: {len(days)}")
    print_itinerary(days)

    assert len(days) == 3, f"Expected 3 days, got {len(days)}"

    all_ids    = [act.place_id for day in days for act in day.activities]
    duplicates = [pid for pid, cnt in Counter(all_ids).items() if cnt > 1]
    assert not duplicates, f"Duplicate places: {duplicates}"

    zones = [d.primary_zone_id for d in days]
    print(f"\n  Zone sequence: {zones}")
    print("  PASS: 3-day history trip built with no duplicates")


def test_2_day_food_midrange():
    separator("TEST 2: 2-Day Food + Mid-Range Trip")
    days = build_test_itinerary(
        days=2,
        interests=["food", "shopping"],
        budget="mid-range",
    )

    print(f"  Days built: {len(days)}")
    print_itinerary(days)

    assert len(days) == 2, f"Expected 2 days, got {len(days)}"

    zones = [d.primary_zone_id for d in days]
    print(f"\n  Zone sequence: {zones}")
    print("  PASS: 2-day food trip built successfully")


def test_5_day_comprehensive():
    separator("TEST 3: 5-Day Comprehensive Trip")
    days = build_test_itinerary(
        days=5,
        interests=["history", "nature", "food", "culture"],
        budget="mid-range",
    )

    print(f"  Days built: {len(days)}")
    print_itinerary(days)

    assert len(days) == 5, f"Expected 5 days, got {len(days)}"

    all_ids    = [act.place_id for day in days for act in day.activities]
    duplicates = [pid for pid, cnt in Counter(all_ids).items() if cnt > 1]
    assert not duplicates, f"Duplicate places: {duplicates}"

    for day in days:
        assert 3 <= day.activity_count <= 5, (
            f"Day {day.day_number} has {day.activity_count} activities"
        )

    zones = [d.primary_zone_id for d in days]
    print(f"\n  Zone sequence: {zones}")
    print("  PASS: 5-day comprehensive trip built correctly")


def test_activity_count_per_day():
    separator("TEST 4: Activity Count per Day (3-5 Rule)")
    days = build_test_itinerary(
        days=3,
        interests=["history"],
        budget="budget",
    )

    violations = []
    for day in days:
        count = day.activity_count
        status = "OK" if 3 <= count <= 5 else "VIOLATION"
        print(f"  Day {day.day_number}: {count} activities — {status}")
        if count < 3 or count > 5:
            violations.append(
                f"Day {day.day_number}: {count} activities"
            )

    assert not violations, f"Violations: {violations}"
    print("  PASS: All days have 3-5 activities")


def test_duration_budget():
    separator("TEST 5: Duration Budget (max 9 hours/day)")
    days = build_test_itinerary(
        days=3,
        interests=["history", "culture"],
        budget="budget",
    )

    violations = []
    for day in days:
        hours  = day.total_duration_hours
        status = "OK" if hours <= 9.0 else "VIOLATION"
        print(f"  Day {day.day_number}: {hours:.1f}h — {status}")
        if hours > 9.0:
            violations.append(f"Day {day.day_number}: {hours:.1f}h")

    assert not violations, f"Violations: {violations}"
    print("  PASS: All days within 9-hour duration budget")


def test_no_duplicates_3_days():
    separator("TEST 6: No Duplicate Places Across Days")
    days = build_test_itinerary(
        days=3,
        interests=["history", "food", "nature"],
        budget="budget",
    )

    all_ids   = [act.place_id for day in days for act in day.activities]
    all_names = [act.name     for day in days for act in day.activities]

    id_dupes   = {k: v for k, v in Counter(all_ids).items()   if v > 1}
    name_dupes = {k: v for k, v in Counter(all_names).items() if v > 1}

    if id_dupes:
        print(f"  Duplicate IDs: {id_dupes}")
    if name_dupes:
        print(f"  Duplicate names: {name_dupes}")

    assert not id_dupes,   f"Duplicate place IDs: {id_dupes}"
    assert not name_dupes, f"Duplicate place names: {name_dupes}"

    print(f"  Total unique places: {len(all_ids)}")
    print("  PASS: No duplicates across any days")


def test_geographic_grouping():
    separator("TEST 7: Geographic Zone Grouping per Day")
    days = build_test_itinerary(
        days=3,
        interests=["history", "culture"],
        budget="budget",
    )

    print("  Zone assignments:")
    for day in days:
        zone_ids     = set(act.zone_id for act in day.activities)
        primary      = day.primary_zone_id
        cross_zone   = zone_ids - {primary}
        primary_cnt  = sum(
            1 for act in day.activities if act.zone_id == primary
        )
        total        = day.activity_count

        print(
            f"  Day {day.day_number}: primary={primary} | "
            f"cross_zone={cross_zone if cross_zone else 'none'}"
        )
        print(
            f"    Primary zone activities: {primary_cnt}/{total} "
            f"({primary_cnt/total*100:.0f}%)"
        )

        assert primary_cnt >= total * 0.5, (
            f"Day {day.day_number}: Primary zone only "
            f"{primary_cnt}/{total} activities"
        )

    print("  PASS: Primary zone contributes majority of activities")


def test_must_visit_prioritisation():
    separator("TEST 8: Must-Visit Places Appear in Trip")
    days = build_test_itinerary(
        days=3,
        interests=["history", "culture"],
        budget="budget",
    )

    must_visit_totals = []
    for day in days:
        mv = [act for act in day.activities if act.must_visit]
        must_visit_totals.append(len(mv))
        print(
            f"  Day {day.day_number}: {len(mv)} must-visit — "
            f"{[a.name for a in mv]}"
        )

    total_mv = sum(must_visit_totals)
    print(f"  Total must-visit across all days: {total_mv}")

    assert total_mv >= 3, (
        f"Expected ≥3 must-visit places, got {total_mv}"
    )
    print("  PASS: Must-visit places included across the trip")


def test_category_diversity():
    separator("TEST 9: Category Diversity (max 2/day)")
    days = build_test_itinerary(
        days=3,
        interests=["history", "food", "culture"],
        budget="budget",
    )

    violations = []
    for day in days:
        cat_counts = Counter(act.category for act in day.activities)
        print(f"  Day {day.day_number}: {dict(cat_counts)}")
        for cat, count in cat_counts.items():
            if count > 2:
                violations.append(
                    f"Day {day.day_number}: '{cat}' x{count}"
                )

    assert not violations, f"Category violations: {violations}"
    print("  PASS: No category exceeds 2 per day")


def test_food_inclusion():
    separator("TEST 10: Food Included in Trip")
    days = build_test_itinerary(
        days=3,
        interests=["history", "culture", "food"],
        budget="budget",
    )

    days_with_food = 0
    for day in days:
        food_count = sum(1 for act in day.activities if act.is_food)
        if food_count > 0:
            days_with_food += 1
        print(
            f"  Day {day.day_number}: {food_count} food places — "
            f"{[a.name for a in day.activities if a.is_food]}"
        )

    assert days_with_food >= 2, (
        f"Expected food in at least 2 days, got {days_with_food}"
    )
    print(f"  PASS: Food included in {days_with_food}/3 days")


def test_zone_progression():
    separator("TEST 11: Zone Rotation — Different Zones Per Day")

    # Test with 4 days — should use at least 2 different zones
    days = build_test_itinerary(
        days=4,
        interests=["history", "culture", "nature", "food"],
        budget="mid-range",
    )

    zone_sequence = [day.primary_zone_id for day in days]
    unique_zones  = set(zone_sequence)

    print(f"  Zone sequence (4 days):  {zone_sequence}")
    print(f"  Unique zones:            {unique_zones}")
    print(f"  Zone variety:            {len(unique_zones)} distinct zones")

    assert len(unique_zones) >= 2, (
        f"Expected ≥2 different zones for 4 days, got: {unique_zones}"
    )
    print("  PASS: Zone rotation working — multiple zones used")

    separator("  Bonus: 5-day zone progression")
    days5 = build_test_itinerary(
        days=5,
        interests=["history", "culture", "nature", "food"],
        budget="mid-range",
    )
    seq5 = [day.primary_zone_id for day in days5]
    unique5 = set(seq5)
    print(f"  Zone sequence (5 days):  {seq5}")
    print(f"  Unique zones:            {unique5}")
    assert len(unique5) >= 3, (
        f"Expected ≥3 zones for 5 days, got: {unique5}"
    )
    print("  PASS: 5-day trip uses 3+ different zones")


def test_1_day_trip():
    separator("TEST 12: 1-Day Trip")
    days = build_test_itinerary(
        days=1,
        interests=["history"],
        budget="budget",
    )

    assert len(days) == 1, f"Expected 1 day, got {len(days)}"
    print_itinerary(days)
    assert days[0].activity_count >= 3, (
        "Single day should have at least 3 activities"
    )
    print("  PASS: 1-day trip built correctly")


def test_to_dict_serialisation():
    separator("TEST 13: to_dict() Serialisation")
    import json
    days = build_test_itinerary(
        days=2,
        interests=["history"],
        budget="budget",
    )

    for day in days:
        day_dict   = day.to_dict()
        serialised = json.dumps(day_dict)
        parsed     = json.loads(serialised)
        assert parsed["day_number"]  == day.day_number
        assert len(parsed["activities"]) == day.activity_count

    print("  PASS: All BuiltDay objects serialise correctly")


def run_all_tests():
    separator("DAY BUILDER TEST SUITE")
    print("  Testing algorithmic day construction for Hyderabad trips")

    tests = [
        test_3_day_history_budget,
        test_2_day_food_midrange,
        test_5_day_comprehensive,
        test_activity_count_per_day,
        test_duration_budget,
        test_no_duplicates_3_days,
        test_geographic_grouping,
        test_must_visit_prioritisation,
        test_category_diversity,
        test_food_inclusion,
        test_zone_progression,
        test_1_day_trip,
        test_to_dict_serialisation,
    ]

    passed = 0
    failed = 0
    errors = []

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"\n  FAIL: {e}")
            failed += 1
            errors.append(f"{test.__name__}: {e}")
        except Exception as e:
            print(f"\n  ERROR in {test.__name__}: {e}")
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
        print("  Day Builder is producing geographically coherent itineraries.")
        print("  Zone rotation is working correctly.")
        print("  Ready for Phase 4: Route Optimizer")

    separator()
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)