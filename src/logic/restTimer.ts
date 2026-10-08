/**
 * The rest timer between strength sets. It starts by itself when a set is logged; tapping it stops it, tapping again
 * restarts it from 0:00. Logging the next set always restarts it. Worked out from timestamps only (never a counter),
 * so it stays right when the screen locks, the app is in the background or the page reloads.
 * Strength sets only: cardio, warm-ups and cool-downs have their own timer (logic/cardio.ts).
 */
import type { ActiveWorkout, WorkoutSession } from '../types';
import { isStrength } from './entries';

export type RestTimer = NonNullable<ActiveWorkout['restTimer']>;

/** The most recent strength set of the workout (what the rest timer counts from by default). */
export function latestStrengthSet(session: WorkoutSession): { entryIndex: number; setIndex: number; loggedAt: string } | undefined {
  let latest: { entryIndex: number; setIndex: number; loggedAt: string } | undefined;
  session.entries.forEach((e, i) => {
    if (!isStrength(e)) return;
    const s = e.sets.at(-1);
    if (s && (!latest || s.loggedAt > latest.loggedAt)) latest = { entryIndex: i, setIndex: e.sets.length - 1, loggedAt: s.loggedAt };
  });
  return latest;
}

export interface RestTimerState {
  running: boolean;
  /** When the current count started. */
  startedAt: string;
  elapsedMs: number;
}

/** null before the first strength set. A tap after the latest set takes over; a newer set restarts it. */
export function restTimerState(session: WorkoutSession, timer: RestTimer | undefined, now: number): RestTimerState | null {
  const latest = latestStrengthSet(session);
  if (!latest) return null;
  if (timer && Date.parse(timer.startedAt) >= Date.parse(latest.loggedAt)) {
    const end = timer.stoppedAt ? Date.parse(timer.stoppedAt) : now;
    return { running: !timer.stoppedAt, startedAt: timer.startedAt, elapsedMs: Math.max(0, end - Date.parse(timer.startedAt)) };
  }
  return { running: true, startedAt: latest.loggedAt, elapsedMs: Math.max(0, now - Date.parse(latest.loggedAt)) };
}

/** Tap: running → stopped (time frozen); stopped → running again from 0:00. */
export function toggledRestTimer(session: WorkoutSession, timer: RestTimer | undefined, now: Date): RestTimer | undefined {
  const state = restTimerState(session, timer, now.getTime());
  if (!state) return timer;
  return state.running ? { startedAt: state.startedAt, stoppedAt: now.toISOString() } : { startedAt: now.toISOString() };
}
