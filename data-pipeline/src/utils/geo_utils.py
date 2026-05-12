"""
Geographic utility functions.
"""

import math
from typing import Tuple


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute great-circle distance between two points in kilometers.
    """
    R = 6371.0  # Earth radius in km
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    
    return R * 2 * math.asin(math.sqrt(a))


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in meters."""
    return haversine_km(lat1, lon1, lat2, lon2) * 1000


def bbox_string_for_overpass(
    south: float, west: float, north: float, east: float
) -> str:
    """Format bounding box for Overpass API: 'south,west,north,east'."""
    return f"{south},{west},{north},{east}"


def is_point_in_bbox(
    lat: float,
    lon: float,
    bbox: Tuple[float, float, float, float],
) -> bool:
    """
    Check if a point is within a bounding box.
    bbox: (south, west, north, east)
    """
    south, west, north, east = bbox
    return south <= lat <= north and west <= lon <= east