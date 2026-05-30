"""
Benchmark script for deduplication performance.
Useful for project report and reviews.
"""

import sys
import time
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.processors.deduplicator import Deduplicator
from src.utils.file_utils import load_json
from src.utils.logger import setup_logger
from scripts.run_deduplication import feature_to_risk_zone


def main():
    project_root = Path(__file__).parent.parent
    intermediate_dir = project_root / "data" / "intermediate" / "hyd"
    log_dir = project_root / "logs"
    
    logger = setup_logger(name="benchmark", log_dir=log_dir)
    
    # Load data
    data = load_json(intermediate_dir / "all_zones_processed.geojson")
    features = data.get("features", [])
    
    logger.info(f"Loading {len(features)} zones for benchmark...")
    zones = [feature_to_risk_zone(f) for f in features]
    
    # Benchmark
    logger.info("\n" + "=" * 60)
    logger.info("DEDUPLICATION PERFORMANCE BENCHMARK")
    logger.info("=" * 60)
    
    dedup = Deduplicator(iou_threshold=0.75)
    
    start = time.perf_counter()
    result = dedup.deduplicate(zones)
    elapsed = time.perf_counter() - start
    
    logger.info(f"\nResults:")
    logger.info(f"  Input zones:    {len(zones):>6}")
    logger.info(f"  Output zones:   {len(result):>6}")
    logger.info(f"  Reduction:      {((len(zones)-len(result))/len(zones)*100):>6.1f}%")
    logger.info(f"  Total time:     {elapsed:>6.2f} seconds")
    logger.info(f"  Throughput:     {len(zones)/elapsed:>6.0f} zones/sec")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()