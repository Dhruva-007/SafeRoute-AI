import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, User, Mail, Lock, Download, Trash2, Settings as SettingsIcon,
  Save, AlertTriangle, FileJson, CheckCircle, Eye, EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../hooks/useSettings';
import alertHistoryService from '../../services/alertHistory';
import settingsService from '../../services/settings';
import {
  updateProfile, changePassword, deleteAccount, saveSession, getStoredToken,
} from '../../services/auth';

export default function AccountSettingsModal({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const { settings, updateSetting } = useSettings();
  const navigate = useNavigate();

  // ── Profile state ──────────────────────────────────────────
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(null);

  // ── Password state ─────────────────────────────────────────
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState(null);

  // ── Delete state ───────────────────────────────────────────
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // ── Export state ───────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  // Sync name when user loads / modal opens
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user, isOpen]);

  // Reset feedback on close
  useEffect(() => {
    if (!isOpen) {
      setProfileFeedback(null);
      setPasswordFeedback(null);
      setDeleteError(null);
      setShowChangePassword(false);
      setShowDeleteAccount(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen]);

  // ── Handlers ───────────────────────────────────────────────

  const handleSaveProfile = async () => {
    setProfileFeedback(null);

    if (!name.trim()) {
      setProfileFeedback({ type: 'error', text: 'Name cannot be empty.' });
      return;
    }
    if (name.trim() === user?.name) {
      setProfileFeedback({ type: 'info', text: 'No changes to save.' });
      return;
    }

    setSavingProfile(true);
    try {
      const updatedUser = await updateProfile(name.trim());
      // Sync updated user back into AuthContext via localStorage
      const token = getStoredToken();
      if (token) saveSession(updatedUser, token);

      setProfileFeedback({ type: 'success', text: 'Profile updated successfully.' });
      // Force a reload so AuthContext picks up the new name everywhere
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      setProfileFeedback({ type: 'error', text: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordFeedback(null);

    if (!oldPassword) {
      setPasswordFeedback({ type: 'error', text: 'Enter your current password.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordFeedback({
        type: 'error',
        text: 'New password must include an uppercase letter and a number.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordFeedback({ type: 'success', text: 'Password updated successfully.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordFeedback(null);
      }, 1500);
    } catch (err) {
      setPasswordFeedback({ type: 'error', text: err.message });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const alerts = await alertHistoryService.getAllAlerts();
      const settingsData = settingsService.getAll();

      const exportData = {
        export_date: new Date().toISOString(),
        user: { name: user?.name, email: user?.email },
        settings: settingsData,
        alert_history: alerts,
        total_alerts: alerts.length,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `saferoute-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      // Clear local data
      await settingsService.clearAllData().catch(() => {});
      logout();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
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
              {/* Header — sticky */}
              <div className="flex items-center justify-between p-5 border-b border-[#DDD3C5] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
                    <SettingsIcon className="w-5 h-5 text-accent-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-text-primary">Account Settings</h2>
                    <p className="text-xs text-text-muted">Manage your profile and security</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-bg-secondary transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-text-muted" />
                </button>
              </div>

              {/* Content — scrollable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* Profile */}
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
                      value={user?.email || ''}
                      onChange={() => {}}
                      placeholder=""
                      type="email"
                      icon={<Mail className="w-4 h-4" />}
                      readOnly
                      helper="Email cannot be changed at this time."
                    />
                  </div>

                  {profileFeedback && (
                    <FeedbackBox feedback={profileFeedback} />
                  )}

                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="w-full mt-3 px-4 py-2.5 bg-accent-primary hover:bg-accent-hover disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 shadow-soft"
                  >
                    {savingProfile ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </Section>

                {/* Security */}
                <Section icon={<Lock className="w-4 h-4" />} title="Security">
                  {!showChangePassword ? (
                    <button
                      onClick={() => setShowChangePassword(true)}
                      className="w-full p-3 rounded-xl bg-white border border-[#DDD3C5] text-text-primary text-sm font-medium hover:border-accent-primary/40 hover:bg-accent-primary/5 transition-colors flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      Change Password
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <InputField
                        label="Current Password"
                        type={showOld ? 'text' : 'password'}
                        value={oldPassword}
                        onChange={setOldPassword}
                        placeholder="••••••••"
                        icon={<Lock className="w-4 h-4" />}
                        toggleVisibility={() => setShowOld(!showOld)}
                        isVisible={showOld}
                      />
                      <InputField
                        label="New Password"
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder="At least 8 chars, 1 upper, 1 number"
                        icon={<Lock className="w-4 h-4" />}
                        toggleVisibility={() => setShowNew(!showNew)}
                        isVisible={showNew}
                      />
                      <InputField
                        label="Confirm New Password"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Repeat new password"
                        icon={<Lock className="w-4 h-4" />}
                        toggleVisibility={() => setShowConfirm(!showConfirm)}
                        isVisible={showConfirm}
                      />

                      {passwordFeedback && (
                        <FeedbackBox feedback={passwordFeedback} />
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={handleChangePassword}
                          disabled={savingPassword}
                          className="flex-1 px-4 py-2.5 bg-accent-primary hover:bg-accent-hover disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          {savingPassword ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Updating...
                            </>
                          ) : (
                            'Update Password'
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setShowChangePassword(false);
                            setOldPassword('');
                            setNewPassword('');
                            setConfirmPassword('');
                            setPasswordFeedback(null);
                          }}
                          disabled={savingPassword}
                          className="flex-1 px-4 py-2.5 bg-white hover:bg-bg-secondary border border-[#DDD3C5] text-text-primary text-sm font-medium rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </Section>

                {/* Email preferences */}
                <Section icon={<Mail className="w-4 h-4" />} title="Email Preferences">
                  <ToggleRow
                    label="Email Alerts"
                    description="Receive critical alerts via email"
                    value={settings.email_alerts}
                    onChange={(v) => updateSetting('email_alerts', v)}
                  />
                  <ToggleRow
                    label="Weekly Safety Digest"
                    description="Summary every Sunday"
                    value={settings.email_weekly_digest}
                    onChange={(v) => updateSetting('email_weekly_digest', v)}
                  />
                  <ToggleRow
                    label="Safety Tips & Updates"
                    description="Occasional travel safety tips"
                    value={settings.email_safety_tips}
                    onChange={(v) => updateSetting('email_safety_tips', v)}
                  />
                </Section>

                {/* Export */}
                <Section icon={<Download className="w-4 h-4" />} title="Your Data">
                  <p className="text-xs text-text-muted mb-3">
                    Download all your SafeRoute data including alerts, settings, and profile.
                  </p>
                  <button
                    onClick={handleExportData}
                    disabled={exporting}
                    className="w-full p-3 rounded-xl bg-info-soft border border-info/25 text-info text-sm font-medium hover:bg-info/15 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-4 h-4" />
                    {exporting ? 'Exporting...' : 'Export My Data (JSON)'}
                  </button>
                </Section>

                {/* Danger zone */}
                <Section icon={<AlertTriangle className="w-4 h-4" />} title="Danger Zone" danger>
                  <p className="text-xs text-text-muted mb-3">
                    Permanently delete your account and all associated data.
                  </p>

                  {!showDeleteAccount ? (
                    <button
                      onClick={() => setShowDeleteAccount(true)}
                      className="w-full p-3 rounded-xl bg-danger-soft border border-danger/25 text-danger text-sm font-medium hover:bg-danger/15 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete My Account
                    </button>
                  ) : (
                    <div className="p-4 bg-danger-soft border border-danger/30 rounded-xl">
                      <p className="text-xs text-danger mb-3 leading-relaxed">
                        ⚠️ This will permanently delete your account, all trips,
                        and all data. <strong>This action cannot be undone.</strong>
                      </p>
                      {deleteError && (
                        <p className="text-xs text-danger mb-3 font-medium">
                          {deleteError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={deleting}
                          className="flex-1 px-3 py-2 bg-danger hover:bg-danger/90 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                          {deleting ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            'Yes, Delete Forever'
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteAccount(false);
                            setDeleteError(null);
                          }}
                          disabled={deleting}
                          className="flex-1 px-3 py-2 bg-white hover:bg-bg-secondary border border-[#DDD3C5] text-text-primary text-xs font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              </div>

              {/* Footer — sticky */}
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

function InputField({
  label, value, onChange, placeholder, type = 'text', icon,
  readOnly = false, helper, toggleVisibility, isVisible,
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">
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
          readOnly={readOnly}
          className={`w-full ${icon ? 'pl-10' : 'pl-3'} ${toggleVisibility ? 'pr-10' : 'pr-3'} py-2.5 bg-white border border-[#DDD3C5] rounded-xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all ${
            readOnly ? 'bg-bg-secondary cursor-not-allowed opacity-75' : ''
          }`}
        />
        {toggleVisibility && (
          <button
            type="button"
            onClick={toggleVisibility}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            tabIndex={-1}
          >
            {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {helper && (
        <p className="text-xs text-text-muted mt-1">{helper}</p>
      )}
    </div>
  );
}

function FeedbackBox({ feedback }) {
  const styles = {
    success: 'bg-success-soft border-success/25 text-success',
    error: 'bg-danger-soft border-danger/25 text-danger',
    info: 'bg-info-soft border-info/25 text-info',
  };
  const Icon = feedback.type === 'success' ? CheckCircle : AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-medium ${styles[feedback.type]}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{feedback.text}</span>
    </motion.div>
  );
}