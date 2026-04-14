import React, { useState } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  Navigation, MapPin, Calendar, Shield, Star, 
  MoreHorizontal, Trash2, Eye, Edit
} from 'lucide-react';

function MyTrips() {
  const [activeTab, setActiveTab] = useState('all');

  const trips = [
    {
      id: 1, name: 'Tokyo Adventure', destination: 'Tokyo, Japan',
      dates: 'Dec 15-22, 2024', status: 'completed', safety: 98,
      rating: 5, image: '🗼', days: 7
    },
    {
      id: 2, name: 'Paris Getaway', destination: 'Paris, France',
      dates: 'Jan 5-12, 2025', status: 'upcoming', safety: 95,
      rating: null, image: '🗼', days: 7
    },
    {
      id: 3, name: 'Bali Retreat', destination: 'Bali, Indonesia',
      dates: 'Feb 1-8, 2025', status: 'planning', safety: 92,
      rating: null, image: '🏝️', days: 7
    },
    {
      id: 4, name: 'Swiss Alps Trek', destination: 'Zurich, Switzerland',
      dates: 'Nov 1-7, 2024', status: 'completed', safety: 97,
      rating: 4, image: '🏔️', days: 6
    },
    {
      id: 5, name: 'Bangkok Explorer', destination: 'Bangkok, Thailand',
      dates: 'Mar 10-16, 2025', status: 'planning', safety: 88,
      rating: null, image: '🛕', days: 6
    },
  ];

  const tabs = [
    { key: 'all', label: 'All Trips' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Completed' },
    { key: 'planning', label: 'Planning' },
  ];

  const filtered = activeTab === 'all' ? trips : trips.filter(t => t.status === activeTab);

  const statusColors = {
    completed: 'bg-green-500/10 text-green-400',
    upcoming: 'bg-blue-500/10 text-blue-400',
    planning: 'bg-yellow-500/10 text-yellow-400',
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Navigation}
          title="My Trips"
          subtitle="Manage and review all your travel plans in one place."
        />

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-accent-primary/15 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Trips Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((trip, index) => (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="glass-card p-6 hover:-translate-y-1 transition-all duration-250 group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="text-3xl">{trip.image}</div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[trip.status]}`}>
                  {trip.status}
                </span>
              </div>

              {/* Info */}
              <h3 className="text-base font-semibold text-text-primary mb-1">{trip.name}</h3>
              <div className="flex items-center gap-1.5 text-sm text-text-secondary mb-1">
                <MapPin className="w-3.5 h-3.5" />
                {trip.destination}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-text-muted mb-4">
                <Calendar className="w-3.5 h-3.5" />
                {trip.dates} • {trip.days} days
              </div>

              {/* Bottom */}
              <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-text-secondary">{trip.safety}%</span>
                </div>
                {trip.rating && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: trip.rating }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 text-accent-primary fill-accent-primary" />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    <Eye className="w-4 h-4 text-text-muted" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    <Edit className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MyTrips;