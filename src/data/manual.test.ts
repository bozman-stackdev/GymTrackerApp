/** Missed workouts added afterwards: saved on their real date, never rewarded, and never re-scoring the past. */
import { describe, expect, it } from 'vitest';
import { buildProgress } from '../logic/game/progress';
import { challengeFor } from '../logic/game/challenge';
import { exerciseHistory } from '../logic/history';
import { dailyPoints, dayKey } from '../logic/leaderboard/score';
import type { AppData } from '../types';
import { finishWorkout, logSet, startWorkout } from './actions';
import { completeSet, manualDateProblem, saveManualWorkout, sameDayWorkouts, toManualInput, type ManualWorkoutInput } from './manual';
import { createSampleData } from './seed';
import { parseAppData } from './validate';

const now = new Date('2026-10-22T18:00:00');
const sample = createSampleData(now);
const press = sample.exercises.find((e) => e.name === 'Chest Press Machine')!;
const ok = (r: ReturnType<typeof saveManualWorkout>) => { if ('error' in r) throw new Error(r.error); return r; };
const add = (data: AppData, input: Partial<ManualWorkoutInput>, at = now) => ok(saveManualWorkout(data, { date: '2026-10-20', items: [], ...input }, at));

describe('saving a missed workout', () => {
  it('date + type is enough: on its real date, labelled, no made-up duration or sets', () => {
    const { data, session } = add(sample, {});
    expect(session).toMatchObject({ name: 'Freestyle Workout', entries: [], manual: { addedAt: now.toISOString() } });
    expect(dayKey(session.startedAt)).toBe('2026-10-20');
    expect(session.finishedAt).toBe(session.startedAt); // no duration given
    expect(session.manual!.durationMin).toBeUndefined();
    expect(data.sessions).toHaveLength(sample.sessions.length + 1);
    expect(data.activeWorkout).toBe(sample.activeWorkout);
  });

  it('a routine as the type', () => {
    const routine = sample.routines[0];
    const { session } = add(sample, { routineId: routine.id, durationMin: 45 });
    expect(session).toMatchObject({ name: routine.name, routineId: routine.id, manual: { durationMin: 45 } });
    expect(Date.parse(session.finishedAt!) - Date.parse(session.startedAt)).toBe(45 * 60_000);
  });

  it('only complete sets are saved; an exercise without any is kept as "done, no details"; cardio minutes optional', () => {
    const { session } = add(sample, {
      items: [
        { type: 'strength', exerciseId: press.id, sets: [{ reps: 10, weightKg: 50 }, { reps: 8, weightKg: null }, { reps: null, weightKg: 50 }, { reps: 9, weightKg: 52.5 }] },
        { type: 'activity', kind: 'cardio', activityId: 'treadmill', minutes: 20 },
        { type: 'strength', exerciseId: sample.exercises[1].id, sets: [] },
        { type: 'activity', kind: 'cooldown', activityId: 'stretching', minutes: null },
      ],
    });
    expect(session.entries).toMatchObject([
      { exerciseId: press.id, targetSets: 2, sets: [{ reps: 10, weightKg: 50 }, { reps: 9, weightKg: 52.5 }] },
      { kind: 'cardio', activityId: 'treadmill', durationSec: 1200 },
      { exerciseId: sample.exercises[1].id, sets: [] },
      { kind: 'cooldown', activityId: 'stretching' },
    ]);
    expect(session.entries[3]).not.toHaveProperty('durationSec');
  });

  it('dates: not in the future, not malformed; today is fine', () => {
    expect(manualDateProblem('2026-10-23', now)).toMatch(/past/);
    expect(manualDateProblem('20-10-2026', now)).toBe('Choose a date');
    expect(manualDateProblem('2026-10-22', now)).toBeNull();
    expect(saveManualWorkout(sample, { date: '2026-11-01', items: [] }, now)).toEqual({ error: expect.stringMatching(/past/) });
    const today = add(sample, { date: '2026-10-22', durationMin: 60 }).session;
    expect(Date.parse(today.startedAt)).toBe(now.getTime() - 3_600_000); // ended now
  });

  it('a set needs reps (1–100), and a weight for weighted exercises', () => {
    expect(completeSet({ reps: 10, weightKg: 40 }, press)).toBe(true);
    expect(completeSet({ reps: 10, weightKg: null }, press)).toBe(false);
    expect(completeSet({ reps: 0, weightKg: 40 }, press)).toBe(false);
    expect(completeSet({ reps: 10.5, weightKg: 40 }, press)).toBe(false);
    expect(completeSet({ reps: 12, weightKg: null }, { ...press, weightStepKg: 0 })).toBe(true); // bodyweight
  });

  it('editing keeps the id, when it was added, and the date (unless changed)', () => {
    const first = add(sample, { durationMin: 30 });
    const later = new Date('2026-10-22T20:00:00');
    const edited = ok(saveManualWorkout(first.data, { ...toManualInput(first.session), durationMin: 40 }, later)).session;
    expect(edited).toMatchObject({ id: first.session.id, startedAt: first.session.startedAt, manual: { addedAt: now.toISOString(), durationMin: 40 } });
    const moved = ok(saveManualWorkout(first.data, { ...toManualInput(first.session), date: '2026-10-19' }, later));
    expect(dayKey(moved.session.startedAt)).toBe('2026-10-19');
    expect(moved.data.sessions.filter((s) => s.id === first.session.id)).toHaveLength(1);
    expect(saveManualWorkout(first.data, { id: 'nope', date: '2026-10-20', items: [] }, later)).toEqual({ error: expect.any(String) });
  });

  it('warns about another workout on the same day (but allows it)', () => {
    const day = dayKey(sample.sessions.at(-1)!.startedAt);
    expect(sameDayWorkouts(sample.sessions, day).length).toBeGreaterThan(0);
    expect(sameDayWorkouts(sample.sessions, '1999-01-01')).toEqual([]);
  });

  it('survives save/reload and sync validation; an odd "manual" value is dropped, the workout kept', () => {
    const { data, session } = add(sample, { durationMin: 30, note: 'Hotel gym' });
    expect(parseAppData(JSON.parse(JSON.stringify(data))).sessions.find((s) => s.id === session.id)!.manual).toEqual(session.manual);
    const odd = JSON.parse(JSON.stringify(data));
    odd.sessions.at(-1).manual = { addedAt: 'yesterday' };
    const parsed = parseAppData(odd);
    expect(parsed.sessions).toHaveLength(data.sessions.length);
    expect(parsed.sessions.at(-1)!.manual).toBeUndefined();
  });
});

describe('rewards: a record, not a live workout', () => {
  const before = buildProgress(sample.sessions, sample.exercises, now);
  // A big remembered set (would be a PB) and enough workouts to fill out weeks.
  let data = sample;
  for (const date of ['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09', '2026-10-20']) {
    data = add(data, { date, items: [{ type: 'strength', exerciseId: press.id, sets: [{ reps: 12, weightKg: 200 }, { reps: 12, weightKg: 200 }, { reps: 12, weightKg: 200 }] }] }).data;
  }
  const after = buildProgress(data.sessions, data.exercises, now);

  it('no XP, results, achievements or leaderboard points - and nothing that already happened is re-scored', () => {
    expect(after.totalXp).toBe(before.totalXp);
    expect(after.achievements).toEqual(before.achievements);
    expect(after.stats.workouts).toBe(before.stats.workouts);
    for (const [id, s] of before.bySession) expect(after.bySession.get(id)).toEqual(s);
    for (const s of data.sessions.filter((x) => x.manual)) expect(after.bySession.has(s.id)).toBe(false);
    expect(dailyPoints(after, data.sessions)).toEqual(dailyPoints(before, sample.sessions));
  });

  it('counts for history and the streak shown', () => {
    expect(after.streakWeeks).toBeGreaterThanOrEqual(before.streakWeeks);
    expect(exerciseHistory(data.sessions, press.id).length).toBe(exerciseHistory(sample.sessions, press.id).length + 5);
  });

  it('its sets inform what comes next, and later live workouts are scored against them', () => {
    expect(challengeFor(press, data.sessions)).not.toEqual(challengeFor(press, sample.sessions));
    // A live workout after the entries were added: 60 kg is no personal best any more (200 kg was entered).
    let w = startWorkout(data, sample.routines.find((r) => r.items.some((i) => 'exerciseId' in i && i.exerciseId === press.id)), new Date('2026-10-23T18:00:00'));
    const idx = w.activeWorkout!.session.entries.findIndex((e) => 'exerciseId' in e && e.exerciseId === press.id);
    w = logSet(w, idx, { reps: 10, weightKg: 60 }, new Date('2026-10-23T18:05:00'));
    const done = finishWorkout(w, new Date('2026-10-23T18:30:00'));
    const p = buildProgress(done.sessions, done.exercises, new Date('2026-10-23T19:00:00'));
    const last = p.bySession.get(done.sessions.at(-1)!.id)!;
    expect(last.results.find((r) => r.exerciseId === press.id)!.personalBestSetIndex).toBe(-1);
  });
});
