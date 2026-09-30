import { describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSession } from '../types';
import { buildJourney, MasteryTracker, nextLevel } from './journey';

const press: Exercise = { id: 'press', name: 'Press', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 };
const dips: Exercise = { ...press, id: 'dips', equipment: 'bodyweight', weightStepKg: 0, repRange: [5, 10] };
const s = (w: number, reps: number[]) => reps.map((r) => ({ reps: r, weightKg: w, loggedAt: '' }));

function history(rows: [number, number[]][], exerciseId = 'press'): WorkoutSession[] {
  return rows.map(([w, reps], i) => {
    const at = new Date(Date.UTC(2026, 5, 1 + i * 7)).toISOString();
    return { id: `s${i}`, name: 'W', startedAt: at, finishedAt: at, entries: [{ exerciseId, targetSets: reps.length, sets: s(w, reps) }] };
  });
}
const show = (j: ReturnType<typeof buildJourney>) => j.levels.map((l) => `${l.weightKg}x${l.reps}:${l.status}`);

describe('ladder', () => {
  it('adds a rep, then the next weight back at the bottom of the range', () => {
    expect(nextLevel(press, { weightKg: 60, reps: 9 })).toEqual({ weightKg: 60, reps: 10 });
    expect(nextLevel(press, { weightKg: 60, reps: 12 })).toEqual({ weightKg: 65, reps: 8 });
    expect(nextLevel({ ...press, weightStepKg: 2.5 }, { weightKg: 42.5, reps: 12 })).toEqual({ weightKg: 45, reps: 8 });
    expect(nextLevel(dips, { weightKg: 0, reps: 10 })).toEqual({ weightKg: 0, reps: 11 }); // bodyweight: reps only
  });
});

describe('mastery (every set at the level, 2 workouts in a row)', () => {
  it("your example: 60×8, 60×9, 60×9, 60×10 → 8 and 9 mastered, 10 reached once", () => {
    const t = new MasteryTracker(press);
    expect(t.add(s(60, [8, 8, 8]))).toEqual([]); // one workout proves nothing yet
    expect(t.add(s(60, [9, 9, 9]))).toEqual([{ weightKg: 60, reps: 8 }]);
    expect(t.add(s(60, [9, 9, 9]))).toEqual([{ weightKg: 60, reps: 9 }]);
    expect(t.add(s(60, [10, 10, 10]))).toEqual([]);
    expect(t.bestRun({ weightKg: 60, reps: 10 })).toBe(1);
  });

  it('the weakest set counts: one short set means the level is not reached that day', () => {
    const t = new MasteryTracker(press);
    t.add(s(60, [10, 10, 9]));
    expect(t.add(s(60, [10, 10, 9]))).toEqual([{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 9 }]);
    expect(t.isMastered({ weightKg: 60, reps: 10 })).toBe(false);
  });

  it('a break in the run resets it; mastery once earned is kept', () => {
    const t = new MasteryTracker(press);
    t.add(s(60, [10, 10, 10]));
    t.add(s(60, [8, 8, 8])); // bad day breaks the run for 9 and 10
    expect(t.add(s(60, [10, 10, 10]))).toEqual([]);
    expect(t.add(s(60, [10, 10, 10]))).toEqual([{ weightKg: 60, reps: 9 }, { weightKg: 60, reps: 10 }]);
    t.add(s(60, [6, 6, 6]));
    expect(t.isMastered({ weightKg: 60, reps: 10 })).toBe(true);
  });

  it('a heavier workout also proves the lighter levels (at that rep count)', () => {
    const t = new MasteryTracker(press);
    t.add(s(60, [12, 12, 12]));
    t.add(s(65, [9, 9, 9]));
    expect(t.bestRun({ weightKg: 60, reps: 9 })).toBe(2); // 65×9 ≥ 60×9
    expect(t.bestRun({ weightKg: 60, reps: 12 })).toBe(1); // but not 60×12
  });

  it('warm-up sets (lighter) are ignored', () => {
    const t = new MasteryTracker(press);
    t.add([...s(20, [5]), ...s(60, [9, 9])]);
    expect(t.add([...s(20, [5]), ...s(60, [9, 9])])).toContainEqual({ weightKg: 60, reps: 9 });
  });
});

describe('journey view', () => {
  it('shows recent mastered levels, the current challenge and locked next levels', () => {
    const h = history([[60, [8, 8, 8]], [60, [9, 9, 9]], [60, [9, 9, 9]], [60, [10, 10, 10]]]);
    const j = buildJourney(press, h, { weightKg: 60, reps: 11 });
    expect(show(j)).toEqual(['60x8:mastered', '60x9:mastered', '60x10:reached', '60x11:current', '60x12:locked', '65x8:locked']);
    expect(j.masteredCount).toBe(2);
  });

  it('after the top of the range is mastered, the next weight is the current challenge', () => {
    const h = history([[60, [11, 11, 11]], [60, [12, 12, 12]], [60, [12, 12, 12]]]);
    const j = buildJourney(press, h, { weightKg: 65, reps: 8 });
    expect(show(j)).toEqual(['60x10:mastered', '60x11:mastered', '60x12:mastered', '65x8:current', '65x9:locked', '65x10:locked']);
    expect(j.earlierMastered).toBe(2); // 60×8, 60×9 summarised
  });

  it('no challenge yet (building history): shows what was reached and what comes next', () => {
    const j = buildJourney(press, history([[60, [9, 9, 8]]]), null);
    expect(show(j)).toEqual(['60x8:reached', '60x9:locked', '60x10:locked']);
  });

  it('a repeat challenge on a level already reached shows as current', () => {
    const j = buildJourney(press, history([[60, [10, 10, 10]], [60, [11, 11, 11]], [60, [12, 12, 12]]]), { weightKg: 60, reps: 12 });
    expect(j.levels.find((l) => l.status === 'current')).toMatchObject({ weightKg: 60, reps: 12, sessionsInARow: 1 });
  });

  it('bodyweight journeys climb in reps', () => {
    const j = buildJourney(dips, history([[0, [6, 6]], [0, [7, 7]], [0, [7, 7]]], 'dips'), { weightKg: 0, reps: 8 });
    expect(show(j)).toEqual(['0x5:mastered', '0x6:mastered', '0x7:mastered', '0x8:current', '0x9:locked', '0x10:locked']);
  });

  it('brand new exercise: empty journey', () => {
    expect(buildJourney(press, [], null).levels).toEqual([]);
  });
});
