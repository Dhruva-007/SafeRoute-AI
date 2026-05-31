import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Loader2,
  AlertCircle,
  ArrowRight,
  MapPin,
  Clock,
  Tag,
} from 'lucide-react';
import { findAlternatives } from '../../services/trips';

/**
 * Modal that shows alternative places similar to the current activity's place.
 * User picks one → it replaces the activity's place + description.
 *
 * Props:
 *   open:          boolean
 *   activity:      current activity dict (for context)
 *   budget:        current trip budget level
 *   onClose:       () => void
 *   onSwap:        async (alternativeDoc) => void
 */
function ActivitySwapper({ open, activity, budget, onClose, onSwap }) {
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    if (!open || !activity?.place) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setAlternatives([]);
      try {
        const data = await findAlternatives(activity.place, {
          budget,
          limit: 6,
        });
        if (!cancelled) setAlternatives(data.alternatives || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, activity, budget]);

  if (!open) return null;

  const handleSwap = async (alt) => {
    setSwapping(true);
    setError(null);
    try {
      await onSwap(alt);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to swap activity.');
    } finally {
      setSwapping(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={swapping ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="glass-card shadow-medium border border-[#DDD3C5] p-6 w-full max-w-2xl max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-lg font-bold text-text-primary">
                Swap Activity
              </h3>
              <p className="text-xs text-text-muted mt-1">
                Currently:{' '}
                <span className="font-medium text-text-secondary">
                  {activity?.place}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={swapping}
              className="p-1.5 rounded-lg hover:bg-bg-elevated transition-colors"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 -mx-2 px-2">
            {loading && (
              <div className="text-center py-10">
                <Loader2 className="w-6 h-6 text-accent-primary animate-spin mx-auto mb-2" />
                <p className="text-sm text-text-muted">
                  Finding alternatives...
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-danger-soft border border-danger/25 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            {!loading && !error && alternatives.length === 0 && (
              <div className="text-center py-10">
                <p className="text-sm text-text-muted">
                  No alternatives found in our database.
                </p>
              </div>
            )}

            <div className="space-y-2">
              {alternatives.map((alt, idx) => (
                <motion.button
                  key={alt.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => handleSwap(alt)}
                  disabled={swapping}
                  className="w-full text-left p-4 rounded-xl bg-white/50 border border-[#DDD3C5] hover:border-accent-primary/40 hover:bg-accent-primary/5 transition-all group disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-text-primary mb-1">
                        {alt.name}
                      </h4>
                      <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed mb-2">
                        {alt.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {alt.category}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {alt.recommended_duration_hours}h
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary capitalize">
                          {alt.budget_level}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary shrink-0 mt-1" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default ActivitySwapper;