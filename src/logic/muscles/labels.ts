/**
 * Every word the muscle map shows about levels, in one place. The language describes recorded TRAINING and
 * PERFORMANCE - never muscle size, growth or appearance (see docs/MUSCLES.md, "What the map can't tell you").
 */
import type { ActivityLevel, BalanceLevel, ProgressLevel } from './analysis';

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = { none: 'Not trained', low: 'Low', medium: 'Medium', high: 'High' };

export const PROGRESS_LABEL: Record<ProgressLevel, string> = {
  none: 'Not enough data yet',
  lower: 'Lower than before',
  stable: 'Stable',
  moderate: 'Moderate progression',
  strong: 'Strong progression',
};

/** Short form for the map legend and tight spaces. */
export const PROGRESS_SHORT: Record<ProgressLevel, string> = { none: 'No data', lower: 'Lower', stable: 'Stable', moderate: 'Moderate', strong: 'Strong' };

export const BALANCE_LABEL: Record<BalanceLevel, string> = { high: 'High', moderate: 'Moderate', low: 'Low' };

export const ACTIVITY_NOTE = 'Sets per muscle compared with your most-trained muscle in this period. Main muscles count fully, muscles that help count half. Warm-up sets and cardio aren’t included.';

export const PROGRESS_NOTE = 'Training progress compares your performance - weights, reps, challenges, mastered weights and consistency - with before this period. It measures performance, not muscle growth.';

export const MAP_DISCLAIMER = 'The muscle map shows the training and performance you recorded. It can’t measure muscle size or growth.';
