import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bell, Shield, Battery, MapPin,
  Trash2, AlertTriangle, Info, BarChart3,
} from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import alertHistoryService from '../../services/alertHistory';
import { SEVERITY_LABELS, SEVERITY_COLORS } from '../../types/riskZone';

export default function PrivacySettingsModal({ isOpen, onClose }) {
  const { settings, updateSetting, clearAllData } = useSettings();
  const [showConfirmClearAlerts, setShowConfirmClearAlerts] = useState(false);
  const [showConfirmClearAll, setShowConfirmClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleClearAlerts = async () => {
    try {
      await alertHistoryService.clearHistory();
      setShowConfirmClearAlerts(false);
      showFeedback('success', 'Alert history cleared.');
    } catch (e) {
      showFeedback('error', 'Failed to clear: ' + e.message);
    }
  };

  const handleClearAllData = async () => {
    setClearing(true);
    try {
      await clearAllData();
      window.location.reload();
    } catch (e) {
      showFeedback('error', 'Failed to clear: ' + e.message);
      setClearing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-accent-charcoal/40 backdrop-blur-sm z-[100]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[101] flex items-start justify-center px-4 pt-20 pb-8 sm:pt-24 sm:pb-12 overflow-y-auto"
            onClick={onClose}
          >
            <div
              className="w-full max-w-2xl flex flex-col bg-bg-elevated border border-[#DDD3C5] rounded-card shadow-strong my-auto"
              style={{ maxHeight: 'calc(100vh - 7rem)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-[#DDD3C5] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-accent-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Privacy & Safety</h2>
                    <p className="text-xs text-text-muted">Configure alerts, tracking, and data</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-bg-secondary transition-colors"
                >
                  <X className="w-5 h-5 text-text-muted" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">

                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-xl border text-sm font-medium ${
                      feedback.type === 'success'
                        ? 'bg-success-soft border-success/25 text-success'
                        : 'bg-danger-soft border-danger/25 text-danger'
                    }`}
                  >
                    {feedback.text}
                  </motion.div>
                )}

                {/* Notifications */}
                <Section icon={<Bell className="w-4 h-4" />} title="Notifications">
                  <ToggleRow
                    label="Push Notifications"
                    description="Receive alerts when entering risk zones"
                    value={settings.notifications_enabled}
                    onChange={(v) => updateSetting('notifications_enabled', v)}
                  />
                  <ToggleRow
                    label="Notification Sound"
                    description="Play sound on alerts"
                    value={settings.notification_sound}
                    onChange={(v) => updateSetting('notification_sound', v)}
                    disabled={!settings.notifications_enabled}
                  />
                  <ToggleRow
                    label="Vibration"
                    description="Vibrate on critical alerts (mobile)"
                    value={settings.notification_vibration}
                    onChange={(v) => updateSetting('notification_vibration', v)}
                    disabled={!settings.notifications_enabled}
                  />
                </Section>

                {/* Alert sensitivity */}
                <Section icon={<AlertTriangle className="w-4 h-4" />} title="Alert Sensitivity">
                  <div>
                    <div className="mb-2">
                      <p className="text-sm font-medium text-text-primary">Minimum Alert Severity</p>
                      <p className="text-xs text-text-muted">Only alert me for zones at or above this level</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((level) => {
                        const active = settings.min_severity_alert === level;
                        return (
                          <button
                            key={level}
                            onClick={() => updateSetting('min_severity_alert', level)}
                            className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all border ${
                              active
                                ? 'text-white scale-[1.02] border-transparent shadow-soft'
                                : 'bg-white text-text-secondary border-[#DDD3C5] hover:border-accent-primary/40'
                            }`}
                            style={{
                              background: active ? SEVERITY_COLORS[level] : undefined,
                            }}
                          >
                            {SEVERITY_LABELS[level]}+
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <SliderRow
                    label="Alert Cooldown"
                    description="Minimum time between repeat alerts for same zone"
                    value={settings.alert_cooldown_minutes}
                    onChange={(v) => updateSetting('alert_cooldown_minutes', parseInt(v))}
                    min={1}
                    max={30}
                    step={1}
                    unit="minutes"
                  />

                  <SliderRow
                    label="Confirmation Sensitivity"
                    description="Number of GPS fixes required before triggering"
                    value={settings.confirmation_threshold}
                    onChange={(v) => updateSetting('confirmation_threshold', parseInt(v))}
                    min={1}
                    max={10}
                    step={1}
                    unit="fixes"
                  />
                </Section>

                {/* GPS & Battery */}
                <Section icon={<Battery className="w-4 h-4" />} title="GPS & Battery">
                  <ToggleRow
                    label="Battery Optimization"
                    description="Reduce GPS polling rate to save battery (less accurate)"
                    value={settings.battery_optimization}
                    onChange={(v) => updateSetting('battery_optimization', v)}
                  />
                  <ToggleRow
                    label="High Accuracy GPS"
                    description="Use the most accurate location available"
                    value={settings.high_accuracy_gps}
                    onChange={(v) => updateSetting('high_accuracy_gps', v)}
                    disabled={settings.battery_optimization}
                  />
                  <SliderRow
                    label="GPS Update Interval"
                    description="How often to check your location"
                    value={settings.gps_interval_seconds}
                    onChange={(v) => updateSetting('gps_interval_seconds', parseInt(v))}
                    min={5}
                    max={60}
                    step={5}
                    unit="seconds"
                    disabled={settings.battery_optimization}
                  />
                </Section>

                {/* Location & privacy */}
                <Section icon={<MapPin className="w-4 h-4" />} title="Location & Privacy">
                  <ToggleRow
                    label="Location Sharing"
                    description="Allow the app to access your GPS location"
                    value={settings.location_sharing}
                    onChange={(v) => updateSetting('location_sharing', v)}
                  />
                  <ToggleRow
                    label="Share Anonymous Analytics"
                    description="Help improve the app by sharing usage data (no location)"
                    value={settings.share_anonymous_analytics}
                    onChange={(v) => updateSetting('share_anonymous_analytics', v)}
                  />
                  <InfoBox>
                    Your GPS location <strong>never leaves your device</strong>. All
                    geofencing happens locally for privacy.
                  </InfoBox>
                </Section>

                {/* Display */}
                <Section icon={<BarChart3 className="w-4 h-4" />} title="Display Preferences">
                  <ToggleRow
                    label="Show Low Severity Zones"
                    description="Display green-colored low-risk zones on map"
                    value={settings.show_low_severity}
                    onChange={(v) => updateSetting('show_low_severity', v)}
                  />
                  <ToggleRow
                    label="Show Emergency Services"
                    description="Display hospitals, police, fire stations on map"
                    value={settings.show_emergency_services}
                    onChange={(v) => updateSetting('show_emergency_services', v)}
                  />
                </Section>

                {/* Danger */}
                <Section icon={<Trash2 className="w-4 h-4" />} title="Data Management" danger>
                  <p className="text-xs text-text-muted mb-3">
                    These actions cannot be undone. Use with caution.
                  </p>

                  {!showConfirmClearAlerts ? (
                    <button
                      onClick={() => setShowConfirmClearAlerts(true)}
                      className="w-full p-3 rounded-xl bg-danger-soft border border-danger/20 text-danger text-sm font-medium hover:bg-danger/10 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear Alert History
                    </button>
                  ) : (
                    <div className="p-3 bg-danger-soft border border-danger/30 rounded-xl">
                      <p className="text-xs text-danger mb-2">
                        Permanently delete all alert history?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearAlerts}
                          className="flex-1 px-3 py-2 bg-danger hover:bg-danger/90 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setShowConfirmClearAlerts(false)}
                          className="flex-1 px-3 py-2 bg-white hover:bg-bg-secondary border border-[#DDD3C5] text-text-primary text-xs font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {!showConfirmClearAll ? (
                    <button
                      onClick={() => setShowConfirmClearAll(true)}
                      className="w-full mt-2 p-3 rounded-xl bg-danger-soft border border-danger/30 text-danger text-sm font-medium hover:bg-danger/15 transition-colors flex items-center justify-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Clear ALL App Data
                    </button>
                  ) : (
                    <div className="mt-2 p-3 bg-danger-soft border border-danger/40 rounded-xl">
                      <p className="text-xs text-danger mb-2">
                        ⚠️ This will delete ALL data including settings, alerts, and
                        cached maps. The app will reload after clearing.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearAllData}
                          disabled={clearing}
                          className="flex-1 px-3 py-2 bg-danger hover:bg-danger/90 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          {clearing ? 'Clearing...' : 'Yes, Delete Everything'}
                        </button>
                        <button
                          onClick={() => setShowConfirmClearAll(false)}
                          disabled={clearing}
                          className="flex-1 px-3 py-2 bg-white hover:bg-bg-secondary border border-[#DDD3C5] text-text-primary text-xs font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-[#DDD3C5] flex justify-end gap-2 shrink-0">
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-accent-primary hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Helpers ──────────────────────────────────────────

function Section({ icon, title, danger, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={danger ? 'text-danger' : 'text-accent-primary'}>{icon}</span>
        <h3 className={`text-sm font-semibold ${danger ? 'text-danger' : 'text-text-primary'}`}>
          {title}
        </h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange, disabled }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
          value ? 'bg-accent-primary' : 'bg-[#DDD3C5]'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          value ? 'left-[22px]' : 'left-0.5'
        }`} />
      </button>
    </div>
  );
}

function SliderRow({ label, description, value, onChange, min, max, step, unit, disabled }) {
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {description && (
            <p className="text-xs text-text-muted mt-0.5">{description}</p>
          )}
        </div>
        <div className="text-sm font-semibold text-accent-primary ml-3 whitespace-nowrap">
          {value} {unit}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="saferoute-slider w-full"
      />
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-info-soft border border-info/20">
      <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
      <p className="text-xs text-text-secondary leading-relaxed">{children}</p>
    </div>
  );
}