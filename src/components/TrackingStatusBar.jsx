/**
 * TrackingStatusBar
 * 
 * Small persistent indicator showing tracking status.
 * Visible on every page when tracking is active.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, X } from 'lucide-react';
import { useGeofencingContext } from '../context/GeofencingContext';

export default function TrackingStatusBar() {
  const { isTracking, currentLocation, stopTracking } = useGeofencingContext();
  
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