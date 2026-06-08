"""
LLM Output Validator for SafeRoute AI.

Validates every LLM response against the algorithmic ground truth.
If the LLM hallucinated, invented, or renamed any place, this
validator catches it and replaces the offending activity with
the correct algorithmic data.

This is the safety net that makes hallucination structurally impossible
to reach the user, even if the LLM misbehaves.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of validating one LLM response against ground truth."""
    is_valid:               bool
    hallucinated_names:     list[str]   = field(default_factory=list)
    corrected_names:        list[str]   = field(default_factory=list)
    missing_activities:     list[str]   = field(default_factory=list)
    extra_activities:       list[str]   = field(default_factory=list)
    corrections_applied:    int         = 0
    audit_log:              list[str]   = field(default_factory=list)


class LLMOutputValidator:
    """
    Validates and corrects LLM output against the algorithmic ground truth.

    The algorithmic pipeline (Recommender → DayBuilder → RouteOptimizer)
    is ALWAYS the ground truth. The LLM output is ALWAYS secondary.

    Validation checks:
    1. Every place name in LLM output must match a known dataset place
    2. Activity count per day must match algorithmic count
    3. No activities may be added or removed
    4. Place order should match optimized route order

    Correction strategy:
    - If LLM returns wrong name → replace with correct algorithmic name
    - If LLM drops an activity → insert fallback description
    - If LLM adds extra activity → remove it
    - If LLM reorders → restore algorithmic order
    """

    def __init__(self, all_place_names: set[str]) -> None:
        """
        Args:
            all_place_names: Set of all valid place names from places.json
                             Used for fuzzy matching to catch near-misses.
        """
        self._known_names       = all_place_names
        self._known_names_lower = {n.lower() for n in all_place_names}
        self._name_map          = {
            n.lower(): n for n in all_place_names
        }
        logger.info(
            "LLMOutputValidator initialised with %d known place names",
            len(all_place_names),
        )

    def validate_and_correct(
        self,
        llm_days:       list[dict],
        ground_truth:   list[dict],
    ) -> tuple[list[dict], ValidationResult]:
        """
        Validate LLM days against ground truth and correct any issues.

        Args:
            llm_days:     Days as returned by LLM (may have wrong names)
            ground_truth: Days from algorithmic pipeline (always correct)

        Returns:
            (corrected_days, validation_result)
            corrected_days: LLM descriptions merged onto ground truth structure
            validation_result: Audit report of what was found and fixed
        """
        result = ValidationResult(is_valid=True)

        # Build LLM description lookup: normalized_name → {desc, cost}
        llm_desc_lookup = self._build_llm_lookup(llm_days)

        corrected_days: list[dict] = []

        for day_gt in ground_truth:
            day_num = day_gt.get("day", 0)
            gt_activities = day_gt.get("activities", [])

            corrected_activities: list[dict] = []

            for gt_act in gt_activities:
                # Ground truth name is ALWAYS correct
                correct_name = gt_act.get("place", "")
                correct_norm = correct_name.lower()

                # Try to find matching LLM description
                llm_data = self._find_llm_match(
                    correct_name, correct_norm, llm_desc_lookup, result
                )

                description   = llm_data.get("description", "")
                estimated_cost = llm_data.get("estimated_cost", "")

                if not description:
                    # LLM either missed this place or gave wrong name
                    result.missing_activities.append(correct_name)
                    result.corrections_applied += 1
                    result.audit_log.append(
                        f"Day {day_num}: '{correct_name}' — "
                        f"LLM description missing, using fallback"
                    )

                # Build corrected activity — always use GT place name
                corrected_act = dict(gt_act)
                if description:
                    corrected_act["description"] = description
                if estimated_cost:
                    corrected_act["estimated_cost"] = estimated_cost

                corrected_activities.append(corrected_act)

            # Check if LLM added extra activities not in ground truth
            gt_names_norm = {
                a.get("place", "").lower()
                for a in gt_activities
            }
            for llm_name in llm_desc_lookup:
                if llm_name not in gt_names_norm:
                    # Check if it's close to any known place
                    if llm_name in self._known_names_lower:
                        # LLM used a real place not in this day's GT
                        result.extra_activities.append(
                            self._name_map.get(llm_name, llm_name)
                        )
                        result.audit_log.append(
                            f"Day {day_num}: LLM added extra activity "
                            f"'{llm_name}' — removed (not in GT for this day)"
                        )
                    elif not self._is_known_name(llm_name):
                        # LLM hallucinated a place that doesn't exist
                        result.hallucinated_names.append(llm_name)
                        result.is_valid = False
                        result.audit_log.append(
                            f"Day {day_num}: HALLUCINATION detected — "
                            f"'{llm_name}' not in dataset — removed"
                        )

            corrected_day = dict(day_gt)
            corrected_day["activities"] = corrected_activities
            corrected_days.append(corrected_day)

        # Summary
        if result.hallucinated_names:
            logger.warning(
                "HALLUCINATIONS DETECTED AND REMOVED: %s",
                result.hallucinated_names,
            )
        if result.corrections_applied > 0:
            logger.info(
                "LLM corrections applied: %d", result.corrections_applied
            )
        if result.is_valid and not result.hallucinated_names:
            logger.info("LLM output validation: CLEAN (no hallucinations)")

        return corrected_days, result

    def check_place_name(self, name: str) -> tuple[bool, str | None]:
        """
        Check if a place name is valid.

        Returns:
            (is_valid, corrected_name)
            If valid: (True, canonical_name)
            If invalid: (False, None)
        """
        if not name:
            return False, None

        norm = name.lower().strip()

        # Exact match
        if norm in self._name_map:
            return True, self._name_map[norm]

        # Fuzzy: check if known name is substring of LLM name or vice versa
        for known_norm, canonical in self._name_map.items():
            if known_norm in norm or norm in known_norm:
                return True, canonical

        return False, None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_llm_lookup(
        self, llm_days: list[dict]
    ) -> dict[str, dict]:
        """
        Build a normalized name → {description, cost, time} lookup
        from LLM response days.
        """
        lookup: dict[str, dict] = {}

        for llm_day in llm_days:
            for act in llm_day.get("activities", []):
                raw_name = str(act.get("place", "")).strip()
                if not raw_name:
                    continue
                norm = raw_name.lower()
                lookup[norm] = {
                    "description":    str(act.get("description", "")).strip(),
                    "estimated_cost": str(act.get("estimated_cost", "")).strip(),
                    "time":           str(act.get("time", "")).strip(),
                    "raw_name":       raw_name,
                }

        return lookup

    def _find_llm_match(
        self,
        correct_name:    str,
        correct_norm:    str,
        llm_lookup:      dict[str, dict],
        result:          ValidationResult,
    ) -> dict:
        """
        Find the best LLM description match for a ground truth place name.

        Tries:
        1. Exact normalized match
        2. Substring match (catches "Charminar" matching "The Charminar")
        3. Returns empty dict if no match found
        """
        # 1. Exact match
        if correct_norm in llm_lookup:
            return llm_lookup[correct_norm]

        # 2. Substring match
        for llm_norm, llm_data in llm_lookup.items():
            if correct_norm in llm_norm or llm_norm in correct_norm:
                # LLM used a slightly different name — log correction
                if llm_norm != correct_norm:
                    result.corrected_names.append(
                        f"'{llm_data['raw_name']}' → '{correct_name}'"
                    )
                    result.corrections_applied += 1
                    result.audit_log.append(
                        f"Name mismatch corrected: "
                        f"'{llm_data['raw_name']}' → '{correct_name}'"
                    )
                return llm_data

        return {}

    def _is_known_name(self, norm: str) -> bool:
        """Check if a normalized name matches any known place."""
        if norm in self._known_names_lower:
            return True
        for known in self._known_names_lower:
            if known in norm or norm in known:
                return True
        return False


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_validator: LLMOutputValidator | None = None


def get_llm_validator(all_place_names: set[str] | None = None) -> LLMOutputValidator:
    """
    Returns singleton LLMOutputValidator.
    Must be called with all_place_names on first use.
    """
    global _validator
    if _validator is None:
        if all_place_names is None:
            # Auto-load from places.json
            import json
            from pathlib import Path
            data_file = (
                Path(__file__).resolve().parent.parent
                / "data" / "places.json"
            )
            with open(data_file, "r", encoding="utf-8") as f:
                dataset = json.load(f)
            if isinstance(dataset, dict):
                places = dataset.get("places", [])
            else:
                places = dataset
            all_place_names = {p["name"] for p in places if "name" in p}

        _validator = LLMOutputValidator(all_place_names)
    return _validator