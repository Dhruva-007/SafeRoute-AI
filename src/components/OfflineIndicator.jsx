import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, CheckCircle } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Floating offline indicator + reconnection toast.
 * Shows persistent banner when offline.
 * Shows brief success toast when reconnected.
 */
function OfflineIndicator() {
  const { isOnline, wentOnlineAt } = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);

  // Show reconnected toast for 3s when coming back online
  useEffect(() => {
    if (isOnline && wentOnlineAt) {
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline, wentOnlineAt]);

  return (
    <>
      {/* Persistent offline banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed top-0 left-0 right-0 z-[60] bg-warning text-white shadow-medium"
          >
            <div className="container-max px-4 py-2 flex items-center justify-center gap-2.5 text-sm font-medium">
              <WifiOff className="w-4 h-4" />
              <span>
                You are offline. Showing cached data. Editing is paused
                until you reconnect.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reconnection toast */}
      <AnimatePresence>
        {showReconnected && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60]"
          >
            <div className="glass-card shadow-medium border border-success/30 px-4 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-success-soft border border-success/25 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Back online
                </p>
                <p className="text-xs text-text-muted">
                  Fresh data syncing...
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default OfflineIndicator;