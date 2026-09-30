/**
 * Every change to app data goes through one of these pure functions: (data, ...args) => newData.
 * They never touch storage or React, so they are easy to test and reuse in a native app later.
 */
import { preferredEquipmentId } from '../logic/equipment';
import type { AppData, Exercise, GymEquipment, Profile, Routine, SetLog, WorkoutSession } from '../types';

export function newId(): string {
  // crypto.randomUUID is unavailable on plain-http LAN addresses, so keep a simple fallback.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Workout in progress ----------

export function startWorkout(data: AppData, routine?: Routine, now = new Date()): AppData {
  const session: WorkoutSession = {
    id: newId(),
    name: routine?.name ?? 'Workout',
    routineId: routine?.id,
    startedAt: now.toISOString(),
    entries: (routine?.items ?? []).map((i) => ({
      exerciseId: i.exerciseId, targetSets: i.sets, sets: [], equipmentId: preferredEquipmentId(data, i.exerciseId),
    })),
  };
  return { ...data, activeWorkout: { session, currentIndex: 0 } };
}

function updateActive(data: AppData, fn: (s: WorkoutSession) => WorkoutSession, currentIndex?: number): AppData {
  if (!data.activeWorkout) return data;
  return {
    ...data,
    activeWorkout: { session: fn(data.activeWorkout.session), currentIndex: currentIndex ?? data.activeWorkout.currentIndex },
  };
}

/** Adds an exercise to the current workout (or jumps to it if it's already there) and makes it current. */
export function addExerciseToWorkout(data: AppData, exerciseId: string, sets = 3, equipmentId?: string): AppData {
  if (!data.activeWorkout) return data;
  const existing = data.activeWorkout.session.entries.findIndex((e) => e.exerciseId === exerciseId);
  if (existing >= 0) return equipmentId ? setEntryEquipment(goToExercise(data, existing), existing, equipmentId) : goToExercise(data, existing);
  const index = data.activeWorkout.session.entries.length;
  const entry = { exerciseId, targetSets: sets, sets: [], equipmentId: equipmentId ?? preferredEquipmentId(data, exerciseId) };
  return updateActive(data, (s) => ({ ...s, entries: [...s.entries, entry] }), index);
}

/** Which machine is used for an exercise in the workout in progress. */
export function setEntryEquipment(data: AppData, entryIndex: number, equipmentId: string | undefined): AppData {
  return updateActive(data, (s) => ({ ...s, entries: s.entries.map((e, i) => (i === entryIndex ? { ...e, equipmentId } : e)) }));
}

/** Start tracking one exercise now: added to the current workout, or a new workout is started for it. */
export function startExercise(data: AppData, exerciseId: string, now = new Date(), equipmentId?: string): AppData {
  return addExerciseToWorkout(data.activeWorkout ? data : startWorkout(data, undefined, now), exerciseId, 3, equipmentId);
}

export function goToExercise(data: AppData, index: number): AppData {
  if (!data.activeWorkout) return data;
  const max = data.activeWorkout.session.entries.length - 1;
  return updateActive(data, (s) => s, Math.max(0, Math.min(index, max)));
}

/**
 * Records a set. When this set completes the exercise's planned sets, the workout moves on
 * to the next unfinished exercise automatically (one less tap between exercises).
 */
/** Limits for a single set; anything outside is a typo, not a set. */
export const SET_LIMITS = { maxReps: 100, maxWeightKg: 1000 };

export function isValidSet({ reps, weightKg }: Omit<SetLog, 'loggedAt'>): boolean {
  return Number.isInteger(reps) && reps > 0 && reps <= SET_LIMITS.maxReps
    && Number.isFinite(weightKg) && weightKg >= 0 && weightKg <= SET_LIMITS.maxWeightKg;
}

export function logSet(data: AppData, entryIndex: number, set: Omit<SetLog, 'loggedAt'>, now = new Date()): AppData {
  if (!isValidSet(set) || !data.activeWorkout?.session.entries[entryIndex]) return data;
  const logged = updateActive(data, (s) => ({
    ...s,
    entries: s.entries.map((e, i) => (i === entryIndex ? { ...e, sets: [...e.sets, { ...set, loggedAt: now.toISOString() }] } : e)),
  }));
  const session = logged.activeWorkout!.session;
  const entry = session.entries[entryIndex];
  if (entry.sets.length !== entry.targetSets) return logged;
  return goToExercise(logged, nextUnfinished(session, entryIndex) ?? entryIndex);
}

/** Removes the last set of an exercise and shows that exercise again. */
export function undoLastSet(data: AppData, entryIndex: number): AppData {
  return updateActive(
    data,
    (s) => ({ ...s, entries: s.entries.map((e, i) => (i === entryIndex ? { ...e, sets: e.sets.slice(0, -1) } : e)) }),
    entryIndex,
  );
}

/**
 * Edits (patch) or deletes (null) one logged set - in the workout in progress or in a finished workout.
 * In a finished workout, an exercise left without sets is removed, and so is a workout left empty.
 * XP, streaks and journeys are derived from history, so they update by themselves.
 */
export function editSet(
  data: AppData, sessionId: string, entryIndex: number, setIndex: number, patch: Omit<SetLog, 'loggedAt'> | null,
): AppData {
  if (patch && !isValidSet(patch)) return data;
  const edit = (s: WorkoutSession): WorkoutSession => ({
    ...s,
    entries: s.entries.map((e, i) => (i !== entryIndex ? e : {
      ...e,
      sets: patch ? e.sets.map((x, j) => (j === setIndex ? { ...x, ...patch } : x)) : e.sets.filter((_, j) => j !== setIndex),
    })),
  });
  if (data.activeWorkout?.session.id === sessionId) return updateActive(data, edit);
  const sessions = data.sessions
    .map((s) => (s.id === sessionId ? { ...edit(s), entries: edit(s).entries.filter((e) => e.sets.length > 0) } : s))
    .filter((s) => s.entries.length > 0);
  return { ...data, sessions };
}

/** Index of the next exercise with sets still to do (looking forward first, then from the top). */
export function nextUnfinished(session: WorkoutSession, from: number): number | undefined {
  const n = session.entries.length;
  for (let step = 1; step < n; step++) {
    const i = (from + step) % n;
    if (session.entries[i].sets.length < session.entries[i].targetSets) return i;
  }
  return undefined;
}

/** Saves the workout to history. Exercises with no sets are dropped; an empty workout is discarded. */
export function finishWorkout(data: AppData, now = new Date()): AppData {
  if (!data.activeWorkout) return data;
  const session = data.activeWorkout.session;
  const entries = session.entries.filter((e) => e.sets.length > 0);
  if (entries.length === 0) return { ...data, activeWorkout: null };
  return {
    ...data,
    sessions: [...data.sessions, { ...session, entries, finishedAt: now.toISOString() }],
    activeWorkout: null,
  };
}

export function discardWorkout(data: AppData): AppData {
  return { ...data, activeWorkout: null };
}

// ---------- History ----------

export function deleteSession(data: AppData, sessionId: string): AppData {
  return { ...data, sessions: data.sessions.filter((s) => s.id !== sessionId) };
}

// ---------- Exercises, routines, profile ----------

export function saveExercise(data: AppData, exercise: Exercise): AppData {
  const exists = data.exercises.some((e) => e.id === exercise.id);
  return {
    ...data,
    exercises: exists ? data.exercises.map((e) => (e.id === exercise.id ? exercise : e)) : [...data.exercises, exercise],
  };
}

export function saveRoutine(data: AppData, routine: Routine): AppData {
  const exists = data.routines.some((r) => r.id === routine.id);
  return {
    ...data,
    routines: exists ? data.routines.map((r) => (r.id === routine.id ? routine : r)) : [...data.routines, routine],
  };
}

export function deleteRoutine(data: AppData, routineId: string): AppData {
  return { ...data, routines: data.routines.filter((r) => r.id !== routineId) };
}

// ---------- My gym (equipment library) ----------

export function saveEquipment(data: AppData, item: GymEquipment): AppData {
  const exists = data.equipment.some((e) => e.id === item.id);
  return { ...data, equipment: exists ? data.equipment.map((e) => (e.id === item.id ? item : e)) : [...data.equipment, item] };
}

/** Removes a machine from My gym. Past workouts keep their record of it being used (shown as "removed"). */
export function deleteEquipment(data: AppData, id: string): AppData {
  return { ...data, equipment: data.equipment.filter((e) => e.id !== id) };
}

export function saveProfile(data: AppData, profile: Profile): AppData {
  return { ...data, profile };
}
