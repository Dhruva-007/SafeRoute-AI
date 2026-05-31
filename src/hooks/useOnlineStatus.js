import { useState, useEffect } from 'react';

/**
 * Tracks browser online/offline status and the time the connection changed.
 *
 * Returns:
 *   isOnline:        boolean
 *   wentOfflineAt:   Date | null
 *   wentOnlineAt:    Date | null
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [wentOfflineAt, setWentOfflineAt] = useState(null);
  const [wentOnlineAt, setWentOnlineAt] = useState(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setWentOnlineAt(new Date());
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWentOfflineAt(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wentOfflineAt, wentOnlineAt };
}