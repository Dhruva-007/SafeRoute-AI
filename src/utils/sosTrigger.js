/**
 * SOS Trigger Utility
 *
 * Handles the actual SOS actions:
 *  - Build a Google Maps location URL from coords
 *  - Build a pre-filled SMS body with location
 *  - Open SMS app to send to multiple contacts
 *  - Trigger Web Share API
 *  - Auto-dial emergency numbers
 *  - Copy location to clipboard
 */

import { normalizePhone } from '../services/emergencyContacts';

/* ------------------------------------------------------------------ */
/* Location URL builders                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a Google Maps URL that opens to the given coordinates.
 */
export function buildLocationUrl(lat, lon) {
  if (lat == null || lon == null) return null;
  const lat6 = Number(lat).toFixed(6);
  const lon6 = Number(lon).toFixed(6);
  return `https://www.google.com/maps?q=${lat6},${lon6}`;
}

/**
 * Build a short human-readable coordinates string.
 */
export function formatCoordinates(lat, lon) {
  if (lat == null || lon == null) return 'Location unavailable';
  return `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;
}

/* ------------------------------------------------------------------ */
/* Message builder                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build the SOS message body.
 *
 * @param {Object} opts
 * @param {number} opts.lat
 * @param {number} opts.lon
 * @param {string} [opts.userName] - sender's name for personalization
 * @param {boolean} [opts.includeTimestamp]
 */
export function buildSosMessage({
  lat,
  lon,
  userName = null,
  includeTimestamp = true,
} = {}) {
  const sender = userName ? userName : 'I';
  const lines = [];

  lines.push(`🚨 SOS EMERGENCY ALERT 🚨`);
  lines.push('');
  lines.push(
    `${sender} need${userName ? 's' : ''} help. This is an automated emergency alert from SafeRoute AI.`,
  );

  if (lat != null && lon != null) {
    const url = buildLocationUrl(lat, lon);
    lines.push('');
    lines.push(`📍 My location:`);
    lines.push(formatCoordinates(lat, lon));
    lines.push(url);
  } else {
    lines.push('');
    lines.push(`⚠️ Location could not be determined.`);
  }

  if (includeTimestamp) {
    lines.push('');
    lines.push(
      `🕒 Sent: ${new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}`,
    );
  }

  lines.push('');
  lines.push(`Please call me immediately or contact local emergency (112).`);

  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* SMS — open native SMS app with pre-filled body                      */
/* ------------------------------------------------------------------ */

/**
 * Open native SMS app with one or more recipients and pre-filled body.
 * Most platforms support comma-separated numbers in `sms:` URI.
 *
 * @param {string[]} phoneNumbers
 * @param {string} body
 */
export function openSmsApp(phoneNumbers, body) {
  if (!phoneNumbers || phoneNumbers.length === 0) {
    throw new Error('No recipients provided');
  }

  const cleaned = phoneNumbers
    .map((p) => normalizePhone(p))
    .filter(Boolean);

  if (cleaned.length === 0) {
    throw new Error('No valid phone numbers');
  }

  // iOS uses & separator inside body param; Android uses ?
  // The widely compatible format: sms:1234,5678?body=...
  const recipients = cleaned.join(',');
  const encodedBody = encodeURIComponent(body);

  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';

  const url = `sms:${recipients}${separator}body=${encodedBody}`;

  // Use location.href to trigger native handler
  window.location.href = url;
}

/* ------------------------------------------------------------------ */
/* Web Share API                                                       */
/* ------------------------------------------------------------------ */

/**
 * Use Web Share API to share location with any installed app.
 * Falls back gracefully if not supported.
 */
export async function shareViaWebShare({ lat, lon, body, title = 'SOS Alert' }) {
  if (!navigator.share) {
    throw new Error('Web Share API not supported on this device');
  }

  const url = buildLocationUrl(lat, lon);
  const shareData = {
    title,
    text: body,
  };
  if (url) shareData.url = url;

  await navigator.share(shareData);
}

export function isWebShareSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/* ------------------------------------------------------------------ */
/* Phone call (tel: link)                                              */
/* ------------------------------------------------------------------ */

/**
 * Trigger a phone call to the given number.
 */
export function dialNumber(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number required');
  }
  const cleaned = normalizePhone(phoneNumber);
  if (!cleaned) {
    throw new Error('Invalid phone number');
  }
  window.location.href = `tel:${cleaned}`;
}

/* ------------------------------------------------------------------ */
/* Clipboard                                                           */
/* ------------------------------------------------------------------ */

/**
 * Copy text to clipboard (modern API, fallback).
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('Clipboard API failed, trying fallback', e);
    }
  }

  // Fallback for older browsers / non-secure contexts
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error('Copy failed:', e);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Combined SOS action                                                 */
/* ------------------------------------------------------------------ */

/**
 * Returns a structured object describing what actions are possible
 * given the current state.
 */
export function getSosCapabilities({ hasLocation, hasContacts }) {
  return {
    can_send_sms: hasContacts,
    can_share: isWebShareSupported(),
    can_call: hasContacts,
    can_share_location: hasLocation,
    location_quality: hasLocation ? 'available' : 'unavailable',
  };
}