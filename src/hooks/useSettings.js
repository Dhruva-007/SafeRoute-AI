/**
 * useSettings Hook
 * 
 * React hook for accessing and updating user settings.
 */

import { useState, useEffect, useCallback } from 'react';
import settingsService from '../services/settings';

export function useSettings() {
  const [settings, setSettings] = useState(settingsService.getAll());
  
  useEffect(() => {
    const unsubscribe = settingsService.subscribe((newSettings) => {
      setSettings({ ...newSettings });
    });
    return unsubscribe;
  }, []);
  
  const updateSetting = useCallback((key, value) => {
    settingsService.set(key, value);
  }, []);
  
  const updateMultiple = useCallback((updates) => {
    settingsService.update(updates);
  }, []);
  
  const resetSettings = useCallback(() => {
    settingsService.reset();
  }, []);
  
  const clearAllData = useCallback(async () => {
    await settingsService.clearAllData();
  }, []);
  
  return {
    settings,
    updateSetting,
    updateMultiple,
    resetSettings,
    clearAllData,
  };
}