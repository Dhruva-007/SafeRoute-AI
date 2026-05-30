"""
Emergency service proximity calculator.

Used by the risk scorer to penalize zones far from emergency services.
"""

import logging
from typing import List, Tuple

from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry

from src.utils.geo_utils import haversine_km


class EmergencyProximityCalculator:
    """Calculates distance from any geometry to nearest emergency service."""
    
    def __init__(self, emergency_points: List[Tuple[float, float]]):
        """
        Args:
            emergency_points: List of (lat, lon) tuples for emergency services
        """
        self.logger = logging.getLogger(__name__)
        self.emergency_points = emergency_points
        self.logger.info(
            f"Initialized with {len(emergency_points)} emergency service points"
        )
    
    @classmethod
    def from_osm_data(cls, osm_data: dict) -> "EmergencyProximityCalculator":
        """
        Build from raw OSM emergency_services data.
        Extracts (lat, lon) for each emergency service.
        """
        points = []
        for elem in osm_data.get("elements", []):
            if elem["type"] == "node":
                points.append((elem["lat"], elem["lon"]))
            elif elem["type"] == "way" and "geometry" in elem:
                # Use centroid of the way
                geom = elem["geometry"]
                if geom:
                    avg_lat = sum(g["lat"] for g in geom) / len(geom)
                    avg_lon = sum(g["lon"] for g in geom) / len(geom)
                    points.append((avg_lat, avg_lon))
        
        return cls(points)
    
    def nearest_distance_km(self, geometry: BaseGeometry) -> float:
        """
        Find distance in km from geometry centroid to nearest emergency service.
        
        Returns large value if no emergency services available.
        """
        if not self.emergency_points:
            return 10.0  # Conservative default
        
        centroid = geometry.centroid
        center_lat, center_lon = centroid.y, centroid.x
        
        min_dist = float("inf")
        for em_lat, em_lon in self.emergency_points:
            dist = haversine_km(center_lat, center_lon, em_lat, em_lon)
            if dist < min_dist:
                min_dist = dist
        
        return min_dist