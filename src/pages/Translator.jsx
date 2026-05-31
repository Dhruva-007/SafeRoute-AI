import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Languages, MessageCircle, Shield } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LiveTranslator from '../components/translator/LiveTranslator';
import PhraseLibrary from '../components/translator/PhraseLibrary';
import ContextAwareSuggestions from '../components/translator/ContextAwareSuggestions';
import ConversationMode from '../components/translator/ConversationMode';

function Translator() {
  const [travelerLang, setTravelerLang] = useState('en');
  const [localLang, setLocalLang] = useState('hi');

  const [conversationOpen, setConversationOpen] = useState(false);
  const [conversationPhrase, setConversationPhrase] = useState(null);

  // Featured category set by context-aware suggestions; PhraseLibrary highlights it
  const [featuredCategory, setFeaturedCategory] = useState(null);

  /* -------- Cross-component sync -------- */

  const handleLiveLanguageChange = ({ fromLang, toLang }) => {
    if (fromLang) setTravelerLang(fromLang);
    if (toLang) setLocalLang(toLang);
  };

  const handlePhraseSelect = (phrase) => {
    setConversationPhrase(phrase);
    setConversationOpen(true);
  };

  const handleCategoryClick = (categoryId) => {
    setFeaturedCategory(categoryId);
    // Smooth scroll to library
    setTimeout(() => {
      const el = document.getElementById('phrase-library-anchor');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Languages}
          title="Smart Translator"
          subtitle="Context-aware travel translation with offline phrase library and AI."
        />

        {/* Value proposition strip */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card shadow-soft border border-[#DDD3C5] p-4 mb-6"
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-success-soft border border-success/25 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">
                  Offline-ready
                </p>
                <p className="text-xs text-text-muted">
                  Emergency phrases work anywhere
                </p>
              </div>
            </div>

            <div className="hidden sm:block w-px h-8 bg-[#DDD3C5]" />

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center shrink-0">
                <Languages className="w-4 h-4 text-accent-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">
                  Context-aware
                </p>
                <p className="text-xs text-text-muted">
                  Suggests phrases based on where you are
                </p>
              </div>
            </div>

            <div className="hidden sm:block w-px h-8 bg-[#DDD3C5]" />

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-warning-soft border border-warning/25 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-warning" />
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">
                  Conversation mode
                </p>
                <p className="text-xs text-text-muted">
                  Show big-text cards in noisy places
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column: Live translator + Context suggestions */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <LiveTranslator
              initialFromLang={travelerLang}
              initialToLang={localLang}
              onLanguageChange={handleLiveLanguageChange}
            />

            <ContextAwareSuggestions
              targetLang={localLang}
              sourceLang={travelerLang}
              onPhraseSelect={handlePhraseSelect}
              onCategoryClick={handleCategoryClick}
            />
          </motion.div>

          {/* Right column: Phrase library */}
          <motion.div
            id="phrase-library-anchor"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <PhraseLibrary
              targetLang={localLang}
              onTargetLangChange={setLocalLang}
              sourceLang={travelerLang}
              onPhraseSelect={handlePhraseSelect}
              featuredCategoryId={featuredCategory}
            />
          </motion.div>
        </div>
      </div>

      {/* Conversation Mode modal */}
      <ConversationMode
        open={conversationOpen}
        onClose={() => setConversationOpen(false)}
        phrase={conversationPhrase}
        travelerLang={travelerLang}
        localLang={localLang}
      />
    </div>
  );
}

export default Translator;