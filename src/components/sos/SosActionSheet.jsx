import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Share2, Phone, Copy, X,
  CheckCircle, AlertCircle, MapPin, Siren,
} from 'lucide-react';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
import { useGeofencingContext } from '../../context/GeofencingContext';
import {
  buildSosMessage,
  openSmsApp,
  shareViaWebShare,
  isWebShareSupported,
  dialNumber,
  copyToClipboard,
  formatCoordinates,
  buildLocationUrl,
} from '../../utils/sosTrigger';

/**
 * SOS Action Sheet — shown after SOS button activation.
 * Gives the user explicit control over what to do next.
 */
function SosActionSheet({ open, onClose, onDeactivate }) {
  const { contacts, primary } = useEmergencyContacts();
  const { currentLocation } = useGeofencingContext();
  const [feedback, setFeedback] = useState(null); // { type, message }
  const [busy, setBusy] = useState(null);

  if (!open) return null;

  const lat = currentLocation?.lat ?? null;
  const lon = currentLocation?.lon ?? null;
  const hasLocation = lat != null && lon != null;
  const hasContacts = contacts.length > 0;
  const message = buildSosMessage({ lat, lon });
  const locationUrl = buildLocationUrl(lat, lon);

  const showFeedback = (type, msg) => {
    setFeedback({ type, message: msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSendSms = () => {
    if (!hasContacts) {
      showFeedback('error', 'Add emergency contacts first.');
      return;
    }
    setBusy('sms');
    try {
      const numbers = contacts.map((c) => c.phone);
      openSmsApp(numbers, message);
      showFeedback('success', 'SMS app opened.');
    } catch (e) {
      showFeedback('error', e.message);
    } finally {
      setTimeout(() => setBusy(null), 500);
    }
  };

  const handleShare = async () => {
    setBusy('share');
    try {
      await shareViaWebShare({ lat, lon, body: message });
      showFeedback('success', 'Shared.');
    } catch (e) {
      if (e.name !== 'AbortError') {
        showFeedback('error', e.message);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleCall112 = () => {
    setBusy('call');
    try {
      dialNumber('112');
    } catch (e) {
      showFeedback('error', e.message);
    } finally {
      setTimeout(() => setBusy(null), 500);
    }
  };

  const handleCallPrimary = () => {
    if (!primary) return;
    setBusy('callprimary');
    try {
      dialNumber(primary.phone);
    } catch (e) {
      showFeedback('error', e.message);
    } finally {
      setTimeout(() => setBusy(null), 500);
    }
  };

  const handleCopy = async () => {
    setBusy('copy');
    const ok = await copyToClipboard(message);
    if (ok) {
      showFeedback('success', 'Message copied. Paste into any app.');
    } else {
      showFeedback('error', 'Copy failed. Try selecting the text manually.');
    }
    setBusy(null);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="glass-card shadow-strong border border-[#DDD3C5] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-5 border-b border-[#DDD3C5] bg-danger-soft/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-danger flex items-center justify-center shadow-soft">
                  <Siren className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary">
                    SOS Activated
                  </h3>
                  <p className="text-xs text-text-muted">
                    Choose how to alert your contacts
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/50 transition-colors"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {/* Location */}
            <div className="mt-4 p-3 rounded-xl bg-white/60 border border-[#DDD3C5] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent-primary shrink-0" />
              <div className="flex-1 min-w-0">
                {hasLocation ? (
                  <>
                    <p className="text-xs text-text-muted">Your location</p>
                    <p className="text-sm font-mono text-text-primary">
                      {formatCoordinates(lat, lon)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-warning">
                    Location unavailable. Enable Live Tracking on Dashboard.
                  </p>
                )}
              </div>
              {locationUrl && (
                <a
                  href={locationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent-primary font-semibold hover:underline shrink-0"
                >
                  View map
                </a>
              )}
            </div>
          </div>

          {/* Feedback */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={`mx-5 mt-4 p-3 rounded-xl border flex items-start gap-2 ${
                  feedback.type === 'success'
                    ? 'bg-success-soft border-success/25 text-success'
                    : 'bg-danger-soft border-danger/25 text-danger'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <p className="text-xs">{feedback.message}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="p-5 space-y-2.5">
            {/* SMS to all contacts */}
            <ActionRow
              icon={MessageSquare}
              title="Send SMS to all contacts"
              subtitle={
                hasContacts
                  ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} · opens your messaging app`
                  : 'No emergency contacts saved'
              }
              accent="primary"
              disabled={!hasContacts}
              loading={busy === 'sms'}
              onClick={handleSendSms}
            />

            {/* Call 112 */}
            <ActionRow
              icon={Phone}
              title="Call 112 — All Emergencies"
              subtitle="Police · Fire · Ambulance (India)"
              accent="danger"
              loading={busy === 'call'}
              onClick={handleCall112}
            />

            {/* Call primary contact */}
            {primary && (
              <ActionRow
                icon={Phone}
                title={`Call ${primary.name}`}
                subtitle={`Primary contact · ${primary.phone}`}
                accent="success"
                loading={busy === 'callprimary'}
                onClick={handleCallPrimary}
              />
            )}

            {/* Share */}
            {isWebShareSupported() && (
              <ActionRow
                icon={Share2}
                title="Share location"
                subtitle="WhatsApp, email, any installed app"
                accent="primary"
                loading={busy === 'share'}
                onClick={handleShare}
              />
            )}

            {/* Copy */}
            <ActionRow
              icon={Copy}
              title="Copy alert message"
              subtitle="Paste into any chat app"
              accent="muted"
              loading={busy === 'copy'}
              onClick={handleCopy}
            />
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-[#DDD3C5] bg-bg-elevated/40">
            <button
              onClick={() => {
                onDeactivate?.();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold bg-danger-soft text-danger border border-danger/25 hover:bg-danger/15 transition-all"
            >
              <X className="w-4 h-4" />
              Cancel SOS & Deactivate
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ---- Internal row component ---- */

function ActionRow({ icon: Icon, title, subtitle, accent, disabled, loading, onClick }) {
  const styles = {
    primary: 'bg-accent-primary/10 border-accent-primary/25 hover:bg-accent-primary/15 text-accent-primary',
    danger: 'bg-danger-soft border-danger/25 hover:bg-danger/15 text-danger',
    success: 'bg-success-soft border-success/25 hover:bg-success/15 text-success',
    muted: 'bg-bg-elevated/60 border-[#DDD3C5] hover:bg-bg-elevated text-text-secondary',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed ${styles[accent]}`}
    >
      <div className="w-10 h-10 rounded-xl bg-white/60 border border-current/20 flex items-center justify-center shrink-0">
        {loading ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xs opacity-70 mt-0.5 leading-snug">{subtitle}</p>
      </div>
    </button>
  );
}

export default SosActionSheet;