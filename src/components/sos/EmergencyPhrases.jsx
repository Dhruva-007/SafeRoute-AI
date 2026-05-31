import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2, Languages, Copy, CheckCircle,
  AlertTriangle, Shield, Heart, MapPin, Map,
  AlertCircle, AlertOctagon, Droplet, HelpCircle,
  MessageCircle,
} from 'lucide-react';
import phrasesData from '../../data/emergencyPhrases.json';
import { useGeofencingContext } from '../../context/GeofencingContext';
import { copyToClipboard } from '../../utils/sosTrigger';

const ICON_MAP = {
  'alert-triangle': AlertTriangle,
  shield: Shield,
  heart: Heart,
  'map-pin': MapPin,
  map: Map,
  'alert-circle': AlertCircle,
  'alert-octagon': AlertOctagon,
  droplet: Droplet,
  'help-circle': HelpCircle,
  'message-circle': MessageCircle,
};

/**
 * Pick the primary language for a given coordinate using the
 * location_language_map in emergencyPhrases.json.
 */
function detectLanguage(lat, lon) {
  if (lat == null || lon == null) return 'hi'; // default Hindi for India
  const regions = phrasesData.location_language_map?.regions || [];
  for (const r of regions) {
    const b = r.bounds;
    if (lat >= b.min_lat && lat <= b.max_lat && lon >= b.min_lon && lon <= b.max_lon) {
      return r.primary_lang;
    }
  }
  return phrasesData.location_language_map?.fallback_lang || 'en';
}

function EmergencyPhrases() {
  const { currentLocation } = useGeofencingContext();
  const detectedLang = useMemo(
    () => detectLanguage(currentLocation?.lat, currentLocation?.lon),
    [currentLocation],
  );

  const [selectedLang, setSelectedLang] = useState(detectedLang);
  const [copiedId, setCopiedId] = useState(null);

  // Update selected language when location changes
  React.useEffect(() => {
    setSelectedLang(detectedLang);
  }, [detectedLang]);

  // Show: English + detected + Hindi (most useful trio for India)
  const visibleLanguages = useMemo(() => {
    const langs = new Set(['en', detectedLang, 'hi']);
    return Array.from(langs).slice(0, 3);
  }, [detectedLang]);

  const handleSpeak = (text, langCode) => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech not supported on this browser');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    // Map our codes to BCP-47
    const bcpMap = {
      en: 'en-IN',
      hi: 'hi-IN',
      te: 'te-IN',
      ta: 'ta-IN',
      kn: 'kn-IN',
      mr: 'mr-IN',
      bn: 'bn-IN',
    };
    utterance.lang = bcpMap[langCode] || 'en-IN';
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = async (text, phraseId) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(phraseId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const selectedLangInfo = phrasesData.languages[selectedLang];

  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center">
            <Languages className="w-4 h-4 text-accent-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Emergency Phrases
            </h3>
            <p className="text-xs text-text-muted">
              {currentLocation
                ? `Auto-detected for your location: ${selectedLangInfo?.native_name || selectedLang}`
                : `Default: ${selectedLangInfo?.native_name || 'Hindi'}`}
            </p>
          </div>
        </div>
      </div>

      {/* Language tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {visibleLanguages.map((code) => {
          const info = phrasesData.languages[code];
          if (!info) return null;
          return (
            <button
              key={code}
              onClick={() => setSelectedLang(code)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                selectedLang === code
                  ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/40 shadow-soft'
                  : 'bg-white/85 text-text-secondary border-[#DDD3C5] hover:bg-[#FAF7F2]'
              }`}
            >
              {info.native_name}
              <span className="text-text-muted ml-1.5">({info.name})</span>
            </button>
          );
        })}
      </div>

      {/* Phrases list */}
      <div className="space-y-2">
        {phrasesData.phrases.map((phrase, idx) => {
          const Icon = ICON_MAP[phrase.icon] || MessageCircle;
          const englishText = phrase.translations.en;
          const localText = phrase.translations[selectedLang];
          const pronunciation =
            selectedLang !== 'en' && phrase.pronunciations?.[selectedLang];

          return (
            <motion.div
              key={phrase.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-accent-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  {/* English */}
                  <p className="text-sm font-semibold text-text-primary">
                    {englishText}
                  </p>

                  {/* Local language (if different from English) */}
                  {selectedLang !== 'en' && localText && (
                    <p className="text-sm text-accent-primary font-medium mt-1">
                      {localText}
                    </p>
                  )}

                  {/* Pronunciation */}
                  {pronunciation && (
                    <p className="text-xs text-text-muted italic mt-0.5">
                      {pronunciation}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Speak */}
                  <button
                    onClick={() =>
                      handleSpeak(localText || englishText, selectedLang)
                    }
                    className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
                    title="Speak"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Copy */}
                  <button
                    onClick={() => handleCopy(localText || englishText, phrase.id)}
                    className="p-1.5 rounded-lg hover:bg-accent-primary/10 text-text-muted hover:text-accent-primary transition-colors"
                    title="Copy"
                  >
                    {copiedId === phrase.id ? (
                      <CheckCircle className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default EmergencyPhrases;