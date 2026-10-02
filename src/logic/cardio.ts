/**
 * Cardio history, gentle suggestions and statistics. Completely separate from the strength progression engine:
 * it reads only activity entries, and the strength engine reads only strength entries (logic/entries.ts).
 */
import type { ActivityEntry, ActivityKind, CardioMetrics, WorkoutSession } from '../types';
import { activityById, activityName, type Metric } from './activities';
import { activityEntries, strengthEntries } from './entries';
import { plural, sessionSetCount } from './history';
import { getUnits } from './units';

export interface ActivityPerformance {
  sessionId: string;
  date: string;
  metrics: CardioMetrics;
}

/** Completed performances of one activity as one kind (a warm-up walk isn't a cardio walk), oldest first. */
export function activityHistory(sessions: WorkoutSession[], activityId: string, kind: ActivityKind): ActivityPerformance[] {
  const out: ActivityPerformance[] = [];
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const e of activityEntries(s)) {
      if (e.kind === kind && e.activityId === activityId && e.doneAt && e.log) out.push({ sessionId: s.id, date: s.startedAt, metrics: e.log });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function lastActivity(sessions: WorkoutSession[], activityId: string, kind: ActivityKind): ActivityPerformance | undefined {
  return activityHistory(sessions, activityId, kind).at(-1);
}

export const CARDIO_RULES = {
  /** Sessions needed before any suggestion. */
  minSessions: 2,
  /** Never suggest more than this much extra time at once. */
  maxIncrease: 0.1,
  /** Shortest session where +1 minute is still a small step. */
  minMinutesForMore: 10,
  /** Same treadmill time and incline this many times in a row before suggesting a little more incline. */
  sessionsBeforeIncline: 3,
  inclineStep: 0.5,
};

export interface CardioSuggestion {
  text: string;
  /** Prefill for today: always last time's values (the suggestion is a hint, never applied automatically). */
  prefill: CardioMetrics;
}

/**
 * A calm hint for a cardio activity, or null with too little history. Never aggressive: one more minute when the
 * last two sessions matched (and that's at most +10%), or half a percent more incline on a steady treadmill routine.
 * Warm-ups and cool-downs get no suggestions (they're meant to stay easy).
 */
export function cardioSuggestion(sessions: WorkoutSession[], activityId: string, rules = CARDIO_RULES): CardioSuggestion | null {
  const history = activityHistory(sessions, activityId, 'cardio');
  if (history.length < rules.minSessions) return null;
  const last = history.at(-1)!.metrics;
  const prev = history.at(-2)!.metrics;
  const d = last.durationMin;
  if (!d || prev.durationMin !== d) return { text: 'Match last time', prefill: last };

  const recent = history.slice(-rules.sessionsBeforeIncline);
  const steadyIncline = activityId === 'treadmill' && last.inclinePct !== undefined && recent.length === rules.sessionsBeforeIncline
    && recent.every((p) => p.metrics.durationMin === d && p.metrics.inclinePct === last.inclinePct);
  if (steadyIncline) {
    return { text: `Keep ${d} minutes and try ${formatNumber(last.inclinePct! + rules.inclineStep)}% incline`, prefill: last };
  }
  if (d >= rules.minMinutesForMore && 1 / d <= rules.maxIncrease) return { text: `Try ${d + 1} minutes today`, prefill: last };
  return { text: 'Match last time', prefill: last };
}

// ---------- Display ----------

const KM_PER_MILE = 1.609344;
const formatNumber = (n: number) => String(Math.round(n * 10) / 10);

/** One metric in the user's units, e.g. "20 min", "5%", "6.5 km/h", "4 mi", "2,000 m", "L8", "250 kcal", "142 bpm". */
export function formatMetric(metric: Metric, value: number, activityId: string): string {
  const imperial = getUnits() === 'lb';
  switch (metric) {
    case 'durationMin': return `${formatNumber(value)} min`;
    case 'distanceKm':
      if (activityById(activityId).metres) return `${Math.round(value * 1000).toLocaleString()} m`;
      return imperial ? `${formatNumber(value / KM_PER_MILE)} mi` : `${formatNumber(value)} km`;
    case 'speedKmh': return imperial ? `${formatNumber(value / KM_PER_MILE)} mph` : `${formatNumber(value)} km/h`;
    case 'inclinePct': return `${formatNumber(value)}% incline`;
    case 'level': return `Level ${formatNumber(value)}`;
    case 'calories': return `${Math.round(value)} kcal`;
    case 'avgHeartRate': return `${Math.round(value)} bpm`;
  }
}

/** Field labels and the unit shown next to the input, in the user's units. */
export const METRIC_LABEL: Record<Metric, string> = {
  durationMin: 'Minutes', distanceKm: 'Distance', speedKmh: 'Speed', inclinePct: 'Incline', level: 'Level', calories: 'Calories', avgHeartRate: 'Heart rate',
};

export function metricUnit(metric: Metric, activityId: string): string {
  const imperial = getUnits() === 'lb';
  switch (metric) {
    case 'durationMin': return 'min';
    case 'distanceKm': return activityById(activityId).metres ? 'm' : imperial ? 'mi' : 'km';
    case 'speedKmh': return imperial ? 'mph' : 'km/h';
    case 'inclinePct': return '%';
    case 'level': return '';
    case 'calories': return 'kcal';
    case 'avgHeartRate': return 'bpm';
  }
}

/** Stored value (km, km/h) → the number shown in the field (m, mi, mph...). */
export function toShownMetric(metric: Metric, value: number, activityId: string): number {
  const imperial = getUnits() === 'lb';
  if (metric === 'distanceKm') return activityById(activityId).metres ? Math.round(value * 1000) : round2(imperial ? value / KM_PER_MILE : value);
  if (metric === 'speedKmh') return round2(imperial ? value / KM_PER_MILE : value);
  return value;
}

/** The number typed in the field → stored value. */
export function fromShownMetric(metric: Metric, shown: number, activityId: string): number {
  const imperial = getUnits() === 'lb';
  if (metric === 'distanceKm') return activityById(activityId).metres ? shown / 1000 : imperial ? shown * KM_PER_MILE : shown;
  if (metric === 'speedKmh') return imperial ? shown * KM_PER_MILE : shown;
  return shown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pace for running/walking when there's distance and time, e.g. "5:30 /km" (or /mi). */
export function formatPace(m: CardioMetrics): string | null {
  if (!m.durationMin || !m.distanceKm) return null;
  const imperial = getUnits() === 'lb';
  const perUnit = (m.durationMin * 60) / (imperial ? m.distanceKm / KM_PER_MILE : m.distanceKm);
  if (!Number.isFinite(perUnit) || perUnit <= 0 || perUnit > 3600) return null;
  return `${Math.floor(perUnit / 60)}:${String(Math.round(perUnit % 60)).padStart(2, '0')} /${imperial ? 'mi' : 'km'}`;
}

const ORDER: Metric[] = ['durationMin', 'distanceKm', 'speedKmh', 'inclinePct', 'level', 'calories', 'avgHeartRate'];

/** "20 min · 5% incline · 6.5 km/h" - only what was recorded. */
export function formatMetrics(m: CardioMetrics | undefined, activityId: string): string {
  if (!m) return '';
  const parts = ORDER.filter((k) => m[k] !== undefined).map((k) => formatMetric(k, m[k]!, activityId));
  const pace = activityById(activityId).running && m.speedKmh === undefined ? formatPace(m) : null;
  if (pace) parts.push(pace);
  return parts.join(' · ');
}

/** "Treadmill — 20 min · 5% incline", for history and summaries. Warm-up sets show as "20 kg × 10 · 30 kg × 8". */
export function describeActivity(e: ActivityEntry, formatSets?: (sets: NonNullable<ActivityEntry['warmupSets']>) => string): string {
  if (e.warmupSets?.length && formatSets) return formatSets(e.warmupSets);
  return formatMetrics(e.log ?? e.plan, e.activityId);
}

// ---------- Statistics (cardio kind only; warm-ups and cool-downs aren't "cardio sessions") ----------

export interface CardioStats {
  sessions: number;
  totalMinutes: number;
  runningKm: number;
  longest: { name: string; minutes: number } | null;
  mostFrequent: { name: string; count: number } | null;
}

export function cardioStats(sessions: WorkoutSession[]): CardioStats {
  const stats: CardioStats = { sessions: 0, totalMinutes: 0, runningKm: 0, longest: null, mostFrequent: null };
  const counts = new Map<string, { name: string; count: number }>();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const e of activityEntries(s)) {
      if (e.kind !== 'cardio' || !e.doneAt) continue;
      stats.sessions++;
      const name = activityName(e);
      const minutes = e.log?.durationMin ?? 0;
      stats.totalMinutes += minutes;
      if (activityById(e.activityId).running) stats.runningKm += e.log?.distanceKm ?? 0;
      if (minutes > (stats.longest?.minutes ?? 0)) stats.longest = { name, minutes };
      const key = e.activityId === 'other' ? `other:${name.toLowerCase()}` : e.activityId;
      const c = counts.get(key) ?? { name, count: 0 };
      c.count++;
      counts.set(key, c);
    }
  }
  for (const c of counts.values()) if (!stats.mostFrequent || c.count > stats.mostFrequent.count) stats.mostFrequent = c;
  stats.runningKm = Math.round(stats.runningKm * 100) / 100;
  return stats;
}

/** Minutes of completed cardio in one workout (for workout XP on cardio-only days, and history lines). */
export function cardioMinutes(session: WorkoutSession): number {
  return activityEntries(session).filter((e) => e.kind === 'cardio' && e.doneAt).reduce((sum, e) => sum + (e.log?.durationMin ?? 0), 0);
}

/** One history line: "3 exercises · 9 sets · 25 min cardio" (only the parts the workout has). */
export function historyLine(session: WorkoutSession): string {
  const exercises = strengthEntries(session).length;
  const parts = exercises > 0 ? [plural(exercises, 'exercise'), plural(sessionSetCount(session), 'set')] : [];
  const minutes = cardioMinutes(session);
  if (minutes > 0) parts.push(`${minutes} min cardio`);
  else if (activityEntries(session).some((e) => e.kind === 'cardio' && e.doneAt)) parts.push('cardio');
  return parts.join(' · ') || 'Workout';
}

/** "45 min", "2 h 5 min". */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
