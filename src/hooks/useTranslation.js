/**
 * useTranslation Hook
 *
 * React-friendly wrapper around the translator service.
 * Manages translation state, debouncing, history, and TTS.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { translate, getLanguageMeta } from '../services/translator';
import { speak, stopSpeaking, isTtsSupported, hasVoiceFor } from '../utils/tts';

const DEBOUNCE_MS = 600;
const MAX_HISTORY = 10;

export function useTranslation({
  initialFromLang = 'en',
  initialToLang = 'hi',
  debounceMs = DEBOUNCE_MS,
} = {}) {
  const [fromLang, setFromLang] = useState(initialFromLang);
  const [toLang, setToLang] = useState(initialToLang);
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const debounceTimerRef = useRef(null);
  const lastRequestIdRef = useRef(0);

  /* -------- Translate action -------- */

  const runTranslate = useCallback(
    async ({ text, source, target, preferAi = false }) => {
      const trimmed = (text || '').trim();
      if (!trimmed) {
        setResult(null);
        setError(null);
        return null;
      }

      const requestId = ++lastRequestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const res = await translate({
          text: trimmed,
          fromLang: source,
          toLang: target,
          preferAi,
        });

        // Only apply if no newer request was started
        if (requestId === lastRequestIdRef.current) {
          setResult(res);
          // Add to history (skip noop)
          if (res.source !== 'noop') {
            setHistory((prev) => {
              const entry = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                input: trimmed,
                output: res.translation,
                romanization: res.romanization,
                from_lang: source,
                to_lang: target,
                source: res.source,
                timestamp: Date.now(),
              };
              const filtered = prev.filter(
                (h) => !(h.input === trimmed && h.to_lang === target),
              );
              return [entry, ...filtered].slice(0, MAX_HISTORY);
            });
          }
          return res;
        }
        return null;
      } catch (e) {
        if (requestId === lastRequestIdRef.current) {
          setError(e.message);
          setResult(null);
        }
        return null;
      } finally {
        if (requestId === lastRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  /* -------- Debounced live translation on input change -------- */

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!inputText.trim()) {
      setResult(null);
      setError(null);
      return undefined;
    }

    debounceTimerRef.current = setTimeout(() => {
      runTranslate({
        text: inputText,
        source: fromLang,
        target: toLang,
      });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputText, fromLang, toLang, debounceMs, runTranslate]);

  /* -------- Public actions -------- */

  const translateNow = useCallback(
    ({ preferAi = false } = {}) =>
      runTranslate({
        text: inputText,
        source: fromLang,
        target: toLang,
        preferAi,
      }),
    [inputText, fromLang, toLang, runTranslate],
  );

  const translateText = useCallback(
    (text, opts = {}) =>
      runTranslate({
        text,
        source: opts.fromLang || fromLang,
        target: opts.toLang || toLang,
        preferAi: opts.preferAi || false,
      }),
    [fromLang, toLang, runTranslate],
  );

  const swapLanguages = useCallback(() => {
    setFromLang((prevFrom) => {
      const prevTo = toLang;
      setToLang(prevFrom);
      // If we have a result, use it as new input
      if (result?.translation) {
        setInputText(result.translation);
      }
      return prevTo;
    });
  }, [toLang, result]);

  const clearInput = useCallback(() => {
    setInputText('');
    setResult(null);
    setError(null);
    stopSpeaking();
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  /* -------- TTS helpers -------- */

  const speakText = useCallback((text, langCode) => {
    if (!text) return false;
    const meta = getLanguageMeta(langCode);
    return speak({
      text,
      lang: meta?.tts_code || langCode,
      rate: 0.9,
    });
  }, []);

  const speakResult = useCallback(() => {
    if (!result?.translation) return false;
    return speakText(result.translation, toLang);
  }, [result, toLang, speakText]);

  const canSpeak = useCallback(
    (langCode) => {
      if (!isTtsSupported()) return false;
      const meta = getLanguageMeta(langCode);
      return hasVoiceFor(meta?.tts_code || langCode);
    },
    [],
  );

  return {
    // State
    fromLang,
    toLang,
    inputText,
    result,
    loading,
    error,
    history,

    // Setters
    setFromLang,
    setToLang,
    setInputText,

    // Actions
    translateNow,
    translateText,
    swapLanguages,
    clearInput,
    clearError: () => setError(null),
    clearHistory,

    // TTS
    speak: speakText,
    speakResult,
    stopSpeaking,
    canSpeak,
    ttsSupported: isTtsSupported(),
  };
}