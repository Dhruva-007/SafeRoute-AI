import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudFog,
  CloudSnow,
  CloudLightning,
  CloudSun,
  Droplets,
  Thermometer,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { fetchForecast } from '../services/weather';

const CONDITION_ICONS = {
  clear: Sun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  heavy_rain: CloudRain,
  thunderstorm: CloudLightning,
  snow: CloudSnow,
  unknown: Cloud,
};

/**
 * WeatherStrip — displays daily weather for a date range.
 * Accepts either:
 *   - city + startDate + endDate  (fetches from backend)
 *   - days[] with weather attached (uses existing data, no fetch)
 */
function WeatherStrip({
  city = 'Hyderabad',
  startDate = null,
  endDate = null,
  days = null,
}) {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Prefer embedded weather from days[] if provided
    if (days && days.length > 0 && days.every((d) => d.weather)) {
      setForecast(
        days.map((d) => ({ ...d.weather, _day: d.day, _date: d.date }))
      );
      return;
    }

    if (!startDate || !endDate) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchForecast(city, startDate, endDate);
        if (!cancelled) {
          const decorated = data.days.map((d, i) => ({
            ...d,
            _day: i + 1,
            _date: d.date,
          }));
          setForecast(decorated);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [city, startDate, endDate, days]);

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="glass-card shadow-soft border border-[#DDD3C5] p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />
        <span className="text-sm text-text-secondary">
          Loading weather forecast...
        </span>
      </div>
    );
  }

  /* ---- Error ---- */
  if (error) {
    return (
      <div className="glass-card shadow-soft border border-[#DDD3C5] p-4 flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-warning" />
        <span className="text-sm text-text-secondary">
          Weather unavailable: {error}
        </span>
      </div>
    );
  }

  if (!forecast || forecast.length === 0) return null;

  /* ---- Strip ---- */
  return (
    <div className="glass-card shadow-soft border border-[#DDD3C5] p-4 overflow-x-auto">
      <div className="flex items-center gap-6 min-w-max">
        {forecast.map((w, idx) => {
          const Icon = CONDITION_ICONS[w.condition_code] || Cloud;
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="flex items-center gap-3 shrink-0 pr-6 border-r border-[#DDD3C5] last:border-r-0 last:pr-0"
              title={`${w.condition} · ${w.precipitation_probability}% chance of rain`}
            >
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-accent-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  Day {w._day}
                </p>
                <p className="text-xs text-text-muted flex items-center gap-1">
                  <Thermometer className="w-3 h-3" />
                  {Math.round(w.temp_max)}° / {Math.round(w.temp_min)}°
                  <span className="text-text-muted/60">·</span>
                  <span className="truncate max-w-[100px]">
                    {w.condition}
                  </span>
                </p>
                {w.precipitation_probability >= 30 && (
                  <p className="text-xs text-accent-primary font-medium flex items-center gap-1 mt-0.5">
                    <Droplets className="w-3 h-3" />
                    {w.precipitation_probability}% rain
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default WeatherStrip;