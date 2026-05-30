/**
 * SafetyMap Component
 * 
 * Interactive map showing all risk zones color-coded by severity.
 * Built with MapLibre GL JS and OpenStreetMap tiles.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useDatabase } from '../../hooks/useDatabase';
import { OSM_RASTER_STYLE, HYDERABAD_CENTER } from '../../services/mapStyles';
import { SEVERITY_COLORS, SEVERITY_LABELS, RISK_CATEGORIES } from '../../types/riskZone';

import './SafetyMap.css';

export default function SafetyMap() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const { db, isReady, isLoading, error } = useDatabase();
  
  const [minSeverity, setMinSeverity] = useState(1);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneCount, setZoneCount] = useState(0);
  const [userLocation, setUserLocation] = useState(null);
  const [trackingLocation, setTrackingLocation] = useState(false);
  const watchIdRef = useRef(null);
  
  // ─── Initialize Map ───
  useEffect(() => {
    if (map.current) return; // already initialized
    if (!mapContainer.current) return;
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_RASTER_STYLE,
      center: [HYDERABAD_CENTER.lon, HYDERABAD_CENTER.lat],
      zoom: HYDERABAD_CENTER.zoom,
      maxZoom: 18,
      minZoom: 9,
    });
    
    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    // Add scale
    map.current.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
      'bottom-left'
    );
    
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);
  
  // ─── Load Zones When DB Ready and Map Ready ───
  useEffect(() => {
    if (!isReady || !db || !map.current) return;
    
    const loadZonesIntoMap = () => {
      console.log('[Map] Loading zones with severity >=', minSeverity);
      const startTime = performance.now();
      
      const geojson = db.getAllZonesAsGeoJSON(minSeverity);
      const elapsed = (performance.now() - startTime).toFixed(0);
      console.log(`[Map] Loaded ${geojson.features.length} zones in ${elapsed}ms`);
      
      setZoneCount(geojson.features.length);
      
      // Remove existing source/layers if they exist
      if (map.current.getSource('risk-zones')) {
        map.current.removeLayer('risk-zones-fill');
        map.current.removeLayer('risk-zones-outline');
        map.current.removeSource('risk-zones');
      }
      
      // Add source
      map.current.addSource('risk-zones', {
        type: 'geojson',
        data: geojson,
      });
      
      // Add fill layer (color by severity)
      map.current.addLayer({
        id: 'risk-zones-fill',
        type: 'fill',
        source: 'risk-zones',
        paint: {
          'fill-color': [
            'match',
            ['get', 'severity_level'],
            1, SEVERITY_COLORS[1],
            2, SEVERITY_COLORS[2],
            3, SEVERITY_COLORS[3],
            4, SEVERITY_COLORS[4],
            '#888',
          ],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['get', 'severity_level'],
            1, 0.20,
            2, 0.30,
            3, 0.40,
            4, 0.55,
          ],
        },
      });
      
      // Add outline layer
      map.current.addLayer({
        id: 'risk-zones-outline',
        type: 'line',
        source: 'risk-zones',
        paint: {
          'line-color': [
            'match',
            ['get', 'severity_level'],
            1, SEVERITY_COLORS[1],
            2, SEVERITY_COLORS[2],
            3, SEVERITY_COLORS[3],
            4, SEVERITY_COLORS[4],
            '#888',
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 0.5,
            14, 1.5,
            18, 3,
          ],
          'line-opacity': 0.8,
        },
      });
      
      // Click handler for zone details
      map.current.on('click', 'risk-zones-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        setSelectedZone({
          ...feature.properties,
          coords: e.lngLat,
        });
      });
      
      // Cursor change on hover
      map.current.on('mouseenter', 'risk-zones-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'risk-zones-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });
    };
    
    if (map.current.isStyleLoaded()) {
      loadZonesIntoMap();
    } else {
      map.current.once('load', loadZonesIntoMap);
    }
  }, [isReady, db, minSeverity]);
  
  // ─── User Location Tracking ───
  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    
    setTrackingLocation(true);
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const newLocation = { lat: latitude, lon: longitude, accuracy };
        setUserLocation(newLocation);
        
        // Add/update marker on map
        updateUserMarker(newLocation);
        
        // First time: pan to user
        if (!userLocation && map.current) {
          map.current.flyTo({
            center: [longitude, latitude],
            zoom: 15,
            duration: 1500,
          });
        }
      },
      (err) => {
        console.error('[Map] Geolocation error:', err);
        alert(`Location error: ${err.message}`);
        setTrackingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  };
  
  const stopLocationTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTrackingLocation(false);
  };
  
  const userMarkerRef = useRef(null);
  const updateUserMarker = (location) => {
    if (!map.current) return;
    
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([location.lon, location.lat]);
    } else {
      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'user-location-marker';
      el.innerHTML = '<div class="user-dot"></div><div class="user-pulse"></div>';
      
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([location.lon, location.lat])
        .addTo(map.current);
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);
  
  // ─── Render ───
  if (isLoading) {
    return (
      <div className="map-loading">
        <div className="spinner" />
        <p>Loading risk zones database...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="map-error">
        <h3>Failed to load map</h3>
        <p>{error}</p>
      </div>
    );
  }
  
  return (
    <div className="safety-map-container">
      <div ref={mapContainer} className="safety-map" />
      
      {/* Legend & Controls Panel */}
      <div className="map-controls">
        <div className="control-section">
          <h4>Risk Zones</h4>
          <div className="zone-count">
            Showing <strong>{zoneCount}</strong> zones
          </div>
        </div>
        
        <div className="control-section">
          <h4>Severity Filter</h4>
          <select 
            value={minSeverity} 
            onChange={(e) => setMinSeverity(Number(e.target.value))}
            className="severity-select"
          >
            <option value={1}>All zones (Low+)</option>
            <option value={2}>Medium and above</option>
            <option value={3}>High and above</option>
            <option value={4}>Critical only</option>
          </select>
        </div>
        
        <div className="control-section">
          <h4>Legend</h4>
          <div className="legend">
            {[4, 3, 2, 1].map((level) => (
              <div key={level} className="legend-item">
                <span 
                  className="legend-color" 
                  style={{ background: SEVERITY_COLORS[level] }}
                />
                <span>{SEVERITY_LABELS[level]}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="control-section">
          <h4>My Location</h4>
          {!trackingLocation ? (
            <button onClick={startLocationTracking} className="control-button primary">
              📍 Track My Location
            </button>
          ) : (
            <button onClick={stopLocationTracking} className="control-button danger">
              ⏹ Stop Tracking
            </button>
          )}
          {userLocation && (
            <div className="location-info">
              <small>
                Lat: {userLocation.lat.toFixed(5)}<br/>
                Lon: {userLocation.lon.toFixed(5)}<br/>
                Accuracy: ±{userLocation.accuracy.toFixed(0)}m
              </small>
            </div>
          )}
        </div>
      </div>
      
      {/* Zone Detail Popup */}
      {selectedZone && (
        <div className="zone-popup">
          <button 
            className="zone-popup-close" 
            onClick={() => setSelectedZone(null)}
          >
            ×
          </button>
          
          <div 
            className="zone-popup-severity" 
            style={{ background: SEVERITY_COLORS[selectedZone.severity_level] }}
          >
            {SEVERITY_LABELS[selectedZone.severity_level]} · 
            Score: {selectedZone.risk_score.toFixed(2)}
          </div>
          
          <h3 className="zone-popup-title">
            {RISK_CATEGORIES[selectedZone.risk_category]?.icon} {selectedZone.name}
          </h3>
          
          <div className="zone-popup-category">
            {RISK_CATEGORIES[selectedZone.risk_category]?.label || selectedZone.risk_category}
          </div>
          
          <div className="zone-popup-message">
            {selectedZone.alert_message}
          </div>
          
          {selectedZone.is_time_dependent && (
            <div className="zone-popup-time">
              ⏰ Time-dependent risk
            </div>
          )}
        </div>
      )}
    </div>
  );
}