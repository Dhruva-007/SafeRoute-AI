"""
ModelManager
============
Phase 1 — XGBoost Model Loading Layer

Responsibilities:
    - Load the fatigue_model.json from disk exactly once
    - Cache the loaded Booster in memory
    - Rescale raw model output to 0-100 fatigue score
    - Expose a thread-safe predict() interface
    - Provide health check capability
    - Follow the singleton pattern used throughout this codebase

OUTPUT CALIBRATION
==================
The model outputs raw regression values in the range [-73, -41].
The scale is inverted: more negative = LESS fatigued.

Calibration was determined empirically by scanning the full feature
space and identifying the true min/max of the model's output range:

    raw_floor = -73.0  → fatigue score   0  (complete rest)
    raw_ceil  = -41.0  → fatigue score 100  (peak exertion)

Rescaling formula:
    score = clip((raw - raw_floor) / (raw_ceil - raw_floor) * 100, 0, 100)

The model's best discriminating range is 0-12km total distance.
Beyond 12km the raw output becomes non-monotonic due to training data
characteristics (GPS tracks where high cumulative distance correlated
with rest periods). The feature_builder caps total_distance at 12km
to keep predictions in the calibrated zone.

THRESHOLD CALIBRATION
=====================
Thresholds were calibrated against real tourist scenario outputs:

    score=2   (1km, 9am, 28°C)   → LOW    ✓
    score=25  (3km, 11am, 32°C)  → LOW    ✓
    score=67  (4km, 11am, 30°C)  → MEDIUM ✓
    score=80  (8km, 15pm, 32°C)  → HIGH   ✓

    LOW    : score <  35
    MEDIUM : score <  70
    HIGH   : score >= 70

Feature order (MUST match training — XGBoost is order-sensitive):
    0  latitude              float
    1  longitude             float
    2  elevation             float
    3  hour                  int
    4  temperature_c         float
    5  group_size            int
    6  dist_delta_km         float
    7  total distance        float
    8  total_elevation_gain  float
    9  time_delta_seconds    float
    10 speed_kmh             float
    11 grade                 float
    12 terrain               categorical (treated as numeric by model)

Valid terrain values (model treats as integers 0-5):
    0 = "Extreme Mountain"
    1 = "Highway"
    2 = "Hilly"
    3 = "Steep Mountain"
    4 = "Trail"
    5 = "Urban"
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

import pandas as pd
import xgboost as xgb

from config.settings import get_settings

logger = logging.getLogger(__name__)

# ─── Feature column names — order MUST match model training ──────────────────

FEATURE_COLUMNS: list[str] = [
    "latitude",
    "longitude",
    "elevation",
    "hour",
    "temperature_c",
    "group_size",
    "dist_delta_km",
    "total distance",
    "total_elevation_gain",
    "time_delta_seconds",
    "speed_kmh",
    "grade",
    "terrain",
]

# ─── Terrain integer encoding ─────────────────────────────────────────────────
# Diagnostic confirmed: string categorical, integer, and plain numeric all
# produce identical predictions. Model uses integer codes internally.

TERRAIN_INT_MAP: dict[str, int] = {
    "Extreme Mountain": 0,
    "Highway":          1,
    "Hilly":            2,
    "Steep Mountain":   3,
    "Trail":            4,
    "Urban":            5,
}

VALID_TERRAIN_CATEGORIES: list[str] = list(TERRAIN_INT_MAP.keys())

# ─── Output calibration constants ────────────────────────────────────────────
# Determined by calibrate_model.py empirical scan of full feature space.
#
# raw_floor: model output at complete rest  → fatigue score 0
# raw_ceil:  model output at peak exertion  → fatigue score 100
#
# The raw scale is inverted: more negative = less fatigued.

RAW_OUTPUT_FLOOR = -73.0    # maps to fatigue score   0
RAW_OUTPUT_CEIL  = -41.0    # maps to fatigue score 100
RAW_OUTPUT_RANGE = RAW_OUTPUT_CEIL - RAW_OUTPUT_FLOOR   # 32.0

# ─── Fatigue level thresholds (on rescaled 0-100 scale) ──────────────────────
# Calibrated against real tourist scenario outputs.
# See module docstring for the scenario matrix used.

FATIGUE_LEVEL_LOW_MAX    = 35.0   # score <  35 → LOW
FATIGUE_LEVEL_MEDIUM_MAX = 70.0   # score <  70 → MEDIUM  ← calibrated from 65
                                   # score >= 70 → HIGH


class ModelNotLoadedError(RuntimeError):
    """Raised when prediction is attempted before model is loaded."""


class ModelManager:
    """
    Singleton XGBoost model loader and predictor.

    Usage:
        manager = get_model_manager()
        result  = manager.predict(feature_dict)

    Thread safety:
        Model loading is protected by a threading.Lock.
        Inference (xgb.Booster.predict) is thread-safe after loading.
    """

    def __init__(self, model_path: str) -> None:
        self._model_path  = Path(model_path)
        self._booster: xgb.Booster | None = None
        self._lock        = threading.Lock()
        self._loaded      = False
        self._load_error: str | None = None

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    def load(self) -> None:
        """
        Load the XGBoost model from disk into memory.

        Called once during application startup (lifespan).
        Subsequent calls are no-ops if the model is already loaded.

        Raises:
            FileNotFoundError: Model file does not exist.
            RuntimeError:      Model loading failed for any reason.
        """
        with self._lock:
            if self._loaded:
                logger.debug("ModelManager: model already loaded, skipping.")
                return

            logger.info(
                "ModelManager: loading XGBoost fatigue model from %s",
                self._model_path,
            )

            if not self._model_path.exists():
                msg = (
                    f"Fatigue model file not found: {self._model_path}\n"
                    "Place fatigue_model.json in backend/ml_models/ and restart."
                )
                self._load_error = msg
                logger.error(msg)
                raise FileNotFoundError(msg)

            try:
                booster = xgb.Booster()
                booster.load_model(str(self._model_path))

                model_features = booster.feature_names
                if model_features != FEATURE_COLUMNS:
                    logger.warning(
                        "ModelManager: model feature names differ from expected.\n"
                        "  Expected : %s\n"
                        "  Got      : %s",
                        FEATURE_COLUMNS,
                        model_features,
                    )

                self._booster = booster
                self._loaded  = True

                logger.info(
                    "ModelManager: model loaded | trees=%d | features=%d | "
                    "calibration=[%.1f, %.1f] → [0, 100] | "
                    "thresholds=[LOW<%.0f, MEDIUM<%.0f, HIGH>=%.0f]",
                    booster.num_boosted_rounds(),
                    len(FEATURE_COLUMNS),
                    RAW_OUTPUT_FLOOR,
                    RAW_OUTPUT_CEIL,
                    FATIGUE_LEVEL_LOW_MAX,
                    FATIGUE_LEVEL_MEDIUM_MAX,
                    FATIGUE_LEVEL_MEDIUM_MAX,
                )

            except Exception as exc:
                self._load_error = str(exc)
                logger.exception(
                    "ModelManager: failed to load model: %s", exc
                )
                raise RuntimeError(
                    f"Failed to load fatigue model: {exc}"
                ) from exc

    def predict(self, features: dict[str, Any]) -> dict[str, Any]:
        """
        Run inference on a single feature dictionary.

        Args:
            features: Dict with keys matching FEATURE_COLUMNS.
                      'terrain' should be one of VALID_TERRAIN_CATEGORIES
                      or an integer 0-5.

        Returns:
            {
                "score":      float,  # rescaled 0-100 (continuous)
                "score_int":  int,    # rounded 0-100
                "level":      str,    # "LOW" | "MEDIUM" | "HIGH"
                "confidence": float,  # 0.0-1.0
                "raw":        float,  # raw model output (for debugging)
            }

        Raises:
            ModelNotLoadedError: Model has not been loaded.
            ValueError:          Features are malformed.
        """
        if not self._loaded or self._booster is None:
            raise ModelNotLoadedError(
                "Fatigue model is not loaded. "
                "Check startup logs for loading errors."
            )

        dmatrix    = self._build_dmatrix(features)
        raw_output = self._booster.predict(dmatrix)
        raw_score  = float(raw_output[0])

        score_float   = self._rescale_raw_output(raw_score)
        score_clamped = max(0.0, min(100.0, score_float))
        score_int     = int(round(score_clamped))
        level         = self._score_to_level(score_clamped)
        confidence    = self._compute_confidence(score_clamped)

        logger.debug(
            "ModelManager.predict | raw=%.3f | rescaled=%.1f | "
            "score=%d | level=%s | confidence=%.2f",
            raw_score,
            score_float,
            score_int,
            level,
            confidence,
        )

        return {
            "score":      score_clamped,
            "score_int":  score_int,
            "level":      level,
            "confidence": confidence,
            "raw":        raw_score,
        }

    def health_check(self) -> dict[str, Any]:
        """
        Verify the model can produce predictions with synthetic input.
        Returns a health status dict suitable for /health endpoints.
        """
        if not self._loaded:
            return {
                "status": "not_loaded",
                "error":  self._load_error or "Model not loaded",
                "model":  str(self._model_path.name),
            }

        try:
            # Synthetic tourist scenario: 3km walked, 32°C, hour 11
            # Expected: LOW-MEDIUM range (score ~25)
            test_features = {
                "latitude":             17.3850,
                "longitude":            78.4867,
                "elevation":            542.0,
                "hour":                 11,
                "temperature_c":        32.0,
                "group_size":           2,
                "dist_delta_km":        0.05,
                "total distance":       3.0,
                "total_elevation_gain": 30.0,
                "time_delta_seconds":   30.0,
                "speed_kmh":            3.5,
                "grade":                0.5,
                "terrain":              5,    # Urban
            }
            result = self.predict(test_features)

            return {
                "status":     "ok",
                "model":      str(self._model_path.name),
                "test_score": result["score_int"],
                "test_level": result["level"],
                "test_raw":   round(result["raw"], 4),
                "trees":      self._booster.num_boosted_rounds(),
                "features":   len(FEATURE_COLUMNS),
                "calibration": {
                    "raw_floor":  RAW_OUTPUT_FLOOR,
                    "raw_ceil":   RAW_OUTPUT_CEIL,
                    "raw_range":  RAW_OUTPUT_RANGE,
                },
                "thresholds": {
                    "low_max":    FATIGUE_LEVEL_LOW_MAX,
                    "medium_max": FATIGUE_LEVEL_MEDIUM_MAX,
                },
            }
        except Exception as exc:
            return {
                "status": "error",
                "error":  str(exc),
                "model":  str(self._model_path.name),
            }

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    # ─────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _build_dmatrix(self, features: dict[str, Any]) -> xgb.DMatrix:
        """
        Build an XGBoost DMatrix from a feature dictionary.

        Terrain is passed as a float integer (0.0-5.0). The diagnostic
        confirmed that string categorical, integer, and plain numeric all
        produce identical predictions — the model uses integer codes
        internally regardless of how they are passed.

        Column order is enforced to match FEATURE_COLUMNS exactly.
        """
        # Resolve terrain to integer
        terrain_raw = features.get("terrain", "Urban")
        if isinstance(terrain_raw, str):
            terrain_int = TERRAIN_INT_MAP.get(terrain_raw, 5)  # Urban default
        else:
            try:
                terrain_int = int(float(terrain_raw))
                terrain_int = max(0, min(5, terrain_int))
            except (TypeError, ValueError):
                terrain_int = 5

        # Build ordered row
        row: dict[str, Any] = {}
        for col in FEATURE_COLUMNS:
            if col == "terrain":
                row[col] = float(terrain_int)
            else:
                row[col] = features.get(col, 0.0)

        df = pd.DataFrame([row], columns=FEATURE_COLUMNS)

        for col in FEATURE_COLUMNS:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)

        return xgb.DMatrix(df)

    @staticmethod
    def _rescale_raw_output(raw: float) -> float:
        """
        Rescale raw model output from native range to 0-100 fatigue score.

        Native range : [RAW_OUTPUT_FLOOR, RAW_OUTPUT_CEIL] = [-73.0, -41.0]
        Output range : [0, 100]

        The raw scale is inverted (more negative = less fatigued).
        This rescaling normalises and corrects the inversion simultaneously.

        Values outside the calibrated range are allowed to float beyond
        [0, 100] briefly — the caller clamps the final result.
        """
        if RAW_OUTPUT_RANGE == 0:
            return 0.0
        return (raw - RAW_OUTPUT_FLOOR) / RAW_OUTPUT_RANGE * 100.0

    @staticmethod
    def _score_to_level(score: float) -> str:
        """Map rescaled 0-100 score to fatigue level label."""
        if score < FATIGUE_LEVEL_LOW_MAX:
            return "LOW"
        if score < FATIGUE_LEVEL_MEDIUM_MAX:
            return "MEDIUM"
        return "HIGH"

    @staticmethod
    def _compute_confidence(score: float) -> float:
        """
        Derive confidence (0.0-1.0) from distance to nearest threshold.

        High confidence = score is deep within its level's range.
        Low confidence  = score is near a threshold boundary.

        Boundaries: 0, 35, 70, 100
        Max internal distance within any zone ≈ 17.5 points.
        Normalised against 17 so full zone centre = 1.0.
        """
        boundaries = [0.0, FATIGUE_LEVEL_LOW_MAX, FATIGUE_LEVEL_MEDIUM_MAX, 100.0]
        distances  = [abs(score - b) for b in boundaries]
        min_dist   = min(distances)
        confidence = min(1.0, min_dist / 17.0)
        return round(confidence, 3)


# ─── Singleton ────────────────────────────────────────────────────────────────

_model_manager: ModelManager | None = None


def get_model_manager() -> ModelManager:
    """
    Return the application-wide ModelManager singleton.

    Created on first call and reused thereafter.
    model.load() must be called separately during app startup.
    """
    global _model_manager
    if _model_manager is None:
        settings      = get_settings()
        _model_manager = ModelManager(model_path=settings.fatigue_model_path)
    return _model_manager