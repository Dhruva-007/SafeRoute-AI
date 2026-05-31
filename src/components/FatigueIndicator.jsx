import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity } from 'lucide-react';

function FatigueIndicator({ level = 'LOW', value = 25, compact = false }) {
  const config = {
    LOW: {
      bg: 'bg-success-soft',
      text: 'text-success',
      bar: 'bg-success',
      border: 'border-success/25',
    },
    MEDIUM: {
      bg: 'bg-warning-soft',
      text: 'text-warning',
      bar: 'bg-warning',
      border: 'border-warning/25',
    },
    HIGH: {
      bg: 'bg-danger-soft',
      text: 'text-danger',
      bar: 'bg-danger',
      border: 'border-danger/25',
    },
  };

  const style = config[level] || config.LOW;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${style.bg} border ${style.border}`}>
        <div className="relative">
          <div className={`w-2 h-2 rounded-full ${style.bar}`} />
          {level === 'HIGH' && (
            <div className={`absolute inset-0 w-2 h-2 rounded-full ${style.bar} animate-ping`} />
          )}
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={level}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className={`text-xs font-semibold ${style.text}`}
          >
            {level}
          </motion.span>
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className={`rounded-xl p-4 ${style.bg} border ${style.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${style.text}`} />
          <span className={`text-sm font-medium ${style.text}`}>Fatigue Level</span>
        </div>
        <div className="relative">
          <div className={`w-2.5 h-2.5 rounded-full ${style.bar}`} />
          {level !== 'LOW' && (
            <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${style.bar} animate-ping opacity-75`} />
          )}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={level}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          className={`text-2xl font-bold ${style.text} mb-2`}
        >
          {level}
        </motion.p>
      </AnimatePresence>
      <div className="w-full h-2 rounded-full bg-white/50">
        <motion.div
          className={`h-full rounded-full ${style.bar}`}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <p className="text-xs text-text-secondary mt-2">
        {level === 'LOW' && "You're good to continue your journey."}
        {level === 'MEDIUM' && 'Consider taking a short break soon.'}
        {level === 'HIGH' && 'Rest is strongly recommended.'}
      </p>
    </div>
  );
}

export default FatigueIndicator;