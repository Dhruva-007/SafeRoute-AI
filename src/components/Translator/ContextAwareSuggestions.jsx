import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  MapPin,
  Volume2,
  Copy,
  Check,
  Hospital,
  ShieldAlert,
  Train,
  ShoppingBag,
  Utensils,
  Hotel,
  Compass,
  Heart,
  ArrowRight,
  AlertTriangle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useDatabase } from '../../hooks/useDatabase';
import { useGeofencingContext } from '../../context/GeofencingContext';
import {
  getPhrasesByCategory,
  getLanguageMeta,
  getContextRules,
  getCategories,
} from '../../services/translator';
import { speak, stopSpeaking, isTtsSupported, hasVoiceFor } from '../../utils/tts';

const CONTEXT_RADIUS_KM = 0.5;
const MAX_SUGGESTED_PHRASES = 4;

const CONTEXT_DISPLAY = {
  near_hospital:   { icon: Hospital,    label: 'Near a hospital',           color: 'danger' },
  near_pharmacy:   { icon: Heart,       label: 'Near a pharmacy',           color: 'danger' },
  near_police:     { icon: ShieldAlert, label: 'Near a police station',     color: 'accent-primary' },
  near_restaurant: { icon: Utensils,    label: 'Near restaurants',          color: 'accent-primary' },
  near_hotel:      { icon: Hotel,       label: 'Near a hotel',              color: 'accent-primary' },
  near_station:    { icon: Train,       label: 'Near a transit station',    color: 'accent-primary' },
  near_market:     { icon: ShoppingBag, label: 'Near a market',             color: 'accent-primary' },
  in_risk_zone:    { icon: AlertTriangle, label: 'In a risk zone',          color: 'danger' },
  default:         { icon: Compass,     label: 'General travel',            color: 'accent-primary' },
};

const COLOR_CLASSES = {
  danger: {
    bg: 'bg-danger-soft',
    border: 'border-danger/25',
    text: 'text-danger',
    iconBg: 'bg-danger/15',
  },
  'accent-primary': {
    bg: 'bg-accent-primary/10',
    border: 'border-accent-primary/25',
    text: 'text-accent-primary',
    iconBg: 'bg-accent-primary/15',
  },
};

/**
 * Detect context from nearby services and active alerts.
 * Returns array of context keys in priority order.
 */
function detectContexts({ nearbyServices, activeAlerts }) {
  const contexts = [];

  // Risk zones first (highest priority)
  if (activeAlerts && activeAlerts.length > 0) {
    contexts.push('in_risk_zone');
  }

  if (nearbyServices && nearbyServices.length > 0) {
    const types = new Set(nearbyServices.map((s) => s.service_type));
    if (types.has('hospital') || types.has('clinic')) contexts.push('near_hospital');
    if (types.has('pharmacy_24h')) contexts.push('near_pharmacy');
    if (types.has('police')) contexts.push('near_police');
    // We don't have restaurant/hotel/market in emergency_services DB,
    // those would come from a separate POI lookup. Keeping logic ready for it.
  }

  // Always include default
  contexts.push('default');

  return contexts;
}

/**
 * Map detected contexts to phrase categories using the rules from JSON.
 * Returns ordered unique category IDs.
 */
function contextsToCategories(contexts) {
  const rules = getContextRules();
  const seen = new Set();
  const ordered = [];

  for (const ctx of contexts) {
    const rule = rules.find((r) => r.context === ctx);
    if (!rule) continue;
    for (const cat of rule.categories) {
      if (!seen.has(cat)) {
        seen.add(cat);
        ordered.push(cat);
      }
    }
  }

  return ordered;
}

/* ============================================================ */
/* Main component                                               */
/* ============================================================ */

function ContextAwareSuggestions({
  targetLang = 'hi',
  sourceLang = 'en',
  onPhraseSelect,
  onCategoryClick,
}) {
  const { db, isReady } = useDatabase();
  const { currentLocation, activeAlerts } = useGeofencingContext();

  const [nearbyServices, setNearbyServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [copiedId, setCopiedId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);

  const targetMeta = getLanguageMeta(targetLang);

  /* -------- Query nearby services -------- */

  useEffect(() => {
    if (!isReady || !db) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Use current location, fallback to Hyderabad centre
      const lat = currentLocation?.lat || 17.385;
      const lon = currentLocation?.lon || 78.4867;
      const services = db.getEmergencyServicesNearby(
        lat,
        lon,
        CONTEXT_RADIUS_KM,
        2,
      );
      setNearbyServices(services || []);
    } catch (e) {
      console.warn('[Context] Failed to load nearby services:', e);
      setNearbyServices([]);
    } finally {
      setLoading(false);
    }
  }, [isReady, db, currentLocation, refreshKey]);

  /* -------- Compute contexts + suggestions -------- */

  const contexts = useMemo(
    () => detectContexts({ nearbyServices, activeAlerts }),
    [nearbyServices, activeAlerts],
  );

  const categories = useMemo(
    () => contextsToCategories(contexts),
    [contexts],
  );

  const primaryContext = contexts[0] || 'default';
  const primaryCategory = categories[0] || 'greetings';

  // Get top 4 phrases from the primary category
  const suggestedPhrases = useMemo(() => {
    const phrases = getPhrasesByCategory(primaryCategory);
    // Prefer phrases tagged as essential/urgent for context relevance
    const sorted = [...phrases].sort((a, b) => {
      const aUrgent = (a.tags || []).includes('urgent') ? 0 : 1;
      const bUrgent = (b.tags || []).includes('urgent') ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      const aEss = (a.tags || []).includes('essential') ? 0 : 1;
      const bEss = (b.tags || []).includes('essential') ? 0 : 1;
      return aEss - bEss;
    });
    return sorted.slice(0, MAX_SUGGESTED_PHRASES);
  }, [primaryCategory]);

  /* -------- Actions -------- */

  const handleCopy = async (text, id) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleSpeak = (text, id) => {
    if (!text) return;
    if (speakingId === id) {
      stopSpeaking();
      setSpeakingId(null);
      return;
    }
    stopSpeaking();
    setSpeakingId(id);
    speak({
      text,
      lang: targetMeta?.tts_code || targetLang,
      rate: 0.85,
      onEnd: () => setSpeakingId(null),
    });
    const est = Math.min(15000, Math.max(2000, text.length * 80));
    setTimeout(() => setSpeakingId(null), est);
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const ttsAvailable = isTtsSupported() && hasVoiceFor(targetMeta?.tts_code || targetLang);
  const contextDisplay = CONTEXT_DISPLAY[primaryContext] || CONTEXT_DISPLAY.default;
  const colors = COLOR_CLASSES[contextDisplay.color] || COLOR_CLASSES['accent-primary'];
  const ContextIcon = contextDisplay.icon;

  // Find category metadata for display
  const allCategories = getCategories();
  const categoryMeta = allCategories.find((c) => c.id === primaryCategory);

  /* -------- Render -------- */

  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-accent-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Smart Suggestions
            </h3>
            <p className="text-xs text-text-muted">
              Phrases for your current surroundings
            </p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors disabled:opacity-50"
          title="Refresh context"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Location status */}
      {!currentLocation && (
        <div className="mb-4 p-3 rounded-xl bg-warning-soft border border-warning/25 flex items-start gap-2">
          <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            Enable Live Tracking on Dashboard for location-aware suggestions.
            Showing general phrases for now.
          </p>
        </div>
      )}

      {/* Context detected badge */}
      <motion.div
        key={primaryContext}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mb-4 p-3 rounded-xl border ${colors.bg} ${colors.border}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${colors.iconBg} flex items-center justify-center shrink-0`}>
            <ContextIcon className={`w-4 h-4 ${colors.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${colors.text}`}>
              {contextDisplay.label}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Suggesting {categoryMeta?.label || primaryCategory} phrases
              {currentLocation && nearbyServices.length > 0 && (
                <>
                  {' '}· {nearbyServices.length} service
                  {nearbyServices.length !== 1 ? 's' : ''} within{' '}
                  {Math.round(CONTEXT_RADIUS_KM * 1000)}m
                </>
              )}
            </p>
          </div>
          {onCategoryClick && (
            <button
              onClick={() => onCategoryClick(primaryCategory)}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border bg-white/60 ${colors.text} ${colors.border} hover:bg-white/80 transition-colors`}
            >
              See all
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </motion.div>

      {/* All detected contexts as chips */}
      {contexts.length > 1 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <span className="text-xs text-text-muted mr-1">Also nearby:</span>
          {contexts.slice(1, 5).map((ctx) => {
            const meta = CONTEXT_DISPLAY[ctx] || CONTEXT_DISPLAY.default;
            const Icon = meta.icon;
            return (
              <span
                key={ctx}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-bg-elevated/60 text-text-secondary border border-[#DDD3C5]"
              >
                <Icon className="w-3 h-3" />
                {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Suggested phrases */}
      <div className="space-y-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${primaryCategory}-${targetLang}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {suggestedPhrases.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-text-muted">
                  No suggestions available
                </p>
              </div>
            ) : (
              suggestedPhrases.map((phrase, idx) => (
                <SuggestionCard
                  key={phrase.id}
                  phrase={phrase}
                  index={idx}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  copiedId={copiedId}
                  speakingId={speakingId}
                  ttsAvailable={ttsAvailable}
                  onCopy={handleCopy}
                  onSpeak={handleSpeak}
                  onSelect={onPhraseSelect}
                />
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      {currentLocation && (
        <div className="mt-4 pt-3 border-t border-[#DDD3C5] flex items-center justify-between gap-2 text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            <span className="font-mono">
              {currentLocation.lat.toFixed(4)}, {currentLocation.lon.toFixed(4)}
            </span>
          </div>
          <span>Updates with movement</span>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* SuggestionCard — slightly more prominent than library card    */
/* ============================================================ */

function SuggestionCard({
  phrase,
  index,
  sourceLang,
  targetLang,
  copiedId,
  speakingId,
  ttsAvailable,
  onCopy,
  onSpeak,
  onSelect,
}) {
  const sourceText = phrase.translations?.[sourceLang] || '';
  const targetText = phrase.translations?.[targetLang] || '';
  const romanization = phrase.romanizations?.[targetLang] || '';

  if (!targetText) return null;

  const isCopied = copiedId === phrase.id;
  const isSpeaking = speakingId === phrase.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="group p-3.5 rounded-xl bg-accent-primary/5 border border-accent-primary/20 hover:border-accent-primary/40 hover:bg-accent-primary/10 transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted leading-snug">{sourceText}</p>
          <p className="text-sm font-semibold text-text-primary mt-1 leading-relaxed">
            {targetText}
          </p>
          {romanization && (
            <p className="text-xs text-accent-primary italic mt-0.5 leading-snug">
              {romanization}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {ttsAvailable && (
            <button
              onClick={() => onSpeak(targetText, phrase.id)}
              className={`p-1.5 rounded-lg transition-colors ${
                isSpeaking
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'hover:bg-accent-primary/15 text-text-muted hover:text-accent-primary'
              }`}
              title={isSpeaking ? 'Stop' : 'Listen'}
            >
              <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse' : ''}`} />
            </button>
          )}

          <button
            onClick={() => onCopy(targetText, phrase.id)}
            className="p-1.5 rounded-lg hover:bg-accent-primary/15 text-text-muted hover:text-accent-primary transition-colors"
            title="Copy"
          >
            {isCopied ? (
              <Check className="w-3.5 h-3.5 text-success" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {onSelect && (
            <button
              onClick={() => onSelect(phrase)}
              className="p-1.5 rounded-lg hover:bg-accent-primary/15 text-text-muted hover:text-accent-primary transition-colors"
              title="Show big"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default ContextAwareSuggestions;