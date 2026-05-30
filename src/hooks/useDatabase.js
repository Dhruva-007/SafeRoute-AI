/**
 * useDatabase Hook
 * 
 * Provides a React-friendly interface to the database service.
 * Handles initialization, loading state, and errors.
 */

import { useState, useEffect } from 'react';
import databaseService from '../services/database';

export function useDatabase() {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    let cancelled = false;
    
    async function loadDatabase() {
      try {
        setIsLoading(true);
        setError(null);
        
        await databaseService.initialize();
        
        if (cancelled) return;
        
        const statistics = databaseService.getStatistics();
        setStats(statistics);
        setIsReady(true);
      } catch (err) {
        if (cancelled) return;
        console.error('[useDatabase] Failed to initialize:', err);
        setError(err.message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    
    loadDatabase();
    
    return () => {
      cancelled = true;
    };
  }, []);
  
  return {
    db: isReady ? databaseService : null,
    isReady,
    isLoading,
    error,
    stats,
  };
}