import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Confirmation modal for regenerating a day with AI.
 *
 * Props:
 *   open:        boolean
 *   dayNumber:   number
 *   onClose:     () => void
 *   onConfirm:   async () => void  (calls /regenerate endpoint)
 */
function DayRegenerator({ open, dayNumber, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to regenerate day.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={loading ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="glass-card shadow-medium border border-[#DDD3C5] p-6 w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-accent-primary" />
              </div>
              <h3 className="text-lg font-bold text-text-primary">
                Regenerate Day {dayNumber}?
              </h3>
            </div>
            {!loading && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-bg-elevated transition-colors"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            )}
          </div>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            AI will create a new set of activities for Day {dayNumber}.
            Your other days will not be affected.
          </p>

          <div className="p-3 rounded-xl bg-warning-soft border border-warning/25 mb-5">
            <p className="text-xs text-warning">
              <span className="font-semibold">Note:</span> Current
              activities for Day {dayNumber} will be replaced. This action
              cannot be undone.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/25 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="btn-secondary flex-1 !py-2.5 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2 !py-2.5 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Regenerate
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default DayRegenerator;