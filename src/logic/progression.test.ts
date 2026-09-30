/**
 * Example scenarios for the progression engine - read these to see how it behaves.
 * Exercise used: a machine press, rep range 8–12, weight step 5 kg (unless stated otherwise).
 * Each history row is [days ago, weight kg, reps per set], oldest first.
 */
import { describe, expect, it } from 'vitest';
import { createSampleData } from '../data/seed';
import type { Exercise, WorkoutSession } from '../types';
import { lastPerformance } from './history';
import { PROGRESSION_CONFIG, plannedSet, recommend } from './progression';

const press: Exercise = { id: 'press', name: 'Press', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 };
const dips: Exercise = { ...press, id: 'dips', equipment: 'bodyweight', weightStepKg: 0 };

type Row = [daysAgo: number, weightKg: number, reps: number[]];

function history(rows: Row[], exerciseId = 'press'): WorkoutSession[] {
  const now = Date.parse('2026-06-30T18:00:00Z');
  return rows.map(([daysAgo, weightKg, reps], i) => {
    const at = new Date(now - daysAgo * 86_400_000).toISOString();
    return {
      id: `s${i}`, name: 'W', startedAt: at, finishedAt: at,
      entries: [{ exerciseId, targetSets: reps.length, sets: reps.map((r) => ({ reps: r, weightKg, loggedAt: at })) }],
    };
  });
}

interface Scenario {
  name: string;
  rows: Row[];
  exercise?: Exercise;
  rule: string;
  title: string;
  /** Text the explanation must contain. */
  why?: string;
}

const scenarios: Scenario[] = [
  // --- Patience: no advice from one or two sessions -------------------------------------------
  { name: 'brand new exercise', rows: [], rule: 'R0', title: 'First time' },
  { name: 'one session', rows: [[3, 60, [10, 10, 9]]], rule: 'R1', title: 'Match last time', why: '2 more sessions' },
  { name: 'two sessions, even perfect ones', rows: [[10, 60, [12, 12, 12]], [3, 60, [12, 12, 12]]], rule: 'R1', title: 'Match last time', why: '1 more session' },
  { name: 'three sessions crammed into one week', rows: [[6, 60, [10, 10, 10]], [4, 60, [11, 11, 10]], [2, 60, [12, 12, 12]]], rule: 'R1', title: 'Match last time', why: 'more days of history' },

  // --- Normal progress: add reps first -------------------------------------------------------
  { name: 'steady progress inside the range', rows: [[21, 60, [9, 9, 8]], [14, 60, [10, 10, 9]], [7, 60, [11, 10, 10]]], rule: 'R6', title: 'Try 60 kg × 11', why: 'Add a rep to your weakest set' },
  { name: 'never targets above the top of the range', rows: [[21, 60, [10, 10, 9]], [14, 60, [11, 11, 10]], [7, 60, [12, 12, 11]]], rule: 'R6', title: 'Try 60 kg × 12' },
  { name: 'counts good sessions at this weight', rows: [[28, 60, [8, 8, 8]], [21, 60, [9, 9, 8]], [14, 60, [10, 9, 9]], [7, 60, [10, 10, 9]]], rule: 'R6', title: 'Try 60 kg × 10', why: '4 good sessions' },

  // --- Consistency before adding weight --------------------------------------------------------
  { name: 'top of the range once: confirm it first', rows: [[21, 60, [10, 10, 9]], [14, 60, [11, 11, 10]], [7, 60, [12, 12, 12]]], rule: 'R3', title: 'Stay at 60 kg × 12', why: 'another strong session' },
  { name: 'top of the range twice in a row: add weight', rows: [[21, 60, [11, 11, 10]], [14, 60, [12, 12, 12]], [7, 60, [12, 12, 12]]], rule: 'R2', title: 'Try 65 kg × 8', why: 'completed 60 kg × 12+ on every set in your last 2 sessions' },
  { name: 'three strong sessions are mentioned too', rows: [[21, 60, [12, 12, 12]], [14, 60, [12, 12, 12]], [7, 60, [13, 12, 12]]], rule: 'R2', title: 'Try 65 kg × 8', why: 'last 3 sessions' },
  { name: 'a missed rep on the last set breaks the streak', rows: [[21, 60, [11, 11, 10]], [14, 60, [12, 12, 12]], [7, 60, [12, 12, 11]]], rule: 'R6', title: 'Try 60 kg × 12' },
  { name: 'a streak at a lighter weight does not count', rows: [[21, 55, [12, 12, 12]], [14, 55, [12, 12, 12]], [7, 60, [12, 12, 12]]], rule: 'R3', title: 'Stay at 60 kg × 12' },
  { name: 'right after a weight increase: build reps again', rows: [[21, 60, [12, 12, 12]], [14, 60, [12, 12, 12]], [7, 65, [8, 8, 7]]], rule: 'R6', title: 'Try 65 kg × 8' },

  // --- Too heavy --------------------------------------------------------------------------------
  { name: 'last set just short (normal fatigue) is not "too heavy"', rows: [[21, 65, [9, 8, 7]], [14, 65, [8, 8, 7]], [7, 65, [8, 8, 7]]], rule: 'R6', title: 'Try 65 kg × 8' },
  { name: 'one bad day is not "too heavy"', rows: [[21, 65, [9, 9, 8]], [14, 65, [10, 9, 9]], [7, 65, [7, 6, 6]]], rule: 'R6', title: 'Try 65 kg × 8' },
  { name: 'no set reached the range twice: go lighter', rows: [[21, 70, [8, 7, 7]], [14, 70, [7, 7, 6]], [7, 70, [7, 6, 6]]], rule: 'R4', title: 'Try 65 kg × 8', why: 'No set reached 8 reps at 70 kg in your last 2 sessions' },

  // --- Recent performance vs earlier ------------------------------------------------------------
  {
    name: 'clear dip in the last two sessions: stay, don\'t push',
    rows: [[35, 60, [11, 11, 10]], [28, 60, [11, 11, 11]], [21, 60, [12, 11, 11]], [14, 60, [8, 8, 8]], [7, 60, [8, 8, 8]]],
    rule: 'R5', title: 'Stay at 60 kg × 8', why: '% below the ones before',
  },
  {
    name: 'a one-rep wobble is not a dip',
    rows: [[35, 60, [10, 10, 9]], [28, 60, [11, 10, 10]], [21, 60, [11, 11, 10]], [14, 60, [10, 10, 10]], [7, 60, [10, 10, 9]]],
    rule: 'R7', title: 'Try 60 kg × 11 again', why: 'So close last time: 10 of 11', // not a dip: a near miss
  },

  // --- Missed challenges ----------------------------------------------------------------------------
  {
    name: 'near miss (1 rep short of the target): same target again',
    rows: [[28, 60, [8, 8, 8]], [21, 60, [9, 9, 8]], [14, 60, [10, 10, 9]], [7, 60, [9, 9, 9]]], // target was 60 × 10, best set 9
    rule: 'R7', title: 'Try 60 kg × 10 again', why: '9 of 10 reps at 60 kg',
  },
  {
    name: 'bigger miss: the next target is adjusted to what was actually done (and says so)',
    rows: [[28, 60, [8, 8, 8]], [21, 60, [9, 9, 8]], [14, 60, [10, 10, 9]], [7, 60, [8, 7, 7]]], // target 60 × 10, did 8, 7, 7
    rule: 'R6', title: 'Try 60 kg × 8', why: 'Last target was 60 kg × 10; you did 8, 7, 7 reps at 60 kg. Adjusted',
  },
  {
    name: 'target weight not attempted (stayed lighter): no "so close", just adjust',
    rows: [[35, 60, [10, 10, 10]], [28, 60, [11, 11, 10]], [21, 60, [12, 12, 12]], [14, 60, [12, 12, 12]], [7, 60, [10, 10, 10]]], // target was 65 × 8
    rule: 'R6', title: 'Try 60 kg × 11', why: 'Last target was 65 kg × 8',
  },

  // --- Bodyweight ---------------------------------------------------------------------------------
  { name: 'bodyweight: reps only, even at the top', exercise: dips, rows: [[21, 0, [11, 11, 10]], [14, 0, [12, 12, 12]], [7, 0, [12, 12, 13]]], rule: 'R2', title: 'Try 13 reps' },
];

describe('progression scenarios', () => {
  it.each(scenarios)('$name → $rule "$title"', ({ rows, exercise = press, rule, title, why }) => {
    const rec = recommend(exercise, history(rows, exercise.id));
    expect({ rule: rec.rule, title: rec.title }).toEqual({ rule, title });
    if (why) expect(rec.reason).toContain(why);
    expect(rec.reason.length).toBeGreaterThan(20); // there is always an explanation
  });
});

describe('details', () => {
  it('ignores warm-up sets (lighter than the working weight)', () => {
    const h = history([[21, 60, [11, 11]], [14, 60, [12, 12]], [7, 60, [12, 12]]]);
    h[2].entries[0].sets.unshift({ reps: 5, weightKg: 20, loggedAt: h[2].startedAt });
    expect(recommend(press, h).rule).toBe('R2');
  });

  it('ignores a workout that is still in progress', () => {
    const h = history([[21, 60, [11, 11]], [14, 60, [12, 12]], [0, 60, [12, 12]]]);
    delete h[2].finishedAt;
    expect(recommend(press, h).rule).toBe('R1'); // only 2 finished sessions
  });

  it('is configurable without touching the UI', () => {
    const topOnce = history([[21, 60, [10, 10]], [14, 60, [11, 11]], [7, 60, [12, 12]]]);
    expect(recommend(press, topOnce).rule).toBe('R3');
    expect(recommend(press, topOnce, { ...PROGRESSION_CONFIG, sessionsToMaster: 1 }).rule).toBe('R2');
    expect(recommend(press, topOnce, { ...PROGRESSION_CONFIG, minSessions: 5 }).rule).toBe('R1');
  });
});

describe('plannedSet (what the workout screen pre-fills)', () => {
  it('copies last time set-by-set while there is not enough data', () => {
    const h = history([[3, 40, [10, 9, 8]]]);
    const rec = recommend(press, h);
    const last = lastPerformance(h, 'press');
    expect(plannedSet(rec, [], last)).toEqual({ weightKg: 40, reps: 10 });
    const today = [{ reps: 10, weightKg: 40, loggedAt: '' }, { reps: 9, weightKg: 40, loggedAt: '' }];
    expect(plannedSet(rec, today, last)).toEqual({ weightKg: 40, reps: 8 });
  });

  it('uses the recommendation, but keeps a weight the user changed today', () => {
    const h = history([[21, 60, [11, 11, 10]], [14, 60, [12, 12, 12]], [7, 60, [12, 12, 12]]]);
    const rec = recommend(press, h);
    expect(plannedSet(rec, [], lastPerformance(h, 'press'))).toEqual({ weightKg: 65, reps: 8 });
    expect(plannedSet(rec, [{ reps: 8, weightKg: 62.5, loggedAt: '' }], undefined).weightKg).toBe(62.5);
  });
});

describe('sample data', () => {
  it('demonstrates every rule somewhere', () => {
    const data = createSampleData(new Date('2026-06-30T12:00:00Z'));
    const rules = new Set(data.exercises.map((e) => recommend(e, data.sessions).rule));
    expect([...rules].sort()).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  });
});
