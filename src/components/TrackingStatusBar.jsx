/**
 * TrackingStatusBar
 *
 * Small persistent indicator showing tracking + live fatigue status.
 * Visible on every page when tracking is active.
 *
 * Now shows XGBoost fatigue level badge when live monitoring is running.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, X, Activity } from 'lucide-react';
import { useGeofencingContext } from '../context/GeofencingContext';
import { livePrediction } from '../services/fatigue';

// ─── Fatigue badge styles ─────────────────────────────────────────────────────

const FATIGUE_BADGE = {
  LOW:    'bg-success/20 text-green-300 border-success/30',
  MEDIUM: 'bg-warning/20 text-yellow-300 border-warning/30',
  HIGH:   'bg-danger/20 text-red-300 border-danger/30',
};

const FATIGUE_DOT = {
  LOW:    'bg-green-400',
  MEDIUM: 'bg-yellow-400',
  HIGH:   'bg-red-400',
};

// ─── Polling interval for status bar fatigue (slightly longer than full predictor) ──

const STATUS_BAR_POLL_MS = 45_000;   // 45 seconds — lightweight background poll

export default function TrackingStatusBar() {
  const { isTracking, currentLocation, stopTracking } = useGeofencingContext();

  const [fatigueLevel, setFatigueLevel] = useState(null);
  const [fatigueScore, setFatigueScore] = useState(null);
  const pollRef                          = useRef(null);
  const sessionRef                       = useRef({
    totalDistanceKm:    0,
    totalElevationGain: 0,
    lastLat:            null,
    lastLon:            null,
  });

  // ── Lightweight GPS accumulation for status bar ───────────────────────
  useEffect(() => {
    if (!isTracking || !currentLocation) return;

    const sess = sessionRef.current;
    if (sess.lastLat !== null) {
      // Simple distance approximation (flat earth — good enough for status bar)
      const dLat = (currentLocation.lat - sess.lastLat) * 111.32;
      const dLon =
        (currentLocation.lon - sess.lastLon) *
        111.32 *
        Math.cos((currentLocation.lat * Math.PI) / 180);
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);
      sess.totalDistanceKm += dist;
    }
    sess.lastLat = currentLocation.lat;
    sess.lastLon = currentLocation.lon;
  }, [currentLocation, isTracking]);

  // ── Reset session on tracking stop ────────────────────────────────────
  useEffect(() => {
    if (!isTracking) {
      setFatigueLevel(null);
      setFatigueScore(null);
      sessionRef.current = {
        totalDistanceKm:    0,
        totalElevationGain: 0,
        lastLat:            null,
        lastLon:            null,
      };
    }
  }, [isTracking]);

  // ── Background fatigue polling ─────────────────────────────────────────
  useEffect(() => {
    if (!isTracking || !currentLocation) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const runPoll = async () => {
      try {
        const sess = sessionRef.current;
        const now  = new Date();
        const result = await livePrediction({
          latitude:             currentLocation.lat,
          longitude:            currentLocation.lon,
          elevation:            currentLocation.elevation ?? 542.0,
          hour:                 now.getHours(),
          temperature_c:        28.0,
          group_size:           1,
          dist_delta_km:        0.0,
          time_delta_seconds:   STATUS_BAR_POLL_MS / 1000,
          total_distance_km:    sess.totalDistanceKm,
          total_elevation_gain: sess.totalElevationGain,
        });
        setFatigueLevel(result.level);
        setFatigueScore(result.score_int);
      } catch {
        // Silent fail — status bar should not show errors
      }
    };

    // Initial poll
    runPoll();

    pollRef.current = setInterval(runPoll, STATUS_BAR_POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isTracking, currentLocation]);

  const badgeStyle  = fatigueLevel ? FATIGUE_BADGE[fatigueLevel] : null;
  const dotStyle    = fatigueLevel ? FATIGUE_DOT[fatigueLevel]   : null;

  return (
    <AnimatePresence>
      {isTracking && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-2 bg-green-500/20 backdrop-blur-md border border-green-500/30 rounded-full shadow-lg">
            {/* Tracking indicator */}
            <div className="relative flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div className="absolute w-2 h-2 rounded-full bg-green-500 animate-ping" />
            </div>

            <Navigation className="w-3.5 h-3.5 text-green-400" />

            <span className="text-xs font-medium text-green-400">
              SafeRoute Tracking Active
            </span>

            {currentLocation && (
              <span className="text-[10px] text-green-300/60 font-mono">
                ±{currentLocation.accuracy.toFixed(0)}m
              </span>
            )}

            {/* XGBoost Fatigue Badge */}
            {fatigueLevel && badgeStyle && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold ${badgeStyle}`}
              >
                <div className="relative">
                  <div className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
                  {fatigueLevel === 'HIGH' && (
                    <div className={`absolute inset-0 w-1.5 h-1.5 rounded-full ${dotStyle} animate-ping`} />
                  )}
                </div>
                <Activity className="w-2.5 h-2.5" />
                <span>
                  {fatigueLevel} · {fatigueScore}
                </span>
              </motion.div>
            )}

            {/* Stop button */}
            <button
              onClick={stopTracking}
              className="ml-2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-green-500/30 transition-colors"
              title="Stop tracking"
            >
              <X className="w-3 h-3 text-green-400" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}