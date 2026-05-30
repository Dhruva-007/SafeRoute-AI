"""
Entry-point for Phase 1.4: Final Export.

Produces production-ready output files:
- {city}_risk_zones.geojson         (full GeoJSON)
- {city}_risk_zones.geojson.gz      (gzipped for transfer)
- {city}_risk_zones.db              (SQLite for PWA)
- manifest.json                      (with checksums)

Usage:
    python scripts/run_export.py --city HYD
"""

import sys
import os
from pathlib import Path

import click

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.exporters.geojson_exporter import GeoJSONExporter
from src.exporters.sqlite_exporter import SQLiteExporter
from src.exporters.manifest_generator import ManifestGenerator
from src.utils.file_utils import load_json, load_yaml
from src.utils.logger import setup_logger
from scripts.run_deduplication import feature_to_risk_zone


@click.command()
@click.option("--city", default="HYD", help="City code")
@click.option("--version", default=None, help="Dataset version (overrides default)")
@click.option("--log-level", default="INFO")
def main(city: str, version: str, log_level: str):
    """Export the validated dataset to all output formats."""
    
    project_root = Path(__file__).parent.parent
    config_dir = project_root / "config"
    processed_dir = project_root / "data" / "processed" / city.lower()
    output_dir = project_root / "data" / "output" / city.lower()
    log_dir = project_root / "logs"
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    logger = setup_logger(log_level=log_level, log_dir=log_dir)
    
    logger.info("=" * 70)
    logger.info("PHASE 1.4: FINAL EXPORT")
    logger.info("=" * 70)
    
    # ─── Load Configuration ───
    cities_config = load_yaml(config_dir / "cities.yaml")
    pipeline_config = load_yaml(config_dir / "pipeline_config.yaml")
    
    if city not in cities_config["cities"]:
        logger.error(f"Unknown city: {city}")
        return
    
    city_info = cities_config["cities"][city]
    city_name = city_info["name"]
    
    # Determine dataset version
    if version:
        dataset_version = version
    else:
        dataset_version = pipeline_config["pipeline"]["version"]
    
    logger.info(f"City:    {city_name} ({city})")
    logger.info(f"Version: {dataset_version}")
    
    # ─── Load Validated Zones ───
    input_file = processed_dir / "risk_zones_validated.geojson"
    if not input_file.exists():
        logger.error(f"Input file not found: {input_file}")
        logger.error("Run 'python scripts/run_deduplication.py' first.")
        return
    
    logger.info(f"\nLoading validated zones from: {input_file.name}")
    data = load_json(input_file)
    features = data.get("features", [])
    
    zones = []
    failed = 0
    for feat in features:
        try:
            zones.append(feature_to_risk_zone(feat))
        except Exception as e:
            failed += 1
    
    if failed > 0:
        logger.warning(f"Failed to load {failed} zones")
    
    logger.info(f"Loaded {len(zones)} zones")
    
    # ─── Export to All Formats ───
    logger.info(f"\n{'─' * 50}")
    logger.info("EXPORTING TO OUTPUT FORMATS")
    logger.info("─" * 50)
    
    output_files = []
    
    # 1. GeoJSON (uncompressed + gzipped)
    geojson_exporter = GeoJSONExporter(dataset_version=dataset_version)
    geojson_path = output_dir / f"{city.lower()}_risk_zones.geojson"
    geojson_result = geojson_exporter.export(
        zones=zones,
        output_path=geojson_path,
        city_name=city_name,
        city_code=city,
        write_gzip=True,
    )
    output_files.append(geojson_path)
    output_files.append(geojson_path.with_suffix(".geojson.gz"))
    
    # 2. SQLite
    sqlite_exporter = SQLiteExporter(dataset_version=dataset_version)
    sqlite_path = output_dir / f"{city.lower()}_risk_zones.db"
    sqlite_result = sqlite_exporter.export(
        zones=zones,
        output_path=sqlite_path,
        city_name=city_name,
        city_code=city,
    )
    output_files.append(sqlite_path)
    
    # 3. Manifest
    manifest_generator = ManifestGenerator(dataset_version=dataset_version)
    manifest_path = manifest_generator.generate(
        output_dir=output_dir,
        zones=zones,
        city_name=city_name,
        city_code=city,
        file_paths=output_files,
    )
    
    # ─── Summary ───
    logger.info("\n" + "=" * 70)
    logger.info("PHASE 1.4 COMPLETE — EXPORT SUMMARY")
    logger.info("=" * 70)
    
    logger.info(f"\nOutput directory: {output_dir}")
    logger.info(f"\nGenerated files:")
    
    for filepath in sorted(output_dir.glob("*")):
        size_kb = filepath.stat().st_size / 1024
        logger.info(f"  {filepath.name:<40s}  {size_kb:>8.1f} KB")
    
    total_size_kb = sum(f.stat().st_size for f in output_dir.glob("*")) / 1024
    logger.info(f"\nTotal size: {total_size_kb:.1f} KB ({total_size_kb/1024:.2f} MB)")
    
    # Final stats from manifest
    manifest_data = load_json(manifest_path)
    logger.info(f"\nDataset statistics:")
    logger.info(f"  Total zones: {manifest_data['statistics']['total_zones']}")
    logger.info(f"  By severity:")
    for level, count in manifest_data['statistics']['by_severity'].items():
        logger.info(f"    {level:<15}: {count}")
    
    logger.info("\n" + "=" * 70)
    logger.info("🎉 PHASE 1 COMPLETE!")
    logger.info("=" * 70)
    logger.info("\nThe dataset is now ready for the PWA.")
    logger.info(f"Distribute these files: {output_dir}")
    logger.info("\nTo verify the SQLite database:")
    logger.info(f"  Open with DB Browser for SQLite: https://sqlitebrowser.org/")
    logger.info(f"  Or query: sqlite3 {sqlite_path} 'SELECT COUNT(*) FROM risk_zones;'")


if __name__ == "__main__":
    main()