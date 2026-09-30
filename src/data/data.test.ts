import { describe, expect, it } from 'vitest';
import { addExerciseToWorkout, finishWorkout, goToExercise, logSet, startExercise, startWorkout, undoLastSet } from './actions';
import { createEmptyData, createSampleData, SAMPLE_ROUTINES } from './seed';
import { loadData, saveData } from './storage';

/** Minimal in-memory stand-in for localStorage. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
  };
}

describe('workout actions', () => {
  it('runs a full workout: start, log, undo, add exercise, finish', () => {
    let d = startWorkout(createEmptyData(), SAMPLE_ROUTINES[0]);
    expect(d.activeWorkout?.session.entries).toHaveLength(5);

    d = logSet(d, 0, { reps: 10, weightKg: 50 });
    d = logSet(d, 0, { reps: 9, weightKg: 50 });
    d = undoLastSet(d, 0);
    expect(d.activeWorkout!.session.entries[0].sets.map((s) => s.reps)).toEqual([10]);

    d = addExerciseToWorkout(d, 'pull-up');
    expect(d.activeWorkout!.currentIndex).toBe(5);
    d = addExerciseToWorkout(d, 'chest-press-machine'); // already there -> jump to it, no duplicate
    expect(d.activeWorkout!.currentIndex).toBe(0);
    expect(d.activeWorkout!.session.entries).toHaveLength(6);

    d = finishWorkout(d);
    expect(d.activeWorkout).toBeNull();
    expect(d.sessions).toHaveLength(1);
    expect(d.sessions[0].entries).toHaveLength(1); // exercises with no sets are dropped
    expect(d.sessions[0].finishedAt).toBeTruthy();
  });

  it('moves to the next unfinished exercise after the last planned set, and undo comes back', () => {
    const set = { reps: 10, weightKg: 50 };
    let d = startWorkout(createEmptyData(), SAMPLE_ROUTINES[0]); // 5 exercises x 3 sets
    d = logSet(logSet(d, 0, set), 0, set);
    expect(d.activeWorkout!.currentIndex).toBe(0); // 2 of 3: stay
    d = logSet(d, 0, set);
    expect(d.activeWorkout!.currentIndex).toBe(1); // 3 of 3: advance

    d = undoLastSet(d, 0);
    expect(d.activeWorkout!.currentIndex).toBe(0);
    expect(d.activeWorkout!.session.entries[0].sets).toHaveLength(2);
  });

  it('skips finished exercises and wraps around; extra sets do not jump', () => {
    const set = { reps: 10, weightKg: 50 };
    let d = startWorkout(createEmptyData(), SAMPLE_ROUTINES[0]);
    for (const i of [0, 1, 2, 3]) {
      if (i === 1) continue;
      d = logSet(logSet(logSet(d, i, set), i, set), i, set);
    }
    // 0, 2 and 3 are done; after finishing 3 it looks forward first -> 4.
    expect(d.activeWorkout!.currentIndex).toBe(4);
    d = logSet(logSet(logSet(d, 4, set), 4, set), 4, set);
    expect(d.activeWorkout!.currentIndex).toBe(1); // wrapped to the only unfinished one
    d = logSet(logSet(logSet(d, 1, set), 1, set), 1, set);
    expect(d.activeWorkout!.currentIndex).toBe(1); // everything done: stay put
    d = goToExercise(d, 2);
    d = logSet(d, 2, set); // extra (4th) set
    expect(d.activeWorkout!.currentIndex).toBe(2);
  });

  it('startExercise starts a new workout, or adds to the current one', () => {
    let d = startExercise(createEmptyData(), 'leg-press');
    expect(d.activeWorkout!.session.entries.map((e) => e.exerciseId)).toEqual(['leg-press']);
    d = logSet(d, 0, { reps: 10, weightKg: 100 });
    d = startExercise(d, 'lat-pulldown');
    expect(d.activeWorkout!.session.entries.map((e) => e.exerciseId)).toEqual(['leg-press', 'lat-pulldown']);
    expect(d.activeWorkout!.currentIndex).toBe(1);
    expect(d.activeWorkout!.session.entries[0].sets).toHaveLength(1); // nothing lost
  });

  it('discards a workout with no sets instead of saving it', () => {
    const d = finishWorkout(startWorkout(createEmptyData(), SAMPLE_ROUTINES[0]));
    expect(d.sessions).toHaveLength(0);
    expect(d.activeWorkout).toBeNull();
  });

  it('clamps exercise navigation', () => {
    let d = startWorkout(createEmptyData(), SAMPLE_ROUTINES[0]);
    d = goToExercise(d, 99);
    expect(d.activeWorkout!.currentIndex).toBe(4);
    d = goToExercise(d, -1);
    expect(d.activeWorkout!.currentIndex).toBe(0);
  });

  it('does not mutate the previous state', () => {
    const before = startWorkout(createEmptyData(), SAMPLE_ROUTINES[0]);
    logSet(before, 0, { reps: 10, weightKg: 50 });
    expect(before.activeWorkout!.session.entries[0].sets).toHaveLength(0);
  });
});

describe('storage', () => {
  it('loads sample data on first run, then round-trips saved data', () => {
    const storage = memoryStorage();
    const first = loadData(storage);
    expect(first.sessions.length).toBeGreaterThan(10);

    const changed = startWorkout(first, first.routines[0]);
    saveData(changed, storage);
    expect(loadData(storage)).toEqual(changed);
  });

  it('drops machine photos saved by earlier versions', () => {
    const storage = memoryStorage();
    const old = createSampleData();
    (old.exercises[0] as { photo?: string }).photo = 'data:image/jpeg;base64,AAAA';
    storage.setItem('gymtracker:data', JSON.stringify(old));
    const loaded = loadData(storage);
    expect(JSON.stringify(loaded)).not.toContain('data:image');
    expect(loaded.exercises).toHaveLength(old.exercises.length); // nothing else lost
    expect(loaded.sessions).toEqual(old.sessions);
  });

  it('keeps a backup instead of losing unreadable data', () => {
    const storage = memoryStorage();
    storage.setItem('gymtracker:data', '{not json');
    loadData(storage);
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
    const backupKey = keys.find((k) => k.includes('backup'))!;
    expect(storage.getItem(backupKey)).toBe('{not json');
  });
});

describe('sample data', () => {
  it('has sessions in the past, in date order, all finished', () => {
    const d = createSampleData();
    const dates = d.sessions.map((s) => s.startedAt);
    expect([...dates].sort()).toEqual(dates);
    expect(d.sessions.every((s) => s.finishedAt && Date.parse(s.startedAt) < Date.now())).toBe(true);
  });
});
