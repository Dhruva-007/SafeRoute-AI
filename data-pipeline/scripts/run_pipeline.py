"""
Master pipeline orchestrator: runs all phases in sequence.

Usage:
    python scripts/run_pipeline.py --city HYD
    python scripts/run_pipeline.py --city HYD --skip-extraction  # Use cached OSM data
"""

import sys
import time
from pathlib import Path

import click

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.logger import setup_logger


@click.command()
@click.option("--city", default="HYD", help="City code")
@click.option("--skip-extraction", is_flag=True, help="Skip OSM extraction (use cache)")
@click.option("--log-level", default="INFO")
def main(city: str, skip_extraction: bool, log_level: str):
    """Run the complete data pipeline."""
    
    project_root = Path(__file__).parent.parent
    log_dir = project_root / "logs"
    
    logger = setup_logger(name="master_pipeline", log_level=log_level, log_dir=log_dir)
    
    logger.info("█" * 70)
    logger.info("  SAFEROUTE-AI MASTER PIPELINE")
    logger.info(f"  City: {city}")
    logger.info("█" * 70)
    
    pipeline_start = time.perf_counter()
    
    # ─── Phase 1.1: Extraction ───
    if not skip_extraction:
        logger.info("\n" + "▶" * 30)
        logger.info("PHASE 1.1: OSM EXTRACTION")
        logger.info("▶" * 30)
        
        phase_start = time.perf_counter()
        from scripts.run_extraction import main as run_extraction
        ctx = click.Context(run_extraction)
        ctx.invoke(run_extraction, city=city, no_cache=False, log_level=log_level)
        logger.info(f"Phase 1.1 took: {time.perf_counter() - phase_start:.2f}s")
    else:
        logger.info("⏭  Skipping extraction (using cached OSM data)")
    
    # ─── Phase 1.2: Processing ───
    logger.info("\n" + "▶" * 30)
    logger.info("PHASE 1.2: PROCESSING")
    logger.info("▶" * 30)
    
    phase_start = time.perf_counter()
    from scripts.run_processing import main as run_processing
    ctx = click.Context(run_processing)
    ctx.invoke(run_processing, city=city, log_level=log_level)
    logger.info(f"Phase 1.2 took: {time.perf_counter() - phase_start:.2f}s")
    
    # ─── Phase 1.3: Deduplication ───
    logger.info("\n" + "▶" * 30)
    logger.info("PHASE 1.3: DEDUPLICATION")
    logger.info("▶" * 30)
    
    phase_start = time.perf_counter()
    from scripts.run_deduplication import main as run_dedup
    ctx = click.Context(run_dedup)
    ctx.invoke(run_dedup, city=city, log_level=log_level)
    logger.info(f"Phase 1.3 took: {time.perf_counter() - phase_start:.2f}s")
    
    # ─── Phase 1.4: Export ───
    logger.info("\n" + "▶" * 30)
    logger.info("PHASE 1.4: EXPORT")
    logger.info("▶" * 30)
    
    phase_start = time.perf_counter()
    from scripts.run_export import main as run_export
    ctx = click.Context(run_export)
    ctx.invoke(run_export, city=city, version=None, log_level=log_level)
    logger.info(f"Phase 1.4 took: {time.perf_counter() - phase_start:.2f}s")
    
    # ─── Final Summary ───
    total_time = time.perf_counter() - pipeline_start
    logger.info("\n" + "█" * 70)
    logger.info(f"  ✅ PIPELINE COMPLETE")
    logger.info(f"  Total time: {total_time:.2f} seconds ({total_time/60:.1f} minutes)")
    logger.info("█" * 70)


if __name__ == "__main__":
    main()