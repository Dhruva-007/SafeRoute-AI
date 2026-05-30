import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, User, Mail, Lock, Download, Trash2, Settings as SettingsIcon,
  Save, AlertTriangle, FileJson
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../hooks/useSettings';
import alertHistoryService from '../../services/alertHistory';
import settingsService from '../../services/settings';

export default function AccountSettingsModal({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const { settings, updateSetting } = useSettings();
  
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const handleSaveProfile = () => {
    // In production, this would call an API
    alert('Profile updated successfully');
  };
  
  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }
    // In production, this would call an API
    alert('Password changed successfully');
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowChangePassword(false);
  };
  
  const handleExportData = async () => {
    setExporting(true);
    try {
      const alerts = await alertHistoryService.getAllAlerts();
      const settingsData = settingsService.getAll();
      
      const exportData = {
        export_date: new Date().toISOString(),
        user: {
          name: user?.name,
          email: user?.email,
        },
        settings: settingsData,
        alert_history: alerts,
        total_alerts: alerts.length,
      };
      
      const blob = new Blob(
        [JSON.stringify(exportData, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `saferoute-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('Data exported successfully');
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };
  
  const handleDeleteAccount = () => {
    // In production, would call API to delete account
    alert('Account deletion feature would be implemented in production. For demo, logging out instead.');
    logout();
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />
          
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
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                    <SettingsIcon className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Account Settings</h2>
                    <p className="text-xs text-text-muted">Manage your account information</p>
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
                
                {/* ─── Profile Information ─── */}
                <Section icon={<User className="w-4 h-4" />} title="Profile Information">
                  <div className="space-y-3">
                    <InputField
                      label="Display Name"
                      value={name}
                      onChange={setName}
                      placeholder="Your name"
                      icon={<User className="w-4 h-4" />}
                    />
                    <InputField
                      label="Email Address"
                      value={email}
                      onChange={setEmail}
                      placeholder="you@example.com"
                      type="email"
                      icon={<Mail className="w-4 h-4" />}
                    />
                  </div>
                  
                  <button
                    onClick={handleSaveProfile}
                    className="w-full mt-3 px-4 py-2 bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                </Section>
                
                {/* ─── Security ─── */}
                <Section icon={<Lock className="w-4 h-4" />} title="Security">
                  {!showChangePassword ? (
                    <button
                      onClick={() => setShowChangePassword(true)}
                      className="w-full p-3 rounded-lg bg-white/[0.02] border border-border-subtle text-text-primary text-sm font-medium hover:bg-white/[0.05] transition-colors flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      Change Password
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <InputField
                        label="Current Password"
                        type="password"
                        value={oldPassword}
                        onChange={setOldPassword}
                        placeholder="••••••••"
                        icon={<Lock className="w-4 h-4" />}
                      />
                      <InputField
                        label="New Password"
                        type="password"
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder="At least 8 characters"
                        icon={<Lock className="w-4 h-4" />}
                      />
                      <InputField
                        label="Confirm New Password"
                        type="password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Repeat new password"
                        icon={<Lock className="w-4 h-4" />}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleChangePassword}
                          className="flex-1 px-4 py-2 bg-accent-primary hover:bg-accent-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Update Password
                        </button>
                        <button
                          onClick={() => {
                            setShowChangePassword(false);
                            setOldPassword('');
                            setNewPassword('');
                            setConfirmPassword('');
                          }}
                          className="flex-1 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-text-primary text-sm font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
                
                {/* ─── Email Preferences ─── */}
                <Section icon={<Mail className="w-4 h-4" />} title="Email Preferences">
                  <ToggleRow
                    label="Email Alerts"
                    description="Receive critical alerts via email"
                    value={settings.email_alerts}
                    onChange={(v) => updateSetting('email_alerts', v)}
                  />
                  <ToggleRow
                    label="Weekly Safety Digest"
                    description="Summary of your week's safety stats every Sunday"
                    value={settings.email_weekly_digest}
                    onChange={(v) => updateSetting('email_weekly_digest', v)}
                  />
                  <ToggleRow
                    label="Safety Tips & Updates"
                    description="Occasional tips on travel safety"
                    value={settings.email_safety_tips}
                    onChange={(v) => updateSetting('email_safety_tips', v)}
                  />
                </Section>
                
                {/* ─── Data Export ─── */}
                <Section icon={<Download className="w-4 h-4" />} title="Your Data">
                  <p className="text-xs text-text-muted mb-3">
                    Download all your SafeRoute data including alerts, settings, and profile.
                  </p>
                  <button
                    onClick={handleExportData}
                    disabled={exporting}
                    className="w-full p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium hover:bg-blue-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-4 h-4" />
                    {exporting ? 'Exporting...' : 'Export My Data (JSON)'}
                  </button>
                </Section>
                
                {/* ─── Danger Zone ─── */}
                <Section icon={<AlertTriangle className="w-4 h-4 text-red-400" />} title="Danger Zone" danger>
                  <p className="text-xs text-text-muted mb-3">
                    Permanently delete your account and all associated data.
                  </p>
                  
                  {!showDeleteAccount ? (
                    <button
                      onClick={() => setShowDeleteAccount(true)}
                      className="w-full p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete My Account
                    </button>
                  ) : (
                    <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-lg">
                      <p className="text-xs text-red-300 mb-3">
                        ⚠️ This will permanently delete your account, all alert history, 
                        settings, and saved data. This action cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteAccount}
                          className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors"
                        >
                          Yes, Delete Account
                        </button>
                        <button
                          onClick={() => setShowDeleteAccount(false)}
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

// Helper Components

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

function InputField({ label, value, onChange, placeholder, type = 'text', icon }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${icon ? 'pl-10' : 'pl-3'} pr-3 py-2 bg-white/[0.04] border border-border-subtle rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/40 transition-all`}
        />
      </div>
    </div>
  );
}