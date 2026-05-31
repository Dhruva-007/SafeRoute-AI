import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FileText, Calendar, ChevronDown, Loader2 } from 'lucide-react';
import { exportTripAsPDF, exportTripAsICS } from '../../services/exports';

/**
 * Dropdown menu for exporting a trip as PDF or ICS.
 *
 * Props:
 *   trip:   the SavedTrip object
 */
function ExportMenu({ trip }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(null); // 'pdf' | 'ics' | null
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePDF = async () => {
    setExporting('pdf');
    try {
      exportTripAsPDF(trip);
    } catch (err) {
      alert('Failed to export PDF: ' + err.message);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  };

  const handleICS = async () => {
    setExporting('ics');
    try {
      await exportTripAsICS(trip);
    } catch (err) {
      alert('Failed to export calendar: ' + err.message);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/15 border border-accent-primary/25 transition-all"
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 glass-card shadow-medium border border-[#DDD3C5] py-2 z-30"
          >
            <button
              onClick={handlePDF}
              disabled={exporting !== null}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-accent-primary/5 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shrink-0">
                {exporting === 'pdf' ? (
                  <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 text-accent-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  PDF Document
                </p>
                <p className="text-xs text-text-muted">
                  Printable itinerary
                </p>
              </div>
            </button>

            <button
              onClick={handleICS}
              disabled={exporting !== null}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-accent-primary/5 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center shrink-0">
                {exporting === 'ics' ? (
                  <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4 text-accent-primary" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Calendar (.ics)
                </p>
                <p className="text-xs text-text-muted">
                  Google · Apple · Outlook
                </p>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ExportMenu;