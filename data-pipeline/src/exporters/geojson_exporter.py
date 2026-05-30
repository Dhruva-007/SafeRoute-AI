"""
GeoJSON exporter: produces both uncompressed and gzipped GeoJSON.
"""

import logging
from pathlib import Path
from typing import List

from src.models.risk_zone import RiskZone
from src.utils.file_utils import save_json, save_gzipped_json


class GeoJSONExporter:
    """Exports RiskZones to GeoJSON formats."""
    
    def __init__(self, dataset_version: str = "1.0.0"):
        self.logger = logging.getLogger(__name__)
        self.dataset_version = dataset_version
    
    def export(
        self,
        zones: List[RiskZone],
        output_path: Path,
        city_name: str,
        city_code: str,
        write_gzip: bool = True,
    ) -> dict:
        """
        Export zones to GeoJSON file(s).
        
        Returns:
            dict with paths and sizes of generated files
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Build feature collection
        feature_collection = {
            "type": "FeatureCollection",
            "metadata": {
                "city": city_name,
                "city_code": city_code,
                "dataset_version": self.dataset_version,
                "total_features": len(zones),
                "schema_version": "saferoute-v1",
                "generated_by": "SafeRoute Pipeline v1.0",
            },
            "features": [z.to_geojson_feature() for z in zones],
        }
        
        results = {}
        
        # Save uncompressed
        save_json(feature_collection, output_path, compact=True)
        size_kb = output_path.stat().st_size / 1024
        results["geojson"] = {
            "path": str(output_path),
            "size_kb": round(size_kb, 1),
        }
        self.logger.info(f"  ✓ GeoJSON:    {output_path.name} ({size_kb:.1f} KB)")
        
        # Save gzipped
        if write_gzip:
            gz_path = output_path.with_suffix(output_path.suffix + ".gz")
            save_gzipped_json(feature_collection, gz_path)
            gz_size_kb = gz_path.stat().st_size / 1024
            results["geojson_gz"] = {
                "path": str(gz_path),
                "size_kb": round(gz_size_kb, 1),
            }
            compression_ratio = (1 - gz_size_kb / size_kb) * 100
            self.logger.info(
                f"  ✓ GeoJSON.gz: {gz_path.name} ({gz_size_kb:.1f} KB, "
                f"{compression_ratio:.0f}% compressed)"
            )
        
        return results