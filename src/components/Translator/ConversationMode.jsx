import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Volume2,
  VolumeX,
  ArrowLeftRight,
  Send,
  Loader2,
  MessageCircle,
  ChevronDown,
  Copy,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  translate,
  getCommonReplies,
  getLanguageMeta,
  getPhraseTranslation,
} from '../../services/translator';
import { speak, stopSpeaking, isTtsSupported, hasVoiceFor } from '../../utils/tts';

/**
 * ConversationMode — fullscreen card view for showing translations
 * to a local person in noisy environments.
 *
 * Two modes:
 *   - "show":  Display traveler's phrase in HUGE local-language text
 *   - "reply": Local picks/types a response → translates back to traveler
 *
 * Props:
 *   open:           boolean
 *   onClose:        () => void
 *   phrase:         optional initial phrase object from PhraseLibrary
 *   travelerLang:   traveler's language (default 'en')
 *   localLang:      local person's language (default 'hi')
 */
function ConversationMode({
  open,
  onClose,
  phrase = null,
  travelerLang = 'en',
  localLang = 'hi',
}) {
  const [mode, setMode] = useState('show');
  const [showingPhrase, setShowingPhrase] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyResult, setReplyResult] = useState(null);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyError, setReplyError] = useState(null);

  const [speakingKey, setSpeakingKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const replyInputRef = useRef(null);
  const commonReplies = getCommonReplies();

  const travelerMeta = getLanguageMeta(travelerLang);
  const localMeta = getLanguageMeta(localLang);

  /* -------- Reset when phrase changes -------- */
  useEffect(() => {
    if (open && phrase) {
      setShowingPhrase(phrase);
      setMode('show');
      setReplyText('');
      setReplyResult(null);
      setReplyError(null);
    }
  }, [open, phrase]);

  /* -------- Cleanup TTS on close -------- */
  useEffect(() => {
    if (!open) {
      stopSpeaking();
      setSpeakingKey(null);
    }
  }, [open]);

  /* -------- Esc to close -------- */
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, isFullscreen, onClose]);

  if (!open) return null;

  /* -------- Derived display data -------- */

  const localTranslation = showingPhrase
    ? getPhraseTranslation(showingPhrase, localLang)
    : null;
  const travelerTranslation = showingPhrase
    ? getPhraseTranslation(showingPhrase, travelerLang)
    : null;

  /* -------- Actions -------- */

  const handleSpeak = (text, langCode, key) => {
    if (!text) return;
    if (speakingKey === key) {
      stopSpeaking();
      setSpeakingKey(null);
      return;
    }
    stopSpeaking();
    setSpeakingKey(key);
    const meta = getLanguageMeta(langCode);
    speak({
      text,
      lang: meta?.tts_code || langCode,
      rate: 0.85,
      onEnd: () => setSpeakingKey(null),
    });
    const est = Math.min(15000, Math.max(2000, text.length * 80));
    setTimeout(() => setSpeakingKey(null), est);
  };

  const handleCopy = async (text, key) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleSelectReply = async (replyPhrase) => {
    setReplyError(null);
    setReplyLoading(true);
    try {
      const localText = replyPhrase.translations?.[localLang] || '';
      const travelerText = replyPhrase.translations?.[travelerLang] || '';
      const travelerRoman = replyPhrase.romanizations?.[travelerLang] || '';
      setReplyResult({
        local: localText,
        local_romanization: replyPhrase.romanizations?.[localLang] || '',
        traveler: travelerText,
        traveler_romanization: travelerRoman,
        source: 'curated',
      });
    } catch (e) {
      setReplyError(e.message);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleSubmitReply = async () => {
    const txt = replyText.trim();
    if (!txt) return;

    setReplyError(null);
    setReplyLoading(true);

    try {
      const result = await translate({
        text: txt,
        fromLang: localLang,
        toLang: travelerLang,
      });
      setReplyResult({
        local: txt,
        local_romanization: '',
        traveler: result.translation,
        traveler_romanization: result.romanization || '',
        source: result.source,
      });
    } catch (e) {
      setReplyError(e.message);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleSwapMode = () => {
    if (mode === 'show') {
      setMode('reply');
      setTimeout(() => replyInputRef.current?.focus(), 100);
    } else {
      setMode('show');
      setReplyText('');
      setReplyResult(null);
      setReplyError(null);
    }
  };

  /* -------- Render -------- */

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`glass-card shadow-strong border border-[#DDD3C5] overflow-hidden flex flex-col w-full ${
            isFullscreen ? 'h-full max-w-none' : 'sm:max-w-2xl max-h-[95vh]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#DDD3C5] bg-accent-primary/5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-accent-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-text-primary truncate">
                  {mode === 'show' ? 'Show to local' : "Local's reply"}
                </h3>
                <p className="text-xs text-text-muted truncate">
                  {mode === 'show'
                    ? `${travelerMeta?.name} → ${localMeta?.name}`
                    : `${localMeta?.name} → ${travelerMeta?.name}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsFullscreen((f) => !f)}
                className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors hidden sm:block"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-8 flex flex-col">
            <AnimatePresence mode="wait">
              {mode === 'show' ? (
                <ShowPanel
                  key="show"
                  showingPhrase={showingPhrase}
                  localTranslation={localTranslation}
                  travelerTranslation={travelerTranslation}
                  localLang={localLang}
                  travelerLang={travelerLang}
                  speakingKey={speakingKey}
                  copiedKey={copiedKey}
                  onSpeak={handleSpeak}
                  onCopy={handleCopy}
                />
              ) : (
                <ReplyPanel
                  key="reply"
                  replyInputRef={replyInputRef}
                  replyText={replyText}
                  setReplyText={setReplyText}
                  replyResult={replyResult}
                  replyLoading={replyLoading}
                  replyError={replyError}
                  commonReplies={commonReplies}
                  localLang={localLang}
                  travelerLang={travelerLang}
                  speakingKey={speakingKey}
                  copiedKey={copiedKey}
                  onSelectReply={handleSelectReply}
                  onSubmitReply={handleSubmitReply}
                  onSpeak={handleSpeak}
                  onCopy={handleCopy}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#DDD3C5] bg-bg-elevated/40 shrink-0">
            <button
              onClick={handleSwapMode}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold bg-accent-primary/10 text-accent-primary border border-accent-primary/25 hover:bg-accent-primary/15 transition-all"
            >
              <ArrowLeftRight className="w-4 h-4" />
              {mode === 'show'
                ? "Get local's reply"
                : 'Back to showing phrase'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ============================================================ */
/* ShowPanel — display traveler's phrase in HUGE local text     */
/* ============================================================ */

function ShowPanel({
  showingPhrase,
  localTranslation,
  travelerTranslation,
  localLang,
  travelerLang,
  speakingKey,
  copiedKey,
  onSpeak,
  onCopy,
}) {
  if (!showingPhrase || !localTranslation) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex-1 flex flex-col items-center justify-center text-center py-12"
      >
        <MessageCircle className="w-12 h-12 text-text-muted mb-3" />
        <p className="text-base font-semibold text-text-primary mb-2">
          No phrase selected
        </p>
        <p className="text-sm text-text-secondary max-w-sm">
          Pick a phrase from the library or smart suggestions to show it here in big, clear text.
        </p>
      </motion.div>
    );
  }

  const localMeta = getLanguageMeta(localLang);
  const ttsLocalAvailable = isTtsSupported() && hasVoiceFor(localMeta?.tts_code || localLang);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="flex-1 flex flex-col"
    >
      {/* Small caption: traveler's original */}
      <div className="text-center mb-6">
        <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1">
          You're saying
        </p>
        <p className="text-sm text-text-secondary italic">
          “{travelerTranslation?.text || showingPhrase.translations?.[travelerLang]}”
        </p>
      </div>

      {/* BIG local text — the star of this view */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
        <p
          className="text-text-primary font-bold leading-tight break-words"
          style={{
            fontSize: 'clamp(2rem, 8vw, 4.5rem)',
            lineHeight: 1.15,
          }}
        >
          {localTranslation.text}
        </p>

        {localTranslation.romanization && (
          <p
            className="text-accent-primary mt-4 italic font-medium"
            style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)' }}
          >
            {localTranslation.romanization}
          </p>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center justify-center gap-3 mt-8 pt-6 border-t border-[#DDD3C5]">
        {ttsLocalAvailable && (
          <button
            onClick={() => onSpeak(localTranslation.text, localLang, 'show-local')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border ${
              speakingKey === 'show-local'
                ? 'bg-accent-primary text-white border-accent-primary'
                : 'bg-accent-primary/10 text-accent-primary border-accent-primary/25 hover:bg-accent-primary/15'
            }`}
          >
            {speakingKey === 'show-local' ? (
              <>
                <VolumeX className="w-4 h-4" />
                Stop
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                Listen
              </>
            )}
          </button>
        )}

        <button
          onClick={() => onCopy(localTranslation.text, 'show-local')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-bg-elevated/60 text-text-secondary border border-[#DDD3C5] hover:bg-bg-elevated transition-all"
        >
          {copiedKey === 'show-local' ? (
            <>
              <Check className="w-4 h-4 text-success" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

/* ============================================================ */
/* ReplyPanel — local picks a reply or types one                */
/* ============================================================ */

function ReplyPanel({
  replyInputRef,
  replyText,
  setReplyText,
  replyResult,
  replyLoading,
  replyError,
  commonReplies,
  localLang,
  travelerLang,
  speakingKey,
  copiedKey,
  onSelectReply,
  onSubmitReply,
  onSpeak,
  onCopy,
}) {
  const localMeta = getLanguageMeta(localLang);
  const travelerMeta = getLanguageMeta(travelerLang);
  const ttsTravelerAvailable =
    isTtsSupported() && hasVoiceFor(travelerMeta?.tts_code || travelerLang);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
      className="flex-1 flex flex-col gap-4"
    >
      {/* Result first if exists */}
      <AnimatePresence>
        {replyResult && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-5 rounded-2xl bg-accent-primary/5 border border-accent-primary/25"
          >
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
              Local said
            </p>
            <p className="text-base text-text-secondary mb-3 italic">
              “{replyResult.local}”
            </p>

            <div className="pt-3 border-t border-accent-primary/15">
              <p className="text-xs uppercase tracking-wider text-accent-primary font-semibold mb-2">
                In {travelerMeta?.name}
              </p>
              <p className="text-xl font-bold text-text-primary leading-relaxed">
                {replyResult.traveler}
              </p>
              {replyResult.traveler_romanization && (
                <p className="text-sm text-accent-primary italic mt-1">
                  {replyResult.traveler_romanization}
                </p>
              )}

              <div className="flex items-center gap-2 mt-3">
                {ttsTravelerAvailable && (
                  <button
                    onClick={() =>
                      onSpeak(replyResult.traveler, travelerLang, 'reply-traveler')
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-accent-primary/10 text-accent-primary border border-accent-primary/25 hover:bg-accent-primary/15 transition-all"
                  >
                    <Volume2 className="w-3 h-3" />
                    Listen
                  </button>
                )}
                <button
                  onClick={() => onCopy(replyResult.traveler, 'reply-traveler')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-bg-elevated/60 text-text-secondary border border-[#DDD3C5] hover:bg-bg-elevated transition-all"
                >
                  {copiedKey === 'reply-traveler' ? (
                    <>
                      <Check className="w-3 h-3 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Common replies grid */}
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
          Quick replies (tap one)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {commonReplies.map((reply) => {
            const localText = reply.translations?.[localLang] || '';
            const localRoman = reply.romanizations?.[localLang] || '';
            return (
              <button
                key={reply.id}
                onClick={() => onSelectReply(reply)}
                disabled={replyLoading}
                className="text-left p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/40 hover:bg-accent-primary/5 transition-all disabled:opacity-50"
              >
                <p className="text-sm font-semibold text-text-primary leading-tight">
                  {localText}
                </p>
                {localRoman && (
                  <p className="text-xs text-accent-primary italic mt-0.5">
                    {localRoman}
                  </p>
                )}
                <p className="text-xs text-text-muted mt-1 truncate">
                  → {reply.translations?.[travelerLang]}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom typed reply */}
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
          Or type a reply in {localMeta?.name}
        </p>
        <div className="flex items-stretch gap-2">
          <input
            ref={replyInputRef}
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !replyLoading) {
                e.preventDefault();
                onSubmitReply();
              }
            }}
            placeholder={`Type in ${localMeta?.name}...`}
            className="flex-1 px-3 py-2.5 bg-white/85 border border-[#DDD3C5] rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all"
          />
          <button
            onClick={onSubmitReply}
            disabled={!replyText.trim() || replyLoading}
            className="flex items-center justify-center gap-2 px-4 rounded-xl bg-accent-primary text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            title="Translate"
          >
            {replyLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {replyError && (
        <div className="p-3 rounded-xl bg-danger-soft border border-danger/25">
          <p className="text-xs text-danger">{replyError}</p>
        </div>
      )}
    </motion.div>
  );
}

export default ConversationMode;