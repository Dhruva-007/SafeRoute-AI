import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  History, AlertTriangle, Trash2, Download, Clock, 
  ChevronDown, ChevronUp, MapPin, Activity
} from 'lucide-react';
import alertHistoryService from '../services/alertHistory';
import { SEVERITY_COLORS, SEVERITY_LABELS, RISK_CATEGORIES } from '../types/riskZone';

export default function AlertHistorySection() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  
  useEffect(() => {
    loadAlerts();
  }, []);
  
  const loadAlerts = async () => {
    setLoading(true);
    try {
      const [allAlerts, statistics] = await Promise.all([
        alertHistoryService.getAllAlerts(),
        alertHistoryService.getStatistics(),
      ]);
      setAlerts(allAlerts);
      setStats(statistics);
    } catch (e) {
      console.error('Failed to load alerts:', e);
    } finally {
      setLoading(false);
    }
  };
  
  const handleClearHistory = async () => {
    try {
      await alertHistoryService.clearHistory();
      setShowConfirmClear(false);
      await loadAlerts();
    } catch (e) {
      alert('Failed to clear: ' + e.message);
    }
  };
  
  const handleExportCSV = async () => {
    try {
      const csv = await alertHistoryService.exportAsCSV();
      if (!csv) return;
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `saferoute-alerts-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  };
  
  const filteredAlerts = useMemo(() => {
    if (filterSeverity === 'all') return alerts;
    return alerts.filter(a => a.severity_level === parseInt(filterSeverity));
  }, [alerts, filterSeverity]);
  
  const visibleAlerts = showAll ? filteredAlerts : filteredAlerts.slice(0, 5);
  
  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-5 h-5 text-text-muted" />
          <h3 className="text-base font-semibold text-text-primary">Alert History</h3>
        </div>
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-border-subtle border-t-accent-primary rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-text-muted" />
          <h3 className="text-base font-semibold text-text-primary">Safety Alert History</h3>
        </div>
        {alerts.length > 0 && (
          <span className="text-xs text-text-muted">
            {alerts.length} total
          </span>
        )}
      </div>
      
      {/* Empty state */}
      {alerts.length === 0 ? (
        <div className="text-center py-8">
          <History className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm text-text-secondary mb-1">No alerts yet</p>
          <p className="text-xs text-text-muted">
            Alerts will appear here as you travel through risk zones.
          </p>
        </div>
      ) : (
        <>
          {/* Quick Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-border-subtle text-center">
                <div className="text-xs text-text-muted mb-1 uppercase tracking-wide">Last 24h</div>
                <div className="text-lg font-bold text-text-primary">{stats.last24Hours}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-border-subtle text-center">
                <div className="text-xs text-text-muted mb-1 uppercase tracking-wide">Last 7d</div>
                <div className="text-lg font-bold text-text-primary">{stats.lastWeek}</div>
              </div>
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-center">
                <div className="text-xs text-text-muted mb-1 uppercase tracking-wide">Critical</div>
                <div className="text-lg font-bold text-red-400">
                  {stats.bySeverity[4] || 0}
                </div>
              </div>
            </div>
          )}
          
          {/* Severity Distribution Bar */}
          {stats && stats.total > 0 && (
            <div className="mb-4">
              <div className="flex h-1.5 rounded-full overflow-hidden bg-white/[0.04]">
                {[4, 3, 2, 1].map(level => {
                  const count = stats.bySeverity[level] || 0;
                  const percentage = (count / stats.total) * 100;
                  if (percentage === 0) return null;
                  return (
                    <div 
                      key={level}
                      style={{ 
                        width: `${percentage}%`, 
                        background: SEVERITY_COLORS[level]
                      }}
                      title={`${SEVERITY_LABELS[level]}: ${count} (${percentage.toFixed(0)}%)`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2 text-[10px] text-text-muted">
                <div className="flex items-center gap-3">
                  {[4, 3, 2, 1].map(level => (
                    <div key={level} className="flex items-center gap-1">
                      <div 
                        className="w-1.5 h-1.5 rounded-full" 
                        style={{ background: SEVERITY_COLORS[level] }}
                      />
                      <span>{SEVERITY_LABELS[level]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Filter & Actions */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-2.5 py-1 bg-white/[0.04] border border-border-subtle rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent-primary/40"
            >
              <option value="all">All Severities</option>
              <option value="4">Critical</option>
              <option value="3">High</option>
              <option value="2">Medium</option>
              <option value="1">Low</option>
            </select>
            
            <div className="flex-1" />
            
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs rounded-lg border border-blue-500/30 transition-colors"
            >
              <Download className="w-3 h-3" />
              Export
            </button>
            
            <button
              onClick={() => setShowConfirmClear(true)}
              className="flex items-center gap-1 px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded-lg border border-red-500/30 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
          
          {/* Confirm Clear Modal */}
          <AnimatePresence>
            {showConfirmClear && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 p-3 bg-red-500/5 border border-red-500/20 rounded-xl"
              >
                <p className="text-xs text-red-300 mb-2">
                  Permanently delete all {alerts.length} alerts? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClearHistory}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Yes, Delete All
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="px-3 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-text-primary text-xs font-medium rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Alert List */}
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-text-muted">No alerts match this filter</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleAlerts.map((alert, idx) => (
                  <CompactAlertCard 
                    key={alert.id} 
                    alert={alert}
                    index={idx}
                  />
                ))}
              </div>
              
              {/* Show More / Less Button */}
              {filteredAlerts.length > 5 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="w-full mt-3 py-2 text-xs text-text-muted hover:text-text-primary transition-colors flex items-center justify-center gap-1"
                >
                  {showAll ? (
                    <>
                      Show Less <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Show All ({filteredAlerts.length}) <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function CompactAlertCard({ alert, index }) {
  const [expanded, setExpanded] = useState(false);
  const color = SEVERITY_COLORS[alert.severity_level];
  const label = SEVERITY_LABELS[alert.severity_level];
  const category = RISK_CATEGORIES[alert.risk_category];
  
  const formatTime = (timestamp) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return new Date(timestamp).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="rounded-xl bg-white/[0.02] border border-border-subtle hover:border-border-subtle/80 transition-all overflow-hidden"
    >
      <div 
        className="p-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
            style={{ background: `${color}20`, border: `1px solid ${color}40` }}
          >
            {category?.icon || '⚠️'}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span 
                className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded text-white"
                style={{ background: color }}
              >
                {label}
              </span>
              <span className="text-[10px] text-text-muted truncate">
                {category?.label || alert.risk_category}
              </span>
            </div>
            <p className="text-xs font-medium text-text-primary truncate">
              {alert.zone_name}
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-text-muted whitespace-nowrap">
              {formatTime(alert.timestamp)}
            </span>
            <ChevronDown 
              className={`w-3.5 h-3.5 text-text-muted transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>
        
        {/* Expanded Details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t border-border-subtle space-y-2"
            >
              <p className="text-xs text-text-secondary leading-relaxed">
                {alert.alert_message}
              </p>
              
              <div className="flex items-center gap-4 text-[10px] text-text-muted">
                <div className="flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Score: {alert.risk_score?.toFixed(2) || 'N/A'}
                </div>
                {alert.user_lat && (
                  <div className="flex items-center gap-1 font-mono">
                    <MapPin className="w-3 h-3" />
                    {alert.user_lat.toFixed(4)}, {alert.user_lon.toFixed(4)}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(alert.timestamp).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}