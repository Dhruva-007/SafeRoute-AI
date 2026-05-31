/**
 * useEmergencyContacts Hook
 *
 * React-friendly wrapper around emergencyContactsService.
 * Provides reactive state with auto-refresh on any change.
 */

import { useState, useEffect, useCallback } from 'react';
import emergencyContactsService from '../services/emergencyContacts';

export function useEmergencyContacts() {
  const [contacts, setContacts] = useState(
    () => emergencyContactsService.getAllSync(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial async load + subscribe to changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await emergencyContactsService.getAll();
        if (!cancelled) {
          setContacts(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const unsubscribe = emergencyContactsService.subscribe((next) => {
      setContacts([...next]);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /* -------- Actions -------- */

  const addContact = useCallback(async (data) => {
    setError(null);
    try {
      return await emergencyContactsService.add(data);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const updateContact = useCallback(async (id, updates) => {
    setError(null);
    try {
      return await emergencyContactsService.update(id, updates);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const removeContact = useCallback(async (id) => {
    setError(null);
    try {
      return await emergencyContactsService.remove(id);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const setPrimary = useCallback(async (id) => {
    setError(null);
    try {
      return await emergencyContactsService.setPrimary(id);
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  const clearAll = useCallback(async () => {
    setError(null);
    try {
      await emergencyContactsService.clearAll();
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  /* -------- Derived -------- */

  const primary = contacts.find((c) => c.is_primary) || contacts[0] || null;
  const hasContacts = contacts.length > 0;
  const isFull = contacts.length >= 5;

  return {
    contacts,
    loading,
    error,
    primary,
    hasContacts,
    isFull,
    count: contacts.length,
    remaining: 5 - contacts.length,
    addContact,
    updateContact,
    removeContact,
    setPrimary,
    clearAll,
    clearError: () => setError(null),
  };
}