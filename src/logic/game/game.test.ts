/**
 * Gamification scenarios. Exercise: machine press, rep range 8–12, 5 kg step.
 * History rows are [date, weight kg, reps per set]; dates are local, 2026-06-01 is a Monday.
 */
import { describe, expect, it } from 'vitest';
import { createSampleData } from '../../data/seed';
import type { Exercise, WorkoutSession } from '../../types';
import { exerciseHistory } from '../history';
import { ACHIEVEMENTS } from './achievements';
import { challengeFor, evaluate, personalBestIndex, type Challenge } from './challenge';
import { GAME_CONFIG } from './config';
import { levelFor, xpForLevel } from './levels';
import { buildProgress } from './progress';
import { WeeklyStreak, weekIndex } from './streak';

const press: Exercise = { id: 'press', name: 'Press', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 };
const exercises = [press];
const XP = GAME_CONFIG.xp;

type Row = [date: string, weightKg: number, reps: number[]];
function history(rows: Row[]): WorkoutSession[] {
  return rows.map(([date, weightKg, reps], i) => {
    const at = new Date(`${date}T18:00:00`).toISOString();
    return {
      id: `s${i}`, name: 'W', startedAt: at, finishedAt: at,
      entries: [{ exerciseId: 'press', targetSets: reps.length, sets: reps.map((r) => ({ reps: r, weightKg, loggedAt: at })) }],
    };
  });
}
const sets = (weightKg: number, reps: number[]) => reps.map((r) => ({ reps: r, weightKg, loggedAt: '' }));

/** Three weekly sessions of steady progress: the engine's challenge is 60 kg × 11. */
const building: Row[] = [['2026-06-01', 60, [9, 9, 8]], ['2026-06-08', 60, [10, 10, 9]], ['2026-06-15', 60, [11, 10, 10]]];
const challenge = challengeFor(press, history(building))!;
const scoreOf = (today: Row) => buildProgress(history([...building, today]), exercises, new Date('2026-06-23T12:00:00')).bySession.get('s3')!;

describe('challenge generation (from the progression engine)', () => {
  it('insufficient history: no challenge yet', () => {
    expect(challengeFor(press, [])).toBeNull();
    expect(challengeFor(press, history(building.slice(0, 2)))).toBeNull();
  });

  it('decides a rep increase is appropriate', () => {
    expect(challenge).toMatchObject({ kind: 'more-reps', weightKg: 60, reps: 11 });
  });

  it('decides a weight increase is appropriate (top of range twice)', () => {
    const c = challengeFor(press, history([['2026-06-01', 60, [11, 11, 10]], ['2026-06-08', 60, [12, 12, 12]], ['2026-06-15', 60, [12, 12, 12]]]));
    expect(c).toMatchObject({ kind: 'more-weight', weightKg: 65, reps: 8 });
  });

  it('decides to repeat the same target (top of range only once)', () => {
    const c = challengeFor(press, history([['2026-06-01', 60, [10, 10, 9]], ['2026-06-08', 60, [11, 11, 10]], ['2026-06-15', 60, [12, 12, 12]]]));
    expect(c).toMatchObject({ kind: 'repeat', weightKg: 60, reps: 12 });
  });

  it('decides to repeat after a dip instead of pushing', () => {
    const c = challengeFor(press, history([
      ['2026-05-04', 60, [11, 11, 10]], ['2026-05-11', 60, [11, 11, 11]], ['2026-05-18', 60, [12, 11, 11]],
      ['2026-05-25', 60, [8, 8, 8]], ['2026-06-01', 60, [8, 8, 8]],
    ]));
    expect(c).toMatchObject({ kind: 'repeat', weightKg: 60, reps: 8 });
  });
});

describe('challenge completion', () => {
  it('user completes the challenge: +challenge XP', () => {
    expect(evaluate(challenge, sets(60, [11, 10, 10]))).toBe('hit');
    const s = scoreOf(['2026-06-22', 60, [11, 10, 10]]);
    expect(s.events).toContainEqual({ type: 'challenge', xp: XP.challenge, exerciseId: 'press' });
    expect(s.results[0].challengeSetIndex).toBe(0); // instant feedback on the first set
  });

  it('user exceeds the challenge: same XP as hitting it (no incentive to overdo it)', () => {
    expect(evaluate(challenge, sets(60, [12, 11, 11]))).toBe('exceeded');
    const s = scoreOf(['2026-06-22', 60, [12, 11, 11]]);
    expect(s.events.filter((e) => e.type === 'challenge')).toEqual([{ type: 'challenge', xp: XP.challenge, exerciseId: 'press' }]);
  });

  it('going heavier than the target earns nothing extra', () => {
    const heavier = scoreOf(['2026-06-22', 70, [11, 10, 10]]);
    const asPlanned = scoreOf(['2026-06-22', 60, [11, 10, 10]]);
    expect(heavier.xp).toBe(asPlanned.xp);
  });

  it('user misses the challenge: no challenge XP, nothing taken away, same target next time', () => {
    expect(evaluate(challenge, sets(60, [9, 8, 8]), exerciseHistory(history(building), 'press').at(-1))).toBe('missed');
    const s = scoreOf(['2026-06-22', 60, [9, 8, 8]]);
    expect(s.events.some((e) => e.type === 'challenge' || e.type === 'matched')).toBe(false);
    expect(s.xp).toBeGreaterThanOrEqual(0); // workout + consistency still count; nothing is ever deducted
    expect(challengeFor(press, history([...building, ['2026-06-22', 60, [9, 8, 8]]]))).toMatchObject({ weightKg: 60, reps: 9 });
  });

  it('user repeats the same performance: still positive (matched)', () => {
    const steady: Row[] = [['2026-06-01', 60, [9, 9, 8]], ['2026-06-08', 60, [10, 10, 9]], ['2026-06-15', 60, [10, 10, 10]]];
    const c = challengeFor(press, history(steady))!; // 60 kg × 11
    expect(evaluate(c, sets(60, [10, 10, 10]), exerciseHistory(history(steady), 'press').at(-1))).toBe('matched');
    const p = buildProgress(history([...steady, ['2026-06-22', 60, [10, 10, 10]]]), exercises);
    const scored = p.bySession.get('s3')!;
    expect(scored.results[0].outcome).toBe('matched'); // shown as positive feedback on the summary…
    expect(XP.matched).toBe(0); // …but XP is only for progress
    expect(scored.events.some((e) => e.type === 'matched' || e.type === 'challenge')).toBe(false);
  });

  it('repeating last session counts as a hit when the target equals last best set', () => {
    // Last session 11, 10, 10 → challenge 60 × 11 (weakest set + 1 = best set): doing 11 again completes it.
    expect(evaluate(challenge, sets(60, [11, 10, 10]))).toBe('hit');
  });
});

describe('personal bests', () => {
  const topTwice: Row[] = [['2026-06-01', 60, [11, 11, 10]], ['2026-06-08', 60, [12, 12, 12]], ['2026-06-15', 60, [12, 12, 12]]];
  const prior = exerciseHistory(history(topTwice), 'press');
  const c = challengeFor(press, history(topTwice)) as Challenge; // 65 kg × 8

  it('user achieves a personal best at the suggested weight: +PB XP', () => {
    expect(personalBestIndex(press, sets(65, [8, 8, 7]), prior, c)).toBe(0);
    const p = buildProgress(history([...topTwice, ['2026-06-22', 65, [8, 8, 7]]]), exercises);
    expect(p.bySession.get('s3')!.events).toContainEqual({ type: 'personal-best', xp: XP.personalBest, exerciseId: 'press' });
  });

  it('no PB reward for going heavier than suggested, or for sets below the rep range', () => {
    expect(personalBestIndex(press, sets(70, [8]), prior, c)).toBe(-1);
    expect(personalBestIndex(press, sets(65, [5]), prior, c)).toBe(-1);
  });

  it('no PB on the very first session (nothing to beat yet)', () => {
    expect(personalBestIndex(press, sets(60, [10]), [], null)).toBe(-1);
  });
});

describe('XP and levels', () => {
  it('uses the configured thresholds and continues past the list', () => {
    expect(GAME_CONFIG.levels.slice(0, 4)).toEqual([0, 100, 250, 500]);
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100)).toMatchObject({ level: 2, nextLevelXp: 250, progress: 0 });
    expect(levelFor(375)).toMatchObject({ level: 3, progress: 0.5 });
    const last = GAME_CONFIG.levels.length;
    expect(xpForLevel(last + 1)).toBe(GAME_CONFIG.levels.at(-1)! + GAME_CONFIG.xpPerLevelAfterList);
  });

  it('user progresses to a new level', () => {
    const before = buildProgress(history(building), exercises);
    expect(before.level.level).toBe(1);
    // Four more weeks of hitting the challenge pushes past 100 XP.
    const more: Row[] = [['2026-06-22', 60, [11, 11, 11]], ['2026-06-29', 60, [12, 12, 12]], ['2026-07-06', 60, [12, 12, 12]], ['2026-07-13', 65, [8, 8, 8]]];
    const after = buildProgress(history([...building, ...more]), exercises);
    expect(after.totalXp).toBeGreaterThanOrEqual(100);
    expect(after.level.level).toBeGreaterThanOrEqual(2);
  });

  it('workout XP only once per day and only for a real workout (no farming with tiny sessions)', () => {
    const p = buildProgress(history([['2026-06-01', 60, [10, 10, 10]], ['2026-06-01', 60, [10, 10, 10]], ['2026-06-02', 60, [10]]]), exercises);
    const workoutXp = [...p.bySession.values()].map((s) => s.events.filter((e) => e.type === 'workout').length);
    expect(workoutXp).toEqual([1, 0, 0]);
  });
});

describe('streaks (weekly, never daily)', () => {
  // Default: a week counts with at least 2 workouts.
  const streakOf = (dates: string[]) => {
    const st = new WeeklyStreak();
    dates.forEach((d) => st.add(`${d}T18:00:00`));
    return st;
  };

  it('needs the configured workouts per week', () => {
    expect(GAME_CONFIG.streak.minWorkoutsPerWeek).toBe(2);
    expect(streakOf(['2026-06-01', '2026-06-08', '2026-06-15']).current(new Date('2026-06-16T12:00:00'))).toBe(0); // 1 a week isn't enough
  });

  it('counts consecutive weeks; extra workouts in a week do not help', () => {
    const st = streakOf(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-08', '2026-06-10', '2026-06-15', '2026-06-17']);
    expect(st.current(new Date('2026-06-18T12:00:00'))).toBe(3); // 4 workouts in week 1 still count as one week
  });

  it('the week in progress does not break the streak', () => {
    const three = ['2026-06-01', '2026-06-03', '2026-06-08', '2026-06-10', '2026-06-15', '2026-06-17'];
    expect(streakOf(three).current(new Date('2026-06-24T12:00:00'))).toBe(3); // Wednesday, nothing yet this week
    expect(streakOf([...three, '2026-06-22']).current(new Date('2026-06-24T12:00:00'))).toBe(3); // 1 of 2 so far
    expect(streakOf([...three, '2026-06-22', '2026-06-24']).current(new Date('2026-06-24T20:00:00'))).toBe(4);
  });

  it('user misses a week (or only trains once): the streak restarts quietly; a long gap shows 0', () => {
    const st = streakOf(['2026-06-01', '2026-06-03', '2026-06-08', '2026-06-10', '2026-06-15', '2026-06-22', '2026-06-24', '2026-06-29', '2026-07-01']);
    expect(st.endingAt(weekIndex('2026-06-29T18:00:00'))).toBe(2); // week of 06-15 had only one workout
    expect(st.current(new Date('2026-07-22T12:00:00'))).toBe(0);
  });

  it('awards the consistency milestone once, when the streak reaches the configured weeks', () => {
    const dates = ['2026-06-01', '2026-06-03', '2026-06-08', '2026-06-10', '2026-06-15', '2026-06-17', '2026-06-22', '2026-06-24', '2026-06-26'];
    const p = buildProgress(history(dates.map((d) => [d, 60, [10, 10, 10]] as Row)), exercises);
    const milestones = [...p.bySession.values()].map((s) => s.events.some((e) => e.type === 'consistency'));
    expect(milestones).toEqual([false, false, false, false, false, false, false, true, false]); // 2nd workout of week 4
    expect(p.achievements.find((a) => a.id === 'consistency')?.sessionId).toBe('s7');
  });
});

describe('achievements', () => {
  it('user reaches achievements at the right workout', () => {
    const p = buildProgress(history([...building, ['2026-06-22', 60, [11, 11, 10]]]), exercises);
    const at = Object.fromEntries(p.achievements.map((a) => [a.id, a.sessionId]));
    expect(at['first-workout']).toBe('s0');
    expect(at['first-challenge']).toBe('s3');
    expect(at['five-workouts']).toBeUndefined();
    expect(at['consistency']).toBeUndefined(); // one workout a week doesn't make a streak
    expect(p.bySession.get('s3')!.unlocked).toEqual(['first-challenge']);
  });

  it('every achievement has a unique id and a description', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every((a) => a.title && a.description)).toBe(true);
  });
});

describe('sample data', () => {
  it('shows a meaningful mid-way state out of the box, whatever the day of the week', () => {
    for (let day = 5; day <= 11; day++) {
      const now = new Date(2026, 9, day, 12); // Mon 5 Oct … Sun 11 Oct (sample dates are relative to "now")
      const d = createSampleData(now);
      const p = buildProgress(d.sessions, d.exercises, now);
      expect(p.stats.challengesCompleted).toBeGreaterThan(10);
      expect(p.level.level).toBeGreaterThan(1);
      expect(p.streakWeeks).toBeGreaterThanOrEqual(4);
      expect(p.achievements.length).toBeGreaterThan(3);
      expect(p.achievements.length).toBeLessThan(ACHIEVEMENTS.length); // something left to aim for
      expect(p.personalBests.length).toBeGreaterThan(5);
    }
  });
});
