import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, MapPin, Activity } from 'lucide-react';
import { SEVERITY_COLORS, SEVERITY_LABELS, RISK_CATEGORIES } from '../../types/riskZone';

export default function GeofenceAlert({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null;
  
  return (
    <div className="fixed top-20 right-4 left-4 sm:left-auto sm:right-4 sm:max-w-md z-[1000] space-y-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onDismiss={() => onDismiss(alert.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Wrapped with forwardRef to fix Framer Motion warning ───
const AlertCard = forwardRef(({ alert, onDismiss }, ref) => {
  const { zone } = alert;
  const color = SEVERITY_COLORS[zone.severity_level];
  const label = SEVERITY_LABELS[zone.severity_level];
  const category = RISK_CATEGORIES[zone.risk_category];
  
  const isCritical = zone.severity_level === 4;
  
  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`
        pointer-events-auto
        relative overflow-hidden
        glass-card border-l-4
        shadow-2xl
        ${isCritical ? 'animate-pulse-soft' : ''}
      `}
      style={{ borderLeftColor: color }}
    >
      <div className="p-4">
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4 text-text-muted" />
        </button>
        
        <div className="flex items-start gap-3 pr-8">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg"
            style={{ background: `${color}25` }}
          >
            {category?.icon || '⚠️'}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span 
                className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded text-white"
                style={{ background: color }}
              >
                {label}
              </span>
              {zone.is_time_dependent && (
                <span className="text-[10px] uppercase tracking-wider text-amber-400">
                  Time-based
                </span>
              )}
            </div>
            
            <h3 className="text-sm font-semibold text-text-primary mb-1 truncate">
              {zone.name}
            </h3>
            
            <p className="text-xs text-text-secondary leading-relaxed">
              {zone.alert_message}
            </p>
            
            <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Score: {zone.risk_score.toFixed(2)}
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {category?.label || zone.risk_category}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

AlertCard.displayName = 'AlertCard';