"""
Entry-point for Phase 1.3: Deduplication & Validation.

Usage:
    python scripts/run_deduplication.py --city HYD
"""

import sys
from pathlib import Path
from collections import Counter

import click

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.processors.deduplicator import Deduplicator
from src.validators.dataset_validator import DatasetValidator
from src.utils.file_utils import load_json, save_json
from src.utils.logger import setup_logger
from src.models.risk_zone import RiskZone, BoundingBox, TimeWindow, ZoneType, SeverityLevel


def feature_to_risk_zone(feature: dict) -> RiskZone:
    """
    Reconstruct a RiskZone from a GeoJSON Feature.
    Handles serialization differences (bbox as list, time fields, etc.).
    """
    props = feature["properties"]
    geom = feature["geometry"]
    
    # ─── Reconstruct BoundingBox from list ───
    bbox_data = props["bbox"]
    if isinstance(bbox_data, list):
        bbox = BoundingBox(
            min_lat=bbox_data[0],
            min_lon=bbox_data[1],
            max_lat=bbox_data[2],
            max_lon=bbox_data[3],
        )
    elif isinstance(bbox_data, dict):
        bbox = BoundingBox(**bbox_data)
    else:
        bbox = bbox_data
    
    # ─── Reconstruct TimeWindow from flat fields ───
    time_window = None
    if props.get("risk_hours_start") and props.get("risk_hours_end"):
        time_window = TimeWindow(
            start_time=props["risk_hours_start"],
            end_time=props["risk_hours_end"],
        )
    
    # ─── Determine geometry to pass ───
    zone_type = ZoneType(props["zone_type"])
    if zone_type == ZoneType.POLYGON:
        zone_geometry = geom
    else:
        # Circle: geometry field is None; use center_lat/lon/radius
        zone_geometry = None
    
    # ─── Reconstruct risk_factors if present ───
    risk_factors = []
    for rf in props.get("risk_factors", []):
        from src.models.risk_zone import RiskFactor
        risk_factors.append(RiskFactor(
            name=rf["name"],
            score=rf["score"],
            weight=rf["weight"],
            source=rf.get("source", ""),
        ))
    
    # ─── Build RiskZone ───
    zone = RiskZone(
        zone_uuid=props["zone_uuid"],
        name=props["name"],
        description=props.get("description", ""),
        zone_type=zone_type,
        geometry=zone_geometry,
        center_lat=props.get("center_lat"),
        center_lon=props.get("center_lon"),
        radius_meters=props.get("radius_meters"),
        bbox=bbox,
        risk_category=props["risk_category"],
        risk_subcategory=props.get("risk_subcategory", ""),
        risk_score=props["risk_score"],
        severity_level=SeverityLevel(props["severity_level"]),
        is_time_dependent=props.get("is_time_dependent", False),
        risk_hours=time_window,
        data_source=props["data_source"],
        source_confidence=props["source_confidence"],
        osm_id=props.get("osm_id"),
        osm_type=props.get("osm_type"),
        alert_message=props["alert_message"],
        risk_factors=risk_factors,
        city_code=props["city_code"],
        dataset_version=props.get("dataset_version", "1.0.0"),
        created_at=props.get("created_at"),
        is_active=props.get("is_active", True),
    )
    
    return zone


@click.command()
@click.option("--city", default="HYD", help="City code")
@click.option("--log-level", default="INFO")
def main(city: str, log_level: str):
    """Deduplicate and validate the processed zones."""
    
    project_root = Path(__file__).parent.parent
    intermediate_dir = project_root / "data" / "intermediate" / city.lower()
    processed_dir = project_root / "data" / "processed" / city.lower()
    log_dir = project_root / "logs"
    
    processed_dir.mkdir(parents=True, exist_ok=True)
    
    logger = setup_logger(log_level=log_level, log_dir=log_dir)
    
    logger.info("=" * 70)
    logger.info("PHASE 1.3: DEDUPLICATION & VALIDATION")
    logger.info("=" * 70)
    
    # ─── Load Processed Zones ───
    input_file = intermediate_dir / "all_zones_processed.geojson"
    if not input_file.exists():
        logger.error(f"Input file not found: {input_file}")
        logger.error("Run 'python scripts/run_processing.py' first.")
        return
    
    logger.info(f"Loading: {input_file}")
    data = load_json(input_file)
    features = data.get("features", [])
    
    # ─── Reconstruct RiskZone Objects ───
    logger.info(f"Reconstructing {len(features)} RiskZone objects...")
    
    zones = []
    failed = 0
    
    for feat in features:
        try:
            zone = feature_to_risk_zone(feat)
            zones.append(zone)
        except Exception as e:
            failed += 1
            if failed <= 3:  # Log first 3 failures only
                logger.warning(f"Failed to reconstruct zone: {e}")
    
    if failed > 0:
        logger.warning(f"Failed to reconstruct {failed} zones (will be skipped)")
    
    logger.info(f"Successfully loaded {len(zones)} zones")
    
    # ─── Pre-Deduplication Stats ───
    pre_severity = Counter(z.severity_level.value for z in zones)
    pre_category = Counter(z.risk_category for z in zones)
    
    # ─── Deduplicate ───
    logger.info("\n" + "─" * 50)
    logger.info("DEDUPLICATION")
    logger.info("─" * 50)
    
    dedup = Deduplicator(iou_threshold=0.75)
    deduplicated_zones = dedup.deduplicate(zones)
    
    # ─── Validate ───
    logger.info("\n" + "─" * 50)
    logger.info("VALIDATION")
    logger.info("─" * 50)
    
    validator = DatasetValidator()
    report = validator.validate(deduplicated_zones)
    
    if not report["passed"]:
        logger.error("Validation failed. Aborting export.")
        return
    
    # ─── Save Final Output ───
    output_file = processed_dir / "risk_zones_validated.geojson"
    feature_collection = {
        "type": "FeatureCollection",
        "metadata": {
            "city": city,
            "total_zones": len(deduplicated_zones),
            "deduplication_applied": True,
            "iou_threshold": 0.75,
        },
        "features": [z.to_geojson_feature() for z in deduplicated_zones],
    }
    save_json(feature_collection, output_file, compact=True)
    
    logger.info(f"\n✓ Saved: {output_file}")
    
    # ─── Final Summary ───
    post_severity = Counter(z.severity_level.value for z in deduplicated_zones)
    post_category = Counter(z.risk_category for z in deduplicated_zones)
    
    logger.info("\n" + "=" * 70)
    logger.info("PHASE 1.3 SUMMARY")
    logger.info("=" * 70)
    
    logger.info(f"\nZone counts:")
    logger.info(f"  Before deduplication: {len(zones):>6}")
    logger.info(f"  After deduplication:  {len(deduplicated_zones):>6}")
    reduction = ((len(zones) - len(deduplicated_zones)) / len(zones)) * 100
    logger.info(f"  Reduction:            {reduction:>6.1f}%")
    
    logger.info(f"\nBy category (before → after):")
    for cat in sorted(set(list(pre_category.keys()) + list(post_category.keys()))):
        before = pre_category.get(cat, 0)
        after = post_category.get(cat, 0)
        change = after - before
        arrow = "↓" if change < 0 else "→"
        logger.info(f"  {cat:25s}: {before:>5} {arrow} {after:>5}  ({change:+d})")
    
    logger.info(f"\nBy severity (before → after):")
    severity_labels = {1: "Low", 2: "Medium", 3: "High", 4: "Critical"}
    for level in sorted(set(list(pre_severity.keys()) + list(post_severity.keys()))):
        before = pre_severity.get(level, 0)
        after = post_severity.get(level, 0)
        label = severity_labels.get(level, "?")
        logger.info(f"  Level {level} ({label:8s}): {before:>5} → {after:>5}")
    
    logger.info("=" * 70)
    logger.info("Next step: Phase 1.4 - Final Export (SQLite + GeoJSON.gz)")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()