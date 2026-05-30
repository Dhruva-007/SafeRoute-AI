import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

function StatCard({ icon: Icon, label, value, trend, delay = 0 }) {
  const hasTrend = trend !== undefined && trend !== null;
  const isPositive = trend > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass-card p-5 sm:p-6"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-accent-primary" />
        </div>
        {hasTrend && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 border ${
              isPositive
                ? 'bg-success-soft text-success border-success/20'
                : 'bg-danger-soft text-danger border-danger/20'
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {isPositive ? '+' : ''}
            {trend}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-text-primary mb-1">{value}</p>
      <p className="text-sm text-text-secondary">{label}</p>
    </motion.div>
  );
}

export default StatCard;