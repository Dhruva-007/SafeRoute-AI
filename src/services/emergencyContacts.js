/**
 * Emergency Contacts Service
 *
 * Manages user's family/emergency contacts with IndexedDB primary
 * storage and localStorage backup. Maximum 5 contacts per user.
 *
 * Contact shape:
 * {
 *   id: string (uuid),
 *   name: string,
 *   phone: string,
 *   relation: string,          // 'family' | 'friend' | 'medical' | 'other'
 *   is_primary: boolean,       // primary contact gets called first
 *   created_at: string (ISO),
 *   updated_at: string (ISO),
 * }
 */

import { openDB } from 'idb';

const DB_NAME = 'saferoute-emergency';
const DB_VERSION = 1;
const STORE_CONTACTS = 'contacts';
const STORE_META = 'meta';

const LOCAL_STORAGE_KEY = 'saferoute_emergency_contacts_backup';
const MAX_CONTACTS = 5;

const VALID_RELATIONS = ['family', 'friend', 'medical', 'other'];

let dbPromise = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
          db.createObjectStore(STORE_CONTACTS, { keyPath: 'id' });
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
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function generateId() {
  // Simple UUID v4 substitute (no extra dependency)
  return (
    'c-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).substring(2, 11)
  );
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Normalize phone number: strip spaces, dashes, parens.
 * Preserve leading + for country code.
 */
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).trim();
  // Keep leading +, strip everything else non-digit
  const hasPlus = cleaned.startsWith('+');
  cleaned = cleaned.replace(/[^\d]/g, '');
  return hasPlus ? '+' + cleaned : cleaned;
}

/**
 * Validate a phone number — must be 10 digits (India) or 12-13 with country code.
 */
function isValidPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const digits = normalized.replace(/^\+/, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Sync IndexedDB → localStorage for fast initial reads.
 */
async function syncToLocalStorage(contacts) {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        contacts,
        synced_at: nowIso(),
      }),
    );
  } catch (e) {
    // Quota or private mode — non-fatal
    console.warn('[EmergencyContacts] localStorage sync failed:', e);
  }
}

/**
 * Read backup from localStorage (synchronous, fast).
 */
function readLocalStorageBackup() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.contacts) ? parsed.contacts : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

class EmergencyContactsService {
  constructor() {
    this._cache = null; // in-memory cache for fast repeated reads
    this._listeners = new Set();
  }

  /**
   * Subscribe to changes. Returns an unsubscribe function.
   */
  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify() {
    for (const cb of this._listeners) {
      try {
        cb(this._cache || []);
      } catch (e) {
        console.error('[EmergencyContacts] Listener error:', e);
      }
    }
  }

  /**
   * Read all contacts. Uses localStorage for instant first paint,
   * then refreshes from IndexedDB.
   */
  getAllSync() {
    if (this._cache) return [...this._cache];
    return readLocalStorageBackup();
  }

  async getAll() {
    try {
      const db = await getDB();
      const contacts = await db.getAll(STORE_CONTACTS);
      // Sort: primary first, then by created_at
      contacts.sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
        );
      });
      this._cache = contacts;
      await syncToLocalStorage(contacts);
      return [...contacts];
    } catch (e) {
      console.error('[EmergencyContacts] getAll failed, using backup:', e);
      return readLocalStorageBackup();
    }
  }

  async getById(id) {
    const db = await getDB();
    return await db.get(STORE_CONTACTS, id);
  }

  /**
   * Add a new contact.
   * Throws if max contacts reached, validation fails, or duplicate.
   */
  async add(contactData) {
    const { name, phone, relation = 'family', is_primary = false } = contactData;

    // Validate
    if (!name || !name.trim()) {
      throw new Error('Name is required');
    }
    if (!isValidPhone(phone)) {
      throw new Error(
        'Invalid phone number. Must be 10 digits or include country code.',
      );
    }
    if (!VALID_RELATIONS.includes(relation)) {
      throw new Error(
        `Invalid relation. Must be one of: ${VALID_RELATIONS.join(', ')}`,
      );
    }

    const existing = await this.getAll();
    if (existing.length >= MAX_CONTACTS) {
      throw new Error(
        `Maximum ${MAX_CONTACTS} contacts allowed. Delete one to add another.`,
      );
    }

    const normalizedPhone = normalizePhone(phone);

    // Prevent duplicate phone numbers
    const duplicate = existing.find(
      (c) => normalizePhone(c.phone) === normalizedPhone,
    );
    if (duplicate) {
      throw new Error(`This phone number is already saved as "${duplicate.name}".`);
    }

    // If this is being set as primary, demote others
    if (is_primary) {
      await this._demoteAllPrimary();
    }

    // If no contacts exist yet, make this one primary automatically
    const shouldBePrimary = is_primary || existing.length === 0;

    const newContact = {
      id: generateId(),
      name: name.trim(),
      phone: normalizedPhone,
      relation,
      is_primary: shouldBePrimary,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    const db = await getDB();
    await db.put(STORE_CONTACTS, newContact);

    await this.getAll(); // refresh cache
    this._notify();

    return newContact;
  }

  /**
   * Update an existing contact.
   */
  async update(id, updates) {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Contact not found');
    }

    const merged = { ...existing, ...updates, updated_at: nowIso() };

    // Validate updated fields
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Name cannot be empty');
    }
    if (updates.phone !== undefined) {
      if (!isValidPhone(updates.phone)) {
        throw new Error('Invalid phone number');
      }
      merged.phone = normalizePhone(updates.phone);

      // Check duplicates
      const all = await this.getAll();
      const duplicate = all.find(
        (c) => c.id !== id && normalizePhone(c.phone) === merged.phone,
      );
      if (duplicate) {
        throw new Error(
          `This phone number is already saved as "${duplicate.name}".`,
        );
      }
    }
    if (updates.relation !== undefined && !VALID_RELATIONS.includes(updates.relation)) {
      throw new Error(
        `Invalid relation. Must be one of: ${VALID_RELATIONS.join(', ')}`,
      );
    }

    // If promoting to primary, demote others
    if (updates.is_primary === true && !existing.is_primary) {
      await this._demoteAllPrimary();
      merged.is_primary = true;
    }

    const db = await getDB();
    await db.put(STORE_CONTACTS, merged);

    await this.getAll();
    this._notify();

    return merged;
  }

  /**
   * Delete a contact. If it was primary and others exist, promote the next one.
   */
  async remove(id) {
    const existing = await this.getById(id);
    if (!existing) return false;

    const db = await getDB();
    await db.delete(STORE_CONTACTS, id);

    // If primary was deleted, promote the oldest remaining contact
    if (existing.is_primary) {
      const remaining = await db.getAll(STORE_CONTACTS);
      if (remaining.length > 0) {
        const oldest = remaining.sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime(),
        )[0];
        oldest.is_primary = true;
        oldest.updated_at = nowIso();
        await db.put(STORE_CONTACTS, oldest);
      }
    }

    await this.getAll();
    this._notify();
    return true;
  }

  /**
   * Set a specific contact as primary (demoting any others).
   */
  async setPrimary(id) {
    return await this.update(id, { is_primary: true });
  }

  /**
   * Internal: demote all currently-primary contacts.
   */
  async _demoteAllPrimary() {
    const db = await getDB();
    const all = await db.getAll(STORE_CONTACTS);
    const tx = db.transaction(STORE_CONTACTS, 'readwrite');
    for (const c of all) {
      if (c.is_primary) {
        c.is_primary = false;
        c.updated_at = nowIso();
        await tx.store.put(c);
      }
    }
    await tx.done;
  }

  /**
   * Get primary contact (or first contact if none marked primary).
   */
  async getPrimary() {
    const all = await this.getAll();
    if (all.length === 0) return null;
    return all.find((c) => c.is_primary) || all[0];
  }

  /**
   * Get count and constraints info.
   */
  async getStats() {
    const all = await this.getAll();
    return {
      count: all.length,
      max: MAX_CONTACTS,
      remaining: MAX_CONTACTS - all.length,
      has_primary: all.some((c) => c.is_primary),
    };
  }

  /**
   * Export all contacts as JSON string (for user backup).
   */
  async exportJson() {
    const all = await this.getAll();
    return JSON.stringify(
      {
        version: 1,
        exported_at: nowIso(),
        contacts: all,
      },
      null,
      2,
    );
  }

  /**
   * Clear all contacts. Use with caution.
   */
  async clearAll() {
    const db = await getDB();
    await db.clear(STORE_CONTACTS);
    this._cache = [];
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {}
    this._notify();
  }
}

// Exports
export const MAX_EMERGENCY_CONTACTS = MAX_CONTACTS;
export const VALID_CONTACT_RELATIONS = VALID_RELATIONS;
export { isValidPhone, normalizePhone };

const emergencyContactsService = new EmergencyContactsService();
export default emergencyContactsService;