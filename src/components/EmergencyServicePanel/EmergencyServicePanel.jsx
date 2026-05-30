import React from 'react';
import { motion } from 'framer-motion';
import { 
  X, Phone, Globe, Mail, MapPin, Clock, Activity, 
  CheckCircle, AlertCircle, Navigation, ExternalLink,
  Shield, Bed, Accessibility
} from 'lucide-react';
import { SERVICE_TYPE_INFO, CONFIDENCE_LABELS } from '../../types/riskZone';

export default function EmergencyServicePanel({ service, userLocation, onClose }) {
  if (!service) return null;
  
  const typeInfo = SERVICE_TYPE_INFO[service.service_type] || SERVICE_TYPE_INFO.hospital;
  const confidenceLabel = CONFIDENCE_LABELS[service.confidence_level] || 'Unknown';
  
  // Calculate distance from user
  const distance = service.distance_km !== undefined 
    ? service.distance_km 
    : userLocation 
      ? haversineKm(userLocation.lat, userLocation.lon, service.latitude, service.longitude)
      : null;
  
  // Estimated walking/driving time
  const walkingMinutes = distance ? Math.round(distance * 12) : null;  // ~5 km/h
  const drivingMinutes = distance ? Math.round(distance * 2) : null;   // ~30 km/h city
  
  // Action handlers
  const handleCall = () => {
    if (service.phone) {
      window.location.href = `tel:${service.phone.replace(/\s/g, '')}`;
    }
  };
  
  const handleNavigate = () => {
    // Open in default maps app
    const lat = service.latitude;
    const lon = service.longitude;
    
    // Try to detect platform
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
      window.open(`maps://maps.apple.com/?daddr=${lat},${lon}`, '_blank');
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
        '_blank'
      );
    }
  };
  
  const handleWebsite = () => {
    if (service.website) {
      window.open(service.website, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 400 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 400 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed top-20 right-4 left-4 sm:left-auto sm:right-4 sm:max-w-md max-h-[calc(100vh-100px)] z-[999] glass-card overflow-hidden flex flex-col shadow-2xl"
      style={{ borderTop: `4px solid ${typeInfo.color}` }}
    >
      {/* Header */}
      <div className="p-4 border-b border-border-subtle">
        <div className="flex items-start gap-3">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl"
            style={{ background: typeInfo.bgColor, border: `1px solid ${typeInfo.color}40` }}
          >
            {typeInfo.icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span 
                className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded text-white"
                style={{ background: typeInfo.color }}
              >
                {typeInfo.label}
              </span>
              {service.is_24_7 ? (
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                  24/7
                </span>
              ) : null}
              {service.has_emergency ? (
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                  ER
                </span>
              ) : null}
            </div>
            <h2 className="text-base font-bold text-text-primary leading-tight">
              {service.name}
            </h2>
            {service.speciality && (
              <p className="text-xs text-text-muted mt-1">{service.speciality}</p>
            )}
          </div>
          
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>
      
      {/* Distance Banner */}
      {distance !== null && (
        <div className="px-4 py-3 bg-blue-500/5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <Navigation className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-text-primary">
                {distance < 1 
                  ? `${Math.round(distance * 1000)} m away`
                  : `${distance.toFixed(2)} km away`
                }
              </div>
              <div className="text-xs text-text-muted">
                ~{walkingMinutes} min walk · ~{drivingMinutes} min drive
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="p-4 grid grid-cols-2 gap-2 border-b border-border-subtle">
        {service.phone && typeInfo.callable ? (
          <button
            onClick={handleCall}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Phone className="w-4 h-4" />
            Call Now
          </button>
        ) : (
          <button
            disabled
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/[0.04] text-text-muted text-sm font-medium rounded-lg cursor-not-allowed"
          >
            <Phone className="w-4 h-4" />
            No Phone
          </button>
        )}
        
        <button
          onClick={handleNavigate}
          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Navigation className="w-4 h-4" />
          Navigate
        </button>
      </div>
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Contact Info */}
        <div className="p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-text-muted font-medium">
            Contact Information
          </h3>
          
          {service.phone ? (
            <InfoRow
              icon={<Phone className="w-4 h-4" />}
              label="Phone"
              value={service.phone}
              actionable
              onClick={handleCall}
            />
          ) : (
            <InfoRow
              icon={<Phone className="w-4 h-4" />}
              label="Phone"
              value="Not available"
              muted
            />
          )}
          
          {service.phone_emergency && (
            <InfoRow
              icon={<AlertCircle className="w-4 h-4 text-red-400" />}
              label="Emergency"
              value={service.phone_emergency}
              actionable
              onClick={() => window.location.href = `tel:${service.phone_emergency}`}
              highlight
            />
          )}
          
          {service.website && (
            <InfoRow
              icon={<Globe className="w-4 h-4" />}
              label="Website"
              value={shortenUrl(service.website)}
              actionable
              onClick={handleWebsite}
            />
          )}
          
          {service.email && (
            <InfoRow
              icon={<Mail className="w-4 h-4" />}
              label="Email"
              value={service.email}
              actionable
              onClick={() => window.location.href = `mailto:${service.email}`}
            />
          )}
        </div>
        
        {/* Location */}
        <div className="p-4 border-t border-border-subtle space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-text-muted font-medium">
            Location
          </h3>
          
          {service.address_full ? (
            <InfoRow
              icon={<MapPin className="w-4 h-4" />}
              label="Address"
              value={service.address_full}
            />
          ) : (
            <InfoRow
              icon={<MapPin className="w-4 h-4" />}
              label="Address"
              value="Address not available"
              muted
            />
          )}
          
          <InfoRow
            icon={<MapPin className="w-4 h-4" />}
            label="Coordinates"
            value={`${service.latitude.toFixed(5)}, ${service.longitude.toFixed(5)}`}
            mono
          />
        </div>
        
        {/* Operating Hours */}
        {service.opening_hours && (
          <div className="p-4 border-t border-border-subtle space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-text-muted font-medium">
              Operating Hours
            </h3>
            <InfoRow
              icon={<Clock className="w-4 h-4" />}
              label="Hours"
              value={service.opening_hours}
            />
          </div>
        )}
        
        {/* Capabilities */}
        {(service.has_emergency || service.beds || service.wheelchair) && (
          <div className="p-4 border-t border-border-subtle space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-text-muted font-medium">
              Capabilities
            </h3>
            
            {service.has_emergency && (
              <InfoRow
                icon={<Shield className="w-4 h-4 text-red-400" />}
                label="Emergency Department"
                value="Available"
              />
            )}
            
            {service.beds && (
              <InfoRow
                icon={<Bed className="w-4 h-4" />}
                label="Beds"
                value={`${service.beds} beds`}
              />
            )}
            
            {service.wheelchair && (
              <InfoRow
                icon={<Accessibility className="w-4 h-4" />}
                label="Wheelchair Access"
                value={service.wheelchair === 'yes' ? 'Yes' : service.wheelchair === 'no' ? 'No' : 'Limited'}
              />
            )}
          </div>
        )}
        
        {/* Operator */}
        {service.operator && (
          <div className="p-4 border-t border-border-subtle space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-text-muted font-medium">
              Operator
            </h3>
            <InfoRow
              icon={<Activity className="w-4 h-4" />}
              label="Operated by"
              value={service.operator}
            />
          </div>
        )}
        
        {/* Data Quality */}
        <div className="p-4 border-t border-border-subtle">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-text-muted">
              <CheckCircle className="w-3 h-3" />
              Data Quality
            </div>
            <div className="flex items-center gap-1">
              <span className="text-text-secondary font-medium">{confidenceLabel}</span>
              <span className="text-text-muted">
                ({(service.confidence_score * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function InfoRow({ icon, label, value, actionable, onClick, mono, muted, highlight }) {
  const content = (
    <div className={`flex items-start gap-3 ${actionable ? 'cursor-pointer hover:bg-white/[0.03] -mx-2 px-2 py-1 rounded-lg transition-colors' : ''}`}>
      <div className={`shrink-0 mt-0.5 ${muted ? 'text-text-muted' : 'text-text-secondary'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
          {label}
        </div>
        <div className={`text-sm break-words ${
          mono ? 'font-mono' : ''
        } ${
          muted ? 'text-text-muted italic' : 
          highlight ? 'text-red-400 font-semibold' :
          'text-text-primary'
        }`}>
          {value}
        </div>
      </div>
      {actionable && (
        <ExternalLink className="w-3 h-3 text-text-muted shrink-0 mt-1" />
      )}
    </div>
  );
  
  if (actionable && onClick) {
    return <div onClick={onClick}>{content}</div>;
  }
  return content;
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '') + (u.pathname !== '/' ? u.pathname.substring(0, 30) : '');
  } catch {
    return url.substring(0, 50);
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + 
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}