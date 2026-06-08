/**
 * Fatigue API service.
 *
 * Functions:
 *   scoreActivity()      — rule-based, used during trip planning preview
 *   fetchCurrentFatigue() — rule-based, used for saved trip activity lookup
 *   livePrediction()     — XGBoost, used during active live tour tracking
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─────────────────────────────────────────────────────────────────────────────
// Existing functions (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a single activity for fatigue (rule-based, planning phase).
 * @param {Object} activity - { time, place, description, estimated_cost }
 * @param {number} priorActivitiesToday
 * @returns {Promise<{score: number, level: string, factors: Object}>}
 */
export const scoreActivity = async (activity, priorActivitiesToday = 0) => {
  const response = await fetch(`${API_BASE_URL}/fatigue/score-activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activity,
      prior_activities_today: priorActivitiesToday,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to score activity');
  }

  return await response.json();
};

/**
 * Get live fatigue for a saved trip's current activity (rule-based).
 * @param {string} tripId
 * @param {number} day
 * @param {number} activityIndex
 * @returns {Promise<Object>}
 */
export const fetchCurrentFatigue = async (
  tripId,
  day = 1,
  activityIndex = 0
) => {
  const url = new URL(`${API_BASE_URL}/fatigue/trip/${tripId}/current`);
  url.searchParams.set('day', day);
  url.searchParams.set('activity_index', activityIndex);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error('Failed to fetch fatigue');
  }

  return await response.json();
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW — XGBoost live prediction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run XGBoost live fatigue prediction during an active tour.
 *
 * Sends accumulated session metrics to the backend and receives
 * a model-based fatigue score, level, and alert information.
 *
 * @param {Object} metrics - Live travel metrics
 * @param {number} metrics.latitude              - GPS latitude
 * @param {number} metrics.longitude             - GPS longitude
 * @param {number} [metrics.elevation]           - Elevation in metres (default: 542)
 * @param {number} [metrics.hour]                - Local hour 0-23 (server derives if omitted)
 * @param {number} [metrics.temperature_c]       - Ambient temperature °C
 * @param {number} [metrics.group_size]          - Number of travellers
 * @param {number} [metrics.dist_delta_km]       - Distance since last update (km)
 * @param {number} [metrics.time_delta_seconds]  - Seconds since last update
 * @param {number} [metrics.total_distance_km]   - Total session distance (km)
 * @param {number} [metrics.total_elevation_gain]- Cumulative elevation gain (m)
 * @param {number} [metrics.speed_kmh]           - Current speed (km/h)
 * @param {number} [metrics.grade]               - Slope grade %
 * @param {string} [metrics.terrain]             - Terrain type
 * @param {string} [metrics.session_start_iso]   - ISO8601 session start
 *
 * @returns {Promise<{
 *   score: number,
 *   score_int: number,
 *   level: string,
 *   confidence: number,
 *   features_used: Object,
 *   engine: string
 * }>}
 */
export const livePrediction = async (metrics) => {
  const response = await fetch(`${API_BASE_URL}/fatigue/live-predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      errorBody.detail || `Live prediction failed (${response.status})`
    );
  }

  return await response.json();
};

/**
 * Check XGBoost model health.
 * @returns {Promise<Object>}
 */
export const checkModelHealth = async () => {
  const response = await fetch(`${API_BASE_URL}/fatigue/model/health`);
  if (!response.ok) {
    throw new Error('Model health check failed');
  }
  return await response.json();
};