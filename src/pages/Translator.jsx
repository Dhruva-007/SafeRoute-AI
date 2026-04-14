import React, { useState } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  Languages, ArrowRight, Volume2, Copy, Check,
  MapPin, Utensils, Train, Hotel, Heart, Shield,
  ChevronDown
} from 'lucide-react';

function Translator() {
  const [inputText, setInputText] = useState('');
  const [fromLang, setFromLang] = useState('English');
  const [toLang, setToLang] = useState('Japanese');
  const [translated, setTranslated] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeCategory, setActiveCategory] = useState('greetings');

  const languages = ['English', 'Japanese', 'French', 'Spanish', 'German', 'Korean', 'Thai', 'Italian'];

  const contextPhrases = {
    greetings: [
      { en: 'Hello', local: 'こんにちは (Konnichiwa)' },
      { en: 'Thank you very much', local: 'どうもありがとうございます (Dōmo arigatō gozaimasu)' },
      { en: 'Excuse me', local: 'すみません (Sumimasen)' },
      { en: 'Goodbye', local: 'さようなら (Sayōnara)' },
      { en: 'Yes / No', local: 'はい / いいえ (Hai / Iie)' },
    ],
    food: [
      { en: 'Can I see the menu?', local: 'メニューを見せてください (Menyū wo misete kudasai)' },
      { en: 'I am vegetarian', local: '私はベジタリアンです (Watashi wa bejitarian desu)' },
      { en: 'Water, please', local: 'お水をお願いします (Omizu wo onegai shimasu)' },
      { en: 'The check, please', local: 'お会計お願いします (Okaikei onegai shimasu)' },
      { en: 'This is delicious!', local: 'おいしいです！ (Oishii desu!)' },
    ],
    transport: [
      { en: 'Where is the train station?', local: '駅はどこですか？ (Eki wa doko desu ka?)' },
      { en: 'One ticket to...', local: '...までの切符を一枚 (...made no kippu wo ichimai)' },
      { en: 'How much is the fare?', local: '運賃はいくらですか？ (Unchin wa ikura desu ka?)' },
      { en: 'Is this the right platform?', local: 'このプラットフォームであっていますか？' },
    ],
    hotel: [
      { en: 'I have a reservation', local: '予約があります (Yoyaku ga arimasu)' },
      { en: 'What time is checkout?', local: 'チェックアウトは何時ですか？ (Chekkuauto wa nanji desu ka?)' },
      { en: 'Can I have the WiFi password?', local: 'WiFiのパスワードを教えてください' },
    ],
    emergency: [
      { en: 'I need help!', local: '助けてください！ (Tasukete kudasai!)' },
      { en: 'Call an ambulance!', local: '救急車を呼んでください！ (Kyūkyūsha wo yonde kudasai!)' },
      { en: 'I lost my passport', local: 'パスポートを失くしました (Pasupōto wo nakushimashita)' },
      { en: 'I don\'t feel well', local: '気分が悪いです (Kibun ga warui desu)' },
    ],
  };

  const categories = [
    { key: 'greetings', label: 'Greetings', icon: Heart },
    { key: 'food', label: 'Food & Dining', icon: Utensils },
    { key: 'transport', label: 'Transport', icon: Train },
    { key: 'hotel', label: 'Hotel', icon: Hotel },
    { key: 'emergency', label: 'Emergency', icon: Shield },
  ];

  const handleTranslate = () => {
    if (inputText.trim()) {
      // Simulated translation
      const translations = {
        'hello': 'こんにちは',
        'thank you': 'ありがとう',
        'help': '助けて',
        'where': 'どこ',
      };
      const lower = inputText.toLowerCase();
      const found = Object.keys(translations).find(k => lower.includes(k));
      setTranslated(found ? translations[found] : `[${toLang} translation of: "${inputText}"]`);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Languages}
          title="Context-Aware Translator"
          subtitle="Smart translations adapted to your travel situation."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Translator */}
          <div className="space-y-6">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-5">
                <select
                  value={fromLang}
                  onChange={(e) => setFromLang(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/40 transition-all appearance-none"
                >
                  {languages.map(l => <option key={l} value={l} className="bg-bg-card">{l}</option>)}
                </select>
                <ArrowRight className="w-5 h-5 text-text-muted shrink-0" />
                <select
                  value={toLang}
                  onChange={(e) => setToLang(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/40 transition-all appearance-none"
                >
                  {languages.map(l => <option key={l} value={l} className="bg-bg-card">{l}</option>)}
                </select>
              </div>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type text to translate..."
                rows={4}
                className="w-full px-4 py-3 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/40 transition-all resize-none mb-4"
              />

              <button
                onClick={handleTranslate}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Languages className="w-4 h-4" />
                Translate
              </button>

              {translated && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 p-4 rounded-xl bg-accent-primary/5 border border-accent-primary/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base text-accent-primary font-medium flex-1">{translated}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        <Volume2 className="w-4 h-4 text-text-muted" />
                      </button>
                      <button onClick={() => handleCopy(translated)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-text-muted" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Context Phrases */}
          <div className="glass-card p-6">
            <h3 className="text-base font-semibold text-text-primary mb-4">Context-Aware Phrases</h3>
            
            <div className="flex flex-wrap gap-2 mb-5">
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeCategory === cat.key
                      ? 'bg-accent-primary/15 text-accent-primary'
                      : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.06]'
                  }`}
                >
                  <cat.icon className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {contextPhrases[activeCategory]?.map((phrase, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="p-3.5 rounded-xl bg-white/[0.02] border border-border-subtle hover:bg-white/[0.04] transition-colors group"
                >
                  <p className="text-sm text-text-primary mb-1">{phrase.en}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-accent-primary/90">{phrase.local}</p>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1 rounded hover:bg-white/5">
                        <Volume2 className="w-3.5 h-3.5 text-text-muted" />
                      </button>
                      <button onClick={() => handleCopy(phrase.local)} className="p-1 rounded hover:bg-white/5">
                        <Copy className="w-3.5 h-3.5 text-text-muted" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Translator;