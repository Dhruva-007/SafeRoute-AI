import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, MapPin } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import SOSButton from '../components/sos/SOSButton';
import SosActionSheet from '../components/sos/SosActionSheet';
import FamilyContactsManager from '../components/sos/FamilyContactsManager';
import OfficialEmergencyNumbers from '../components/sos/OfficialEmergencyNumbers';
import NearbyServices from '../components/sos/NearbyServices';
import EmergencyPhrases from '../components/sos/EmergencyPhrases';
import { useGeofencingContext } from '../context/GeofencingContext';
import { formatCoordinates } from '../utils/sosTrigger';

function SOS() {
  const [activated, setActivated] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { currentLocation } = useGeofencingContext();

  const handleActivate = () => {
    setActivated(true);
    setSheetOpen(true);
  };

  const handleDeactivate = () => {
    setActivated(false);
    setSheetOpen(false);
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={AlertTriangle}
          title="SOS Emergency Center"
          subtitle="Instant access to emergency services, contacts, and safety tools."
        />

        {/* Location strip */}
        {currentLocation && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card shadow-soft border border-[#DDD3C5] p-4 mb-6 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-success-soft border border-success/25 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted">Your current location</p>
              <p className="text-sm font-mono text-text-primary">
                {formatCoordinates(currentLocation.lat, currentLocation.lon)}
                <span className="text-text-muted ml-2 text-xs">
                  · ±{currentLocation.accuracy?.toFixed(0) || '?'}m
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft border border-success/25">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-semibold text-success">Live</span>
            </div>
          </motion.div>
        )}

        {!currentLocation && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card shadow-soft border border-warning/25 bg-warning-soft/50 p-4 mb-6 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning mb-0.5">
                Location not enabled
              </p>
              <p className="text-xs text-text-secondary">
                Enable Live Tracking on the Dashboard so your location can be
                shared in case of emergency.
              </p>
            </div>
          </motion.div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: SOS Button + Family contacts */}
          <div className="space-y-6">
            <div className="glass-card shadow-soft border border-[#DDD3C5] p-8 flex items-center justify-center min-h-[360px]">
              <SOSButton
                activated={activated}
                onActivate={handleActivate}
                onCancel={handleDeactivate}
              />
            </div>

            <FamilyContactsManager />
          </div>

          {/* Right: Official numbers + Nearby services + Phrases */}
          <div className="space-y-6">
            <OfficialEmergencyNumbers />
            <NearbyServices />
            <EmergencyPhrases />
          </div>
        </div>
      </div>

      {/* SOS Action Sheet */}
      <SosActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onDeactivate={handleDeactivate}
      />
    </div>
  );
}

export default SOS;