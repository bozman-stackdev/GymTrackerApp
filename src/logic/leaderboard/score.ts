/**
 * The leaderboard score: XP earned in a period, derived from the same replay as XP (game/progress.ts).
 *
 * Healthy limits, so the board rewards consistent progress and never "train more than everyone else":
 *   - only the first `maxDaysPerWeek` training days of each week (Mon–Sun) count;
 *   - one day counts at most `maxDailyPoints`.
 * Nothing heavier, longer or more frequent pays more than the XP system already allows. XP and levels are unchanged.
 *
 * The phone works out points per day and publishes them (data/leaderboard.tsx); the server only adds them up and
 * ranks them (supabase/schema.sql). Change the rule here: everything else reads `dailyPoints`.
 */
import type { WorkoutSession } from '../../types';
import { GAME_CONFIG, type GameConfig } from '../game/config';
import type { Progress } from '../game/progress';
import { weekIndex } from '../game/streak';

export type LeaderboardPeriod = 'week' | 'month' | 'all';

export const PERIODS: { id: LeaderboardPeriod; label: string; title: string }[] = [
  { id: 'week', label: 'Week', title: 'This week' },
  { id: 'month', label: 'Month', title: 'This month' },
  { id: 'all', label: 'All time', title: 'All time' },
];

export interface DayPoints {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  points: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD of a date in the user's local time. */
export function dayKey(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** First day of the period containing `today` (Monday for weeks), or null for all time. */
export function periodStart(period: LeaderboardPeriod, today: Date = new Date()): string | null {
  if (period === 'all') return null;
  if (period === 'month') return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  return dayKey(monday);
}

/**
 * Leaderboard points per day, oldest first. Days that count for nothing are left out.
 * A "training day" is a day whose workouts earned XP; a 6th one in the same week counts 0.
 */
export function dailyPoints(progress: Pick<Progress, 'bySession'>, sessions: WorkoutSession[], config: GameConfig = GAME_CONFIG): DayPoints[] {
  const { maxDaysPerWeek, maxDailyPoints } = config.leaderboard;
  const xpByDay = new Map<string, number>();
  for (const s of sessions) {
    const xp = s.finishedAt ? progress.bySession.get(s.id)?.xp ?? 0 : 0;
    if (xp <= 0) continue;
    const day = dayKey(s.startedAt);
    xpByDay.set(day, (xpByDay.get(day) ?? 0) + xp);
  }
  const daysInWeek = new Map<number, number>();
  const out: DayPoints[] = [];
  for (const day of [...xpByDay.keys()].sort()) {
    const week = weekIndex(`${day}T12:00:00`);
    const n = (daysInWeek.get(week) ?? 0) + 1;
    daysInWeek.set(week, n);
    if (n > maxDaysPerWeek) continue;
    out.push({ day, points: Math.min(maxDailyPoints, Math.round(xpByDay.get(day)!)) });
  }
  return out;
}

/** Points in a period (up to and including `today`). With `beforeToday`, as they were at the end of yesterday. */
export function periodPoints(days: DayPoints[], period: LeaderboardPeriod, today: Date = new Date(), beforeToday = false): number {
  const from = periodStart(period, today) ?? '';
  const to = dayKey(today);
  return days.filter((d) => d.day >= from && (beforeToday ? d.day < to : d.day <= to)).reduce((n, d) => n + d.points, 0);
}

/** How many of this week's counted training days are used ("3 of 5"). */
export function countedDaysThisWeek(days: DayPoints[], today: Date = new Date()): number {
  const from = periodStart('week', today)!;
  const to = dayKey(today);
  return days.filter((d) => d.day >= from && d.day <= to).length;
}
