import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import WeatherStrip from '../components/WeatherStrip';
import { fetchSharedTrip } from '../services/trips';
import {
  Eye,
  Calendar,
  MapPin,
  TrendingUp,
  Loader2,
  AlertCircle,
  Shield,
  Sparkles,
} from 'lucide-react';
import {
  FATIGUE_BADGE,
  FATIGUE_DOT,
  scoreToLevel,
} from '../utils/fatigueStyles';

function SharedTrip() {
  const { token } = useParams();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSharedTrip(token);
        if (!cancelled) setTrip(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="section-padding !pt-8">
        <div className="container-max">
          <div className="text-center py-20">
            <Loader2 className="w-10 h-10 text-accent-primary animate-spin mx-auto mb-4" />
            <p className="text-text-secondary">Loading shared trip...</p>
          </div>
        </div>
      </div>
    );
  }

  /* ---- Error ---- */
  if (error) {
    return (
      <div className="section-padding !pt-8">
        <div className="container-max max-w-2xl mx-auto">
          <div className="glass-card shadow-soft border border-[#DDD3C5] p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-danger-soft border border-danger/25 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-danger" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">
              Link Unavailable
            </h2>
            <p className="text-sm text-text-secondary mb-6">{error}</p>
            <Link to="/" className="btn-primary inline-flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Go to SafeRoute AI
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!trip) return null;

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Eye}
          title="Shared Itinerary"
          subtitle="A friend shared this trip with you. Read-only view."
        />

        {/* Trip Header */}
        <div className="glass-card shadow-soft border border-[#DDD3C5] p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-1">
                {trip.destination} Trip
              </h2>
              <p className="text-sm text-text-secondary">
                {trip.duration_days} day{trip.duration_days !== 1 ? 's' : ''} ·{' '}
                {trip.budget_level} · {trip.number_of_travelers} traveler
                {trip.number_of_travelers !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-text-muted mt-2 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                {trip.start_date} → {trip.end_date}
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-primary/10 border border-accent-primary/25 text-accent-primary text-xs font-semibold">
              <Eye className="w-3.5 h-3.5" />
              Read-only
            </div>
          </div>

          {trip.summary && (
            <p className="text-sm text-text-secondary leading-relaxed border-t border-[#DDD3C5] pt-4">
              {trip.summary}
            </p>
          )}

          {trip.estimated_budget && (
            <div className="mt-3">
              <span className="text-sm text-text-muted">
                Estimated cost:{' '}
              </span>
              <span className="text-sm font-semibold text-accent-primary">
                {trip.estimated_budget}
              </span>
            </div>
          )}

          {trip.interests?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {trip.interests.map((interest) => (
                <span
                  key={interest}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Weather */}
        {trip.days && trip.days.length > 0 && (
          <div className="mb-6">
            <WeatherStrip days={trip.days} />
          </div>
        )}

        {/* Days */}
        <div className="space-y-6">
          {trip.days?.map((dayObj) => (
            <motion.div
              key={dayObj.day}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: (dayObj.day - 1) * 0.08 }}
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
                    className="flex items-start gap-4 p-4 rounded-2xl bg-white/50 border border-transparent transition-colors"
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

        {/* CTA Footer */}
        <div className="glass-card shadow-soft border border-[#DDD3C5] p-6 mt-8 text-center">
          <Sparkles className="w-8 h-8 text-accent-primary mx-auto mb-3" />
          <h4 className="text-base font-semibold text-text-primary mb-2">
            Plan your own AI-powered trip
          </h4>
          <p className="text-sm text-text-secondary mb-4">
            Create custom itineraries with real-time weather, fatigue
            monitoring, and curated local recommendations.
          </p>
          <Link
            to="/"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Shield className="w-4 h-4" />
            Try SafeRoute AI
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SharedTrip;