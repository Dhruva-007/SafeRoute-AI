/**
 * GlobalAlertOverlay
 * 
 * Shows geofence alerts globally — works on any page.
 * Mounted once at the App level.
 */

import React from 'react';
import { useGeofencingContext } from '../context/GeofencingContext';
import GeofenceAlert from './GeofenceAlert/GeofenceAlert';

export default function GlobalAlertOverlay() {
  const { activeAlerts, dismissAlert } = useGeofencingContext();
  return <GeofenceAlert alerts={activeAlerts} onDismiss={dismissAlert} />;
}