import React from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Siren, Flame, User, Baby, Compass,
  AlertTriangle, Train, ShieldAlert, Users,
  Heart, Phone,
} from 'lucide-react';
import officialNumbers from '../../data/officialEmergencyNumbers.json';
import { dialNumber } from '../../utils/sosTrigger';

const ICON_MAP = {
  siren: Siren,
  shield: Shield,
  ambulance: Heart,
  flame: Flame,
  user: User,
  baby: Baby,
  compass: Compass,
  'alert-triangle': AlertTriangle,
  train: Train,
  'shield-alert': ShieldAlert,
  users: Users,
};

function OfficialEmergencyNumbers() {
  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-danger-soft border border-danger/25 flex items-center justify-center">
          <Siren className="w-4 h-4 text-danger" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Official Emergency Numbers
          </h3>
          <p className="text-xs text-text-muted">
            {officialNumbers.country} · Tap to call
          </p>
        </div>
      </div>

      {/* Featured: 112 (one-tap unified emergency) */}
      <button
        onClick={() => dialNumber('112')}
        className="w-full mb-3 p-4 rounded-2xl bg-danger-soft border border-danger/25 hover:bg-danger/15 transition-all flex items-center gap-3 text-left group"
      >
        <div className="w-12 h-12 rounded-xl bg-danger flex items-center justify-center shrink-0 shadow-soft group-hover:scale-105 transition-transform">
          <Siren className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-danger">112 · All Emergencies</p>
          <p className="text-xs text-text-secondary mt-0.5">
            One number for Police, Fire, Ambulance — works on any phone, even without SIM.
          </p>
        </div>
        <Phone className="w-5 h-5 text-danger shrink-0" />
      </button>

      {/* Grid of other numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {officialNumbers.services
          .filter((s) => s.number !== '112')
          .map((svc, idx) => {
            const Icon = ICON_MAP[svc.icon] || Phone;
            return (
              <motion.button
                key={svc.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => dialNumber(svc.number)}
                className="flex items-center gap-3 p-3 rounded-xl bg-bg-elevated/60 border border-[#DDD3C5] hover:border-accent-primary/30 hover:bg-accent-primary/5 transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-accent-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {svc.name}
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {svc.description}
                  </p>
                </div>
                <span className="text-sm font-bold text-accent-primary group-hover:text-accent-hover shrink-0">
                  {svc.number}
                </span>
              </motion.button>
            );
          })}
      </div>
    </div>
  );
}

export default OfficialEmergencyNumbers;