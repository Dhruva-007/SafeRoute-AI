import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Bell, Volume2, Smartphone, Shield, Battery, MapPin, 
  Trash2, AlertTriangle, Info, BarChart3
} from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import alertHistoryService from '../../services/alertHistory';
import { SEVERITY_LABELS, SEVERITY_COLORS } from '../../types/riskZone';

export default function PrivacySettingsModal({ isOpen, onClose }) {
  const { settings, updateSetting, clearAllData } = useSettings();
  const [showConfirmClearAlerts, setShowConfirmClearAlerts] = useState(false);
  const [showConfirmClearAll, setShowConfirmClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  
  const handleClearAlerts = async () => {
    try {
      await alertHistoryService.clearHistory();
      setShowConfirmClearAlerts(false);
      alert('Alert history cleared successfully');
    } catch (e) {
      alert('Failed to clear: ' + e.message);
    }
  };
  
  const handleClearAllData = async () => {
    setClearing(true);
    try {
      await clearAllData();
      alert('All data cleared. The app will reload.');
      window.location.reload();
    } catch (e) {
      alert('Failed to clear all data: ' + e.message);
      setClearing(false);
    }
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[101] flex items-start justify-center p-4 pt-16 overflow-y-auto"
            onClick={onClose}
          >
            <div 
              className="w-full max-w-2xl bg-bg-primary border border-border-subtle rounded-2xl shadow-2xl my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border-subtle sticky top-0 bg-bg-primary rounded-t-2xl z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Privacy & Safety</h2>
                    <p className="text-xs text-text-muted">Configure alerts, tracking, and data</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-text-muted" />
                </button>
              </div>
              
              {/* Content */}
              <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
                
                {/* ─── Notifications Section ─── */}
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
                
                {/* ─── Alert Sensitivity ─── */}
                <Section icon={<AlertTriangle className="w-4 h-4" />} title="Alert Sensitivity">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">Minimum Alert Severity</p>
                        <p className="text-xs text-text-muted">Only alert me for zones at or above this level</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map(level => (
                        <button
                          key={level}
                          onClick={() => updateSetting('min_severity_alert', level)}
                          className={`px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                            settings.min_severity_alert === level
                              ? 'text-white scale-105'
                              : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
                          }`}
                          style={{
                            background: settings.min_severity_alert === level 
                              ? SEVERITY_COLORS[level] 
                              : undefined,
                            borderWidth: 1,
                            borderColor: settings.min_severity_alert === level 
                              ? SEVERITY_COLORS[level] 
                              : 'transparent',
                          }}
                        >
                          {SEVERITY_LABELS[level]}+
                        </button>
                      ))}
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
                
                {/* ─── GPS & Battery ─── */}
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
                
                {/* ─── Location & Privacy ─── */}
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
                    Your GPS location <strong>never leaves your device</strong>. All geofencing 
                    happens locally for privacy.
                  </InfoBox>
                </Section>
                
                {/* ─── Display Preferences ─── */}
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
                
                {/* ─── Data Management ─── */}
                <Section icon={<Trash2 className="w-4 h-4 text-red-400" />} title="Data Management" danger>
                  <p className="text-xs text-text-muted mb-3">
                    These actions cannot be undone. Use with caution.
                  </p>
                  
                  {!showConfirmClearAlerts ? (
                    <button
                      onClick={() => setShowConfirmClearAlerts(true)}
                      className="w-full p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear Alert History
                    </button>
                  ) : (
                    <div className="p-3 bg-red-500/5 border border-red-500/30 rounded-lg">
                      <p className="text-xs text-red-300 mb-2">
                        Permanently delete all alert history?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearAlerts}
                          className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setShowConfirmClearAlerts(false)}
                          className="flex-1 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-text-primary text-xs font-medium rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {!showConfirmClearAll ? (
                    <button
                      onClick={() => setShowConfirmClearAll(true)}
                      className="w-full mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Clear ALL App Data
                    </button>
                  ) : (
                    <div className="mt-2 p-3 bg-red-500/10 border border-red-500/40 rounded-lg">
                      <p className="text-xs text-red-300 mb-2">
                        ⚠️ This will delete ALL data including settings, alerts, and cached maps. 
                        The app will reload after clearing.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearAllData}
                          disabled={clearing}
                          className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white text-xs font-medium rounded transition-colors"
                        >
                          {clearing ? 'Clearing...' : 'Yes, Delete Everything'}
                        </button>
                        <button
                          onClick={() => setShowConfirmClearAll(false)}
                          disabled={clearing}
                          className="flex-1 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-text-primary text-xs font-medium rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t border-border-subtle flex justify-end gap-2 sticky bottom-0 bg-bg-primary rounded-b-2xl">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
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

// ─── Helper Components ───

function Section({ icon, title, danger, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={danger ? 'text-red-400' : 'text-accent-primary'}>{icon}</span>
        <h3 className={`text-sm font-semibold ${danger ? 'text-red-400' : 'text-text-primary'}`}>
          {title}
        </h3>
      </div>
      <div className="space-y-3 pl-1">{children}</div>
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
          value ? 'bg-accent-primary' : 'bg-white/10'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
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
        <div className="text-sm font-semibold text-accent-primary ml-3">
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
        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent-primary"
      />
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
      <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
      <p className="text-xs text-text-secondary">{children}</p>
    </div>
  );
}