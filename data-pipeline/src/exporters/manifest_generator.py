"""
Manifest generator: creates a manifest.json with file checksums and metadata.
"""

import logging
import json
from pathlib import Path
from typing import Dict, List
from datetime import datetime

from src.models.risk_zone import RiskZone
from src.utils.file_utils import compute_sha256, save_json


class ManifestGenerator:
    """Generates manifest.json with file checksums for integrity verification."""
    
    def __init__(self, dataset_version: str = "1.0.0"):
        self.logger = logging.getLogger(__name__)
        self.dataset_version = dataset_version
    
    def generate(
        self,
        output_dir: Path,
        zones: List[RiskZone],
        city_name: str,
        city_code: str,
        file_paths: List[Path],
    ) -> Path:
        """
        Generate manifest.json describing all output files.
        """
        from collections import Counter
        
        # File entries with checksums
        files_info = {}
        for filepath in file_paths:
            if not filepath.exists():
                continue
            
            files_info[filepath.name] = {
                "path": filepath.name,
                "size_bytes": filepath.stat().st_size,
                "size_kb": round(filepath.stat().st_size / 1024, 1),
                "sha256": compute_sha256(filepath),
                "modified_at": datetime.fromtimestamp(
                    filepath.stat().st_mtime
                ).isoformat(),
            }
        
        # Statistics
        severity_counts = Counter(z.severity_level.value for z in zones)
        category_counts = Counter(z.risk_category for z in zones)
        
        # Bounding box of all zones
        if zones:
            all_lats = [z.bbox.min_lat for z in zones] + [z.bbox.max_lat for z in zones]
            all_lons = [z.bbox.min_lon for z in zones] + [z.bbox.max_lon for z in zones]
            coverage_bbox = {
                "min_lat": min(all_lats),
                "min_lon": min(all_lons),
                "max_lat": max(all_lats),
                "max_lon": max(all_lons),
            }
        else:
            coverage_bbox = {}
        
        manifest = {
            "schema_version": "1.0.0",
            "dataset_version": self.dataset_version,
            "city": {
                "code": city_code,
                "name": city_name,
            },
            "generated_at": datetime.utcnow().isoformat(),
            "statistics": {
                "total_zones": len(zones),
                "by_severity": {
                    "1_low": severity_counts.get(1, 0),
                    "2_medium": severity_counts.get(2, 0),
                    "3_high": severity_counts.get(3, 0),
                    "4_critical": severity_counts.get(4, 0),
                },
                "by_category": dict(category_counts),
            },
            "coverage_bbox": coverage_bbox,
            "files": files_info,
        }
        
        manifest_path = output_dir / "manifest.json"
        save_json(manifest, manifest_path, compact=False)  # Pretty-print manifest
        
        self.logger.info(f"  ✓ Manifest:   {manifest_path.name} "
                         f"({manifest_path.stat().st_size} bytes)")
        
        return manifest_path