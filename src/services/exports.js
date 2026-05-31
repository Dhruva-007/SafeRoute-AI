import { jsPDF } from 'jspdf';
import { createEvents } from 'ics';

/**
 * Generate a PDF of the itinerary and trigger download.
 */
export function exportTripAsPDF(trip) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  /* ---- Header ---- */
  doc.setFillColor(183, 146, 90); // accent-primary
  doc.rect(0, 0, pageWidth, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('SafeRoute AI', margin, 16);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('AI-Generated Travel Itinerary', margin, 24);

  doc.setFontSize(9);
  doc.text(
    `Generated on ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`,
    margin,
    30,
  );

  y = 48;

  /* ---- Trip Title ---- */
  doc.setTextColor(22, 19, 17); // text-primary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`${trip.destination} Trip`, margin, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(94, 85, 75); // text-secondary
  const subtitle = `${trip.duration_days} day${trip.duration_days !== 1 ? 's' : ''} · ${trip.budget_level} · ${trip.number_of_travelers} traveler${trip.number_of_travelers !== 1 ? 's' : ''}`;
  doc.text(subtitle, margin, y);
  y += 5;
  doc.text(
    `Dates: ${trip.start_date} to ${trip.end_date}`,
    margin,
    y,
  );
  y += 8;

  /* ---- Interests pills (text-based) ---- */
  if (trip.interests?.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(138, 128, 117); // text-muted
    doc.text(`Interests: ${trip.interests.join(' · ')}`, margin, y);
    y += 6;
  }

  /* ---- Summary ---- */
  if (trip.summary) {
    ensureSpace(20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(94, 85, 75);
    const lines = doc.splitTextToSize(trip.summary, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  /* ---- Estimated cost ---- */
  if (trip.estimated_budget) {
    ensureSpace(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(183, 146, 90);
    doc.text(`Estimated Cost: ${trip.estimated_budget}`, margin, y);
    y += 8;
  }

  /* ---- Divider ---- */
  doc.setDrawColor(221, 211, 197);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  /* ---- Days ---- */
  trip.days?.forEach((dayObj) => {
    ensureSpace(20);

    // Day header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(22, 19, 17);
    doc.text(`Day ${dayObj.day}`, margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(138, 128, 117);
    doc.text(dayObj.date, margin + 25, y);

    if (dayObj.day_fatigue_average !== undefined) {
      const fatigueLabel = `Fatigue avg: ${dayObj.day_fatigue_average}/100`;
      const textWidth = doc.getTextWidth(fatigueLabel);
      doc.text(fatigueLabel, pageWidth - margin - textWidth, y);
    }
    y += 6;

    // Weather (if present)
    if (dayObj.weather && dayObj.weather.condition) {
      doc.setFontSize(9);
      doc.setTextColor(94, 85, 75);
      const w = dayObj.weather;
      doc.text(
        `Weather: ${w.condition} · ${Math.round(w.temp_max)}°/${Math.round(w.temp_min)}°C` +
        (w.precipitation_probability >= 30
          ? ` · ${w.precipitation_probability}% rain`
          : ''),
        margin,
        y,
      );
      y += 6;
    }

    // Activities
    dayObj.activities?.forEach((activity, idx) => {
      ensureSpace(24);

      // Time
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(183, 146, 90);
      doc.text(activity.time || 'TBD', margin, y);

      // Place
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(22, 19, 17);
      const placeLines = doc.splitTextToSize(
        activity.place,
        contentWidth - 30,
      );
      doc.text(placeLines, margin + 24, y);

      // Fatigue badge
      if (activity.fatigue_level) {
        const badgeText = `${activity.fatigue_level} ${activity.fatigue_score || 0}`;
        const badgeWidth = doc.getTextWidth(badgeText) + 4;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        const badgeColor =
          activity.fatigue_level === 'LOW'
            ? [76, 155, 110]
            : activity.fatigue_level === 'MEDIUM'
              ? [215, 154, 50]
              : [214, 69, 69];
        doc.setTextColor(...badgeColor);
        doc.text(badgeText, pageWidth - margin - badgeWidth, y);
      }

      y += placeLines.length * 5;

      // Description
      if (activity.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(94, 85, 75);
        const descLines = doc.splitTextToSize(
          activity.description,
          contentWidth - 24,
        );
        doc.text(descLines, margin + 24, y);
        y += descLines.length * 4.5;
      }

      // Cost
      if (activity.estimated_cost) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(183, 146, 90);
        doc.text(activity.estimated_cost, margin + 24, y + 2);
        y += 5;
      }

      y += 3;
    });

    y += 4;
  });

  /* ---- Footer on last page ---- */
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(138, 128, 117);
    doc.text(
      `SafeRoute AI · Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' },
    );
  }

  const safeName = trip.destination
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
  doc.save(`saferoute-${safeName}-trip-${trip.id.slice(0, 8)}.pdf`);
}

/**
 * Parse a time string like "9:00 AM" or "8:00 AM - 11:00 AM" to { hour, minute }
 */
function parseStartTime(timeStr) {
  if (!timeStr) return { hour: 9, minute: 0 };
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/);
  if (!match) return { hour: 9, minute: 0 };

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  const period = (match[3] || '').toUpperCase();

  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return { hour, minute };
}

/**
 * Estimate end time from time string range, or default to start + 1.5h
 */
function parseEndTime(timeStr, start) {
  const range = timeStr?.match(
    /(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*[-–to]+\s*(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i,
  );
  if (range) {
    let hour = parseInt(range[4], 10);
    const minute = parseInt(range[5] || '0', 10);
    const period = (range[6] || '').toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
  }
  // Default: 1.5h duration
  let endHour = start.hour + 1;
  let endMinute = start.minute + 30;
  if (endMinute >= 60) {
    endHour += 1;
    endMinute -= 60;
  }
  return { hour: endHour, minute: endMinute };
}

/**
 * Generate a .ics calendar file and trigger download.
 */
export function exportTripAsICS(trip) {
  const events = [];

  trip.days?.forEach((dayObj) => {
    if (!dayObj.date) return;
    const [year, month, day] = dayObj.date.split('-').map(Number);

    dayObj.activities?.forEach((activity) => {
      const start = parseStartTime(activity.time);
      const end = parseEndTime(activity.time, start);

      events.push({
        start: [year, month, day, start.hour, start.minute],
        end: [year, month, day, end.hour, end.minute],
        title: activity.place || 'Activity',
        description: [
          activity.description || '',
          activity.estimated_cost
            ? `\nEstimated cost: ${activity.estimated_cost}`
            : '',
          activity.fatigue_level
            ? `\nFatigue: ${activity.fatigue_level} (${activity.fatigue_score}/100)`
            : '',
        ]
          .filter(Boolean)
          .join(''),
        location: `${trip.destination}, India`,
        categories: trip.interests || [],
        productId: 'SafeRoute AI',
        calName: `${trip.destination} Trip`,
      });
    });
  });

  if (events.length === 0) {
    throw new Error('No activities to export');
  }

  return new Promise((resolve, reject) => {
    createEvents(events, (error, value) => {
      if (error) {
        reject(error);
        return;
      }

      const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = trip.destination
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-');
      link.href = url;
      link.download = `saferoute-${safeName}-trip-${trip.id.slice(0, 8)}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      resolve();
    });
  });
}