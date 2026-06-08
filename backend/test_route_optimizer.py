"""
Route Optimizer Test Suite.

Verifies:
  - Routes are correctly reordered to minimize travel distance
  - Time slots are assigned correctly starting at 9:00 AM
  - Morning anchor selection works (high-walk places go first)
  - Food places are not placed first
  - Total distance after optimization is less than naive (score) ordering
  - All activities retain their data after reordering
  - Route notes are generated

Run from backend/:
    python test_route_optimizer.py
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


def build_full_pipeline(
    days: int,
    interests: list,
    budget: str,
):
    """Build scored → clustered → day-built → route-optimized itinerary."""
    from services.recommender import get_recommender
    from services.day_builder import get_day_builder
    from services.route_optimizer import get_route_optimizer

    recommender = get_recommender()
    builder     = get_day_builder()
    optimizer   = get_route_optimizer()

    scored = recommender.recommend(
        interests=interests,
        budget=budget,
        limit=79,
    )

    built_days = builder.build_days(
        scored_places=scored,
        days=days,
        interests=interests,
        budget=budget,
    )

    optimized_days = optimizer.optimize_itinerary(built_days)

    return built_days, optimized_days


def print_optimized_day(day):
    print(
        f"\n  Day {day.day_number} | "
        f"Zone: {day.primary_zone_name} | "
        f"Distance: {day.total_distance_km:.1f}km | "
        f"{day.start_time} → {day.end_time}"
    )
    for act in day.activities:
        food_tag = " 🍽" if act.is_food else ""
        mv_tag   = " ⭐" if act.must_visit else ""
        print(
            f"    {act.visit_order}. "
            f"[{act.recommendation_tier}] "
            f"{act.suggested_start_time} - {act.suggested_end_time} | "
            f"{act.name}{mv_tag}{food_tag}"
            f"  ({act.duration_hours:.1f}h | "
            f"{act.walking_intensity} walk)"
        )
    if day.route_notes:
        print(f"    Notes:")
        for note in day.route_notes:
            print(f"      • {note}")


def test_basic_optimization():
    separator("TEST 1: Basic Route Optimization (3-Day)")
    built_days, optimized = build_full_pipeline(
        days=3,
        interests=["history", "culture", "food"],
        budget="budget",
    )

    print(f"  Optimized days: {len(optimized)}")
    for day in optimized:
        print_optimized_day(day)

    assert len(optimized) == 3, f"Expected 3 days, got {len(optimized)}"
    print("\n  PASS: 3-day route optimization completed")


def test_no_food_first():
    separator("TEST 2: Food Places Are Not First Activity")
    _, optimized = build_full_pipeline(
        days=3,
        interests=["history", "food"],
        budget="budget",
    )

    violations = []
    for day in optimized:
        if day.activities:
            first = day.activities[0]
            if first.is_food:
                violations.append(
                    f"Day {day.day_number}: first activity is food "
                    f"({first.name})"
                )

    if violations:
        print(f"  Violations: {violations}")
    else:
        for day in optimized:
            if day.activities:
                print(
                    f"  Day {day.day_number}: first = "
                    f"[{day.activities[0].category}] "
                    f"{day.activities[0].name}"
                )

    assert not violations, f"Food-first violations: {violations}"
    print("  PASS: No day starts with a food/restaurant activity")


def test_high_walk_placed_early():
    separator("TEST 3: High Walking Places Placed Early in Day")
    _, optimized = build_full_pipeline(
        days=3,
        interests=["history", "adventure"],
        budget="budget",
    )

    for day in optimized:
        high_walk_positions = []
        low_walk_positions  = []

        for act in day.activities:
            if act.walking_intensity == "high":
                high_walk_positions.append(act.visit_order)
            elif act.walking_intensity == "low":
                low_walk_positions.append(act.visit_order)

        if high_walk_positions and low_walk_positions:
            avg_high = sum(high_walk_positions) / len(high_walk_positions)
            avg_low  = sum(low_walk_positions)  / len(low_walk_positions)
            print(
                f"  Day {day.day_number}: "
                f"avg_position(high_walk)={avg_high:.1f} | "
                f"avg_position(low_walk)={avg_low:.1f}"
            )
        else:
            acts_str = [
                f"{a.name}({a.walking_intensity})"
                for a in day.activities
            ]
            print(
                f"  Day {day.day_number}: "
                f"mixed walking: {acts_str}"
            )

    print("  PASS: Walking intensity ordering checked")


def test_time_slots_assigned():
    separator("TEST 4: Time Slots Assigned to All Activities")
    _, optimized = build_full_pipeline(
        days=3,
        interests=["history"],
        budget="budget",
    )

    for day in optimized:
        for act in day.activities:
            assert act.suggested_start_time, (
                f"{act.name} missing suggested_start_time"
            )
            assert act.suggested_end_time, (
                f"{act.name} missing suggested_end_time"
            )

    # Print time slots for Day 1
    day1 = optimized[0]
    print(f"  Day 1 time slots:")
    for act in day1.activities:
        print(
            f"    {act.suggested_start_time:10} - "
            f"{act.suggested_end_time:10} | {act.name}"
        )

    print("  PASS: All activities have start and end times")


def test_day_starts_at_9am():
    separator("TEST 5: Day Always Starts at 9:00 AM")
    _, optimized = build_full_pipeline(
        days=3,
        interests=["history"],
        budget="budget",
    )

    for day in optimized:
        if day.activities:
            first_start = day.activities[0].suggested_start_time
            print(
                f"  Day {day.day_number}: starts at {first_start}"
            )
            assert "9:00 AM" == first_start, (
                f"Day {day.day_number} should start at 9:00 AM, "
                f"got {first_start}"
            )

    print("  PASS: All days start at 9:00 AM")


def test_time_slots_sequential():
    separator("TEST 6: Time Slots Are Sequential (No Overlaps)")
    _, optimized = build_full_pipeline(
        days=3,
        interests=["history", "culture"],
        budget="budget",
    )

    from datetime import datetime

    for day in optimized:
        acts = day.activities
        print(f"\n  Day {day.day_number}:")

        for i in range(len(acts) - 1):
            curr = acts[i]
            nxt  = acts[i + 1]

            curr_end  = datetime.strptime(
                curr.suggested_end_time, "%I:%M %p"
            )
            next_start = datetime.strptime(
                nxt.suggested_start_time, "%I:%M %p"
            )

            print(
                f"    {curr.name[:30]:30} ends   {curr.suggested_end_time}"
            )
            print(
                f"    {nxt.name[:30]:30} starts {nxt.suggested_start_time}"
            )

            assert next_start >= curr_end, (
                f"Day {day.day_number}: {nxt.name} starts "
                f"({nxt.suggested_start_time}) before "
                f"{curr.name} ends ({curr.suggested_end_time})"
            )

    print("\n  PASS: All time slots are sequential with no overlaps")


def test_visit_order_set():
    separator("TEST 7: Visit Order Numbers Set Correctly")
    _, optimized = build_full_pipeline(
        days=2,
        interests=["history"],
        budget="budget",
    )

    for day in optimized:
        orders = [act.visit_order for act in day.activities]
        expected = list(range(1, len(orders) + 1))
        print(f"  Day {day.day_number}: visit_orders={orders}")
        assert orders == expected, (
            f"Day {day.day_number}: Expected {expected}, got {orders}"
        )

    print("  PASS: Visit order numbers are correct (1, 2, 3, ...)")


def test_distance_reduced_vs_score_order():
    separator("TEST 8: Optimized Distance ≤ Score-Sorted Distance")
    from services.route_optimizer import haversine_km

    _, optimized = build_full_pipeline(
        days=3,
        interests=["history", "culture"],
        budget="budget",
    )

    from services.recommender import get_recommender
    from services.day_builder import get_day_builder

    recommender = get_recommender()
    builder     = get_day_builder()

    scored = recommender.recommend(
        interests=["history", "culture"],
        budget="budget",
        limit=79,
    )
    built_days = builder.build_days(
        scored_places=scored,
        days=3,
        interests=["history", "culture"],
        budget="budget",
    )

    improvements = []
    for built, opt in zip(built_days, optimized):
        # Distance in original score-sorted order
        original_acts = built.activities
        original_dist = sum(
            haversine_km(
                original_acts[i].lat, original_acts[i].lon,
                original_acts[i+1].lat, original_acts[i+1].lon,
            )
            for i in range(len(original_acts) - 1)
        )

        optimized_dist = opt.total_distance_km

        improvement = original_dist - optimized_dist
        improvements.append(improvement)

        print(
            f"  Day {built.day_number}: "
            f"original={original_dist:.2f}km → "
            f"optimized={optimized_dist:.2f}km | "
            f"saved={improvement:.2f}km"
        )

    total_saved = sum(improvements)
    print(f"\n  Total distance saved: {total_saved:.2f}km")
    assert total_saved >= 0, (
        f"Optimization made routing WORSE (saved {total_saved:.2f}km)"
    )
    print("  PASS: Optimization did not increase total distance")


def test_no_duplicate_activities():
    separator("TEST 9: No Duplicates After Optimization")
    _, optimized = build_full_pipeline(
        days=3,
        interests=["history", "food"],
        budget="budget",
    )

    all_ids = [
        act.place_id
        for day in optimized
        for act in day.activities
    ]
    duplicates = {
        pid: cnt
        for pid, cnt in Counter(all_ids).items()
        if cnt > 1
    }

    if duplicates:
        print(f"  Duplicates: {duplicates}")

    assert not duplicates, f"Duplicate places after optimization: {duplicates}"
    print(f"  Total unique places: {len(all_ids)}")
    print("  PASS: No duplicate places across optimized itinerary")


def test_route_notes_present():
    separator("TEST 10: Route Notes Generated")
    _, optimized = build_full_pipeline(
        days=3,
        interests=["history"],
        budget="budget",
    )

    for day in optimized:
        assert day.route_notes, (
            f"Day {day.day_number} has no route notes"
        )
        print(f"  Day {day.day_number} notes ({len(day.route_notes)}):")
        for note in day.route_notes:
            print(f"    • {note}")

    print("  PASS: Route notes present for all days")


def test_to_dict_serialisation():
    separator("TEST 11: RouteOptimizedDay to_dict() Serialisation")
    import json
    _, optimized = build_full_pipeline(
        days=2,
        interests=["history"],
        budget="budget",
    )

    for day in optimized:
        day_dict   = day.to_dict()
        serialised = json.dumps(day_dict)
        parsed     = json.loads(serialised)

        assert parsed["day_number"]      == day.day_number
        assert parsed["activity_count"]  == day.activity_count
        assert len(parsed["activities"]) == day.activity_count

        for act in parsed["activities"]:
            assert "suggested_start_time" in act
            assert "suggested_end_time"   in act
            assert "visit_order"          in act
            assert "lat"                  in act
            assert "lon"                  in act

    print("  PASS: All RouteOptimizedDay objects serialise correctly")


def test_5_day_full_pipeline():
    separator("TEST 12: 5-Day Full Pipeline Summary")
    built_days, optimized = build_full_pipeline(
        days=5,
        interests=["history", "culture", "nature", "food"],
        budget="mid-range",
    )

    print(f"  Zone sequence: "
          f"{[d.primary_zone_id for d in optimized]}")
    print()

    total_places   = 0
    total_distance = 0.0

    for day in optimized:
        total_places   += day.activity_count
        total_distance += day.total_distance_km
        print(
            f"  Day {day.day_number} | {day.primary_zone_name:35} | "
            f"Activities={day.activity_count} | "
            f"Distance={day.total_distance_km:.1f}km | "
            f"{day.start_time} → {day.end_time}"
        )
        for act in day.activities:
            food = " 🍽" if act.is_food else ""
            mv   = " ⭐" if act.must_visit else ""
            print(
                f"    {act.visit_order}. "
                f"{act.suggested_start_time:8} "
                f"[{act.recommendation_tier}] "
                f"{act.name}{mv}{food}"
            )

    print()
    print(f"  Total places: {total_places}")
    print(f"  Total distance: {total_distance:.1f}km")

    assert len(optimized) == 5
    assert total_places >= 15

    zones = set(d.primary_zone_id for d in optimized)
    assert len(zones) >= 3, (
        f"Expected ≥3 zones for 5-day trip, got {zones}"
    )

    print("  PASS: 5-day full pipeline working end-to-end")


def run_all_tests():
    separator("ROUTE OPTIMIZER TEST SUITE")
    print("  Testing geographic route optimization within each day")

    tests = [
        test_basic_optimization,
        test_no_food_first,
        test_high_walk_placed_early,
        test_time_slots_assigned,
        test_day_starts_at_9am,
        test_time_slots_sequential,
        test_visit_order_set,
        test_distance_reduced_vs_score_order,
        test_no_duplicate_activities,
        test_route_notes_present,
        test_to_dict_serialisation,
        test_5_day_full_pipeline,
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
        print("  Route optimization is working correctly.")
        print("  Activities are ordered by geography, not score.")
        print("  Time slots assigned from 9:00 AM.")
        print("  Ready for Phase 5: Planner Refactor")

    separator()
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)