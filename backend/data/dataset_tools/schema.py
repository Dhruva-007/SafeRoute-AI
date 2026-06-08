"""
Hyderabad Knowledge Base Schema (v2)
=====================================

Pydantic models defining the canonical structure for all places in the
SafeRoute AI knowledge base. This is the SINGLE SOURCE OF TRUTH for what
a "place" looks like in the system.

Design principles:
- Structured facts over prose
- Every field machine-filterable
- Controlled vocabulary (see vocabulary.json)
- LLM-friendly compact representation
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Controlled vocabulary types (mirrors vocabulary.json)
# ---------------------------------------------------------------------------

BudgetLevel = Literal["free", "budget", "mid-range", "premium"]
CrowdLevel = Literal["low", "moderate", "high", "variable"]
WeatherPreference = Literal[
    "any",
    "outdoor_dry",       # avoid in rain
    "indoor",            # comfortable any weather
    "avoid_extreme_heat",
    "best_after_rain",
    "monsoon_special",
]
DurationBucket = Literal[
    "very_short",    # < 1 hour
    "short",         # 1-2 hours
    "medium",        # 2-4 hours
    "long",          # 4-6 hours
    "full_day",      # 6+ hours
]
Category = Literal[
    "attractions",
    "food",
    "culture",
    "nature",
    "nightlife",
    "adventure",
    "history",
    "shopping",
    "relaxation",
]


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------

class OpeningHours(BaseModel):
    """
    Structured opening hours. None means data unavailable.
    Days use 3-letter codes: mon, tue, wed, thu, fri, sat, sun.
    """
    is_24_7: bool = False
    closed_days: list[str] = Field(
        default_factory=list,
        description="Days of week the place is closed, e.g. ['fri']",
    )
    open_time: str | None = Field(
        default=None,
        description="Opening time, 24h format e.g. '09:00'",
    )
    close_time: str | None = Field(
        default=None,
        description="Closing time, 24h format e.g. '18:00'",
    )
    notes: str | None = Field(
        default=None,
        description="Free-form note like 'Last entry 30 min before close'",
    )


class EntryFee(BaseModel):
    """
    Entry fee breakdown. All amounts in INR.
    Use 0 for free entry.
    """
    indian_adult: int = 0
    foreign_adult: int = 0
    child: int = 0
    notes: str | None = Field(
        default=None,
        description="e.g. 'Additional camera fee ₹25'",
    )


class Coordinates(BaseModel):
    """
    Geographic coordinates. WGS84.
    Hyderabad bounding box validation:
      lat: 17.20 to 17.60
      lon: 78.20 to 78.70
    """
    lat: float = Field(..., ge=17.20, le=17.60)
    lon: float = Field(..., ge=78.20, le=78.70)


class TimeWindow(BaseModel):
    """
    A recommended visit window — used for places with multiple ideal times
    (e.g. Charminar by day vs by night).
    """
    label: str = Field(
        ...,
        description="e.g. 'morning', 'evening', 'after sunset'",
    )
    start_hour: int = Field(..., ge=0, le=23)
    end_hour: int = Field(..., ge=0, le=23)
    reason: str = Field(
        ...,
        description="Why this window is ideal — used by planner",
    )


# ---------------------------------------------------------------------------
# Main Place schema
# ---------------------------------------------------------------------------

class Place(BaseModel):
    """
    Canonical representation of a single Hyderabad place.

    A "place" is anything plannable: monument, restaurant, market, park,
    activity venue, museum, etc. One physical location = one Place,
    even if it supports multiple experience modes (day/night, etc.).
    """

    # ─── Identity ───────────────────────────────────────────────────
    id: str = Field(
        ...,
        description="Stable unique ID, e.g. 'golconda_fort'",
        pattern=r"^[a-z0-9_]+$",
    )
    name: str = Field(..., min_length=2, max_length=120)
    aliases: list[str] = Field(
        default_factory=list,
        description="Alternate names for fuzzy matching",
    )

    # ─── Classification ─────────────────────────────────────────────
    category: Category
    subcategory: str = Field(
        ...,
        description="Specific type e.g. 'fort', 'street_food', 'cafe'",
    )
    interests: list[str] = Field(
        ...,
        min_length=1,
        description=(
            "Which user interests this place satisfies. Must be a subset "
            "of the 9 supported interests."
        ),
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Searchable keywords from controlled vocabulary",
    )

    # ─── Location ───────────────────────────────────────────────────
    coordinates: Coordinates
    neighborhood: str = Field(
        ...,
        description="Area name e.g. 'Ibrahim Bagh', 'Banjara Hills'",
    )
    address: str | None = None

    # ─── Cost ──────────────────────────────────────────────────────
    budget_level: BudgetLevel
    entry_fee: EntryFee = Field(default_factory=EntryFee)
    avg_cost_per_person: int = Field(
        default=0,
        ge=0,
        description=(
            "Average total spend per person in INR, including fees, "
            "transport, food if applicable. 0 = free or unknown."
        ),
    )

    # ─── Timing ────────────────────────────────────────────────────
    recommended_duration_hours: float = Field(..., gt=0, le=24)
    duration_bucket: DurationBucket
    opening_hours: OpeningHours = Field(default_factory=OpeningHours)
    time_windows: list[TimeWindow] = Field(
        default_factory=list,
        description="Recommended visit windows in priority order",
    )
    best_time: str = Field(
        ...,
        description=(
            "Human-readable summary e.g. 'Early morning 8-11am or "
            "evening 5-8pm to avoid heat'"
        ),
    )
    seasonal_notes: str | None = Field(
        default=None,
        description="e.g. 'Best post-monsoon Oct-Feb'",
    )

    # ─── Conditions ────────────────────────────────────────────────
    crowd_level: CrowdLevel
    weather_preference: WeatherPreference
    indoor: bool = Field(
        ...,
        description="Indoor venues comfortable in any weather",
    )

    # ─── Audience suitability ─────────────────────────────────────
    family_friendly: bool = True
    couple_friendly: bool = True
    solo_friendly: bool = True
    group_friendly: bool = True
    senior_friendly: bool = True
    child_friendly: bool = True
    min_age: int | None = Field(
        default=None,
        description="Minimum suggested age if applicable",
    )

    # ─── Relationships ─────────────────────────────────────────────
    nearby_place_ids: list[str] = Field(
        default_factory=list,
        max_length=8,
        description="IDs of places within ~2km, max 8",
    )
    pair_well_with: list[str] = Field(
        default_factory=list,
        description=(
            "IDs of places that complement this one in a day plan "
            "(e.g. Golconda Fort pairs with Qutb Shahi Tombs)"
        ),
    )

    # ─── Quality signals ───────────────────────────────────────────
    rating: float = Field(
        default=4.0,
        ge=1.0,
        le=5.0,
        description="Curated quality score 1.0-5.0",
    )
    popularity: Literal["iconic", "popular", "lesser_known", "hidden_gem"] = "popular"
    must_visit: bool = Field(
        default=False,
        description="One of Hyderabad's top must-see places",
    )

    # ─── SafeRoute specific ────────────────────────────────────────
    safety_notes: str | None = Field(
        default=None,
        description=(
            "Practical safety info e.g. 'Wear non-slip shoes', "
            "'Avoid solo after sunset', 'Pickpockets common'"
        ),
    )
    accessibility_notes: str | None = Field(
        default=None,
        description=(
            "e.g. 'Wheelchair accessible ground floor only', "
            "'Many uneven steps'"
        ),
    )

    # ─── Description (kept SHORT — facts not prose) ────────────────
    short_description: str = Field(
        ...,
        max_length=280,
        description=(
            "ONE compact factual sentence/two. The LLM uses this + "
            "structured fields to write the user-facing description. "
            "Keep under 280 chars."
        ),
    )
    highlights: list[str] = Field(
        default_factory=list,
        max_length=5,
        description=(
            "3-5 bullet-style highlights, each under 80 chars. "
            "Used by LLM for personalised itinerary text."
        ),
    )

    # ─── Provenance ────────────────────────────────────────────────
    data_sources: list[str] = Field(
        default_factory=lambda: ["manual_curation"],
        description="e.g. ['manual_curation', 'osm_nominatim', 'telangana_tourism']",
    )
    last_verified: str = Field(
        default="2026-01-01",
        description="ISO date when this entry was last manually verified",
    )

    # ─── Validators ────────────────────────────────────────────────

    @field_validator("subcategory", "tags", mode="before")
    @classmethod
    def normalise_strings(cls, v):
        """Lowercase and strip strings/lists of strings."""
        if isinstance(v, str):
            return v.lower().strip()
        if isinstance(v, list):
            return [s.lower().strip() for s in v if isinstance(s, str) and s.strip()]
        return v

    @field_validator("interests", mode="before")
    @classmethod
    def normalise_interests(cls, v):
        if isinstance(v, list):
            return [s.lower().strip() for s in v if isinstance(s, str) and s.strip()]
        return v

    @field_validator("aliases", mode="before")
    @classmethod
    def strip_aliases(cls, v):
        if isinstance(v, list):
            return [s.strip() for s in v if isinstance(s, str) and s.strip()]
        return v


# ---------------------------------------------------------------------------
# Vocabulary loader (used by validator and ingest)
# ---------------------------------------------------------------------------

class Vocabulary(BaseModel):
    """
    Controlled vocabulary loaded from vocabulary.json.
    Used to validate that places only use approved terms.
    """
    categories: list[str]
    subcategories: dict[str, list[str]]  # category → allowed subcategories
    interests: list[str]
    tags: list[str]
    neighborhoods: list[str]
    crowd_levels: list[str]
    weather_preferences: list[str]
    popularity_levels: list[str]

    def validate_place(self, place: Place) -> list[str]:
        """
        Validate a Place against controlled vocabulary.
        Returns list of violation messages (empty if valid).
        """
        errors: list[str] = []

        if place.category not in self.categories:
            errors.append(
                f"Unknown category '{place.category}'. "
                f"Allowed: {self.categories}"
            )

        allowed_subs = self.subcategories.get(place.category, [])
        if place.subcategory not in allowed_subs:
            errors.append(
                f"Unknown subcategory '{place.subcategory}' for category "
                f"'{place.category}'. Allowed: {allowed_subs}"
            )

        for interest in place.interests:
            if interest not in self.interests:
                errors.append(
                    f"Unknown interest '{interest}'. Allowed: {self.interests}"
                )

        for tag in place.tags:
            if tag not in self.tags:
                errors.append(
                    f"Unknown tag '{tag}'. Add to vocabulary or remove."
                )

        if place.neighborhood not in self.neighborhoods:
            errors.append(
                f"Unknown neighborhood '{place.neighborhood}'. "
                f"Add to vocabulary or correct."
            )

        if place.crowd_level not in self.crowd_levels:
            errors.append(f"Unknown crowd_level '{place.crowd_level}'")

        if place.weather_preference not in self.weather_preferences:
            errors.append(
                f"Unknown weather_preference '{place.weather_preference}'"
            )

        if place.popularity not in self.popularity_levels:
            errors.append(f"Unknown popularity '{place.popularity}'")

        return errors