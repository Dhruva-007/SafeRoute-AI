import React, { useState } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  Map, MapPin, Shield, AlertTriangle, Info, 
  Phone, Hospital, Building, Search, Activity
} from 'lucide-react';

function SafetyMap() {
  const [selectedZone, setSelectedZone] = useState(null);

  const zones = [
    { id: 1, name: 'Shibuya District', safety: 'high', fatigue: 'LOW', type: 'commercial', x: 35, y: 40 },
    { id: 2, name: 'Shinjuku Station', safety: 'high', fatigue: 'MEDIUM', type: 'transit', x: 45, y: 30 },
    { id: 3, name: 'Roppongi Area', safety: 'medium', fatigue: 'HIGH', type: 'nightlife', x: 60, y: 55 },
    { id: 4, name: 'Akihabara', safety: 'high', fatigue: 'LOW', type: 'commercial', x: 70, y: 35 },
    { id: 5, name: 'Ueno Park', safety: 'high', fatigue: 'LOW', type: 'park', x: 75, y: 25 },
    { id: 6, name: 'Kabukicho', safety: 'low', fatigue: 'HIGH', type: 'nightlife', x: 42, y: 25 },
  ];

  const emergencyServices = [
    { type: 'Hospital', name: 'Tokyo Medical Center', distance: '0.8 km', icon: Hospital },
    { type: 'Police', name: 'Shibuya Police Station', distance: '0.3 km', icon: Building },
    { type: 'Emergency', name: 'Fire Station #12', distance: '1.2 km', icon: Phone },
  ];

  const safetyColors = {
    high: { dot: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/10' },
    medium: { dot: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10' },
    low: { dot: 'bg-red-500', text: 'text-red-400', bg: 'bg-red-500/10' },
  };

  const fatigueColors = {
    LOW: 'text-green-400',
    MEDIUM: 'text-amber-400',
    HIGH: 'text-red-400',
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Map}
          title="Safety Map"
          subtitle="Real-time safety assessment of areas around you. Tap zones for details."
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Area */}
          <div className="lg:col-span-2">
            <div className="glass-card p-6">
              {/* Search */}
              <div className="relative mb-6">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search location..."
                  defaultValue="Tokyo, Japan"
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/40 transition-all"
                />
              </div>

              {/* Map Visualization */}
              <div className="aspect-[16/10] rounded-xl bg-white/[0.02] border border-border-subtle relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.06]">
                  <div className="grid grid-cols-12 grid-rows-8 h-full">
                    {Array.from({ length: 96 }).map((_, i) => (
                      <div key={i} className="border border-white/20" />
                    ))}
                  </div>
                </div>

                {zones.map((zone) => (
                  <button
                    key={zone.id}
                    onClick={() => setSelectedZone(zone)}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10"
                    style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                  >
                    <div className={`w-4 h-4 rounded-full ${safetyColors[zone.safety].dot} ${
                      zone.safety === 'low' ? 'animate-pulse' : 'animate-pulse-soft'
                    }`} />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="bg-bg-card border border-border-subtle rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg">
                        <p className="text-xs font-medium text-text-primary">{zone.name}</p>
                        <p className={`text-xs ${safetyColors[zone.safety].text}`}>Safety: {zone.safety}</p>
                      </div>
                    </div>
                  </button>
                ))}

                <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-lg shadow-blue-500/30" />
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-ping" />
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 mt-4">
                {[
                  { label: 'High Safety', color: 'bg-green-500' },
                  { label: 'Moderate', color: 'bg-amber-500' },
                  { label: 'Caution', color: 'bg-red-500' },
                  { label: 'You', color: 'bg-blue-500' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span className="text-xs text-text-muted">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Selected Zone */}
            {selectedZone ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-6"
              >
                <h3 className="text-base font-semibold text-text-primary mb-1">{selectedZone.name}</h3>
                <p className="text-sm text-text-muted capitalize mb-4">{selectedZone.type} area</p>
                
                <div className="flex items-center gap-3 mb-4">
                  <div className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${safetyColors[selectedZone.safety].bg} ${safetyColors[selectedZone.safety].text}`}>
                    {selectedZone.safety} Safety
                  </div>
                </div>

                {/* Fatigue Level for Zone */}
                <div className="p-3 rounded-lg bg-white/[0.03] border border-border-subtle mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-text-muted" />
                      <span className="text-sm text-text-secondary">Expected Fatigue</span>
                    </div>
                    <span className={`text-sm font-semibold ${fatigueColors[selectedZone.fatigue]}`}>
                      {selectedZone.fatigue}
                    </span>
                  </div>
                </div>

                {selectedZone.safety === 'low' && (
                  <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-medium text-red-400">Caution Advised</span>
                    </div>
                    <p className="text-xs text-text-secondary">Exercise increased awareness in this area, especially at night.</p>
                  </div>
                )}

                {selectedZone.fatigue === 'HIGH' && (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-amber-400">High Fatigue Zone</span>
                    </div>
                    <p className="text-xs text-text-secondary">This area involves significant walking. Plan for rest stops.</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="glass-card p-6 text-center">
                <Info className="w-8 h-8 text-text-muted mx-auto mb-3" />
                <p className="text-sm text-text-secondary">Select a zone on the map to view details.</p>
              </div>
            )}

            {/* Emergency Services */}
            <div className="glass-card p-6">
              <h3 className="text-base font-semibold text-text-primary mb-4">Nearby Emergency Services</h3>
              <div className="space-y-3">
                {emergencyServices.map((service, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]">
                    <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                      <service.icon className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{service.name}</p>
                      <p className="text-xs text-text-muted">{service.type} • {service.distance}</p>
                    </div>
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

export default SafetyMap;