import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import FatigueIndicator from '../components/FatigueIndicator';
import { 
  LayoutDashboard, Navigation, Map, Clock, 
  TrendingUp, MapPin, AlertTriangle, ChevronRight,
  Compass, Calendar, Zap, Activity, Thermometer,
  Mountain, Users, Route
} from 'lucide-react';

function Dashboard() {
  const { user } = useAuth();
  const [fatigueLevel, setFatigueLevel] = useState('LOW');
  const [fatigueValue, setFatigueValue] = useState(25);
  const [metrics, setMetrics] = useState({
    distance: 4.2,
    elevation: 120,
    temperature: 24,
    activityLevel: 'Moderate',
    groupSize: 3
  });

  // Simulate real-time fatigue updates
  useEffect(() => {
    const interval = setInterval(() => {
      const rand = Math.random();
      let newLevel, newValue;
      
      if (rand < 0.4) {
        newLevel = 'LOW';
        newValue = Math.floor(Math.random() * 30) + 10;
      } else if (rand < 0.75) {
        newLevel = 'MEDIUM';
        newValue = Math.floor(Math.random() * 25) + 35;
      } else {
        newLevel = 'HIGH';
        newValue = Math.floor(Math.random() * 25) + 70;
      }

      setFatigueLevel(newLevel);
      setFatigueValue(newValue);

      setMetrics({
        distance: +(Math.random() * 10 + 1).toFixed(1),
        elevation: Math.floor(Math.random() * 500 + 50),
        temperature: Math.floor(Math.random() * 20 + 15),
        activityLevel: ['Light', 'Moderate', 'Intense'][Math.floor(Math.random() * 3)],
        groupSize: Math.floor(Math.random() * 6) + 1
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const recentTrips = [
    { id: 1, name: 'Tokyo Adventure', date: 'Dec 15-22, 2024', status: 'Completed', duration: '7 days', distance: '45 km' },
    { id: 2, name: 'Paris Getaway', date: 'Jan 5-12, 2025', status: 'Upcoming', duration: '7 days', distance: '32 km' },
    { id: 3, name: 'Bali Retreat', date: 'Feb 1-8, 2025', status: 'Planning', duration: '7 days', distance: '28 km' },
  ];

  const quickActions = [
    { to: '/plan-tour', label: 'Plan New Trip', icon: Compass, color: 'text-accent-primary' },
    { to: '/safety-map', label: 'View Safety Map', icon: Map, color: 'text-green-400' },
    { to: '/sos', label: 'SOS Center', icon: AlertTriangle, color: 'text-red-400' },
    { to: '/translator', label: 'Translator', icon: Zap, color: 'text-blue-400' },
  ];

  const fatigueColors = {
    LOW: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20', bar: 'bg-green-500' },
    MEDIUM: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', bar: 'bg-amber-500' },
    HIGH: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', bar: 'bg-red-500' },
  };

  const currentFatigueStyle = fatigueColors[fatigueLevel];

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={LayoutDashboard}
          title={`Welcome back, ${user?.name || 'Traveler'}`}
          subtitle="Here's an overview of your travel activity and fatigue status."
        />

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Navigation} label="Total Trips" value="12" trend={15} delay={0.1} />
          
          {/* Fatigue Level Card - replaces Safety Score */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card p-5 sm:p-6 relative overflow-hidden"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${currentFatigueStyle.bg} flex items-center justify-center`}>
                <Activity className={`w-5 h-5 ${currentFatigueStyle.text}`} />
              </div>
              <div className={`relative w-2.5 h-2.5 rounded-full ${currentFatigueStyle.bar}`}>
                <div className={`absolute inset-0 rounded-full ${currentFatigueStyle.bar} animate-ping opacity-75`} />
              </div>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={fatigueLevel}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className={`text-2xl font-bold ${currentFatigueStyle.text} mb-1`}
              >
                {fatigueLevel}
              </motion.p>
            </AnimatePresence>
            <p className="text-sm text-text-secondary">Fatigue Level</p>
            {/* Progress bar */}
            <div className="mt-3 w-full h-1.5 rounded-full bg-white/10">
              <motion.div
                className={`h-full rounded-full ${currentFatigueStyle.bar}/70`}
                initial={{ width: 0 }}
                animate={{ width: `${fatigueValue}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </motion.div>

          <StatCard icon={MapPin} label="Countries" value="8" trend={25} delay={0.3} />
          <StatCard icon={Clock} label="Travel Hours" value="240" trend={10} delay={0.4} />
        </div>

        {/* Fatigue Metrics Strip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="glass-card p-4 mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            <Thermometer className="w-4 h-4 text-accent-primary" />
            <span className="text-sm font-medium text-text-primary">Live Travel Metrics</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: Route, label: 'Distance', value: `${metrics.distance} km` },
              { icon: Mountain, label: 'Elevation', value: `${metrics.elevation} m` },
              { icon: Thermometer, label: 'Temp', value: `${metrics.temperature}°C` },
              { icon: Activity, label: 'Activity', value: metrics.activityLevel },
              { icon: Users, label: 'Group', value: `${metrics.groupSize} pax` },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02]">
                <item.icon className="w-4 h-4 text-text-muted shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-text-muted">{item.label}</p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={item.value}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="text-sm font-semibold text-text-primary truncate"
                    >
                      {item.value}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Trips */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:col-span-2 glass-card p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-text-primary">Recent Trips</h2>
              <Link to="/my-trips" className="text-sm text-accent-primary hover:text-accent-soft transition-colors flex items-center gap-1">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {recentTrips.map((trip) => (
                <div key={trip.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-accent-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{trip.name}</p>
                    <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" /> {trip.date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      trip.status === 'Completed' ? 'bg-green-500/10 text-green-400' :
                      trip.status === 'Upcoming' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {trip.status}
                    </span>
                    <p className="text-xs text-text-muted mt-1.5">{trip.duration} • {trip.distance}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="glass-card p-6"
          >
            <h2 className="text-lg font-semibold text-text-primary mb-5">Quick Actions</h2>
            <div className="space-y-3">
              {quickActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] transition-all duration-250 group"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <action.icon className={`w-4.5 h-4.5 ${action.color}`} />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{action.label}</span>
                  <ChevronRight className="w-4 h-4 text-text-muted ml-auto group-hover:translate-x-0.5 transition-transform" />
                </Link>
              ))}
            </div>

            {/* Fatigue Alert */}
            <div className={`mt-6 p-4 rounded-xl ${currentFatigueStyle.bg} border ${currentFatigueStyle.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <Activity className={`w-4 h-4 ${currentFatigueStyle.text}`} />
                <span className={`text-sm font-medium ${currentFatigueStyle.text}`}>
                  Fatigue: {fatigueLevel}
                </span>
              </div>
              <p className="text-xs text-text-secondary">
                {fatigueLevel === 'LOW' && "You're good to continue your journey."}
                {fatigueLevel === 'MEDIUM' && 'Consider taking a short break soon.'}
                {fatigueLevel === 'HIGH' && 'High fatigue detected. Rest is strongly recommended.'}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;