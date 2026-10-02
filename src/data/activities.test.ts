/** Workout actions and storage for cardio, warm-ups and cool-downs (mixed workouts). */
import { describe, expect, it } from 'vitest';
import {
  addActivityToWorkout, completeActivity, deleteEntry, finishExercise, finishWorkout, logSet, logWarmupSet, reopenActivity,
  startWorkout, undoWarmupSet,
} from './actions';
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

describe('mixed workouts', () => {
  it('a routine with activities starts with them in order, planned, with the plan', () => {
    const d = startWorkout(createStarterData(), routine);
    const e = d.activeWorkout!.session.entries;
    expect(e.map((x) => (isStrength(x) ? 'strength' : x.kind))).toEqual(['warmup', 'strength', 'cardio', 'cooldown']);
    expect(A(d, 2)).toEqual({ kind: 'cardio', activityId: 'treadmill', plan: { durationMin: 20 }, planned: true });
  });

  it('warm-up → strength → cardio → cool-down: Complete moves on; the workout is saved in order', () => {
    let d = startWorkout(createStarterData(), routine);
    d = completeActivity(d, 0, { durationMin: 5 }, now);
    expect(d.activeWorkout!.currentIndex).toBe(1);
    d = logSet(logSet(d, 1, { reps: 8, weightKg: 60 }), 1, { reps: 8, weightKg: 60 }); // last planned set: moves on
    expect(d.activeWorkout!.currentIndex).toBe(2);
    d = completeActivity(d, 2, { durationMin: 21, inclinePct: 5, speedKmh: 6.5 }, now);
    d = completeActivity(d, 3, { durationMin: 5 }, now);
    expect(d.activeWorkout!.currentIndex).toBe(4); // past the end: the "what next?" state
    d = finishWorkout(d);
    const saved = d.sessions.at(-1)!;
    expect(saved.entries).toHaveLength(4);
    expect((saved.entries[2] as ActivityEntry).log).toEqual({ durationMin: 21, inclinePct: 5, speedKmh: 6.5 });
  });

  it('Complete keeps only sane numbers; Change reopens with the values kept', () => {
    let d = startWorkout(createStarterData(), routine);
    d = completeActivity(d, 2, { durationMin: 20, inclinePct: -1 }, now);
    expect(A(d, 2).log).toEqual({ durationMin: 20 });
    d = reopenActivity(d, 2);
    expect(A(d, 2).doneAt).toBeUndefined();
    expect(A(d, 2).log).toEqual({ durationMin: 20 });
    expect(d.activeWorkout!.currentIndex).toBe(2);
  });

  it('activities not done are dropped on finish; a cardio-only workout is kept', () => {
    let d = startWorkout(createStarterData(), routine);
    d = completeActivity(d, 2, { durationMin: 30 }, now);
    d = finishWorkout(d);
    expect(d.sessions.at(-1)!.entries).toEqual([expect.objectContaining({ kind: 'cardio', activityId: 'treadmill' })]);
  });

  it('two cardio activities can be added to an empty workout', () => {
    let d = startWorkout(createStarterData(), undefined);
    d = addActivityToWorkout(d, 'cardio', 'rowing');
    d = completeActivity(d, 0, { durationMin: 10, distanceKm: 2 }, now);
    d = addActivityToWorkout(d, 'cardio', 'other', '  Boxing ');
    expect(d.activeWorkout!.currentIndex).toBe(1);
    expect(A(d, 1)).toEqual({ kind: 'cardio', activityId: 'other', name: 'Boxing' });
    d = finishWorkout(completeActivity(d, 1, { durationMin: 15 }, now));
    expect(d.sessions.at(-1)!.entries).toHaveLength(2);
  });

  it('completeActivity / reopenActivity ignore strength entries', () => {
    const d = startWorkout(createStarterData(), routine);
    expect(completeActivity(d, 1, { durationMin: 5 })).toBe(d);
    expect(S(reopenActivity(d, 1).activeWorkout!.session.entries[1])).toEqual(d.activeWorkout!.session.entries[1]);
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
    d = completeActivity(d, 0, { durationMin: 5 }, now);
    d = logWarmupSet(d, 1, { reps: 10, weightKg: 20 }, now);
    d = logSet(d, 2, { reps: 8, weightKg: 60 });
    d = completeActivity(d, 3, { durationMin: 20, inclinePct: 5 }, now);
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
    expect(bad({ log: { durationMin: 12 } })).not.toThrow();
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
