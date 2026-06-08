/**
 * useFatigueMonitor
 *
 * Live fatigue monitoring hook with three operating modes:
 *
 * Mode 1 — LIVE XGBoost (highest priority)
 *   Activated when: isTracking=true AND GPS available
 *   Engine: XGBoost model via POST /fatigue/live-predict
 *   Data: GeofencingContext GPS position + accumulated session metrics
 *   Polling: every cooldownMs (default 30s)
 *
 * Mode 2 — SAVED TRIP (medium priority)
 *   Activated when: tripId provided AND not tracking
 *   Engine: Rule-based via GET /fatigue/trip/{id}/current
 *   Data: Pre-baked planning scores from saved trip
 *
 * Mode 3 — PREVIEW (fallback)
 *   Activated when: only days[] provided
 *   Engine: Rule-based via POST /fatigue/score-activity
 *   Data: Current activity from itinerary days array
 *
 * @param {Object} options
 * @param {string|null}  options.tripId      Saved trip ID (optional)
 * @param {Array}        options.days        Generated days from itinerary
 * @param {number}       options.cooldownMs  Refresh interval (default 30s)
 * @param {boolean}      options.enabled     Whether monitoring is active
 * @param {number}       options.groupSize   Number of travellers (for model)
 * @param {number}       options.temperatureC Ambient temperature override
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGeofencingContext } from '../context/GeofencingContext';
import {
  fetchCurrentFatigue,
  scoreActivity,
  livePrediction,
} from '../services/fatigue';

const DEFAULT_COOLDOWN_MS      = 30_000;  // 30 seconds
const HYDERABAD_DEFAULT_LAT    = 17.3850;
const HYDERABAD_DEFAULT_LON    = 78.4867;
const HYDERABAD_DEFAULT_ELEV   = 542.0;   // metres
const EARTH_RADIUS_KM          = 6371.0;

// ─── Haversine distance between two GPS points ────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

export function useFatigueMonitor({
  tripId       = null,
  days         = [],
  cooldownMs   = DEFAULT_COOLDOWN_MS,
  enabled      = true,
  groupSize    = 1,
  temperatureC = 28.0,
}) {
  // ── Geofencing context — GPS source ──────────────────────────────────
  const { isTracking, currentLocation } = useGeofencingContext();

  // ── Core fatigue state ────────────────────────────────────────────────
  const [currentDay, setCurrentDay]                     = useState(1);
  const [currentActivityIndex, setCurrentActivityIndex] = useState(0);
  const [fatigueData, setFatigueData]                   = useState(null);
  const [history, setHistory]                           = useState([]);
  const [loading, setLoading]                           = useState(false);
  const [error, setError]                               = useState(null);
  const [lastUpdated, setLastUpdated]                   = useState(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh]   = useState(
    Math.floor(cooldownMs / 1000)
  );

  // ── Live session metrics — accumulated across GPS updates ────────────
  const sessionRef = useRef({
    startTime:          null,         // Date when tracking started
    totalDistanceKm:    0.0,
    totalElevationGain: 0.0,
    lastLat:            null,
    lastLon:            null,
    lastElevation:      HYDERABAD_DEFAULT_ELEV,
    lastUpdateTime:     null,         // Date of last GPS update
    distDeltaKm:        0.0,
    timeDeltaSeconds:   30.0,
    speedKmh:           0.0,
    grade:              0.0,
  });

  // ── Interval refs ─────────────────────────────────────────────────────
  const pollIntervalRef     = useRef(null);
  const countdownIntervalRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────
  // GPS update tracking — accumulate session metrics on each location change
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isTracking || !currentLocation) return;

    const now    = new Date();
    const sess   = sessionRef.current;
    const newLat = currentLocation.lat;
    const newLon = currentLocation.lon;

    // Initialize session on first GPS fix
    if (sess.startTime === null) {
      sess.startTime      = now;
      sess.lastLat        = newLat;
      sess.lastLon        = newLon;
      sess.lastUpdateTime = now;
      return;
    }

    // Compute distance delta
    const distDelta = haversineKm(sess.lastLat, sess.lastLon, newLat, newLon);

    // Compute time delta
    const timeDeltaMs  = now.getTime() - sess.lastUpdateTime.getTime();
    const timeDeltaSec = timeDeltaMs / 1000;

    // Compute speed
    const speedKmh =
      timeDeltaSec > 0
        ? (distDelta / (timeDeltaSec / 3600))
        : 0;

    // Elevation — use currentLocation.elevation if available, else keep last
    const newElevation =
      typeof currentLocation.elevation === 'number'
        ? currentLocation.elevation
        : sess.lastElevation;

    const elevDelta   = Math.max(0, newElevation - sess.lastElevation);
    const distDeltaM  = distDelta * 1000;
    const grade       =
      distDeltaM > 0
        ? (elevDelta / distDeltaM) * 100
        : 0;

    // Accumulate totals
    sess.totalDistanceKm    += distDelta;
    sess.totalElevationGain += elevDelta;

    // Store per-update deltas for feature vector
    sess.distDeltaKm      = distDelta;
    sess.timeDeltaSeconds = timeDeltaSec;
    sess.speedKmh         = speedKmh;
    sess.grade            = grade;

    // Update last position
    sess.lastLat        = newLat;
    sess.lastLon        = newLon;
    sess.lastElevation  = newElevation;
    sess.lastUpdateTime = now;
  }, [currentLocation, isTracking]);

  // ─────────────────────────────────────────────────────────────────────────
  // Reset session when tracking stops
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isTracking) {
      const sess = sessionRef.current;
      sess.startTime          = null;
      sess.totalDistanceKm    = 0.0;
      sess.totalElevationGain = 0.0;
      sess.lastLat            = null;
      sess.lastLon            = null;
      sess.lastElevation      = HYDERABAD_DEFAULT_ELEV;
      sess.lastUpdateTime     = null;
      sess.distDeltaKm        = 0.0;
      sess.timeDeltaSeconds   = 30.0;
      sess.speedKmh           = 0.0;
      sess.grade              = 0.0;
    }
  }, [isTracking]);

  // ─────────────────────────────────────────────────────────────────────────
  // Preview mode: get current activity from days prop
  // ─────────────────────────────────────────────────────────────────────────

  const getCurrentActivityFromDays = useCallback(() => {
    if (!days || days.length === 0) return null;
    const dayObj = days.find((d) => d.day === currentDay) || days[0];
    if (!dayObj || !dayObj.activities || dayObj.activities.length === 0) {
      return null;
    }
    const idx = Math.min(currentActivityIndex, dayObj.activities.length - 1);
    return { activity: dayObj.activities[idx], dayObj, activityIndex: idx };
  }, [days, currentDay, currentActivityIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // Core refresh — picks the correct mode and fires the right API call
  // ─────────────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      // ── MODE 1: LIVE XGBoost ────────────────────────────────────────
      if (isTracking && currentLocation) {
        const sess = sessionRef.current;
        const now  = new Date();

        const metrics = {
          latitude:             currentLocation.lat,
          longitude:            currentLocation.lon,
          elevation:
            typeof currentLocation.elevation === 'number'
              ? currentLocation.elevation
              : HYDERABAD_DEFAULT_ELEV,
          hour:                 now.getHours(),
          temperature_c:        temperatureC,
          group_size:           Math.max(1, groupSize),
          dist_delta_km:        sess.distDeltaKm,
          time_delta_seconds:   sess.timeDeltaSeconds,
          total_distance_km:    sess.totalDistanceKm,
          total_elevation_gain: sess.totalElevationGain,
          speed_kmh:            sess.speedKmh,
          grade:                sess.grade,
          session_start_iso:
            sess.startTime
              ? sess.startTime.toISOString()
              : now.toISOString(),
        };

        const result = await livePrediction(metrics);

        const payload = {
          score:           result.score_int,
          rawScore:        result.score,
          level:           result.level,
          confidence:      result.confidence,
          dayAverage:      null,
          activity:        null,
          day:             currentDay,
          activityIndex:   currentActivityIndex,
          featuresUsed:    result.features_used,
          engine:          result.engine,
          mode:            'live',
          sessionMetrics: {
            totalDistanceKm:    parseFloat(sess.totalDistanceKm.toFixed(3)),
            totalElevationGain: parseFloat(sess.totalElevationGain.toFixed(1)),
            speedKmh:           parseFloat(sess.speedKmh.toFixed(2)),
            grade:              parseFloat(sess.grade.toFixed(2)),
          },
        };

        setFatigueData(payload);
        setHistory((h) => [...h.slice(-9), payload.score]);

      // ── MODE 2: SAVED TRIP ──────────────────────────────────────────
      } else if (tripId) {
        const data = await fetchCurrentFatigue(
          tripId,
          currentDay,
          currentActivityIndex
        );
        const payload = {
          score:         data.fatigue_score,
          rawScore:      data.fatigue_score,
          level:         data.fatigue_level,
          confidence:    null,
          dayAverage:    data.day_average,
          activity:      data.current_activity,
          day:           data.current_day,
          activityIndex: data.current_activity_index,
          featuresUsed:  null,
          engine:        'rule-based-v1',
          mode:          'saved',
        };
        setFatigueData(payload);
        setHistory((h) => [...h.slice(-9), payload.score]);

      // ── MODE 3: PREVIEW ─────────────────────────────────────────────
      } else {
        const current = getCurrentActivityFromDays();
        if (!current) {
          setFatigueData(null);
          return;
        }
        const result = await scoreActivity(
          {
            time:            current.activity.time || '',
            place:           current.activity.place || '',
            description:     current.activity.description || '',
            estimated_cost:  current.activity.estimated_cost || '',
          },
          current.activityIndex
        );
        const payload = {
          score:         result.score,
          rawScore:      result.score,
          level:         result.level,
          confidence:    null,
          dayAverage:    current.dayObj.day_fatigue_average ?? result.score,
          activity:      current.activity,
          day:           current.dayObj.day,
          activityIndex: current.activityIndex,
          factors:       result.factors,
          featuresUsed:  null,
          engine:        'rule-based-v1',
          mode:          'preview',
        };
        setFatigueData(payload);
        setHistory((h) => [...h.slice(-9), payload.score]);
      }

      setLastUpdated(new Date());
      setSecondsUntilRefresh(Math.floor(cooldownMs / 1000));

    } catch (err) {
      setError(err.message || 'Failed to fetch fatigue data');
    } finally {
      setLoading(false);
    }
  }, [
    enabled,
    isTracking,
    currentLocation,
    tripId,
    currentDay,
    currentActivityIndex,
    cooldownMs,
    groupSize,
    temperatureC,
    getCurrentActivityFromDays,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Polling interval
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return undefined;

    // Initial fetch
    refresh();

    pollIntervalRef.current = setInterval(refresh, cooldownMs);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [enabled, refresh, cooldownMs]);

  // ─────────────────────────────────────────────────────────────────────────
  // Countdown timer (UI display)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return undefined;

    countdownIntervalRef.current = setInterval(() => {
      setSecondsUntilRefresh((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => {
      if (countdownIntervalRef.current)
        clearInterval(countdownIntervalRef.current);
    };
  }, [enabled]);

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation helpers (preview / saved trip modes)
  // ─────────────────────────────────────────────────────────────────────────

  const nextActivity = useCallback(() => {
    const dayObj = days.find((d) => d.day === currentDay);
    if (!dayObj) return;
    if (currentActivityIndex < dayObj.activities.length - 1) {
      setCurrentActivityIndex((i) => i + 1);
    } else {
      const nextDay = days.find((d) => d.day === currentDay + 1);
      if (nextDay) {
        setCurrentDay(currentDay + 1);
        setCurrentActivityIndex(0);
      }
    }
  }, [days, currentDay, currentActivityIndex]);

  const prevActivity = useCallback(() => {
    if (currentActivityIndex > 0) {
      setCurrentActivityIndex((i) => i - 1);
    } else if (currentDay > 1) {
      const prevDay = days.find((d) => d.day === currentDay - 1);
      if (prevDay) {
        setCurrentDay(currentDay - 1);
        setCurrentActivityIndex(prevDay.activities.length - 1);
      }
    }
  }, [days, currentDay, currentActivityIndex]);

  const hasNext = useCallback(() => {
    const dayObj = days.find((d) => d.day === currentDay);
    if (!dayObj) return false;
    if (currentActivityIndex < dayObj.activities.length - 1) return true;
    return !!days.find((d) => d.day === currentDay + 1);
  }, [days, currentDay, currentActivityIndex]);

  const hasPrev = useCallback(() => {
    if (currentActivityIndex > 0) return true;
    return currentDay > 1;
  }, [currentDay, currentActivityIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived mode indicator
  // ─────────────────────────────────────────────────────────────────────────

  const activeMode = isTracking && currentLocation
    ? 'live'
    : tripId
    ? 'saved'
    : 'preview';

  return {
    // Fatigue state
    fatigueData,
    history,
    loading,
    error,
    lastUpdated,
    secondsUntilRefresh,
    cooldownMs,

    // Mode
    activeMode,
    isLiveMode: activeMode === 'live',
    isConnected: !!tripId,

    // Navigation
    currentDay,
    currentActivityIndex,
    refresh,
    nextActivity,
    prevActivity,
    hasNext: hasNext(),
    hasPrev: hasPrev(),

    // Session metrics (live mode only)
    sessionMetrics: fatigueData?.sessionMetrics ?? null,
  };
}