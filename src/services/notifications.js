/**
 * Notification Service
 * 
 * Manages browser notifications and vibration alerts.
 */

class NotificationService {
  constructor() {
    this.permission = 'default';
    if ('Notification' in window) {
      this.permission = Notification.permission;
    }
  }
  
  async requestPermission() {
    if (!('Notification' in window)) {
      console.warn('[Notifications] Browser does not support notifications');
      return 'denied';
    }
    
    if (this.permission === 'granted') return 'granted';
    
    const result = await Notification.requestPermission();
    this.permission = result;
    return result;
  }
  
  /**
   * Show a notification for a geofence alert.
   */
  async showGeofenceAlert(zone) {
    if (this.permission !== 'granted') {
      console.warn('[Notifications] Permission not granted');
      return null;
    }
    
    const severityEmojis = {
      1: 'ℹ️',
      2: '⚠️',
      3: '🚨',
      4: '🆘',
    };
    
    const title = `${severityEmojis[zone.severity_level] || '⚠️'} ${zone.name || 'Risk Zone Alert'}`;
    
    const options = {
      body: zone.alert_message || 'You have entered a risk zone.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: `zone-${zone.zone_uuid}`,
      requireInteraction: zone.severity_level >= 3,
      data: {
        zone_uuid: zone.zone_uuid,
        severity: zone.severity_level,
      },
    };
    
    try {
      const notification = new Notification(title, options);
      
      // Vibrate for high/critical severity
      if (zone.severity_level >= 3 && 'vibrate' in navigator) {
        const pattern = zone.severity_level === 4 
          ? [300, 100, 300, 100, 300]  // Critical: long pattern
          : [200, 100, 200];            // High: shorter
        navigator.vibrate(pattern);
      }
      
      return notification;
    } catch (e) {
      console.error('[Notifications] Failed to show:', e);
      return null;
    }
  }
  
  isSupported() {
    return 'Notification' in window;
  }
  
  getPermission() {
    return this.permission;
  }
}

const notificationService = new NotificationService();
export default notificationService;