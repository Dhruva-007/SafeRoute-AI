"""
SQLite exporter: produces the offline database for the PWA.

Schema is optimized for:
- Fast bbox queries (spatial pre-filtering)
- Compact storage (WAL mode, no redundancy)
- Easy querying via sql.js in the browser
"""

import logging
import sqlite3
from pathlib import Path
from typing import List
from datetime import datetime

from src.models.risk_zone import RiskZone, ZoneType


class SQLiteExporter:
    """Exports RiskZones to a SQLite database."""
    
    SCHEMA_SQL = """
    -- ════════════════════════════════════════════════════════════
    -- SAFEROUTE RISK ZONES SCHEMA v1.0
    -- ════════════════════════════════════════════════════════════
    
    -- Main zones table
    CREATE TABLE IF NOT EXISTS risk_zones (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_uuid       TEXT NOT NULL UNIQUE,
        name            TEXT NOT NULL,
        description     TEXT,
        zone_type       TEXT NOT NULL CHECK(zone_type IN ('polygon','circle')),
        
        -- Geometry storage
        geometry_geojson TEXT,           -- GeoJSON string for polygons
        center_lat      REAL,            -- For circles
        center_lon      REAL,
        radius_meters   REAL,
        
        -- Bounding box (for fast spatial pre-filtering)
        bbox_min_lat    REAL NOT NULL,
        bbox_min_lon    REAL NOT NULL,
        bbox_max_lat    REAL NOT NULL,
        bbox_max_lon    REAL NOT NULL,
        
        -- Risk classification
        risk_category   TEXT NOT NULL,
        risk_subcategory TEXT,
        risk_score      REAL NOT NULL CHECK(risk_score BETWEEN 0.0 AND 1.0),
        severity_level  INTEGER NOT NULL CHECK(severity_level BETWEEN 1 AND 4),
        
        -- Time-based risk
        is_time_dependent INTEGER DEFAULT 0,
        risk_hours_start TEXT,
        risk_hours_end  TEXT,
        
        -- Provenance
        data_source     TEXT NOT NULL,
        source_confidence REAL NOT NULL CHECK(source_confidence BETWEEN 0.0 AND 1.0),
        osm_id          TEXT,
        osm_type        TEXT,
        
        -- Alert
        alert_message   TEXT NOT NULL,
        
        -- Lifecycle
        is_active       INTEGER DEFAULT 1,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        
        -- Versioning
        dataset_version TEXT NOT NULL,
        city_code       TEXT NOT NULL
    );
    
    -- Polygon vertices table (denormalized for fast geofencing checks)
    CREATE TABLE IF NOT EXISTS polygon_vertices (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_id     INTEGER NOT NULL REFERENCES risk_zones(id) ON DELETE CASCADE,
        ring_index  INTEGER NOT NULL,    -- 0 = outer, 1+ = inner holes
        vertex_order INTEGER NOT NULL,
        latitude    REAL NOT NULL,
        longitude   REAL NOT NULL
    );
    
    -- Risk factor decomposition (for transparency)
    CREATE TABLE IF NOT EXISTS risk_factors (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        zone_id     INTEGER NOT NULL REFERENCES risk_zones(id) ON DELETE CASCADE,
        factor_name TEXT NOT NULL,
        factor_score REAL NOT NULL,
        factor_weight REAL NOT NULL,
        source      TEXT
    );
    
    -- Dataset metadata
    CREATE TABLE IF NOT EXISTS dataset_metadata (
        key             TEXT PRIMARY KEY,
        value           TEXT NOT NULL
    );
    
    -- Indices for performance
    CREATE INDEX IF NOT EXISTS idx_bbox 
        ON risk_zones(bbox_min_lat, bbox_max_lat, bbox_min_lon, bbox_max_lon);
    CREATE INDEX IF NOT EXISTS idx_active 
        ON risk_zones(city_code, is_active, severity_level);
    CREATE INDEX IF NOT EXISTS idx_category 
        ON risk_zones(risk_category);
    CREATE INDEX IF NOT EXISTS idx_vertices 
        ON polygon_vertices(zone_id, ring_index, vertex_order);
    CREATE INDEX IF NOT EXISTS idx_factors 
        ON risk_factors(zone_id);
    """
    
    def __init__(self, dataset_version: str = "1.0.0"):
        self.logger = logging.getLogger(__name__)
        self.dataset_version = dataset_version
    
    def export(
        self,
        zones: List[RiskZone],
        output_path: Path,
        city_name: str,
        city_code: str,
    ) -> dict:
        """
        Export zones to a SQLite database.
        
        Returns:
            dict with path and size of generated database
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Delete existing file
        if output_path.exists():
            output_path.unlink()
        
        # Connect with optimized settings
        conn = sqlite3.connect(str(output_path))
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA cache_size=10000")
        
        # Create schema
        conn.executescript(self.SCHEMA_SQL)
        
        # Insert all zones
        now = datetime.utcnow().isoformat()
        inserted = 0
        skipped = 0
        
        for zone in zones:
            try:
                self._insert_zone(conn, zone, now)
                inserted += 1
            except Exception as e:
                skipped += 1
                self.logger.warning(f"Failed to insert zone {zone.zone_uuid}: {e}")
        
        # Insert metadata
        self._insert_metadata(conn, zones, city_name, city_code)
        
        # Optimize database
        conn.commit()
        conn.execute("VACUUM")
        conn.execute("ANALYZE")
        conn.close()
        
        size_kb = output_path.stat().st_size / 1024
        self.logger.info(
            f"  ✓ SQLite:     {output_path.name} ({size_kb:.1f} KB, "
            f"{inserted} inserted, {skipped} skipped)"
        )
        
        return {
            "path": str(output_path),
            "size_kb": round(size_kb, 1),
            "zones_inserted": inserted,
            "zones_skipped": skipped,
        }
    
    def _insert_zone(self, conn: sqlite3.Connection, zone: RiskZone, now: str):
        """Insert a single zone with its vertices and risk factors."""
        import json
        
        # Insert main zone record
        cursor = conn.execute("""
            INSERT INTO risk_zones (
                zone_uuid, name, description, zone_type,
                geometry_geojson, center_lat, center_lon, radius_meters,
                bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
                risk_category, risk_subcategory, risk_score, severity_level,
                is_time_dependent, risk_hours_start, risk_hours_end,
                data_source, source_confidence, osm_id, osm_type,
                alert_message, is_active, created_at, updated_at,
                dataset_version, city_code
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            zone.zone_uuid,
            zone.name,
            zone.description or "",
            zone.zone_type.value,
            None,
            zone.center_lat,
            zone.center_lon,
            zone.radius_meters,
            zone.bbox.min_lat,
            zone.bbox.min_lon,
            zone.bbox.max_lat,
            zone.bbox.max_lon,
            zone.risk_category,
            zone.risk_subcategory or "",
            zone.risk_score,
            int(zone.severity_level),
            1 if zone.is_time_dependent else 0,
            zone.risk_hours.start_time if zone.risk_hours else None,
            zone.risk_hours.end_time if zone.risk_hours else None,
            zone.data_source,
            zone.source_confidence,
            zone.osm_id,
            zone.osm_type,
            zone.alert_message,
            1 if zone.is_active else 0,
            zone.created_at or now,
            zone.updated_at or now,
            zone.dataset_version,
            zone.city_code,
        ))
        
        zone_id = cursor.lastrowid
        
        # Insert polygon vertices
        if zone.zone_type == ZoneType.POLYGON and zone.geometry:
            self._insert_polygon_vertices(conn, zone_id, zone.geometry)
        
        # Insert risk factors
        for factor in zone.risk_factors:
            conn.execute("""
                INSERT INTO risk_factors (
                    zone_id, factor_name, factor_score, factor_weight, source
                ) VALUES (?,?,?,?,?)
            """, (
                zone_id,
                factor.name,
                factor.score,
                factor.weight,
                factor.source,
            ))
    
    def _insert_polygon_vertices(
        self, conn: sqlite3.Connection, zone_id: int, geometry: dict
    ):
        """Insert polygon vertices to the dedicated table."""
        geom_type = geometry.get("type")
        coords = geometry.get("coordinates", [])
        
        if geom_type == "Polygon":
            # Polygon: coords is [outer_ring, inner_ring1, inner_ring2, ...]
            for ring_index, ring in enumerate(coords):
                for vertex_order, (lon, lat) in enumerate(ring):
                    conn.execute("""
                        INSERT INTO polygon_vertices (
                            zone_id, ring_index, vertex_order, latitude, longitude
                        ) VALUES (?,?,?,?,?)
                    """, (zone_id, ring_index, vertex_order, lat, lon))
        
        elif geom_type == "MultiPolygon":
            # MultiPolygon: coords is [polygon1, polygon2, ...]
            # Each polygon is [outer_ring, inner_ring1, ...]
            ring_offset = 0
            for polygon in coords:
                for ring_idx, ring in enumerate(polygon):
                    for vertex_order, (lon, lat) in enumerate(ring):
                        conn.execute("""
                            INSERT INTO polygon_vertices (
                                zone_id, ring_index, vertex_order, latitude, longitude
                            ) VALUES (?,?,?,?,?)
                        """, (zone_id, ring_offset + ring_idx, vertex_order, lat, lon))
                ring_offset += len(polygon)
    
    def _insert_metadata(
        self,
        conn: sqlite3.Connection,
        zones: List[RiskZone],
        city_name: str,
        city_code: str,
    ):
        """Insert dataset metadata as key-value pairs."""
        from collections import Counter
        
        severity_counts = Counter(z.severity_level.value for z in zones)
        category_counts = Counter(z.risk_category for z in zones)
        
        metadata = {
            "schema_version": "1.0.0",
            "dataset_version": self.dataset_version,
            "city_code": city_code,
            "city_name": city_name,
            "total_zones": str(len(zones)),
            "generated_at": datetime.utcnow().isoformat(),
            "severity_critical": str(severity_counts.get(4, 0)),
            "severity_high": str(severity_counts.get(3, 0)),
            "severity_medium": str(severity_counts.get(2, 0)),
            "severity_low": str(severity_counts.get(1, 0)),
        }
        
        # Add per-category counts
        for cat, count in category_counts.items():
            metadata[f"category_{cat}"] = str(count)
        
        for key, value in metadata.items():
            conn.execute("""
                INSERT OR REPLACE INTO dataset_metadata (key, value)
                VALUES (?, ?)
            """, (key, value))