/**
 * GPS Drift Filter
 * 
 * Filters GPS readings to:
 * 1. Reject low-accuracy readings
 * 2. Reject implausible jumps (e.g., teleportation)
 * 3. Smooth noise via Exponential Moving Average
 */

import { haversineMeters } from './geometry.js';

export class GPSDriftFilter {
  constructor(options = {}) {
    this.maxAccuracyMeters = options.maxAccuracyMeters || 50;
    this.maxSpeedKmh = options.maxSpeedKmh || 200; // unrealistic above this
    this.smoothingAlpha = options.smoothingAlpha || 0.3;
    
    this.smoothedLat = null;
    this.smoothedLon = null;
    this.smoothedAccuracy = null;
    this.lastTimestamp = null;
    this.lastLat = null;
    this.lastLon = null;
    
    this.stats = {
      totalReadings: 0,
      acceptedReadings: 0,
      rejectedAccuracy: 0,
      rejectedJump: 0,
    };
  }
  
  /**
   * Filter a GPS reading.
   * Returns filtered location or null if rejected.
   */
  filter(lat, lon, accuracy, timestamp) {
    this.stats.totalReadings++;
    
    // ─── Reject low-accuracy readings ───
    if (accuracy > this.maxAccuracyMeters) {
      this.stats.rejectedAccuracy++;
      return null;
    }
    
    // ─── Plausibility check (speed limit) ───
    if (this.lastLat !== null && this.lastTimestamp !== null) {
      const dtSeconds = (timestamp - this.lastTimestamp) / 1000;
      
      if (dtSeconds > 0) {
        const distMeters = haversineMeters(this.lastLat, this.lastLon, lat, lon);
        const speedKmh = (distMeters / dtSeconds) * 3.6;
        
        if (speedKmh > this.maxSpeedKmh) {
          this.stats.rejectedJump++;
          // Don't update lastLat/lastLon — wait for next reading
          return null;
        }
      }
    }
    
    // ─── EMA Smoothing ───
    if (this.smoothedLat === null) {
      // First valid reading
      this.smoothedLat = lat;
      this.smoothedLon = lon;
      this.smoothedAccuracy = accuracy;
    } else {
      // Weight by accuracy (better accuracy = more weight)
      const qualityWeight = Math.min(this.maxAccuracyMeters / accuracy, 1.0);
      const alpha = this.smoothingAlpha * qualityWeight;
      
      this.smoothedLat = alpha * lat + (1 - alpha) * this.smoothedLat;
      this.smoothedLon = alpha * lon + (1 - alpha) * this.smoothedLon;
      this.smoothedAccuracy = alpha * accuracy + (1 - alpha) * this.smoothedAccuracy;
    }
    
    this.lastLat = lat;
    this.lastLon = lon;
    this.lastTimestamp = timestamp;
    this.stats.acceptedReadings++;
    
    return {
      lat: this.smoothedLat,
      lon: this.smoothedLon,
      accuracy: this.smoothedAccuracy,
      raw_lat: lat,
      raw_lon: lon,
      timestamp: timestamp,
    };
  }
  
  reset() {
    this.smoothedLat = null;
    this.smoothedLon = null;
    this.smoothedAccuracy = null;
    this.lastTimestamp = null;
    this.lastLat = null;
    this.lastLon = null;
  }
  
  getStats() {
    return { ...this.stats };
  }
}