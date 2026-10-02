import type { AppData, Routine, SetLog, WorkoutSession } from '../types';
import { formatWeight } from './units';
import { isStrengthItem, strengthEntries } from './entries';

/** Weight in the user's units (see units.ts). */
export { formatWeight };

/** One past performance of a single exercise. */
export interface ExercisePerformance {
  sessionId: string;
  date: string;
  sets: SetLog[];
}

/** All finished performances of an exercise, oldest first. */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExercisePerformance[] {
  // Hot path (the progress replay calls this for every exercise of every workout): plain loops, no copies.
  const out: ExercisePerformance[] = [];
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const e of strengthEntries(s)) {
      if (e.exerciseId === exerciseId && e.sets.length > 0) out.push({ sessionId: s.id, date: s.startedAt, sets: e.sets });
    }
  }
  // Usually already in order; sort only when it isn't (e.g. workouts synced from another phone). ISO dates sort as text.
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1].date > out[i].date) {
      out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      break;
    }
  }
  return out;
}

export function lastPerformance(sessions: WorkoutSession[], exerciseId: string): ExercisePerformance | undefined {
  return exerciseHistory(sessions, exerciseId).at(-1);
}

/** The heaviest weight used - treated as the "working weight" of that performance. */
export function workingWeight(sets: SetLog[]): number {
  let w = 0;
  for (const s of sets) if (s.weightKg > w) w = s.weightKg;
  return w;
}

export function workingSets(sets: SetLog[]): SetLog[] {
  const w = workingWeight(sets);
  return sets.filter((s) => s.weightKg === w);
}

/** Most reps in any set at (at least) the given weight; 0 if none. Used to compare a workout with a target. */
export function bestRepsAtWeight(sets: SetLog[], weightKg: number): number {
  return Math.max(0, ...sets.filter((s) => s.weightKg >= weightKg).map((s) => s.reps));
}

/** Epley estimate of a one-rep max. Used only for the trend chart. */
export function estimated1RM(set: SetLog): number {
  return set.weightKg * (1 + set.reps / 30);
}

export function bestEstimated1RM(sets: SetLog[]): number {
  return Math.max(0, ...sets.map(estimated1RM));
}

export function volumeKg(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + s.reps * s.weightKg, 0);
}

export function sessionVolumeKg(session: WorkoutSession): number {
  return strengthEntries(session).reduce((sum, e) => sum + volumeKg(e.sets), 0);
}

export function sessionSetCount(session: WorkoutSession): number {
  return strengthEntries(session).reduce((n, e) => n + e.sets.length, 0);
}


/** "1 set", "3 sets". For words with a regular plural. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** One target, e.g. "60 kg × 9" (or "12 reps" for bodyweight). */
export function formatTarget(t: { weightKg: number; reps: number }): string {
  return t.weightKg > 0 ? `${formatWeight(t.weightKg)} × ${t.reps}` : `${t.reps} reps`;
}

/** "40 kg × 10 · 10 · 9" - consecutive sets at the same weight are grouped. */
export function formatSets(sets: SetLog[]): string {
  const groups: { weightKg: number; reps: number[] }[] = [];
  for (const s of sets) {
    const last = groups.at(-1);
    if (last && last.weightKg === s.weightKg) last.reps.push(s.reps);
    else groups.push({ weightKg: s.weightKg, reps: [s.reps] });
  }
  return groups
    .map((g) => (g.weightKg > 0 ? `${formatWeight(g.weightKg)} × ${g.reps.join(' · ')}` : `${g.reps.join(' · ')} reps`))
    .join(', ');
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function relativeDay(iso: string, now = new Date()): string {
  const days = Math.floor(daysBetween(iso, now.toISOString()));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

/** When a routine was last done ('' = never). Doesn't rely on the order of `sessions` (synced workouts can arrive in any order). */
export function lastDoneAt(sessions: WorkoutSession[], routineId: string): string {
  let last = '';
  for (const s of sessions) if (s.routineId === routineId && s.startedAt > last) last = s.startedAt;
  return last;
}

/** Routines ordered "next up" first: the one done longest ago (never done counts as oldest). */
export function routinesByNextUp(routines: Routine[], sessions: WorkoutSession[]): Routine[] {
  const last = new Map(routines.map((r) => [r.id, lastDoneAt(sessions, r.id)]));
  return [...routines].sort((a, b) => last.get(a.id)!.localeCompare(last.get(b.id)!));
}

/** Exercises the user is probably about to do: unfinished ones in the current workout, else the next-up routine. */
export function likelyExerciseIds(data: AppData): string[] {
  if (data.activeWorkout) {
    return strengthEntries(data.activeWorkout.session).filter((e) => e.sets.length < e.targetSets).map((e) => e.exerciseId);
  }
  return routinesByNextUp(data.routines, data.sessions)[0]?.items.filter(isStrengthItem).map((i) => i.exerciseId) ?? [];
}
