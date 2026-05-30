"""
Core data models for the SafeRoute pipeline.

These Pydantic models provide:
- Type safety
- Automatic validation
- Self-documenting schemas
- JSON serialization
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional, List, Dict, Tuple
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator
from shapely.geometry import shape as shapely_shape, mapping
from shapely.geometry.base import BaseGeometry


# ════════════════════════════════════════════════════════════════
# ENUMS
# ════════════════════════════════════════════════════════════════

class ZoneType(str, Enum):
    """Geometric type of a risk zone."""
    POLYGON = "polygon"
    CIRCLE = "circle"


class SeverityLevel(int, Enum):
    """Risk severity levels (matches scoring config)."""
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


class GeometryStrategy(str, Enum):
    """How to derive zone geometry from OSM element."""
    POLYGON = "polygon"            # Use way/relation polygon as-is
    CIRCLE = "circle"              # Buffer point to circle
    BUFFERED_LINE = "buffered_line"  # Buffer line to corridor


# ════════════════════════════════════════════════════════════════
# RISK FACTOR
# ════════════════════════════════════════════════════════════════

class RiskFactor(BaseModel):
    """A single component of the composite risk score."""
    
    name: str = Field(..., description="Factor identifier (e.g., 'category_base')")
    score: float = Field(..., ge=0.0, le=1.0, description="Factor score [0.0, 1.0]")
    weight: float = Field(..., ge=0.0, le=1.0, description="Weight in composite score")
    source: str = Field(..., description="Source of the factor")


# ════════════════════════════════════════════════════════════════
# BOUNDING BOX
# ════════════════════════════════════════════════════════════════

class BoundingBox(BaseModel):
    """Geographic bounding box."""
    
    min_lat: float = Field(..., ge=-90, le=90)
    min_lon: float = Field(..., ge=-180, le=180)
    max_lat: float = Field(..., ge=-90, le=90)
    max_lon: float = Field(..., ge=-180, le=180)
    
    @field_validator("max_lat")
    @classmethod
    def max_lat_after_min(cls, v, info):
        if "min_lat" in info.data and v < info.data["min_lat"]:
            raise ValueError("max_lat must be >= min_lat")
        return v
    
    @field_validator("max_lon")
    @classmethod
    def max_lon_after_min(cls, v, info):
        if "min_lon" in info.data and v < info.data["min_lon"]:
            raise ValueError("max_lon must be >= min_lon")
        return v
    
    @classmethod
    def from_shapely_bounds(cls, bounds: Tuple[float, float, float, float]) -> "BoundingBox":
        """Create from Shapely bounds (minx, miny, maxx, maxy)."""
        min_lon, min_lat, max_lon, max_lat = bounds
        return cls(
            min_lat=min_lat,
            min_lon=min_lon,
            max_lat=max_lat,
            max_lon=max_lon,
        )
    
    def to_list(self) -> List[float]:
        """Return as [min_lat, min_lon, max_lat, max_lon]."""
        return [self.min_lat, self.min_lon, self.max_lat, self.max_lon]


# ════════════════════════════════════════════════════════════════
# TIME WINDOW
# ════════════════════════════════════════════════════════════════

class TimeWindow(BaseModel):
    """Time-based risk window (e.g., night-only risk)."""
    
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="HH:MM")
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="HH:MM")


# ════════════════════════════════════════════════════════════════
# RISK ZONE — THE CORE MODEL
# ════════════════════════════════════════════════════════════════

class RiskZone(BaseModel):
    """
    A single geofenced risk zone.
    
    This is the canonical representation used throughout the pipeline
    and consumed by the PWA's geofencing engine.
    """
    
    # ─── Identification ───
    zone_uuid: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="")
    
    # ─── Geometry ───
    zone_type: ZoneType
    
    # Polygon: GeoJSON geometry dict (Shapely-compatible)
    geometry: Optional[Dict[str, Any]] = Field(
        default=None,
        description="GeoJSON geometry (for polygon zones)"
    )
    
    # Circle: center + radius
    center_lat: Optional[float] = Field(default=None, ge=-90, le=90)
    center_lon: Optional[float] = Field(default=None, ge=-180, le=180)
    radius_meters: Optional[float] = Field(default=None, gt=0)
    
    # Bounding box (always required for spatial indexing)
    bbox: BoundingBox
    
    # ─── Risk Classification ───
    risk_category: str = Field(..., description="Primary risk category")
    risk_subcategory: str = Field(default="", description="Optional secondary tag")
    risk_score: float = Field(..., ge=0.0, le=1.0)
    severity_level: SeverityLevel
    
    # ─── Time Dependency ───
    is_time_dependent: bool = Field(default=False)
    risk_hours: Optional[TimeWindow] = Field(default=None)
    
    # ─── Source Provenance ───
    data_source: str = Field(..., description="osm | manual | external_xxx")
    source_confidence: float = Field(..., ge=0.0, le=1.0)
    osm_id: Optional[str] = Field(default=None, description="e.g., 'way/12345'")
    osm_type: Optional[str] = Field(default=None)
    
    # ─── Alert Configuration ───
    alert_message: str = Field(..., min_length=1)
    
    # ─── Risk Factor Decomposition ───
    risk_factors: List[RiskFactor] = Field(default_factory=list)
    
    # ─── Lifecycle ───
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    is_active: bool = Field(default=True)
    
    # ─── Versioning ───
    dataset_version: str = Field(default="1.0.0")
    city_code: str = Field(..., max_length=10)
    
    # ─── Validation ───
    
    @field_validator("zone_type")
    @classmethod
    def validate_geometry_consistency(cls, v, info):
        """Ensure geometry fields match zone_type."""
        # This runs before other fields are set, so we validate later
        return v
    
    def model_post_init(self, __context: Any) -> None:
        """Validate that geometry fields are consistent with zone_type."""
        if self.zone_type == ZoneType.POLYGON:
            if self.geometry is None:
                raise ValueError("Polygon zone must have 'geometry' field")
        elif self.zone_type == ZoneType.CIRCLE:
            if (
                self.center_lat is None
                or self.center_lon is None
                or self.radius_meters is None
            ):
                raise ValueError(
                    "Circle zone must have center_lat, center_lon, radius_meters"
                )
    
    # ─── Conversion Helpers ───
    
    def to_shapely(self) -> BaseGeometry:
        """Get a Shapely geometry for spatial operations."""
        if self.zone_type == ZoneType.POLYGON:
            return shapely_shape(self.geometry)
        else:
            # For circles, we use the geometry field if set (buffered)
            # Otherwise, build a Point (caller must buffer separately)
            from shapely.geometry import Point
            return Point(self.center_lon, self.center_lat)
    
    def to_geojson_feature(self) -> Dict[str, Any]:
        """Serialize as a GeoJSON Feature."""
        # For circles, we represent as Point + radius_meters property
        if self.zone_type == ZoneType.CIRCLE:
            geometry = {
                "type": "Point",
                "coordinates": [self.center_lon, self.center_lat],
            }
        else:
            geometry = self.geometry
        
        properties = {
            "zone_uuid": self.zone_uuid,
            "name": self.name,
            "description": self.description,
            "zone_type": self.zone_type.value,
            "center_lat": self.center_lat,
            "center_lon": self.center_lon,
            "radius_meters": self.radius_meters,
            "bbox": self.bbox.to_list(),
            "bbox_dict": {
                "min_lat": self.bbox.min_lat,
                "min_lon": self.bbox.min_lon,
                "max_lat": self.bbox.max_lat,
                "max_lon": self.bbox.max_lon,
            },
            "risk_category": self.risk_category,
            "risk_subcategory": self.risk_subcategory,
            "risk_score": round(self.risk_score, 4),
            "severity_level": int(self.severity_level),
            "is_time_dependent": self.is_time_dependent,
            "risk_hours_start": self.risk_hours.start_time if self.risk_hours else None,
            "risk_hours_end": self.risk_hours.end_time if self.risk_hours else None,
            "data_source": self.data_source,
            "source_confidence": self.source_confidence,
            "osm_id": self.osm_id,
            "osm_type": self.osm_type,
            "alert_message": self.alert_message,
            "risk_factors": [
                {
                    "name": f.name,
                    "score": round(f.score, 4),
                    "weight": f.weight,
                    "source": f.source,
                }
                for f in self.risk_factors
            ],
            "dataset_version": self.dataset_version,
            "city_code": self.city_code,
            "created_at": self.created_at,
            "is_active": self.is_active,
        }
        
        return {
            "type": "Feature",
            "id": self.zone_uuid,
            "geometry": geometry,
            "properties": properties,
        }