import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import {
  User, Mail, Calendar, Navigation, Bell,
  LogOut, Settings, ChevronRight, Shield,
} from 'lucide-react';
import AlertHistorySection from '../components/AlertHistorySection';
import PrivacySettingsModal from '../components/Settings/PrivacySettingsModal';
import AccountSettingsModal from '../components/Settings/AccountSettingsModal';
import { fetchTrips } from '../services/trips';
import alertHistoryService from '../services/alertHistory';

function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [tripCount, setTripCount] = useState(null);
  const [alertCount, setAlertCount] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const [trips, alerts] = await Promise.all([
          fetchTrips().catch(() => []),
          alertHistoryService.getAlertCount().catch(() => 0),
        ]);
        if (!cancelled) {
          setTripCount(trips.length);
          setAlertCount(alerts);
        }
      } catch {
        if (!cancelled) {
          setTripCount(0);
          setAlertCount(0);
        }
      }
    };

    loadStats();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const formatJoinDate = () => {
    if (!user?.created_at) return 'Recently';
    try {
      return new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  const stats = [
    {
      icon: Navigation,
      label: 'Trips Planned',
      value: tripCount === null ? '—' : String(tripCount),
      loading: tripCount === null,
    },
    {
      icon: Bell,
      label: 'Alerts Received',
      value: alertCount === null ? '—' : String(alertCount),
      loading: alertCount === null,
    },
  ];

  const settingsItems = [
    {
      icon: Shield,
      label: 'Privacy & Safety',
      description: 'Notifications, alerts, GPS, data',
      onClick: () => setShowPrivacyModal(true),
    },
    {
      icon: Settings,
      label: 'Account Settings',
      description: 'Profile, password, email preferences',
      onClick: () => setShowAccountModal(true),
    },
  ];

  return (
    <>
      <div className="section-padding !pt-8">
        <div className="container-max max-w-3xl">
          <PageHeader
            icon={User}
            title="Profile"
            subtitle="Manage your account and preferences."
          />

          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass-card p-6 sm:p-8 mb-6"
          >
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <div className="w-20 h-20 rounded-2xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center shrink-0">
                <span className="text-3xl font-bold text-accent-primary">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>

              <div className="text-center sm:text-left flex-1 min-w-0">
                <h2 className="text-xl font-bold text-text-primary mb-1 truncate">
                  {user?.name || 'Traveler'}
                </h2>
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-text-secondary mb-1">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{user?.email || ''}</span>
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-text-muted">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  Member since {formatJoinDate()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-[#DDD3C5]">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <stat.icon className="w-5 h-5 text-accent-primary mx-auto mb-2" />
                  {stat.loading ? (
                    <div className="w-10 h-5 bg-[#EDE5DA] rounded animate-pulse mx-auto mb-1" />
                  ) : (
                    <p className="text-lg font-bold text-text-primary">{stat.value}</p>
                  )}
                  <p className="text-xs text-text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6"
          >
            <AlertHistorySection />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card p-6 mb-6"
          >
            <h3 className="text-base font-semibold text-text-primary mb-4">Settings</h3>
            <div className="space-y-2">
              {settingsItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-accent-primary/5 transition-colors group text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#DDD3C5] flex items-center justify-center shrink-0 group-hover:bg-accent-primary/10 transition-colors">
                    <item.icon className="w-5 h-5 text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{item.label}</p>
                    <p className="text-xs text-text-muted">{item.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <button
              onClick={handleLogout}
              className="w-full p-4 rounded-card bg-red-500/10 border border-red-500/20 text-red-600 font-medium flex items-center justify-center gap-2 hover:bg-red-500/15 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Log Out
            </button>
          </motion.div>
        </div>
      </div>

      <PrivacySettingsModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
      <AccountSettingsModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />
    </>
  );
}

export default Profile;