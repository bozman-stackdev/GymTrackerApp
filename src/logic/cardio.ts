/**
 * Cardio history and statistics. Cardio records one thing: DURATION, from a start/stop timer (docs/CARDIO.md).
 * Completely separate from the strength progression engine: it reads only activity entries, and the strength engine
 * reads only strength entries (logic/entries.ts).
 */
import type { ActivityEntry, ActivityKind, CardioMetrics, WorkoutSession } from '../types';
import { activityName, type Metric } from './activities';
import { activityEntries, strengthEntries } from './entries';
import { plural, sessionSetCount } from './history';
import { getUnits } from './units';

/** Below this, a stopped timer is treated as a mis-tap: saved, but not a cardio session for XP. */
export const MIN_CARDIO_SEC = 60;

/** How long an activity took: the timer result, else what an older version recorded in minutes, else 0. */
export function activityDurationSec(e: Pick<ActivityEntry, 'durationSec' | 'log'>): number {
  if (typeof e.durationSec === 'number') return e.durationSec;
  return Math.round((e.log?.durationMin ?? 0) * 60);
}

/** Seconds on a running timer. Always computed from the start time, so it is right after a locked screen or a reload. */
export function elapsedSec(startedAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

export const isRunning = (e: ActivityEntry) => !!e.startedAt && !e.doneAt;

/** "23:42", "1:05:10" (the timer display uses padded hours: see formatClock). */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "00:04:32" - the big stopwatch. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

/** "23 min 42 sec", "1 h 5 min", "45 sec". */
export function formatDurationWords(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} h${m ? ` ${m} min` : ''}`;
  if (m > 0) return `${m} min${r ? ` ${r} sec` : ''}`;
  return `${r} sec`;
}

/** "+3:42", "-1:05", "same". */
export function formatChange(sec: number): string {
  if (Math.abs(sec) < 1) return 'same';
  return `${sec > 0 ? '+' : '-'}${formatDuration(Math.abs(sec))}`;
}

export interface ActivityPerformance {
  sessionId: string;
  date: string;
  durationSec: number;
}

/** Completed performances of one activity as one kind (a warm-up walk isn't a cardio walk), oldest first. */
export function activityHistory(sessions: WorkoutSession[], activityId: string, kind: ActivityKind): ActivityPerformance[] {
  const out: ActivityPerformance[] = [];
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const e of activityEntries(s)) {
      const sec = activityDurationSec(e);
      if (e.kind === kind && e.activityId === activityId && e.doneAt && sec > 0) out.push({ sessionId: s.id, date: s.startedAt, durationSec: sec });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function lastActivity(sessions: WorkoutSession[], activityId: string, kind: ActivityKind): ActivityPerformance | undefined {
  return activityHistory(sessions, activityId, kind).at(-1);
}

/** Previous vs today: "Previous 20:00 · Today 23:42 · +3:42". No recommendations - just the comparison. */
export function durationChange(previousSec: number | undefined, todaySec: number): { previous: number; today: number; change: number } | null {
  return previousSec === undefined ? null : { previous: previousSec, today: todaySec, change: todaySec - previousSec };
}

// ---------- Older workouts (recorded speed, incline, distance...) ----------

const KM_PER_MILE = 1.609344;
const n1 = (n: number) => String(Math.round(n * 10) / 10);
const METRES = new Set(['rowing', 'swimming', 'ski-erg']);

/** One metric an older version recorded, in the user's units ("6.5 km/h", "5% incline", "2,000 m"). */
function formatOldMetric(metric: Metric, value: number, activityId: string): string {
  const imperial = getUnits() === 'lb';
  switch (metric) {
    case 'durationMin': return `${n1(value)} min`;
    case 'distanceKm':
      if (METRES.has(activityId)) return `${Math.round(value * 1000).toLocaleString()} m`;
      return imperial ? `${n1(value / KM_PER_MILE)} mi` : `${n1(value)} km`;
    case 'speedKmh': return imperial ? `${n1(value / KM_PER_MILE)} mph` : `${n1(value)} km/h`;
    case 'inclinePct': return `${n1(value)}% incline`;
    case 'level': return `Level ${n1(value)}`;
    case 'calories': return `${Math.round(value)} kcal`;
    case 'avgHeartRate': return `${Math.round(value)} bpm`;
  }
}

/** The extras an older workout recorded (never empty fields): "3 km · 6.5 km/h". '' for timer-recorded activities. */
export function oldExtras(m: CardioMetrics | undefined, activityId: string): string {
  if (!m) return '';
  return (['distanceKm', 'speedKmh', 'inclinePct', 'level', 'calories', 'avgHeartRate'] as Metric[])
    .filter((k) => m[k] !== undefined)
    .map((k) => formatOldMetric(k, m[k]!, activityId))
    .join(' · ');
}

/** "23 min 42 sec" for summaries and history (plus an older workout's recorded extras). Warm-up sets show their sets. */
export function describeActivity(e: ActivityEntry, formatSets?: (sets: NonNullable<ActivityEntry['warmupSets']>) => string): string {
  if (e.warmupSets?.length && formatSets) return formatSets(e.warmupSets);
  const sec = activityDurationSec(e);
  const parts = [sec > 0 ? formatDurationWords(sec) : '', oldExtras(e.log, e.activityId)].filter(Boolean);
  if (parts.length === 0 && e.plan?.durationMin) return `Planned ${e.plan.durationMin} min`;
  return parts.join(' · ');
}

// ---------- Statistics (cardio kind only; warm-ups and cool-downs aren't "cardio sessions") ----------

export interface CardioStats {
  sessions: number;
  totalSec: number;
  longest: { name: string; sec: number } | null;
  mostFrequent: { name: string; count: number } | null;
  /** Time per activity, most first. */
  byActivity: { name: string; sec: number; count: number }[];
}

export function cardioStats(sessions: WorkoutSession[]): CardioStats {
  const stats: CardioStats = { sessions: 0, totalSec: 0, longest: null, mostFrequent: null, byActivity: [] };
  const per = new Map<string, { name: string; sec: number; count: number }>();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const e of activityEntries(s)) {
      if (e.kind !== 'cardio' || !e.doneAt) continue;
      stats.sessions++;
      const name = activityName(e);
      const sec = activityDurationSec(e);
      stats.totalSec += sec;
      if (sec > (stats.longest?.sec ?? 0)) stats.longest = { name, sec };
      const key = e.activityId === 'other' ? `other:${name.toLowerCase()}` : e.activityId;
      const a = per.get(key) ?? { name, sec: 0, count: 0 };
      a.sec += sec;
      a.count++;
      per.set(key, a);
    }
  }
  stats.byActivity = [...per.values()].sort((a, b) => b.sec - a.sec);
  for (const a of per.values()) if (!stats.mostFrequent || a.count > stats.mostFrequent.count) stats.mostFrequent = { name: a.name, count: a.count };
  return stats;
}

/** Minutes of completed cardio in one workout (for workout XP on cardio-only days, and history lines). */
export function cardioMinutes(session: WorkoutSession): number {
  const sec = activityEntries(session).filter((e) => e.kind === 'cardio' && e.doneAt).reduce((sum, e) => sum + activityDurationSec(e), 0);
  return Math.round(sec / 60);
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
