const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Save a generated trip to the backend.
 * @param {Object} tripData - The full trip object including days, activities, fatigue scores.
 * @returns {Promise<Object>} Saved trip with generated id and created_at.
 */
export const saveTrip = async (tripData) => {
  const response = await fetch(`${API_BASE_URL}/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tripData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to save trip');
  }

  return await response.json();
};

/**
 * Fetch all saved trips, newest first.
 * @returns {Promise<Array>}
 */
export const fetchTrips = async () => {
  const response = await fetch(`${API_BASE_URL}/trips`);

  if (!response.ok) {
    throw new Error('Failed to fetch trips');
  }

  return await response.json();
};

/**
 * Fetch a single trip by ID.
 * @param {string} tripId
 * @returns {Promise<Object>}
 */
export const fetchTripById = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}`);

  if (!response.ok) {
    throw new Error('Trip not found');
  }

  return await response.json();
};

/**
 * Update a trip's status.
 * @param {string} tripId
 * @param {'planned'|'active'|'completed'} status
 */
export const updateTripStatus = async (tripId, status) => {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error('Failed to update trip status');
  }

  return await response.json();
};

/**
 * Delete a trip by ID.
 * @param {string} tripId
 */
export const deleteTrip = async (tripId) => {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete trip');
  }

  return await response.json();
};