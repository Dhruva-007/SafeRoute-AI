import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import {
  fetchTrips,
  deleteTrip,
  updateTripStatus,
  updateActivity,
  addActivity,
  deleteActivity,
  regenerateDay,
} from '../services/trips';
import ActivityEditor from '../components/trip-editor/ActivityEditor';
import DayRegenerator from '../components/trip-editor/DayRegenerator';
import ActivitySwapper from '../components/trip-editor/ActivitySwapper';
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
  Edit2,
  Trash,
  Shuffle,
  RefreshCw,
  WifiOff,
  Share2,
} from 'lucide-react';

import {
  FATIGUE_BADGE,
  FATIGUE_DOT,
  scoreToLevel,
} from '../utils/fatigueStyles';
import WeatherStrip from '../components/WeatherStrip';
import ExportMenu from '../components/trip-export/ExportMenu';
import ShareModal from '../components/trip-export/ShareModal';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

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

  // Editor modals state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('edit');
  const [editorTarget, setEditorTarget] = useState(null);

  const [regeneratorOpen, setRegeneratorOpen] = useState(false);
  const [regeneratorDay, setRegeneratorDay] = useState(null);

  const [swapperOpen, setSwapperOpen] = useState(false);
  const [swapperTarget, setSwapperTarget] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    loadTrips();
  }, []);

  // Refresh trips automatically when coming back online
  useEffect(() => {
    if (isOnline) {
      loadTrips();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const loadTrips = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrips();
      setTrips(data);
    } catch (err) {
      setError(
        err.message ||
          'Failed to load trips. Is the backend running?',
      );
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
      setError(err.message || 'Failed to delete trip.');
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
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
    } catch (err) {
      setError(err.message || 'Failed to update trip status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  /* -------- Editor handlers -------- */

  const openEditActivity = (dayNumber, activityIndex, activity) => {
    setEditorMode('edit');
    setEditorTarget({ dayNumber, activityIndex, initialValue: activity });
    setEditorOpen(true);
  };

  const openAddActivity = (dayNumber) => {
    setEditorMode('add');
    setEditorTarget({ dayNumber, activityIndex: null, initialValue: null });
    setEditorOpen(true);
  };

  const handleSaveActivity = async (data) => {
    if (!selectedTrip || !editorTarget) return;
    const { dayNumber, activityIndex } = editorTarget;

    let updated;
    if (editorMode === 'edit') {
      updated = await updateActivity(
        selectedTrip.id,
        dayNumber,
        activityIndex,
        data,
      );
    } else {
      updated = await addActivity(selectedTrip.id, dayNumber, data);
    }

    setSelectedTrip(updated);
    setTrips((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
  };

  const handleDeleteActivity = async (dayNumber, activityIndex) => {
    if (!selectedTrip) return;
    if (!window.confirm('Delete this activity?')) return;

    try {
      const updated = await deleteActivity(
        selectedTrip.id,
        dayNumber,
        activityIndex,
      );
      setSelectedTrip(updated);
      setTrips((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
    } catch (err) {
      setError(err.message);
    }
  };

  /* -------- Regenerator handlers -------- */

  const openRegenerator = (dayNumber) => {
    setRegeneratorDay(dayNumber);
    setRegeneratorOpen(true);
  };

  const handleRegenerateDay = async () => {
    if (!selectedTrip || regeneratorDay == null) return;
    const result = await regenerateDay(selectedTrip.id, regeneratorDay);
    setSelectedTrip(result.trip);
    setTrips((prev) =>
      prev.map((t) => (t.id === result.trip.id ? result.trip : t)),
    );
  };

  /* -------- Swapper handlers -------- */

  const openSwapper = (dayNumber, activityIndex, activity) => {
    setSwapperTarget({ dayNumber, activityIndex, activity });
    setSwapperOpen(true);
  };

  const handleSwapActivity = async (alternativeDoc) => {
    if (!selectedTrip || !swapperTarget) return;
    const { dayNumber, activityIndex } = swapperTarget;

    const updated = await updateActivity(
      selectedTrip.id,
      dayNumber,
      activityIndex,
      {
        place: alternativeDoc.name,
        description: alternativeDoc.description,
      },
    );

    setSelectedTrip(updated);
    setTrips((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
  };

  const handleShareUpdated = (updatedTrip) => {
    setSelectedTrip(updatedTrip);
    setTrips((prev) =>
      prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)),
    );
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

              <div className="flex items-center gap-2 flex-wrap">
                {/* Export menu — works offline since it's client-side */}
                <ExportMenu trip={selectedTrip} />

                {/* Share button */}
                <button
                  onClick={() => setShareModalOpen(true)}
                  disabled={!isOnline}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedTrip.share_token
                      ? 'bg-success-soft text-success border-success/25 hover:bg-success/15'
                      : 'bg-accent-primary/10 text-accent-primary border-accent-primary/25 hover:bg-accent-primary/15'
                  }`}
                  title={!isOnline ? 'Offline — sharing disabled' : ''}
                >
                  <Share2 className="w-4 h-4" />
                  {selectedTrip.share_token ? 'Shared' : 'Share'}
                </button>

                {/* Status badge */}
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full capitalize border ${
                    STATUS_STYLES[selectedTrip.status] || STATUS_STYLES.planned
                  }`}
                >
                  {selectedTrip.status}
                </span>
              </div>
            </div>

            {/* Status Actions */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => handleStatusChange('planned')}
                disabled={
                  !isOnline ||
                  updatingStatus ||
                  selectedTrip.status === 'planned'
                }
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-warning-soft text-warning border border-warning/25 hover:bg-warning/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                title={!isOnline ? 'Offline — editing disabled' : ''}
              >
                <Flag className="w-3 h-3" />
                Mark Planned
              </button>
              <button
                onClick={() => handleStatusChange('active')}
                disabled={
                  !isOnline ||
                  updatingStatus ||
                  selectedTrip.status === 'active'
                }
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary border border-accent-primary/25 hover:bg-accent-primary/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                title={!isOnline ? 'Offline — editing disabled' : ''}
              >
                <PlayCircle className="w-3 h-3" />
                Start Trip
              </button>
              <button
                onClick={() => handleStatusChange('completed')}
                disabled={
                  !isOnline ||
                  updatingStatus ||
                  selectedTrip.status === 'completed'
                }
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-success-soft text-success border border-success/25 hover:bg-success/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                title={!isOnline ? 'Offline — editing disabled' : ''}
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

          {/* Offline notice for detail view */}
          {!isOnline && (
            <div className="glass-card shadow-soft border border-warning/25 bg-warning-soft/50 p-4 mb-6 flex items-start gap-3">
              <WifiOff className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-warning mb-0.5">
                  Viewing offline cached version
                </p>
                <p className="text-xs text-text-secondary">
                  Edit, regenerate, swap, and share are disabled until
                  your connection returns. Export still works.
                </p>
              </div>
            </div>
          )}

          {/* Weather strip */}
          {selectedTrip.days && selectedTrip.days.length > 0 && (
            <div className="mb-6">
              <WeatherStrip days={selectedTrip.days} />
            </div>
          )}

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

                  <div className="flex items-center gap-2 flex-wrap">
                    {dayObj.day_fatigue_average !== undefined && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-text-muted" />
                        <span className="text-xs text-text-muted">
                          Day fatigue avg:
                        </span>
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                            FATIGUE_BADGE[
                              scoreToLevel(dayObj.day_fatigue_average)
                            ]
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              FATIGUE_DOT[
                                scoreToLevel(dayObj.day_fatigue_average)
                              ]
                            }`}
                          />
                          {dayObj.day_fatigue_average}/100
                        </span>
                      </div>
                    )}

                    {/* Day-level actions */}
                    <button
                      onClick={() => openAddActivity(dayObj.day)}
                      disabled={!isOnline}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary border border-accent-primary/25 hover:bg-accent-primary/15 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        !isOnline ? 'Offline — editing disabled' : 'Add activity'
                      }
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                    <button
                      onClick={() => openRegenerator(dayObj.day)}
                      disabled={!isOnline}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent-primary/10 text-accent-primary border border-accent-primary/25 hover:bg-accent-primary/15 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        !isOnline
                          ? 'Offline — editing disabled'
                          : 'Regenerate this day with AI'
                      }
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {dayObj.activities?.map((activity, i) => (
                    <div
                      key={i}
                      className="group flex items-start gap-4 p-4 rounded-2xl bg-white/50 border border-transparent hover:border-accent-primary/20 transition-colors"
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
                              {activity.fatigue_level} ·{' '}
                              {activity.fatigue_score}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                          {activity.description}
                        </p>
                        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                          <span className="text-xs text-accent-primary font-medium">
                            {activity.estimated_cost}
                          </span>

                          {/* Inline activity actions */}
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() =>
                                openEditActivity(dayObj.day, i, activity)
                              }
                              disabled={!isOnline}
                              className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={!isOnline ? 'Offline' : 'Edit'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                openSwapper(dayObj.day, i, activity)
                              }
                              disabled={!isOnline}
                              className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                !isOnline ? 'Offline' : 'Swap with alternative'
                              }
                            >
                              <Shuffle className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteActivity(dayObj.day, i)
                              }
                              disabled={!isOnline}
                              className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={!isOnline ? 'Offline' : 'Delete'}
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Modals */}
          <ActivityEditor
            open={editorOpen}
            mode={editorMode}
            initialValue={editorTarget?.initialValue}
            onClose={() => setEditorOpen(false)}
            onSave={handleSaveActivity}
          />

          <DayRegenerator
            open={regeneratorOpen}
            dayNumber={regeneratorDay}
            onClose={() => setRegeneratorOpen(false)}
            onConfirm={handleRegenerateDay}
          />

          <ActivitySwapper
            open={swapperOpen}
            activity={swapperTarget?.activity}
            budget={selectedTrip?.budget_level}
            onClose={() => setSwapperOpen(false)}
            onSwap={handleSwapActivity}
          />

          <ShareModal
            open={shareModalOpen}
            trip={selectedTrip}
            onClose={() => setShareModalOpen(false)}
            onUpdated={handleShareUpdated}
          />
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

        {/* Offline notice for list view */}
        {!isOnline && (
          <div className="glass-card shadow-soft border border-warning/25 bg-warning-soft/50 p-4 mb-6 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning mb-0.5">
                You are offline
              </p>
              <p className="text-xs text-text-secondary">
                Showing cached trips. Create, edit, and delete are paused
                until you reconnect.
              </p>
            </div>
          </div>
        )}

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
              <button
                onClick={() => setError(null)}
                className="text-danger/60 hover:text-danger text-lg leading-none"
              >
                ×
              </button>
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
                    disabled={deleting === trip.id || !isOnline}
                    className="p-2 rounded-xl hover:bg-danger/8 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!isOnline ? 'Offline' : 'Delete'}
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
              {isOnline
                ? 'Generate your first AI-powered itinerary to get started.'
                : 'No cached trips available offline.'}
            </p>
            {isOnline && (
              <Link
                to="/plan-tour"
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Plan a Trip
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MyTrips;