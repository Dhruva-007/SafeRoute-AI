from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Valid interest options
# ---------------------------------------------------------------------------

VALID_INTERESTS = {
    "culture",
    "food",
    "nature",
    "nightlife",
    "shopping",
    "history",
    "photography",
    "adventure",
    "relaxation",
}

VALID_BUDGETS = {"budget", "mid-range", "premium"}


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class TripPlanRequest(BaseModel):
    """
    Validated input for the POST /plan-trip endpoint.
    """

    destination: Literal["Hyderabad"] = Field(
        ...,
        description="Must be 'Hyderabad'. Only Hyderabad is supported.",
    )
    start_date: date = Field(
        ...,
        description="Trip start date in YYYY-MM-DD format.",
    )
    end_date: date = Field(
        ...,
        description="Trip end date in YYYY-MM-DD format.",
    )
    number_of_travelers: int = Field(
        ...,
        ge=1,
        le=50,
        description="Number of travelers. Must be between 1 and 50.",
    )
    budget: str = Field(
        ...,
        description="Budget level: 'budget', 'mid-range', or 'premium'.",
    )
    interests: list[str] = Field(
        ...,
        min_length=1,
        max_length=9,
        description=(
            "List of interests. Valid values: "
            "culture, food, nature, nightlife, shopping, "
            "history, photography, adventure, relaxation."
        ),
    )

    @field_validator("destination", mode="before")
    @classmethod
    def normalise_destination(cls, v: str) -> str:
        if isinstance(v, str) and v.strip().lower() == "hyderabad":
            return "Hyderabad"
        raise ValueError(
            "Only 'Hyderabad' is supported as a destination at this time."
        )

    @field_validator("budget", mode="before")
    @classmethod
    def normalise_budget(cls, v: str) -> str:
        normalised = v.strip().lower()
        if normalised not in VALID_BUDGETS:
            raise ValueError(
                f"Invalid budget '{v}'. "
                f"Must be one of: {', '.join(sorted(VALID_BUDGETS))}."
            )
        return normalised

    @field_validator("interests", mode="before")
    @classmethod
    def normalise_interests(cls, v: list) -> list[str]:
        normalised = [i.strip().lower() for i in v]
        invalid = [i for i in normalised if i not in VALID_INTERESTS]
        if invalid:
            raise ValueError(
                f"Invalid interest(s): {invalid}. "
                f"Valid options: {sorted(VALID_INTERESTS)}."
            )
        return list(dict.fromkeys(normalised))  # deduplicate preserving order

    @model_validator(mode="after")
    def validate_dates(self) -> TripPlanRequest:
        today = date.today()

        if self.start_date < today:
            raise ValueError(
                f"start_date {self.start_date} cannot be in the past."
            )
        if self.end_date < self.start_date:
            raise ValueError(
                "end_date must be on or after start_date."
            )

        trip_days = (self.end_date - self.start_date).days + 1
        if trip_days > 14:
            raise ValueError(
                f"Trip duration cannot exceed 14 days. "
                f"Your trip is {trip_days} days."
            )

        return self

    @property
    def trip_duration_days(self) -> int:
        return (self.end_date - self.start_date).days + 1


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class Activity(BaseModel):
    time: str = Field(..., description="Time slot e.g. '9:00 AM'")
    place: str = Field(..., description="Name of the place")
    description: str = Field(..., description="What to do there")
    estimated_cost: str = Field(
        ..., description="Estimated cost e.g. '₹500 per person'"
    )
    fatigue_score: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Predicted fatigue 0-100",
    )
    fatigue_level: str = Field(
        default="LOW",
        description="Fatigue level: LOW | MEDIUM | HIGH",
    )


class DayPlan(BaseModel):
    day: int = Field(..., description="Day number starting from 1")
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    activities: list[Activity] = Field(
        ..., description="Ordered list of activities for this day"
    )
    day_fatigue_average: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Average fatigue across all activities this day",
    )


class TripPlanResponse(BaseModel):
    summary: str = Field(..., description="Brief overview of the trip")
    destination: str = Field(default="Hyderabad")
    duration_days: int = Field(..., description="Total number of days")
    number_of_travelers: int
    budget_level: str
    estimated_budget: str = Field(
        ...,
        description="Total estimated budget for the trip e.g. '₹15,000 - ₹20,000 per person'",
    )
    interests: list[str]
    days: list[DayPlan]