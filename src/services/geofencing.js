/**
 * Geofencing Service
 * 
 * Orchestrates the complete geofencing pipeline:
 * GPS → Filter → Spatial Query → Containment Check → State → Events
 */

import { GPSDriftFilter } from '../utils/gpsFilter.js';
import { GeofenceStateManager } from '../utils/geofenceState.js';
import { 
  isInsideCircle, 
  isInsideGeoJSON, 
  isInsideBbox,
  haversineMeters 
} from '../utils/geometry.js';
import databaseService from './database.js';

class GeofencingService {
  constructor() {
    this.driftFilter = new GPSDriftFilter({
      maxAccuracyMeters: 50,
      maxSpeedKmh: 200,
      smoothingAlpha: 0.3,
    });
    
    this.stateManager = new GeofenceStateManager({
      confirmationThreshold: 3,
      alertCooldownMs: 5 * 60 * 1000,
    });
    
    this.zonesById = new Map(); // Cache full zone data by ID
    this.eventListeners = new Set();
    this.isRunning = false;
    this.watchId = null;
    
    // Performance metrics
    this.metrics = {
      gpsUpdates: 0,
      lastProcessingTime: 0,
      candidateZonesAvg: 0,
      lastUpdate: null,
    };
    
    this.lastProcessedLocation = null;
    this.minDistanceMoved = 5; // meters
  }
  
  /**
   * Initialize: cache all zones for fast lookup.
   * Must be called after database is ready.
   */
  async initialize() {
    if (!databaseService.isInitialized) {
      throw new Error('Database must be initialized first');
    }
    
    console.log('[Geofencing] Loading zones into memory...');
    const startTime = performance.now();
    
    // Load all zones — we'll filter by bbox at query time
    const zones = databaseService.getAllZones();
    
    for (const zone of zones) {
      // Pre-parse geometry for polygon zones
      let parsedGeometry = null;
      if (zone.zone_type === 'polygon' && zone.geometry_geojson) {
        try {
          parsedGeometry = JSON.parse(zone.geometry_geojson);
        } catch (e) {
          // Reconstruct from vertices
          parsedGeometry = this._buildGeometryFromVertices(zone.id);
        }
      } else if (zone.zone_type === 'polygon') {
        parsedGeometry = this._buildGeometryFromVertices(zone.id);
      }
      
      this.zonesById.set(zone.id, {
        ...zone,
        parsedGeometry,
      });
    }
    
    const elapsed = (performance.now() - startTime).toFixed(0);
    console.log(`[Geofencing] Loaded ${this.zonesById.size} zones in ${elapsed}ms`);
  }
  
  _buildGeometryFromVertices(zoneId) {
    const vertices = databaseService.getPolygonVertices(zoneId);
    if (vertices.length === 0) return null;
    
    const rings = {};
    for (const v of vertices) {
      if (!rings[v.ring_index]) rings[v.ring_index] = [];
      rings[v.ring_index].push([v.longitude, v.latitude]);
    }
    
    const ringIndices = Object.keys(rings).map(Number).sort();
    const coordinates = ringIndices.map(idx => rings[idx]);
    
    return {
      type: 'Polygon',
      coordinates,
    };
  }
  
  /**
   * Subscribe to geofence events.
   * Callback receives: { type, zone, location, timestamp }
   */
  addEventListener(callback) {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }
  
  _emit(event) {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[Geofencing] Listener error:', e);
      }
    }
  }
  
  /**
   * Start GPS tracking and geofence detection.
   */
  start() {
    if (this.isRunning) return;
    if (!navigator.geolocation) {
      throw new Error('Geolocation API not available');
    }
    
    console.log('[Geofencing] Starting GPS tracking...');
    this.isRunning = true;
    
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this._onLocationUpdate(position),
      (error) => this._onGPSError(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 8000,
      }
    );
    
    this._emit({ type: 'TRACKING_STARTED', timestamp: Date.now() });
  }
  
  stop() {
    if (!this.isRunning) return;
    
    console.log('[Geofencing] Stopping GPS tracking');
    
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    this.isRunning = false;
    this.driftFilter.reset();
    this.stateManager.reset();
    
    this._emit({ type: 'TRACKING_STOPPED', timestamp: Date.now() });
  }
  
  _onGPSError(error) {
    console.error('[Geofencing] GPS error:', error);
    this._emit({
      type: 'GPS_ERROR',
      error: error.message,
      code: error.code,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Process a single GPS update through the pipeline.
   */
  _onLocationUpdate(position) {
    this.metrics.gpsUpdates++;
    const startTime = performance.now();
    
    const { latitude, longitude, accuracy } = position.coords;
    const timestamp = position.timestamp;
    
    // ─── Step 1: Filter GPS reading ───
    const filtered = this.driftFilter.filter(latitude, longitude, accuracy, timestamp);
    if (!filtered) {
      // Reading rejected (low accuracy or implausible jump)
      return;
    }
    
    const { lat, lon } = filtered;
    
    // ─── Step 2: Movement threshold check ───
    if (this.lastProcessedLocation) {
      const dist = haversineMeters(
        lat, lon,
        this.lastProcessedLocation.lat,
        this.lastProcessedLocation.lon
      );
      if (dist < this.minDistanceMoved) {
        return; // Not enough movement
      }
    }
    
    this.lastProcessedLocation = { lat, lon };
    
    // Emit location update
    this._emit({
      type: 'LOCATION_UPDATE',
      location: filtered,
      timestamp,
    });
    
    // ─── Step 3: Spatial pre-filter via bbox ───
    const candidateZones = this._findCandidateZones(lat, lon);
    
    // ─── Step 4: Precise containment check ───
    const allEvents = [];
    const checkedZoneIds = [];
    
    for (const zone of candidateZones) {
      checkedZoneIds.push(zone.id);
      
      // Time-based filtering
      if (zone.is_time_dependent && !this._isWithinRiskHours(zone, timestamp)) {
        continue;
      }
      
      let isInside = false;
      
      if (zone.zone_type === 'circle') {
        isInside = isInsideCircle(
          lat, lon,
          zone.center_lat, zone.center_lon,
          zone.radius_meters
        );
      } else if (zone.zone_type === 'polygon' && zone.parsedGeometry) {
        isInside = isInsideGeoJSON(lat, lon, zone.parsedGeometry);
      }
      
      const events = this.stateManager.processZone(zone.id, isInside, timestamp);
      
      for (const event of events) {
        allEvents.push({
          ...event,
          zone: zone,
          location: filtered,
        });
      }
    }
    
    // ─── Step 5: Detect exits for zones no longer in candidate list ───
    const exitEvents = this.stateManager.processExitsForMissingZones(
      checkedZoneIds, 
      timestamp
    );
    for (const event of exitEvents) {
      const zone = this.zonesById.get(event.zoneId);
      if (zone) {
        allEvents.push({ ...event, zone, location: filtered });
      }
    }
    
    // ─── Step 6: Emit events ───
    for (const event of allEvents) {
      this._emit({
        type: event.type === 'ENTRY' ? 'GEOFENCE_ENTRY' : 'GEOFENCE_EXIT',
        zone: event.zone,
        location: event.location,
        timestamp: event.timestamp,
      });
    }
    
    // ─── Update Metrics ───
    this.metrics.lastProcessingTime = performance.now() - startTime;
    this.metrics.candidateZonesAvg = 
      (this.metrics.candidateZonesAvg * 0.9) + (candidateZones.length * 0.1);
    this.metrics.lastUpdate = timestamp;
  }
  
  /**
   * Find zones whose bounding box contains the user location.
   * Fast O(n) pre-filter.
   */
  _findCandidateZones(lat, lon) {
    const candidates = [];
    
    for (const zone of this.zonesById.values()) {
      // Quick bbox check
      if (lat >= zone.bbox_min_lat && lat <= zone.bbox_max_lat &&
          lon >= zone.bbox_min_lon && lon <= zone.bbox_max_lon) {
        candidates.push(zone);
      }
    }
    
    return candidates;
  }
  
  /**
   * Check if current time is within zone's risk hours.
   */
  _isWithinRiskHours(zone, timestamp) {
    if (!zone.risk_hours_start || !zone.risk_hours_end) return true;
    
    const date = new Date(timestamp);
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    
    const [startH, startM] = zone.risk_hours_start.split(':').map(Number);
    const [endH, endM] = zone.risk_hours_end.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    // Overnight ranges (e.g., 19:00 to 06:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  
  /**
   * For testing: manually inject a location.
   */
  injectLocation(lat, lon, accuracy = 10) {
    this._onLocationUpdate({
      coords: { latitude: lat, longitude: lon, accuracy },
      timestamp: Date.now(),
    });
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      filterStats: this.driftFilter.getStats(),
      activeZones: this.stateManager.getActiveZoneCount(),
      isRunning: this.isRunning,
    };
  }
}

const geofencingService = new GeofencingService();
export default geofencingService;