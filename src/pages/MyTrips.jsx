import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { fetchTrips, deleteTrip, updateTripStatus } from '../services/trips';
import {
  Navigation,
  MapPin,
  Calendar,
  Eye,
  Trash2,
  Clock,
  Route,
  Loader2,
  AlertCircle,
  Plus,
  ArrowLeft,
  TrendingUp,
  CheckCircle,
  PlayCircle,
  Flag,
} from 'lucide-react';

import {
  FATIGUE_BADGE,
  FATIGUE_DOT,
  scoreToLevel,
} from '../utils/fatigueStyles';

const STATUS_STYLES = {
  planned: 'bg-warning-soft text-warning border-warning/25',
  active: 'bg-accent-primary/10 text-accent-primary border-accent-primary/25',
  completed: 'bg-success-soft text-success border-success/25',
};

function MyTrips() {
  const [activeTab, setActiveTab] = useState('all');
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrips();
      setTrips(data);
    } catch (err) {
      setError('Failed to load trips. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tripId) => {
    if (!window.confirm('Are you sure you want to delete this trip?')) return;

    setDeleting(tripId);
    try {
      await deleteTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
      if (selectedTrip?.id === tripId) setSelectedTrip(null);
    } catch (err) {
      setError('Failed to delete trip.');
    } finally {
      setDeleting(null);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selectedTrip) return;
    setUpdatingStatus(true);
    try {
      const updated = await updateTripStatus(selectedTrip.id, newStatus);
      setSelectedTrip(updated);
      setTrips((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t))
      );
    } catch (err) {
      setError('Failed to update trip status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const tabs = [
    { key: 'all', label: 'All Trips' },
    { key: 'planned', label: 'Planned' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
  ];

  const filtered =
    activeTab === 'all'
      ? trips
      : trips.filter((t) => t.status === activeTab);

  const statusCounts = {
    planned: trips.filter((t) => t.status === 'planned').length,
    active: trips.filter((t) => t.status === 'active').length,
    completed: trips.filter((t) => t.status === 'completed').length,
  };

  const formatDates = (start, end) => {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const opts = { month: 'short', day: 'numeric', year: 'numeric' };
      return `${s.toLocaleDateString('en-US', opts)} — ${e.toLocaleDateString('en-US', opts)}`;
    } catch {
      return `${start} to ${end}`;
    }
  };

  const destinationEmoji = (dest) => {
    const map = { hyderabad: '🕌' };
    return map[dest?.toLowerCase()] || '📍';
  };

  /* ===== DETAIL VIEW ===== */
  if (selectedTrip) {
    return (
      <div className="section-padding !pt-8">
        <div className="container-max">
          <button
            onClick={() => setSelectedTrip(null)}
            className="btn-secondary mb-6 inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to trips
          </button>

          {/* Detail Header */}
          <div className="glass-card shadow-soft border border-[#DDD3C5] p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-bold text-text-primary mb-1">
                  {selectedTrip.destination} Trip
                </h2>
                <p className="text-sm text-text-secondary">
                  {selectedTrip.duration_days} day
                  {selectedTrip.duration_days !== 1 ? 's' : ''} •{' '}
                  {selectedTrip.budget_level} •{' '}
                  {selectedTrip.number_of_travelers} traveler
                  {selectedTrip.number_of_travelers !== 1 ? 's' : ''}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full capitalize border self-start ${
                  STATUS_STYLES[selectedTrip.status] || STATUS_STYLES.planned
                }`}
              >
                {selectedTrip.status}
              </span>
            </div>

            {/* Status Actions */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => handleStatusChange('planned')}
                disabled={updatingStatus || selectedTrip.status === 'planned'}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-warning-soft text-warning border border-warning/25 hover:bg-warning/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                <Flag className="w-3 h-3" />
                Mark Planned
              </button>
              <button
                onClick={() => handleStatusChange('active')}
                disabled={updatingStatus || selectedTrip.status === 'active'}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary border border-accent-primary/25 hover:bg-accent-primary/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                <PlayCircle className="w-3 h-3" />
                Start Trip
              </button>
              <button
                onClick={() => handleStatusChange('completed')}
                disabled={updatingStatus || selectedTrip.status === 'completed'}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-success-soft text-success border border-success/25 hover:bg-success/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
              >
                <CheckCircle className="w-3 h-3" />
                Complete
              </button>
            </div>

            {selectedTrip.summary && (
              <p className="text-sm text-text-secondary leading-relaxed border-t border-[#DDD3C5] pt-4">
                {selectedTrip.summary}
              </p>
            )}

            {selectedTrip.estimated_budget && (
              <div className="mt-3">
                <span className="text-sm text-text-muted">
                  Estimated cost:{' '}
                </span>
                <span className="text-sm font-semibold text-accent-primary">
                  {selectedTrip.estimated_budget}
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {selectedTrip.interests?.map((interest) => (
                <span
                  key={interest}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>

          {/* Itinerary Days */}
          <div className="space-y-6">
            {selectedTrip.days?.map((dayObj) => (
              <div
                key={dayObj.day}
                className="glass-card shadow-soft border border-[#DDD3C5] p-6"
              >
                <div className="flex items-baseline justify-between mb-5 gap-4 flex-wrap">
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-lg font-semibold text-text-primary">
                      Day {dayObj.day}
                    </h3>
                    <span className="text-sm text-text-muted font-mono">
                      {dayObj.date}
                    </span>
                  </div>

                  {dayObj.day_fatigue_average !== undefined && (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-text-muted" />
                      <span className="text-xs text-text-muted">
                        Day fatigue avg:
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                          FATIGUE_BADGE[scoreToLevel(dayObj.day_fatigue_average)]
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            FATIGUE_DOT[scoreToLevel(dayObj.day_fatigue_average)]
                          }`}
                        />
                        {dayObj.day_fatigue_average}/100
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {dayObj.activities?.map((activity, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-4 p-4 rounded-2xl bg-white/50 border border-transparent hover:border-accent-primary/20 transition-colors"
                    >
                      <span className="text-sm font-mono text-text-muted w-20 shrink-0 pt-0.5">
                        {activity.time}
                      </span>
                      <div className="w-2 h-2 rounded-full bg-accent-primary shrink-0 mt-2" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <p className="text-sm font-semibold text-text-primary">
                            {activity.place}
                          </p>
                          {activity.fatigue_level && (
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 shrink-0 ${
                                FATIGUE_BADGE[activity.fatigue_level]
                              }`}
                              title={`Fatigue score: ${activity.fatigue_score}/100`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  FATIGUE_DOT[activity.fatigue_level]
                                }`}
                              />
                              {activity.fatigue_level} · {activity.fatigue_score}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                          {activity.description}
                        </p>
                        <span className="inline-block text-xs text-accent-primary font-medium mt-2">
                          {activity.estimated_cost}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ===== LIST VIEW ===== */
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
              className={`px-5 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? 'bg-accent-primary/15 text-accent-primary shadow-soft'
                  : 'text-text-secondary hover:text-text-primary hover:bg-[#FAF7F2]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card shadow-soft border border-[#DDD3C5] p-5 mb-8 flex items-center justify-between flex-wrap gap-4"
        >
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-sm text-text-secondary">
                {statusCounts.planned} Planned
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-primary" />
              <span className="text-sm text-text-secondary">
                {statusCounts.active} Active
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm text-text-secondary">
                {statusCounts.completed} Completed
              </span>
            </div>
          </div>
          <span className="text-sm text-text-muted">
            {filtered.length} trip{filtered.length !== 1 ? 's' : ''} shown
          </span>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 rounded-2xl bg-danger-soft border border-danger/20 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <p className="text-sm text-danger flex-1">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading && (
          <div className="text-center py-20">
            <Loader2 className="w-10 h-10 text-accent-primary animate-spin mx-auto mb-4" />
            <p className="text-text-secondary">Loading trips...</p>
          </div>
        )}

        {/* Trip Grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((trip, index) => (
              <motion.div
                key={trip.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="glass-card shadow-soft border border-[#DDD3C5] p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-white/85 border border-[#DDD3C5] flex items-center justify-center text-3xl shadow-soft">
                    {destinationEmoji(trip.destination)}
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full capitalize border ${
                      STATUS_STYLES[trip.status] || STATUS_STYLES.planned
                    }`}
                  >
                    {trip.status}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  {trip.destination} Trip
                </h3>

                <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
                  <MapPin className="w-4 h-4 text-accent-primary" />
                  {trip.destination}
                </div>

                <div className="flex items-center gap-2 text-sm text-text-muted mb-5">
                  <Calendar className="w-4 h-4" />
                  {formatDates(trip.start_date, trip.end_date)}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="rounded-2xl bg-white/70 border border-[#DDD3C5] p-3">
                    <div className="flex items-center gap-2 text-text-secondary text-sm">
                      <Route className="w-4 h-4 text-accent-primary" />
                      <span>{trip.duration_days} days</span>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/70 border border-[#DDD3C5] p-3">
                    <div className="flex items-center gap-2 text-text-secondary text-sm">
                      <Clock className="w-4 h-4 text-accent-primary" />
                      <span>
                        {trip.number_of_travelers} traveler
                        {trip.number_of_travelers !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {trip.interests && trip.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {trip.interests.slice(0, 4).map((interest) => (
                      <span
                        key={interest}
                        className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-primary/10 text-accent-primary border border-accent-primary/15"
                      >
                        {interest}
                      </span>
                    ))}
                    {trip.interests.length > 4 && (
                      <span className="px-2 py-0.5 rounded-full text-xs text-text-muted">
                        +{trip.interests.length - 4}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-5 border-t border-[#DDD3C5]">
                  <button
                    onClick={() => setSelectedTrip(trip)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold text-accent-primary hover:bg-accent-primary/8 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>

                  <button
                    onClick={() => handleDelete(trip.id)}
                    disabled={deleting === trip.id}
                    className="p-2 rounded-xl hover:bg-danger/8 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deleting === trip.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-danger" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-text-muted hover:text-danger" />
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-white/85 border border-[#DDD3C5] flex items-center justify-center mx-auto mb-5 shadow-soft">
              <Navigation className="w-10 h-10 text-text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No Trips Yet
            </h3>
            <p className="text-text-secondary mb-6">
              Generate your first AI-powered itinerary to get started.
            </p>
            <Link
              to="/plan-tour"
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Plan a Trip
            </Link>
          </div>
        )} 
      </div>
    </div>
  );
}

export default MyTrips;