const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Score a single activity for fatigue.
 * @param {Object} activity - { time, place, description, estimated_cost }
 * @param {number} priorActivitiesToday - How many activities came before this one today.
 * @returns {Promise<{score: number, level: string, factors: Object}>}
 */
export const scoreActivity = async (activity, priorActivitiesToday = 0) => {
  const response = await fetch(`${API_BASE_URL}/fatigue/score-activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activity,
      prior_activities_today: priorActivitiesToday,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to score activity');
  }

  return await response.json();
};

/**
 * Get live fatigue for a saved trip's current activity.
 * @param {string} tripId
 * @param {number} day - 1-indexed day number
 * @param {number} activityIndex - 0-indexed activity within the day
 * @returns {Promise<Object>}
 */
export const fetchCurrentFatigue = async (
  tripId,
  day = 1,
  activityIndex = 0
) => {
  const url = new URL(`${API_BASE_URL}/fatigue/trip/${tripId}/current`);
  url.searchParams.set('day', day);
  url.searchParams.set('activity_index', activityIndex);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error('Failed to fetch fatigue');
  }

  return await response.json();
};