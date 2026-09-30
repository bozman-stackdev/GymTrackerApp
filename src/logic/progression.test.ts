import { describe, expect, it } from 'vitest';
import { createSampleData } from '../data/seed';
import type { Exercise, WorkoutSession } from '../types';
import { lastPerformance } from './history';
import { plannedSet, recommend } from './progression';

const press: Exercise = { id: 'press', name: 'Press', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 };
const dips: Exercise = { ...press, id: 'dips', equipment: 'bodyweight', weightStepKg: 0 };

/** Build finished sessions: each item is [daysAgo, weightKg, reps per set]. */
function sessions(exerciseId: string, rows: [number, number, number[]][]): WorkoutSession[] {
  const now = Date.parse('2026-06-30T18:00:00Z');
  return rows.map(([daysAgo, weightKg, reps], i) => {
    const at = new Date(now - daysAgo * 86_400_000).toISOString();
    return {
      id: `s${i}`, name: 'W', startedAt: at, finishedAt: at,
      entries: [{ exerciseId, targetSets: reps.length, sets: reps.map((r) => ({ reps: r, weightKg, loggedAt: at })) }],
    };
  });
}

/** Three sessions over three weeks: enough history for real recommendations. */
const enough = (last: [number, number[]], prev: [number, number[]] = [40, [10, 10, 9]]) =>
  sessions('press', [[21, 40, [9, 9, 8]], [14, prev[0], prev[1]], [0, last[0], last[1]]]);

describe('recommend', () => {
  it('handles a brand new exercise', () => {
    expect(recommend(press, []).kind).toBe('first-time');
  });

  it('waits for enough sessions', () => {
    const rec = recommend(press, sessions('press', [[20, 40, [12, 12, 12]], [10, 40, [12, 12, 12]]]));
    expect(rec.kind).toBe('not-enough-data');
    expect(rec.reason).toContain('1 more session');
    expect(rec.weightKg).toBe(40);
  });

  it('waits for enough days even with many sessions', () => {
    const rec = recommend(press, sessions('press', [[6, 40, [12, 12]], [4, 40, [12, 12]], [2, 40, [12, 12]], [0, 40, [12, 12]]]));
    expect(rec.kind).toBe('not-enough-data');
    expect(rec.reason).toContain('day');
  });

  it('adds weight when every set hit the top of the range', () => {
    const rec = recommend(press, enough([40, [12, 12, 12]]));
    expect(rec).toMatchObject({ kind: 'increase-weight', weightKg: 45, reps: 8 });
    expect(rec.reason).toContain('12, 12, 12');
  });

  it('adds reps when not every set hit the top', () => {
    expect(recommend(press, enough([40, [12, 11, 10]]))).toMatchObject({ kind: 'increase-reps', weightKg: 40, reps: 11 });
  });

  it('never targets more reps than the top of the range', () => {
    expect(recommend(press, enough([40, [12, 12, 11]])).reps).toBe(12);
  });

  it('only looks at working (heaviest) sets, ignoring warm-ups', () => {
    const history = sessions('press', [[21, 40, [9]], [14, 40, [10]], [0, 40, [12, 12]]]);
    history[2].entries[0].sets.unshift({ reps: 5, weightKg: 20, loggedAt: history[2].startedAt });
    expect(recommend(press, history).kind).toBe('increase-weight');
  });

  it('drops weight after repeated sessions below the range at the same weight', () => {
    expect(recommend(press, enough([50, [6, 6, 5]], [50, [7, 6, 6]]))).toMatchObject({ kind: 'decrease-weight', weightKg: 45 });
  });

  it('does not drop weight after a single bad day', () => {
    expect(recommend(press, enough([50, [6, 6, 5]], [45, [9, 9, 8]])).kind).toBe('increase-reps');
  });

  it('progresses bodyweight exercises with reps only', () => {
    const rec = recommend(dips, sessions('dips', [[21, 0, [10]], [14, 0, [11]], [0, 0, [12, 12]]]));
    expect(rec).toMatchObject({ kind: 'increase-reps', weightKg: 0, reps: 13 });
  });

  it('ignores unfinished sessions', () => {
    const history = enough([40, [12, 12, 12]]);
    delete history[2].finishedAt; // e.g. the workout still in progress
    const rec = recommend(press, history);
    expect(rec.kind).toBe('not-enough-data'); // only 2 finished sessions remain
    expect(rec.reason).not.toContain('12, 12, 12');
  });
});

describe('plannedSet', () => {
  it('copies last time set-by-set while there is not enough data', () => {
    const history = sessions('press', [[3, 40, [10, 9, 8]]]);
    const rec = recommend(press, history);
    const last = lastPerformance(history, 'press');
    expect(plannedSet(rec, [], last)).toEqual({ weightKg: 40, reps: 10 });
    const today = [{ reps: 10, weightKg: 40, loggedAt: '' }, { reps: 9, weightKg: 40, loggedAt: '' }];
    expect(plannedSet(rec, today, last)).toEqual({ weightKg: 40, reps: 8 });
  });

  it('keeps a weight the user changed today', () => {
    const history = enough([40, [12, 12, 12]]);
    const rec = recommend(press, history);
    expect(plannedSet(rec, [], lastPerformance(history, 'press'))).toEqual({ weightKg: 45, reps: 8 });
    expect(plannedSet(rec, [{ reps: 8, weightKg: 42.5, loggedAt: '' }], undefined).weightKg).toBe(42.5);
  });
});

describe('sample data', () => {
  it('shows every kind of recommendation somewhere', () => {
    const data = createSampleData(new Date('2026-06-30T12:00:00Z'));
    const kinds = new Set(data.exercises.map((e) => recommend(e, data.sessions).kind));
    expect([...kinds].sort()).toEqual(['decrease-weight', 'first-time', 'increase-reps', 'increase-weight', 'not-enough-data']);
  });
});
