/** Freestyle naming and removing an item added by mistake from the workout in progress. */
import { describe, expect, it } from 'vitest';
import { addActivityToWorkout, addExerciseToWorkout, finishWorkout, logSet, logWarmupSet, removeEntryFromWorkout, startActivityTimer, startWorkout } from './actions';
import { createStarterData } from './seed';
import type { AppData } from '../types';

const base = createStarterData();
const [a, b, c] = base.exercises.map((e) => e.id);
const t = new Date('2026-10-22T18:00:00Z');
const entries = (d: AppData) => d.activeWorkout!.session.entries.map((e) => ('exerciseId' in e ? e.exerciseId : `${e.kind}${e.warmupFor ? `:${e.warmupFor}` : ''}`));

function three(): AppData {
  let d = startWorkout(base, undefined, t, 'Freestyle Workout');
  for (const id of [a, b, c]) d = addExerciseToWorkout(d, id);
  return d;
}

describe('workout name', () => {
  it('a workout without a routine can be named (Freestyle Workout); otherwise unchanged', () => {
    expect(startWorkout(base, undefined, t, 'Freestyle Workout').activeWorkout!.session.name).toBe('Freestyle Workout');
    expect(startWorkout(base, undefined, t).activeWorkout!.session.name).toBe('Workout');
    const routine = base.routines[0];
    expect(startWorkout(base, routine, t, 'ignored').activeWorkout!.session).toMatchObject({ name: routine.name, routineId: routine.id });
  });
});

describe('remove an item from the workout in progress', () => {
  it('removing the current item makes the next one current', () => {
    const d = removeEntryFromWorkout({ ...three(), activeWorkout: { ...three().activeWorkout!, currentIndex: 1 } }, 1);
    expect(entries(d)).toEqual([a, c]);
    expect(d.activeWorkout!.currentIndex).toBe(1);
  });

  it('removing an earlier item keeps you on the same exercise; a later one changes nothing else', () => {
    const at2 = { ...three(), activeWorkout: { ...three().activeWorkout!, currentIndex: 2 } };
    const before = removeEntryFromWorkout(at2, 0);
    expect(entries(before)).toEqual([b, c]);
    expect(before.activeWorkout!.currentIndex).toBe(1); // still on c
    const at0 = { ...three(), activeWorkout: { ...three().activeWorkout!, currentIndex: 0 } };
    expect(removeEntryFromWorkout(at0, 2).activeWorkout!.currentIndex).toBe(0);
  });

  it('removing the last item leads to the "add the next one" state', () => {
    const d = removeEntryFromWorkout(three(), 2); // c is current (just added)
    expect(entries(d)).toEqual([a, b]);
    expect(d.activeWorkout!.currentIndex).toBe(2);
  });

  it('takes its warm-up sets with it', () => {
    let d = three();
    d = logWarmupSet(d, 1, { reps: 10, weightKg: 20 }, t); // warm-up item inserted before b
    expect(entries(d)).toEqual([a, `warmup:${b}`, b, c]);
    d = removeEntryFromWorkout({ ...d, activeWorkout: { ...d.activeWorkout!, currentIndex: 2 } }, 2);
    expect(entries(d)).toEqual([a, c]);
    expect(d.activeWorkout!.currentIndex).toBe(1); // on c
  });

  it('removes a cardio item, running timer and all; the rest of the workout is saved as normal', () => {
    let d = logSet(three(), 0, { reps: 10, weightKg: 40 }, t);
    d = addActivityToWorkout(d, 'cardio', 'treadmill');
    d = startActivityTimer(d, 3, t);
    d = removeEntryFromWorkout(d, 3);
    expect(entries(d)).toEqual([a, b, c]);
    const saved = finishWorkout(d, new Date(t.getTime() + 600_000)).sessions.at(-1)!;
    expect(saved.name).toBe('Freestyle Workout');
    expect(saved.entries).toHaveLength(1); // only the exercise with a set
  });

  it('no workout or no such item: unchanged', () => {
    expect(removeEntryFromWorkout(base, 0)).toBe(base);
    const d = three();
    expect(removeEntryFromWorkout(d, 9)).toBe(d);
  });
});
