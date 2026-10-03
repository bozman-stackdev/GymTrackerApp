/** Workout actions and storage for cardio, warm-ups and cool-downs (mixed workouts). */
import { describe, expect, it } from 'vitest';
import {
  addActivityToWorkout, adjustActivityDuration, deleteEntry, doneActivity, finishExercise, finishWorkout, logSet, logWarmupSet,
  restartActivity, startActivityTimer, startWorkout, stopActivityTimer, undoWarmupSet,
} from './actions';
import { isRunning } from '../logic/cardio';
import { createStarterData } from './seed';
import { parseAppData } from './validate';
import type { ActivityEntry, AppData, Routine } from '../types';
import { isStrength } from '../logic/entries';
import { S } from '../test/helpers';
import { memoryBackend, memoryServer } from '../services/backend/memory';
import { applyPatch, dataFromAccount, syncOnce, type SyncState } from '../services/backend/sync';

const routine: Routine = {
  id: 'mixed', name: 'Mixed',
  items: [
    { kind: 'warmup', activityId: 'mobility', plan: { durationMin: 5 } },
    { exerciseId: 'bench-press', sets: 2 },
    { kind: 'cardio', activityId: 'treadmill', plan: { durationMin: 20 } },
    { kind: 'cooldown', activityId: 'stretching', plan: { durationMin: 5 } },
  ],
};
const A = (d: AppData, i: number) => d.activeWorkout!.session.entries[i] as ActivityEntry;
const now = new Date('2026-06-01T18:00:00');

const t = (sec: number) => new Date(now.getTime() + sec * 1000);
/** START at t0, STOP `sec` seconds later. */
const timed = (d: AppData, i: number, from: number, sec: number) => stopActivityTimer(startActivityTimer(d, i, t(from)), i, t(from + sec));

describe('mixed workouts (timer)', () => {
  it('a routine with activities starts with them in order, planned, with the planned minutes as a target', () => {
    const d = startWorkout(createStarterData(), routine);
    const e = d.activeWorkout!.session.entries;
    expect(e.map((x) => (isStrength(x) ? 'strength' : x.kind))).toEqual(['warmup', 'strength', 'cardio', 'cooldown']);
    expect(A(d, 2)).toEqual({ kind: 'cardio', activityId: 'treadmill', plan: { durationMin: 20 }, planned: true });
  });

  it('START → STOP saves the duration from the timestamps; DONE moves on; nothing is typed', () => {
    let d = startWorkout(createStarterData(), routine);
    d = startActivityTimer(d, 2, t(0));
    expect(A(d, 2)).toMatchObject({ startedAt: t(0).toISOString() });
    expect(A(d, 2).doneAt).toBeUndefined();
    d = stopActivityTimer(d, 2, t(1422));
    expect(A(d, 2)).toMatchObject({ durationSec: 1422, endedAt: t(1422).toISOString(), doneAt: t(1422).toISOString() });
    expect(A(d, 2).log).toBeUndefined(); // no metrics written
    expect(d.activeWorkout!.currentIndex).toBe(2); // stays to show the result
    d = doneActivity(d, 2);
    expect(d.activeWorkout!.currentIndex).toBe(3); // the next item still to do
  });

  it('warm-up → strength → strength → cardio → cool-down, saved in order', () => {
    let d = startWorkout(createStarterData(), {
      id: 'm', name: 'M', items: [
        { kind: 'warmup', activityId: 'walking' }, { exerciseId: 'bench-press', sets: 2 }, { exerciseId: 'lat-pulldown', sets: 1 },
        { kind: 'cardio', activityId: 'treadmill' }, { kind: 'cooldown', activityId: 'cycling' },
      ],
    });
    d = doneActivity(timed(d, 0, 0, 332), 0);
    expect(d.activeWorkout!.currentIndex).toBe(1);
    d = logSet(logSet(d, 1, { reps: 8, weightKg: 60 }), 1, { reps: 8, weightKg: 60 });
    d = logSet(d, 2, { reps: 10, weightKg: 50 });
    expect(d.activeWorkout!.currentIndex).toBe(3);
    d = doneActivity(timed(d, 3, 900, 1422), 3);
    d = doneActivity(timed(d, 4, 2400, 495), 4);
    expect(d.activeWorkout!.currentIndex).toBe(5); // the "what next?" state
    d = finishWorkout(d, t(3000));
    const saved = d.sessions.at(-1)!;
    expect(saved.entries).toHaveLength(5);
    expect(saved.entries.map((e) => (isStrength(e) ? e.exerciseId : `${e.kind}:${e.durationSec}`)))
      .toEqual(['warmup:332', 'bench-press', 'lat-pulldown', 'cardio:1422', 'cooldown:495']);
  });

  it('only one timer runs: starting another stops (and saves) the first', () => {
    let d = startWorkout(createStarterData(), routine);
    d = startActivityTimer(d, 0, t(0));
    d = startActivityTimer(d, 2, t(300));
    expect(A(d, 0)).toMatchObject({ durationSec: 300 });
    expect(isRunning(A(d, 2))).toBe(true);
  });

  it('Finish Session stops a running timer and saves it (never lost)', () => {
    let d = startWorkout(createStarterData(), routine);
    d = startActivityTimer(d, 2, t(0));
    d = finishWorkout(d, t(1200));
    expect(d.sessions.at(-1)!.entries).toEqual([expect.objectContaining({ kind: 'cardio', durationSec: 1200 })]);
  });

  it('Adjust (forgot to stop) and Restart', () => {
    let d = timed(startWorkout(createStarterData(), routine), 2, 0, 7200);
    d = adjustActivityDuration(d, 2, 25 * 60);
    expect(A(d, 2).durationSec).toBe(1500);
    expect(adjustActivityDuration(d, 2, -5).activeWorkout!.session.entries[2]).toMatchObject({ durationSec: 0 });
    d = restartActivity(d, 2);
    expect(A(d, 2)).toEqual({ kind: 'cardio', activityId: 'treadmill', plan: { durationMin: 20 }, planned: true });
  });

  it('activities not done are dropped on finish; a cardio-only workout is kept', () => {
    const d = finishWorkout(timed(startWorkout(createStarterData(), routine), 2, 0, 1800));
    expect(d.sessions.at(-1)!.entries).toEqual([expect.objectContaining({ kind: 'cardio', activityId: 'treadmill' })]);
  });

  it('two cardio activities can be added to an empty workout', () => {
    let d = startWorkout(createStarterData(), undefined);
    d = addActivityToWorkout(d, 'cardio', 'rowing');
    d = doneActivity(timed(d, 0, 0, 600), 0);
    d = addActivityToWorkout(d, 'cardio', 'other', '  Boxing ');
    expect(d.activeWorkout!.currentIndex).toBe(1);
    expect(A(d, 1)).toEqual({ kind: 'cardio', activityId: 'other', name: 'Boxing' });
    d = finishWorkout(timed(d, 1, 700, 900));
    expect(d.sessions.at(-1)!.entries).toHaveLength(2);
  });

  it('timer actions ignore strength entries', () => {
    const d = startWorkout(createStarterData(), routine);
    expect(startActivityTimer(d, 1)).toBe(d);
    expect(stopActivityTimer(d, 1)).toBe(d);
    expect(adjustActivityDuration(d, 1, 60)).toBe(d);
  });
});

describe('warm-up sets', () => {
  const start = () => {
    let d = startWorkout(createStarterData(), { id: 'r', name: 'R', items: [{ exerciseId: 'squat', sets: 3 }, { exerciseId: 'bench-press', sets: 3 }] });
    d = finishExercise(logSet(d, 0, { reps: 5, weightKg: 100 })); // on to bench (index 1)
    return d;
  };

  it('go into a warm-up entry placed just before the exercise; the exercise stays current and its sets stay clean', () => {
    let d = start();
    d = logWarmupSet(d, 1, { reps: 10, weightKg: 20 }, now);
    const e = d.activeWorkout!.session.entries;
    expect(e).toHaveLength(3);
    expect(e[1]).toMatchObject({ kind: 'warmup', warmupFor: 'bench-press', warmupSets: [{ reps: 10, weightKg: 20 }] });
    expect(d.activeWorkout!.currentIndex).toBe(2); // still bench, which moved down by one
    expect(S(e[2]).sets).toEqual([]);

    d = logWarmupSet(d, 2, { reps: 5, weightKg: 40 }, now); // a second one joins the same entry
    expect(d.activeWorkout!.session.entries).toHaveLength(3);
    expect(A(d, 1).warmupSets).toHaveLength(2);
    d = logSet(d, 2, { reps: 8, weightKg: 60 });
    expect(S(d.activeWorkout!.session.entries[2]).sets).toEqual([expect.objectContaining({ reps: 8, weightKg: 60 })]);
  });

  it('undo removes the last warm-up set, then the entry (the exercise stays current)', () => {
    let d = logWarmupSet(logWarmupSet(start(), 1, { reps: 10, weightKg: 20 }), 2, { reps: 5, weightKg: 40 });
    d = undoWarmupSet(d, 'bench-press');
    expect(A(d, 1).warmupSets).toHaveLength(1);
    d = undoWarmupSet(d, 'bench-press');
    expect(d.activeWorkout!.session.entries).toHaveLength(2);
    expect(d.activeWorkout!.currentIndex).toBe(1);
    expect(undoWarmupSet(d, 'bench-press')).toBe(d);
  });

  it('a workout of only warm-up sets is still saved (they are content), but invalid sets are refused', () => {
    const d = start();
    expect(logWarmupSet(d, 1, { reps: 0, weightKg: 20 })).toBe(d);
    expect(logWarmupSet(d, 5, { reps: 5, weightKg: 20 })).toBe(d);
  });
});

describe('storage of activities', () => {
  const finished = () => {
    let d = startWorkout(createStarterData(), routine);
    d = timed(d, 0, 0, 300);
    d = logWarmupSet(d, 1, { reps: 10, weightKg: 20 }, now);
    d = logSet(d, 2, { reps: 8, weightKg: 60 });
    d = timed(d, 3, 600, 1422);
    return finishWorkout(d);
  };

  it('backups with activities (and routines with activities) load unchanged', () => {
    const d = { ...finished(), routines: [routine] };
    expect(parseAppData(JSON.parse(JSON.stringify(d))).sessions).toEqual(d.sessions);
    expect(parseAppData(JSON.parse(JSON.stringify(d))).routines).toEqual([routine]);
  });

  it('broken activity entries are rejected with a readable error', () => {
    const d = finished();
    const bad = (patch: object) => {
      const copy = JSON.parse(JSON.stringify(d));
      Object.assign(copy.sessions.at(-1).entries[0], patch);
      return () => parseAppData(copy);
    };
    expect(bad({ kind: 'yoga' })).toThrow();
    expect(bad({ activityId: 5 })).toThrow();
    expect(bad({ log: { durationMin: 'ten' } })).toThrow();
    expect(bad({ warmupSets: [{ reps: 'x' }] })).toThrow();
    expect(bad({ durationSec: -1 })).toThrow();
    expect(bad({ startedAt: 'yesterday' })).toThrow();
    expect(bad({ log: { durationMin: 12, speedKmh: 6.5 } })).not.toThrow(); // older workouts with metrics still load
  });

  it('deleting an activity from a finished workout; deleting the last item removes the workout', () => {
    let d = finished();
    const id = d.sessions.at(-1)!.id;
    const n = d.sessions.at(-1)!.entries.length;
    d = deleteEntry(d, id, 0);
    expect(d.sessions.at(-1)!.entries).toHaveLength(n - 1);
    for (let i = 0; i < n - 1; i++) d = deleteEntry(d, id, 0);
    expect(d.sessions.some((s) => s.id === id)).toBe(false);
  });

  it('activities sync to a second phone exactly', async () => {
    const server = memoryServer();
    const a = memoryBackend(server);
    const up = await a.signUp('a@example.com', 'password1', 'A');
    if (up.status !== 'signed-in') throw new Error('expected sign-in');
    const data = finished();
    const stateA: SyncState = { accountId: up.account.id, cursor: null, synced: {} };
    await syncOnce(a, () => data, stateA);

    const b = memoryBackend(server);
    const acc = await b.signIn('a@example.com', 'password1');
    let other = await dataFromAccount(b, 'A');
    const r = await syncOnce(b, () => other, { accountId: acc.id, cursor: null, synced: {} });
    other = applyPatch(other, r.patch);
    expect(other.sessions).toEqual(data.sessions);
  });
});
