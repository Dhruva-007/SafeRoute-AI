import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCurrentFatigue, scoreActivity } from '../services/fatigue';

const DEFAULT_COOLDOWN_MS = 30000; // 30 seconds

/**
 * Live fatigue monitor hook.
 *
 * Modes:
 *   1. Saved Trip Mode  — tripId provided, polls backend every cooldown.
 *   2. Preview Mode     — only days[] provided, scores activities locally
 *                          via /fatigue/score-activity on demand.
 *
 * @param {Object} options
 * @param {string|null} options.tripId         Saved trip ID (optional)
 * @param {Array}       options.days           Generated days from itinerary
 * @param {number}      options.cooldownMs     Refresh interval (default 30s)
 * @param {boolean}     options.enabled        Whether polling is active
 */
export function useFatigueMonitor({
  tripId = null,
  days = [],
  cooldownMs = DEFAULT_COOLDOWN_MS,
  enabled = true,
}) {
  const [currentDay, setCurrentDay] = useState(1);
  const [currentActivityIndex, setCurrentActivityIndex] = useState(0);
  const [fatigueData, setFatigueData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(
    Math.floor(cooldownMs / 1000)
  );

  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  /* ------------------------------------------------------------------ */
  /* Derived: current activity from days prop                            */
  /* ------------------------------------------------------------------ */

  const getCurrentActivityFromDays = useCallback(() => {
    if (!days || days.length === 0) return null;
    const dayObj = days.find((d) => d.day === currentDay) || days[0];
    if (!dayObj || !dayObj.activities || dayObj.activities.length === 0) {
      return null;
    }
    const idx = Math.min(currentActivityIndex, dayObj.activities.length - 1);
    return {
      activity: dayObj.activities[idx],
      dayObj,
      activityIndex: idx,
    };
  }, [days, currentDay, currentActivityIndex]);

  /* ------------------------------------------------------------------ */
  /* Fetcher — picks backend mode (saved trip) or preview mode           */
  /* ------------------------------------------------------------------ */

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      if (tripId) {
        // ─── SAVED TRIP MODE ─────────────────────────────────────
        const data = await fetchCurrentFatigue(
          tripId,
          currentDay,
          currentActivityIndex
        );
        const payload = {
          score: data.fatigue_score,
          level: data.fatigue_level,
          dayAverage: data.day_average,
          activity: data.current_activity,
          day: data.current_day,
          activityIndex: data.current_activity_index,
          mode: 'saved',
        };
        setFatigueData(payload);
        setHistory((h) => [...h.slice(-9), payload.score]);
      } else {
        // ─── PREVIEW MODE ────────────────────────────────────────
        const current = getCurrentActivityFromDays();
        if (!current) {
          setFatigueData(null);
          return;
        }
        const result = await scoreActivity(
          {
            time: current.activity.time || '',
            place: current.activity.place || '',
            description: current.activity.description || '',
            estimated_cost: current.activity.estimated_cost || '',
          },
          current.activityIndex
        );
        const payload = {
          score: result.score,
          level: result.level,
          dayAverage: current.dayObj.day_fatigue_average ?? result.score,
          activity: current.activity,
          day: current.dayObj.day,
          activityIndex: current.activityIndex,
          factors: result.factors,
          mode: 'preview',
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
    tripId,
    currentDay,
    currentActivityIndex,
    cooldownMs,
    getCurrentActivityFromDays,
  ]);

  /* ------------------------------------------------------------------ */
  /* Polling interval                                                    */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!enabled) return undefined;

    // Initial fetch
    refresh();

    // Set polling interval
    intervalRef.current = setInterval(() => {
      refresh();
    }, cooldownMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, refresh, cooldownMs]);

  /* ------------------------------------------------------------------ */
  /* Countdown timer (UI display)                                        */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!enabled) return undefined;

    countdownRef.current = setInterval(() => {
      setSecondsUntilRefresh((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [enabled]);

  /* ------------------------------------------------------------------ */
  /* Navigation between activities                                       */
  /* ------------------------------------------------------------------ */

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

  return {
    fatigueData,
    history,
    loading,
    error,
    lastUpdated,
    secondsUntilRefresh,
    cooldownMs,
    currentDay,
    currentActivityIndex,
    refresh,
    nextActivity,
    prevActivity,
    hasNext: hasNext(),
    hasPrev: hasPrev(),
    isConnected: !!tripId,
  };
}