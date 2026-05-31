import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Phone, Navigation, Loader2, AlertCircle,
  Hospital, Building2, RefreshCw,
} from 'lucide-react';
import { useDatabase } from '../../hooks/useDatabase';
import { useGeofencingContext } from '../../context/GeofencingContext';
import { SERVICE_TYPE_INFO } from '../../types/riskZone';
import { dialNumber } from '../../utils/sosTrigger';

const SEARCH_RADIUS_KM = 10;
const MAX_RESULTS = 10;

// Default to Hyderabad center when no location available
const DEFAULT_LAT = 17.385;
const DEFAULT_LON = 78.4867;

function NearbyServices() {
  const { db, isReady } = useDatabase();
  const { currentLocation } = useGeofencingContext();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usingFallbackLocation, setUsingFallbackLocation] = useState(false);

  const loadServices = () => {
    if (!isReady || !db) return;

    setLoading(true);
    setError(null);

    try {
      const lat = currentLocation?.lat || DEFAULT_LAT;
      const lon = currentLocation?.lon || DEFAULT_LON;
      setUsingFallbackLocation(!currentLocation);

      const nearby = db.getEmergencyServicesNearby(
        lat,
        lon,
        SEARCH_RADIUS_KM,
        2, // min confidence
      );

      setServices(nearby.slice(0, MAX_RESULTS));
    } catch (e) {
      console.error('Failed to load services:', e);
      setError('Could not load nearby services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, db, currentLocation]);

  const handleNavigate = (svc) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${svc.latitude},${svc.longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${svc.latitude},${svc.longitude}`;
    window.open(url, '_blank');
  };

  const formatDistance = (km) => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-danger-soft border border-danger/25 flex items-center justify-center">
            <Hospital className="w-4 h-4 text-danger" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Nearby Emergency Services
            </h3>
            <p className="text-xs text-text-muted">
              Within {SEARCH_RADIUS_KM} km · Tap to call or navigate
            </p>
          </div>
        </div>

        <button
          onClick={loadServices}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Location notice */}
      {usingFallbackLocation && (
        <div className="mb-4 p-3 rounded-xl bg-warning-soft border border-warning/25 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            Using default Hyderabad location. Enable Live Tracking on Dashboard to see services near you.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <Loader2 className="w-5 h-5 text-text-muted animate-spin mx-auto mb-2" />
          <p className="text-xs text-text-muted">Finding nearby services...</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="text-center py-8">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-2" />
          <p className="text-sm text-text-secondary mb-3">{error}</p>
          <button onClick={loadServices} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && services.length === 0 && (
        <div className="text-center py-8">
          <Building2 className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-secondary">
            No emergency services found within {SEARCH_RADIUS_KM} km.
          </p>
        </div>
      )}

      {/* List */}
      {!loading && !error && services.length > 0 && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {services.map((svc, idx) => {
            const typeInfo =
              SERVICE_TYPE_INFO[svc.service_type] ||
              SERVICE_TYPE_INFO.hospital;
            return (
              <motion.div
                key={svc.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/30 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-base border"
                  style={{
                    background: typeInfo.bgColor,
                    borderColor: `${typeInfo.color}40`,
                  }}
                >
                  {typeInfo.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {svc.name}
                    </p>
                    {svc.is_24_7 ? (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-success-soft text-success border border-success/25">
                        24/7
                      </span>
                    ) : null}
                    {svc.has_emergency ? (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-danger-soft text-danger border border-danger/25">
                        ER
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {typeInfo.label} · {formatDistance(svc.distance_km)} away
                  </p>

                  {svc.address_full && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-1 leading-relaxed">
                      {svc.address_full}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {svc.phone && (
                    <button
                      onClick={() => dialNumber(svc.phone)}
                      className="p-2 rounded-lg bg-success-soft hover:bg-success/15 border border-success/25 transition-colors"
                      title="Call"
                    >
                      <Phone className="w-3.5 h-3.5 text-success" />
                    </button>
                  )}
                  <button
                    onClick={() => handleNavigate(svc)}
                    className="p-2 rounded-lg bg-accent-primary/10 hover:bg-accent-primary/15 border border-accent-primary/25 transition-colors"
                    title="Directions"
                  >
                    <Navigation className="w-3.5 h-3.5 text-accent-primary" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NearbyServices;