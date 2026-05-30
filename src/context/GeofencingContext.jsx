/**
 * GeofencingContext
 * 
 * Global geofencing state that persists across the entire app.
 * Tracking continues even when navigating between pages.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import geofencingService from '../services/geofencing';
import alertHistoryService from '../services/alertHistory';
import notificationService from '../services/notifications';
import settingsService from '../services/settings';
import { useDatabase } from '../hooks/useDatabase';

const GeofencingContext = createContext(null);

export function GeofencingProvider({ children }) {
  const { db, isReady: dbReady } = useDatabase();
  
  const [isReady, setIsReady] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [error, setError] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(
    notificationService.getPermission()
  );
  
  const initRef = useRef(false);
  const handlersRef = useRef({});
  
  // ─── Initialize Service Once ───
  useEffect(() => {
    if (!dbReady || !db) return;
    if (initRef.current) return;
    initRef.current = true;
    
    (async () => {
      try {
        await geofencingService.initialize();
        setIsReady(true);
        console.log('[GeofencingProvider] Service ready');
      } catch (err) {
        console.error('[GeofencingProvider] Init failed:', err);
        setError(err.message);
      }
    })();
  }, [dbReady, db]);
  
  // ─── Define Handlers (stable refs) ───
  handlersRef.current.onZoneEntry = useCallback(async (event) => {
    const { zone, location, timestamp } = event;
    console.log('[Geofence] ENTRY:', zone.name, `(severity ${zone.severity_level})`);
    
    // ─── Check user's minimum severity preference ───
    const minSeverity = settingsService.get('min_severity_alert') || 1;
    if (zone.severity_level < minSeverity) {
      console.log(`[Geofence] Skipping alert (zone severity ${zone.severity_level} < user threshold ${minSeverity})`);
      return;
    }
    
    // ─── Check if notifications are enabled in settings ───
    const notificationsEnabled = settingsService.get('notifications_enabled');
    
    setActiveAlerts((prev) => {
      if (prev.some(a => a.zone.zone_uuid === zone.zone_uuid)) return prev;
      return [{
        id: `${zone.zone_uuid}-${timestamp}`,
        zone,
        location,
        timestamp,
        dismissed: false,
      }, ...prev].slice(0, 5);
    });
    
    // ─── Show browser notification (only if both permission AND setting allow it) ───
    if (notificationPermission === 'granted' && notificationsEnabled) {
      notificationService.showGeofenceAlert(zone);
    }
    
    // ─── Always log to history (for the Profile page) ───
    try {
      await alertHistoryService.logAlert({
        zone_uuid: zone.zone_uuid,
        zone_name: zone.name,
        severity_level: zone.severity_level,
        risk_category: zone.risk_category,
        risk_score: zone.risk_score,
        alert_message: zone.alert_message,
        user_lat: location.lat,
        user_lon: location.lon,
        event_type: 'ENTRY',
      });
    } catch (e) {
      console.error('[GeofencingProvider] Failed to log alert:', e);
    }
  }, [notificationPermission]);
  
  handlersRef.current.onZoneExit = useCallback((event) => {
    console.log('[Geofence] EXIT:', event.zone.name);
  }, []);
  
  // ─── Subscribe to Events (only after ready) ───
  useEffect(() => {
    if (!isReady) return;
    
    const unsubscribe = geofencingService.addEventListener((event) => {
      switch (event.type) {
        case 'TRACKING_STARTED':
          setIsTracking(true);
          break;
        case 'TRACKING_STOPPED':
          setIsTracking(false);
          setCurrentLocation(null);
          break;
        case 'LOCATION_UPDATE':
          setCurrentLocation(event.location);
          break;
        case 'GPS_ERROR':
          setError(event.error);
          break;
        case 'GEOFENCE_ENTRY':
          handlersRef.current.onZoneEntry(event);
          break;
        case 'GEOFENCE_EXIT':
          handlersRef.current.onZoneExit(event);
          break;
      }
      
      setRecentEvents((prev) => [event, ...prev].slice(0, 20));
    });
    
    return unsubscribe;
  }, [isReady]);
  
  // ─── Public API ───
  
  const startTracking = useCallback(async () => {
    setError(null);
    
    if (notificationPermission === 'default') {
      const result = await notificationService.requestPermission();
      setNotificationPermission(result);
    }
    
    try {
      geofencingService.start();
    } catch (err) {
      setError(err.message);
    }
  }, [notificationPermission]);
  
  const stopTracking = useCallback(() => {
    geofencingService.stop();
    setActiveAlerts([]);
  }, []);
  
  const dismissAlert = useCallback((alertId) => {
    setActiveAlerts((prev) => prev.filter(a => a.id !== alertId));
  }, []);
  
  const dismissAllAlerts = useCallback(() => {
    setActiveAlerts([]);
  }, []);
  
  const injectTestLocation = useCallback((lat, lon) => {
    if (!isReady) return;
    geofencingService.injectLocation(lat, lon);
  }, [isReady]);
  
  // ─── Manual Location Override (for desktop testing) ───
  const [manualLocation, setManualLocation] = useState(null);
  
  const setSimulatedLocation = useCallback((lat, lon) => {
    if (!isReady) return;
    setManualLocation({ lat, lon });
    // Inject 3 times to satisfy confirmation threshold
    geofencingService.injectLocation(lat, lon);
    setTimeout(() => geofencingService.injectLocation(lat, lon), 200);
    setTimeout(() => geofencingService.injectLocation(lat, lon), 400);
  }, [isReady]);
  
  const value = {
    // State
    isReady,
    isTracking,
    currentLocation,
    activeAlerts,
    recentEvents,
    error,
    notificationPermission,
    manualLocation,
    
    // Actions
    startTracking,
    stopTracking,
    dismissAlert,
    dismissAllAlerts,
    injectTestLocation,
    setSimulatedLocation,
  };
  
  return (
    <GeofencingContext.Provider value={value}>
      {children}
    </GeofencingContext.Provider>
  );
}

export function useGeofencingContext() {
  const ctx = useContext(GeofencingContext);
  if (!ctx) {
    throw new Error('useGeofencingContext must be used within GeofencingProvider');
  }
  return ctx;
}