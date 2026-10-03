/**
 * Cardio, warm-up and cool-down activities. Pure data. An activity is just a name: the app records only its DURATION,
 * with a start/stop timer, so nothing has to be typed during a workout (docs/CARDIO.md).
 * Add an activity here; nothing else needs to change (unknown ids show as "Other").
 */
import type { ActivityKind, CardioMetrics } from '../types';

/** Metrics older versions recorded (speed, incline...). Kept only to read and show old workouts. */
export type Metric = keyof CardioMetrics;

export interface Activity {
  id: string;
  name: string;
  /** Where it's offered first. Cardio activities are also offered as warm-ups and cool-downs. */
  group: 'cardio' | 'mobility';
}

/** In the order the cardio list shows them. */
export const ACTIVITIES: Activity[] = [
  { id: 'treadmill', name: 'Treadmill', group: 'cardio' },
  { id: 'cycling', name: 'Cycling', group: 'cardio' },
  { id: 'rowing', name: 'Rowing', group: 'cardio' },
  { id: 'cross-trainer', name: 'Cross Trainer', group: 'cardio' },
  { id: 'stair-climber', name: 'Stair Climber', group: 'cardio' },
  { id: 'walking', name: 'Walking', group: 'cardio' },
  { id: 'running', name: 'Running', group: 'cardio' },
  { id: 'swimming', name: 'Swimming', group: 'cardio' },
  { id: 'stationary-bike', name: 'Stationary Bike', group: 'cardio' },
  { id: 'ski-erg', name: 'Ski Erg', group: 'cardio' },
  { id: 'assault-bike', name: 'Assault Bike', group: 'cardio' },
  { id: 'dynamic-stretching', name: 'Dynamic Stretching', group: 'mobility' },
  { id: 'stretching', name: 'Stretching', group: 'mobility' },
  { id: 'mobility', name: 'Mobility', group: 'mobility' },
  { id: 'band-work', name: 'Band Work', group: 'mobility' },
  { id: 'bodyweight-squats', name: 'Bodyweight Squats', group: 'mobility' },
  { id: 'foam-rolling', name: 'Foam Rolling', group: 'mobility' },
  { id: 'other', name: 'Other', group: 'cardio' },
];

const BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]));

export function activityById(id: string): Activity {
  return BY_ID.get(id) ?? BY_ID.get('other')!;
}

/** The name to show: the user's own name for "Other", else the activity name. */
export function activityName(item: { activityId: string; name?: string }): string {
  return item.name?.trim() || activityById(item.activityId).name;
}

/** Activities offered for a kind: cardio first for cardio; mobility first for warm-ups and cool-downs. */
export function activitiesFor(kind: ActivityKind): Activity[] {
  const first = kind === 'cardio' ? 'cardio' : 'mobility';
  const other = ACTIVITIES.filter((a) => a.id === 'other');
  return [
    ...ACTIVITIES.filter((a) => a.group === first && a.id !== 'other'),
    ...ACTIVITIES.filter((a) => a.group !== first && a.id !== 'other'),
    ...other,
  ];
}

export const KIND_LABEL: Record<ActivityKind, string> = { cardio: 'Cardio', warmup: 'Warm-up', cooldown: 'Cool-down' };

/** Sane ranges for the metrics older versions recorded (used to validate old data only). */
export const METRIC_LIMITS: Record<Metric, { min: number; max: number; step: number }> = {
  durationMin: { min: 0, max: 600, step: 1 },
  distanceKm: { min: 0, max: 300, step: 0.1 },
  speedKmh: { min: 0, max: 40, step: 0.1 },
  inclinePct: { min: 0, max: 40, step: 0.5 },
  level: { min: 0, max: 50, step: 1 },
  calories: { min: 0, max: 5000, step: 10 },
  avgHeartRate: { min: 0, max: 230, step: 1 },
};

/** Only known metrics, finite and within limits (old data and routine plans). */
export function cleanMetrics(m: unknown): CardioMetrics | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const out: CardioMetrics = {};
  for (const key of Object.keys(METRIC_LIMITS) as Metric[]) {
    const v = (m as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= METRIC_LIMITS[key].max) out[key] = Math.round(v * 100) / 100;
  }
  return Object.keys(out).length ? out : undefined;
}
