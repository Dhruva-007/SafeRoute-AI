import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Share2,
  Copy,
  CheckCircle,
  Loader2,
  AlertCircle,
  Link as LinkIcon,
  Clock,
  Trash2,
} from 'lucide-react';
import { createShareLink, revokeShareLink } from '../../services/trips';

const EXPIRY_OPTIONS = [
  { id: '1d', label: '1 day', desc: 'For quick sharing' },
  { id: '7d', label: '7 days', desc: 'Default · most common' },
  { id: '30d', label: '30 days', desc: 'Long-term sharing' },
  { id: 'never', label: 'Never', desc: 'Permanent link' },
];

/**
 * Modal for creating, viewing, and revoking a trip share link.
 *
 * Props:
 *   open:        boolean
 *   trip:        SavedTrip
 *   onClose:     () => void
 *   onUpdated:   (updatedTrip) => void   — called when share state changes
 */
function ShareModal({ open, trip, onClose, onUpdated }) {
  const [expiry, setExpiry] = useState('7d');
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [shareData, setShareData] = useState(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setCopied(false);
      // If trip already has share token, pre-populate
      if (trip?.share_token) {
        setShareData({
          share_token: trip.share_token,
          share_url: `/share/${trip.share_token}`,
          share_expires_at: trip.share_expires_at,
          share_created_at: trip.share_created_at,
        });
      } else {
        setShareData(null);
      }
    }
  }, [open, trip]);

  if (!open) return null;

  const fullShareUrl = shareData
    ? `${window.location.origin}${shareData.share_url}`
    : '';

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await createShareLink(trip.id, expiry);
      setShareData(data);
      // Notify parent so MyTrips can update local state
      onUpdated({
        ...trip,
        share_token: data.share_token,
        share_expires_at: data.share_expires_at,
        share_created_at: data.share_created_at,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoke this share link? It will stop working immediately.')) {
      return;
    }
    setRevoking(true);
    setError(null);
    try {
      const updated = await revokeShareLink(trip.id);
      setShareData(null);
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not copy. Please copy manually.');
    }
  };

  const formatExpiry = (iso) => {
    if (!iso) return 'Never expires';
    try {
      const date = new Date(iso);
      return `Expires ${date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return 'Expires ' + iso;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={loading || revoking ? undefined : onClose}
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
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">
                  Share Trip
                </h3>
                <p className="text-xs text-text-muted">
                  Anyone with the link can view (read-only)
                </p>
              </div>
            </div>
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
              <p className="text-xs text-danger flex-1">{error}</p>
            </div>
          )}

          {/* ───── No active share — show expiry picker ───── */}
          {!shareData && (
            <>
              <div className="mb-5">
                <label className="block text-xs font-semibold text-text-secondary mb-3">
                  Link expires after
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setExpiry(opt.id)}
                      className={`p-3 rounded-xl text-sm font-semibold text-left transition-all border ${
                        expiry === opt.id
                          ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40 shadow-soft'
                          : 'bg-white/85 text-text-secondary border-[#DDD3C5] hover:bg-[#FAF7F2]'
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-xs font-normal mt-1 opacity-60">
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 !py-2.5 text-sm"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                Generate Share Link
              </button>
            </>
          )}

          {/* ───── Active share — show link + revoke ───── */}
          {shareData && (
            <>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-text-secondary mb-2">
                  Share URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={fullShareUrl}
                    onClick={(e) => e.target.select()}
                    className="flex-1 px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-xs font-mono text-text-primary focus:outline-none focus:border-accent-primary/50"
                  />
                  <button
                    onClick={handleCopy}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 shrink-0 ${
                      copied
                        ? 'bg-success-soft text-success border-success/25'
                        : 'bg-accent-primary/10 text-accent-primary border-accent-primary/25 hover:bg-accent-primary/15'
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mb-5 p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-text-muted shrink-0" />
                <p className="text-xs text-text-secondary">
                  {formatExpiry(shareData.share_expires_at)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShareData(null)}
                  disabled={loading || revoking}
                  className="btn-secondary flex-1 !py-2.5 text-sm"
                >
                  New Link
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={loading || revoking}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold bg-danger-soft text-danger border border-danger/25 hover:bg-danger/15 transition-all"
                >
                  {revoking ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Revoke
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default ShareModal;