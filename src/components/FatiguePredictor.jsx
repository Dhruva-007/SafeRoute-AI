import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, Route, Mountain, Thermometer, Zap,
  Users, AlertCircle, CheckCircle, AlertTriangle, 
  TrendingUp, Clock, Heart
} from 'lucide-react';

function FatiguePredictor() {
  const [metrics, setMetrics] = useState({
    distance: 4.2,
    elevation: 120,
    temperature: 24,
    activityLevel: 2,
    groupSize: 3,
  });

  const [fatigueResult, setFatigueResult] = useState({
    level: 'LOW',
    value: 25,
    trend: 'stable',
  });

  const [history, setHistory] = useState([25, 28, 22, 30, 25]);

  const activityLabels = ['Light', 'Moderate', 'Intense', 'Extreme'];

  // Fatigue calculation logic
  const calculateFatigue = useCallback((m) => {
    let score = 0;

    // Distance factor (0-25)
    score += Math.min(25, (m.distance / 15) * 25);

    // Elevation factor (0-25)
    score += Math.min(25, (m.elevation / 800) * 25);

    // Temperature factor (0-20) - both extremes increase fatigue
    const tempDeviation = Math.abs(m.temperature - 22);
    score += Math.min(20, (tempDeviation / 15) * 20);

    // Activity level factor (0-20)
    score += (m.activityLevel / 3) * 20;

    // Group size factor (0-10) - larger groups move slower, less fatigue from pace
    score += Math.max(0, 10 - m.groupSize * 1.5);

    score = Math.max(5, Math.min(95, score));

    let level;
    if (score < 35) level = 'LOW';
    else if (score < 65) level = 'MEDIUM';
    else level = 'HIGH';

    return { level, value: Math.round(score) };
  }, []);

  // Simulate real-time metric updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => {
        const newMetrics = {
          distance: Math.max(0.5, +(prev.distance + (Math.random() - 0.4) * 1.5).toFixed(1)),
          elevation: Math.max(0, Math.round(prev.elevation + (Math.random() - 0.45) * 60)),
          temperature: Math.max(-5, Math.min(45, Math.round(prev.temperature + (Math.random() - 0.5) * 3))),
          activityLevel: Math.max(0, Math.min(3, prev.activityLevel + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0))),
          groupSize: Math.max(1, Math.min(8, prev.groupSize + (Math.random() > 0.85 ? (Math.random() > 0.5 ? 1 : -1) : 0))),
        };

        const result = calculateFatigue(newMetrics);
        
        setFatigueResult(prev => ({
          ...result,
          trend: result.value > prev.value ? 'rising' : result.value < prev.value ? 'falling' : 'stable',
        }));

        setHistory(prev => [...prev.slice(-9), result.value]);

        return newMetrics;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [calculateFatigue]);

  const fatigueColors = {
    LOW: {
      bg: 'bg-green-500/10', text: 'text-green-400', bar: 'bg-green-500',
      border: 'border-green-500/20', ring: 'ring-green-500/30',
      icon: CheckCircle, label: 'Good to Go',
    },
    MEDIUM: {
      bg: 'bg-amber-500/10', text: 'text-amber-400', bar: 'bg-amber-500',
      border: 'border-amber-500/20', ring: 'ring-amber-500/30',
      icon: AlertCircle, label: 'Moderate Strain',
    },
    HIGH: {
      bg: 'bg-red-500/10', text: 'text-red-400', bar: 'bg-red-500',
      border: 'border-red-500/20', ring: 'ring-red-500/30',
      icon: AlertTriangle, label: 'Rest Needed',
    },
  };

  const currentStyle = fatigueColors[fatigueResult.level];
  const StatusIcon = currentStyle.icon;

  const metricCards = [
    { icon: Route, label: 'Distance', value: `${metrics.distance} km`, color: 'text-blue-400' },
    { icon: Mountain, label: 'Elevation', value: `${metrics.elevation} m`, color: 'text-emerald-400' },
    { icon: Thermometer, label: 'Temperature', value: `${metrics.temperature}°C`, color: 'text-orange-400' },
    { icon: Zap, label: 'Activity', value: activityLabels[metrics.activityLevel], color: 'text-purple-400' },
    { icon: Users, label: 'Group Size', value: `${metrics.groupSize} pax`, color: 'text-cyan-400' },
  ];

  const recommendations = {
    LOW: {
      title: "You're good to continue your journey.",
      tips: [
        'Keep hydrated and maintain your current pace.',
        'Next recommended break in ~45 minutes.',
        'Conditions are favorable for exploration.',
      ],
    },
    MEDIUM: {
      title: 'Consider taking a short break soon.',
      tips: [
        'Reduce walking speed by 20%.',
        'Find a rest spot within the next 15 minutes.',
        'Hydrate and consume a light snack.',
      ],
    },
    HIGH: {
      title: 'High fatigue detected. Rest is strongly recommended.',
      tips: [
        'Stop and rest for at least 20 minutes immediately.',
        'Find shade or a cool resting area.',
        'Rehydrate and assess before continuing.',
        'Consider shortening today\'s itinerary.',
      ],
    },
  };

  const currentRec = recommendations[fatigueResult.level];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary">Fatigue Predictor</h2>
            <p className="text-sm text-text-secondary">Real-time travel fatigue analysis</p>
          </div>
        </div>
      </div>

      {/* Input Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metricCards.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className="glass-card p-4"
          >
            <metric.icon className={`w-4.5 h-4.5 ${metric.color} mb-2`} />
            <p className="text-xs text-text-muted mb-0.5">{metric.label}</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={metric.value}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-base font-bold text-text-primary"
              >
                {metric.value}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Main Fatigue Result */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gauge */}
        <motion.div
          layout
          className={`glass-card p-6 sm:p-8 relative overflow-hidden`}
        >
          <div className={`absolute top-0 left-0 right-0 h-1 ${currentStyle.bar}/60`} />

          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-text-secondary mb-1">Current Fatigue Level</p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={fatigueResult.level}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3"
                >
                  <span className={`text-3xl sm:text-4xl font-extrabold ${currentStyle.text}`}>
                    {fatigueResult.level}
                  </span>
                  <StatusIcon className={`w-6 h-6 ${currentStyle.text}`} />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="text-right">
              <p className="text-sm text-text-muted">Score</p>
              <AnimatePresence mode="wait">
                <motion.p
                  key={fatigueResult.value}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-2xl font-bold text-text-primary"
                >
                  {fatigueResult.value}
                  <span className="text-sm text-text-muted font-normal">/100</span>
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${currentStyle.bar}/80`}
                animate={{ width: `${fatigueResult.value}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-green-400/70">Low</span>
              <span className="text-xs text-amber-400/70">Medium</span>
              <span className="text-xs text-red-400/70">High</span>
            </div>
          </div>

          {/* Mini Chart - Trend */}
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-text-muted flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Trend
              </span>
              <span className={`text-xs font-medium ${
                fatigueResult.trend === 'rising' ? 'text-red-400' :
                fatigueResult.trend === 'falling' ? 'text-green-400' :
                'text-text-muted'
              }`}>
                {fatigueResult.trend === 'rising' ? '↑ Rising' :
                 fatigueResult.trend === 'falling' ? '↓ Falling' : '→ Stable'}
              </span>
            </div>
            <div className="flex items-end gap-1 h-12">
              {history.map((val, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(8, (val / 100) * 100)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.03 }}
                  className={`flex-1 rounded-sm ${
                    val < 35 ? 'bg-green-500/50' :
                    val < 65 ? 'bg-amber-500/50' :
                    'bg-red-500/50'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-ping" />
            </div>
            <span className="text-xs text-text-muted">Live monitoring</span>
          </div>
        </motion.div>

        {/* Recommendation Box */}
        <motion.div
          layout
          className="glass-card p-6 sm:p-8"
        >
          <div className="flex items-center gap-2 mb-5">
            <Heart className="w-5 h-5 text-accent-primary" />
            <h3 className="text-base font-semibold text-text-primary">Recommendations</h3>
          </div>

          <div className={`p-4 rounded-xl ${currentStyle.bg} border ${currentStyle.border} mb-5`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={fatigueResult.level}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <StatusIcon className={`w-4 h-4 ${currentStyle.text}`} />
                  <span className={`text-sm font-semibold ${currentStyle.text}`}>{currentStyle.label}</span>
                </div>
                <p className="text-sm text-text-primary font-medium">{currentRec.title}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={fatigueResult.level}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="space-y-3"
            >
              {currentRec.tips.map((tip, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]"
                >
                  <div className="w-5 h-5 rounded-full bg-accent-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-accent-primary">{i + 1}</span>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">{tip}</p>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Time suggestion */}
          <div className="mt-5 pt-4 border-t border-border-subtle flex items-center gap-2">
            <Clock className="w-4 h-4 text-text-muted" />
            <span className="text-xs text-text-muted">
              {fatigueResult.level === 'LOW' ? 'Next break suggested in ~45 min' :
               fatigueResult.level === 'MEDIUM' ? 'Break suggested in ~15 min' :
               'Immediate rest recommended'}
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default FatiguePredictor;