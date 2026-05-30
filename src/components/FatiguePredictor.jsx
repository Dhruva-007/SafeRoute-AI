import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Clock,
  Heart,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
  MapPin,
  Calendar,
} from 'lucide-react';
import { useFatigueMonitor } from '../hooks/useFatigueMonitor';
import {
  FATIGUE_BG,
  FATIGUE_TEXT,
  FATIGUE_BORDER,
  FATIGUE_BAR,
  FATIGUE_BAR_SOFT,
  FATIGUE_LABEL,
  scoreToLevel,
} from '../utils/fatigueStyles';

const RECOMMENDATIONS = {
  LOW: {
    title: "You're good to continue your journey.",
    tips: [
      'Keep hydrated and maintain your current pace.',
      'Next recommended break in ~45 minutes.',
      'Conditions are favorable for exploration.',
    ],
    nextBreak: 'Next break suggested in ~45 min',
  },
  MEDIUM: {
    title: 'Consider taking a short break soon.',
    tips: [
      'Reduce walking speed by 20%.',
      'Find a rest spot within the next 15 minutes.',
      'Hydrate and consume a light snack.',
    ],
    nextBreak: 'Break suggested in ~15 min',
  },
  HIGH: {
    title: 'High fatigue detected. Rest is strongly recommended.',
    tips: [
      'Stop and rest for at least 20 minutes immediately.',
      'Find shade or a cool resting area.',
      'Rehydrate and assess before continuing.',
      "Consider shortening today's itinerary.",
    ],
    nextBreak: 'Immediate rest recommended',
  },
};

function FatiguePredictor({ tripId = null, days = [] }) {
  const {
    fatigueData,
    history,
    loading,
    error,
    lastUpdated,
    secondsUntilRefresh,
    cooldownMs,
    refresh,
    nextActivity,
    prevActivity,
    hasNext,
    hasPrev,
    isConnected,
  } = useFatigueMonitor({
    tripId,
    days,
    cooldownMs: 30000,
    enabled: days.length > 0,
  });

  /* ------------------------------------------------------------------ */
  /* Empty state                                                         */
  /* ------------------------------------------------------------------ */

  if (!days || days.length === 0) {
    return (
      <div className="glass-card shadow-soft border border-[#DDD3C5] p-8 text-center">
        <Activity className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <h3 className="text-base font-semibold text-text-primary mb-2">
          Fatigue Predictor
        </h3>
        <p className="text-sm text-text-secondary">
          Generate or open a trip to view live fatigue monitoring.
        </p>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Loading state                                                       */
  /* ------------------------------------------------------------------ */

  if (loading && !fatigueData) {
    return (
      <div className="glass-card shadow-soft border border-[#DDD3C5] p-8 text-center">
        <RefreshCw className="w-8 h-8 text-accent-primary animate-spin mx-auto mb-3" />
        <p className="text-sm text-text-secondary">Loading fatigue data...</p>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Error state                                                         */
  /* ------------------------------------------------------------------ */

  if (error && !fatigueData) {
    return (
      <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
        <div className="flex items-center gap-3 mb-3">
          <AlertCircle className="w-5 h-5 text-danger" />
          <p className="text-sm font-semibold text-danger">
            Failed to load fatigue data
          </p>
        </div>
        <p className="text-xs text-text-secondary mb-4">{error}</p>
        <button
          onClick={refresh}
          className="btn-secondary text-sm inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!fatigueData) return null;

  const level = fatigueData.level || 'LOW';
  const score = fatigueData.score ?? 0;
  const StatusIcon =
    level === 'LOW'
      ? CheckCircle
      : level === 'MEDIUM'
        ? AlertCircle
        : AlertTriangle;
  const currentRec = RECOMMENDATIONS[level];
  const cooldownSeconds = Math.floor(cooldownMs / 1000);
  const progressPct =
    ((cooldownSeconds - secondsUntilRefresh) / cooldownSeconds) * 100;

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
            <Activity className="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              Fatigue Predictor
            </h2>
            <p className="text-sm text-text-secondary">
              {isConnected
                ? 'Live monitoring from saved trip'
                : 'Preview from current itinerary'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-soft text-success text-xs font-medium border border-success/25">
              <Wifi className="w-3 h-3" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning-soft text-warning text-xs font-medium border border-warning/25">
              <WifiOff className="w-3 h-3" />
              Preview
            </span>
          )}
        </div>
      </div>

      {/* ---- Current Activity Card ---- */}
      <div className="glass-card shadow-soft border border-[#DDD3C5] p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-muted mb-1">
              Currently Monitoring
            </p>
            <h3 className="text-base font-semibold text-text-primary">
              {fatigueData.activity?.place || 'Activity'}
            </h3>
            <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Day {fatigueData.day}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {fatigueData.activity?.time || 'TBD'}
              </span>
            </div>
          </div>

          {/* Activity Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevActivity}
              disabled={!hasPrev}
              className="p-2 rounded-lg border border-[#DDD3C5] hover:bg-accent-primary/5 hover:border-accent-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Previous activity"
            >
              <ChevronLeft className="w-4 h-4 text-text-secondary" />
            </button>
            <button
              onClick={nextActivity}
              disabled={!hasNext}
              className="p-2 rounded-lg border border-[#DDD3C5] hover:bg-accent-primary/5 hover:border-accent-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Next activity"
            >
              <ChevronRight className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
        </div>

        {fatigueData.activity?.description && (
          <p className="text-xs text-text-secondary leading-relaxed border-t border-[#DDD3C5] pt-3">
            {fatigueData.activity.description}
          </p>
        )}
      </div>

      {/* ---- Main Fatigue Result ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Gauge Card ─── */}
        <motion.div
          layout
          className="glass-card shadow-soft border border-[#DDD3C5] p-6 sm:p-8 relative overflow-hidden"
        >
          {/* Subtle glow halo at top center (replaces loud accent stripe) */}
          <div
            className={`absolute -top-px left-1/2 -translate-x-1/2 w-32 h-px ${FATIGUE_BAR[level]} opacity-40 rounded-full blur-sm`}
          />

          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-text-secondary mb-1">
                Fatigue Level
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={level}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3"
                >
                  <span
                    className={`text-3xl sm:text-4xl font-extrabold ${FATIGUE_TEXT[level]}`}
                  >
                    {level}
                  </span>
                  <StatusIcon className={`w-6 h-6 ${FATIGUE_TEXT[level]}`} />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="text-right">
              <p className="text-sm text-text-muted">Score</p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={score}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-2xl font-bold text-text-primary"
                >
                  {score}
                  <span className="text-sm text-text-muted font-normal">
                    /100
                  </span>
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="w-full h-3 rounded-full bg-accent-primary/10 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${FATIGUE_BAR[level]}/70`}
                animate={{ width: `${score}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-success/70">Low</span>
              <span className="text-xs text-warning/70">Medium</span>
              <span className="text-xs text-danger/70">High</span>
            </div>
          </div>

          {/* Day Average */}
          {fatigueData.dayAverage !== undefined && (
            <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
              <span className="text-xs text-text-muted flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Day Average
              </span>
              <span className="text-sm font-semibold text-text-primary">
                {fatigueData.dayAverage}/100
              </span>
            </div>
          )}

          {/* History Chart */}
          {history.length > 1 && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-text-muted">
                  Recent History
                </span>
                <span className="text-xs text-text-muted">
                  {history.length} reading
                  {history.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-end gap-1 h-12">
                {history.map((val, i) => (
                  <motion.div
                    key={`${i}-${val}`}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(8, val)}%` }}
                    transition={{ duration: 0.5 }}
                    className={`flex-1 rounded-sm ${FATIGUE_BAR_SOFT[scoreToLevel(val)]}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Live indicator + cooldown */}
          <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border-subtle">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div
                  className={`w-2 h-2 rounded-full ${
                    loading ? 'bg-warning' : 'bg-success'
                  }`}
                />
                {!loading && (
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-success animate-ping" />
                )}
              </div>
              <span className="text-xs text-text-muted">
                {loading ? 'Updating...' : 'Live monitoring'}
              </span>
            </div>

            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent-primary transition-colors disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw
                className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
              />
              {secondsUntilRefresh > 0 ? `${secondsUntilRefresh}s` : 'now'}
            </button>
          </div>

          {/* Cooldown progress bar */}
          <div className="mt-2 w-full h-0.5 rounded-full bg-accent-primary/10 overflow-hidden">
            <motion.div
              className="h-full bg-accent-primary/40"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1, ease: 'linear' }}
            />
          </div>
        </motion.div>

        {/* ─── Recommendations Card ─── */}
        <motion.div
          layout
          className="glass-card shadow-soft border border-[#DDD3C5] p-6 sm:p-8"
        >
          <div className="flex items-center gap-2 mb-5">
            <Heart className="w-5 h-5 text-accent-primary" />
            <h3 className="text-base font-semibold text-text-primary">
              Recommendations
            </h3>
          </div>

          <div
            className={`p-4 rounded-xl ${FATIGUE_BG[level]} border ${FATIGUE_BORDER[level]} mb-5`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={level}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <StatusIcon className={`w-4 h-4 ${FATIGUE_TEXT[level]}`} />
                  <span
                    className={`text-sm font-semibold ${FATIGUE_TEXT[level]}`}
                  >
                    {FATIGUE_LABEL[level]}
                  </span>
                </div>
                <p className="text-sm text-text-primary font-medium">
                  {currentRec.title}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={level}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="space-y-3"
            >
              {currentRec.tips.map((tip, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-accent-primary/5"
                >
                  <div className="w-5 h-5 rounded-full bg-accent-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-accent-primary">
                      {i + 1}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {tip}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Footer info */}
          <div className="mt-5 pt-4 border-t border-border-subtle space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-muted" />
              <span className="text-xs text-text-muted">
                {currentRec.nextBreak}
              </span>
            </div>
            {lastUpdated && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-text-muted" />
                <span className="text-xs text-text-muted">
                  Last updated:{' '}
                  {lastUpdated.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ---- Engine Note ---- */}
      <div className="text-center pt-2">
        <p className="text-xs text-text-muted">
          Fatigue Engine v1 (rule-based) ·{' '}
          <span className="italic">XGBoost integration coming soon</span>
        </p>
      </div>
    </div>
  );
}

export default FatiguePredictor;