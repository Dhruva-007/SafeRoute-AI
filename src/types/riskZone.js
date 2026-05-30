/**
 * Type definitions for risk zones.
 * 
 * Mirrors the Python RiskZone model from the data pipeline.
 */

export const ZoneType = {
  POLYGON: 'polygon',
  CIRCLE: 'circle',
};

export const SeverityLevel = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export const SEVERITY_COLORS = {
  1: '#28a745',  // Green
  2: '#ffc107',  // Yellow
  3: '#fd7e14',  // Orange
  4: '#dc3545',  // Red
};

export const SEVERITY_LABELS = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
};

export const RISK_CATEGORIES = {
  industrial: { label: 'Industrial', icon: '🏭' },
  abandoned: { label: 'Abandoned', icon: '🏚️' },
  poorly_lit_roads: { label: 'Poorly Lit', icon: '🌑' },
  restricted: { label: 'Restricted', icon: '⛔' },
  unsafe_transit: { label: 'Unsafe Transit', icon: '🚏' },
  accident_junction: { label: 'Junction', icon: '🚦' },
};

/**
 * @typedef {Object} RiskZone
 * @property {number} id - Database ID
 * @property {string} zone_uuid - Unique identifier
 * @property {string} name - Human-readable name
 * @property {string} zone_type - 'polygon' or 'circle'
 * @property {number} center_lat - Center latitude (circles)
 * @property {number} center_lon - Center longitude (circles)
 * @property {number} radius_meters - Radius (circles)
 * @property {number} bbox_min_lat - Bounding box south
 * @property {number} bbox_min_lon - Bounding box west
 * @property {number} bbox_max_lat - Bounding box north
 * @property {number} bbox_max_lon - Bounding box east
 * @property {string} risk_category - Category identifier
 * @property {number} risk_score - 0.0 to 1.0
 * @property {number} severity_level - 1-4
 * @property {boolean} is_time_dependent
 * @property {string} alert_message - Display text for alert
 */

// ════════════════════════════════════════════════════════════════
// EMERGENCY SERVICE TYPES (Phase 1.5)
// ════════════════════════════════════════════════════════════════

export const ServiceType = {
  HOSPITAL: 'hospital',
  CLINIC: 'clinic',
  POLICE: 'police',
  FIRE_STATION: 'fire_station',
  AMBULANCE: 'ambulance',
  PHARMACY_24H: 'pharmacy_24h',
  SHELTER: 'shelter',
  HELIPAD: 'helipad',
};

export const SERVICE_TYPE_INFO = {
  hospital: {
    label: 'Hospital',
    icon: '🏥',
    color: '#ef4444',          // red
    bgColor: 'rgba(239, 68, 68, 0.15)',
    priority: 1,
    callable: true,
  },
  clinic: {
    label: 'Clinic',
    icon: '⚕️',
    color: '#f97316',          // orange
    bgColor: 'rgba(249, 115, 22, 0.15)',
    priority: 3,
    callable: true,
  },
  police: {
    label: 'Police',
    icon: '🚓',
    color: '#3b82f6',          // blue
    bgColor: 'rgba(59, 130, 246, 0.15)',
    priority: 1,
    callable: true,
  },
  fire_station: {
    label: 'Fire Station',
    icon: '🚒',
    color: '#dc2626',          // dark red
    bgColor: 'rgba(220, 38, 38, 0.15)',
    priority: 1,
    callable: true,
  },
  ambulance: {
    label: 'Ambulance',
    icon: '🚑',
    color: '#10b981',          // green
    bgColor: 'rgba(16, 185, 129, 0.15)',
    priority: 2,
    callable: true,
  },
  pharmacy_24h: {
    label: '24/7 Pharmacy',
    icon: '💊',
    color: '#8b5cf6',          // purple
    bgColor: 'rgba(139, 92, 246, 0.15)',
    priority: 2,
    callable: true,
  },
  shelter: {
    label: 'Emergency Shelter',
    icon: '🏠',
    color: '#06b6d4',          // cyan
    bgColor: 'rgba(6, 182, 212, 0.15)',
    priority: 3,
    callable: false,
  },
  helipad: {
    label: 'Helipad',
    icon: '🚁',
    color: '#eab308',          // yellow
    bgColor: 'rgba(234, 179, 8, 0.15)',
    priority: 2,
    callable: false,
  },
};

export const CONFIDENCE_LABELS = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Verified',
};