/**
 * Settings Service
 * 
 * Manages user preferences with localStorage persistence.
 * Provides defaults and validates all settings.
 */

const STORAGE_KEY = 'saferoute_settings';

const DEFAULT_SETTINGS = {
  // Notifications
  notifications_enabled: true,
  notification_sound: true,
  notification_vibration: true,
  
  // Geofencing
  min_severity_alert: 1,        // 1=Low, 2=Medium, 3=High, 4=Critical
  alert_cooldown_minutes: 5,
  confirmation_threshold: 3,    // GPS fixes before alert triggers
  
  // GPS & Battery
  battery_optimization: false,  // Slower GPS polling when on
  high_accuracy_gps: true,
  gps_interval_seconds: 10,
  
  // Privacy
  location_sharing: true,
  share_anonymous_analytics: false,
  
  // Display
  dark_mode: true,
  show_low_severity: true,
  show_emergency_services: true,
  
  // Email Preferences
  email_alerts: false,
  email_weekly_digest: false,
  email_safety_tips: true,
};

class SettingsService {
  constructor() {
    this.settings = this._load();
    this.listeners = new Set();
  }
  
  _load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('[Settings] Failed to load:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }
  
  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      this._notifyListeners();
    } catch (e) {
      console.error('[Settings] Failed to save:', e);
    }
  }
  
  _notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.settings);
      } catch (e) {
        console.error('[Settings] Listener error:', e);
      }
    }
  }
  
  /**
   * Subscribe to settings changes.
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  /**
   * Get a single setting.
   */
  get(key) {
    return this.settings[key];
  }
  
  /**
   * Get all settings.
   */
  getAll() {
    return { ...this.settings };
  }
  
  /**
   * Update a single setting.
   */
  set(key, value) {
    this.settings[key] = value;
    this._save();
  }
  
  /**
   * Update multiple settings at once.
   */
  update(updates) {
    Object.assign(this.settings, updates);
    this._save();
  }
  
  /**
   * Reset to defaults.
   */
  reset() {
    this.settings = { ...DEFAULT_SETTINGS };
    this._save();
  }
  
  /**
   * Clear all stored data (settings, alerts, cache).
   */
  async clearAllData() {
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);
    
    // Clear IndexedDB databases
    try {
      const databases = await indexedDB.databases?.() || [];
      for (const db of databases) {
        if (db.name?.startsWith('saferoute')) {
          await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = reject;
          });
        }
      }
    } catch (e) {
      console.error('[Settings] Failed to clear IndexedDB:', e);
    }
    
    // Clear caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.includes('saferoute'))
          .map(name => caches.delete(name))
      );
    }
    
    this.settings = { ...DEFAULT_SETTINGS };
  }
  
  /**
   * Export settings as JSON.
   */
  exportSettings() {
    return JSON.stringify(this.settings, null, 2);
  }
  
  /**
   * Import settings from JSON.
   */
  importSettings(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      // Validate keys
      const validKeys = Object.keys(DEFAULT_SETTINGS);
      const valid = {};
      for (const key of validKeys) {
        if (key in imported) valid[key] = imported[key];
      }
      this.update(valid);
      return true;
    } catch (e) {
      console.error('[Settings] Import failed:', e);
      return false;
    }
  }
}

const settingsService = new SettingsService();
export default settingsService;