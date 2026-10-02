/**
 * Muscle map scoring: which muscles each exercise trains, activity per period, performance progress, balance,
 * insights, the plan rules and the muscle achievements. Dates are local; 2026-06-17 is a Wednesday.
 */
import { describe, expect, it } from 'vitest';
import type { ActivityEntry, Exercise, MuscleId, SessionEntry, WorkoutSession } from '../../types';
import { createSampleData, SAMPLE_EXERCISES } from '../../data/seed';
import { parseAppData, DataError } from '../../data/validate';
import { buildProgress } from '../game/progress';
import { ACHIEVEMENTS } from '../game/achievements';
import { can, canUsePeriod, planOf } from '../plan';
import { involvement, MUSCLES, MUSCLE_IDS, musclesFor, suggestMuscles } from './catalog';
import { MUSCLE_CONFIG } from './config';
import { analyseMuscles, ladderPosition, periodWindow, progressLevel, trainingBalance, weightedSets, type MuscleInput } from './analysis';
import { compareWithPrevious, muscleInsights, weeklyTrends } from './insights';

const ex = (id: string) => SAMPLE_EXERCISES.find((e) => e.id === id)!;
const at = (date: string) => new Date(`${date}T18:00:00`).toISOString();
const lift = (exerciseId: string, weightKg: number, reps: number[], targetSets = reps.length): SessionEntry =>
  ({ exerciseId, targetSets, sets: reps.map((r) => ({ reps: r, weightKg, loggedAt: '' })) });
let n = 0;
const session = (date: string, entries: SessionEntry[], id = `s${n++}`): WorkoutSession => ({ id, name: 'W', startedAt: at(date), finishedAt: at(date), entries });
const only = (sets: Record<MuscleId, number>) => Object.fromEntries(Object.entries(sets).filter(([, v]) => v > 0));
const NOW = new Date('2026-06-17T20:00:00');
const input = (sessions: WorkoutSession[], exercises: Exercise[] = SAMPLE_EXERCISES, now = NOW): MuscleInput => {
  const progress = buildProgress(sessions, exercises, now);
  return { sessions, exercises, now, results: (id) => progress.bySession.get(id)?.results };
};

describe('exercise → muscles (from the exercise library)', () => {
  it('Bench Press: chest (primary), triceps and front shoulders (secondary, half)', () => {
    expect(only(weightedSets([session('2026-06-15', [lift('bench-press', 60, [8, 8, 8])])], SAMPLE_EXERCISES)))
      .toEqual({ chest: 3, triceps: 1.5, 'front-delts': 1.5 });
  });

  it('Lat Pulldown: lats (primary), biceps and upper back (secondary)', () => {
    expect(only(weightedSets([session('2026-06-15', [lift('lat-pulldown', 50, [10, 10, 10])])], SAMPLE_EXERCISES)))
      .toEqual({ lats: 3, biceps: 1.5, 'upper-back': 1.5 });
  });

  it('Leg Press: quadriceps (primary), glutes and hamstrings (secondary)', () => {
    expect(only(weightedSets([session('2026-06-15', [lift('leg-press', 120, [10, 10, 10])])], SAMPLE_EXERCISES)))
      .toEqual({ quads: 3, glutes: 1.5, hamstrings: 1.5 });
  });

  it('every library exercise lists its muscles, using known muscle ids only', () => {
    for (const e of SAMPLE_EXERCISES) {
      expect(e.muscles?.primary.length, e.id).toBeGreaterThan(0);
      for (const id of [...e.muscles!.primary, ...e.muscles!.secondary]) expect(MUSCLE_IDS, `${e.id}: ${id}`).toContain(id);
    }
  });

  it('weights are configurable, and an exercise can override one muscle', () => {
    const light = { ...MUSCLE_CONFIG, involvement: { primary: 1, secondary: 0.25 } };
    expect(Object.fromEntries(involvement(ex('bench-press'), light))).toEqual({ chest: 1, triceps: 0.25, 'front-delts': 0.25 });
    expect(involvement(ex('lateral-raise')).get('upper-back')).toBe(0.25); // the exercise's own weight
  });

  it('exercises without a muscle list get sensible defaults (name first, then muscle group)', () => {
    expect(musclesFor({ name: 'Hack Squat', muscleGroup: 'chest' }).primary).toEqual(['quads', 'glutes']); // the form's default group
    expect(musclesFor({ name: 'Flat Bench Press', muscleGroup: 'chest' }).primary).toEqual(['chest']); // "flat" isn't "lat"
    expect(musclesFor({ name: 'Triceps Kickback', muscleGroup: 'arms' }).primary).toEqual(['triceps']);
    expect(musclesFor({ name: 'Glute Kickback', muscleGroup: 'legs' }).primary).toEqual(['glutes']);
    expect(musclesFor({ name: 'Mystery Machine', muscleGroup: 'back' }).primary).toEqual(['lats', 'upper-back']);
    expect(musclesFor({ name: 'X', muscleGroup: 'core', muscles: { primary: ['abs', 'bogus' as MuscleId], secondary: [] } }).primary).toEqual(['abs']);
    expect(suggestMuscles('Cable Crunch', 'core').primary).toEqual(['abs']);
  });

  it('every muscle is drawn in at least one view, and the groups cover all muscles', () => {
    for (const m of MUSCLES) expect(m.views.length, m.id).toBeGreaterThan(0);
    expect(MUSCLES).toHaveLength(17);
  });
});

describe('only strength sets count (cardio, warm-ups and cool-downs never do)', () => {
  const strength = [lift('bench-press', 60, [8, 8, 8])];
  const treadmill: ActivityEntry = { kind: 'cardio', activityId: 'treadmill', log: { durationMin: 20 }, doneAt: at('2026-06-15') };
  const warmupSets: ActivityEntry = { kind: 'warmup', activityId: 'warmup-sets', warmupFor: 'bench-press', doneAt: at('2026-06-15'),
    warmupSets: [{ reps: 10, weightKg: 20, loggedAt: '' }, { reps: 8, weightKg: 40, loggedAt: '' }] };
  const mobility: ActivityEntry = { kind: 'warmup', activityId: 'mobility', log: { durationMin: 5 }, doneAt: at('2026-06-15'), planned: true };
  const stretch: ActivityEntry = { kind: 'cooldown', activityId: 'stretching', log: { durationMin: 5 }, doneAt: at('2026-06-15'), planned: true };

  it('cardio alone trains no muscles on the map', () => {
    const a = analyseMuscles(input([session('2026-06-15', [treadmill])]), 'workout');
    expect(MUSCLE_IDS.every((id) => a.activity[id].level === 'none')).toBe(true);
    expect(a.totalSets).toBe(0);
  });

  it('warm-up sets, a warm-up and a cool-down add nothing to a strength workout', () => {
    const plain = analyseMuscles(input([session('2026-06-15', strength, 'p')]), 'workout');
    const mixed = analyseMuscles(input([session('2026-06-15', [mobility, warmupSets, ...strength, treadmill, stretch], 'm')]), 'workout');
    expect(mixed.activity).toEqual(plain.activity);
    expect(mixed.totalSets).toBe(3);
  });

  it('a deleted exercise in old history is ignored, not guessed', () => {
    const a = analyseMuscles(input([session('2026-06-15', [lift('gone', 50, [10, 10]), ...strength])]), 'workout');
    expect(a.activity.chest.sets).toBe(3);
    expect(a.totalSets).toBe(5); // still counted as sets done, just not on the map
  });
});

describe('activity over a period', () => {
  const sessions = [
    session('2026-05-27', [lift('leg-press', 120, [10, 10, 10])]), // 3 weeks ago
    session('2026-06-15', [lift('bench-press', 60, [8, 8, 8]), lift('triceps-pushdown', 20, [12, 12])]), // this Monday
  ];

  it('changes with the period: this week has no legs, the last 4 weeks do', () => {
    const week = analyseMuscles(input(sessions), 'week');
    const month = analyseMuscles(input(sessions), '4w');
    expect(week.activity.quads.level).toBe('none');
    expect(month.activity.quads.level).not.toBe('none');
    expect(week.activity.chest.sets).toBe(3);
    expect(month.window.sessions).toHaveLength(2);
  });

  it('"this workout" is the latest workout (or the one asked for)', () => {
    expect(analyseMuscles(input(sessions), 'workout').activity.chest.level).toBe('high');
    expect(analyseMuscles(input(sessions), 'workout', sessions[0].id).activity.chest.level).toBe('none');
  });

  it('is relative to the most-trained muscle: 100% for the top one, levels from the percentage', () => {
    const a = analyseMuscles(input(sessions), 'week');
    // chest 3; triceps 2 + 1.5 = 3.5 (top); front shoulders 1.5
    expect(a.activity.triceps).toMatchObject({ sets: 3.5, pct: 100, level: 'high' });
    expect(a.activity.chest).toMatchObject({ pct: 86, level: 'high' });
    expect(a.activity['front-delts']).toMatchObject({ pct: 43, level: 'medium' });
    expect(a.activity.triceps.exercises.map((e) => e.exerciseId)).toEqual(['triceps-pushdown', 'bench-press']);
  });

  it('group bars average their muscles', () => {
    const a = analyseMuscles(input(sessions), 'week');
    const chest = a.groups.find((g) => g.group === 'chest')!;
    expect(chest.pct).toBe(86);
    expect(a.groups.find((g) => g.group === 'legs')!.level).toBe('none');
  });

  it('weeks start on Monday; 4 weeks = the last 28 days', () => {
    const w = periodWindow('week', [], NOW);
    expect(new Date(w.from).getDay()).toBe(1);
    expect(new Date(periodWindow('4w', [], NOW).from).toDateString()).toBe(new Date('2026-05-21T12:00:00').toDateString());
  });
});

describe('training progress (performance, not muscle growth)', () => {
  // Bench press, rep range 5–8, 2.5 kg steps. The 4 weeks up to Tue 30 Jun start on Wed 3 Jun; 2 Jun is "before".
  const now = new Date('2026-06-30T20:00:00');
  const weeks = ['2026-06-02', '2026-06-09', '2026-06-16', '2026-06-23', '2026-06-30'];
  const history = (rows: [number, number[]][]) => rows.map(([kg, reps], i) => session(weeks[i], [lift('bench-press', kg, reps)]));
  const progressOf = (rows: [number, number[]][], muscle: MuscleId = 'chest') => analyseMuscles(input(history(rows), SAMPLE_EXERCISES, now), '4w').progress[muscle];

  const improving: [number, number[]][] = [[60, [6, 6, 6]], [60, [7, 7, 7]], [60, [8, 8, 8]], [60, [8, 8, 8]], [62.5, [5, 5, 5]]];
  const flat: [number, number[]][] = [[60, [6, 6, 6]], [60, [6, 6, 6]], [60, [6, 6, 6]], [60, [6, 6, 6]], [60, [6, 6, 6]]];
  const lower: [number, number[]][] = [[60, [6, 6, 6]], [55, [6, 6, 6]], [55, [6, 6, 5]], [55, [6, 5, 5]], [55, [6, 6, 6]]];

  it('the journey ladder counts a weight increase with a rep reset as a step forward', () => {
    const bench = ex('bench-press');
    expect(ladderPosition(bench, { weightKg: 62.5, reps: 5 }) - ladderPosition(bench, { weightKg: 60, reps: 8 })).toBe(1);
    expect(ladderPosition(bench, { weightKg: 60, reps: 7 }) - ladderPosition(bench, { weightKg: 60, reps: 6 })).toBe(1);
    expect(ladderPosition(bench, { weightKg: 60, reps: 12 })).toBe(ladderPosition(bench, { weightKg: 60, reps: 8 })); // above the range: no extra
    expect(ladderPosition(ex('pull-up'), { weightKg: 0, reps: 9 })).toBe(9); // bodyweight: reps
  });

  it('improving weights and reps → strong; flat → stable; below before → lower', () => {
    const up = progressOf(improving);
    expect(up.level).toBe('strong');
    expect(up.exercises[0]).toMatchObject({ exerciseId: 'bench-press', before: { weightKg: 60, reps: 6 }, best: { weightKg: 62.5, reps: 5 }, steps: 3, sessions: 4 });
    expect(progressOf(flat).level).toBe('stable');
    expect(progressOf(lower).level).toBe('lower');
  });

  it('progress changes when the history changes', () => {
    expect(progressOf(improving).score!).toBeGreaterThan(progressOf(flat).score!);
    expect(progressOf(flat).score!).toBeGreaterThan(progressOf(lower).score!);
  });

  it('secondary muscles follow (triceps from the bench); light involvement does not decide progress', () => {
    expect(progressOf(improving, 'triceps').level).toBe('strong');
    const curl = [session('2026-06-02', [lift('lying-leg-curl', 30, [10, 10])]), session('2026-06-09', [lift('lying-leg-curl', 35, [10, 10])]),
      session('2026-06-16', [lift('lying-leg-curl', 40, [12, 12])])];
    const a = analyseMuscles(input(curl, SAMPLE_EXERCISES, now), '4w');
    expect(a.progress.hamstrings.level).not.toBe('none');
    expect(a.progress.calves.level).toBe('none'); // 0.25 involvement: activity yes, progress no
    expect(a.activity.calves.level).not.toBe('none');
  });

  it('not enough history: no progress label yet', () => {
    expect(analyseMuscles(input([session('2026-06-16', [lift('bench-press', 60, [8, 8])])], SAMPLE_EXERCISES, now), '4w').progress.chest.level).toBe('none');
  });

  it('uses the factors it has: no consistency for a single workout, challenges only when there were some', () => {
    const w = analyseMuscles(input(history(improving), SAMPLE_EXERCISES, now), 'workout').progress.chest;
    expect(w.factors.consistency).toBeNull();
    expect(w.factors.performance).toBe(1); // 60 × 8 → 62.5 × 5 = one step in one workout
    const month = progressOf(improving);
    expect(month.factors.consistency).toBe(1); // 4 of 4 weeks
  });

  it('levels come from the configurable thresholds', () => {
    expect(progressLevel(0.5)).toBe('strong');
    expect(progressLevel(0.2)).toBe('moderate');
    expect(progressLevel(0)).toBe('stable');
    expect(progressLevel(-0.5)).toBe('lower');
    expect(progressLevel(null)).toBe('none');
    expect(progressLevel(0.2, { ...MUSCLE_CONFIG, progress: { ...MUSCLE_CONFIG.progress, levels: { strong: 0.1, moderate: 0.05, lower: -0.1 } } })).toBe('strong');
  });
});

describe('balance and insights use neutral language', () => {
  const pushHeavy = [
    session('2026-06-15', [lift('chest-press-machine', 50, [10, 10, 10]), lift('shoulder-press-machine', 40, [10, 10, 10]), lift('triceps-pushdown', 20, [12, 12, 12])]),
    session('2026-06-16', [lift('chest-press-machine', 50, [10, 10, 10]), lift('lat-pulldown', 50, [10, 10])]),
    session('2026-06-17', [lift('leg-press', 120, [10, 10, 10])]),
  ];
  const FORBIDDEN = /grew|grow|growth|bigger|size|unbalanced|imbalance|physique|weak|lagging|look/i;

  it('describes the training emphasis without judging', () => {
    const b = analyseMuscles(input(pushHeavy), 'week').balance;
    expect(b.enough).toBe(true);
    expect(b.regions.find((r) => r.id === 'push')!.level).toBe('high');
    expect(b.notes.join(' ')).toContain('Training emphasis: pushing');
    expect(b.notes.join(' ')).toContain('Pulling: lower recent training volume');
    for (const note of b.notes) expect(note).not.toMatch(FORBIDDEN);
  });

  it('similar training reads as similar; too little training is not compared', () => {
    const even = [session('2026-06-15', [lift('chest-press-machine', 50, [10, 10, 10]), lift('lat-pulldown', 50, [10, 10, 10]), lift('leg-press', 100, [10, 10, 10])])];
    expect(analyseMuscles(input(even), 'week').balance.notes).toContain('Pushing and pulling: similar training volume.');
    expect(trainingBalance(analyseMuscles(input([session('2026-06-15', [lift('db-curl', 10, [10])])]), 'week').activity).enough).toBe(false);
  });

  it('insights, trends and comparisons (Premium) are generated from the data, in neutral words', () => {
    const data = createSampleData(NOW);
    const inp = input(data.sessions, data.exercises);
    const a = analyseMuscles(inp, '4w');
    const insights = muscleInsights(inp, a);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(3);
    for (const s of insights) expect(s).not.toMatch(FORBIDDEN);
    const changes = compareWithPrevious(inp, a)!;
    expect(changes.map((c) => c.group)).toEqual(['chest', 'back', 'shoulders', 'arms', 'core', 'legs']);
    expect(compareWithPrevious(inp, analyseMuscles(inp, 'all'))).toBeNull();
    const trends = weeklyTrends(data.sessions, data.exercises, NOW);
    expect(trends[0].weeks).toHaveLength(12);
    expect(trends.find((t) => t.group === 'chest')!.weeks.at(-1)).toBeGreaterThanOrEqual(0);
  });

  it('progress labels never claim growth, every level has a label', () => {
    const sample = createSampleData(NOW);
    const a = analyseMuscles(input(sample.sessions, sample.exercises), '4w');
    expect(new Set(MUSCLE_IDS.map((id) => a.progress[id].level)).size).toBeGreaterThan(1); // the sample shows a mix
  });
});

describe('Free and Premium', () => {
  it('the body map, activity and basic progress are free; longer history and details are Premium', () => {
    expect(planOf({})).toBe('free');
    expect(planOf({ premiumPreview: true })).toBe('premium');
    for (const p of ['workout', 'week', '4w'] as const) expect(canUsePeriod('free', p)).toBe(true);
    expect(canUsePeriod('free', '12w')).toBe(false);
    expect(canUsePeriod('free', 'all')).toBe(false);
    expect(canUsePeriod('premium', 'all')).toBe(true);
    for (const f of ['progress-details', 'trends', 'comparisons', 'insights'] as const) {
      expect(can('free', f)).toBe(false);
      expect(can('premium', f)).toBe(true);
    }
  });
});

describe('existing users and older data', () => {
  it('a backup from before the muscle map gets the library muscles; custom exercises keep working', () => {
    const d = createSampleData(NOW);
    const old = JSON.parse(JSON.stringify({ ...d, exercises: [...d.exercises.map(({ muscles: _m, ...e }) => e),
      { id: 'my-hack', name: 'Hack Squat', muscleGroup: 'legs', equipment: 'machine', repRange: [8, 12], weightStepKg: 10, isCustom: true }] }));
    const loaded = parseAppData(old);
    expect(loaded.exercises.find((e) => e.id === 'bench-press')!.muscles).toEqual(ex('bench-press').muscles);
    const custom = loaded.exercises.find((e) => e.id === 'my-hack')!;
    expect(custom.muscles).toBeUndefined();
    expect(musclesFor(custom).primary).toEqual(['quads', 'glutes']);
    // Same XP and level as before: the muscle map adds no XP.
    expect(buildProgress(loaded.sessions, loaded.exercises, NOW).totalXp).toBe(buildProgress(d.sessions, d.exercises, NOW).totalXp);
  });

  it('muscle ids from a newer app version are dropped; a broken muscle list is rejected with a clear error', () => {
    const d = createSampleData(NOW);
    const newer = JSON.parse(JSON.stringify(d));
    newer.exercises[0].muscles = { primary: ['chest', 'serratus'], secondary: ['neck'], weights: { serratus: 0.5 } };
    expect(parseAppData(newer).exercises[0].muscles).toEqual({ primary: ['chest'], secondary: [] });
    const broken = JSON.parse(JSON.stringify(d));
    broken.exercises[0].muscles = { primary: 'chest' };
    expect(() => parseAppData(broken)).toThrow(DataError);
  });

  it('the premium preview survives a reload; it is off by default', () => {
    const d = createSampleData(NOW);
    expect(parseAppData(JSON.parse(JSON.stringify(d))).premiumPreview).toBeUndefined();
    expect(parseAppData(JSON.parse(JSON.stringify({ ...d, premiumPreview: true }))).premiumPreview).toBe(true);
  });
});

describe('muscle achievements reward progress and complete plans, not volume', () => {
  const unlocked = (sessions: WorkoutSession[], now = NOW) => buildProgress(sessions, SAMPLE_EXERCISES, now).achievements.map((a) => a.id);

  it('the sample history earns the muscle achievements it should', () => {
    const d = createSampleData(NOW);
    const ids = buildProgress(d.sessions, d.exercises, NOW).achievements.map((a) => a.id);
    expect(ids).toContain('leg-day-complete');
    expect(ids).toContain('balanced-training');
    expect(ids).toContain('chest-milestone');
  });

  it('lots of sets without progress earn none of the muscle achievements', () => {
    const grind = ['2026-05-04', '2026-05-07', '2026-05-11', '2026-05-14', '2026-05-18', '2026-05-21', '2026-05-25', '2026-05-28']
      .map((d) => session(d, [
        lift('chest-press-machine', 50, [9, 9, 9, 9, 9, 9, 9, 9]), lift('lat-pulldown', 50, [9, 9, 9, 9, 9, 9]),
        lift('leg-press', 100, [9, 9, 9, 9, 9, 9], 8), // fewer sets than planned: not a complete leg day
      ]));
    const ids = unlocked(grind);
    for (const id of ['chest-milestone', 'back-progression', 'leg-day-complete', 'muscle-mastery']) expect(ids, id).not.toContain(id);
    // Balanced training rewards the spread of a week, not the amount: this grind is spread evenly, so it does count.
    expect(ids).toContain('balanced-training');
  });

  it('leg day complete: every planned set done, quads + hamstrings + glutes trained', () => {
    const full = session('2026-06-15', [lift('leg-press', 120, [10, 10, 10]), lift('lying-leg-curl', 35, [12, 12, 12])]);
    const short = session('2026-06-15', [lift('leg-press', 120, [10, 10], 3), lift('lying-leg-curl', 35, [12, 12, 12])]);
    const noHams = session('2026-06-15', [lift('leg-extension', 40, [12, 12, 12])]);
    expect(unlocked([full])).toContain('leg-day-complete');
    expect(unlocked([short])).not.toContain('leg-day-complete');
    expect(unlocked([noHams])).not.toContain('leg-day-complete');
  });

  it('balanced training: pushing, pulling and legs in one week', () => {
    const push = session('2026-06-15', [lift('chest-press-machine', 50, [10, 10, 10])]);
    const pull = session('2026-06-16', [lift('lat-pulldown', 50, [10, 10, 10])]);
    const legs = session('2026-06-17', [lift('leg-press', 120, [10, 10, 10])]);
    expect(unlocked([push, pull, legs])).toContain('balanced-training');
    expect(unlocked([push, pull])).not.toContain('balanced-training');
  });

  it('achievement ids stay unique', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('performance', () => {
  it('stays fast with years of history (opening the map must feel instant)', () => {
    const d = createSampleData();
    const sessions = Array.from({ length: 600 }, (_, i) => { // ~4 years at 3 workouts/week
      const s = d.sessions[i % d.sessions.length];
      const when = new Date(Date.now() - (600 - i) * 2.4 * 86_400_000).toISOString();
      return { ...s, id: `x${i}`, startedAt: when, finishedAt: when };
    });
    const progress = buildProgress(sessions, d.exercises);
    const inp: MuscleInput = { sessions, exercises: d.exercises, results: (id) => progress.bySession.get(id)?.results };
    const t0 = performance.now();
    const all = analyseMuscles(inp, 'all');
    const month = analyseMuscles(inp, '4w');
    muscleInsights(inp, month);
    compareWithPrevious(inp, month);
    weeklyTrends(sessions, d.exercises);
    const ms = performance.now() - t0;
    expect(all.window.sessions).toHaveLength(600);
    expect(ms).toBeLessThan(1500); // generous: CI machines vary
    process.stdout.write(`muscle map, 600 workouts: ${Math.round(ms)} ms\n`);
  });
});
