import { openDB } from 'idb';

const DB_NAME = 'saferoute-trips';
const DB_VERSION = 1;
const STORE_TRIPS = 'trips';
const STORE_META = 'meta';

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_TRIPS)) {
          db.createObjectStore(STORE_TRIPS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      },
    });
  }
  return dbPromise;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Save (or replace) all trips in IndexedDB.
 * Replaces the entire collection to stay in sync with server.
 */
export async function cacheAllTrips(trips) {
  if (!Array.isArray(trips)) return;
  const db = await getDB();
  const tx = db.transaction([STORE_TRIPS, STORE_META], 'readwrite');
  const store = tx.objectStore(STORE_TRIPS);

  // Clear existing then insert fresh
  await store.clear();
  for (const trip of trips) {
    if (trip && trip.id) await store.put(trip);
  }

  // Save last-sync timestamp
  await tx.objectStore(STORE_META).put(Date.now(), 'last_sync');
  await tx.done;
}

/**
 * Upsert a single trip (used after create/update/delete).
 */
export async function cacheTrip(trip) {
  if (!trip || !trip.id) return;
  const db = await getDB();
  await db.put(STORE_TRIPS, trip);
}

/**
 * Remove a trip from cache (used after server-side delete).
 */
export async function removeCachedTrip(tripId) {
  if (!tripId) return;
  const db = await getDB();
  await db.delete(STORE_TRIPS, tripId);
}

/**
 * Read all cached trips, newest first.
 */
export async function getCachedTrips() {
  const db = await getDB();
  const trips = await db.getAll(STORE_TRIPS);
  return trips.sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

/**
 * Read a single cached trip by ID.
 */
export async function getCachedTripById(tripId) {
  if (!tripId) return null;
  const db = await getDB();
  const trip = await db.get(STORE_TRIPS, tripId);
  return trip || null;
}

/**
 * Get the timestamp of the last successful sync.
 */
export async function getLastSyncTime() {
  const db = await getDB();
  const ts = await db.get(STORE_META, 'last_sync');
  return ts || null;
}

/**
 * Wipe the entire offline cache.
 */
export async function clearOfflineCache() {
  const db = await getDB();
  const tx = db.transaction([STORE_TRIPS, STORE_META], 'readwrite');
  await tx.objectStore(STORE_TRIPS).clear();
  await tx.objectStore(STORE_META).clear();
  await tx.done;
}