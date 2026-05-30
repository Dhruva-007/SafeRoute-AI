"""
Entry-point for Phase 1.2: Processing and Risk Scoring.

Reads cached OSM data and produces processed RiskZone objects.

Usage:
    python scripts/run_processing.py --city HYD
"""

import sys
import json
from pathlib import Path
from collections import Counter

import click

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.models.risk_zone import RiskZone
from src.processors.geometry_processor import GeometryProcessor
from src.processors.risk_scorer import RiskScorer
from src.processors.emergency_proximity import EmergencyProximityCalculator
from src.processors.zone_builder import ZoneBuilder
from src.utils.file_utils import load_json, load_yaml, save_json
from src.utils.logger import setup_logger


@click.command()
@click.option("--city", default="HYD", help="City code (e.g., HYD)")
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"]),
)
def main(city: str, log_level: str):
    """Process raw OSM data into scored RiskZone objects."""
    
    project_root = Path(__file__).parent.parent
    config_dir = project_root / "config"
    cache_dir = project_root / "data" / "raw" / "osm_cache"
    intermediate_dir = project_root / "data" / "intermediate" / city.lower()
    log_dir = project_root / "logs"
    
    intermediate_dir.mkdir(parents=True, exist_ok=True)
    (intermediate_dir / "by_category").mkdir(exist_ok=True)
    (intermediate_dir / "by_geometry").mkdir(exist_ok=True)
    
    logger = setup_logger(log_level=log_level, log_dir=log_dir)
    
    logger.info("=" * 70)
    logger.info("PHASE 1.2: PROCESSING & RISK SCORING")
    logger.info("=" * 70)
    
    # ─── Load Configuration ───
    logger.info("Loading configurations...")
    categories_config = load_yaml(config_dir / "risk_categories.yaml")
    scoring_config = load_yaml(config_dir / "scoring_weights.yaml")
    pipeline_config = load_yaml(config_dir / "pipeline_config.yaml")
    
    # ─── Load Emergency Services for Proximity Scoring ───
    logger.info("Loading emergency services data for proximity scoring...")
    emergency_file = cache_dir / f"{city.lower()}_emergency_services.json"
    if emergency_file.exists():
        emergency_data = load_json(emergency_file)
        proximity_calc = EmergencyProximityCalculator.from_osm_data(emergency_data)
    else:
        logger.warning("No emergency services data found. Proximity scoring degraded.")
        proximity_calc = EmergencyProximityCalculator(emergency_points=[])
    
    # ─── Initialize Processors ───
    logger.info("Initializing processors...")
    utm_epsg = pipeline_config["pipeline"]["geometry"]["utm_epsg"]
    geometry_processor = GeometryProcessor(utm_epsg=utm_epsg)
    
    risk_scorer = RiskScorer(
        scoring_config=scoring_config,
        categories_config=categories_config,
    )
    
    zone_builder = ZoneBuilder(
        categories_config=categories_config,
        pipeline_config=pipeline_config,
        geometry_processor=geometry_processor,
        risk_scorer=risk_scorer,
        proximity_calculator=proximity_calc,
        city_code=city,
    )
    
    # ─── Process Each Category ───
    all_zones: list[RiskZone] = []
    zones_by_category: dict[str, list[RiskZone]] = {}
    
    risk_categories = list(categories_config["categories"].keys())
    logger.info(f"Processing {len(risk_categories)} risk categories...")
    
    for i, category in enumerate(risk_categories, 1):
        logger.info(f"[{i}/{len(risk_categories)}] Processing: {category}")
        
        cache_file = cache_dir / f"{city.lower()}_{category}.json"
        if not cache_file.exists():
            logger.warning(f"  ⚠ No cache file for {category}")
            continue
        
        osm_data = load_json(cache_file)
        zones = zone_builder.build_zones_for_category(category, osm_data)
        
        zones_by_category[category] = zones
        all_zones.extend(zones)
    
    # ─── Save Per-Category Outputs ───
    logger.info("Saving per-category GeoJSON files...")
    for category, zones in zones_by_category.items():
        if not zones:
            continue
        feature_collection = {
            "type": "FeatureCollection",
            "metadata": {
                "category": category,
                "count": len(zones),
                "city": city,
            },
            "features": [z.to_geojson_feature() for z in zones],
        }
        out_path = intermediate_dir / "by_category" / f"{category}.geojson"
        save_json(feature_collection, out_path, compact=True)
        logger.info(f"  ✓ Saved: {out_path.name} ({len(zones)} zones)")
    
    # ─── Save Per-Geometry-Type Outputs ───
    logger.info("Saving per-geometry-type GeoJSON files...")
    polygons = [z for z in all_zones if z.zone_type.value == "polygon"]
    circles = [z for z in all_zones if z.zone_type.value == "circle"]
    
    for geom_type, zones in [("polygons", polygons), ("circles", circles)]:
        feature_collection = {
            "type": "FeatureCollection",
            "metadata": {
                "geometry_type": geom_type,
                "count": len(zones),
                "city": city,
            },
            "features": [z.to_geojson_feature() for z in zones],
        }
        out_path = intermediate_dir / "by_geometry" / f"{geom_type}.geojson"
        save_json(feature_collection, out_path, compact=True)
        logger.info(f"  ✓ Saved: {out_path.name} ({len(zones)} zones)")
    
    # ─── Save Combined Output ───
    combined = {
        "type": "FeatureCollection",
        "metadata": {
            "city": city,
            "total_zones": len(all_zones),
            "by_category": {cat: len(zs) for cat, zs in zones_by_category.items()},
        },
        "features": [z.to_geojson_feature() for z in all_zones],
    }
    combined_path = intermediate_dir / "all_zones_processed.geojson"
    save_json(combined, combined_path, compact=True)
    logger.info(f"✓ Saved combined output: {combined_path.name}")
    
    # ─── Print Summary ───
    logger.info("=" * 70)
    logger.info("PROCESSING SUMMARY")
    logger.info("=" * 70)
    logger.info(f"Total zones built: {len(all_zones)}")
    
    severity_counts = Counter(z.severity_level.value for z in all_zones)
    logger.info("\nBy severity:")
    for level in sorted(severity_counts.keys()):
        label = ["", "Low", "Medium", "High", "Critical"][level]
        count = severity_counts[level]
        pct = (count / len(all_zones)) * 100 if all_zones else 0
        logger.info(f"  Level {level} ({label:8s}): {count:5d}  ({pct:5.1f}%)")
    
    logger.info("\nBy category:")
    for cat, zones in zones_by_category.items():
        logger.info(f"  {cat:25s}: {len(zones):5d} zones")
    
    logger.info("\nBy geometry type:")
    logger.info(f"  Polygons: {len(polygons)}")
    logger.info(f"  Circles:  {len(circles)}")
    
    logger.info("=" * 70)
    logger.info("Next step: Phase 1.3 - Deduplication & Validation")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()