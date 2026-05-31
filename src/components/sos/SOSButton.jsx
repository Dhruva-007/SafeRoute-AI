import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Siren, Radio, X } from 'lucide-react';

const HOLD_DURATION_MS = 3000; // press-and-hold time

/**
 * Press-and-hold SOS button. Triggers after 3 seconds of continuous press.
 *
 * Props:
 *   onActivate:  () => void  — called when hold completes
 *   activated:   boolean     — shows "activated" state
 *   onCancel:    () => void  — called to deactivate
 */
function SOSButton({ onActivate, activated, onCancel }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const holdStartRef = useRef(null);
  const rafRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const startHold = (e) => {
    if (activated) return;
    e.preventDefault();

    setHolding(true);
    holdStartRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - (holdStartRef.current || 0);
      const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timeoutRef.current = setTimeout(() => {
      setHolding(false);
      setProgress(0);
      holdStartRef.current = null;
      onActivate?.();
    }, HOLD_DURATION_MS);
  };

  const cancelHold = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHolding(false);
    setProgress(0);
    holdStartRef.current = null;
  };

  if (activated) {
    return (
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center"
      >
        <div className="w-40 h-40 rounded-full bg-danger-soft border-2 border-danger/40 flex items-center justify-center relative shadow-medium">
          <div className="absolute inset-0 rounded-full bg-danger/15 animate-ping" />
          <div className="relative flex flex-col items-center">
            <Radio className="w-10 h-10 text-danger mb-2 animate-pulse" />
            <span className="text-danger text-lg font-bold">ACTIVE</span>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-danger-soft text-danger border border-danger/25 hover:bg-danger/15 transition-all"
        >
          <X className="w-4 h-4" />
          Deactivate SOS
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <p className="text-sm text-text-secondary mb-6 text-center">
        Press and hold for <span className="font-semibold text-danger">3 seconds</span> to activate
      </p>

      <button
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        className="relative w-40 h-40 rounded-full bg-danger hover:bg-danger/90 transition-all duration-200 flex items-center justify-center shadow-medium hover:shadow-strong active:scale-95 select-none touch-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        {/* Soft ambient pulse when idle */}
        {!holding && (
          <div className="absolute inset-0 rounded-full bg-danger/30 animate-ping" />
        )}

        {/* Hold progress ring */}
        {holding && (
          <svg
            className="absolute inset-0 w-full h-full -rotate-90"
            viewBox="0 0 160 160"
          >
            <circle
              cx="80"
              cy="80"
              r="74"
              fill="none"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 465} 465`}
              opacity="0.9"
            />
          </svg>
        )}

        <div className="relative flex flex-col items-center text-white">
          <Siren className="w-10 h-10 mb-2" />
          <span className="text-lg font-bold tracking-wide">SOS</span>
          {holding && (
            <span className="text-xs mt-1 opacity-90">
              {Math.ceil((HOLD_DURATION_MS - (progress / 100) * HOLD_DURATION_MS) / 1000)}s
            </span>
          )}
        </div>
      </button>

      <p className="text-xs text-text-muted mt-6 text-center max-w-xs">
        Holds for 3s to prevent accidental activation. Your location and emergency alert will be shared with your contacts.
      </p>
    </div>
  );
}

export default SOSButton;