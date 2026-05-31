const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Fetch weather forecast for a city and date range.
 * Open-Meteo provides forecasts up to 16 days ahead.
 *
 * @param {string} city
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate   YYYY-MM-DD
 * @returns {Promise<{city, start_date, end_date, days: Array}>}
 */
export const fetchForecast = async (city, startDate, endDate) => {
  const url = new URL(`${API_BASE_URL}/weather/forecast`);
  url.searchParams.set('city', city);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to fetch weather');
  }

  return await response.json();
};