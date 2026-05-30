import { useState } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { SEVERITY_LABELS, SEVERITY_COLORS, RISK_CATEGORIES } from '../types/riskZone';

export default function DatabaseTest() {
  const { db, isReady, isLoading, error, stats } = useDatabase();
  const [queryResult, setQueryResult] = useState(null);
  const [testLat, setTestLat] = useState('17.385');
  const [testLon, setTestLon] = useState('78.4867');
  
  const handleNearbyQuery = () => {
    if (!db) return;
    const lat = parseFloat(testLat);
    const lon = parseFloat(testLon);
    if (isNaN(lat) || isNaN(lon)) {
      alert('Please enter valid coordinates');
      return;
    }
    const startTime = performance.now();
    const zones = db.getZonesNearPoint(lat, lon, 1.0);
    const elapsed = (performance.now() - startTime).toFixed(2);
    setQueryResult({
      zones,
      elapsed,
      query: `Zones within 1km of (${lat}, ${lon})`,
    });
  };
  
  const handleCriticalQuery = () => {
    if (!db) return;
    const startTime = performance.now();
    const zones = db.getZonesBySeverity(4);
    const elapsed = (performance.now() - startTime).toFixed(2);
    setQueryResult({
      zones: zones.slice(0, 20),
      elapsed,
      query: `Critical zones (showing first 20 of ${zones.length})`,
    });
  };
  
  if (isLoading) {
    return (
      <div className="section-padding !pt-8">
        <div className="container-max">
          <div className="glass-card p-12 text-center">
            <div className="w-12 h-12 border-4 border-border-subtle border-t-accent-primary rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Loading SafeRoute Database
            </h2>
            <p className="text-sm text-text-muted">Fetching SQLite database (~4 MB)...</p>
            <p className="text-xs text-text-muted mt-1">This happens once. Will be cached for offline use.</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="section-padding !pt-8">
        <div className="container-max">
          <div className="glass-card p-8 border border-red-500/30">
            <h2 className="text-lg font-semibold text-red-600 mb-2">❌ Error Loading Database</h2>
            <pre className="text-sm text-text-secondary bg-accent-primary/5 p-4 rounded-lg overflow-auto">{error}</pre>
            <p className="text-sm text-text-muted mt-3">Check browser console for details.</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            ✅ SafeRoute Database Test
          </h1>
          <p className="text-sm text-text-muted">
            Database loaded successfully. Ready for geofencing.
          </p>
        </div>
        
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="glass-card p-4 text-center">
              <div className="text-2xl font-bold text-text-primary">
                {stats.total.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-wide text-text-muted mt-1">
                Total Zones
              </div>
            </div>
            {Object.entries(stats.bySeverity).map(([level, count]) => (
              <div 
                key={level} 
                className="glass-card p-4 text-center border-t-4"
                style={{ borderTopColor: SEVERITY_COLORS[level] }}
              >
                <div className="text-2xl font-bold text-text-primary">{count}</div>
                <div className="text-xs uppercase tracking-wide text-text-muted mt-1">
                  {SEVERITY_LABELS[level]}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Categories */}
        {stats && (
          <div className="glass-card p-6 mb-8">
            <h2 className="text-base font-semibold text-text-primary mb-4">By Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(stats.byCategory).map(([cat, count]) => (
                <div 
                  key={cat} 
                  className="flex items-center gap-3 p-3 rounded-xl bg-accent-primary/5 border border-border-subtle"
                >
                  <span className="text-xl">{RISK_CATEGORIES[cat]?.icon || '⚠️'}</span>
                  <span className="flex-1 text-sm text-text-secondary">
                    {RISK_CATEGORIES[cat]?.label || cat}
                  </span>
                  <span className="text-sm font-semibold text-text-primary">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Test Queries */}
        <div className="glass-card p-6">
          <h2 className="text-base font-semibold text-text-primary mb-4">Test Queries</h2>
          
          <div className="flex flex-wrap gap-3 items-end mb-6">
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-muted mb-1">
                Latitude
              </label>
              <input 
                type="text"
                value={testLat}
                onChange={(e) => setTestLat(e.target.value)}
                className="px-3 py-2 bg-white border border-border-subtle rounded-lg text-text-primary text-sm w-32 focus:outline-none focus:border-accent-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-text-muted mb-1">
                Longitude
              </label>
              <input 
                type="text"
                value={testLon}
                onChange={(e) => setTestLon(e.target.value)}
                className="px-3 py-2 bg-white border border-border-subtle rounded-lg text-text-primary text-sm w-32 focus:outline-none focus:border-accent-primary/50"
              />
            </div>
            <button 
              onClick={handleNearbyQuery}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Find Zones Near Point
            </button>
            <button 
              onClick={handleCriticalQuery}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Show Critical Zones
            </button>
          </div>
          
          {queryResult && (
            <div className="border-t border-border-subtle pt-6">
              <h3 className="text-sm font-medium text-text-primary mb-1">{queryResult.query}</h3>
              <p className="text-xs text-text-muted mb-4">
                Found {queryResult.zones.length} zones in {queryResult.elapsed}ms
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {queryResult.zones.map((zone) => (
                  <div 
                    key={zone.id}
                    className="p-3 rounded-lg bg-accent-primary/5 border-l-4"
                    style={{ borderLeftColor: SEVERITY_COLORS[zone.severity_level] }}
                  >
                    <div className="text-sm font-medium text-text-primary">
                      {RISK_CATEGORIES[zone.risk_category]?.icon} {zone.name}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {zone.risk_category} · Severity {zone.severity_level} · 
                      Score: {zone.risk_score.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}