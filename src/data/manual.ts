/**
 * "Add missed workout": a workout that already happened, entered afterwards from History.
 *
 * It is a record, not a live workout (WorkoutSession.manual): no XP, challenges, achievements or streak rewards
 * (logic/game/progress.ts). Only what the user entered is saved - nothing is filled in from earlier workouts - and only
 * complete sets (reps, plus a weight for weighted exercises) count as performance. An exercise without complete sets
 * is kept as "done, no details" (no sets), which the progression engine ignores.
 */
import { dayKey } from '../logic/leaderboard/score';
import { SET_LIMITS, newId } from './actions';
import type { ActivityEntry, ActivityKind, AppData, Exercise, SessionEntry, StrengthEntry, WorkoutSession } from '../types';

export const FREESTYLE_NAME = 'Freestyle Workout';
export const MANUAL_LIMITS = { maxDurationMin: 600, maxNote: 200, maxCardioMin: 600, earliest: '2000-01-01' };

export type ManualItem =
  | { type: 'strength'; exerciseId: string; sets: { reps: number | null; weightKg: number | null }[] }
  | { type: 'activity'; kind: ActivityKind; activityId: string; name?: string; minutes: number | null };

export interface ManualWorkoutInput {
  /** Set when editing an existing manual entry. */
  id?: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** A saved routine; undefined = Freestyle Workout. */
  routineId?: string;
  durationMin?: number | null;
  note?: string;
  items: ManualItem[];
}

/** Why a date can't be used, or null. */
export function manualDateProblem(date: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`))) return 'Choose a date';
  if (date > dayKey(now)) return "Missed workouts are in the past: choose today or an earlier day";
  if (date < MANUAL_LIMITS.earliest) return 'Choose a later date';
  return null;
}

/** A set the user really entered in full: reps, plus a weight when the exercise uses weights. */
export function completeSet(s: { reps: number | null; weightKg: number | null }, exercise: Exercise | undefined): boolean {
  if (s.reps === null || !Number.isInteger(s.reps) || s.reps < 1 || s.reps > SET_LIMITS.maxReps) return false;
  if (!exercise || exercise.weightStepKg <= 0) return true;
  return s.weightKg !== null && Number.isFinite(s.weightKg) && s.weightKg >= 0 && s.weightKg <= SET_LIMITS.maxWeightKg;
}

/** Other workouts on the same day (to warn about an accidental duplicate; saving is still allowed). */
export function sameDayWorkouts(sessions: WorkoutSession[], date: string, exceptId?: string): WorkoutSession[] {
  return sessions.filter((s) => s.id !== exceptId && dayKey(s.startedAt) === date);
}

/** Adds (or, with input.id, updates) a manual workout. Never touches the workout in progress. */
export function saveManualWorkout(
  data: AppData, input: ManualWorkoutInput, now = new Date(), newSessionId: string = newId(),
): { data: AppData; session: WorkoutSession } | { error: string } {
  const dateProblem = manualDateProblem(input.date, now);
  if (dateProblem) return { error: dateProblem };
  const existing = input.id ? data.sessions.find((s) => s.id === input.id && s.manual) : undefined;
  if (input.id && !existing) return { error: 'That workout no longer exists.' };
  const routine = input.routineId ? data.routines.find((r) => r.id === input.routineId) : undefined;

  const duration = input.durationMin ? Math.round(input.durationMin) : undefined;
  if (duration !== undefined && (duration < 1 || duration > MANUAL_LIMITS.maxDurationMin)) return { error: `Duration: 1 to ${MANUAL_LIMITS.maxDurationMin} minutes` };

  // The real date: keep the original time when the day didn't change; otherwise midday (or just now, for today).
  let start: Date;
  if (existing && dayKey(existing.startedAt) === input.date) start = new Date(existing.startedAt);
  else if (input.date === dayKey(now)) start = new Date(now.getTime() - (duration ?? 0) * 60_000);
  else start = new Date(`${input.date}T12:00:00`);
  const startedAt = start.toISOString();
  const finishedAt = new Date(start.getTime() + (duration ?? 0) * 60_000).toISOString();

  const byId = new Map(data.exercises.map((e) => [e.id, e]));
  const entries: SessionEntry[] = [];
  for (const item of input.items) {
    if (item.type === 'strength') {
      const exercise = byId.get(item.exerciseId);
      if (!exercise) continue;
      const usesWeight = exercise.weightStepKg > 0;
      const sets = item.sets.filter((s) => completeSet(s, exercise))
        .map((s) => ({ reps: s.reps!, weightKg: usesWeight ? s.weightKg! : 0, loggedAt: startedAt }));
      entries.push({ exerciseId: item.exerciseId, targetSets: sets.length, sets } satisfies StrengthEntry);
    } else {
      const minutes = item.minutes !== null && item.minutes > 0 ? Math.min(MANUAL_LIMITS.maxCardioMin, Math.round(item.minutes)) : undefined;
      entries.push({
        kind: item.kind, activityId: item.activityId, ...(item.name?.trim() ? { name: item.name.trim() } : {}),
        ...(minutes ? { durationSec: minutes * 60 } : {}), doneAt: finishedAt,
      } satisfies ActivityEntry);
    }
  }

  const note = input.note?.trim().slice(0, MANUAL_LIMITS.maxNote);
  const session: WorkoutSession = {
    id: existing?.id ?? newSessionId,
    name: routine?.name ?? FREESTYLE_NAME,
    ...(routine ? { routineId: routine.id } : {}),
    startedAt,
    finishedAt,
    entries,
    manual: { addedAt: existing?.manual?.addedAt ?? now.toISOString(), ...(duration ? { durationMin: duration } : {}), ...(note ? { note } : {}) },
  };
  const sessions = existing ? data.sessions.map((s) => (s.id === existing.id ? session : s)) : [...data.sessions, session];
  return { data: { ...data, sessions }, session };
}

/** The form's starting point for editing a manual workout. */
export function toManualInput(s: WorkoutSession): ManualWorkoutInput {
  return {
    id: s.id,
    date: dayKey(s.startedAt),
    routineId: s.routineId,
    durationMin: s.manual?.durationMin ?? null,
    note: s.manual?.note ?? '',
    items: s.entries.map((e): ManualItem => ('exerciseId' in e
      ? { type: 'strength', exerciseId: e.exerciseId, sets: e.sets.map((x) => ({ reps: x.reps, weightKg: x.weightKg })) }
      : { type: 'activity', kind: e.kind, activityId: e.activityId, name: e.name, minutes: e.durationSec ? Math.round(e.durationSec / 60) : null })),
  };
}
