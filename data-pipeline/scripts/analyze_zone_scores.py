"""
Diagnostic script for analyzing risk score distribution.

Shows:
- Score histogram
- Top high-risk zones
- Bottom low-risk zones  
- Per-category score statistics

Usage:
    python scripts/analyze_zone_scores.py --city HYD
"""

import sys
import json
from pathlib import Path
from collections import defaultdict, Counter

import click

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.file_utils import load_json
from src.utils.logger import setup_logger


def print_histogram(scores: list, bins: int = 20, width: int = 50):
    """ASCII histogram of scores."""
    if not scores:
        return
    
    min_s = min(scores)
    max_s = max(scores)
    bin_width = (max_s - min_s) / bins if max_s > min_s else 0.05
    
    histogram = [0] * bins
    for s in scores:
        idx = min(int((s - min_s) / bin_width), bins - 1)
        histogram[idx] += 1
    
    max_count = max(histogram) if histogram else 1
    
    print(f"\n  Score range: [{min_s:.3f}, {max_s:.3f}]")
    print(f"  Total: {len(scores)} zones\n")
    
    for i, count in enumerate(histogram):
        bin_start = min_s + i * bin_width
        bin_end = bin_start + bin_width
        bar_len = int((count / max_count) * width)
        bar = "█" * bar_len
        print(f"  [{bin_start:.3f}-{bin_end:.3f}] {bar} {count}")


@click.command()
@click.option("--city", default="HYD", help="City code")
def main(city: str):
    """Analyze risk score distribution."""
    
    project_root = Path(__file__).parent.parent
    intermediate_dir = project_root / "data" / "intermediate" / city.lower()
    log_dir = project_root / "logs"
    
    logger = setup_logger(name="score_analyzer", log_dir=log_dir)
    
    combined_file = intermediate_dir / "all_zones_processed.geojson"
    if not combined_file.exists():
        logger.error(f"File not found: {combined_file}")
        logger.error("Run 'python scripts/run_processing.py' first.")
        return
    
    data = load_json(combined_file)
    features = data.get("features", [])
    
    logger.info("=" * 70)
    logger.info(f"RISK SCORE ANALYSIS — {len(features)} zones")
    logger.info("=" * 70)
    
    # ─── Overall Distribution ───
    all_scores = [f["properties"]["risk_score"] for f in features]
    severity_counts = Counter(
        f["properties"]["severity_level"] for f in features
    )
    
    print("\n[OVERALL SCORE DISTRIBUTION]")
    print_histogram(all_scores)
    
    print("\n[SEVERITY BREAKDOWN]")
    severity_labels = {1: "Low", 2: "Medium", 3: "High", 4: "Critical"}
    for level in sorted(severity_counts.keys()):
        count = severity_counts[level]
        pct = (count / len(features)) * 100
        print(f"  Level {level} ({severity_labels[level]:8s}): {count:5d}  ({pct:5.1f}%)")
    
    # ─── Per-Category Statistics ───
    print("\n[PER-CATEGORY STATISTICS]")
    by_category = defaultdict(list)
    for f in features:
        cat = f["properties"]["risk_category"]
        score = f["properties"]["risk_score"]
        by_category[cat].append(score)
    
    print(f"\n  {'Category':<25} {'Count':>7} {'Min':>6} {'Avg':>6} {'Max':>6}")
    print("  " + "-" * 55)
    for cat, scores in sorted(by_category.items()):
        avg = sum(scores) / len(scores)
        print(f"  {cat:<25} {len(scores):>7} {min(scores):>6.3f} "
              f"{avg:>6.3f} {max(scores):>6.3f}")
    
    # ─── Top 10 Highest Risk Zones ───
    print("\n[TOP 10 HIGHEST RISK ZONES]")
    top_zones = sorted(
        features,
        key=lambda f: f["properties"]["risk_score"],
        reverse=True
    )[:10]
    
    for i, zone in enumerate(top_zones, 1):
        props = zone["properties"]
        print(f"\n  #{i}  Score: {props['risk_score']:.3f} "
              f"(Level {props['severity_level']})")
        print(f"      Name: {props['name'][:60]}")
        print(f"      Category: {props['risk_category']}")
        print(f"      OSM ID: {props.get('osm_id', 'N/A')}")
    
    # ─── Bottom 5 Lowest Risk Zones ───
    print("\n[BOTTOM 5 LOWEST RISK ZONES]")
    bottom_zones = sorted(
        features,
        key=lambda f: f["properties"]["risk_score"]
    )[:5]
    
    for i, zone in enumerate(bottom_zones, 1):
        props = zone["properties"]
        print(f"\n  #{i}  Score: {props['risk_score']:.3f}")
        print(f"      Name: {props['name'][:60]}")
        print(f"      Category: {props['risk_category']}")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()