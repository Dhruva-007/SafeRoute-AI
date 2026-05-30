"""
Emergency Services Exporter.

Adds the emergency_services table to the existing SQLite database.
"""

import logging
import sqlite3
from pathlib import Path
from typing import List
from datetime import datetime

from src.models.emergency_service import EmergencyService


class EmergencyServicesExporter:
    """Adds emergency services to the existing SQLite database."""
    
    SCHEMA_SQL = """
    CREATE TABLE IF NOT EXISTS emergency_services (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        service_uuid    TEXT NOT NULL UNIQUE,
        osm_id          TEXT NOT NULL,
        osm_type        TEXT NOT NULL,
        
        -- Core info
        name            TEXT NOT NULL,
        service_type    TEXT NOT NULL CHECK(service_type IN (
            'hospital','clinic','police','fire_station','ambulance',
            'pharmacy_24h','shelter','helipad'
        )),
        priority        INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 3),
        
        -- Location
        latitude        REAL NOT NULL,
        longitude       REAL NOT NULL,
        
        -- Contact
        phone           TEXT,
        phone_emergency TEXT,
        website         TEXT,
        email           TEXT,
        
        -- Address
        address_full    TEXT,
        address_street  TEXT,
        address_housenumber TEXT,
        address_city    TEXT,
        address_postcode TEXT,
        address_state   TEXT,
        
        -- Hours
        opening_hours   TEXT,
        is_24_7         INTEGER DEFAULT 0,
        
        -- Capabilities
        has_emergency   INTEGER DEFAULT 0,
        speciality      TEXT,
        operator        TEXT,
        operator_type   TEXT,
        
        -- Accessibility
        wheelchair      TEXT,
        beds            INTEGER,
        
        -- Quality
        confidence_level INTEGER NOT NULL CHECK(confidence_level BETWEEN 1 AND 4),
        confidence_score REAL NOT NULL CHECK(confidence_score BETWEEN 0.0 AND 1.0),
        validation_flags TEXT,
        
        -- Metadata
        city_code       TEXT NOT NULL,
        data_source     TEXT NOT NULL,
        is_active       INTEGER DEFAULT 1,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_es_location 
        ON emergency_services(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_es_type 
        ON emergency_services(service_type, is_active);
    CREATE INDEX IF NOT EXISTS idx_es_priority 
        ON emergency_services(priority, confidence_level);
    CREATE INDEX IF NOT EXISTS idx_es_emergency 
        ON emergency_services(has_emergency, is_active);
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def export(
        self,
        services: List[EmergencyService],
        db_path: Path,
    ) -> dict:
        """Add emergency services to the existing database."""
        if not db_path.exists():
            raise FileNotFoundError(f"Database not found: {db_path}")
        
        conn = sqlite3.connect(str(db_path))
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        
        # Create schema (idempotent)
        conn.executescript(self.SCHEMA_SQL)
        
        # Clear existing emergency services for clean re-import
        conn.execute("DELETE FROM emergency_services")
        
        now = datetime.utcnow().isoformat()
        inserted = 0
        skipped = 0
        
        for svc in services:
            try:
                self._insert_service(conn, svc, now)
                inserted += 1
            except Exception as e:
                skipped += 1
                self.logger.warning(f"Failed to insert {svc.name}: {e}")
        
        # Update metadata
        conn.execute("""
            INSERT OR REPLACE INTO dataset_metadata (key, value)
            VALUES (?, ?)
        """, ("emergency_services_count", str(inserted)))
        
        conn.execute("""
            INSERT OR REPLACE INTO dataset_metadata (key, value)
            VALUES (?, ?)
        """, ("emergency_services_updated_at", now))
        
        conn.commit()
        conn.execute("VACUUM")
        conn.close()
        
        size_kb = db_path.stat().st_size / 1024
        self.logger.info(
            f"✓ Inserted {inserted} services (skipped: {skipped}). "
            f"DB size: {size_kb:.1f} KB"
        )
        
        return {
            "inserted": inserted,
            "skipped": skipped,
            "db_size_kb": size_kb,
        }
    
    def _insert_service(self, conn, svc: EmergencyService, now: str):
        """Insert a single emergency service."""
        import json
        
        conn.execute("""
            INSERT INTO emergency_services (
                service_uuid, osm_id, osm_type,
                name, service_type, priority,
                latitude, longitude,
                phone, phone_emergency, website, email,
                address_full, address_street, address_housenumber,
                address_city, address_postcode, address_state,
                opening_hours, is_24_7,
                has_emergency, speciality, operator, operator_type,
                wheelchair, beds,
                confidence_level, confidence_score, validation_flags,
                city_code, data_source, is_active, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            svc.service_uuid, svc.osm_id, svc.osm_type,
            svc.name, svc.service_type.value, int(svc.priority),
            svc.latitude, svc.longitude,
            svc.phone, svc.phone_emergency, svc.website, svc.email,
            svc.address_full, svc.address_street, svc.address_housenumber,
            svc.address_city, svc.address_postcode, svc.address_state,
            svc.opening_hours, 1 if svc.is_24_7 else 0,
            1 if svc.has_emergency else 0, svc.speciality, svc.operator, svc.operator_type,
            svc.wheelchair, svc.beds,
            int(svc.confidence_level), svc.confidence_score, json.dumps(svc.validation_flags),
            svc.city_code, svc.data_source, 1 if svc.is_active else 0,
            svc.created_at or now, svc.updated_at or now,
        ))