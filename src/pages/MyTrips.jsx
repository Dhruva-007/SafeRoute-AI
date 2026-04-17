import React, { useState } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  Navigation, MapPin, Calendar, Star, 
  Eye, Edit, Clock, Route
} from 'lucide-react';

function MyTrips() {
  const [activeTab, setActiveTab] = useState('all');

  const trips = [
    {
      id: 1, name: 'Tokyo Adventure', destination: 'Tokyo, Japan',
      dates: 'Dec 15-22, 2024', status: 'completed',
      rating: 5, image: '🗼', days: 7, distance: '45 km', duration: '168 hrs'
    },
    {
      id: 2, name: 'Paris Getaway', destination: 'Paris, France',
      dates: 'Jan 5-12, 2025', status: 'upcoming',
      rating: null, image: '🗼', days: 7, distance: '32 km', duration: '168 hrs'
    },
    {
      id: 3, name: 'Bali Retreat', destination: 'Bali, Indonesia',
      dates: 'Feb 1-8, 2025', status: 'planning',
      rating: null, image: '🏝️', days: 7, distance: '28 km', duration: '168 hrs'
    },
    {
      id: 4, name: 'Swiss Alps Trek', destination: 'Zurich, Switzerland',
      dates: 'Nov 1-7, 2024', status: 'completed',
      rating: 4, image: '🏔️', days: 6, distance: '62 km', duration: '144 hrs'
    },
    {
      id: 5, name: 'Bangkok Explorer', destination: 'Bangkok, Thailand',
      dates: 'Mar 10-16, 2025', status: 'planning',
      rating: null, image: '🛕', days: 6, distance: '35 km', duration: '144 hrs'
    },
    {
      id: 6, name: 'New York City Break', destination: 'New York, USA',
      dates: 'Oct 20-25, 2024', status: 'completed',
      rating: 5, image: '🗽', days: 5, distance: '38 km', duration: '120 hrs'
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

  const statusLabels = {
    completed: 'Completed',
    upcoming: 'Active',
    planning: 'Planning',
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

        {/* Summary Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card p-4 mb-6 flex items-center justify-between flex-wrap gap-4"
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-text-secondary">
                {trips.filter(t => t.status === 'completed').length} Completed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm text-text-secondary">
                {trips.filter(t => t.status === 'upcoming').length} Active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-sm text-text-secondary">
                {trips.filter(t => t.status === 'planning').length} Planning
              </span>
            </div>
          </div>
          <span className="text-sm text-text-muted">{filtered.length} trips shown</span>
        </motion.div>

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
                  {statusLabels[trip.status]}
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
                {trip.dates}
              </div>

              {/* Distance & Duration */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Route className="w-3.5 h-3.5 text-accent-primary/70" />
                  <span>{trip.distance}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Clock className="w-3.5 h-3.5 text-accent-primary/70" />
                  <span>{trip.days} days</span>
                </div>
              </div>

              {/* Bottom */}
              <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                {trip.rating ? (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: trip.rating }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 text-accent-primary fill-accent-primary" />
                    ))}
                    {Array.from({ length: 5 - trip.rating }).map((_, i) => (
                      <Star key={`e${i}`} className="w-3.5 h-3.5 text-white/10" />
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-text-muted italic">Not rated yet</span>
                )}
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="View">
                    <Eye className="w-4 h-4 text-text-muted" />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Edit">
                    <Edit className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Navigation className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-secondary">No trips found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default MyTrips;