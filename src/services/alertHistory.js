/**
 * Alert History Service
 * 
 * Stores and retrieves geofence alert history in IndexedDB.
 * Provides filtering, statistics, and export functionality.
 */

import { openDB } from 'idb';

const DB_NAME = 'saferoute-alerts';
const DB_VERSION = 1;
const STORE_NAME = 'alerts';

class AlertHistoryService {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }
  
  async _initDB() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('zone_uuid', 'zone_uuid');
          store.createIndex('severity', 'severity_level');
        }
      },
    });
    
    this.db = await this.initPromise;
    return this.db;
  }
  
  /**
   * Log a new alert event.
   */
  async logAlert(alert) {
    const db = await this._initDB();
    return db.add(STORE_NAME, {
      timestamp: Date.now(),
      ...alert,
    });
  }
  
  /**
   * Get the N most recent alerts.
   */
  async getRecentAlerts(limit = 50) {
    const db = await this._initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('timestamp');
    
    const alerts = [];
    let cursor = await index.openCursor(null, 'prev');
    
    while (cursor && alerts.length < limit) {
      alerts.push(cursor.value);
      cursor = await cursor.continue();
    }
    
    return alerts;
  }
  
  /**
   * Get all alerts (newest first).
   */
  async getAllAlerts() {
    const db = await this._initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('timestamp');
    
    const alerts = [];
    let cursor = await index.openCursor(null, 'prev');
    
    while (cursor) {
      alerts.push(cursor.value);
      cursor = await cursor.continue();
    }
    
    return alerts;
  }
  
  /**
   * Get alerts filtered by severity level.
   */
  async getAlertsBySeverity(severity) {
    const db = await this._initDB();
    return db.getAllFromIndex(STORE_NAME, 'severity', severity);
  }
  
  /**
   * Get alerts within a date range.
   */
  async getAlertsByDateRange(startTime, endTime) {
    const db = await this._initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('timestamp');
    const range = IDBKeyRange.bound(startTime, endTime);
    
    const alerts = [];
    let cursor = await index.openCursor(range, 'prev');
    
    while (cursor) {
      alerts.push(cursor.value);
      cursor = await cursor.continue();
    }
    
    return alerts;
  }
  
  /**
   * Delete all alert history.
   */
  async clearHistory() {
    const db = await this._initDB();
    return db.clear(STORE_NAME);
  }
  
  /**
   * Delete a specific alert by ID.
   */
  async deleteAlert(id) {
    const db = await this._initDB();
    return db.delete(STORE_NAME, id);
  }
  
  /**
   * Get total alert count.
   */
  async getAlertCount() {
    const db = await this._initDB();
    return db.count(STORE_NAME);
  }
  
  /**
   * Compute aggregate statistics for the dashboard.
   */
  async getStatistics() {
    const alerts = await this.getAllAlerts();
    
    const stats = {
      total: alerts.length,
      bySeverity: { 1: 0, 2: 0, 3: 0, 4: 0 },
      byCategory: {},
      lastWeek: 0,
      last24Hours: 0,
      mostFrequentZone: null,
    };
    
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const ONE_WEEK = 7 * ONE_DAY;
    const zoneFrequency = {};
    
    for (const alert of alerts) {
      // Severity distribution
      if (alert.severity_level) {
        stats.bySeverity[alert.severity_level] = 
          (stats.bySeverity[alert.severity_level] || 0) + 1;
      }
      
      // Category distribution
      if (alert.risk_category) {
        stats.byCategory[alert.risk_category] = 
          (stats.byCategory[alert.risk_category] || 0) + 1;
      }
      
      // Time-based windows
      const age = now - alert.timestamp;
      if (age <= ONE_DAY) stats.last24Hours++;
      if (age <= ONE_WEEK) stats.lastWeek++;
      
      // Zone frequency tracking
      if (alert.zone_name) {
        zoneFrequency[alert.zone_name] = 
          (zoneFrequency[alert.zone_name] || 0) + 1;
      }
    }
    
    // Find most frequent zone
    let maxCount = 0;
    for (const [zone, count] of Object.entries(zoneFrequency)) {
      if (count > maxCount) {
        maxCount = count;
        stats.mostFrequentZone = { name: zone, count };
      }
    }
    
    return stats;
  }
  
  /**
   * Export alerts as CSV string.
   */
  async exportAsCSV() {
    const alerts = await this.getAllAlerts();
    
    if (alerts.length === 0) return '';
    
    const headers = [
      'Timestamp',
      'Date',
      'Zone Name',
      'Category',
      'Severity',
      'Risk Score',
      'Latitude',
      'Longitude',
      'Alert Message',
    ];
    
    const rows = alerts.map(a => [
      a.timestamp,
      new Date(a.timestamp).toISOString(),
      `"${(a.zone_name || '').replace(/"/g, '""')}"`,
      a.risk_category || '',
      a.severity_level || '',
      a.risk_score || '',
      a.user_lat || '',
      a.user_lon || '',
      `"${(a.alert_message || '').replace(/"/g, '""')}"`,
    ]);
    
    return [
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');
  }
}

const alertHistoryService = new AlertHistoryService();
export default alertHistoryService;