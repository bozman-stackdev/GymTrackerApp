/**
 * Every change to app data goes through one of these pure functions: (data, ...args) => newData.
 * They never touch storage or React, so they are easy to test and reuse in a native app later.
 */
import { preferredEquipmentId } from '../logic/equipment';
import { elapsedSec, isRunning } from '../logic/cardio';
import { hasContent, isEntryDone, isStrength, isStrengthItem } from '../logic/entries';
import type { ActivityEntry, ActivityKind, AppData, CardioMetrics, Exercise, GymEquipment, Profile, Routine, SessionEntry, SetLog, StrengthEntry, WorkoutSession } from '../types';
/** Longest duration an activity can be adjusted to (10 hours). */

export const MAX_ACTIVITY_SEC = 36_000;

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
    entries: (routine?.items ?? []).map((i): SessionEntry => (isStrengthItem(i)
      ? { exerciseId: i.exerciseId, targetSets: i.sets, sets: [], equipmentId: preferredEquipmentId(data, i.exerciseId) }
      : { kind: i.kind, activityId: i.activityId, ...(i.name ? { name: i.name } : {}), ...(i.plan ? { plan: i.plan } : {}), planned: true })),
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
  const existing = data.activeWorkout.session.entries.findIndex((e) => isStrength(e) && e.exerciseId === exerciseId);
  if (existing >= 0) return equipmentId ? setEntryEquipment(goToExercise(data, existing), existing, equipmentId) : goToExercise(data, existing);
  const index = data.activeWorkout.session.entries.length;
  const entry: StrengthEntry = { exerciseId, targetSets: sets, sets: [], equipmentId: equipmentId ?? preferredEquipmentId(data, exerciseId) };
  return updateActive(data, (s) => ({ ...s, entries: [...s.entries, entry] }), index);
}

/** Which machine is used for an exercise in the workout in progress. */
export function setEntryEquipment(data: AppData, entryIndex: number, equipmentId: string | undefined): AppData {
  return updateActive(data, (s) => ({ ...s, entries: s.entries.map((e, i) => (i === entryIndex && isStrength(e) ? { ...e, equipmentId } : e)) }));
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
  const target = data.activeWorkout?.session.entries[entryIndex];
  if (!isValidSet(set) || !target || !isStrength(target)) return data;
  const logged = updateActive(data, (s) => ({
    ...s,
    entries: s.entries.map((e, i) => (i === entryIndex && isStrength(e) ? { ...e, sets: [...e.sets, { ...set, loggedAt: now.toISOString() }] } : e)),
  }));
  const session = logged.activeWorkout!.session;
  const entry = session.entries[entryIndex] as StrengthEntry;
  if (entry.sets.length !== entry.targetSets) return logged;
  return goToExercise(logged, nextUnfinished(session, entryIndex) ?? entryIndex);
}

/** Removes the last set of an exercise and shows that exercise again. */
export function undoLastSet(data: AppData, entryIndex: number): AppData {
  return updateActive(
    data,
    (s) => ({ ...s, entries: s.entries.map((e, i) => (i === entryIndex && isStrength(e) ? { ...e, sets: e.sets.slice(0, -1) } : e)) }),
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
    entries: s.entries.map((e, i) => (i !== entryIndex || !isStrength(e) ? e : {
      ...e,
      sets: patch ? e.sets.map((x, j) => (j === setIndex ? { ...x, ...patch } : x)) : e.sets.filter((_, j) => j !== setIndex),
    })),
  });
  if (data.activeWorkout?.session.id === sessionId) return updateActive(data, edit);
  const sessions = data.sessions
    .map((s) => (s.id === sessionId ? { ...edit(s), entries: edit(s).entries.filter(hasContent) } : s))
    .filter((s) => s.entries.length > 0);
  return { ...data, sessions };
}

/** Index of the next item still to do - exercise with sets left, or activity not completed (forward first, then from the top). */
export function nextUnfinished(session: WorkoutSession, from: number): number | undefined {
  const n = session.entries.length;
  for (let step = 1; step < n; step++) {
    const i = (from + step) % n;
    if (!isEntryDone(session.entries[i])) return i;
  }
  return undefined;
}

/**
 * "Finish Exercise": go to the next exercise with sets still to do, or, when there is none, to the
 * "between exercises" state (currentIndex === entries.length), where the screen offers "+ Add exercise".
 * The session itself only ends with "Finish Session".
 */
export function finishExercise(data: AppData): AppData {
  if (!data.activeWorkout) return data;
  const { session, currentIndex } = data.activeWorkout;
  return updateActive(data, (s) => s, nextUnfinished(session, currentIndex) ?? session.entries.length);
}

/** Saves the workout to history. Exercises with no sets and activities not completed are dropped; an empty workout is discarded. */
export function finishWorkout(data: AppData, now = new Date()): AppData {
  if (!data.activeWorkout) return data;
  // A cardio timer still running is stopped now and saved (never lost by finishing first).
  const session = stopRunning(data.activeWorkout.session, now);
  const entries = session.entries.filter(hasContent);
  if (entries.length === 0) return { ...data, activeWorkout: null };
  return {
    ...data,
    sessions: [...data.sessions, { ...session, entries, finishedAt: now.toISOString() }],
    activeWorkout: null,
  };
}

// ---------- Cardio, warm-ups, cool-downs ----------

/** Adds a cardio / warm-up / cool-down item to the workout in progress and makes it current. */
export function addActivityToWorkout(data: AppData, kind: ActivityKind, activityId: string, name?: string, plan?: CardioMetrics): AppData {
  if (!data.activeWorkout) return data;
  const entry: ActivityEntry = { kind, activityId, ...(name?.trim() ? { name: name.trim() } : {}), ...(plan ? { plan } : {}) };
  const index = data.activeWorkout.session.entries.length;
  return updateActive(data, (s) => ({ ...s, entries: [...s.entries, entry] }), index);
}

/** Start an activity now: added to the current workout, or a new workout is started for it. */
export function startActivity(data: AppData, kind: ActivityKind, activityId: string, name?: string, now = new Date()): AppData {
  return addActivityToWorkout(data.activeWorkout ? data : startWorkout(data, undefined, now), kind, activityId, name);
}

/** Stops any running activity timer in a workout, saving its duration (only one timer runs at a time). */
function stopRunning(session: WorkoutSession, now: Date): WorkoutSession {
  if (!session.entries.some((e) => !isStrength(e) && isRunning(e))) return session;
  return { ...session, entries: session.entries.map((e) => (!isStrength(e) && isRunning(e) ? stopped(e, now) : e)) };
}

function stopped(e: ActivityEntry, now: Date): ActivityEntry {
  return { ...e, endedAt: now.toISOString(), doneAt: now.toISOString(), durationSec: elapsedSec(e.startedAt!, now.getTime()) };
}

const mapActivity = (data: AppData, entryIndex: number, fn: (e: ActivityEntry) => ActivityEntry, currentIndex?: number): AppData => {
  const target = data.activeWorkout?.session.entries[entryIndex];
  if (!target || isStrength(target)) return data;
  return updateActive(data, (s) => ({ ...s, entries: s.entries.map((e, i) => (i === entryIndex && !isStrength(e) ? fn(e) : e)) }), currentIndex);
};

/** START: the stopwatch begins now. Another running timer is stopped (and saved) first. */
export function startActivityTimer(data: AppData, entryIndex: number, now = new Date()): AppData {
  const target = data.activeWorkout?.session.entries[entryIndex];
  if (!target || isStrength(target)) return data;
  const others = updateActive(data, (s) => stopRunning(s, now));
  return mapActivity(others, entryIndex, (e) => ({
    ...omit(omit(omit(e, 'endedAt'), 'durationSec'), 'doneAt'), startedAt: now.toISOString(),
  }), entryIndex);
}

/** STOP: the duration is worked out from the start time and saved. Stays on the item to show the result. */
export function stopActivityTimer(data: AppData, entryIndex: number, now = new Date()): AppData {
  return mapActivity(data, entryIndex, (e) => (isRunning(e) ? stopped(e, now) : e));
}

/** Optional fix after STOP (e.g. forgot to stop): set the duration in seconds. */
export function adjustActivityDuration(data: AppData, entryIndex: number, sec: number): AppData {
  const clean = Math.max(0, Math.min(MAX_ACTIVITY_SEC, Math.round(sec)));
  return mapActivity(data, entryIndex, (e) => (e.doneAt ? { ...e, durationSec: clean } : e));
}

/** Restart: back to the ready state (00:00:00), nothing saved for it. */
export function restartActivity(data: AppData, entryIndex: number): AppData {
  return mapActivity(data, entryIndex, (e) => omit(omit(omit(omit(e, 'startedAt'), 'endedAt'), 'durationSec'), 'doneAt'), entryIndex);
}

/** DONE: on to the next item still to do (or the "what next?" state). */
export function doneActivity(data: AppData, entryIndex: number): AppData {
  const session = data.activeWorkout?.session;
  if (!session) return data;
  return updateActive(data, (s) => s, nextUnfinished(session, entryIndex) ?? session.entries.length);
}

/**
 * Logs a warm-up set for a strength exercise. Warm-up sets go into a separate warm-up entry placed just before the
 * exercise (created on the first one), so the strength entry - and therefore progression, challenges, personal
 * bests and XP - never sees them. Returns the data with the strength exercise still current.
 */
export function logWarmupSet(data: AppData, strengthIndex: number, set: Omit<SetLog, 'loggedAt'>, now = new Date()): AppData {
  const active = data.activeWorkout;
  const strength = active?.session.entries[strengthIndex];
  if (!active || !strength || !isStrength(strength) || !isValidSet(set)) return data;
  const logged = { ...set, loggedAt: now.toISOString() };
  const entries = active.session.entries;
  const existing = entries.findIndex((e) => !isStrength(e) && e.kind === 'warmup' && e.warmupFor === strength.exerciseId);
  if (existing >= 0) {
    return updateActive(data, (s) => ({
      ...s,
      entries: s.entries.map((e, i) => (i === existing && !isStrength(e) ? { ...e, warmupSets: [...(e.warmupSets ?? []), logged], doneAt: now.toISOString() } : e)),
    }));
  }
  const warmup: ActivityEntry = { kind: 'warmup', activityId: 'warmup-sets', warmupFor: strength.exerciseId, warmupSets: [logged], doneAt: now.toISOString() };
  return updateActive(
    data,
    (s) => ({ ...s, entries: [...s.entries.slice(0, strengthIndex), warmup, ...s.entries.slice(strengthIndex)] }),
    active.currentIndex >= strengthIndex ? active.currentIndex + 1 : active.currentIndex, // the exercise moved down by one
  );
}

/** Removes the last warm-up set of an exercise (the warm-up entry goes when it's empty). */
export function undoWarmupSet(data: AppData, exerciseId: string): AppData {
  const active = data.activeWorkout;
  if (!active) return data;
  const index = active.session.entries.findIndex((e) => !isStrength(e) && e.kind === 'warmup' && e.warmupFor === exerciseId);
  if (index < 0) return data;
  const e = active.session.entries[index] as ActivityEntry;
  const sets = (e.warmupSets ?? []).slice(0, -1);
  if (sets.length > 0) {
    return updateActive(data, (s) => ({ ...s, entries: s.entries.map((x, i) => (i === index ? { ...e, warmupSets: sets } : x)) }));
  }
  return updateActive(
    data,
    (s) => ({ ...s, entries: s.entries.filter((_, i) => i !== index) }),
    active.currentIndex > index ? active.currentIndex - 1 : active.currentIndex,
  );
}

/** Removes one item from a finished workout (e.g. a cardio entry recorded by mistake). An empty workout is removed. */
export function deleteEntry(data: AppData, sessionId: string, entryIndex: number): AppData {
  const sessions = data.sessions
    .map((s) => (s.id === sessionId ? { ...s, entries: s.entries.filter((_, i) => i !== entryIndex) } : s))
    .filter((s) => s.entries.length > 0);
  return { ...data, sessions };
}

function omit<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> {
  const { [key]: _drop, ...rest } = o;
  return rest;
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
