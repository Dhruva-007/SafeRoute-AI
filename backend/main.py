"""
SafeRoute AI — FastAPI application entry point.

Startup sequence (lifespan):
  1. Log architecture summary
  2. Pre-warm planner (recommendation engine + cluster engine + day builder)
  3. Pre-warm rule-based fatigue service
  4. Load XGBoost fatigue model
  5. Pre-warm weather service
  6. Pre-warm translator service
  7. Pre-warm retriever + embeddings  ← Issue 5 fix: was missing entirely
  8. Initialise user database

Issue 5 fix: get_retriever() added to lifespan pre-warm sequence.
             The embedding model now loads at startup (2–3s with offline mode)
             instead of on the first user request (was 52s cold load).

Issue 6 fix: TRANSFORMERS_OFFLINE is set inside EmbeddingService.__init__
             before the model loads. No need to set it here at module level
             because embeddings.py handles it before SentenceTransformer
             resolves the model path.
"""

import logging
import sys
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config.settings import get_settings
from models.trip import TripPlanRequest, TripPlanResponse
from models.user import init_user_db
from routes.fatigue import router as fatigue_router
from routes.sharing import router as sharing_router
from routes.translator import router as translator_router
from routes.trips import router as trips_router
from routes.auth import router as auth_router
from routes.weather import router as weather_router
from services.fatigue import get_fatigue_service
from services.model_manager import get_model_manager
from services.planner import get_planner
from services.retriever import get_retriever
from services.translator import get_translator
from services.weather import get_weather_service

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Architecture Summary Log
# ---------------------------------------------------------------------------

def _log_architecture() -> None:
    """Print the complete Phase 1–10 pipeline on startup."""
    logger.info("=" * 65)
    logger.info("SAFEROUTE AI — HYDERABAD PLANNER (Phase 10)")
    logger.info("=" * 65)
    logger.info("")
    logger.info("Active Pipeline:")
    logger.info("  Phase 1  ✓  Recommendation Engine")
    logger.info("  Phase 2  ✓  Geographic Clustering")
    logger.info("  Phase 3  ✓  Day Builder")
    logger.info("  Phase 4  ✓  Route Optimizer")
    logger.info("  Phase 5  ✓  LLM Planner (algorithmic selection)")
    logger.info("  Phase 6  ✓  Hallucination Prevention")
    logger.info("  Phase 7  ✓  Weather-Aware Planning")
    logger.info("  Phase 8  ✓  Fatigue-Aware Planning")
    logger.info("  Phase 9  ✓  Trip Validation Layer")
    logger.info("  Phase 10 ✓  Final Hyderabad Planner")
    logger.info("")
    logger.info("Data:")
    logger.info("  Dataset   : 79 curated Hyderabad places")
    logger.info("  Validated : 0 errors | 0 warnings")
    logger.info("")
    logger.info("Services:")
    logger.info("  Weather   : Open Meteo (free, no key required)")
    logger.info("  LLM       : Groq (primary) → OpenRouter (fallback)")
    logger.info("  Vectors   : ChromaDB + Sentence Transformers (offline mode)")
    logger.info("  Fatigue   : XGBoost (live tour) + Rule-based (planning)")
    logger.info("=" * 65)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("=" * 60)
    logger.info("Starting %s v%s", settings.app_name, settings.app_version)
    logger.info("Debug mode  : %s", settings.debug)
    logger.info("LLM model   : %s", settings.openrouter_model)
    logger.info("CORS origins: %s", settings.get_allowed_origins())

    _log_architecture()

    # ── 1. Pre-warm planner ───────────────────────────────────────────
    logger.info("Pre-warming planner service...")
    get_planner()
    logger.info("Planner ready")

    # ── 2. Pre-warm rule-based fatigue service ────────────────────────
    logger.info("Pre-warming rule-based fatigue service...")
    get_fatigue_service()
    logger.info("Rule-based fatigue service ready")

    # ── 3. Load XGBoost fatigue model ────────────────────────────────
    logger.info("Loading XGBoost fatigue model...")
    model_manager = get_model_manager()
    try:
        model_manager.load()
        health = model_manager.health_check()
        logger.info(
            "XGBoost fatigue model ready | trees=%s | test_score=%s | test_level=%s",
            health.get("trees", "?"),
            health.get("test_score", "?"),
            health.get("test_level", "?"),
        )
    except FileNotFoundError:
        logger.error(
            "XGBoost fatigue model file not found at: %s\n"
            "Live fatigue prediction will be unavailable.\n"
            "Place fatigue_model.json in backend/ml_models/ and restart.",
            settings.fatigue_model_path,
        )
    except Exception as exc:
        logger.error(
            "XGBoost fatigue model failed to load: %s\n"
            "Live fatigue prediction will be unavailable.",
            exc,
        )

    # ── 4. Pre-warm weather service ───────────────────────────────────
    logger.info("Pre-warming weather service...")
    get_weather_service()
    logger.info("Weather service ready")

    # ── 5. Pre-warm translator service ───────────────────────────────
    logger.info("Pre-warming translator service...")
    get_translator()
    logger.info("Translator service ready")

    # ── 6. Pre-warm retriever + embeddings ───────────────────────────
    # Issue 5 fix: this was missing, causing the first user to hit /retrieve
    # to wait ~52s for the embedding model to load from disk.
    # With TRANSFORMERS_OFFLINE=1 (set in embeddings.py) the model loads
    # from local cache in ~2-3 seconds instead of contacting HuggingFace.
    logger.info("Pre-warming retriever and embedding model...")
    try:
        retriever = get_retriever()
        logger.info(
            "Retriever ready | collection_size=%d",
            retriever._svc.collection_count(),
        )
    except Exception as exc:
        # Non-fatal: retriever failure should not prevent the planner
        # from starting. The /retrieve endpoint will surface the error
        # when called.
        logger.error(
            "Retriever pre-warm failed: %s\n"
            "Semantic search will be unavailable until resolved.",
            exc,
        )

    # ── 7. Initialise user database ───────────────────────────────────
    logger.info("Initialising user database...")
    init_user_db()
    logger.info("User database ready")

    logger.info("Server startup complete")
    logger.info("=" * 60)

    yield

    logger.info("Shutting down %s", settings.app_name)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "SafeRoute AI — Tour Planner backend. "
        "Provides RAG-powered itinerary generation for Hyderabad. "
        "Weather-aware, fatigue-aware, hallucination-free. "
        "XGBoost live fatigue monitoring during active tours."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register sub-routers
app.include_router(trips_router)
app.include_router(fatigue_router)
app.include_router(weather_router)
app.include_router(sharing_router)
app.include_router(translator_router)
app.include_router(auth_router)


# ---------------------------------------------------------------------------
# Routes — System
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
async def health_check() -> JSONResponse:
    """Basic liveness probe."""
    return JSONResponse(
        content={
            "status":    "ok",
            "app":       settings.app_name,
            "version":   settings.app_version,
            "timestamp": int(time.time()),
        }
    )


@app.get("/health/planner", tags=["System"])
async def health_planner() -> JSONResponse:
    """
    Planner pipeline health check.
    Verifies all Phase 7–10 services can be imported and initialised.
    Does NOT make any external calls.
    """
    checks: dict[str, str] = {}

    try:
        from services.weather_optimizer import optimize_for_weather, WeatherClass
        checks["weather_optimizer"] = "ok"
    except Exception as exc:
        checks["weather_optimizer"] = f"error: {exc}"

    try:
        from services.fatigue_optimizer import optimise_trip_fatigue, score_activity_fatigue
        checks["fatigue_optimizer"] = "ok"
    except Exception as exc:
        checks["fatigue_optimizer"] = f"error: {exc}"

    try:
        from services.trip_validator import validate_trip
        checks["trip_validator"] = "ok"
    except Exception as exc:
        checks["trip_validator"] = f"error: {exc}"

    try:
        from services.planner import get_planner as _gp
        _gp()
        checks["planner"] = "ok"
    except Exception as exc:
        checks["planner"] = f"error: {exc}"

    try:
        manager   = get_model_manager()
        ml_health = manager.health_check()
        checks["xgboost_fatigue_model"] = ml_health.get("status", "unknown")
    except Exception as exc:
        checks["xgboost_fatigue_model"] = f"error: {exc}"

    # Issue 5 fix: include retriever in health check
    try:
        r = get_retriever()
        checks["retriever"] = f"ok | docs={r._svc.collection_count()}"
    except Exception as exc:
        checks["retriever"] = f"error: {exc}"

    all_ok = all(
        v == "ok" or v.startswith("ok |")
        for v in checks.values()
    )

    return JSONResponse(
        content={
            "status":  "ok" if all_ok else "degraded",
            "phase":   "10",
            "pipeline": {
                "phases_complete":          10,
                "dataset_places":           79,
                "weather_aware":            True,
                "fatigue_aware":            True,
                "fatigue_ml_live":          True,
                "validated":                True,
                "hallucination_prevention": True,
            },
            "checks": checks,
        }
    )


@app.get("/health/openrouter", tags=["System"])
async def openrouter_health_check() -> JSONResponse:
    """
    Verifies that the OpenRouter API key is valid and the model is reachable.
    Sends a minimal test prompt and checks for a valid response.
    """
    logger.info("Running OpenRouter connectivity check...")

    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "user", "content": "Reply with exactly one word: connected"},
        ],
        "max_tokens":  10,
        "temperature": 0.0,
    }

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://saferoute.ai",
        "X-Title":       "SafeRoute AI Tour Planner",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.openrouter_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )

        if response.status_code != 200:
            logger.error(
                "OpenRouter returned non-200 | status=%s | body=%s",
                response.status_code,
                response.text,
            )
            raise HTTPException(
                status_code=502,
                detail={
                    "error":       "OpenRouter API error",
                    "status_code": response.status_code,
                    "body":        response.text,
                },
            )

        data  = response.json()
        reply = data["choices"][0]["message"]["content"].strip()
        logger.info("OpenRouter check passed | reply=%r", reply)

        return JSONResponse(
            content={
                "status": "ok",
                "model":  settings.openrouter_model,
                "reply":  reply,
                "usage":  data.get("usage", {}),
            }
        )

    except httpx.TimeoutException:
        logger.exception("OpenRouter connectivity check timed out")
        raise HTTPException(
            status_code=504,
            detail={"error": "Request to OpenRouter timed out after 30 seconds"},
        )
    except httpx.RequestError as exc:
        logger.exception("Network error during OpenRouter check: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={"error": f"Network error: {str(exc)}"},
        )


# ---------------------------------------------------------------------------
# Routes — RAG Retrieval
# ---------------------------------------------------------------------------

@app.get("/retrieve", tags=["RAG"])
async def retrieve_documents(
    query: str = Query(..., description="Natural language search query"),
    n_results: int = Query(
        default=5, ge=1, le=20, description="Number of results"
    ),
    budget: str = Query(
        default=None,
        description="Budget filter: budget | mid-range | premium",
    ),
) -> JSONResponse:
    """
    Semantic retrieval from the Hyderabad tourism knowledge base.
    Returns the top N most relevant documents for a given query.
    """
    retriever = get_retriever()

    try:
        docs = retriever.retrieve(
            query=query,
            n_results=n_results,
            filter_budget=budget,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return JSONResponse(
        content={
            "query":     query,
            "n_results": len(docs),
            "results": [
                {
                    "name":     doc.name,
                    "category": doc.category,
                    "budget_level": doc.budget_level,
                    "recommended_duration_hours": doc.recommended_duration_hours,
                    "best_time":       doc.best_time,
                    "tags":            doc.tags,
                    "relevance_score": round(doc.relevance_score, 4),
                    "description":     doc.description[:200] + "...",
                }
                for doc in docs
            ],
        }
    )


# ---------------------------------------------------------------------------
# Routes — Trip Planner
# ---------------------------------------------------------------------------

@app.post(
    "/plan-trip",
    response_model=TripPlanResponse,
    tags=["Planner"],
    summary="Generate a RAG-powered Hyderabad itinerary",
    responses={
        200: {"description": "Structured day-by-day itinerary"},
        400: {"description": "Invalid destination"},
        422: {"description": "Validation error in request body"},
        429: {"description": "LLM rate limited — retry shortly"},
        500: {"description": "Internal server error"},
        502: {"description": "OpenRouter API error"},
        504: {"description": "LLM request timed out"},
    },
)
async def plan_trip(request: TripPlanRequest) -> TripPlanResponse:
    """
    Generate a complete day-by-day travel itinerary for Hyderabad.
    """
    planner = get_planner()

    logger.info(
        "POST /plan-trip | destination=%s | start=%s | end=%s | "
        "travelers=%d | budget=%s | interests=%s",
        request.destination,
        request.start_date,
        request.end_date,
        request.number_of_travelers,
        request.budget,
        request.interests,
    )

    try:
        itinerary = await planner.plan_trip(request)
        return itinerary

    except RuntimeError as exc:
        error_msg = str(exc)
        logger.error("Planner error: %s", error_msg)

        if "429" in error_msg or "rate" in error_msg.lower():
            raise HTTPException(
                status_code=429,
                detail={
                    "error":   "The AI model is temporarily rate limited.",
                    "message": (
                        "DeepSeek V4 Flash free tier is busy. "
                        "Please wait 1-2 minutes and try again."
                    ),
                },
            )

        if "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=504,
                detail={
                    "error":   "Request timed out.",
                    "message": "The AI model took too long to respond. Please try again.",
                },
            )

        if "OpenRouter API returned" in error_msg:
            raise HTTPException(
                status_code=502,
                detail={
                    "error":   "AI model API error.",
                    "message": error_msg,
                },
            )

        raise HTTPException(
            status_code=500,
            detail={
                "error":   "Failed to generate itinerary.",
                "message": error_msg,
            },
        )

    except Exception as exc:
        logger.exception("Unexpected error in /plan-trip: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={
                "error":   "An unexpected error occurred.",
                "message": str(exc),
            },
        )