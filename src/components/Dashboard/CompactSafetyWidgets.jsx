import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Navigation, History, Hospital, Phone, ChevronRight,
  Clock, Loader, Bell, BellOff, AlertTriangle,
} from 'lucide-react';
import { useGeofencingContext } from '../../context/GeofencingContext';
import { useDatabase } from '../../hooks/useDatabase';
import alertHistoryService from '../../services/alertHistory';
import {
  SEVERITY_COLORS, RISK_CATEGORIES, SERVICE_TYPE_INFO,
} from '../../types/riskZone';

export default function CompactSafetyWidgets() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <TrackingMiniWidget />
      <RecentAlertsMiniWidget />
      <NearbyEmergencyMiniWidget />
    </div>
  );
}

// ────────────────────────────────────────────
// 1. TRACKING MINI WIDGET
// ────────────────────────────────────────────

function TrackingMiniWidget() {
  const {
    isReady, isTracking, currentLocation,
    notificationPermission, startTracking, stopTracking,
    activeAlerts,
  } = useGeofencingContext();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card p-5 relative overflow-hidden"
    >
      {/* Top accent line — only visible when tracking */}
      <div
        className={`absolute top-0 left-0 right-0 h-0.5 transition-colors ${
          isTracking ? 'bg-success/60' : 'bg-transparent'
        }`}
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              isTracking
                ? 'bg-success-soft border-success/25'
                : 'bg-bg-elevated border-[#DDD3C5]'
            }`}
          >
            <Navigation
              className={`w-4 h-4 ${isTracking ? 'text-success' : 'text-text-muted'}`}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Live Tracking</h3>
            <p className="text-xs text-text-muted">{isTracking ? 'Active' : 'Inactive'}</p>
          </div>
        </div>

        {isTracking && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-success-soft border border-success/20 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider text-success font-semibold">
              Live
            </span>
          </div>
        )}
      </div>

      {currentLocation && (
        <div className="mb-3 text-xs font-mono text-text-muted bg-bg-elevated/50 rounded-lg px-2.5 py-1.5 border border-[#DDD3C5]">
          {currentLocation.lat.toFixed(4)}, {currentLocation.lon.toFixed(4)}
          <span className="text-text-muted/60"> · ±{currentLocation.accuracy.toFixed(0)}m</span>
        </div>
      )}

      {activeAlerts.length > 0 && (
        <div className="mb-3 px-2.5 py-1.5 bg-danger-soft border border-danger/20 rounded-lg text-xs text-danger font-medium flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          {activeAlerts.length} active alert{activeAlerts.length > 1 ? 's' : ''}
        </div>
      )}

      {!isTracking ? (
        <button
          onClick={startTracking}
          disabled={!isReady}
          className="w-full px-3 py-2.5 bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all shadow-soft"
        >
          {isReady ? 'Start Tracking' : 'Initializing...'}
        </button>
      ) : (
        <button
          onClick={stopTracking}
          className="w-full px-3 py-2.5 bg-danger-soft hover:bg-danger/15 border border-danger/25 text-danger text-sm font-semibold rounded-xl transition-all"
        >
          Stop Tracking
        </button>
      )}

      <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-text-muted">
        {notificationPermission === 'granted' ? (
          <>
            <Bell className="w-3 h-3 text-success" />
            <span>Alerts enabled</span>
          </>
        ) : (
          <>
            <BellOff className="w-3 h-3" />
            <span>Alerts disabled</span>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────
// 2. RECENT ALERTS MINI WIDGET
// ────────────────────────────────────────────

function RecentAlertsMiniWidget() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadAlerts = async () => {
    try {
      const recent = await alertHistoryService.getRecentAlerts(3);
      setAlerts(recent);
    } catch (e) {
      console.error('Failed to load alerts:', e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
            <History className="w-4 h-4 text-accent-primary" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">Recent Alerts</h3>
        </div>
        <Link
          to="/profile"
          className="text-xs text-accent-primary hover:text-accent-hover font-medium flex items-center gap-0.5 transition-colors"
        >
          All
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-6">
          <Loader className="w-4 h-4 text-text-muted animate-spin mx-auto" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-text-muted">No alerts yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, idx) => {
            const color = SEVERITY_COLORS[alert.severity_level];
            const category = RISK_CATEGORIES[alert.risk_category];

            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/30 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs"
                  style={{ background: `${color}15`, border: `1px solid ${color}30` }}
                >
                  {category?.icon || '⚠️'}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {alert.zone_name}
                  </p>
                </div>

                <span className="text-xs text-text-muted whitespace-nowrap flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(alert.timestamp)}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ────────────────────────────────────────────
// 3. NEARBY EMERGENCY MINI WIDGET
// ────────────────────────────────────────────

function NearbyEmergencyMiniWidget() {
  const { db, isReady } = useDatabase();
  const { currentLocation } = useGeofencingContext();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !db) return;

    const lat = currentLocation?.lat || 17.385;
    const lon = currentLocation?.lon || 78.4867;

    try {
      const nearby = db.getEmergencyServicesNearby(lat, lon, 10, 3);
      setServices(nearby.slice(0, 3));
    } catch (e) {
      console.error('Failed to load nearby services:', e);
    } finally {
      setLoading(false);
    }
  }, [db, isReady, currentLocation]);

  const handleCall = (phone) => {
    if (phone) {
      window.location.href = `tel:${phone.replace(/\s/g, '')}`;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="glass-card p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-danger-soft border border-danger/20 flex items-center justify-center">
            <Hospital className="w-4 h-4 text-danger" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">Nearby Emergency</h3>
        </div>
        <Link
          to="/safety-map"
          className="text-xs text-accent-primary hover:text-accent-hover font-medium flex items-center gap-0.5 transition-colors"
        >
          Map
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-6">
          <Loader className="w-4 h-4 text-text-muted animate-spin mx-auto" />
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-text-muted">No nearby services</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((svc, idx) => {
            const typeInfo = SERVICE_TYPE_INFO[svc.service_type] || SERVICE_TYPE_INFO.hospital;

            return (
              <motion.div
                key={svc.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/30 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs"
                  style={{ background: typeInfo.bgColor, border: `1px solid ${typeInfo.color}30` }}
                >
                  {typeInfo.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {svc.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {svc.distance_km < 1
                      ? `${Math.round(svc.distance_km * 1000)}m away`
                      : `${svc.distance_km.toFixed(1)}km away`}
                  </p>
                </div>

                {svc.phone && (
                  <button
                    onClick={() => handleCall(svc.phone)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-success-soft hover:bg-success/15 border border-success/25 transition-colors shrink-0"
                    title="Call"
                  >
                    <Phone className="w-3 h-3 text-success" />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}