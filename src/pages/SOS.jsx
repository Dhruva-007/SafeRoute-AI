import React, { useState } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  AlertTriangle, Phone, MapPin, Shield, Send, 
  Volume2, Users, Heart, Siren, Radio
} from 'lucide-react';

function SOS() {
  const [activated, setActivated] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const handleSOS = () => {
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setActivated(true);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCancel = () => {
    setCountdown(null);
    setActivated(false);
  };

  const emergencyContacts = [
    { name: 'Local Emergency', number: '110', type: 'Police' },
    { name: 'Ambulance', number: '119', type: 'Medical' },
    { name: 'Embassy Hotline', number: '+1-202-XXX-XXXX', type: 'Embassy' },
    { name: 'SafeRoute Support', number: '1-800-SAFE', type: 'Support' },
  ];

  const emergencyPhrases = [
    { en: 'I need help!', local: '助けてください！ (Tasukete kudasai!)', lang: 'Japanese' },
    { en: 'Call the police!', local: '警察を呼んでください！ (Keisatsu wo yonde kudasai!)', lang: 'Japanese' },
    { en: 'I need a doctor.', local: '医者が必要です。 (Isha ga hitsuyō desu.)', lang: 'Japanese' },
    { en: 'Where is the hospital?', local: '病院はどこですか？ (Byōin wa doko desu ka?)', lang: 'Japanese' },
  ];

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={AlertTriangle}
          title="SOS Emergency Center"
          subtitle="Instant access to emergency services and safety tools."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SOS Button */}
          <div className="glass-card p-8 flex flex-col items-center justify-center min-h-[320px]">
            {!activated && countdown === null ? (
              <>
                <p className="text-sm text-text-secondary mb-6 text-center">Press and hold for emergency alert</p>
                <button
                  onClick={handleSOS}
                  className="w-40 h-40 rounded-full bg-red-600 hover:bg-red-500 transition-all duration-250 flex items-center justify-center shadow-xl shadow-red-500/20 hover:shadow-red-500/30 hover:scale-105 active:scale-95 relative"
                >
                  <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
                  <div className="relative flex flex-col items-center">
                    <Siren className="w-10 h-10 text-white mb-2" />
                    <span className="text-white text-lg font-bold">SOS</span>
                  </div>
                </button>
                <p className="text-xs text-text-muted mt-6 text-center">
                  This will share your location and alert emergency contacts
                </p>
              </>
            ) : countdown !== null ? (
              <>
                <p className="text-sm text-text-secondary mb-6">Activating SOS in...</p>
                <div className="w-40 h-40 rounded-full border-4 border-red-500 flex items-center justify-center relative">
                  <motion.div
                    key={countdown}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-5xl font-bold text-red-400"
                  >
                    {countdown}
                  </motion.div>
                </div>
                <button onClick={handleCancel} className="btn-secondary mt-6 !border-red-500/30 !text-red-400">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center"
                >
                  <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                    <Radio className="w-10 h-10 text-red-400 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold text-red-400 mb-2">SOS Activated</h3>
                  <p className="text-sm text-text-secondary mb-1">Your location has been shared</p>
                  <p className="text-sm text-text-secondary mb-6">Emergency contacts notified</p>

                  <div className="flex items-center gap-2 justify-center text-xs text-text-muted mb-6">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>35.6762° N, 139.6503° E</span>
                  </div>

                  <button onClick={handleCancel} className="btn-secondary !border-red-500/30 !text-red-400">
                    Deactivate SOS
                  </button>
                </motion.div>
              </>
            )}
          </div>

          {/* Right side */}
          <div className="space-y-6">
            {/* Emergency Contacts */}
            <div className="glass-card p-6">
              <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Phone className="w-5 h-5 text-accent-primary" />
                Emergency Contacts
              </h3>
              <div className="space-y-3">
                {emergencyContacts.map((contact, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{contact.name}</p>
                      <p className="text-xs text-text-muted">{contact.type}</p>
                    </div>
                    <a href={`tel:${contact.number}`} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors">
                      <Phone className="w-3.5 h-3.5" />
                      {contact.number}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Emergency Phrases */}
            <div className="glass-card p-6">
              <h3 className="text-base font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-accent-primary" />
                Emergency Phrases
              </h3>
              <div className="space-y-3">
                {emergencyPhrases.map((phrase, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-border-subtle">
                    <p className="text-sm font-medium text-text-primary mb-1">{phrase.en}</p>
                    <p className="text-sm text-accent-primary">{phrase.local}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SOS;