"""
Feature Engineering Pipeline
==============================
Phase 2 — Feature Builder for XGBoost Live Fatigue Prediction

Transforms raw live travel metrics into the exact 13-feature vector
required by the XGBoost model.

CALIBRATION NOTES
=================
Based on empirical calibration (calibrate_model.py):

1. total_distance is capped at 12km (MAX_EFFECTIVE_DISTANCE_KM).
   The model's raw output is non-monotonic beyond 8-12km due to training
   data characteristics. Beyond 12km, predictions degrade. Capping keeps
   features in the model's calibrated zone and lets hour/temperature/speed
   continue driving the score for long sessions.

2. temperature_c is capped at 32°C (MAX_EFFECTIVE_TEMPERATURE_C).
   The calibration scan confirmed identical raw output for 32°C, 35°C,
   38°C, 42°C, and 45°C. The model was not trained on meaningful variation
   above 32°C. Capping prevents sending out-of-distribution values.

3. terrain is passed as a string matching VALID_TERRAIN_CATEGORIES.
   The model_manager converts it to an integer internally.

Feature definitions (training order — MUST NOT be changed):
    0  latitude              float  GPS latitude (decimal degrees)
    1  longitude             float  GPS longitude (decimal degrees)
    2  elevation             float  Elevation above sea level (metres)
    3  hour                  int    Local hour of day (0-23)
    4  temperature_c         float  Ambient temperature °C (capped at 32)
    5  group_size            int    Number of travellers (1-50)
    6  dist_delta_km         float  Distance since last GPS update (km)
    7  total distance        float  Total distance walked in session (km, capped at 12)
    8  total_elevation_gain  float  Cumulative elevation gain (metres)
    9  time_delta_seconds    float  Seconds since last GPS update
    10 speed_kmh             float  Instantaneous speed (km/h)
    11 grade                 float  Slope grade (% — rise/run × 100)
    12 terrain               str    Terrain category (converted to int by ModelManager)
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ─── Physical constraint constants ────────────────────────────────────────────

MAX_REALISTIC_SPEED_KMH   = 25.0    # Walking/slow jog max
MAX_REALISTIC_GRADE_PCT   = 60.0    # Extreme slope cap
MAX_SESSION_DISTANCE_KM   = 50.0    # Hard sanity cap (UI display)
MAX_ELEVATION_GAIN_M      = 2000.0  # Session elevation gain cap
MIN_TEMPERATURE_C         = -20.0
MAX_TEMPERATURE_C         = 55.0    # Hard sanity cap

# ─── Calibration-derived feature caps ────────────────────────────────────────
# These caps keep features within the model's calibrated prediction zone.
# See module docstring for full explanation.

MAX_EFFECTIVE_DISTANCE_KM    = 12.0  # Model is non-monotonic beyond this
MAX_EFFECTIVE_TEMPERATURE_C  = 32.0  # Model plateaus above this (confirmed)

# ─── Terrain thresholds for auto-inference ────────────────────────────────────

TERRAIN_GRADE_EXTREME     = 20.0    # grade% → Extreme Mountain
TERRAIN_GRADE_STEEP       = 12.0    # grade% → Steep Mountain
TERRAIN_GRADE_HILLY       = 6.0     # grade% → Hilly
TERRAIN_SPEED_HIGHWAY     = 30.0    # kmh    → Highway
TERRAIN_SPEED_TRAIL       = 6.0     # kmh walking threshold → Trail vs Urban

VALID_TERRAIN_CATEGORIES: set[str] = {
    "Urban",
    "Highway",
    "Hilly",
    "Trail",
    "Steep Mountain",
    "Extreme Mountain",
}


# ─── Data classes ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FeatureVector:
    """
    Validated, model-ready feature vector for one prediction.

    All values have been sanity-checked, clamped, and calibration-capped.
    This is what gets passed to ModelManager.predict().
    """
    latitude:             float
    longitude:            float
    elevation:            float
    hour:                 int
    temperature_c:        float
    group_size:           int
    dist_delta_km:        float
    total_distance:       float
    total_elevation_gain: float
    time_delta_seconds:   float
    speed_kmh:            float
    grade:                float
    terrain:              str

    def to_dict(self) -> dict[str, Any]:
        """
        Convert to dict with exact column names the model expects.

        Note: 'total distance' has a space — this matches training exactly.
        """
        return {
            "latitude":             self.latitude,
            "longitude":            self.longitude,
            "elevation":            self.elevation,
            "hour":                 self.hour,
            "temperature_c":        self.temperature_c,
            "group_size":           self.group_size,
            "dist_delta_km":        self.dist_delta_km,
            "total distance":       self.total_distance,
            "total_elevation_gain": self.total_elevation_gain,
            "time_delta_seconds":   self.time_delta_seconds,
            "speed_kmh":            self.speed_kmh,
            "grade":                self.grade,
            "terrain":              self.terrain,
        }


@dataclass
class RawLiveMetrics:
    """
    Raw metrics as received from the client in a live prediction request.

    All fields are optional — missing values get safe defaults.
    The client is responsible for accumulating session totals.
    """
    # GPS position
    latitude:             float = 17.3850    # Hyderabad default
    longitude:            float = 78.4867
    elevation:            float = 542.0      # Hyderabad avg elevation

    # Time
    hour:                 int | None = None  # Derived from UTC now if None

    # Environment
    temperature_c:        float = 28.0

    # Group
    group_size:           int = 1

    # Movement — per-update deltas
    dist_delta_km:        float = 0.0
    time_delta_seconds:   float = 30.0

    # Session totals — accumulated by client
    total_distance_km:    float = 0.0
    total_elevation_gain: float = 0.0

    # Derived movement
    speed_kmh:            float | None = None  # Computed from deltas if None
    grade:                float = 0.0

    # Terrain — inferred if not provided
    terrain:              str | None = None

    # Metadata
    session_start_iso:    str | None = None


# ─── Builder ──────────────────────────────────────────────────────────────────

class FatigueFeatureBuilder:
    """
    Transforms RawLiveMetrics into a validated FeatureVector.

    Usage:
        builder = FatigueFeatureBuilder()
        vector  = builder.build(raw_metrics)
        result  = model_manager.predict(vector.to_dict())
    """

    def build(self, raw: RawLiveMetrics) -> FeatureVector:
        """
        Build and validate a FeatureVector from raw live metrics.

        Steps:
            1. Resolve any None/missing values with safe defaults
            2. Compute derived features (speed if not provided)
            3. Infer terrain if not explicitly provided
            4. Apply physical sanity clamps
            5. Apply calibration caps (distance, temperature)
            6. Return immutable FeatureVector

        Args:
            raw: RawLiveMetrics from the API request

        Returns:
            FeatureVector ready for model inference
        """
        # ── Step 1: Resolve hour ──────────────────────────────────────
        hour = self._resolve_hour(raw.hour)

        # ── Step 2: Compute speed from deltas if not provided ─────────
        speed_kmh = self._resolve_speed(
            raw.speed_kmh,
            raw.dist_delta_km,
            raw.time_delta_seconds,
        )

        # ── Step 3: Infer terrain ─────────────────────────────────────
        terrain = self._resolve_terrain(raw.terrain, raw.grade, speed_kmh)

        # ── Step 4: Physical sanity clamps ────────────────────────────
        latitude             = self._clamp(raw.latitude, -90.0, 90.0)
        longitude            = self._clamp(raw.longitude, -180.0, 180.0)
        elevation            = self._clamp(raw.elevation, -500.0, 8850.0)
        temperature_c_raw    = self._clamp(
            raw.temperature_c, MIN_TEMPERATURE_C, MAX_TEMPERATURE_C
        )
        group_size           = max(1, min(50, int(raw.group_size)))
        dist_delta_km        = self._clamp(raw.dist_delta_km, 0.0, 5.0)
        total_distance_raw   = self._clamp(
            raw.total_distance_km, 0.0, MAX_SESSION_DISTANCE_KM
        )
        total_elevation_gain = self._clamp(
            raw.total_elevation_gain, 0.0, MAX_ELEVATION_GAIN_M
        )
        time_delta_seconds   = self._clamp(raw.time_delta_seconds, 0.0, 3600.0)
        speed_kmh_clamped    = self._clamp(speed_kmh, 0.0, MAX_REALISTIC_SPEED_KMH)
        grade                = self._clamp(
            raw.grade, -MAX_REALISTIC_GRADE_PCT, MAX_REALISTIC_GRADE_PCT
        )

        # ── Step 5: Calibration caps ──────────────────────────────────
        # Cap total_distance to keep model in calibrated prediction zone.
        # Beyond 12km the model's raw output becomes non-monotonic.
        total_distance_capped = min(total_distance_raw, MAX_EFFECTIVE_DISTANCE_KM)

        # Cap temperature — model plateaus at 32°C (confirmed by calibration).
        # Values above 32°C produce identical raw output, so capping is exact.
        temperature_c_capped = min(temperature_c_raw, MAX_EFFECTIVE_TEMPERATURE_C)

        vector = FeatureVector(
            latitude=round(latitude, 6),
            longitude=round(longitude, 6),
            elevation=round(elevation, 1),
            hour=int(hour),
            temperature_c=round(temperature_c_capped, 1),
            group_size=int(group_size),
            dist_delta_km=round(dist_delta_km, 4),
            total_distance=round(total_distance_capped, 4),
            total_elevation_gain=round(total_elevation_gain, 1),
            time_delta_seconds=round(time_delta_seconds, 1),
            speed_kmh=round(speed_kmh_clamped, 2),
            grade=round(grade, 2),
            terrain=terrain,
        )

        logger.debug(
            "FeatureBuilder.build | "
            "speed=%.2f kmh | grade=%.1f%% | terrain=%s | "
            "total_dist_raw=%.3f km | total_dist_capped=%.3f km | "
            "temp_raw=%.1f°C | temp_capped=%.1f°C | "
            "elev_gain=%.0f m | hour=%d",
            vector.speed_kmh,
            vector.grade,
            vector.terrain,
            total_distance_raw,
            total_distance_capped,
            temperature_c_raw,
            temperature_c_capped,
            vector.total_elevation_gain,
            vector.hour,
        )

        return vector

    # ─────────────────────────────────────────────────────────────────────────
    # Private resolution methods
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _resolve_hour(hour: int | None) -> int:
        """Use provided hour, or derive from current UTC time."""
        if hour is not None:
            return max(0, min(23, int(hour)))
        return datetime.now(timezone.utc).hour

    @staticmethod
    def _resolve_speed(
        speed_kmh: float | None,
        dist_delta_km: float,
        time_delta_seconds: float,
    ) -> float:
        """
        Use provided speed if available.
        Otherwise compute from distance and time deltas.
        Falls back to 0.0 if time_delta is zero.
        """
        if speed_kmh is not None and speed_kmh >= 0.0:
            return float(speed_kmh)
        if time_delta_seconds > 0.0:
            return dist_delta_km / (time_delta_seconds / 3600.0)
        return 0.0

    @staticmethod
    def _resolve_terrain(
        terrain: str | None,
        grade: float,
        speed_kmh: float,
    ) -> str:
        """
        Resolve terrain category string.

        Priority:
            1. Explicit terrain string from client (if valid)
            2. Inferred from grade percentage
            3. Inferred from speed
            4. Default: "Urban"
        """
        if terrain and terrain in VALID_TERRAIN_CATEGORIES:
            return terrain

        abs_grade = abs(grade)

        if abs_grade >= TERRAIN_GRADE_EXTREME:
            return "Extreme Mountain"
        if abs_grade >= TERRAIN_GRADE_STEEP:
            return "Steep Mountain"
        if abs_grade >= TERRAIN_GRADE_HILLY:
            return "Hilly"
        if speed_kmh >= TERRAIN_SPEED_HIGHWAY:
            return "Highway"
        if 0 < speed_kmh <= TERRAIN_SPEED_TRAIL:
            return "Trail"

        return "Urban"

    @staticmethod
    def _clamp(value: float, min_val: float, max_val: float) -> float:
        """Clamp a float to [min_val, max_val]. Handles NaN and Inf."""
        try:
            v = float(value)
            if math.isnan(v) or math.isinf(v):
                return min_val
            return max(min_val, min(max_val, v))
        except (TypeError, ValueError):
            return min_val


# ─── Singleton ────────────────────────────────────────────────────────────────

_feature_builder: FatigueFeatureBuilder | None = None


def get_feature_builder() -> FatigueFeatureBuilder:
    global _feature_builder
    if _feature_builder is None:
        _feature_builder = FatigueFeatureBuilder()
    return _feature_builder