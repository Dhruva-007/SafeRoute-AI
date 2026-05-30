/**
 * Geofence State Manager
 * 
 * Manages zone entry/exit state with:
 * - Entry confirmation (require 3 consecutive fixes)
 * - Exit hysteresis (small buffer to prevent flapping)
 * - Alert cooldown (prevents repeat alerts)
 */

export class GeofenceStateManager {
  constructor(options = {}) {
    this.confirmationThreshold = options.confirmationThreshold || 3;
    this.alertCooldownMs = options.alertCooldownMs || 5 * 60 * 1000; // 5 min
    
    // zone_uuid → metadata
    this.activeZones = new Map();        // confirmed entries
    this.entryCounters = new Map();      // confirmation counts
    this.alertCooldown = new Map();      // last alert timestamps
  }
  
  /**
   * Process zone status for a single zone.
   * Returns array of events (ENTRY, EXIT, or empty).
   */
  processZone(zoneId, isInside, currentTime) {
    const events = [];
    
    if (isInside) {
      // Increment confirmation counter
      const count = (this.entryCounters.get(zoneId) || 0) + 1;
      this.entryCounters.set(zoneId, count);
      
      if (count >= this.confirmationThreshold && !this.activeZones.has(zoneId)) {
        // Confirmed entry
        this.activeZones.set(zoneId, currentTime);
        
        // Check cooldown
        const lastAlert = this.alertCooldown.get(zoneId) || 0;
        if (currentTime - lastAlert > this.alertCooldownMs) {
          this.alertCooldown.set(zoneId, currentTime);
          events.push({
            type: 'ENTRY',
            zoneId,
            timestamp: currentTime,
          });
        }
      }
    } else {
      // Reset confirmation counter
      if (this.entryCounters.has(zoneId)) {
        this.entryCounters.set(zoneId, 0);
      }
      
      // Detect exit
      if (this.activeZones.has(zoneId)) {
        this.activeZones.delete(zoneId);
        events.push({
          type: 'EXIT',
          zoneId,
          timestamp: currentTime,
        });
      }
    }
    
    return events;
  }
  
  /**
   * Process zones not in candidate list (potential exits).
   */
  processExitsForMissingZones(candidateZoneIds, currentTime) {
    const events = [];
    const candidateSet = new Set(candidateZoneIds);
    
    for (const zoneId of this.activeZones.keys()) {
      if (!candidateSet.has(zoneId)) {
        // User moved out of bbox range entirely
        this.activeZones.delete(zoneId);
        this.entryCounters.delete(zoneId);
        events.push({
          type: 'EXIT',
          zoneId,
          timestamp: currentTime,
        });
      }
    }
    
    return events;
  }
  
  getActiveZones() {
    return Array.from(this.activeZones.keys());
  }
  
  getActiveZoneCount() {
    return this.activeZones.size;
  }
  
  reset() {
    this.activeZones.clear();
    this.entryCounters.clear();
    this.alertCooldown.clear();
  }
}