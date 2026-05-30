import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PageHeader from '../components/PageHeader';
import { 
  Map, AlertTriangle, Info, Search, Activity, Navigation, Loader,
  Bell, BellOff, Zap, Target, Filter, Hospital
} from 'lucide-react';
import { useDatabase } from '../hooks/useDatabase';
import { useGeofencingContext } from '../context/GeofencingContext';
import { OSM_RASTER_STYLE, HYDERABAD_CENTER } from '../services/mapStyles';
import { 
  SEVERITY_COLORS, SEVERITY_LABELS, RISK_CATEGORIES,
  SERVICE_TYPE_INFO 
} from '../types/riskZone';
import EmergencyServicePanel from '../components/EmergencyServicePanel/EmergencyServicePanel';

function SafetyMap() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const userMarkerRef = useRef(null);
  const emergencyMarkersRef = useRef([]);
  
  const { db, isReady: dbReady, isLoading, error: dbError } = useDatabase();
  const {
    isReady: geofencingReady,
    isTracking,
    currentLocation,
    error: geofenceError,
    notificationPermission,
    startTracking,
    stopTracking,
    setSimulatedLocation,
    activeAlerts,
  } = useGeofencingContext();
  
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [minSeverity, setMinSeverity] = useState(1);
  const [zoneCount, setZoneCount] = useState(0);
  const [emergencyCount, setEmergencyCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('Hyderabad, India');
  const [showEmergencyServices, setShowEmergencyServices] = useState(true);
  const [emergencyTypeFilter, setEmergencyTypeFilter] = useState('all');
  
  const [manualLat, setManualLat] = useState('17.5252');
  const [manualLon, setManualLon] = useState('78.2747');

  // ─── Initialize Map ───
  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: OSM_RASTER_STYLE,
      center: [HYDERABAD_CENTER.lon, HYDERABAD_CENTER.lat],
      zoom: HYDERABAD_CENTER.zoom,
      maxZoom: 18,
      minZoom: 9,
    });
    
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);
  
  // ─── Load Risk Zones ───
  useEffect(() => {
    if (!dbReady || !db || !map.current) return;
    
    const loadZones = () => {
      const startTime = performance.now();
      const geojson = db.getAllZonesAsGeoJSON(minSeverity);
      const elapsed = (performance.now() - startTime).toFixed(0);
      console.log(`[Map] Loaded ${geojson.features.length} zones in ${elapsed}ms`);
      
      setZoneCount(geojson.features.length);
      
      if (map.current.getSource('risk-zones')) {
        if (map.current.getLayer('risk-zones-fill')) map.current.removeLayer('risk-zones-fill');
        if (map.current.getLayer('risk-zones-outline')) map.current.removeLayer('risk-zones-outline');
        map.current.removeSource('risk-zones');
      }
      
      map.current.addSource('risk-zones', { type: 'geojson', data: geojson });
      
      map.current.addLayer({
        id: 'risk-zones-fill',
        type: 'fill',
        source: 'risk-zones',
        paint: {
          'fill-color': [
            'match', ['get', 'severity_level'],
            1, SEVERITY_COLORS[1],
            2, SEVERITY_COLORS[2],
            3, SEVERITY_COLORS[3],
            4, SEVERITY_COLORS[4],
            '#888',
          ],
          'fill-opacity': [
            'interpolate', ['linear'], ['get', 'severity_level'],
            1, 0.20, 2, 0.30, 3, 0.40, 4, 0.55,
          ],
        },
      });
      
      map.current.addLayer({
        id: 'risk-zones-outline',
        type: 'line',
        source: 'risk-zones',
        paint: {
          'line-color': [
            'match', ['get', 'severity_level'],
            1, SEVERITY_COLORS[1],
            2, SEVERITY_COLORS[2],
            3, SEVERITY_COLORS[3],
            4, SEVERITY_COLORS[4],
            '#888',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5, 18, 3],
          'line-opacity': 0.8,
        },
      });
      
      map.current.on('click', 'risk-zones-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        setSelectedZone({ ...feature.properties, coords: e.lngLat });
        setSelectedService(null);
      });
      
      map.current.on('mouseenter', 'risk-zones-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'risk-zones-fill', () => {
        map.current.getCanvas().style.cursor = '';
      });
    };
    
    if (map.current.isStyleLoaded()) {
      loadZones();
    } else {
      map.current.once('load', loadZones);
    }
  }, [dbReady, db, minSeverity]);
  
  // ─── Load Emergency Services ───
  useEffect(() => {
    if (!dbReady || !db || !map.current) return;
    
    const loadEmergencyServices = () => {
      // Clear existing markers
      emergencyMarkersRef.current.forEach(m => m.remove());
      emergencyMarkersRef.current = [];
      
      if (!showEmergencyServices) {
        setEmergencyCount(0);
        return;
      }
      
      const startTime = performance.now();
      let services = db.getAllEmergencyServices(2); // min confidence: medium+
      
      if (emergencyTypeFilter !== 'all') {
        services = services.filter(s => s.service_type === emergencyTypeFilter);
      }
      
      const elapsed = (performance.now() - startTime).toFixed(0);
      console.log(`[Map] Loaded ${services.length} emergency services in ${elapsed}ms`);
      
      setEmergencyCount(services.length);
      
      services.forEach(svc => {
        const typeInfo = SERVICE_TYPE_INFO[svc.service_type];
        if (!typeInfo) return;
        
        const el = document.createElement('div');
        el.style.cssText = `
          width: 28px;
          height: 28px;
          background: ${typeInfo.color};
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          transition: transform 0.2s;
        `;
        el.innerHTML = typeInfo.icon;
        el.title = svc.name;
        
        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.2)';
          el.style.zIndex = '999';
        });
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'scale(1)';
          el.style.zIndex = '';
        });
        
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedService(svc);
          setSelectedZone(null);
        });
        
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([svc.longitude, svc.latitude])
          .addTo(map.current);
        
        emergencyMarkersRef.current.push(marker);
      });
    };
    
    if (map.current.isStyleLoaded()) {
      loadEmergencyServices();
    } else {
      map.current.once('load', loadEmergencyServices);
    }
  }, [dbReady, db, showEmergencyServices, emergencyTypeFilter]);
  
  // ─── Update User Marker ───
  useEffect(() => {
    if (!map.current || !currentLocation) return;
    
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([currentLocation.lon, currentLocation.lat]);
    } else {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:24px;height:24px;">
          <div style="position:absolute;top:50%;left:50%;width:16px;height:16px;background:#3b82f6;border:3px solid #fff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 2px 4px rgba(0,0,0,0.5);z-index:2;"></div>
          <div style="position:absolute;top:50%;left:50%;width:16px;height:16px;background:rgba(59,130,246,0.4);border-radius:50%;transform:translate(-50%,-50%);animation:userPulse 2s infinite;z-index:1;"></div>
        </div>
      `;
      
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([currentLocation.lon, currentLocation.lat])
        .addTo(map.current);
      
      map.current.flyTo({
        center: [currentLocation.lon, currentLocation.lat],
        zoom: 15,
        duration: 1500,
      });
    }
  }, [currentLocation]);
  
  const handleToggleTracking = async () => {
    if (isTracking) {
      stopTracking();
    } else {
      await startTracking();
    }
  };
  
  const handleTestInject = (lat, lon, label) => {
    console.log(`[Test] Injecting: ${label} (${lat}, ${lon})`);
    if (map.current) {
      map.current.flyTo({ center: [lon, lat], zoom: 16, duration: 1000 });
    }
    setSimulatedLocation(lat, lon);
  };
  
  const handleManualInject = () => {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    
    if (isNaN(lat) || isNaN(lon)) {
      alert('Invalid coordinates');
      return;
    }
    
    if (lat < 17.2 || lat > 17.6 || lon < 78.2 || lon > 78.7) {
      alert('Coordinates outside Hyderabad bounds');
      return;
    }
    
    handleTestInject(lat, lon, 'Manual');
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        
        {/* Test Panel */}
        <div className="glass-card p-6 mb-6 border-2 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-amber-700">
                🧪 Geofencing Test Panel (Dev Mode)
              </h3>
              <p className="text-xs text-text-muted">
                Click any preset OR enter exact coordinates to simulate location
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-text-muted">Status</div>
              <div className={`text-sm font-semibold ${isTracking ? 'text-green-600' : 'text-amber-600'}`}>
                {isTracking ? '✓ Active' : '⏸ Inactive'}
              </div>
            </div>
          </div>
          
          {!isTracking && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-700">
                ⚠️ Click "Start Tracking" in the right sidebar first.
              </p>
            </div>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            <button onClick={() => handleTestInject(17.5252, 78.2747, 'Patancheru')}
              className="px-4 py-3 bg-red-500/15 hover:bg-red-500/25 disabled:opacity-30 text-red-700 text-sm font-medium rounded-lg border border-red-500/30 transition-all hover:scale-105"
              disabled={!isTracking}>
              <div className="text-lg mb-1">🔴</div>
              <div className="font-semibold">Patancheru</div>
              <div className="text-[10px] text-text-muted mt-0.5">Industrial Zone</div>
            </button>
            <button onClick={() => handleTestInject(17.4239, 78.4738, 'Hitech City')}
              className="px-4 py-3 bg-orange-500/15 hover:bg-orange-500/25 disabled:opacity-30 text-orange-700 text-sm font-medium rounded-lg border border-orange-500/30 transition-all hover:scale-105"
              disabled={!isTracking}>
              <div className="text-lg mb-1">🟠</div>
              <div className="font-semibold">Hitech City</div>
              <div className="text-[10px] text-text-muted mt-0.5">Major Junction</div>
            </button>
            <button onClick={() => handleTestInject(17.4435, 78.3772, 'Madhapur')}
              className="px-4 py-3 bg-yellow-500/15 hover:bg-yellow-500/25 disabled:opacity-30 text-yellow-700 text-sm font-medium rounded-lg border border-yellow-500/30 transition-all hover:scale-105"
              disabled={!isTracking}>
              <div className="text-lg mb-1">🟡</div>
              <div className="font-semibold">Madhapur</div>
              <div className="text-[10px] text-text-muted mt-0.5">Mixed Risk</div>
            </button>
            <button onClick={() => handleTestInject(17.4400, 78.4983, 'Secunderabad')}
              className="px-4 py-3 bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-30 text-purple-700 text-sm font-medium rounded-lg border border-purple-500/30 transition-all hover:scale-105"
              disabled={!isTracking}>
              <div className="text-lg mb-1">🟣</div>
              <div className="font-semibold">Secunderabad</div>
              <div className="text-[10px] text-text-muted mt-0.5">Military Areas</div>
            </button>
            <button onClick={() => handleTestInject(17.3616, 78.4747, 'Charminar')}
              className="px-4 py-3 bg-blue-500/15 hover:bg-blue-500/25 disabled:opacity-30 text-blue-700 text-sm font-medium rounded-lg border border-blue-500/30 transition-all hover:scale-105"
              disabled={!isTracking}>
              <div className="text-lg mb-1">🔵</div>
              <div className="font-semibold">Charminar</div>
              <div className="text-[10px] text-text-muted mt-0.5">Old City</div>
            </button>
            <button onClick={() => handleTestInject(17.385, 78.4867, 'City Center')}
              className="px-4 py-3 bg-green-500/15 hover:bg-green-500/25 disabled:opacity-30 text-green-700 text-sm font-medium rounded-lg border border-green-500/30 transition-all hover:scale-105"
              disabled={!isTracking}>
              <div className="text-lg mb-1">🟢</div>
              <div className="font-semibold">City Center</div>
              <div className="text-[10px] text-text-muted mt-0.5">Low Risk Test</div>
            </button>
          </div>
          
          <div className="border-t border-border-subtle pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-text-muted" />
              <span className="text-xs uppercase tracking-wide text-text-muted font-medium">
                Manual Coordinate Test
              </span>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-text-muted mb-1">Latitude</label>
                <input type="text" value={manualLat} onChange={(e) => setManualLat(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-primary/50"/>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-text-muted mb-1">Longitude</label>
                <input type="text" value={manualLon} onChange={(e) => setManualLon(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-border-subtle rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent-primary/50"/>
              </div>
              <button onClick={handleManualInject} disabled={!isTracking}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/30 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
                Inject Location
              </button>
            </div>
          </div>
        </div>
        
        <PageHeader
          icon={Map}
          title="Safety Map"
          subtitle={
            isLoading 
              ? "Loading risk zones database..." 
              : dbReady 
                ? `${zoneCount.toLocaleString()} risk zones · ${emergencyCount} emergency services ${isTracking ? '· 🟢 Live tracking' : ''}`
                : "Real-time safety assessment of areas around you."
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="glass-card p-6">
              <div className="relative mb-6">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input type="text" placeholder="Search location..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-border-subtle rounded-xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/15 transition-all"/>
              </div>

              <div className="relative aspect-[16/10] rounded-xl bg-accent-primary/5 border border-border-subtle overflow-hidden">
                <div ref={mapContainer} className="absolute inset-0" />
                
                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-20">
                    <Loader className="w-8 h-8 text-accent-primary animate-spin mb-3" />
                    <p className="text-sm text-text-secondary">Loading map data...</p>
                  </div>
                )}
                
                {dbError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-20 p-6">
                    <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
                    <p className="text-sm text-red-600 text-center">Failed to load map data</p>
                  </div>
                )}
                
                {isTracking && (
                  <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 bg-green-500/20 backdrop-blur-md border border-green-500/40 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-700">Live Tracking</span>
                  </div>
                )}
              </div>

              {/* Filters Row */}
              <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-text-muted font-medium uppercase tracking-wide">Risk Zones:</span>
                  <select value={minSeverity} onChange={(e) => setMinSeverity(Number(e.target.value))}
                    className="px-3 py-1.5 bg-white border border-border-subtle rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent-primary/50">
                    <option value={1}>All</option>
                    <option value={2}>Medium+</option>
                    <option value={3}>High+</option>
                    <option value={4}>Critical</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setShowEmergencyServices(!showEmergencyServices)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      showEmergencyServices 
                        ? 'bg-red-500/15 text-red-700 border border-red-500/30' 
                        : 'bg-white text-text-muted border border-border-subtle'
                    }`}
                  >
                    <Hospital className="w-3 h-3" />
                    {showEmergencyServices ? `${emergencyCount} Emergency Services` : 'Show Emergency'}
                  </button>
                  
                  {showEmergencyServices && (
                    <select value={emergencyTypeFilter} onChange={(e) => setEmergencyTypeFilter(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-border-subtle rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent-primary/50">
                      <option value="all">All Types</option>
                      <option value="hospital">Hospitals</option>
                      <option value="clinic">Clinics</option>
                      <option value="police">Police</option>
                      <option value="fire_station">Fire Stations</option>
                      <option value="ambulance">Ambulance</option>
                      <option value="pharmacy_24h">24/7 Pharmacy</option>
                      <option value="shelter">Shelters</option>
                    </select>
                  )}
                </div>
              </div>
              
              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 flex-wrap text-xs text-text-muted">
                <span>Risk:</span>
                {[4, 3, 2, 1].map(level => (
                  <div key={level} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: SEVERITY_COLORS[level] }} />
                    <span>{SEVERITY_LABELS[level]}</span>
                  </div>
                ))}
                <span className="ml-3">Services:</span>
                {Object.entries(SERVICE_TYPE_INFO).slice(0, 5).map(([type, info]) => (
                  <div key={type} className="flex items-center gap-1">
                    <span className="text-sm">{info.icon}</span>
                    <span>{info.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Tracking Control */}
            <div className="glass-card p-6">
              <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Navigation className="w-4 h-4" />
                Live Geofencing
              </h3>
              
              {!isTracking ? (
                <button onClick={handleToggleTracking} disabled={!geofencingReady}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white text-sm font-medium rounded-xl transition-colors">
                  <Navigation className="w-4 h-4" />
                  Start Tracking
                </button>
              ) : (
                <button onClick={handleToggleTracking}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors">
                  Stop Tracking
                </button>
              )}
              
              {currentLocation && (
                <div className="mt-3 p-3 rounded-lg bg-accent-primary/5 border border-border-subtle text-xs text-text-secondary font-mono space-y-1">
                  <div>Lat: {currentLocation.lat.toFixed(5)}</div>
                  <div>Lon: {currentLocation.lon.toFixed(5)}</div>
                  <div className="text-text-muted">±{currentLocation.accuracy.toFixed(0)}m</div>
                </div>
              )}
            </div>
            
            {/* Selected Zone (only show if no service selected) */}
            {selectedZone && !selectedService && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6">
                <h3 className="text-base font-semibold text-text-primary mb-1">
                  {RISK_CATEGORIES[selectedZone.risk_category]?.icon} {selectedZone.name}
                </h3>
                <p className="text-sm text-text-muted capitalize mb-4">
                  {RISK_CATEGORIES[selectedZone.risk_category]?.label || selectedZone.risk_category}
                </p>
                
                <div className="flex items-center gap-3 mb-4">
                  <div className="px-3 py-1.5 rounded-full text-sm font-medium text-white"
                    style={{ background: SEVERITY_COLORS[selectedZone.severity_level] }}>
                    {SEVERITY_LABELS[selectedZone.severity_level]} Severity
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-accent-primary/5 border border-border-subtle mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-text-muted" />
                      <span className="text-sm text-text-secondary">Risk Score</span>
                    </div>
                    <span className="text-sm font-semibold text-text-primary">
                      {selectedZone.risk_score.toFixed(2)} / 1.00
                    </span>
                  </div>
                </div>

                {selectedZone.severity_level >= 3 && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700">Caution Advised</span>
                    </div>
                    <p className="text-xs text-text-secondary">{selectedZone.alert_message}</p>
                  </div>
                )}
              </motion.div>
            )}
            
            {!selectedZone && !selectedService && (
              <div className="glass-card p-6 text-center">
                <Info className="w-8 h-8 text-text-muted mx-auto mb-3" />
                <p className="text-sm text-text-secondary">
                  Click any zone or emergency marker on the map for details.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Emergency Service Detail Panel (slides in from right) */}
      <AnimatePresence>
        {selectedService && (
          <EmergencyServicePanel 
            service={selectedService}
            userLocation={currentLocation}
            onClose={() => setSelectedService(null)}
          />
        )}
      </AnimatePresence>
      
      <style>{`
        @keyframes userPulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.7; }
          100% { transform: translate(-50%, -50%) scale(3.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default SafetyMap;