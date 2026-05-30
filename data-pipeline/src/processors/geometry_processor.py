"""
Geometry processor: converts OSM elements to Shapely geometries.

Handles:
- Nodes → Points → buffered Circles
- Open ways → LineStrings → buffered Corridors  
- Closed ways → Polygons
- Relations → MultiPolygons
"""

import logging
from typing import Any, Dict, Optional, Tuple

import pyproj
from shapely.geometry import (
    Point, Polygon, MultiPolygon, LineString
)
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union, transform
from shapely.validation import make_valid


class GeometryProcessor:
    """Converts OSM elements to validated Shapely geometries."""
    
    # WGS84 (lat/lon) and UTM zone 44N (Hyderabad metric projection)
    WGS84_EPSG = 4326
    UTM_EPSG = 32644  # UTM Zone 44N covers Hyderabad
    
    def __init__(self, utm_epsg: int = UTM_EPSG):
        self.logger = logging.getLogger(__name__)
        
        self.wgs84 = pyproj.CRS(f"EPSG:{self.WGS84_EPSG}")
        self.utm = pyproj.CRS(f"EPSG:{utm_epsg}")
        
        # Cached transformers (much faster than recreating)
        self._to_utm = pyproj.Transformer.from_crs(
            self.wgs84, self.utm, always_xy=True
        ).transform
        
        self._to_wgs = pyproj.Transformer.from_crs(
            self.utm, self.wgs84, always_xy=True
        ).transform
    
    # ─── OSM Element → Shapely ───
    
    def osm_to_geometry(self, element: Dict[str, Any]) -> Optional[BaseGeometry]:
        """
        Convert an OSM element to a Shapely geometry.
        
        Returns None if conversion fails or element is invalid.
        """
        elem_type = element.get("type")
        
        try:
            if elem_type == "node":
                return self._node_to_point(element)
            elif elem_type == "way":
                return self._way_to_geometry(element)
            elif elem_type == "relation":
                return self._relation_to_geometry(element)
            else:
                return None
        except Exception as e:
            self.logger.debug(
                f"Failed to convert {elem_type}/{element.get('id')}: {e}"
            )
            return None
    
    def _node_to_point(self, element: Dict[str, Any]) -> Optional[Point]:
        """Convert an OSM node to a Shapely Point."""
        lat = element.get("lat")
        lon = element.get("lon")
        if lat is None or lon is None:
            return None
        # Shapely uses (x, y) = (lon, lat)
        return Point(lon, lat)
    
    def _way_to_geometry(self, element: Dict[str, Any]) -> Optional[BaseGeometry]:
        """
        Convert an OSM way to either:
        - Polygon (if closed: first node == last node)
        - LineString (if open)
        """
        geometry = element.get("geometry", [])
        if not geometry or len(geometry) < 2:
            return None
        
        coords = [(g["lon"], g["lat"]) for g in geometry]
        
        # Check if closed
        is_closed = (
            len(coords) >= 4
            and coords[0] == coords[-1]
        )
        
        if is_closed:
            try:
                poly = Polygon(coords)
                return self._ensure_valid(poly)
            except Exception:
                # Fallback to LineString if Polygon construction fails
                return LineString(coords)
        else:
            return LineString(coords)
    
    def _relation_to_geometry(
        self, element: Dict[str, Any]
    ) -> Optional[BaseGeometry]:
        """
        Convert an OSM relation to a MultiPolygon.
        
        Handles outer/inner ring roles.
        """
        members = element.get("members", [])
        if not members:
            return None
        
        outer_polygons = []
        inner_polygons = []
        
        for member in members:
            if member.get("type") != "way":
                continue
            
            geom = member.get("geometry", [])
            if not geom or len(geom) < 4:
                continue
            
            coords = [(g["lon"], g["lat"]) for g in geom]
            
            # Must be closed for polygon role
            if coords[0] != coords[-1]:
                continue
            
            try:
                poly = Polygon(coords)
                if member.get("role") == "outer":
                    outer_polygons.append(poly)
                elif member.get("role") == "inner":
                    inner_polygons.append(poly)
            except Exception:
                continue
        
        if not outer_polygons:
            return None
        
        try:
            # Union all outer polygons
            merged = unary_union(outer_polygons)
            
            # Subtract inner holes
            for inner in inner_polygons:
                merged = merged.difference(inner)
            
            return self._ensure_valid(merged)
        except Exception as e:
            self.logger.debug(f"Failed to build relation geometry: {e}")
            return None
    
    # ─── Geometry Transformations ───
    
    def buffer_point_to_circle(
        self,
        point: Point,
        radius_meters: float,
    ) -> Polygon:
        """
        Buffer a point into a circular polygon (in metric space).
        
        This is necessary because Shapely buffer in WGS84 produces
        an ellipse, not a circle, due to lat/lon distortion.
        """
        projected = transform(self._to_utm, point)
        buffered = projected.buffer(radius_meters)
        return transform(self._to_wgs, buffered)
    
    def buffer_line_to_corridor(
        self,
        line: LineString,
        buffer_meters: float,
    ) -> Polygon:
        """
        Buffer a line into a corridor polygon (in metric space).
        Uses flat caps (cap_style=2) for road corridors.
        """
        projected = transform(self._to_utm, line)
        buffered = projected.buffer(buffer_meters, cap_style=2)
        result = transform(self._to_wgs, buffered)
        return self._ensure_valid(result)
    
    def compute_area_m2(self, geometry: BaseGeometry) -> float:
        """Compute geometry area in square meters."""
        projected = transform(self._to_utm, geometry)
        return projected.area
    
    def get_centroid_latlon(
        self, geometry: BaseGeometry
    ) -> Tuple[float, float]:
        """Get geometry centroid as (lat, lon)."""
        centroid = geometry.centroid
        return (centroid.y, centroid.x)
    
    def get_bbox(
        self, geometry: BaseGeometry
    ) -> Tuple[float, float, float, float]:
        """
        Get bounding box as (min_lat, min_lon, max_lat, max_lon).
        Note: Shapely bounds are (minx, miny, maxx, maxy) = (minlon, minlat, maxlon, maxlat)
        """
        minx, miny, maxx, maxy = geometry.bounds
        return (miny, minx, maxy, maxx)
    
    def simplify(
        self,
        geometry: BaseGeometry,
        tolerance: float = 0.00005,
    ) -> BaseGeometry:
        """Simplify geometry to reduce vertex count."""
        return geometry.simplify(tolerance, preserve_topology=True)
    
    # ─── Validation ───
    
    def _ensure_valid(self, geometry: BaseGeometry) -> BaseGeometry:
        """Ensure geometry is topologically valid."""
        if not geometry.is_valid:
            return make_valid(geometry)
        return geometry