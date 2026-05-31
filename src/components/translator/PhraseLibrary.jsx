import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Search,
  X,
  Volume2,
  Copy,
  Check,
  Heart,
  Shield,
  Utensils,
  Train,
  Hotel,
  ShoppingBag,
  HeartPulse,
  Navigation,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';
import {
  getCategories,
  getPhrasesByCategory,
  getLanguageMeta,
  getSupportedLanguages,
} from '../../services/translator';
import { speak, stopSpeaking, isTtsSupported, hasVoiceFor } from '../../utils/tts';

const CATEGORY_ICONS = {
  heart: Heart,
  shield: Shield,
  utensils: Utensils,
  train: Train,
  hotel: Hotel,
  'shopping-bag': ShoppingBag,
  'heart-pulse': HeartPulse,
  navigation: Navigation,
  'message-circle': MessageCircle,
};

/**
 * PhraseLibrary — browse curated travel phrases by category.
 *
 * Props:
 *   targetLang:        current target language code (default 'hi')
 *   onTargetLangChange: (code) => void
 *   sourceLang:        source language for "from" text (default 'en')
 *   onPhraseSelect:    (phrase) => void  — for Conversation Mode
 *   featuredCategoryId: highlight a specific category at top (from context)
 */
function PhraseLibrary({
  targetLang = 'hi',
  onTargetLangChange,
  sourceLang = 'en',
  onPhraseSelect,
  featuredCategoryId = null,
}) {
  const [activeCategory, setActiveCategory] = useState(
    featuredCategoryId || 'greetings',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);

  const categories = getCategories();
  const languages = getSupportedLanguages();
  const targetMeta = getLanguageMeta(targetLang);

  // Sync activeCategory when featured changes
  React.useEffect(() => {
    if (featuredCategoryId && featuredCategoryId !== activeCategory) {
      setActiveCategory(featuredCategoryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredCategoryId]);

  /* -------- Phrase list (filtered by category + search) -------- */

  const visiblePhrases = useMemo(() => {
    const all = getPhrasesByCategory(activeCategory);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;

    return all.filter((p) => {
      const src = (p.translations?.[sourceLang] || '').toLowerCase();
      const tgt = (p.translations?.[targetLang] || '').toLowerCase();
      const rom = (p.romanizations?.[targetLang] || '').toLowerCase();
      return src.includes(q) || tgt.includes(q) || rom.includes(q);
    });
  }, [activeCategory, searchQuery, sourceLang, targetLang]);

  /* -------- Actions -------- */

  const handleCopy = async (text, id) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
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

    // Safety timer in case onEnd doesn't fire
    const estDuration = Math.min(15000, Math.max(2000, text.length * 80));
    setTimeout(() => setSpeakingId(null), estDuration);
  };

  const ttsAvailable = isTtsSupported() && hasVoiceFor(targetMeta?.tts_code || targetLang);

  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-accent-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Phrase Library
            </h3>
            <p className="text-xs text-text-muted">
              Curated travel phrases · works offline
            </p>
          </div>
        </div>

        {/* Target language pill */}
        <LanguagePill
          value={targetLang}
          onChange={onTargetLangChange}
          languages={languages}
        />
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search phrases..."
          className="w-full pl-9 pr-9 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-accent-primary/10 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.icon] || MessageCircle;
          const isActive = activeCategory === cat.id;
          const isFeatured = featuredCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                isActive
                  ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40 shadow-soft'
                  : isFeatured
                    ? 'bg-warning-soft text-warning border-warning/30'
                    : 'bg-white/85 text-text-secondary border-[#DDD3C5] hover:bg-[#FAF7F2]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {cat.label}
              {isFeatured && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Phrase list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeCategory}-${targetLang}-${searchQuery}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {visiblePhrases.length === 0 ? (
              <div className="text-center py-10">
                <Search className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-secondary">
                  {searchQuery
                    ? `No phrases match "${searchQuery}"`
                    : 'No phrases in this category'}
                </p>
              </div>
            ) : (
              visiblePhrases.map((phrase, idx) => (
                <PhraseCard
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

      {/* Footer count */}
      {visiblePhrases.length > 0 && (
        <p className="text-xs text-text-muted text-center mt-3">
          {visiblePhrases.length} phrase{visiblePhrases.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      )}
    </div>
  );
}

/* ============================================================ */
/* PhraseCard — single phrase row                               */
/* ============================================================ */

function PhraseCard({
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

  if (!targetText) {
    return null;
  }

  const isCopied = copiedId === phrase.id;
  const isSpeaking = speakingId === phrase.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.3) }}
      className="group p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Source */}
          <p className="text-xs text-text-muted leading-snug">{sourceText}</p>

          {/* Target */}
          <p className="text-sm font-semibold text-text-primary mt-1 leading-relaxed">
            {targetText}
          </p>

          {/* Romanization */}
          {romanization && (
            <p className="text-xs text-accent-primary italic mt-0.5 leading-snug">
              {romanization}
            </p>
          )}

          {/* Tags */}
          {phrase.tags && phrase.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {phrase.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-accent-primary/8 text-accent-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions (always visible on mobile, fade in on hover desktop) */}
        <div className="flex items-center gap-1 shrink-0 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
          {ttsAvailable && (
            <button
              onClick={() => onSpeak(targetText, phrase.id)}
              className={`p-1.5 rounded-lg transition-colors ${
                isSpeaking
                  ? 'bg-accent-primary/15 text-accent-primary'
                  : 'hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary'
              }`}
              title={isSpeaking ? 'Stop' : 'Listen'}
            >
              <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse' : ''}`} />
            </button>
          )}

          <button
            onClick={() => onCopy(targetText, phrase.id)}
            className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
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
              className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
              title="Show in Conversation Mode"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ============================================================ */
/* LanguagePill — compact selector                              */
/* ============================================================ */

function LanguagePill({ value, onChange, languages }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = languages.find((l) => l.code === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-primary/10 border border-accent-primary/25 text-accent-primary text-xs font-semibold hover:bg-accent-primary/15 transition-colors"
      >
        {selected?.name || value}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-30 mt-1 w-56 max-h-72 overflow-y-auto glass-card shadow-medium border border-[#DDD3C5] py-1"
          >
            {languages.map((lang) => {
              const isSelected = lang.code === value;
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    onChange?.(lang.code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    isSelected
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : 'hover:bg-accent-primary/5 text-text-primary'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{lang.name}</p>
                    {!lang.uses_latin && (
                      <p className="text-xs text-text-muted truncate">
                        {lang.native_name}
                      </p>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PhraseLibrary;