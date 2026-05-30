import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useGeofencingContext } from '../../context/GeofencingContext';
import { SEVERITY_COLORS, SEVERITY_LABELS, RISK_CATEGORIES } from '../../types/riskZone';

export default function CurrentZoneAlert() {
  const { activeAlerts } = useGeofencingContext();
  
  if (activeAlerts.length === 0) return null;
  
  const topAlert = activeAlerts[0];
  const zone = topAlert.zone;
  const color = SEVERITY_COLORS[zone.severity_level];
  const category = RISK_CATEGORIES[zone.risk_category];
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        className="glass-card p-4 mb-6 border-2 relative overflow-hidden"
        style={{ borderColor: color }}
      >
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            background: `radial-gradient(circle at top right, ${color}, transparent)`
          }}
        />
        
        <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20">
          <div 
            className="w-full h-full rounded-full animate-ping"
            style={{ background: color }}
          />
        </div>
        
        <div className="relative flex items-center gap-4">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl animate-pulse"
            style={{ background: `${color}25`, border: `2px solid ${color}` }}
          >
            {category?.icon || '⚠️'}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <AlertTriangle className="w-3.5 h-3.5" style={{ color }} />
              <span 
                className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded text-white"
                style={{ background: color }}
              >
                {SEVERITY_LABELS[zone.severity_level]} Risk Zone Active
              </span>
              {activeAlerts.length > 1 && (
                <span className="text-[10px] text-text-muted">
                  +{activeAlerts.length - 1} more
                </span>
              )}
            </div>
            
            <h3 className="text-sm font-bold text-text-primary truncate">
              {zone.name}
            </h3>
            
            <p className="text-xs text-text-secondary mt-1 line-clamp-1">
              {zone.alert_message}
            </p>
          </div>
          
          <Link 
            to="/safety-map"
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] rounded-lg text-xs font-medium text-text-primary transition-colors"
          >
            View
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}