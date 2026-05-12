"""
High-level OSM data extractor orchestrating Overpass queries
for all configured risk categories.
"""

import logging
from pathlib import Path
from typing import Dict, List

from src.extractors.overpass_client import OverpassClient
from src.utils.file_utils import load_yaml
from src.utils.geo_utils import bbox_string_for_overpass


class OSMExtractor:
    """
    Extracts OSM data for all risk categories defined in configuration.
    """
    
    def __init__(
        self,
        city_code: str,
        config_dir: Path,
        cache_dir: Path,
    ):
        self.city_code = city_code
        self.config_dir = config_dir
        self.cache_dir = cache_dir
        self.logger = logging.getLogger(__name__)
        
        # Load all configurations
        self.cities_config = load_yaml(config_dir / "cities.yaml")
        self.categories_config = load_yaml(config_dir / "risk_categories.yaml")
        self.queries_config = load_yaml(config_dir / "osm_queries.yaml")
        self.pipeline_config = load_yaml(config_dir / "pipeline_config.yaml")
        
        # Validate city
        if city_code not in self.cities_config["cities"]:
            raise ValueError(f"Unknown city code: {city_code}")
        
        self.city = self.cities_config["cities"][city_code]
        
        # Set up Overpass client
        overpass_cfg = self.pipeline_config["pipeline"]["overpass"]
        self.client = OverpassClient(
            endpoints=overpass_cfg["endpoints"],
            timeout=overpass_cfg["timeout_seconds"],
            max_retries=overpass_cfg["max_retries"],
            retry_delay=overpass_cfg["retry_delay_seconds"],
            cache_dir=cache_dir,
            user_agent=overpass_cfg["user_agent"],
        )
    
    def get_bbox_string(self) -> str:
        """Get bbox string formatted for Overpass."""
        bbox = self.city["bbox"]
        return bbox_string_for_overpass(
            bbox["south"], bbox["west"], bbox["north"], bbox["east"]
        )
    
    def extract_category(self, category_name: str, use_cache: bool = True) -> Dict:
        """Extract data for a single category."""
        if category_name not in self.queries_config["queries"]:
            raise ValueError(f"No query defined for category: {category_name}")
        
        query_template = self.queries_config["queries"][category_name]
        bbox_str = self.get_bbox_string()
        query = query_template.format(bbox=bbox_str)
        
        cache_key = f"{self.city_code.lower()}_{category_name}"
        
        self.logger.info(f"Extracting category: {category_name}")
        return self.client.query(query, cache_key=cache_key, use_cache=use_cache)
    
    def extract_all(self, use_cache: bool = True) -> Dict[str, Dict]:
        """Extract data for all categories defined in queries config."""
        results = {}
        all_categories = list(self.queries_config["queries"].keys())
        
        self.logger.info(f"Starting extraction for {len(all_categories)} categories")
        self.logger.info(f"City: {self.city['name']} ({self.city_code})")
        self.logger.info(f"BBox: {self.get_bbox_string()}")
        
        for i, category in enumerate(all_categories, 1):
            self.logger.info(f"[{i}/{len(all_categories)}] Category: {category}")
            try:
                data = self.extract_category(category, use_cache=use_cache)
                results[category] = data
            except Exception as e:
                self.logger.error(f"  ✗ Failed to extract {category}: {e}")
                results[category] = {"elements": [], "error": str(e)}
        
        # Summary
        total_elements = sum(
            len(d.get("elements", [])) for d in results.values()
        )
        self.logger.info(f"Extraction complete. Total elements: {total_elements}")
        
        return results