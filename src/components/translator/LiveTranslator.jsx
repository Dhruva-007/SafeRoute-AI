import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe,
  ArrowLeftRight,
  Volume2,
  VolumeX,
  Copy,
  Check,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  BookOpen,
  Wand2,
  WifiOff,
  Info,
} from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { getSupportedLanguages, getLanguageMeta } from '../../services/translator';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

/**
 * Map translation source → visual badge style + label.
 */
const SOURCE_META = {
  curated: {
    label: 'From phrase library',
    icon: BookOpen,
    badgeClass: 'bg-success-soft text-success border-success/25',
  },
  ai: {
    label: 'AI translation',
    icon: Wand2,
    badgeClass: 'bg-accent-primary/10 text-accent-primary border-accent-primary/25',
  },
  fallback: {
    label: 'Closest offline match',
    icon: WifiOff,
    badgeClass: 'bg-warning-soft text-warning border-warning/25',
  },
  noop: {
    label: 'Same language',
    icon: Info,
    badgeClass: 'bg-bg-elevated text-text-muted border-[#DDD3C5]',
  },
};

const CONFIDENCE_DOT = {
  high: 'bg-success',
  medium: 'bg-warning',
  low: 'bg-danger',
};

function LiveTranslator({
  initialFromLang = 'en',
  initialToLang = 'hi',
  onLanguageChange,
}) {
  const {
    fromLang,
    toLang,
    inputText,
    result,
    loading,
    error,
    setFromLang,
    setToLang,
    setInputText,
    translateNow,
    swapLanguages,
    clearInput,
    clearError,
    speakResult,
    speak,
    stopSpeaking,
    canSpeak,
    ttsSupported,
  } = useTranslation({ initialFromLang, initialToLang });

  const { isOnline } = useOnlineStatus();
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const languages = getSupportedLanguages();
  const toLangMeta = getLanguageMeta(toLang);
  const fromLangMeta = getLanguageMeta(fromLang);

  // Notify parent on language change (for context-aware sync)
  React.useEffect(() => {
    if (onLanguageChange) {
      onLanguageChange({ fromLang, toLang });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLang, toLang]);

  const handleCopy = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fail
    }
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    speakResult();
    // Roughly estimate speaking duration
    const text = result?.translation || '';
    const estDuration = Math.min(15000, Math.max(2000, text.length * 80));
    setTimeout(() => setIsSpeaking(false), estDuration);
  };

  const sourceMeta = result?.source ? SOURCE_META[result.source] : null;
  const SourceIcon = sourceMeta?.icon;
  const canSpeakTarget = canSpeak(toLang);

  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
            <Globe className="w-4 h-4 text-accent-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Live Translator
            </h3>
            <p className="text-xs text-text-muted">
              Instant offline phrases + AI for free-form text
            </p>
          </div>
        </div>
      </div>

      {/* Language selectors */}
      <div className="flex items-center gap-2 mb-5">
        <LanguageDropdown
          value={fromLang}
          onChange={setFromLang}
          languages={languages}
          placeholder="From"
        />

        <button
          onClick={swapLanguages}
          className="p-2.5 rounded-xl bg-accent-primary/10 border border-accent-primary/25 hover:bg-accent-primary/15 transition-colors shrink-0"
          title="Swap languages"
        >
          <ArrowLeftRight className="w-4 h-4 text-accent-primary" />
        </button>

        <LanguageDropdown
          value={toLang}
          onChange={setToLang}
          languages={languages}
          placeholder="To"
        />
      </div>

      {/* Input area */}
      <div className="relative mb-3">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Type or paste text in ${fromLangMeta?.name || fromLang}...`}
          rows={4}
          maxLength={1000}
          className="w-full px-3 py-3 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all resize-none"
        />
        {inputText && (
          <button
            onClick={clearInput}
            className="absolute top-2.5 right-2.5 p-1 rounded-lg hover:bg-accent-primary/10 transition-colors"
            title="Clear"
          >
            <X className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
        <div className="absolute bottom-2.5 right-3 text-xs text-text-muted">
          {inputText.length}/1000
        </div>
      </div>

      {/* Translate button (manual override) */}
      <button
        onClick={() => translateNow({ preferAi: true })}
        disabled={!inputText.trim() || loading}
        className="btn-primary w-full flex items-center justify-center gap-2 !py-2.5 text-sm mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Translating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Translate with AI
          </>
        )}
      </button>

      {/* Offline notice */}
      {!isOnline && (
        <div className="mb-4 p-3 rounded-xl bg-warning-soft border border-warning/25 flex items-start gap-2">
          <WifiOff className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning">
            Offline mode. Curated phrase library still works.
          </p>
        </div>
      )}

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/25 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger flex-1">{error}</p>
            <button
              onClick={clearError}
              className="text-danger/60 hover:text-danger text-sm leading-none"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Translation result */}
      <AnimatePresence mode="wait">
        {result && result.translation && (
          <motion.div
            key={`${result.from_lang}-${result.to_lang}-${result.translation}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl bg-accent-primary/5 border border-accent-primary/20 overflow-hidden"
          >
            {/* Header strip */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-accent-primary/15 bg-accent-primary/5 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-accent-primary truncate">
                  {toLangMeta?.native_name} ({toLangMeta?.name})
                </span>
                {result.confidence && (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-text-muted"
                    title={`Confidence: ${result.confidence}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        CONFIDENCE_DOT[result.confidence] || 'bg-text-muted'
                      }`}
                    />
                    {result.confidence}
                  </span>
                )}
              </div>

              {/* Source badge */}
              {sourceMeta && (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${sourceMeta.badgeClass}`}
                >
                  {SourceIcon && <SourceIcon className="w-3 h-3" />}
                  {sourceMeta.label}
                </span>
              )}
            </div>

            {/* Body */}
            <div className="p-4">
              <p className="text-base text-text-primary leading-relaxed font-medium">
                {result.translation}
              </p>

              {result.romanization && (
                <p className="text-sm text-text-muted italic mt-2 leading-relaxed">
                  {result.romanization}
                </p>
              )}

              {result.warning && (
                <div className="mt-3 p-2.5 rounded-lg bg-warning-soft border border-warning/25 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">{result.warning}</p>
                </div>
              )}

              {/* Action row */}
              <div className="flex items-center justify-end gap-1.5 mt-4 pt-3 border-t border-accent-primary/15">
                {ttsSupported && canSpeakTarget && (
                  <button
                    onClick={handleSpeak}
                    className="p-2 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
                    title={isSpeaking ? 'Stop' : 'Listen'}
                  >
                    {isSpeaking ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                )}

                {ttsSupported && canSpeakTarget && result.romanization && (
                  <button
                    onClick={() => speak(result.romanization, 'en')}
                    className="px-2 py-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors text-xs font-medium"
                    title="Listen to romanization"
                  >
                    🔤
                  </button>
                )}

                <button
                  onClick={() => handleCopy(result.translation)}
                  className="p-2 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
                  title="Copy translation"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading hint when waiting on AI */}
      {loading && !result && (
        <div className="rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] p-4 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-accent-primary animate-spin shrink-0" />
          <p className="text-sm text-text-secondary">
            Translating to {toLangMeta?.name}...
          </p>
        </div>
      )}

      {/* Empty hint */}
      {!result && !loading && !error && !inputText && (
        <div className="rounded-xl bg-bg-elevated/40 border border-dashed border-[#DDD3C5] p-4 text-center">
          <p className="text-xs text-text-muted">
            Start typing for instant translation
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Language dropdown — custom for better UX                            */
/* ------------------------------------------------------------------ */

function LanguageDropdown({ value, onChange, languages, placeholder }) {
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
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary hover:border-accent-primary/40 transition-colors"
      >
        <span className="truncate text-left">
          {selected ? (
            <>
              <span className="font-semibold">{selected.name}</span>
              {!selected.uses_latin && (
                <span className="text-text-muted ml-1.5 text-xs">
                  {selected.native_name}
                </span>
              )}
            </>
          ) : (
            <span className="text-text-muted">{placeholder}</span>
          )}
        </span>
        <svg
          className={`w-3 h-3 text-text-muted transition-transform shrink-0 ${
            open ? 'rotate-180' : ''
          }`}
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
            className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto glass-card shadow-medium border border-[#DDD3C5] py-1"
          >
            {languages.map((lang) => {
              const isSelected = lang.code === value;
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    onChange(lang.code);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    isSelected
                      ? 'bg-accent-primary/10 text-accent-primary'
                      : 'hover:bg-accent-primary/5 text-text-primary'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{lang.name}</p>
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

export default LiveTranslator;