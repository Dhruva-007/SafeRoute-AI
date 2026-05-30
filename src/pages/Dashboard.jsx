import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import FatigueIndicator from '../components/FatigueIndicator';
import {
  LayoutDashboard,
  Navigation,
  Map,
  Clock,
  TrendingUp,
  MapPin,
  AlertTriangle,
  ChevronRight,
  Compass,
  Calendar,
  Zap,
  Activity,
  Thermometer,
  Mountain,
  Users,
  Route,
} from 'lucide-react';

import CurrentZoneAlert from '../components/Dashboard/CurrentZoneAlert';
import CompactSafetyWidgets from '../components/Dashboard/CompactSafetyWidgets';

function Dashboard() {
  const { user } = useAuth();

  const [fatigueLevel, setFatigueLevel] = useState('LOW');
  const [fatigueValue, setFatigueValue] = useState(25);

  const [metrics, setMetrics] = useState({
    distance: 4.2,
    elevation: 120,
    temperature: 24,
    activityLevel: 'Moderate',
    groupSize: 3,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const rand = Math.random();
      let newLevel;
      let newValue;

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
        activityLevel:
          ['Light', 'Moderate', 'Intense'][
            Math.floor(Math.random() * 3)
          ],
        groupSize: Math.floor(Math.random() * 6) + 1,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const recentTrips = [
    {
      id: 1,
      name: 'Tokyo Adventure',
      date: 'Dec 15-22, 2024',
      status: 'Completed',
      duration: '7 days',
      distance: '45 km',
    },
    {
      id: 2,
      name: 'Paris Getaway',
      date: 'Jan 5-12, 2025',
      status: 'Upcoming',
      duration: '7 days',
      distance: '32 km',
    },
    {
      id: 3,
      name: 'Bali Retreat',
      date: 'Feb 1-8, 2025',
      status: 'Planning',
      duration: '7 days',
      distance: '28 km',
    },
  ];

  const quickActions = [
    {
      to: '/plan-tour',
      label: 'Plan New Trip',
      icon: Compass,
      color: 'text-accent-primary',
    },
    {
      to: '/safety-map',
      label: 'View Safety Map',
      icon: Map,
      color: 'text-green-600',
    },
    {
      to: '/sos',
      label: 'SOS Center',
      icon: AlertTriangle,
      color: 'text-red-600',
    },
    {
      to: '/translator',
      label: 'Translator',
      icon: Zap,
      color: 'text-blue-600',
    },
  ];

  const fatigueColors = {
    LOW: {
      bg: 'bg-green-500/10',
      text: 'text-green-700',
      border: 'border-green-500/30',
      bar: 'bg-green-500',
    },
    MEDIUM: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-700',
      border: 'border-amber-500/30',
      bar: 'bg-amber-500',
    },
    HIGH: {
      bg: 'bg-red-500/10',
      text: 'text-red-700',
      border: 'border-red-500/30',
      bar: 'bg-red-500',
    },
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

        <CurrentZoneAlert />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <StatCard
            icon={Navigation}
            label="Total Trips"
            value="12"
            trend={15}
            delay={0.1}
          />

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-card p-5 sm:p-6 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/6 via-transparent to-transparent" />

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-10 h-10 rounded-xl ${currentFatigueStyle.bg} flex items-center justify-center border ${currentFatigueStyle.border}`}
                >
                  <Activity className={`w-5 h-5 ${currentFatigueStyle.text}`} />
                </div>

                <div
                  className={`relative w-2.5 h-2.5 rounded-full ${currentFatigueStyle.bar}`}
                >
                  <div
                    className={`absolute inset-0 rounded-full ${currentFatigueStyle.bar} animate-ping opacity-75`}
                  />
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

              <div className="mt-4 w-full h-2 rounded-full bg-[#EDE5DA] overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${currentFatigueStyle.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${fatigueValue}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          </motion.div>

          <StatCard
            icon={MapPin}
            label="Countries"
            value="8"
            trend={25}
            delay={0.3}
          />

          <StatCard
            icon={Clock}
            label="Travel Hours"
            value="240"
            trend={10}
            delay={0.4}
          />
        </div>

        <CompactSafetyWidgets />
        
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="glass-card p-5 mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <Thermometer className="w-4 h-4 text-accent-primary" />
            <span className="text-sm font-semibold text-text-primary">
              Live Travel Metrics
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              {
                icon: Route,
                label: 'Distance',
                value: `${metrics.distance} km`,
              },
              {
                icon: Mountain,
                label: 'Elevation',
                value: `${metrics.elevation} m`,
              },
              {
                icon: Thermometer,
                label: 'Temp',
                value: `${metrics.temperature}°C`,
              },
              {
                icon: Activity,
                label: 'Activity',
                value: metrics.activityLevel,
              },
              {
                icon: Users,
                label: 'Group',
                value: metrics.groupSize,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl bg-white/65 border border-[#DDD3C5] p-4 text-center"
              >
                <item.icon className="w-5 h-5 text-accent-primary mx-auto mb-2" />
                <p className="text-base font-semibold text-text-primary">
                  {item.value}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="lg:col-span-2 glass-card p-6 sm:p-7"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">
                  Recent Trips
                </h3>
                <p className="text-sm text-text-secondary mt-1">
                  Your latest travel history
                </p>
              </div>

              <Link
                to="/my-trips"
                className="text-sm font-medium text-accent-primary hover:text-accent-hover flex items-center gap-1 transition-colors"
              >
                View all
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-4">
              {recentTrips.map((trip, index) => (
                <motion.div
                  key={trip.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: 0.5 + index * 0.08,
                  }}
                  className="rounded-2xl bg-white/65 border border-[#DDD3C5] p-5 hover:border-accent-primary/30 hover:shadow-soft transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-semibold text-text-primary mb-1">
                        {trip.name}
                      </h4>

                      <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
                        <Calendar className="w-4 h-4" />
                        {trip.date}
                      </div>

                      <div className="flex items-center gap-5 text-xs text-text-muted">
                        <span>{trip.duration}</span>
                        <span>{trip.distance}</span>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        trip.status === 'Completed'
                          ? 'bg-green-500/15 text-green-700'
                          : trip.status === 'Upcoming'
                          ? 'bg-blue-500/15 text-blue-700'
                          : 'bg-amber-500/15 text-amber-700'
                      }`}
                    >
                      {trip.status}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
                    <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="glass-card p-6 sm:p-7"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-text-primary">
                Quick Actions
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                Fast access to core tools
              </p>
            </div>

            <div className="space-y-3">
              {quickActions.map((action, index) => (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: 0.6 + index * 0.07,
                  }}
                >
                  <Link
                    to={action.to}
                    className="group flex items-center justify-between rounded-2xl bg-white/65 border border-[#DDD3C5] p-4 hover:border-accent-primary/30 hover:shadow-soft transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-white border border-[#DDD3C5] flex items-center justify-center shadow-soft">
                        <action.icon className={`w-5 h-5 ${action.color}`} />
                      </div>

                      <span className="text-sm font-medium text-text-primary">
                        {action.label}
                      </span>
                    </div>

                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary transition-colors" />
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-[#DDD3C5]">
              <FatigueIndicator />
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.75 }}
          className="glass-card p-6 sm:p-8 mt-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-accent-primary/7 via-transparent to-accent-soft/8" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-white border border-[#DDD3C5] flex items-center justify-center shadow-soft">
                  <TrendingUp className="w-5 h-5 text-accent-primary" />
                </div>

                <h3 className="text-lg font-semibold text-text-primary">
                  Travel Insights
                </h3>
              </div>

              <p className="text-text-secondary max-w-2xl leading-relaxed">
                Your travel efficiency improved by 18% this month. AI fatigue
                recommendations helped optimize rest timing and route planning.
              </p>
            </div>

            <Link
              to="/plan-tour"
              className="btn-primary flex items-center gap-2 shrink-0"
            >
              Plan Next Trip
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default Dashboard;