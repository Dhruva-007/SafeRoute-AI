"""
Zone builder: orchestrates conversion of OSM elements to RiskZone objects.

For each OSM element:
  1. Convert geometry (Point → buffered Circle, Line → Corridor, etc.)
  2. Apply category metadata
  3. Compute risk score
  4. Build validated RiskZone
"""

import logging
from typing import Any, Dict, List, Optional

from shapely.geometry import Point, LineString, Polygon, MultiPolygon

from src.models.risk_zone import (
    BoundingBox,
    RiskZone,
    SeverityLevel,
    TimeWindow,
    ZoneType,
)
from src.processors.geometry_processor import GeometryProcessor
from src.processors.risk_scorer import RiskScorer
from src.processors.emergency_proximity import EmergencyProximityCalculator


class ZoneBuilder:
    """Builds RiskZone objects from OSM elements."""
    
    def __init__(
        self,
        categories_config: Dict,
        pipeline_config: Dict,
        geometry_processor: GeometryProcessor,
        risk_scorer: RiskScorer,
        proximity_calculator: EmergencyProximityCalculator,
        city_code: str = "HYD",
    ):
        self.logger = logging.getLogger(__name__)
        self.categories_config = categories_config["categories"]
        self.geometry_strategies = self._build_strategy_map()
        self.geometry_processor = geometry_processor
        self.risk_scorer = risk_scorer
        self.proximity_calculator = proximity_calculator
        self.city_code = city_code
        
        geom_config = pipeline_config["pipeline"]["geometry"]
        self.min_polygon_area_m2 = geom_config["min_polygon_area_m2"]
        self.max_polygon_area_m2 = geom_config["max_polygon_area_m2"]
        self.simplification_tolerance = geom_config["simplification_tolerance"]
    
    def _build_strategy_map(self) -> Dict[str, str]:
        """Map category → geometry strategy."""
        return {
            cat_name: cat_cfg.get("geometry_strategy", "polygon")
            for cat_name, cat_cfg in self.categories_config.items()
        }
    
    def build_zones_for_category(
        self,
        category: str,
        osm_data: Dict,
    ) -> List[RiskZone]:
        """Build all zones for a single category."""
        if category not in self.categories_config:
            self.logger.warning(f"Unknown category: {category}")
            return []
        
        cat_config = self.categories_config[category]
        strategy = cat_config.get("geometry_strategy", "polygon")
        
        zones: List[RiskZone] = []
        skipped_reasons = {"no_geometry": 0, "too_small": 0, "too_large": 0, "error": 0}
        
        elements = osm_data.get("elements", [])
        self.logger.info(
            f"Building zones for '{category}' from {len(elements)} elements "
            f"using '{strategy}' strategy"
        )
        
        for elem in elements:
            try:
                zone = self._build_single_zone(elem, category, cat_config, strategy)
                if zone is None:
                    skipped_reasons["no_geometry"] += 1
                    continue
                zones.append(zone)
            except _SkipReason as sr:
                skipped_reasons[sr.reason] += 1
            except Exception as e:
                skipped_reasons["error"] += 1
                self.logger.debug(
                    f"Error building zone from {elem.get('type')}/{elem.get('id')}: {e}"
                )
        
        self.logger.info(
            f"  → Built {len(zones)} zones for '{category}' "
            f"(skipped: {sum(skipped_reasons.values())}; "
            f"reasons: {skipped_reasons})"
        )
        
        return zones
    
    def _build_single_zone(
        self,
        element: Dict[str, Any],
        category: str,
        cat_config: Dict,
        strategy: str,
    ) -> Optional[RiskZone]:
        """Build a single RiskZone from an OSM element."""
        
        # Step 1: Convert OSM element to Shapely geometry
        raw_geom = self.geometry_processor.osm_to_geometry(element)
        if raw_geom is None or raw_geom.is_empty:
            return None
        
        # Step 2: Apply geometry strategy to get final geometry
        zone_type, final_geom, center_lat, center_lon, radius_m = (
            self._apply_geometry_strategy(raw_geom, strategy, cat_config)
        )
        
        if final_geom is None or final_geom.is_empty:
            return None
        
        # Step 3: Validate geometry size
        if isinstance(final_geom, (Polygon, MultiPolygon)):
            area = self.geometry_processor.compute_area_m2(final_geom)
            if area < self.min_polygon_area_m2:
                raise _SkipReason("too_small")
            if area > self.max_polygon_area_m2:
                raise _SkipReason("too_large")
        
        # Step 4: Simplify geometry to reduce storage
        if isinstance(final_geom, (Polygon, MultiPolygon)):
            final_geom = self.geometry_processor.simplify(
                final_geom, self.simplification_tolerance
            )
        
        # Step 5: Compute risk score
        tags = element.get("tags", {})
        emergency_dist = self.proximity_calculator.nearest_distance_km(final_geom)
        
        risk_score, severity_level, risk_factors = self.risk_scorer.compute_score(
            category=category,
            tags=tags,
            emergency_distance_km=emergency_dist,
        )
        
        # Step 6: Build metadata
        bbox = BoundingBox.from_shapely_bounds(final_geom.bounds)
        
        name = self._derive_name(tags, cat_config, element)
        osm_id = f"{element.get('type')}/{element.get('id', 'unknown')}"
        
        # Time window
        time_window = None
        if cat_config.get("is_time_dependent"):
            risk_hours_cfg = cat_config.get("risk_hours")
            if risk_hours_cfg:
                time_window = TimeWindow(
                    start_time=risk_hours_cfg["start"],
                    end_time=risk_hours_cfg["end"],
                )
        
        # Step 7: Build RiskZone
        from shapely.geometry import mapping
        
        zone = RiskZone(
            name=name,
            description=cat_config.get("description", ""),
            zone_type=zone_type,
            geometry=mapping(final_geom) if zone_type == ZoneType.POLYGON else None,
            center_lat=center_lat,
            center_lon=center_lon,
            radius_meters=radius_m,
            bbox=bbox,
            risk_category=category,
            risk_subcategory=tags.get("landuse") or tags.get("industrial") or "",
            risk_score=risk_score,
            severity_level=severity_level,
            is_time_dependent=cat_config.get("is_time_dependent", False),
            risk_hours=time_window,
            data_source="osm",
            source_confidence=cat_config.get("source_confidence", 0.6),
            osm_id=osm_id,
            osm_type=element.get("type"),
            alert_message=cat_config.get(
                "alert_template",
                f"Risk zone detected: {name}"
            ),
            risk_factors=risk_factors,
            city_code=self.city_code,
        )
        
        return zone
    
    def _apply_geometry_strategy(
        self,
        raw_geom,
        strategy: str,
        cat_config: Dict,
    ):
        """
        Apply the geometry transformation strategy.
        
        Returns:
            (zone_type, final_geometry, center_lat, center_lon, radius_meters)
        """
        if strategy == "circle":
            # Convert any geometry to circle (use centroid)
            if isinstance(raw_geom, Point):
                center = raw_geom
            else:
                center = raw_geom.centroid
            
            radius = cat_config.get("point_buffer_meters", 100)
            buffered = self.geometry_processor.buffer_point_to_circle(
                center, radius
            )
            
            return (
                ZoneType.CIRCLE,
                buffered,  # We still need the polygon for indexing
                center.y,
                center.x,
                radius,
            )
        
        elif strategy == "buffered_line":
            if isinstance(raw_geom, LineString):
                buffer_m = cat_config.get("line_buffer_meters", 30)
                buffered = self.geometry_processor.buffer_line_to_corridor(
                    raw_geom, buffer_m
                )
                return (ZoneType.POLYGON, buffered, None, None, None)
            elif isinstance(raw_geom, Point):
                # Edge case: treat as circle
                radius = cat_config.get("line_buffer_meters", 30)
                buffered = self.geometry_processor.buffer_point_to_circle(
                    raw_geom, radius
                )
                return (ZoneType.CIRCLE, buffered, raw_geom.y, raw_geom.x, radius)
            elif isinstance(raw_geom, (Polygon, MultiPolygon)):
                # Already a polygon
                return (ZoneType.POLYGON, raw_geom, None, None, None)
            else:
                return (None, None, None, None, None)
        
        elif strategy == "polygon":
            if isinstance(raw_geom, (Polygon, MultiPolygon)):
                return (ZoneType.POLYGON, raw_geom, None, None, None)
            elif isinstance(raw_geom, LineString):
                # Convert line to corridor as fallback
                buffered = self.geometry_processor.buffer_line_to_corridor(
                    raw_geom, 30
                )
                return (ZoneType.POLYGON, buffered, None, None, None)
            elif isinstance(raw_geom, Point):
                # Convert point to small circle
                buffer_m = cat_config.get("point_buffer_meters", 50)
                buffered = self.geometry_processor.buffer_point_to_circle(
                    raw_geom, buffer_m
                )
                return (ZoneType.CIRCLE, buffered, raw_geom.y, raw_geom.x, buffer_m)
            else:
                return (None, None, None, None, None)
        
        return (None, None, None, None, None)
    
    def _derive_name(
        self,
        tags: Dict[str, str],
        cat_config: Dict,
        element: Dict,
    ) -> str:
        """Build a human-readable name for the zone."""
        # Prefer name tags
        for key in ["name", "name:en", "official_name", "alt_name"]:
            if tags.get(key):
                return tags[key][:200]
        
        # Fallback: category description + ID
        desc = cat_config.get("description", "Risk zone")
        elem_id = element.get("id", "unknown")
        return f"{desc} ({element.get('type')}/{elem_id})"


class _SkipReason(Exception):
    """Internal exception for tracking skip reasons."""
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)