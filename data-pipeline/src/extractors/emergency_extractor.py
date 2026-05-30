"""
Emergency Services extractor.

Uses a single combined Overpass query for efficiency.
"""

import logging
from pathlib import Path
from typing import Dict, List

from src.extractors.overpass_client import OverpassClient
from src.utils.file_utils import load_yaml
from src.utils.geo_utils import bbox_string_for_overpass


class EmergencyServicesExtractor:
    """Extracts all emergency services in a single efficient query."""
    
    QUERY_NAME = "emergency_all"
    
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
        
        self.cities_config = load_yaml(config_dir / "cities.yaml")
        self.queries_config = load_yaml(config_dir / "osm_queries.yaml")
        self.pipeline_config = load_yaml(config_dir / "pipeline_config.yaml")
        
        if city_code not in self.cities_config["cities"]:
            raise ValueError(f"Unknown city: {city_code}")
        
        self.city = self.cities_config["cities"][city_code]
        
        overpass_cfg = self.pipeline_config["pipeline"]["overpass"]
        self.client = OverpassClient(
            endpoints=overpass_cfg["endpoints"],
            timeout=300,  # Longer timeout for combined query
            max_retries=overpass_cfg["max_retries"],
            retry_delay=15,  # Longer delay between retries
            cache_dir=cache_dir,
            user_agent=overpass_cfg["user_agent"],
        )
    
    def get_bbox_string(self) -> str:
        bbox = self.city["bbox"]
        return bbox_string_for_overpass(
            bbox["south"], bbox["west"], bbox["north"], bbox["east"]
        )
    
    def extract_all(self, use_cache: bool = True) -> Dict:
        """
        Extract all emergency services in one query.
        
        Returns a dict mapping category names to OSM data.
        We classify by tag AFTER extraction (in the processor).
        """
        if self.QUERY_NAME not in self.queries_config["queries"]:
            raise ValueError(f"No query defined for: {self.QUERY_NAME}")
        
        query_template = self.queries_config["queries"][self.QUERY_NAME]
        query = query_template.format(bbox=self.get_bbox_string())
        cache_key = f"{self.city_code.lower()}_{self.QUERY_NAME}"
        
        self.logger.info(f"Extracting all emergency services for {self.city['name']}")
        self.logger.info("Using SINGLE combined query (efficient)")
        
        data = self.client.query(query, cache_key=cache_key, use_cache=use_cache)
        
        elements = data.get("elements", [])
        self.logger.info(f"Total elements extracted: {len(elements)}")
        
        # Return as a dict to maintain compatibility with processor
        return {self.QUERY_NAME: data}