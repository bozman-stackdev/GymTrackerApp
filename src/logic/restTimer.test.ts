/** The rest timer between strength sets: auto-start on a set, tap to stop, tap to restart from 0:00. */
import { describe, expect, it } from 'vitest';
import { logSet, startWorkout, startExercise, toggleRestTimer, undoLastSet } from '../data/actions';
import { createStarterData } from '../data/seed';
import { parseAppData } from '../data/validate';
import type { AppData } from '../types';
import { restTimerState } from './restTimer';

const t0 = new Date('2026-10-08T18:00:00Z');
const at = (sec: number) => new Date(t0.getTime() + sec * 1000);
const state = (d: AppData, sec: number) => restTimerState(d.activeWorkout!.session, d.activeWorkout!.restTimer, at(sec).getTime());

function workoutWithSet(): AppData {
  const base = createStarterData();
  const d = startExercise(startWorkout(base, undefined, t0), base.exercises[0].id, t0);
  return logSet(d, 0, { reps: 10, weightKg: 40 }, at(0));
}

describe('rest timer (strength)', () => {
  it('nothing before the first set', () => {
    const base = createStarterData();
    const d = startExercise(startWorkout(base, undefined, t0), base.exercises[0].id, t0);
    expect(state(d, 30)).toBeNull();
  });

  it('starts by itself when a set is logged, worked out from the timestamp (a locked screen loses nothing)', () => {
    const d = workoutWithSet();
    expect(state(d, 90)).toMatchObject({ running: true, elapsedMs: 90_000 });
    expect(state(d, 600)).toMatchObject({ running: true, elapsedMs: 600_000 }); // 10 minutes, no ticks needed
  });

  it('tap: stops and the time freezes', () => {
    const d = toggleRestTimer(workoutWithSet(), at(90));
    expect(state(d, 90)).toMatchObject({ running: false, elapsedMs: 90_000 });
    expect(state(d, 400)).toMatchObject({ running: false, elapsedMs: 90_000 });
  });

  it('tap again: starts from 0:00', () => {
    const d = toggleRestTimer(toggleRestTimer(workoutWithSet(), at(90)), at(150));
    expect(state(d, 150)).toMatchObject({ running: true, elapsedMs: 0 });
    expect(state(d, 170)).toMatchObject({ running: true, elapsedMs: 20_000 });
    // ...and it can be stopped and restarted again and again.
    const again = toggleRestTimer(toggleRestTimer(d, at(200)), at(300));
    expect(state(again, 310)).toMatchObject({ running: true, elapsedMs: 10_000 });
  });

  it('logging the next set restarts it from 0:00, stopped or not', () => {
    const stopped = toggleRestTimer(workoutWithSet(), at(90));
    const next = logSet(stopped, 0, { reps: 10, weightKg: 40 }, at(200));
    expect(state(next, 200)).toMatchObject({ running: true, elapsedMs: 0 });
    expect(state(next, 230)).toMatchObject({ running: true, elapsedMs: 30_000 });
  });

  it('undo after a tap keeps the tapped timer; undo of every set hides it', () => {
    let d = logSet(workoutWithSet(), 0, { reps: 10, weightKg: 40 }, at(100));
    d = toggleRestTimer(d, at(160)); // stopped at 1:00
    d = undoLastSet(d, 0);
    expect(state(d, 200)).toMatchObject({ running: false, elapsedMs: 60_000 });
    d = undoLastSet(d, 0);
    expect(state(d, 200)).toBeNull();
  });

  it('only touches the rest timer: the logged sets are unchanged', () => {
    const d = workoutWithSet();
    const tapped = toggleRestTimer(d, at(90));
    expect(tapped.activeWorkout!.session).toBe(d.activeWorkout!.session);
    expect(tapped.sessions).toBe(d.sessions);
  });

  it('is kept when the workout is saved and reloaded; an odd value is dropped, never rejecting the data', () => {
    const d = toggleRestTimer(workoutWithSet(), at(90));
    const reloaded = parseAppData(JSON.parse(JSON.stringify(d)));
    expect(reloaded.activeWorkout!.restTimer).toEqual(d.activeWorkout!.restTimer);
    const odd = JSON.parse(JSON.stringify(d));
    odd.activeWorkout.restTimer = { startedAt: 'nope' };
    expect(parseAppData(odd).activeWorkout!.restTimer).toBeUndefined();
  });
});
