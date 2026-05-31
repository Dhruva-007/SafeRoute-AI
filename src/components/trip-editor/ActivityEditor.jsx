import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2, AlertCircle } from 'lucide-react';

/**
 * Modal for editing or creating an activity.
 *
 * Props:
 *   open:          boolean
 *   mode:          'edit' | 'add'
 *   initialValue:  { time, place, description, estimated_cost } | null
 *   onClose:       () => void
 *   onSave:        async (activityData) => void
 */
function ActivityEditor({ open, mode = 'edit', initialValue = null, onClose, onSave }) {
  const [form, setForm] = useState({
    time: '',
    place: '',
    description: '',
    estimated_cost: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({
        time: initialValue?.time || '',
        place: initialValue?.place || '',
        description: initialValue?.description || '',
        estimated_cost: initialValue?.estimated_cost || '',
      });
      setError(null);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSave = async () => {
    if (!form.place.trim()) {
      setError('Place name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        time: form.time.trim() || 'TBD',
        place: form.place.trim(),
        description: form.description.trim(),
        estimated_cost: form.estimated_cost.trim() || '₹0',
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="glass-card shadow-medium border border-[#DDD3C5] p-6 w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-text-primary">
              {mode === 'add' ? 'Add Activity' : 'Edit Activity'}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-bg-elevated transition-colors"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/25 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Time
              </label>
              <input
                type="text"
                value={form.time}
                onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                placeholder="e.g., 9:00 AM"
                className="w-full px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Place *
              </label>
              <input
                type="text"
                value={form.place}
                onChange={(e) => setForm((p) => ({ ...p, place: e.target.value }))}
                placeholder="e.g., Golconda Fort"
                className="w-full px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="What will you do here?"
                rows={3}
                className="w-full px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Estimated Cost
              </label>
              <input
                type="text"
                value={form.estimated_cost}
                onChange={(e) =>
                  setForm((p) => ({ ...p, estimated_cost: e.target.value }))
                }
                placeholder="e.g., ₹500 per person"
                className="w-full px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={saving}
              className="btn-secondary flex-1 !py-2.5 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2 !py-2.5 text-sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {mode === 'add' ? 'Add' : 'Save'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default ActivityEditor;