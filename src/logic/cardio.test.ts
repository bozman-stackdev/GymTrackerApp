/**
 * Cardio, warm-ups and cool-downs: the cardio rules, the capped XP, and - most important - that none of it reaches
 * the strength engine (progression, Today's Challenge, mastery, personal bests, strength XP, equipment).
 */
import { describe, expect, it } from 'vitest';
import type { ActivityEntry, Exercise, SessionEntry, WorkoutSession } from '../types';
import {
  activityDurationSec, cardioMinutes, cardioStats, describeActivity, durationChange, elapsedSec, formatChange, formatClock, formatDuration,
  formatDurationWords, formatMinutes, historyLine, lastActivity,
} from './cardio';
import { activitiesFor, activityById, cleanMetrics } from './activities';
import { exerciseHistory, sessionSetCount, sessionVolumeKg } from './history';
import { recommend } from './progression';
import { challengeFor } from './game/challenge';
import { buildProgress } from './game/progress';
import { GAME_CONFIG } from './game/config';
import { lastUsage } from './equipment';
import { setUnits } from './units';

const press: Exercise = { id: 'press', name: 'Press', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 };
const at = (date: string) => new Date(`${date}T18:00:00`).toISOString();
const strength = (date: string, weightKg: number, reps: number[], equipmentId?: string): SessionEntry => ({
  exerciseId: 'press', targetSets: reps.length, equipmentId, sets: reps.map((r) => ({ reps: r, weightKg, loggedAt: at(date) })),
});
const session = (id: string, date: string, entries: SessionEntry[]): WorkoutSession => ({ id, name: 'W', startedAt: at(date), finishedAt: at(date), entries });
const cardio = (activityId: string, log: ActivityEntry['log'], extra: Partial<ActivityEntry> = {}): ActivityEntry =>
  ({ kind: 'cardio', activityId, log, doneAt: at('2026-06-01'), ...extra });
const runs = (minutes: number[], activityId = 'treadmill', more = {}) =>
  minutes.map((m, i) => session(`c${i}`, `2026-06-0${i + 1}`, [cardio(activityId, { durationMin: m, ...more })]));

describe('cardio is separate from strength', () => {
  const plain = [
    session('s0', '2026-06-01', [strength('2026-06-01', 60, [9, 9, 8], 'eq1')]),
    session('s1', '2026-06-08', [strength('2026-06-08', 60, [10, 10, 9], 'eq1')]),
    session('s2', '2026-06-15', [strength('2026-06-15', 60, [11, 10, 10], 'eq1')]),
  ];
  // The same workouts with a warm-up walk, warm-up sets (20 kg × 10, light and many), a treadmill run and a stretch.
  const mixed = plain.map((s, i) => ({
    ...s,
    entries: [
      { kind: 'warmup', activityId: 'walking', log: { durationMin: 5 }, doneAt: s.startedAt, planned: true },
      { kind: 'warmup', activityId: 'warmup-sets', warmupFor: 'press', doneAt: s.startedAt,
        warmupSets: [{ reps: 10, weightKg: 20, loggedAt: s.startedAt }, { reps: 30, weightKg: 100, loggedAt: s.startedAt }] },
      ...s.entries,
      { kind: 'cardio', activityId: 'treadmill', log: { durationMin: 20 + i, inclinePct: 5, distanceKm: 3 }, doneAt: s.startedAt },
      { kind: 'cooldown', activityId: 'stretching', log: { durationMin: 5 }, doneAt: s.startedAt, planned: true },
    ] as SessionEntry[],
  }));
  const now = new Date('2026-06-20T12:00:00');

  it('the recommendation and Today\'s Challenge are identical with or without warm-ups and cardio', () => {
    expect(recommend(press, mixed)).toEqual(recommend(press, plain));
    expect(challengeFor(press, mixed)).toEqual(challengeFor(press, plain));
    expect(challengeFor(press, mixed)).toMatchObject({ kind: 'more-reps', weightKg: 60, reps: 11 });
  });

  it('warm-up sets never appear in the exercise history, volume or set counts', () => {
    expect(exerciseHistory(mixed, 'press')).toEqual(exerciseHistory(plain, 'press'));
    expect(exerciseHistory(mixed, 'press').flatMap((p) => p.sets).some((s) => s.weightKg !== 60)).toBe(false);
    expect(mixed.map(sessionVolumeKg)).toEqual(plain.map(sessionVolumeKg));
    expect(mixed.map(sessionSetCount)).toEqual(plain.map(sessionSetCount));
  });

  it('mastery, personal bests, challenges and strength XP are unchanged; activity XP is extra and small', () => {
    const a = buildProgress(plain, [press], now);
    const b = buildProgress(mixed, [press], now);
    expect(b.stats).toEqual(a.stats);
    for (const s of plain) {
      const strengthOnly = (id: string, p: typeof a) => p.bySession.get(id)!.events.filter((e) => !['cardio', 'warmup', 'cooldown'].includes(e.type));
      expect(strengthOnly(s.id, b)).toEqual(strengthOnly(s.id, a));
      expect(b.bySession.get(s.id)!.results).toEqual(a.bySession.get(s.id)!.results);
    }
    const perWorkout = GAME_CONFIG.xp.cardio + GAME_CONFIG.xp.warmup + GAME_CONFIG.xp.cooldown;
    expect(b.totalXp - a.totalXp).toBe(perWorkout * plain.length);
    expect(perWorkout).toBeLessThan(GAME_CONFIG.xp.challenge); // all activity XP together is less than one strength challenge
  });

  it('equipment usage only looks at strength sets', () => {
    expect(lastUsage(mixed, 'eq1')).toEqual(lastUsage(plain, 'eq1'));
  });

  it('old saved workouts (no "kind" at all) are strength entries and score as before', () => {
    const old = JSON.parse(JSON.stringify(plain)) as WorkoutSession[];
    expect(old[0].entries[0]).not.toHaveProperty('kind');
    expect(buildProgress(old, [press], now).totalXp).toBe(buildProgress(plain, [press], now).totalXp);
  });
});

describe('cardio XP: +10 for completed cardio, once per workout', () => {
  const now = new Date('2026-06-20T12:00:00');
  const xpOf = (entries: SessionEntry[]) => buildProgress([session('x', '2026-06-01', entries)], [press], now).bySession.get('x')!.events;
  const timed = (activityId: string, sec: number, extra: Partial<ActivityEntry> = {}): ActivityEntry =>
    ({ kind: 'cardio', activityId, durationSec: sec, startedAt: at('2026-06-01'), doneAt: at('2026-06-01'), ...extra });

  it('three cardio activities in one workout earn cardio XP once; a longer session never earns more', () => {
    const events = xpOf([timed('running', 600), timed('rowing', 3600), timed('cycling', 600)]);
    expect(events.filter((e) => e.type === 'cardio')).toEqual([{ type: 'cardio', xp: 10 }]);
    expect(GAME_CONFIG.xp.cardio).toBe(10);
  });

  it('a timer stopped after a few seconds is a mis-tap: saved, but no XP', () => {
    expect(xpOf([timed('treadmill', 12)])).toEqual([]);
    expect(xpOf([timed('treadmill', 60)]).map((e) => e.type)).toEqual(['cardio']);
  });

  it('a 10-minute cardio day is a real workout (workout XP); 5 minutes alone is not', () => {
    expect(xpOf([timed('running', 600)]).map((e) => e.type)).toEqual(['workout', 'cardio']);
    expect(xpOf([timed('running', 300)]).map((e) => e.type)).toEqual(['cardio']);
  });

  it('older workouts (minutes typed in) still earn the same way', () => {
    expect(xpOf([cardio('running', { durationMin: 10, speedKmh: 9 })]).map((e) => e.type)).toEqual(['workout', 'cardio']);
  });

  it('warm-ups and cool-downs pay only when planned in the routine (adding extra ones never pays)', () => {
    const w = (planned: boolean): ActivityEntry => ({ kind: 'warmup', activityId: 'mobility', durationSec: 300, doneAt: at('2026-06-01'), planned });
    const c = (planned: boolean): ActivityEntry => ({ kind: 'cooldown', activityId: 'stretching', durationSec: 300, doneAt: at('2026-06-01'), planned });
    expect(xpOf([w(false), c(false)])).toEqual([]);
    expect(xpOf([w(true), w(true), c(true)]).map((e) => e.type)).toEqual(['warmup', 'cooldown']);
  });

  it('activities not completed (never started, or still running) earn nothing', () => {
    expect(xpOf([{ kind: 'cardio', activityId: 'running', plan: { durationMin: 30 } }])).toEqual([]);
    expect(xpOf([{ kind: 'cardio', activityId: 'running', startedAt: at('2026-06-01') }])).toEqual([]);
  });

  it('a treadmill session never touches strength scoring', () => {
    const lifts = [strength('2026-06-01', 60, [10, 10, 10])];
    const a = buildProgress([session('x', '2026-06-01', lifts)], [press], now).bySession.get('x')!;
    const b = buildProgress([session('x', '2026-06-01', [...lifts, timed('treadmill', 1422)])], [press], now).bySession.get('x')!;
    expect(b.results).toEqual(a.results);
    expect(b.events.filter((e) => e.type !== 'cardio')).toEqual(a.events);
  });
});

describe('durations (the only cardio metric)', () => {
  it('elapsed time comes from timestamps, so a locked screen or reload changes nothing', () => {
    const start = '2026-06-01T18:00:00.000Z';
    expect(elapsedSec(start, Date.parse('2026-06-01T18:23:42.000Z'))).toBe(1422);
    expect(elapsedSec(start, Date.parse('2026-06-01T17:59:00.000Z'))).toBe(0); // clock before start: never negative
  });

  it('formats the stopwatch, the result and the comparison', () => {
    expect(formatClock(272)).toBe('00:04:32');
    expect(formatClock(3725)).toBe('01:02:05');
    expect(formatDuration(1422)).toBe('23:42');
    expect(formatDuration(3910)).toBe('1:05:10');
    expect(formatDurationWords(1422)).toBe('23 min 42 sec');
    expect(formatDurationWords(1200)).toBe('20 min');
    expect(formatDurationWords(45)).toBe('45 sec');
    expect(formatDurationWords(3900)).toBe('1 h 5 min');
    expect(durationChange(1200, 1422)).toEqual({ previous: 1200, today: 1422, change: 222 });
    expect(formatChange(222)).toBe('+3:42');
    expect(formatChange(-65)).toBe('-1:05');
    expect(durationChange(undefined, 1422)).toBeNull();
  });

  it('timer results and older typed-in minutes read the same way', () => {
    expect(activityDurationSec({ durationSec: 1422 })).toBe(1422);
    expect(activityDurationSec({ log: { durationMin: 20, speedKmh: 6.5 } })).toBe(1200);
    expect(activityDurationSec({})).toBe(0);
  });

  it('previous duration per activity and kind (a warm-up walk is not a cardio walk); unfinished workouts excluded', () => {
    const s = session('w', '2026-06-01', [{ kind: 'warmup', activityId: 'walking', durationSec: 332, doneAt: at('2026-06-01') }]);
    expect(lastActivity([s], 'walking', 'cardio')).toBeUndefined();
    expect(lastActivity([s], 'walking', 'warmup')!.durationSec).toBe(332);
    const live = { ...runs([20])[0], finishedAt: undefined };
    expect(lastActivity([live], 'treadmill', 'cardio')).toBeUndefined();
    expect(lastActivity(runs([18, 20]), 'treadmill', 'cardio')!.durationSec).toBe(1200);
  });
});

describe('cardio statistics and display', () => {
  const sessions = [
    session('a', '2026-06-01', [cardio('treadmill', { durationMin: 20, distanceKm: 3 }), { kind: 'cardio', activityId: 'rowing', durationSec: 600, doneAt: at('2026-06-01') }]),
    session('b', '2026-06-03', [cardio('running', { durationMin: 35, distanceKm: 6.5 }), { kind: 'warmup', activityId: 'running', durationSec: 300, doneAt: at('2026-06-03') }]),
    session('c', '2026-06-05', [{ kind: 'cardio', activityId: 'treadmill', durationSec: 1422, doneAt: at('2026-06-05') }, cardio('other', { durationMin: 15 }, { name: 'Boxing' })]),
  ];

  it('totals cardio only (warm-ups excluded): sessions, total time, time per activity, longest, most frequent', () => {
    const st = cardioStats(sessions);
    expect(st).toMatchObject({ sessions: 5, totalSec: 1200 + 600 + 2100 + 1422 + 900, longest: { name: 'Running', sec: 2100 }, mostFrequent: { name: 'Treadmill', count: 2 } });
    expect(st.byActivity[0]).toEqual({ name: 'Treadmill', sec: 2622, count: 2 });
    expect(st.byActivity.map((a) => a.name)).toContain('Boxing');
    expect(cardioStats([]).longest).toBeNull();
  });

  it('summaries show the duration only; older workouts keep their recorded extras, never empty fields', () => {
    expect(describeActivity({ kind: 'cardio', activityId: 'treadmill', durationSec: 1422, doneAt: at('2026-06-01') })).toBe('23 min 42 sec');
    expect(describeActivity(cardio('treadmill', { durationMin: 20, speedKmh: 6.5, inclinePct: 5 }))).toBe('20 min · 6.5 km/h · 5% incline');
    expect(describeActivity(cardio('rowing', { durationMin: 10, distanceKm: 2 }))).toBe('10 min · 2,000 m');
    setUnits('lb');
    try {
      expect(describeActivity(cardio('running', { distanceKm: 1.609344 }))).toBe('1 mi');
    } finally { setUnits('kg'); }
  });

  it('history lines show only what the workout has', () => {
    expect(historyLine(sessions[0])).toBe('30 min cardio');
    expect(historyLine(session('m', '2026-06-01', [strength('2026-06-01', 60, [10, 10]), cardio('running', { durationMin: 25 })]))).toBe('1 exercise · 2 sets · 25 min cardio');
    expect(historyLine(session('p', '2026-06-01', [strength('2026-06-01', 60, [10])]))).toBe('1 exercise · 1 set');
    expect(cardioMinutes(sessions[2])).toBe(39); // 23:42 + 15:00, rounded
    expect(formatMinutes(125)).toBe('2 h 5 min');
  });

  it('old metrics are still validated; unknown activities show as Other', () => {
    expect(cleanMetrics({ durationMin: 20, inclinePct: -3, calories: 1e9, bogus: 4 } as never)).toEqual({ durationMin: 20 });
    expect(cleanMetrics({})).toBeUndefined();
    expect(activityById('nope').id).toBe('other');
  });

  it('the cardio list is the simple one, in order', () => {
    expect(activitiesFor('cardio').slice(0, 8).map((a) => a.name)).toEqual(['Treadmill', 'Cycling', 'Rowing', 'Cross Trainer', 'Stair Climber', 'Walking', 'Running', 'Swimming']);
    expect(activitiesFor('cardio').at(-1)!.name).toBe('Other');
  });
});
