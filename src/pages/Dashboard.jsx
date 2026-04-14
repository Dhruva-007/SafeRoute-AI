import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { 
  LayoutDashboard, Navigation, Map, Shield, Clock, 
  TrendingUp, MapPin, AlertTriangle, ChevronRight,
  Compass, Calendar, Zap
} from 'lucide-react';

function Dashboard() {
  const { user } = useAuth();

  const recentTrips = [
    { id: 1, name: 'Tokyo Adventure', date: 'Dec 15-22, 2024', status: 'Completed', safety: 98 },
    { id: 2, name: 'Paris Getaway', date: 'Jan 5-12, 2025', status: 'Upcoming', safety: 95 },
    { id: 3, name: 'Bali Retreat', date: 'Feb 1-8, 2025', status: 'Planning', safety: 92 },
  ];

  const quickActions = [
    { to: '/plan-tour', label: 'Plan New Trip', icon: Compass, color: 'text-accent-primary' },
    { to: '/safety-map', label: 'View Safety Map', icon: Map, color: 'text-green-400' },
    { to: '/sos', label: 'SOS Center', icon: AlertTriangle, color: 'text-red-400' },
    { to: '/translator', label: 'Translator', icon: Zap, color: 'text-blue-400' },
  ];

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={LayoutDashboard}
          title={`Welcome back, ${user?.name || 'Traveler'}`}
          subtitle="Here's an overview of your travel activity and safety status."
        />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Navigation} label="Total Trips" value="12" trend={15} delay={0.1} />
          <StatCard icon={Shield} label="Safety Score" value="96%" trend={3} delay={0.2} />
          <StatCard icon={MapPin} label="Countries" value="8" trend={25} delay={0.3} />
          <StatCard icon={Clock} label="Travel Hours" value="240" trend={10} delay={0.4} />
        </div>

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
                    <p className="text-xs text-text-muted mt-1.5">Safety: {trip.safety}%</p>
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

            {/* Safety Alert */}
            <div className="mt-6 p-4 rounded-xl bg-green-500/5 border border-green-500/10">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">All Clear</span>
              </div>
              <p className="text-xs text-text-secondary">No safety alerts for your upcoming trips. Travel safe!</p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;