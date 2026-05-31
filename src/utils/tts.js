/**
 * Text-to-Speech Utility
 *
 * Wraps the Web Speech API (SpeechSynthesis).
 * Works offline. Voice quality varies by OS/browser.
 */

let availableVoices = [];
let voicesLoaded = false;

/**
 * Load and cache available voices.
 * SpeechSynthesis loads voices asynchronously on some browsers.
 */
function loadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    availableVoices = voices;
    voicesLoaded = true;
  }
  return availableVoices;
}

// Initial load
if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

/**
 * Check if TTS is supported in this browser.
 */
export function isTtsSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Find the best matching voice for a BCP-47 language code.
 * Falls back to base language (e.g., 'en' from 'en-IN').
 */
function findVoice(langCode) {
  if (!langCode) return null;
  const voices = loadVoices();
  if (voices.length === 0) return null;

  const lower = langCode.toLowerCase();
  const base = lower.split('-')[0];

  // Exact match first
  let voice = voices.find((v) => v.lang.toLowerCase() === lower);
  if (voice) return voice;

  // Match base language
  voice = voices.find((v) => v.lang.toLowerCase().startsWith(base + '-'));
  if (voice) return voice;

  // Any voice starting with base
  voice = voices.find((v) => v.lang.toLowerCase().startsWith(base));
  if (voice) return voice;

  return null;
}

/**
 * Speak the given text in the requested language.
 *
 * @param {Object} opts
 * @param {string} opts.text       - Text to speak.
 * @param {string} opts.lang       - BCP-47 code (e.g. 'hi-IN', 'fr-FR').
 * @param {number} [opts.rate]     - 0.1 to 10, default 0.9.
 * @param {number} [opts.pitch]    - 0 to 2, default 1.
 * @param {number} [opts.volume]   - 0 to 1, default 1.
 * @param {() => void} [opts.onEnd]
 * @returns {boolean} true if speaking started, false otherwise
 */
export function speak({ text, lang, rate = 0.9, pitch = 1, volume = 1, onEnd }) {
  if (!isTtsSupported()) {
    console.warn('[TTS] Not supported in this browser');
    return false;
  }
  if (!text || !text.trim()) return false;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  if (lang) {
    utterance.lang = lang;
    const voice = findVoice(lang);
    if (voice) {
      utterance.voice = voice;
    }
  }

  utterance.rate = rate;
  utterance.pitch = pitch;
  utterance.volume = volume;

  if (onEnd) {
    utterance.onend = onEnd;
  }
  utterance.onerror = (e) => {
    console.warn('[TTS] Error:', e.error || e);
    if (onEnd) onEnd();
  };

  try {
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (e) {
    console.error('[TTS] Speak failed:', e);
    return false;
  }
}

/**
 * Stop any ongoing speech.
 */
export function stopSpeaking() {
  if (isTtsSupported()) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Check whether a voice exists for the given BCP-47 code.
 * Useful for showing/hiding speaker icons.
 */
export function hasVoiceFor(langCode) {
  return findVoice(langCode) !== null;
}

/**
 * Get all available voices grouped by language (for debugging / settings).
 */
export function listAvailableVoices() {
  return loadVoices().map((v) => ({
    name: v.name,
    lang: v.lang,
    local: v.localService,
    default: v.default,
  }));
}