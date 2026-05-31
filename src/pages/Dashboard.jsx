import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import {
  LayoutDashboard, Navigation, Map, Clock, TrendingUp, MapPin,
  AlertTriangle, ChevronRight, Compass, Calendar, Zap, Activity,
  Bell, Globe2, CalendarDays, Sparkles, Loader2,
} from 'lucide-react';
import CurrentZoneAlert from '../components/Dashboard/CurrentZoneAlert';
import CompactSafetyWidgets from '../components/Dashboard/CompactSafetyWidgets';
import { fetchTrips } from '../services/trips';
import { fetchCurrentFatigue } from '../services/fatigue';
import alertHistoryService from '../services/alertHistory';
import { useGeofencingContext } from '../context/GeofencingContext';

// ──────────────────────────────────────────────
// Fatigue level color mapping — themed, not loud
// ──────────────────────────────────────────────

const FATIGUE_STYLE = {
  LOW: {
    bg: 'bg-success-soft',
    text: 'text-success',
    border: 'border-success/25',
    bar: 'bg-success',
  },
  MEDIUM: {
    bg: 'bg-warning-soft',
    text: 'text-warning',
    border: 'border-warning/25',
    bar: 'bg-warning',
  },
  HIGH: {
    bg: 'bg-danger-soft',
    text: 'text-danger',
    border: 'border-danger/25',
    bar: 'bg-danger',
  },
};

const STATUS_STYLE = {
  completed: 'bg-success-soft text-success border border-success/25',
  active: 'bg-accent-primary/10 text-accent-primary border border-accent-primary/25',
  planned: 'bg-info-soft text-info border border-info/25',
  upcoming: 'bg-info-soft text-info border border-info/25',
  planning: 'bg-warning-soft text-warning border border-warning/25',
};

const STATUS_LABEL = {
  completed: 'Completed',
  active: 'Active',
  planned: 'Planned',
};

function Dashboard() {
  const { user } = useAuth();
  const { activeAlerts } = useGeofencingContext();

  // ── Data state ─────────────────────────────────
  const [trips, setTrips] = useState([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripsError, setTripsError] = useState(null);

  const [alertCount, setAlertCount] = useState(null);
  const [alertStats, setAlertStats] = useState(null);

  const [fatigueData, setFatigueData] = useState(null);
  const [fatigueLoading, setFatigueLoading] = useState(true);

  // ── Load trips ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setTripsLoading(true);
      try {
        const data = await fetchTrips();
        if (!cancelled) {
          setTrips(data);
          setTripsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTrips([]);
          setTripsError(err.message);
        }
      } finally {
        if (!cancelled) setTripsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Load alert history ─────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [count, stats] = await Promise.all([
          alertHistoryService.getAlertCount().catch(() => 0),
          alertHistoryService.getStatistics().catch(() => null),
        ]);
        if (!cancelled) {
          setAlertCount(count);
          setAlertStats(stats);
        }
      } catch {
        if (!cancelled) {
          setAlertCount(0);
          setAlertStats(null);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Derive: active or most recent trip for fatigue ─────────
  const focusTrip = useMemo(() => {
    if (!trips || trips.length === 0) return null;
    // Prefer active, then planned (closest upcoming), then most recent
    const active = trips.find((t) => t.status === 'active');
    if (active) return active;
    const planned = trips.find((t) => t.status === 'planned');
    if (planned) return planned;
    return trips[0]; // already sorted newest first by backend
  }, [trips]);

  // ── Load fatigue for the focus trip's first activity of day 1 ──
  useEffect(() => {
    let cancelled = false;

    if (!focusTrip?.id) {
      setFatigueData(null);
      setFatigueLoading(false);
      return;
    }

    (async () => {
      setFatigueLoading(true);
      try {
        const data = await fetchCurrentFatigue(focusTrip.id, 1, 0);
        if (!cancelled) setFatigueData(data);
      } catch {
        if (!cancelled) setFatigueData(null);
      } finally {
        if (!cancelled) setFatigueLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [focusTrip?.id]);

  // ── Derived stats ─────────────────────────────
  const stats = useMemo(() => {
    const totalTrips = trips.length;
    const completedCount = trips.filter((t) => t.status === 'completed').length;
    const plannedCount = trips.filter((t) => t.status === 'planned').length;
    const uniqueDestinations = new Set(
      trips.map((t) => t.destination?.toLowerCase().trim()).filter(Boolean),
    ).size;

    const now = new Date();
    const thisMonth = trips.filter((t) => {
      try {
        const d = new Date(t.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      } catch {
        return false;
      }
    }).length;

    return {
      totalTrips,
      completedCount,
      plannedCount,
      uniqueDestinations,
      thisMonth,
    };
  }, [trips]);

  // ── Recent trips for display ─────────────────
  const recentTrips = useMemo(() => {
    return trips.slice(0, 3);
  }, [trips]);

  // ── Format helpers ────────────────────────────
  const formatDateRange = (start, end) => {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const opts = { month: 'short', day: 'numeric' };
      const sameYear = s.getFullYear() === e.getFullYear();
      const startStr = s.toLocaleDateString('en-US', opts);
      const endStr = e.toLocaleDateString('en-US', {
        ...opts,
        year: sameYear ? 'numeric' : 'numeric',
      });
      return `${startStr} – ${endStr}`;
    } catch {
      return `${start} – ${end}`;
    }
  };

  const quickActions = [
    { to: '/plan-tour', label: 'Plan New Trip', icon: Compass, color: 'text-accent-primary' },
    { to: '/safety-map', label: 'View Safety Map', icon: Map, color: 'text-success' },
    { to: '/sos', label: 'SOS Center', icon: AlertTriangle, color: 'text-danger' },
    { to: '/translator', label: 'Translator', icon: Zap, color: 'text-info' },
  ];

  // ── Insights text — computed from real data ─────────────
  const insightText = useMemo(() => {
    if (tripsLoading) return 'Loading your travel data...';
    if (stats.totalTrips === 0) {
      return "Plan your first trip to start building your travel safety profile.";
    }
    const parts = [];
    parts.push(`You have ${stats.totalTrips} trip${stats.totalTrips === 1 ? '' : 's'} on record`);
    if (stats.uniqueDestinations > 0) {
      parts.push(`across ${stats.uniqueDestinations} destination${stats.uniqueDestinations === 1 ? '' : 's'}`);
    }
    if (alertStats?.last24Hours > 0) {
      parts.push(`with ${alertStats.last24Hours} safety alert${alertStats.last24Hours === 1 ? '' : 's'} in the last 24 hours`);
    }
    return parts.join(' ') + '.';
  }, [tripsLoading, stats, alertStats]);

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={LayoutDashboard}
          title={`Welcome back, ${user?.name || 'Traveler'}`}
          subtitle="An overview of your travel activity and safety status."
        />

        <CurrentZoneAlert />

        {/* ─── Top 4 stat cards ──────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <StatCard
            icon={Navigation}
            label="Total Trips"
            value={tripsLoading ? '—' : String(stats.totalTrips)}
            loading={tripsLoading}
            delay={0.1}
          />

          {/* Fatigue card — real data from backend */}
          <DashboardFatigueCard
            loading={fatigueLoading}
            fatigueData={fatigueData}
            focusTrip={focusTrip}
          />

          <StatCard
            icon={Globe2}
            label="Destinations"
            value={tripsLoading ? '—' : String(stats.uniqueDestinations)}
            loading={tripsLoading}
            delay={0.3}
          />

          <StatCard
            icon={Bell}
            label="Total Alerts"
            value={alertCount === null ? '—' : String(alertCount)}
            loading={alertCount === null}
            delay={0.4}
          />
        </div>

        <CompactSafetyWidgets />

        {/* ─── Real trip stats summary ──────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="glass-card p-5 mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent-primary" />
            <span className="text-sm font-semibold text-text-primary">
              Trip Activity
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Compass, label: 'Total', value: stats.totalTrips },
              { icon: CalendarDays, label: 'This Month', value: stats.thisMonth },
              { icon: MapPin, label: 'Planned', value: stats.plannedCount },
              { icon: AlertTriangle, label: 'Active Zones', value: activeAlerts.length },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl bg-white/65 border border-[#DDD3C5] p-4 text-center"
              >
                <item.icon className="w-5 h-5 text-accent-primary mx-auto mb-2" />
                <p className="text-xl font-bold text-text-primary">
                  {tripsLoading ? '—' : item.value}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ─── Recent Trips + Quick Actions ─────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Trips */}
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
                  Your latest planned and completed itineraries
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

            {tripsLoading ? (
              <RecentTripsSkeleton />
            ) : tripsError ? (
              <EmptyTripsState
                title="Could not load trips"
                description={tripsError}
              />
            ) : recentTrips.length === 0 ? (
              <EmptyTripsState
                title="No trips yet"
                description="Plan your first trip to see it here."
              />
            ) : (
              <div className="space-y-4">
                {recentTrips.map((trip, index) => (
                  <motion.div
                    key={trip.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 + index * 0.08 }}
                  >
                    <Link
                      to="/my-trips"
                      className="block rounded-2xl bg-white/65 border border-[#DDD3C5] p-5 hover:border-accent-primary/40 hover:shadow-soft transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-base font-semibold text-text-primary mb-1 truncate">
                            {trip.destination || 'Untitled Trip'}
                          </h4>
                          <div className="flex items-center gap-2 text-sm text-text-secondary mb-2">
                            <Calendar className="w-4 h-4 shrink-0" />
                            <span className="truncate">
                              {formatDateRange(trip.start_date, trip.end_date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-text-muted">
                            <span>{trip.duration_days} day{trip.duration_days === 1 ? '' : 's'}</span>
                            <span className="capitalize">{trip.budget_level}</span>
                            <span>{trip.number_of_travelers} traveler{trip.number_of_travelers === 1 ? '' : 's'}</span>
                          </div>
                        </div>

                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                            STATUS_STYLE[trip.status] || STATUS_STYLE.planned
                          }`}
                        >
                          {STATUS_LABEL[trip.status] || 'Planned'}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="glass-card p-6 sm:p-7"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-text-primary">Quick Actions</h3>
              <p className="text-sm text-text-secondary mt-1">Fast access to core tools</p>
            </div>

            <div className="space-y-3">
              {quickActions.map((action, index) => (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.6 + index * 0.07 }}
                >
                  <Link
                    to={action.to}
                    className="group flex items-center justify-between rounded-2xl bg-white/65 border border-[#DDD3C5] p-4 hover:border-accent-primary/40 hover:shadow-soft transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-white border border-[#DDD3C5] flex items-center justify-center shadow-soft">
                        <action.icon className={`w-5 h-5 ${action.color}`} />
                      </div>
                      <span className="text-sm font-medium text-text-primary">{action.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary transition-colors" />
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Fatigue mini in quick actions — themed */}
            <div className="mt-6 pt-6 border-t border-[#DDD3C5]">
              <DashboardFatigueMiniCard
                loading={fatigueLoading}
                fatigueData={fatigueData}
                focusTrip={focusTrip}
              />
            </div>
          </motion.div>
        </div>

        {/* ─── Travel Insights — real numbers ────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.75 }}
          className="glass-card p-6 sm:p-8 mt-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-accent-primary/7 via-transparent to-accent-soft/8" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl bg-white border border-[#DDD3C5] flex items-center justify-center shadow-soft">
                  <Sparkles className="w-5 h-5 text-accent-primary" />
                </div>
                <h3 className="text-lg font-semibold text-text-primary">Your Travel Snapshot</h3>
              </div>
              <p className="text-text-secondary max-w-2xl leading-relaxed">
                {insightText}
              </p>
            </div>

            <Link to="/plan-tour" className="btn-primary flex items-center gap-2 shrink-0">
              {stats.totalTrips === 0 ? 'Plan First Trip' : 'Plan Next Trip'}
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Fatigue card — top row (replaces fake one)
// ─────────────────────────────────────────────

function DashboardFatigueCard({ loading, fatigueData, focusTrip }) {
  const level = fatigueData?.fatigue_level || 'LOW';
  const score = fatigueData?.fatigue_score ?? 0;
  const style = FATIGUE_STYLE[level] || FATIGUE_STYLE.LOW;
  const hasData = fatigueData && focusTrip;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card p-5 sm:p-6 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/[0.04] via-transparent to-transparent" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`w-10 h-10 rounded-xl ${style.bg} flex items-center justify-center border ${style.border}`}
          >
            <Activity className={`w-5 h-5 ${style.text}`} />
          </div>

          {hasData && (
            <div className={`relative w-2.5 h-2.5 rounded-full ${style.bar}`}>
              <div className={`absolute inset-0 rounded-full ${style.bar} animate-ping opacity-60`} />
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-8 w-20 bg-[#EDE5DA] rounded animate-pulse mb-1"
            />
          ) : !hasData ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-lg font-bold text-text-secondary mb-1">— —</p>
            </motion.div>
          ) : (
            <motion.p
              key={level}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={`text-2xl font-bold ${style.text} mb-1`}
            >
              {level}
            </motion.p>
          )}
        </AnimatePresence>

        <p className="text-sm text-text-secondary">
          {hasData ? 'Fatigue Level' : 'No active trip'}
        </p>

        <div className="mt-4 w-full h-2 rounded-full bg-[#EDE5DA] overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${hasData ? style.bar : 'bg-[#DDD3C5]'}`}
            initial={{ width: 0 }}
            animate={{ width: hasData ? `${score}%` : '0%' }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Fatigue mini card — inside Quick Actions
// ─────────────────────────────────────────────

function DashboardFatigueMiniCard({ loading, fatigueData, focusTrip }) {
  const level = fatigueData?.fatigue_level || 'LOW';
  const score = fatigueData?.fatigue_score ?? 0;
  const style = FATIGUE_STYLE[level] || FATIGUE_STYLE.LOW;
  const hasData = fatigueData && focusTrip;

  const tip = !hasData
    ? 'Plan or open a trip to see live fatigue.'
    : level === 'LOW'
    ? "You're good to continue your journey."
    : level === 'MEDIUM'
    ? 'Consider taking a short break soon.'
    : 'Rest is strongly recommended.';

  return (
    <div className={`rounded-xl p-4 ${style.bg} border ${style.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${style.text}`} />
          <span className={`text-sm font-medium ${style.text}`}>Fatigue Level</span>
        </div>
        {hasData && (
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${style.bar}`} />
            {level === 'HIGH' && (
              <div className={`absolute inset-0 w-2 h-2 rounded-full ${style.bar} animate-ping opacity-75`} />
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <div className="h-7 w-16 bg-white/40 rounded animate-pulse mb-2" />
        ) : (
          <motion.p
            key={hasData ? level : 'empty'}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={`text-xl font-bold ${hasData ? style.text : 'text-text-secondary'} mb-2`}
          >
            {hasData ? level : '— —'}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="w-full h-1.5 rounded-full bg-white/50">
        <motion.div
          className={`h-full rounded-full ${hasData ? style.bar : 'bg-[#DDD3C5]'}`}
          animate={{ width: hasData ? `${score}%` : '0%' }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      <p className="text-xs text-text-secondary mt-2 leading-relaxed">
        {tip}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Skeletons & Empty states
// ─────────────────────────────────────────────

function RecentTripsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-2xl bg-white/40 border border-[#DDD3C5] p-5 animate-pulse"
        >
          <div className="h-4 w-1/3 bg-[#EDE5DA] rounded mb-3" />
          <div className="h-3 w-1/2 bg-[#EDE5DA] rounded mb-2" />
          <div className="h-3 w-1/4 bg-[#EDE5DA] rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyTripsState({ title, description }) {
  return (
    <div className="rounded-2xl bg-white/40 border border-dashed border-[#DDD3C5] p-8 text-center">
      <Compass className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-60" />
      <p className="text-sm font-semibold text-text-primary mb-1">{title}</p>
      <p className="text-xs text-text-muted mb-4">{description}</p>
      <Link to="/plan-tour" className="btn-primary inline-flex items-center gap-2 text-sm !py-2.5 !px-5">
        <Compass className="w-4 h-4" />
        Plan a Trip
      </Link>
    </div>
  );
}

export default Dashboard;