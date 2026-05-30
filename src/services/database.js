/**
 * Database Service
 * 
 * Manages the SQLite database loaded via sql.js.
 * Provides high-level query methods for the application.
 * 
 * Uses dynamic script loading to avoid Vite ESM issues with sql.js.
 */

class DatabaseService {
  constructor() {
    this.db = null;
    this.SQL = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.loadPromise = null;
  }
  
  /**
   * Initialize sql.js and load the database.
   * Idempotent — safe to call multiple times.
   */
  async initialize() {
    if (this.isInitialized) return;
    if (this.isLoading) return this.loadPromise;
    
    this.isLoading = true;
    this.loadPromise = this._doInitialize();
    
    try {
      await this.loadPromise;
      this.isInitialized = true;
    } finally {
      this.isLoading = false;
    }
  }
  
  async _doInitialize() {
    console.log('[DB] Loading sql.js...');
    
    // Load sql.js dynamically (avoids Vite ESM issues)
    const initSqlJs = await this._loadSqlJs();
    
    console.log('[DB] Initializing sql.js with WASM...');
    
    // Initialize sql.js with the WASM file location
    this.SQL = await initSqlJs({
      locateFile: (filename) => `/sql-wasm/${filename}`,
    });
    
    console.log('[DB] sql.js initialized, fetching database...');
    
    // Fetch the SQLite database file
    const response = await fetch('/data/hyd/hyd_risk_zones.db');
    if (!response.ok) {
      throw new Error(`Failed to fetch database: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    console.log(`[DB] Database fetched (${(uint8Array.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // Open the database
    this.db = new this.SQL.Database(uint8Array);
    
    // Verify schema
    const result = this.db.exec("SELECT COUNT(*) as count FROM risk_zones");
    const zoneCount = result[0].values[0][0];
    console.log(`[DB] ✓ Database loaded with ${zoneCount} risk zones`);
  }
  
  /**
   * Dynamically load sql.js as a script tag.
   * This avoids Vite's ESM import issues.
   */
  _loadSqlJs() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.initSqlJs) {
        resolve(window.initSqlJs);
        return;
      }
      
      // Load via script tag
      const script = document.createElement('script');
      script.src = '/sql-wasm/sql-wasm.js';
      script.async = true;
      
      script.onload = () => {
        if (window.initSqlJs) {
          console.log('[DB] sql.js script loaded successfully');
          resolve(window.initSqlJs);
        } else {
          reject(new Error('sql.js loaded but initSqlJs not found on window'));
        }
      };
      
      script.onerror = () => {
        reject(new Error('Failed to load sql.js script from /sql-wasm/sql-wasm.js'));
      };
      
      document.head.appendChild(script);
    });
  }
  
  /**
   * Get total zone count and metadata.
   */
  getMetadata() {
    this._ensureReady();
    
    const result = this.db.exec(`
      SELECT key, value FROM dataset_metadata
    `);
    
    if (!result[0]) return {};
    
    const metadata = {};
    for (const [key, value] of result[0].values) {
      metadata[key] = value;
    }
    
    return metadata;
  }
  
  /**
   * Get all zones (use sparingly — for map rendering).
   */
  getAllZones() {
    this._ensureReady();
    
    const result = this.db.exec(`
      SELECT 
        id, zone_uuid, name, zone_type,
        geometry_geojson, center_lat, center_lon, radius_meters,
        bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
        risk_category, risk_score, severity_level,
        is_time_dependent, risk_hours_start, risk_hours_end,
        alert_message
      FROM risk_zones
      WHERE is_active = 1
    `);
    
    return this._rowsToObjects(result[0]);
  }
  
  /**
   * Get zones near a point (using bbox pre-filter).
   * Critical for geofencing performance.
   */
  getZonesNearPoint(lat, lon, radiusKm = 1.0) {
    this._ensureReady();
    
    // Approximate degrees per km (varies by latitude)
    const degLat = radiusKm / 111;
    const degLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    
    const stmt = this.db.prepare(`
      SELECT 
        id, zone_uuid, name, zone_type,
        geometry_geojson, center_lat, center_lon, radius_meters,
        bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
        risk_category, risk_score, severity_level,
        is_time_dependent, risk_hours_start, risk_hours_end,
        alert_message
      FROM risk_zones
      WHERE is_active = 1
        AND ? BETWEEN bbox_min_lat - ? AND bbox_max_lat + ?
        AND ? BETWEEN bbox_min_lon - ? AND bbox_max_lon + ?
    `);
    
    const zones = [];
    stmt.bind([lat, degLat, degLat, lon, degLon, degLon]);
    
    while (stmt.step()) {
      zones.push(stmt.getAsObject());
    }
    
    stmt.free();
    return zones;
  }
  
  /**
   * Get zones by severity level (for filtered map view).
   */
  getZonesBySeverity(minSeverity = 1) {
    this._ensureReady();
    
    const result = this.db.exec(`
      SELECT * FROM risk_zones
      WHERE is_active = 1 AND severity_level >= ${minSeverity}
    `);
    
    return this._rowsToObjects(result[0]);
  }
  
  /**
   * Get polygon vertices for a specific zone.
   */
  getPolygonVertices(zoneId) {
    this._ensureReady();
    
    const stmt = this.db.prepare(`
      SELECT ring_index, vertex_order, latitude, longitude
      FROM polygon_vertices
      WHERE zone_id = ?
      ORDER BY ring_index, vertex_order
    `);
    
    const vertices = [];
    stmt.bind([zoneId]);
    
    while (stmt.step()) {
      vertices.push(stmt.getAsObject());
    }
    
    stmt.free();
    return vertices;
  }
  
  /**
   * Get statistics for UI display.
   */
  getStatistics() {
    this._ensureReady();
    
    const total = this.db.exec(
      "SELECT COUNT(*) FROM risk_zones WHERE is_active = 1"
    )[0].values[0][0];
    
    const bySeverity = {};
    const sevResult = this.db.exec(`
      SELECT severity_level, COUNT(*) 
      FROM risk_zones 
      WHERE is_active = 1
      GROUP BY severity_level
    `);
    if (sevResult[0]) {
      for (const [level, count] of sevResult[0].values) {
        bySeverity[level] = count;
      }
    }
    
    const byCategory = {};
    const catResult = this.db.exec(`
      SELECT risk_category, COUNT(*) 
      FROM risk_zones 
      WHERE is_active = 1
      GROUP BY risk_category
    `);
    if (catResult[0]) {
      for (const [cat, count] of catResult[0].values) {
        byCategory[cat] = count;
      }
    }
    
    return { total, bySeverity, byCategory };
  }
  
  /**
   * Convert sql.js result rows to objects.
   */
  _rowsToObjects(result) {
    if (!result) return [];
    
    const { columns, values } = result;
    return values.map((row) => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }
  
  _ensureReady() {
    if (!this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Close the database (rare — usually keep open).
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }

    /**
   * Get all zones formatted as a GeoJSON FeatureCollection.
   * Optimized for MapLibre rendering.
   */
  getAllZonesAsGeoJSON(minSeverity = 1) {
    this._ensureReady();
    
    const zones = this.getZonesBySeverity(minSeverity);
    const features = [];
    
    for (const zone of zones) {
      let geometry;
      
      if (zone.zone_type === 'polygon') {
        // Parse stored GeoJSON or reconstruct from vertices
        if (zone.geometry_geojson) {
          try {
            geometry = JSON.parse(zone.geometry_geojson);
          } catch (e) {
            // Fallback: reconstruct from vertices
            geometry = this._reconstructPolygon(zone.id);
          }
        } else {
          geometry = this._reconstructPolygon(zone.id);
        }
      } else if (zone.zone_type === 'circle') {
        // For circles, store as a buffered polygon for MapLibre
        // MapLibre doesn't have native circle rendering for layers
        geometry = this._circleToPolygon(
          zone.center_lat,
          zone.center_lon,
          zone.radius_meters
        );
      }
      
      if (!geometry) continue;
      
      features.push({
        type: 'Feature',
        id: zone.id,
        geometry: geometry,
        properties: {
          zone_uuid: zone.zone_uuid,
          name: zone.name,
          risk_category: zone.risk_category,
          risk_score: zone.risk_score,
          severity_level: zone.severity_level,
          alert_message: zone.alert_message,
          is_time_dependent: zone.is_time_dependent,
        },
      });
    }
    
    return {
      type: 'FeatureCollection',
      features: features,
    };
  }
  
  /**
   * Reconstruct a polygon from vertices table.
   * Used as fallback when geometry_geojson is missing.
   */
  _reconstructPolygon(zoneId) {
    const vertices = this.getPolygonVertices(zoneId);
    if (vertices.length === 0) return null;
    
    // Group vertices by ring_index
    const rings = {};
    for (const v of vertices) {
      if (!rings[v.ring_index]) rings[v.ring_index] = [];
      rings[v.ring_index].push([v.longitude, v.latitude]);
    }
    
    // Build coordinates array
    const ringIndices = Object.keys(rings).map(Number).sort();
    const coordinates = ringIndices.map((idx) => rings[idx]);
    
    return {
      type: 'Polygon',
      coordinates: coordinates,
    };
  }
  
  /**
   * Convert a circle (center + radius) to an approximated polygon.
   * For map rendering only.
   */
  _circleToPolygon(centerLat, centerLon, radiusMeters, sides = 32) {
    const coordinates = [];
    const earthRadius = 6371000; // meters
    
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * 2 * Math.PI;
      
      // Convert radius to degrees
      const dLat = (radiusMeters * Math.cos(angle)) / earthRadius * (180 / Math.PI);
      const dLon = (radiusMeters * Math.sin(angle)) / 
        (earthRadius * Math.cos(centerLat * Math.PI / 180)) * (180 / Math.PI);
      
      coordinates.push([centerLon + dLon, centerLat + dLat]);
    }
    
    return {
      type: 'Polygon',
      coordinates: [coordinates],
    };
  }

    // ════════════════════════════════════════════════════════════════
  // EMERGENCY SERVICES METHODS (Phase 1.5)
  // ════════════════════════════════════════════════════════════════
  
  /**
   * Get all emergency services.
   */
  getAllEmergencyServices(minConfidence = 2) {
    this._ensureReady();
    
    const result = this.db.exec(`
      SELECT * FROM emergency_services
      WHERE is_active = 1 AND confidence_level >= ${minConfidence}
      ORDER BY priority ASC, confidence_score DESC
    `);
    
    return this._rowsToObjects(result[0]);
  }
  
  /**
   * Get emergency services near a point, sorted by distance.
   * Uses bbox pre-filter for performance.
   */
  getEmergencyServicesNearby(lat, lon, radiusKm = 5.0, minConfidence = 2) {
    this._ensureReady();
    
    const degLat = radiusKm / 111;
    const degLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    
    const stmt = this.db.prepare(`
      SELECT 
        id, service_uuid, name, service_type, priority,
        latitude, longitude,
        phone, phone_emergency, website, email,
        address_full, address_street, address_city,
        opening_hours, is_24_7,
        has_emergency, speciality, operator,
        wheelchair, beds,
        confidence_level, confidence_score
      FROM emergency_services
      WHERE is_active = 1
        AND confidence_level >= ?
        AND latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
    `);
    
    const services = [];
    stmt.bind([minConfidence, lat - degLat, lat + degLat, lon - degLon, lon + degLon]);
    
    while (stmt.step()) {
      const svc = stmt.getAsObject();
      // Add precise distance
      svc.distance_km = this._haversineKm(lat, lon, svc.latitude, svc.longitude);
      services.push(svc);
    }
    
    stmt.free();
    
    // Sort by distance
    services.sort((a, b) => a.distance_km - b.distance_km);
    
    // Filter by precise distance (bbox is approximate)
    return services.filter(s => s.distance_km <= radiusKm);
  }
  
  /**
   * Get emergency services by type.
   */
  getEmergencyServicesByType(serviceType, minConfidence = 2) {
    this._ensureReady();
    
    const stmt = this.db.prepare(`
      SELECT * FROM emergency_services
      WHERE is_active = 1 
        AND confidence_level >= ?
        AND service_type = ?
      ORDER BY confidence_score DESC, name
    `);
    
    const services = [];
    stmt.bind([minConfidence, serviceType]);
    
    while (stmt.step()) {
      services.push(stmt.getAsObject());
    }
    
    stmt.free();
    return services;
  }
  
  /**
   * Get emergency services as GeoJSON for map rendering.
   */
  getEmergencyServicesAsGeoJSON(minConfidence = 2) {
    this._ensureReady();
    
    const services = this.getAllEmergencyServices(minConfidence);
    
    return {
      type: 'FeatureCollection',
      features: services.map(svc => ({
        type: 'Feature',
        id: svc.id,
        geometry: {
          type: 'Point',
          coordinates: [svc.longitude, svc.latitude],
        },
        properties: {
          service_uuid: svc.service_uuid,
          name: svc.name,
          service_type: svc.service_type,
          priority: svc.priority,
          phone: svc.phone,
          address_full: svc.address_full,
          opening_hours: svc.opening_hours,
          is_24_7: svc.is_24_7,
          has_emergency: svc.has_emergency,
          confidence_level: svc.confidence_level,
          confidence_score: svc.confidence_score,
        },
      })),
    };
  }
  
  /**
   * Get statistics for emergency services.
   */
  getEmergencyServicesStats() {
    this._ensureReady();
    
    const total = this.db.exec(
      "SELECT COUNT(*) FROM emergency_services WHERE is_active = 1"
    )[0].values[0][0];
    
    const byType = {};
    const typeResult = this.db.exec(`
      SELECT service_type, COUNT(*) as cnt
      FROM emergency_services
      WHERE is_active = 1
      GROUP BY service_type
    `);
    if (typeResult[0]) {
      for (const [type, count] of typeResult[0].values) {
        byType[type] = count;
      }
    }
    
    return { total, byType };
  }
  
  /**
   * Internal helper: Haversine distance in km.
   */
  _haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

// Singleton instance
const databaseService = new DatabaseService();
export default databaseService;