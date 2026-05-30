"""
Phase 1.5: Emergency Services Pipeline

Extracts, validates, and adds emergency services to the existing 
SQLite database with maximum accuracy and reliability.

Usage:
    python scripts/run_emergency_pipeline.py --city HYD
    python scripts/run_emergency_pipeline.py --city HYD --no-cache
"""

import sys
from pathlib import Path

import click

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.extractors.emergency_extractor import EmergencyServicesExtractor
from src.processors.emergency_processor import EmergencyServiceProcessor
from src.exporters.emergency_exporter import EmergencyServicesExporter
from src.utils.file_utils import load_yaml
from src.utils.logger import setup_logger


@click.command()
@click.option("--city", default="HYD", help="City code")
@click.option("--no-cache", is_flag=True, default=False)
@click.option("--log-level", default="INFO")
def main(city: str, no_cache: bool, log_level: str):
    """Run the emergency services pipeline."""
    
    project_root = Path(__file__).parent.parent
    config_dir = project_root / "config"
    cache_dir = project_root / "data" / "raw" / "osm_cache"
    output_dir = project_root / "data" / "output" / city.lower()
    log_dir = project_root / "logs"
    
    logger = setup_logger(log_level=log_level, log_dir=log_dir)
    
    logger.info("█" * 70)
    logger.info("  PHASE 1.5: EMERGENCY SERVICES PIPELINE")
    logger.info(f"  City: {city}")
    logger.info("█" * 70)
    
    # ─── Step 1: Extract ───
    logger.info("\n▶ STEP 1: EXTRACTION")
    extractor = EmergencyServicesExtractor(
        city_code=city,
        config_dir=config_dir,
        cache_dir=cache_dir,
    )
    raw_data = extractor.extract_all(use_cache=not no_cache)
    
    # ─── Step 2: Process & Validate ───
    logger.info("\n▶ STEP 2: PROCESSING & VALIDATION")
    cities_config = load_yaml(config_dir / "cities.yaml")
    city_bbox = cities_config["cities"][city]["bbox"]
    
    processor = EmergencyServiceProcessor(
        city_code=city,
        city_bbox=city_bbox,
    )
    services = processor.process_all(raw_data)
    
    # ─── Step 3: Export to existing DB ───
    logger.info("\n▶ STEP 3: EXPORTING TO DATABASE")
    db_path = output_dir / f"{city.lower()}_risk_zones.db"
    
    if not db_path.exists():
        logger.error(f"Database not found: {db_path}")
        logger.error("Run main pipeline first: python scripts/run_pipeline.py")
        return
    
    exporter = EmergencyServicesExporter()
    result = exporter.export(services, db_path)
    
    # ─── Final Summary ───
    logger.info("\n" + "█" * 70)
    logger.info("  ✅ PHASE 1.5 COMPLETE")
    logger.info(f"  Services inserted: {result['inserted']}")
    logger.info(f"  Database size: {result['db_size_kb']:.1f} KB")
    logger.info("█" * 70)


if __name__ == "__main__":
    main()