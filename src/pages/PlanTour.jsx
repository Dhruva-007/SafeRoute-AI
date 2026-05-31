import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import FatiguePredictor from '../components/FatiguePredictor';
import {
  Compass,
  MapPin,
  Calendar,
  Users,
  Sparkles,
  ChevronRight,
  Activity,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Save,
  CheckCircle,
  TrendingUp,
  WifiOff,
} from 'lucide-react';
import WeatherStrip from '../components/WeatherStrip';
import { planTrip, validateFormData } from '../services/planner';
import { saveTrip } from '../services/trips';
import {
  FATIGUE_BADGE,
  FATIGUE_DOT,
  scoreToLevel,
} from '../utils/fatigueStyles';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const INTERESTS = [
  'Culture',
  'Food',
  'Nature',
  'Nightlife',
  'Shopping',
  'History',
  'Photography',
  'Adventure',
  'Relaxation',
];

function PlanTour() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    destination: 'Hyderabad',
    startDate: '',
    endDate: '',
    travelers: 2,
    budget: 'mid-range',
    interests: [],
  });

  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showFatiguePredictor, setShowFatiguePredictor] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedTripId, setSavedTripId] = useState(null);

  const { isOnline } = useOnlineStatus();

  const toggleInterest = (interest) => {
    setFormData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest],
    }));
  };

  const handleGenerate = async () => {
    if (!isOnline) {
      setError(
        'You are offline. Generating a new trip requires an internet connection.',
      );
      return;
    }

    const validationErrors = validateFormData(formData);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    const destLower = formData.destination.toLowerCase().trim();
    if (!destLower.includes('hyderabad')) {
      if (
        !window.confirm(
          `AI planner currently supports Hyderabad only.\n\nYou entered "${formData.destination}". Proceed anyway?`,
        )
      ) {
        return;
      }
    }

    setGenerating(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setSavedTripId(null);

    try {
      const data = await planTrip(formData);
      setResult(data);
      setGenerated(true);
    } catch (err) {
      setError(err.message || 'Failed to generate itinerary.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveTrip = async () => {
    if (!result) return;
    if (!isOnline) {
      setError('You are offline. Saving requires an internet connection.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const savedTrip = await saveTrip({
        destination: result.destination,
        start_date: result.days?.[0]?.date || formData.startDate,
        end_date:
          result.days?.[result.days.length - 1]?.date || formData.endDate,
        number_of_travelers: result.number_of_travelers,
        budget_level: result.budget_level,
        interests: result.interests,
        summary: result.summary,
        estimated_budget: result.estimated_budget,
        duration_days: result.duration_days,
        days: result.days,
        status: 'planned',
      });
      setSaved(true);
      setSavedTripId(savedTrip.id);
    } catch (err) {
      setError('Failed to save trip: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setGenerated(false);
    setStep(1);
    setResult(null);
    setError(null);
    setSaved(false);
    setSavedTripId(null);
    setShowFatiguePredictor(false);
    setFormData({
      destination: 'Hyderabad',
      startDate: '',
      endDate: '',
      travelers: 2,
      budget: 'mid-range',
      interests: [],
    });
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Compass}
          title="Plan Your Tour"
          subtitle="Let AI create the perfect itinerary tailored to your preferences and fatigue management."
        />

        {/* Offline notice */}
        {!isOnline && (
          <div className="max-w-2xl mx-auto mb-6 glass-card shadow-soft border border-warning/25 bg-warning-soft/50 p-4 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning mb-0.5">
                You are currently offline
              </p>
              <p className="text-xs text-text-secondary">
                AI trip planning requires an internet connection.
                Reconnect to generate new itineraries. Your saved trips
                are still viewable in My Trips.
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto mb-6 p-4 rounded-2xl bg-danger-soft border border-danger/20 flex items-start gap-3"
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

        {/* ===== FORM VIEW ===== */}
        {!generated ? (
          <div className="max-w-2xl mx-auto">
            <div className="glass-card shadow-soft p-6 sm:p-8 border border-[#DDD3C5]">
              {/* Step Indicator */}
              <div className="flex items-center gap-2 mb-8">
                {[1, 2, 3].map((s) => (
                  <React.Fragment key={s}>
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                        step >= s
                          ? 'bg-accent-primary text-white shadow-soft'
                          : 'bg-[#F6F0E8] text-text-muted border border-[#DDD3C5]'
                      }`}
                    >
                      {s}
                    </div>
                    {s < 3 && (
                      <div
                        className={`flex-1 h-1 rounded-full ${
                          step > s ? 'bg-accent-primary' : 'bg-[#E7DED2]'
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {/* STEP 1 */}
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <h3 className="text-xl font-semibold text-text-primary">
                      Where to?
                    </h3>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Destination
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          value={formData.destination}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              destination: e.target.value,
                            }))
                          }
                          placeholder="e.g., Hyderabad"
                          className="w-full pl-11 pr-4 py-3.5 bg-white/85 border border-[#DDD3C5] rounded-2xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all"
                        />
                      </div>
                      <p className="text-xs text-text-muted mt-2">
                        <span className="text-accent-primary font-semibold">
                          Note:
                        </span>{' '}
                        AI planning currently optimized for Hyderabad. More
                        cities coming soon.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                          Start Date
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type="date"
                            value={formData.startDate}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) =>
                              setFormData((p) => ({
                                ...p,
                                startDate: e.target.value,
                              }))
                            }
                            className="w-full pl-11 pr-4 py-3.5 bg-white/85 border border-[#DDD3C5] rounded-2xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                          End Date
                        </label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type="date"
                            value={formData.endDate}
                            min={
                              formData.startDate ||
                              new Date().toISOString().split('T')[0]
                            }
                            onChange={(e) =>
                              setFormData((p) => ({
                                ...p,
                                endDate: e.target.value,
                              }))
                            }
                            className="w-full pl-11 pr-4 py-3.5 bg-white/85 border border-[#DDD3C5] rounded-2xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setStep(2)}
                      className="btn-primary w-full flex items-center justify-center gap-2 !py-3.5"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}

                {/* STEP 2 */}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <h3 className="text-xl font-semibold text-text-primary">
                      Travel Details
                    </h3>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Number of Travelers
                      </label>
                      <div className="relative">
                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={formData.travelers}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setFormData((p) => ({
                              ...p,
                              travelers: isNaN(val)
                                ? 1
                                : Math.min(50, Math.max(1, val)),
                            }));
                          }}
                          className="w-full pl-11 pr-4 py-3.5 bg-white/85 border border-[#DDD3C5] rounded-2xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all"
                        />
                      </div>
                      <p className="text-xs text-text-muted mt-2">
                        Max 50 travelers per group.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-3">
                        Budget Level
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: 'budget', label: 'Budget', desc: 'Save money' },
                          {
                            id: 'mid-range',
                            label: 'Mid-Range',
                            desc: 'Balanced',
                          },
                          {
                            id: 'premium',
                            label: 'Premium',
                            desc: 'Best experience',
                          },
                        ].map((b) => (
                          <button
                            key={b.id}
                            onClick={() =>
                              setFormData((p) => ({ ...p, budget: b.id }))
                            }
                            className={`p-3.5 rounded-2xl text-sm font-semibold transition-all ${
                              formData.budget === b.id
                                ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/40 shadow-soft'
                                : 'bg-white/85 text-text-secondary border border-[#DDD3C5] hover:bg-[#FAF7F2]'
                            }`}
                          >
                            <div>{b.label}</div>
                            <div className="text-xs font-normal mt-1 opacity-60">
                              {b.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(1)}
                        className="btn-secondary flex-1 !py-3.5"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => setStep(3)}
                        className="btn-primary flex-1 flex items-center justify-center gap-2 !py-3.5"
                      >
                        Continue
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3 */}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-semibold text-text-primary">
                        What Interests You?
                      </h3>
                      <p className="text-sm text-text-secondary mt-1">
                        Select at least one. We will find the best places for
                        you.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {INTERESTS.map((interest) => (
                        <button
                          key={interest}
                          onClick={() => toggleInterest(interest)}
                          className={`px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
                            formData.interests.includes(interest)
                              ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/40 shadow-soft'
                              : 'bg-white/85 text-text-secondary border border-[#DDD3C5] hover:bg-[#FAF7F2]'
                          }`}
                        >
                          {interest}
                        </button>
                      ))}
                    </div>

                    {formData.interests.length > 0 && (
                      <p className="text-xs text-accent-primary font-medium">
                        {formData.interests.length} selected
                      </p>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(2)}
                        className="btn-secondary flex-1 !py-3.5"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleGenerate}
                        disabled={
                          generating ||
                          formData.interests.length === 0 ||
                          !isOnline
                        }
                        className="btn-primary flex-1 flex items-center justify-center gap-2 !py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          !isOnline
                            ? 'Offline — AI generation requires internet'
                            : ''
                        }
                      >
                        {generating ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Planning your trip...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate Plan
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* ===== RESULTS VIEW ===== */
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            {/* Header */}
            <div className="glass-card shadow-soft border border-[#DDD3C5] p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-text-primary mb-1">
                    {formData.destination} — AI Generated Plan
                  </h2>
                  <p className="text-sm text-text-secondary">
                    {result?.duration_days} day
                    {result?.duration_days !== 1 ? 's' : ''} •{' '}
                    {formData.budget} budget •{' '}
                    {result?.number_of_travelers || formData.travelers}{' '}
                    traveler
                    {(result?.number_of_travelers || formData.travelers) !== 1
                      ? 's'
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {!saved ? (
                    <button
                      onClick={handleSaveTrip}
                      disabled={saving || !isOnline}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      title={
                        !isOnline ? 'Offline — saving disabled' : ''
                      }
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Trip
                    </button>
                  ) : (
                    <Link
                      to="/my-trips"
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-success/15 text-success hover:bg-success/25 transition-all"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Saved · View in My Trips
                    </Link>
                  )}

                  <button
                    onClick={() =>
                      setShowFatiguePredictor(!showFatiguePredictor)
                    }
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      showFatiguePredictor
                        ? 'bg-accent-primary/15 text-accent-primary'
                        : 'bg-accent-primary/5 text-text-secondary hover:bg-accent-primary/10'
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                    <span className="hidden sm:inline">Fatigue Monitor</span>
                    {showFatiguePredictor ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={resetForm}
                    className="btn-secondary !px-4 !py-2 text-sm"
                  >
                    New Plan
                  </button>
                </div>
              </div>
            </div>

            {/* Fatigue Predictor (live) */}
            <AnimatePresence>
              {showFatiguePredictor && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <FatiguePredictor
                    tripId={savedTripId}
                    days={result?.days || []}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Weather */}
            <div className="mb-6">
              <WeatherStrip days={result?.days || []} />
            </div>

            {/* Itinerary Days */}
            <div className="space-y-6">
              {result?.days?.map((dayObj) => (
                <motion.div
                  key={dayObj.day}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: (dayObj.day - 1) * 0.1,
                  }}
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

                    {/* Day fatigue average */}
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
                  </div>

                  <div className="space-y-3">
                    {dayObj.activities.map((activity, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-4 p-4 rounded-2xl bg-white/50 hover:bg-accent-primary/5 transition-colors border border-transparent hover:border-accent-primary/20"
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

                            {/* Fatigue Badge */}
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
                </motion.div>
              ))}
            </div>

            {/* Summary */}
            <div className="glass-card shadow-soft border border-[#DDD3C5] p-6 mt-6">
              <h4 className="text-sm font-semibold text-text-primary mb-2">
                Trip Summary
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                {result?.summary || 'Enjoy your trip!'}
              </p>
              <div className="mt-4 pt-4 border-t border-[#DDD3C5] flex justify-between items-center">
                <span className="text-sm text-text-muted">
                  Estimated Total Cost
                </span>
                <span className="text-lg font-bold text-accent-primary">
                  {result?.estimated_budget || '—'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default PlanTour;