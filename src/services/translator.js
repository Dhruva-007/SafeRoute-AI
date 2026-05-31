/**
 * Translator Service
 *
 * Two-tier translation:
 *  1. Curated phrase library (offline, instant)
 *  2. AI translation via backend POST /translate (online, Groq)
 *
 * Also exposes helpers for fuzzy phrase search and category browsing.
 */

import travelPhrasesData from '../data/travelPhrases.json';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const TRANSLATE_TIMEOUT_MS = 30000;

/* ------------------------------------------------------------------ */
/* Phrase library helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Get the full translation database.
 */
export function getPhraseData() {
  return travelPhrasesData;
}

/**
 * List supported languages from the phrase database.
 * Returns array of { code, name, native_name, uses_latin, tts_code }
 */
export function getSupportedLanguages() {
  return Object.entries(travelPhrasesData.languages).map(([code, meta]) => ({
    code,
    ...meta,
  }));
}

/**
 * Get a language's metadata by code.
 */
export function getLanguageMeta(code) {
  return travelPhrasesData.languages[code] || null;
}

/**
 * Get all categories with their labels and icons.
 */
export function getCategories() {
  return travelPhrasesData.categories;
}

/**
 * Get all phrases for a specific category.
 */
export function getPhrasesByCategory(categoryId) {
  if (!categoryId) return [];
  return travelPhrasesData.phrases.filter((p) => p.category === categoryId);
}

/**
 * Get all common-reply phrases (for Conversation Mode).
 */
export function getCommonReplies() {
  return travelPhrasesData.common_replies || [];
}

/**
 * Get context rules for geofencing-based suggestions.
 */
export function getContextRules() {
  return travelPhrasesData.context_rules?.rules || [];
}

/* ------------------------------------------------------------------ */
/* Phrase lookup                                                        */
/* ------------------------------------------------------------------ */

/**
 * Normalize text for fuzzy matching: lowercase, strip punctuation, collapse spaces.
 */
function normalize(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,!?¿¡;:'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple word-overlap score between two normalized strings (0-1).
 */
function similarityScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aWords = new Set(a.split(' ').filter(Boolean));
  const bWords = new Set(b.split(' ').filter(Boolean));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let matches = 0;
  for (const w of aWords) {
    if (bWords.has(w)) matches++;
  }
  return matches / Math.max(aWords.size, bWords.size);
}

/**
 * Search curated phrases for a match against the input text.
 * Searches the source language (default 'en') translations.
 *
 * Returns the best match with a score, or null.
 */
export function searchCuratedPhrases(text, fromLang = 'en') {
  const normalized = normalize(text);
  if (!normalized) return null;

  const allPhrases = [
    ...travelPhrasesData.phrases,
    ...(travelPhrasesData.common_replies || []),
  ];

  let bestMatch = null;
  let bestScore = 0;

  for (const phrase of allPhrases) {
    const sourceText = phrase.translations?.[fromLang];
    if (!sourceText) continue;

    const phraseNorm = normalize(sourceText);
    let score = 0;

    if (phraseNorm === normalized) {
      score = 1.0; // exact match
    } else if (
      phraseNorm.includes(normalized) ||
      normalized.includes(phraseNorm)
    ) {
      score = 0.85;
    } else {
      score = similarityScore(phraseNorm, normalized);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = phrase;
    }
  }

  if (bestScore >= 0.6) {
    return { phrase: bestMatch, score: bestScore };
  }
  return null;
}

/**
 * Get a phrase translation in the target language.
 * Returns { text, romanization } or null.
 */
export function getPhraseTranslation(phrase, toLang) {
  if (!phrase || !toLang) return null;
  const text = phrase.translations?.[toLang];
  if (!text) return null;
  const romanization = phrase.romanizations?.[toLang] || '';
  return { text, romanization };
}

/* ------------------------------------------------------------------ */
/* Backend translation API                                              */
/* ------------------------------------------------------------------ */

/**
 * Call the backend AI translation endpoint.
 *
 * @param {string} text
 * @param {string} fromLang  ISO 639-1 or 'auto'
 * @param {string} toLang    ISO 639-1
 * @returns {Promise<Object>} backend response
 */
async function callBackendTranslate(text, fromLang, toLang) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        from_lang: fromLang,
        to_lang: toLang,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg =
        err.detail?.message ||
        err.detail?.error ||
        err.detail ||
        `Translation failed (HTTP ${response.status})`;
      const error = new Error(msg);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('Translation timed out. Please try again.');
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Main translate function (offline-first)                              */
/* ------------------------------------------------------------------ */

/**
 * Translate text using a two-tier strategy.
 *
 * Order:
 *  1. Try curated phrase library (instant, offline)
 *  2. If no good match → call backend AI translation (online)
 *  3. If offline and no match → return closest match with warning
 *
 * @param {Object} opts
 * @param {string} opts.text
 * @param {string} opts.fromLang   default 'en'
 * @param {string} opts.toLang
 * @param {boolean} [opts.preferAi] - skip curated lookup if true
 *
 * @returns {Promise<Object>}
 *   {
 *     translation: string,
 *     romanization: string,
 *     source: 'curated' | 'ai' | 'fallback',
 *     confidence: 'high' | 'medium' | 'low',
 *     from_lang: string,
 *     to_lang: string,
 *     cached: boolean,
 *     provider: string,
 *     matched_phrase_id?: string,
 *     warning?: string,
 *   }
 */
export async function translate({
  text,
  fromLang = 'en',
  toLang,
  preferAi = false,
}) {
  if (!text || !text.trim()) {
    throw new Error('Text is required');
  }
  if (!toLang) {
    throw new Error('Target language is required');
  }

  const cleanText = text.trim();

  // Same-language no-op
  if (fromLang === toLang) {
    return {
      translation: cleanText,
      romanization: '',
      source: 'noop',
      confidence: 'high',
      from_lang: fromLang,
      to_lang: toLang,
      cached: false,
      provider: 'noop',
    };
  }

  // Tier 1 — curated phrases (skipped if preferAi)
  if (!preferAi) {
    const match = searchCuratedPhrases(cleanText, fromLang);
    if (match && match.score >= 0.85) {
      const tx = getPhraseTranslation(match.phrase, toLang);
      if (tx) {
        return {
          translation: tx.text,
          romanization: tx.romanization,
          source: 'curated',
          confidence: match.score >= 0.95 ? 'high' : 'medium',
          from_lang: fromLang,
          to_lang: toLang,
          cached: true,
          provider: 'library',
          matched_phrase_id: match.phrase.id,
        };
      }
    }
  }

  // Tier 2 — backend AI
  if (navigator.onLine) {
    try {
      const result = await callBackendTranslate(cleanText, fromLang, toLang);
      return {
        translation: result.translation,
        romanization: result.romanization || '',
        source: 'ai',
        confidence: result.confidence || 'medium',
        from_lang: result.from_lang || fromLang,
        to_lang: result.to_lang || toLang,
        cached: !!result.cached,
        provider: result.provider || 'unknown',
      };
    } catch (e) {
      // Fall through to fallback
      console.warn('[Translator] AI translation failed:', e.message);
    }
  }

  // Tier 3 — offline fallback (closest curated match)
  const fallbackMatch = searchCuratedPhrases(cleanText, fromLang);
  if (fallbackMatch) {
    const tx = getPhraseTranslation(fallbackMatch.phrase, toLang);
    if (tx) {
      return {
        translation: tx.text,
        romanization: tx.romanization,
        source: 'fallback',
        confidence: 'low',
        from_lang: fromLang,
        to_lang: toLang,
        cached: true,
        provider: 'library',
        matched_phrase_id: fallbackMatch.phrase.id,
        warning: navigator.onLine
          ? 'AI translation unavailable. Showing closest match from offline library.'
          : 'You are offline. Showing closest match from offline library.',
      };
    }
  }

  // Nothing matched at all
  throw new Error(
    navigator.onLine
      ? 'Translation failed and no offline match found.'
      : 'You are offline and no curated phrase matches.',
  );
}

/* ------------------------------------------------------------------ */
/* Languages from backend                                               */
/* ------------------------------------------------------------------ */

/**
 * Fetch supported languages from the backend (verification).
 * Falls back to local data on failure.
 */
export async function fetchBackendLanguages() {
  try {
    const response = await fetch(`${API_BASE_URL}/translate/languages`);
    if (response.ok) {
      const data = await response.json();
      return data.languages || {};
    }
  } catch (e) {
    console.warn('[Translator] Backend language fetch failed:', e.message);
  }
  // Fallback to local
  const local = {};
  for (const [code, meta] of Object.entries(travelPhrasesData.languages)) {
    local[code] = meta.name;
  }
  return local;
}