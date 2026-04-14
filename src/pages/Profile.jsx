import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  User, Mail, Calendar, Shield, Navigation, MapPin, 
  LogOut, Settings, Bell, Moon, Globe, Lock
} from 'lucide-react';

function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const stats = [
    { icon: Navigation, label: 'Trips Taken', value: '12' },
    { icon: MapPin, label: 'Countries', value: '8' },
    { icon: Shield, label: 'Safety Score', value: '96%' },
  ];

  const settingsItems = [
    { icon: Bell, label: 'Push Notifications', toggle: true, value: notifications, onChange: setNotifications },
    { icon: Moon, label: 'Dark Mode', toggle: true, value: darkMode, onChange: setDarkMode },
    { icon: Globe, label: 'Location Sharing', toggle: true, value: locationSharing, onChange: setLocationSharing },
    { icon: Lock, label: 'Privacy Settings', toggle: false },
    { icon: Settings, label: 'Account Settings', toggle: false },
  ];

  return (
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
            <div className="w-20 h-20 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shrink-0">
              <span className="text-3xl font-bold text-accent-primary">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-xl font-bold text-text-primary mb-1">{user?.name || 'Traveler'}</h2>
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-text-secondary mb-1">
                <Mail className="w-3.5 h-3.5" />
                {user?.email || 'user@example.com'}
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-text-muted">
                <Calendar className="w-3.5 h-3.5" />
                Member since {new Date(user?.joinedDate || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            </div>
            <button className="btn-secondary text-sm !px-4 !py-2">Edit</button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-border-subtle">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <stat.icon className="w-5 h-5 text-accent-primary mx-auto mb-2" />
                <p className="text-lg font-bold text-text-primary">{stat.value}</p>
                <p className="text-xs text-text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Settings */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass-card p-6 mb-6"
        >
          <h3 className="text-base font-semibold text-text-primary mb-4">Settings</h3>
          <div className="space-y-1">
            {settingsItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3.5 rounded-xl hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 text-text-muted" />
                  <span className="text-sm text-text-primary">{item.label}</span>
                </div>
                {item.toggle ? (
                  <button
                    onClick={() => item.onChange(!item.value)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      item.value ? 'bg-accent-primary' : 'bg-white/10'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      item.value ? 'left-[22px]' : 'left-0.5'
                    }`} />
                  </button>
                ) : (
                  <span className="text-text-muted text-sm">→</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Logout */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <button
            onClick={handleLogout}
            className="w-full p-4 rounded-card bg-red-500/5 border border-red-500/10 text-red-400 font-medium flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Log Out
          </button>
        </motion.div>
      </div>
    </div>
  );
}

export default Profile;