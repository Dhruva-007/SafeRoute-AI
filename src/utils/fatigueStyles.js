// Premium minimal fatigue badge styles
// Aligned with theme tokens: success / warning / danger

export const FATIGUE_BADGE = {
  LOW: 'bg-success-soft text-success border-success/25',
  MEDIUM: 'bg-warning-soft text-warning border-warning/25',
  HIGH: 'bg-danger-soft text-danger border-danger/25',
};

export const FATIGUE_DOT = {
  LOW: 'bg-success',
  MEDIUM: 'bg-warning',
  HIGH: 'bg-danger',
};

export const FATIGUE_BAR = {
  LOW: 'bg-success',
  MEDIUM: 'bg-warning',
  HIGH: 'bg-danger',
};

export const FATIGUE_BAR_SOFT = {
  LOW: 'bg-success/60',
  MEDIUM: 'bg-warning/60',
  HIGH: 'bg-danger/60',
};

export const FATIGUE_TEXT = {
  LOW: 'text-success',
  MEDIUM: 'text-warning',
  HIGH: 'text-danger',
};

export const FATIGUE_BG = {
  LOW: 'bg-success-soft',
  MEDIUM: 'bg-warning-soft',
  HIGH: 'bg-danger-soft',
};

export const FATIGUE_BORDER = {
  LOW: 'border-success/25',
  MEDIUM: 'border-warning/25',
  HIGH: 'border-danger/25',
};

export const FATIGUE_LABEL = {
  LOW: 'Good to Go',
  MEDIUM: 'Moderate Strain',
  HIGH: 'Rest Needed',
};

/**
 * Returns the fatigue level (LOW/MEDIUM/HIGH) from a numeric score.
 */
export function scoreToLevel(score) {
  if (score < 35) return 'LOW';
  if (score < 65) return 'MEDIUM';
  return 'HIGH';
}