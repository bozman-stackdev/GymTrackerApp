import { describe, expect, it } from 'vitest';
import { addExerciseToWorkout, finishWorkout, goToExercise, logSet, startExercise, startWorkout, undoLastSet } from './actions';
import { createSampleData, createStarterData, SAMPLE_ROUTINES } from './seed';
import { localStorageStore } from './storage';
import { parseAppData, validateExercise, validateProfile } from './validate';
import { EMPTY_PROFILE, SAMPLE_EXERCISES } from './seed';

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
    let d = startWorkout(createStarterData(), SAMPLE_ROUTINES[0]);
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
    let d = startWorkout(createStarterData(), SAMPLE_ROUTINES[0]); // 5 exercises x 3 sets
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
    let d = startWorkout(createStarterData(), SAMPLE_ROUTINES[0]);
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
    let d = startExercise(createStarterData(), 'leg-press');
    expect(d.activeWorkout!.session.entries.map((e) => e.exerciseId)).toEqual(['leg-press']);
    d = logSet(d, 0, { reps: 10, weightKg: 100 });
    d = startExercise(d, 'lat-pulldown');
    expect(d.activeWorkout!.session.entries.map((e) => e.exerciseId)).toEqual(['leg-press', 'lat-pulldown']);
    expect(d.activeWorkout!.currentIndex).toBe(1);
    expect(d.activeWorkout!.session.entries[0].sets).toHaveLength(1); // nothing lost
  });

  it('discards a workout with no sets instead of saving it', () => {
    const d = finishWorkout(startWorkout(createStarterData(), SAMPLE_ROUTINES[0]));
    expect(d.sessions).toHaveLength(0);
    expect(d.activeWorkout).toBeNull();
  });

  it('clamps exercise navigation', () => {
    let d = startWorkout(createStarterData(), SAMPLE_ROUTINES[0]);
    d = goToExercise(d, 99);
    expect(d.activeWorkout!.currentIndex).toBe(4);
    d = goToExercise(d, -1);
    expect(d.activeWorkout!.currentIndex).toBe(0);
  });

  it('ignores impossible sets (validation)', () => {
    const d = startWorkout(createStarterData(), SAMPLE_ROUTINES[0]);
    for (const bad of [{ reps: 0, weightKg: 50 }, { reps: 2.5, weightKg: 50 }, { reps: 10, weightKg: -1 }, { reps: 10, weightKg: 5000 }, { reps: 10, weightKg: NaN }]) {
      expect(logSet(d, 0, bad)).toBe(d);
    }
    expect(logSet(d, 99, { reps: 10, weightKg: 50 })).toBe(d); // no such exercise
    expect(logSet(d, 0, { reps: 10, weightKg: 0 })).not.toBe(d); // bodyweight is fine
  });

  it('does not mutate the previous state', () => {
    const before = startWorkout(createStarterData(), SAMPLE_ROUTINES[0]);
    logSet(before, 0, { reps: 10, weightKg: 50 });
    expect(before.activeWorkout!.session.entries[0].sets).toHaveLength(0);
  });
});

describe('storage', () => {
  it('reports a first run, then round-trips saved data', () => {
    const store = localStorageStore(memoryStorage());
    expect(store.load()).toEqual({ status: 'empty' });
    const data = startWorkout(createSampleData(), SAMPLE_ROUTINES[0]);
    expect(store.save(data)).toEqual({ ok: true });
    expect(store.load()).toEqual({ status: 'ok', data });
  });

  it('keeps a backup instead of losing unreadable data', () => {
    const storage = memoryStorage();
    storage.setItem('gymtracker:data', '{not json');
    expect(localStorageStore(storage).load().status).toBe('unreadable');
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
    const backupKey = keys.find((k) => k.includes('backup'))!;
    expect(storage.getItem(backupKey)).toBe('{not json');
  });

  it('rejects data with the wrong shape, with a readable message', () => {
    const storage = memoryStorage();
    const bad = createSampleData();
    (bad.sessions[0].entries[0].sets[0] as { reps: unknown }).reps = 'lots';
    storage.setItem('gymtracker:data', JSON.stringify(bad));
    expect(localStorageStore(storage).load()).toMatchObject({ status: 'unreadable', error: expect.stringContaining('a set in workout #1') });
  });

  it('reports (instead of throwing) when storage is full', () => {
    const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } } as Storage;
    expect(localStorageStore(full).save(createStarterData())).toMatchObject({ ok: false });
  });

  it('drops machine photos saved by earlier versions', () => {
    const old = createSampleData();
    (old.exercises[0] as { photo?: string }).photo = 'data:image/jpeg;base64,AAAA';
    const loaded = parseAppData(JSON.parse(JSON.stringify(old)));
    expect(JSON.stringify(loaded)).not.toContain('data:image');
    expect(loaded.sessions).toEqual(old.sessions);
  });
});

describe('validation', () => {
  it('accepts everything the app itself produces', () => {
    for (const d of [createStarterData(), createSampleData(), startWorkout(createSampleData(), SAMPLE_ROUTINES[1])]) {
      expect(() => parseAppData(JSON.parse(JSON.stringify(d)))).not.toThrow();
    }
  });

  it.each([
    ['not an object', 'hello', 'not a Gym Tracker file'],
    ['another app\'s JSON', { foo: 1 }, 'unsupported version'],
    ['a future version', { ...createStarterData(), version: 2 }, 'unsupported version 2'],
    ['missing lists', { version: 1, profile: {} }, 'missing lists'],
    ['a broken exercise', { ...createStarterData(), exercises: [{ id: 'x', name: 'X', repRange: [8], weightStepKg: 5 }] }, 'rep range of "X"'],
    ['negative weight', (() => { const d = createSampleData(); d.sessions[2].entries[0].sets[0].weightKg = -5; return d; })(), 'a set in workout #3'],
  ])('rejects %s', (_name, input, message) => {
    expect(() => parseAppData(input)).toThrow(message);
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

describe('form validation', () => {
  it('profile: empty is fine, out-of-range numbers are not', () => {
    expect(validateProfile(EMPTY_PROFILE)).toEqual({});
    expect(validateProfile({ ...EMPTY_PROFILE, age: 32, heightCm: 178, weightKg: 80 })).toEqual({});
    expect(Object.keys(validateProfile({ ...EMPTY_PROFILE, age: 7, heightCm: 1780, weightKg: 0 })).sort()).toEqual(['age', 'heightCm', 'weightKg']);
  });

  it('exercise: needs a unique name and a sensible range/step', () => {
    const base = { id: 'new', name: 'Hack Squat', muscleGroup: 'legs' as const, equipment: 'machine' as const, repRange: [8, 12] as [number, number], weightStepKg: 5 };
    expect(validateExercise(base, SAMPLE_EXERCISES)).toEqual({});
    expect(validateExercise({ ...base, name: '  ' }, SAMPLE_EXERCISES).name).toBeDefined();
    expect(validateExercise({ ...base, name: 'leg press' }, SAMPLE_EXERCISES).name).toMatch(/already/);
    expect(validateExercise({ ...SAMPLE_EXERCISES[0] }, SAMPLE_EXERCISES)).toEqual({}); // editing itself is fine
    expect(validateExercise({ ...base, repRange: [12, 8] }, SAMPLE_EXERCISES).repRange).toBeDefined();
    expect(validateExercise({ ...base, weightStepKg: 0 }, SAMPLE_EXERCISES).weightStepKg).toBeDefined();
    expect(validateExercise({ ...base, equipment: 'bodyweight', weightStepKg: 0 }, SAMPLE_EXERCISES)).toEqual({});
  });
});
