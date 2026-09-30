/**
 * Every change to app data goes through one of these pure functions: (data, ...args) => newData.
 * They never touch storage or React, so they are easy to test and reuse in a native app later.
 */
import type { AppData, Exercise, Profile, Routine, SetLog, WorkoutSession } from '../types';

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
    entries: (routine?.items ?? []).map((i) => ({ exerciseId: i.exerciseId, targetSets: i.sets, sets: [] })),
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
export function addExerciseToWorkout(data: AppData, exerciseId: string, sets = 3): AppData {
  if (!data.activeWorkout) return data;
  const existing = data.activeWorkout.session.entries.findIndex((e) => e.exerciseId === exerciseId);
  if (existing >= 0) return goToExercise(data, existing);
  const index = data.activeWorkout.session.entries.length;
  return updateActive(data, (s) => ({ ...s, entries: [...s.entries, { exerciseId, targetSets: sets, sets: [] }] }), index);
}

export function goToExercise(data: AppData, index: number): AppData {
  if (!data.activeWorkout) return data;
  const max = data.activeWorkout.session.entries.length - 1;
  return updateActive(data, (s) => s, Math.max(0, Math.min(index, max)));
}

export function logSet(data: AppData, entryIndex: number, set: Omit<SetLog, 'loggedAt'>, now = new Date()): AppData {
  return updateActive(data, (s) => ({
    ...s,
    entries: s.entries.map((e, i) => (i === entryIndex ? { ...e, sets: [...e.sets, { ...set, loggedAt: now.toISOString() }] } : e)),
  }));
}

export function undoLastSet(data: AppData, entryIndex: number): AppData {
  return updateActive(data, (s) => ({
    ...s,
    entries: s.entries.map((e, i) => (i === entryIndex ? { ...e, sets: e.sets.slice(0, -1) } : e)),
  }));
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

export function saveProfile(data: AppData, profile: Profile): AppData {
  return { ...data, profile };
}
