/**
 * useGeofencing Hook
 * 
 * React interface for the geofencing service.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import geofencingService from '../services/geofencing.js';
import alertHistoryService from '../services/alertHistory.js';
import notificationService from '../services/notifications.js';
import { useDatabase } from './useDatabase.js';

export function useGeofencing() {
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
  
  // ─── Initialize Service ───
  useEffect(() => {
    if (!dbReady || !db) return;
    if (initRef.current) return;
    initRef.current = true;
    
    (async () => {
      try {
        await geofencingService.initialize();
        setIsReady(true);
        console.log('[useGeofencing] Service ready');
      } catch (err) {
        console.error('[useGeofencing] Init failed:', err);
        setError(err.message);
      }
    })();
  }, [dbReady, db]);
  
  // ─── Subscribe to Events ───
  useEffect(() => {
    if (!isReady) return;
    
    const unsubscribe = geofencingService.addEventListener((event) => {
      // Update state based on event type
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
          handleZoneEntry(event);
          break;
          
        case 'GEOFENCE_EXIT':
          handleZoneExit(event);
          break;
      }
      
      // Track recent events for debugging UI
      setRecentEvents((prev) => {
        const newEvents = [event, ...prev].slice(0, 20);
        return newEvents;
      });
    });
    
    return unsubscribe;
  }, [isReady]);
  
  const handleZoneEntry = useCallback(async (event) => {
    const { zone, location, timestamp } = event;
    
    console.log('[Geofence] ENTRY:', zone.name, `(severity ${zone.severity_level})`);
    
    // Add to active alerts
    setActiveAlerts((prev) => {
      // Check if already showing
      if (prev.some(a => a.zone.zone_uuid === zone.zone_uuid)) return prev;
      
      const newAlert = {
        id: `${zone.zone_uuid}-${timestamp}`,
        zone,
        location,
        timestamp,
        dismissed: false,
      };
      
      return [newAlert, ...prev].slice(0, 5); // Keep max 5 active
    });
    
    // Show browser notification
    if (notificationPermission === 'granted') {
      notificationService.showGeofenceAlert(zone);
    }
    
    // Log to history
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
      console.error('[useGeofencing] Failed to log alert:', e);
    }
  }, [notificationPermission]);
  
  const handleZoneExit = useCallback((event) => {
    const { zone } = event;
    console.log('[Geofence] EXIT:', zone.name);
    // Optionally remove from active alerts after exit
  }, []);
  
  // ─── Public API ───
  
  const startTracking = useCallback(async () => {
    setError(null);
    
    // Request notification permission first time
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
  
  const getMetrics = useCallback(() => {
    return geofencingService.getMetrics();
  }, []);
  
  return {
    isReady,
    isTracking,
    currentLocation,
    activeAlerts,
    recentEvents,
    error,
    notificationPermission,
    startTracking,
    stopTracking,
    dismissAlert,
    dismissAllAlerts,
    injectTestLocation,
    getMetrics,
  };
}