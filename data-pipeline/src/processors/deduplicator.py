"""
Deduplicator: merges overlapping or adjacent zones of the same category.

OPTIMIZED VERSION using R-tree spatial indexing.
Expected speedup: 50-100× compared to naive O(n²) approach.

Strategy:
1. Group zones by risk_category
2. Build R-tree spatial index over bounding boxes
3. For each zone, query R-tree for candidates (only nearby zones)
4. Apply IoU/touch check only on candidates
5. Merge using unary_union
"""

import logging
from typing import List, Dict
from collections import defaultdict

from shapely.geometry import shape as shapely_shape, mapping
from shapely.ops import unary_union
from shapely.geometry.base import BaseGeometry
from rtree import index as rtree_index

from src.models.risk_zone import RiskZone, BoundingBox, ZoneType


class Deduplicator:
    """Merges spatially overlapping zones of the same category using R-tree."""
    
    def __init__(
        self,
        iou_threshold: float = 0.75,
        min_area_m2: float = 100,
    ):
        self.logger = logging.getLogger(__name__)
        self.iou_threshold = iou_threshold
        self.min_area_m2 = min_area_m2
    
    def deduplicate(self, zones: List[RiskZone]) -> List[RiskZone]:
        """
        Main entry point.
        
        Groups by category, then merges within each category.
        """
        if not zones:
            return zones
        
        self.logger.info(f"Deduplicating {len(zones)} zones (R-tree optimized)...")
        
        # Group by category
        by_category: Dict[str, List[RiskZone]] = defaultdict(list)
        for zone in zones:
            by_category[zone.risk_category].append(zone)
        
        merged_zones: List[RiskZone] = []
        
        for category, cat_zones in by_category.items():
            self.logger.info(f"  Processing '{category}': {len(cat_zones)} zones")
            
            if category in ("poorly_lit_roads", "accident_junction"):
                # Linear/corridor zones — aggressive merging based on touching/overlap
                merged = self._merge_with_rtree(cat_zones, merge_strategy="touch_or_overlap")
            else:
                # Area zones — IoU-based merge
                merged = self._merge_with_rtree(cat_zones, merge_strategy="iou")
            
            merged_zones.extend(merged)
            self.logger.info(f"    → Merged to {len(merged)} zones")
        
        reduction = ((len(zones) - len(merged_zones)) / len(zones)) * 100
        self.logger.info(
            f"Deduplication complete: {len(zones)} → {len(merged_zones)} zones "
            f"({reduction:.1f}% reduction)"
        )
        
        return merged_zones
    
    def _merge_with_rtree(
        self,
        zones: List[RiskZone],
        merge_strategy: str = "iou",
    ) -> List[RiskZone]:
        """
        Merge zones using R-tree spatial index for efficiency.
        
        Args:
            zones: List of RiskZone objects (same category)
            merge_strategy: 
                "iou"             - merge if IoU >= threshold
                "touch_or_overlap" - merge if zones touch or overlap (for roads)
        """
        n = len(zones)
        if n <= 1:
            return zones
        
        # ─── Step 1: Build R-tree index over bounding boxes ───
        idx = rtree_index.Index()
        cached_geoms: Dict[int, BaseGeometry] = {}
        
        for i, zone in enumerate(zones):
            bbox = zone.bbox
            # R-tree uses (left, bottom, right, top) = (min_lon, min_lat, max_lon, max_lat)
            idx.insert(i, (
                bbox.min_lon, bbox.min_lat,
                bbox.max_lon, bbox.max_lat
            ))
            # Cache shapely geometry to avoid re-parsing
            cached_geoms[i] = zone.to_shapely()
        
        # ─── Step 2: Find groups using union-find ───
        # parent[i] = the representative of i's group
        parent = list(range(n))
        
        def find(x: int) -> int:
            """Find root of group containing x (with path compression)."""
            while parent[x] != x:
                parent[x] = parent[parent[x]]  # path compression
                x = parent[x]
            return x
        
        def union(x: int, y: int):
            """Merge two groups."""
            rx, ry = find(x), find(y)
            if rx != ry:
                parent[rx] = ry
        
        # ─── Step 3: For each zone, find candidates via R-tree, then check ───
        for i in range(n):
            zone_a = zones[i]
            geom_a = cached_geoms[i]
            bbox_a = zone_a.bbox
            
            # Query R-tree for candidates whose bbox overlaps
            # Use slight expansion for "touching" zones in road merging
            expand = 0.0001 if merge_strategy == "touch_or_overlap" else 0.0
            
            candidates = list(idx.intersection((
                bbox_a.min_lon - expand,
                bbox_a.min_lat - expand,
                bbox_a.max_lon + expand,
                bbox_a.max_lat + expand,
            )))
            
            for j in candidates:
                if j <= i:  # avoid double-checking and self-comparison
                    continue
                
                # Skip if already in same group
                if find(i) == find(j):
                    continue
                
                geom_b = cached_geoms[j]
                
                try:
                    if merge_strategy == "iou":
                        # Compute IoU
                        intersection_area = geom_a.intersection(geom_b).area
                        union_area = geom_a.union(geom_b).area
                        
                        if union_area > 0:
                            iou = intersection_area / union_area
                            if iou >= self.iou_threshold:
                                union(i, j)
                    
                    elif merge_strategy == "touch_or_overlap":
                        # For road corridors: merge if touching or overlapping
                        if geom_a.intersects(geom_b) or geom_a.touches(geom_b):
                            union(i, j)
                
                except Exception:
                    # Geometry operation failed — skip
                    continue
        
        # ─── Step 4: Group zones by their root ───
        groups: Dict[int, List[int]] = defaultdict(list)
        for i in range(n):
            groups[find(i)].append(i)
        
        # ─── Step 5: Merge each group into a single zone ───
        merged_zones = []
        for root, indices in groups.items():
            group_zones = [zones[i] for i in indices]
            
            if len(group_zones) == 1:
                merged_zones.append(group_zones[0])
            else:
                merged = self._merge_group(group_zones, [cached_geoms[i] for i in indices])
                if merged:
                    merged_zones.append(merged)
        
        return merged_zones
    
    def _merge_group(
        self,
        group: List[RiskZone],
        cached_geoms: List[BaseGeometry] = None,
    ) -> RiskZone:
        """Merge a group of zones into a single unified zone."""
        if len(group) == 1:
            return group[0]
        
        # Use cached geometries if provided, otherwise compute
        if cached_geoms is None:
            geometries = [z.to_shapely() for z in group]
        else:
            geometries = cached_geoms
        
        try:
            merged_geom = unary_union(geometries)
        except Exception as e:
            self.logger.warning(f"Failed to union geometries: {e}")
            return group[0]
        
        # Take the zone with highest risk score as the "base"
        base = max(group, key=lambda z: z.risk_score)
        
        # Compute new bounding box
        bbox = BoundingBox.from_shapely_bounds(merged_geom.bounds)
        
        # Create merged zone
        merged_zone = RiskZone(
            zone_uuid=base.zone_uuid,
            name=f"{base.name} (+{len(group)-1} merged)" if len(group) > 1 else base.name,
            description=base.description,
            zone_type=ZoneType.POLYGON,
            geometry=mapping(merged_geom),
            center_lat=None,
            center_lon=None,
            radius_meters=None,
            bbox=bbox,
            risk_category=base.risk_category,
            risk_subcategory=base.risk_subcategory,
            risk_score=base.risk_score,
            severity_level=base.severity_level,
            is_time_dependent=base.is_time_dependent,
            risk_hours=base.risk_hours,
            data_source="merged" if len(group) > 1 else base.data_source,
            source_confidence=min(z.source_confidence for z in group),
            osm_id=None if len(group) > 1 else base.osm_id,
            osm_type=None if len(group) > 1 else base.osm_type,
            alert_message=base.alert_message,
            risk_factors=base.risk_factors,
            city_code=base.city_code,
            dataset_version=base.dataset_version,
        )
        
        return merged_zone