"""
Diagnostic script for analyzing the quality and characteristics 
of extracted OSM data.

This helps make EVIDENCE-BASED decisions about query refinement
rather than blindly reducing element counts.

Usage:
    python scripts/analyze_data_quality.py --city HYD
    python scripts/analyze_data_quality.py --city HYD --category poorly_lit_roads
"""

import sys
import click
from pathlib import Path
from collections import Counter, defaultdict

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.file_utils import load_json
from src.utils.logger import setup_logger


def analyze_category(cache_dir: Path, category: str, logger):
    """Detailed analysis of a single category's extracted data."""
    
    cache_file = cache_dir / f"hyd_{category}.json"
    if not cache_file.exists():
        logger.error(f"Cache file not found: {cache_file}")
        return
    
    data = load_json(cache_file)
    elements = data.get("elements", [])
    
    logger.info("=" * 70)
    logger.info(f"CATEGORY: {category.upper()}")
    logger.info("=" * 70)
    logger.info(f"Total elements: {len(elements)}")
    
    if not elements:
        return
    
    # ─── 1. Element type breakdown ───
    type_counts = Counter(e["type"] for e in elements)
    logger.info(f"\nElement types:")
    for elem_type, count in type_counts.most_common():
        pct = (count / len(elements)) * 100
        logger.info(f"  {elem_type:12s} {count:6d}  ({pct:5.1f}%)")
    
    # ─── 2. Tag analysis ───
    tag_key_counts = Counter()
    tag_value_counts = defaultdict(Counter)
    
    for elem in elements:
        tags = elem.get("tags", {})
        for key, value in tags.items():
            tag_key_counts[key] += 1
            tag_value_counts[key][value] += 1
    
    logger.info(f"\nTop 10 tag keys (most used):")
    for key, count in tag_key_counts.most_common(10):
        pct = (count / len(elements)) * 100
        logger.info(f"  {key:25s} {count:6d}  ({pct:5.1f}% of elements)")
    
    # ─── 3. Highway type breakdown (if applicable) ───
    if "highway" in tag_key_counts:
        logger.info(f"\nHighway type distribution:")
        for hwy_type, count in tag_value_counts["highway"].most_common():
            pct = (count / tag_key_counts["highway"]) * 100
            logger.info(f"  highway={hwy_type:20s} {count:6d}  ({pct:5.1f}%)")
    
    # ─── 4. Surface analysis (if applicable) ───
    if "surface" in tag_key_counts:
        logger.info(f"\nSurface type distribution:")
        for surf, count in tag_value_counts["surface"].most_common():
            pct = (count / tag_key_counts["surface"]) * 100
            logger.info(f"  surface={surf:20s} {count:6d}  ({pct:5.1f}%)")
    
    # ─── 5. Lit tag analysis ───
    if "lit" in tag_key_counts:
        logger.info(f"\nLit tag distribution:")
        for lit_val, count in tag_value_counts["lit"].most_common():
            logger.info(f"  lit={lit_val:20s} {count:6d}")
    
    # ─── 6. Named vs unnamed ───
    named_count = sum(1 for e in elements if e.get("tags", {}).get("name"))
    unnamed = len(elements) - named_count
    logger.info(f"\nNaming:")
    logger.info(f"  Named elements:   {named_count:6d}  ({named_count/len(elements)*100:5.1f}%)")
    logger.info(f"  Unnamed elements: {unnamed:6d}  ({unnamed/len(elements)*100:5.1f}%)")
    
    # ─── 7. Geometry size analysis (for ways) ───
    way_lengths = []
    way_vertex_counts = []
    
    for elem in elements:
        if elem["type"] == "way" and "geometry" in elem:
            geom = elem["geometry"]
            way_vertex_counts.append(len(geom))
            
            # Approximate length using bounds
            bounds = elem.get("bounds", {})
            if bounds:
                lat_span = bounds.get("maxlat", 0) - bounds.get("minlat", 0)
                lon_span = bounds.get("maxlon", 0) - bounds.get("minlon", 0)
                # Rough approximation: 1° lat ≈ 111km
                approx_size_m = max(lat_span, lon_span) * 111000
                way_lengths.append(approx_size_m)
    
    if way_lengths:
        way_lengths.sort()
        logger.info(f"\nWay size distribution (approximate, in meters):")
        logger.info(f"  Min:    {way_lengths[0]:8.1f} m")
        logger.info(f"  P25:    {way_lengths[len(way_lengths)//4]:8.1f} m")
        logger.info(f"  Median: {way_lengths[len(way_lengths)//2]:8.1f} m")
        logger.info(f"  P75:    {way_lengths[3*len(way_lengths)//4]:8.1f} m")
        logger.info(f"  Max:    {way_lengths[-1]:8.1f} m")
        
        # Count tiny ways (likely insignificant)
        tiny = sum(1 for l in way_lengths if l < 50)
        small = sum(1 for l in way_lengths if 50 <= l < 200)
        medium = sum(1 for l in way_lengths if 200 <= l < 1000)
        large = sum(1 for l in way_lengths if l >= 1000)
        
        logger.info(f"\nWay size buckets:")
        logger.info(f"  Tiny (<50m):       {tiny:6d}  ({tiny/len(way_lengths)*100:5.1f}%)")
        logger.info(f"  Small (50-200m):   {small:6d}  ({small/len(way_lengths)*100:5.1f}%)")
        logger.info(f"  Medium (200m-1km): {medium:6d}  ({medium/len(way_lengths)*100:5.1f}%)")
        logger.info(f"  Large (>1km):      {large:6d}  ({large/len(way_lengths)*100:5.1f}%)")
    
    if way_vertex_counts:
        way_vertex_counts.sort()
        logger.info(f"\nVertex count per way:")
        logger.info(f"  Min:    {way_vertex_counts[0]}")
        logger.info(f"  Median: {way_vertex_counts[len(way_vertex_counts)//2]}")
        logger.info(f"  Max:    {way_vertex_counts[-1]}")
    
    # ─── 8. Sample elements ───
    logger.info(f"\nSample elements (first 3):")
    for i, elem in enumerate(elements[:3], 1):
        logger.info(f"\n  [Sample {i}]")
        logger.info(f"    type: {elem['type']}, id: {elem.get('id')}")
        logger.info(f"    tags: {elem.get('tags', {})}")


def analyze_all_categories(cache_dir: Path, logger):
    """Cross-category overview."""
    
    logger.info("=" * 70)
    logger.info("CROSS-CATEGORY ANALYSIS")
    logger.info("=" * 70)
    
    cache_files = sorted(cache_dir.glob("hyd_*.json"))
    
    # Build summary table
    summary = []
    for cache_file in cache_files:
        category = cache_file.stem.replace("hyd_", "")
        data = load_json(cache_file)
        elements = data.get("elements", [])
        
        type_counts = Counter(e["type"] for e in elements)
        named_count = sum(1 for e in elements if e.get("tags", {}).get("name"))
        
        summary.append({
            "category": category,
            "total": len(elements),
            "nodes": type_counts.get("node", 0),
            "ways": type_counts.get("way", 0),
            "relations": type_counts.get("relation", 0),
            "named": named_count,
            "size_kb": cache_file.stat().st_size // 1024,
        })
    
    # Print table
    logger.info(f"\n{'Category':<22} {'Total':>7} {'Nodes':>7} {'Ways':>7} "
                f"{'Rels':>5} {'Named':>7} {'Size':>7}")
    logger.info("-" * 70)
    for row in summary:
        logger.info(
            f"{row['category']:<22} {row['total']:>7} {row['nodes']:>7} "
            f"{row['ways']:>7} {row['relations']:>5} {row['named']:>7} "
            f"{row['size_kb']:>5}KB"
        )


@click.command()
@click.option("--city", default="HYD", help="City code")
@click.option("--category", default=None, help="Specific category to analyze")
def main(city: str, category: str):
    """Analyze quality of extracted OSM data."""
    
    project_root = Path(__file__).parent.parent
    cache_dir = project_root / "data" / "raw" / "osm_cache"
    log_dir = project_root / "logs"
    
    logger = setup_logger(name="data_analyzer", log_dir=log_dir)
    
    if category:
        analyze_category(cache_dir, category, logger)
    else:
        analyze_all_categories(cache_dir, logger)
        logger.info("\n" + "=" * 70)
        logger.info("Run with --category <name> for detailed analysis of one category")
        logger.info("Example: python scripts/analyze_data_quality.py --city HYD --category poorly_lit_roads")


if __name__ == "__main__":
    main()