/**
 * LiveFatigueAlert
 *
 * Persistent alert banner shown when XGBoost fatigue score
 * exceeds alert thresholds during live tour tracking.
 *
 * Severity levels (matching backend live_fatigue.py):
 *   CAUTION  — score ≥ 50  (amber)
 *   WARNING  — score ≥ 65  (orange)
 *   CRITICAL — score ≥ 80  (red, pulsing)
 *
 * Usage:
 *   <LiveFatigueAlert fatigueData={fatigueData} isLiveMode={isLiveMode} />
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, X, Activity, ArrowRight } from 'lucide-react';

// ─── Threshold constants (must match backend live_fatigue.py) ─────────────────

const THRESHOLD_CAUTION  = 50;
const THRESHOLD_WARNING  = 65;
const THRESHOLD_CRITICAL = 80;

// ─── Alert config by severity ─────────────────────────────────────────────────

const ALERT_CONFIG = {
  CAUTION: {
    icon:       AlertCircle,
    bg:         'bg-warning-soft border-warning/30',
    text:       'text-warning',
    title:      'Fatigue Building',
    pulse:      false,
  },
  WARNING: {
    icon:       AlertTriangle,
    bg:         'bg-danger-soft/70 border-danger/30',
    text:       'text-danger',
    title:      'High Fatigue Detected',
    pulse:      false,
  },
  CRITICAL: {
    icon:       AlertTriangle,
    bg:         'bg-danger-soft border-danger/50',
    text:       'text-danger',
    title:      'Critical Fatigue Level',
    pulse:      true,
  },
};

function getSeverity(score) {
  if (score >= THRESHOLD_CRITICAL) return 'CRITICAL';
  if (score >= THRESHOLD_WARNING)  return 'WARNING';
  if (score >= THRESHOLD_CAUTION)  return 'CAUTION';
  return null;
}

export default function LiveFatigueAlert({ fatigueData, isLiveMode }) {
  const [dismissed, setDismissed]         = useState(false);
  const [lastSeverity, setLastSeverity]   = useState(null);

  const score    = fatigueData?.score ?? 0;
  const severity = isLiveMode ? getSeverity(score) : null;

  // Re-show alert when severity changes (e.g. escalates to CRITICAL)
  useEffect(() => {
    if (severity && severity !== lastSeverity) {
      setDismissed(false);
      setLastSeverity(severity);
    }
  }, [severity, lastSeverity]);

  // Clear dismissed when severity clears
  useEffect(() => {
    if (!severity) {
      setDismissed(false);
      setLastSeverity(null);
    }
  }, [severity]);

  const shouldShow = isLiveMode && severity && !dismissed;
  if (!shouldShow) return null;

  const config   = ALERT_CONFIG[severity];
  const AlertIcon = config.icon;

  const messages = {
    CAUTION: {
      message: 'Your fatigue level is increasing. Consider slowing your pace.',
      action:  'Plan a rest stop within the next 20 minutes.',
    },
    WARNING: {
      message: 'Significant fatigue detected from your walking activity.',
      action:  'Find a rest spot now and rehydrate before continuing.',
    },
    CRITICAL: {
      message: 'Your fatigue is at a critical level. Stop activity immediately.',
      action:  'Sit down, hydrate, and rest for at least 20 minutes.',
    },
  };

  const msg = messages[severity];

  return (
    <AnimatePresence>
      <motion.div
        key={severity}
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.97 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`
          relative rounded-2xl border p-4 ${config.bg}
          ${config.pulse ? 'ring-2 ring-danger/30 ring-offset-1' : ''}
        `}
      >
        {/* Pulse ring for CRITICAL */}
        {config.pulse && (
          <div className="absolute inset-0 rounded-2xl ring-2 ring-danger/20 animate-ping pointer-events-none" />
        )}

        <div className="relative flex items-start gap-3">
          {/* Icon */}
          <div className={`shrink-0 mt-0.5 ${config.pulse ? 'animate-pulse' : ''}`}>
            <AlertIcon className={`w-5 h-5 ${config.text}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-bold ${config.text}`}>
                {config.title}
              </span>
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full bg-white/40 ${config.text}`}>
                Score: {score}
              </span>
            </div>
            <p className="text-sm text-text-primary mb-1">
              {msg.message}
            </p>
            <div className="flex items-center gap-1.5">
              <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${config.text}`} />
              <p className={`text-xs font-medium ${config.text}`}>
                {msg.action}
              </p>
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/30 transition-colors ${config.text}`}
            title="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Engine indicator */}
        <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-1.5">
          <Activity className={`w-3 h-3 ${config.text} opacity-60`} />
          <span className={`text-xs ${config.text} opacity-60`}>
            XGBoost live prediction · {severity} threshold reached
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}