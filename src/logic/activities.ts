/**
 * Cardio, warm-up and cool-down activities, and which metrics each one shows. Pure data: the UI shows only the
 * listed fields, so "Run, 20 minutes" is one stepper and the treadmill adds speed and incline.
 * Add an activity or a metric here; nothing else needs to change (unknown ids show as "Other").
 */
import type { ActivityKind, CardioMetrics } from '../types';

export type Metric = keyof CardioMetrics;

export interface Activity {
  id: string;
  name: string;
  /** Where it's offered first. Cardio activities are also offered as warm-ups and cool-downs. */
  group: 'cardio' | 'mobility';
  /** Shown by default (duration is always first). */
  metrics: Metric[];
  /** Distance shown in metres (rowing, swimming) instead of km / miles. */
  metres?: boolean;
  /** Counts towards "running distance" in the statistics. */
  running?: boolean;
}

const HR: Metric = 'avgHeartRate';

export const ACTIVITIES: Activity[] = [
  { id: 'running', name: 'Running', group: 'cardio', metrics: ['durationMin', 'distanceKm', HR], running: true },
  { id: 'treadmill', name: 'Treadmill', group: 'cardio', metrics: ['durationMin', 'speedKmh', 'inclinePct', 'distanceKm', HR], running: true },
  { id: 'walking', name: 'Walking', group: 'cardio', metrics: ['durationMin', 'distanceKm'] },
  { id: 'cycling', name: 'Cycling', group: 'cardio', metrics: ['durationMin', 'distanceKm', HR] },
  { id: 'stationary-bike', name: 'Stationary Bike', group: 'cardio', metrics: ['durationMin', 'level', 'distanceKm', 'calories', HR] },
  { id: 'rowing', name: 'Rowing Machine', group: 'cardio', metrics: ['durationMin', 'distanceKm', 'level', 'calories', HR], metres: true },
  { id: 'cross-trainer', name: 'Cross Trainer', group: 'cardio', metrics: ['durationMin', 'level', 'calories', HR] },
  { id: 'stair-climber', name: 'Stair Climber', group: 'cardio', metrics: ['durationMin', 'level', 'calories', HR] },
  { id: 'swimming', name: 'Swimming', group: 'cardio', metrics: ['durationMin', 'distanceKm', HR], metres: true },
  { id: 'ski-erg', name: 'Ski Erg', group: 'cardio', metrics: ['durationMin', 'distanceKm', 'calories', HR], metres: true },
  { id: 'assault-bike', name: 'Assault Bike', group: 'cardio', metrics: ['durationMin', 'calories', 'distanceKm', HR] },
  { id: 'dynamic-stretching', name: 'Dynamic Stretching', group: 'mobility', metrics: ['durationMin'] },
  { id: 'stretching', name: 'Stretching', group: 'mobility', metrics: ['durationMin'] },
  { id: 'mobility', name: 'Mobility', group: 'mobility', metrics: ['durationMin'] },
  { id: 'band-work', name: 'Band Work', group: 'mobility', metrics: ['durationMin'] },
  { id: 'bodyweight-squats', name: 'Bodyweight Squats', group: 'mobility', metrics: ['durationMin'] },
  { id: 'foam-rolling', name: 'Foam Rolling', group: 'mobility', metrics: ['durationMin'] },
  { id: 'other', name: 'Other', group: 'cardio', metrics: ['durationMin', 'distanceKm', 'calories', HR] },
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

/** Sensible input limits (anything outside is a typo, not a workout). */
export const METRIC_LIMITS: Record<Metric, { min: number; max: number; step: number }> = {
  durationMin: { min: 0, max: 600, step: 1 },
  distanceKm: { min: 0, max: 300, step: 0.1 },
  speedKmh: { min: 0, max: 40, step: 0.1 },
  inclinePct: { min: 0, max: 40, step: 0.5 },
  level: { min: 0, max: 50, step: 1 },
  calories: { min: 0, max: 5000, step: 10 },
  avgHeartRate: { min: 0, max: 230, step: 1 },
};

/** Only known metrics, finite and within limits (used for validation and for saving what was typed). */
export function cleanMetrics(m: unknown): CardioMetrics | undefined {
  if (!m || typeof m !== 'object') return undefined;
  const out: CardioMetrics = {};
  for (const key of Object.keys(METRIC_LIMITS) as Metric[]) {
    const v = (m as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= METRIC_LIMITS[key].max) out[key] = Math.round(v * 100) / 100;
  }
  return Object.keys(out).length ? out : undefined;
}
