import type { AppData, Routine, SetLog, WorkoutSession } from '../types';

/** One past performance of a single exercise. */
export interface ExercisePerformance {
  sessionId: string;
  date: string;
  sets: SetLog[];
}

/** All finished performances of an exercise, oldest first. */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExercisePerformance[] {
  return sessions
    .filter((s) => s.finishedAt)
    .flatMap((s) =>
      s.entries
        .filter((e) => e.exerciseId === exerciseId && e.sets.length > 0)
        .map((e) => ({ sessionId: s.id, date: s.startedAt, sets: e.sets })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function lastPerformance(sessions: WorkoutSession[], exerciseId: string): ExercisePerformance | undefined {
  return exerciseHistory(sessions, exerciseId).at(-1);
}

/** The heaviest weight used - treated as the "working weight" of that performance. */
export function workingWeight(sets: SetLog[]): number {
  return Math.max(0, ...sets.map((s) => s.weightKg));
}

export function workingSets(sets: SetLog[]): SetLog[] {
  const w = workingWeight(sets);
  return sets.filter((s) => s.weightKg === w);
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

export function formatKg(kg: number): string {
  return `${Number(kg.toFixed(2))} kg`;
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
    .map((g) => (g.weightKg > 0 ? `${formatKg(g.weightKg)} × ${g.reps.join(' · ')}` : `${g.reps.join(' · ')} reps`))
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

/** Routines ordered "next up" first: the one done longest ago (never done counts as oldest). */
export function routinesByNextUp(routines: Routine[], sessions: WorkoutSession[]): Routine[] {
  const lastDone = (id: string) => sessions.filter((s) => s.routineId === id).at(-1)?.startedAt ?? '';
  return [...routines].sort((a, b) => lastDone(a.id).localeCompare(lastDone(b.id)));
}

/** Exercises the user is probably about to do: unfinished ones in the current workout, else the next-up routine. */
export function likelyExerciseIds(data: AppData): string[] {
  if (data.activeWorkout) {
    return data.activeWorkout.session.entries.filter((e) => e.sets.length < e.targetSets).map((e) => e.exerciseId);
  }
  return routinesByNextUp(data.routines, data.sessions)[0]?.items.map((i) => i.exerciseId) ?? [];
}
