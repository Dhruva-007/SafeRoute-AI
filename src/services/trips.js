import { getAuthHeaders } from './auth';
import {
  cacheAllTrips,
  cacheTrip,
  removeCachedTrip,
  getCachedTrips,
  getCachedTripById,
} from './offlineTrips';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Save a generated trip to the backend.
 * Associates the trip with the authenticated user via Bearer token.
 */
export const saveTrip = async (tripData) => {
  if (!navigator.onLine) {
    throw new Error('You are offline. Saving requires an internet connection.');
  }

  const response = await fetch(`${API_BASE_URL}/trips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(tripData),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to save trip');
  }

  const saved = await response.json();
  await cacheTrip(saved).catch(() => {});
  return saved;
};

/**
 * Fetch all saved trips for the authenticated user, newest first.
 * Falls back to IndexedDB cache when offline.
 */
export const fetchTrips = async () => {
  if (!navigator.onLine) {
    return await getCachedTrips();
  }

  try {
    const response = await fetch(`${API_BASE_URL}/trips`, {
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error('Failed to fetch trips');

    const trips = await response.json();
    await cacheAllTrips(trips).catch(() => {});
    return trips;
  } catch (networkErr) {
    const cached = await getCachedTrips();
    if (cached.length > 0) return cached;
    throw networkErr;
  }
};

/**
 * Fetch a single trip by ID.
 * No auth required — public read for shared trip support.
 */
export const fetchTripById = async (tripId) => {
  if (!navigator.onLine) {
    const cached = await getCachedTripById(tripId);
    if (cached) return cached;
    throw new Error('Trip not available offline');
  }

  try {
    const response = await fetch(`${API_BASE_URL}/trips/${tripId}`);
    if (!response.ok) throw new Error('Trip not found');

    const trip = await response.json();
    await cacheTrip(trip).catch(() => {});
    return trip;
  } catch (networkErr) {
    const cached = await getCachedTripById(tripId);
    if (cached) return cached;
    throw networkErr;
  }
};

/**
 * Update a trip's status (planned | active | completed).
 * Requires auth — backend ownership check will reject if token is missing.
 */
export const updateTripStatus = async (tripId, status) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Status updates require an internet connection.',
    );
  }

  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),   // ← was missing: caused 403
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update trip status');
  }

  const updated = await response.json();
  await cacheTrip(updated).catch(() => {});
  return updated;
};

/**
 * Delete a trip by ID.
 * Requires auth — only the trip owner can delete.
 */
export const deleteTrip = async (tripId) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Deleting requires an internet connection.',
    );
  }

  const response = await fetch(`${API_BASE_URL}/trips/${tripId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),   // ← was missing: caused 403
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete trip');
  }

  const result = await response.json();
  await removeCachedTrip(tripId).catch(() => {});
  return result;
};

/**
 * Update a single activity within a day.
 * Requires auth — backend ownership check on the parent trip.
 */
export const updateActivity = async (
  tripId,
  dayNumber,
  activityIndex,
  updates,
) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Editing requires an internet connection.',
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayNumber}/activities/${activityIndex}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),   // ← was missing: caused 403
      },
      body: JSON.stringify(updates),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to update activity');
  }

  const updated = await response.json();
  await cacheTrip(updated).catch(() => {});
  return updated;
};

/**
 * Add a new activity to a day.
 * Requires auth — backend ownership check on the parent trip.
 */
export const addActivity = async (tripId, dayNumber, activity) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Adding activities requires an internet connection.',
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayNumber}/activities`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),   // ← was missing: caused 403
      },
      body: JSON.stringify(activity),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to add activity');
  }

  const updated = await response.json();
  await cacheTrip(updated).catch(() => {});
  return updated;
};

/**
 * Delete an activity from a day.
 * Requires auth — backend ownership check on the parent trip.
 */
export const deleteActivity = async (tripId, dayNumber, activityIndex) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Deleting requires an internet connection.',
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayNumber}/activities/${activityIndex}`,
    {
      method: 'DELETE',
      headers: {
        ...getAuthHeaders(),   // ← was missing: caused 403
      },
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete activity');
  }

  const updated = await response.json();
  await cacheTrip(updated).catch(() => {});
  return updated;
};

/**
 * Reorder activities within a day.
 * Requires auth — backend ownership check on the parent trip.
 * @param {number[]} newOrder - permutation of current indices
 */
export const reorderDay = async (tripId, dayNumber, newOrder) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Reordering requires an internet connection.',
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayNumber}/reorder`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),   // ← was missing: caused 403
      },
      body: JSON.stringify({ new_order: newOrder }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to reorder day');
  }

  const updated = await response.json();
  await cacheTrip(updated).catch(() => {});
  return updated;
};

/**
 * AI-regenerate a single day. Other days remain untouched.
 * Requires auth — backend ownership check on the parent trip.
 */
export const regenerateDay = async (tripId, dayNumber) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. AI regeneration requires an internet connection.',
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayNumber}/regenerate`,
    {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),   // ← was missing: caused 403
      },
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to regenerate day');
  }

  const result = await response.json();
  if (result?.trip) {
    await cacheTrip(result.trip).catch(() => {});
  }
  return result;
};

/**
 * Find alternative places similar to the given one.
 * No auth required — read-only retrieval endpoint.
 */
export const findAlternatives = async (
  place,
  { category = null, budget = null, limit = 5 } = {},
) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Finding alternatives requires an internet connection.',
    );
  }

  const url = new URL(`${API_BASE_URL}/trips/alternatives/search`);
  url.searchParams.set('place', place);
  if (category) url.searchParams.set('category', category);
  if (budget) url.searchParams.set('budget', budget);
  url.searchParams.set('limit', limit);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to find alternatives');
  }

  return await response.json();
};

/**
 * Create or refresh a share link for a trip.
 * Requires auth — only the trip owner can share.
 * @param {'1d'|'7d'|'30d'|'never'} expiry
 */
export const createShareLink = async (tripId, expiry = '7d') => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Sharing requires an internet connection.',
    );
  }

  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),   // ← was missing: would cause 403 on owned trips
    },
    body: JSON.stringify({ expiry }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create share link');
  }

  return await response.json();
};

/**
 * Revoke a share link for a trip.
 * Requires auth — only the trip owner can revoke.
 */
export const revokeShareLink = async (tripId) => {
  if (!navigator.onLine) {
    throw new Error(
      'You are offline. Revoking requires an internet connection.',
    );
  }

  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/share`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),   // ← was missing: would cause 403 on owned trips
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to revoke share link');
  }

  const updated = await response.json();
  await cacheTrip(updated).catch(() => {});
  return updated;
};

/**
 * Fetch a publicly shared trip by token.
 * No auth required — this is intentionally public.
 */
export const fetchSharedTrip = async (token) => {
  const response = await fetch(`${API_BASE_URL}/trips/shared/${token}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('This share link is invalid or has expired.');
    }
    throw new Error('Failed to load shared trip');
  }

  return await response.json();
};