"""
Entry-point script for Phase 1.1: OSM Data Extraction

Usage:
    python scripts/run_extraction.py --city HYD
    python scripts/run_extraction.py --city HYD --no-cache
"""

import sys
import click
from pathlib import Path

# Add parent directory to path so 'src' imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.extractors.osm_extractor import OSMExtractor
from src.utils.logger import setup_logger


@click.command()
@click.option(
    "--city",
    default="HYD",
    help="City code (e.g., HYD for Hyderabad)",
)
@click.option(
    "--no-cache",
    is_flag=True,
    default=False,
    help="Bypass cache and force fresh download",
)
@click.option(
    "--log-level",
    default="INFO",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"]),
    help="Logging level",
)
def main(city: str, no_cache: bool, log_level: str):
    """Extract OSM data for the specified city."""
    
    project_root = Path(__file__).parent.parent
    config_dir = project_root / "config"
    cache_dir = project_root / "data" / "raw" / "osm_cache"
    log_dir = project_root / "logs"
    
    logger = setup_logger(log_level=log_level, log_dir=log_dir)
    
    logger.info("=" * 70)
    logger.info("PHASE 1.1: OSM DATA EXTRACTION")
    logger.info("=" * 70)
    
    try:
        extractor = OSMExtractor(
            city_code=city,
            config_dir=config_dir,
            cache_dir=cache_dir,
        )
        
        results = extractor.extract_all(use_cache=not no_cache)
        
        logger.info("=" * 70)
        logger.info("EXTRACTION SUMMARY")
        logger.info("=" * 70)
        for category, data in results.items():
            count = len(data.get("elements", []))
            status = "✓" if "error" not in data else "✗"
            logger.info(f"  {status} {category:25s} → {count:5d} elements")
        
        logger.info("=" * 70)
        logger.info(f"Cached files: {cache_dir}")
        logger.info("Next step: python scripts/run_processing.py --city HYD")
        logger.info("=" * 70)
        
        return 0
    
    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())