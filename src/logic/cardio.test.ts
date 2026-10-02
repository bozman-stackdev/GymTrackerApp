/**
 * Cardio, warm-ups and cool-downs: the cardio rules, the capped XP, and - most important - that none of it reaches
 * the strength engine (progression, Today's Challenge, mastery, personal bests, strength XP, equipment).
 */
import { describe, expect, it } from 'vitest';
import type { ActivityEntry, Exercise, SessionEntry, WorkoutSession } from '../types';
import { cardioMinutes, cardioStats, cardioSuggestion, formatMetrics, formatMinutes, historyLine, lastActivity } from './cardio';
import { activityById, cleanMetrics } from './activities';
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
    expect(perWorkout).toBeLessThanOrEqual(11);
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

describe('cardio XP is capped', () => {
  const now = new Date('2026-06-20T12:00:00');
  const xpOf = (entries: SessionEntry[]) => buildProgress([session('x', '2026-06-01', entries)], [press], now).bySession.get('x')!.events;

  it('three cardio activities in one workout earn cardio XP once', () => {
    const events = xpOf([cardio('running', { durationMin: 10 }), cardio('rowing', { durationMin: 10 }), cardio('cycling', { durationMin: 10 })]);
    expect(events.filter((e) => e.type === 'cardio')).toEqual([{ type: 'cardio', xp: GAME_CONFIG.xp.cardio }]);
  });

  it('a 10-minute cardio day is a real workout (workout XP); 5 minutes alone is not', () => {
    expect(xpOf([cardio('running', { durationMin: 10 })]).map((e) => e.type)).toEqual(['workout', 'cardio']);
    expect(xpOf([cardio('running', { durationMin: 5 })]).map((e) => e.type)).toEqual(['cardio']);
  });

  it('warm-ups and cool-downs pay only when planned in the routine (adding extra ones never pays)', () => {
    const w = (planned: boolean): ActivityEntry => ({ kind: 'warmup', activityId: 'mobility', log: { durationMin: 5 }, doneAt: at('2026-06-01'), planned });
    const c = (planned: boolean): ActivityEntry => ({ kind: 'cooldown', activityId: 'stretching', log: { durationMin: 5 }, doneAt: at('2026-06-01'), planned });
    expect(xpOf([w(false), c(false)])).toEqual([]);
    expect(xpOf([w(true), w(true), c(true)]).map((e) => e.type)).toEqual(['warmup', 'cooldown']);
  });

  it('activities not completed earn nothing', () => {
    expect(xpOf([{ kind: 'cardio', activityId: 'running', plan: { durationMin: 30 } }])).toEqual([]);
  });
});

describe('cardio suggestions (gentle, never automatic)', () => {
  it('no suggestion before two sessions', () => {
    expect(cardioSuggestion([], 'treadmill')).toBeNull();
    expect(cardioSuggestion(runs([20]), 'treadmill')).toBeNull();
  });

  it('two matching sessions: one more minute; the prefill stays last time', () => {
    expect(cardioSuggestion(runs([20, 20], 'running'), 'running')).toEqual({ text: 'Try 21 minutes today', prefill: { durationMin: 20 } });
  });

  it('never more than +10%: short sessions just match', () => {
    expect(cardioSuggestion(runs([8, 8], 'running'), 'running')!.text).toBe('Match last time');
    expect(cardioSuggestion(runs([10, 10], 'running'), 'running')!.text).toBe('Try 11 minutes today');
  });

  it('a change since last time: match it', () => {
    expect(cardioSuggestion(runs([20, 25], 'running'), 'running')!.text).toBe('Match last time');
  });

  it('a steady treadmill routine (same time and incline 3 times): a little more incline, same time', () => {
    expect(cardioSuggestion(runs([20, 20, 20], 'treadmill', { inclinePct: 5 }), 'treadmill')!.text).toBe('Keep 20 minutes and try 5.5% incline');
    expect(cardioSuggestion(runs([20, 20], 'treadmill', { inclinePct: 5 }), 'treadmill')!.text).toBe('Try 21 minutes today');
  });

  it('warm-up walks are not cardio walks', () => {
    const s = session('w', '2026-06-01', [{ kind: 'warmup', activityId: 'walking', log: { durationMin: 5 }, doneAt: at('2026-06-01') }]);
    expect(lastActivity([s], 'walking', 'cardio')).toBeUndefined();
    expect(lastActivity([s], 'walking', 'warmup')!.metrics).toEqual({ durationMin: 5 });
  });

  it('the workout in progress (not finished) is not "last time"', () => {
    const live = { ...runs([20])[0], finishedAt: undefined };
    expect(lastActivity([live], 'treadmill', 'cardio')).toBeUndefined();
  });
});

describe('cardio statistics and display', () => {
  const sessions = [
    session('a', '2026-06-01', [cardio('treadmill', { durationMin: 20, distanceKm: 3 }), cardio('rowing', { durationMin: 10, distanceKm: 2 })]),
    session('b', '2026-06-03', [cardio('running', { durationMin: 35, distanceKm: 6.5 }), { kind: 'warmup', activityId: 'running', log: { durationMin: 5, distanceKm: 1 }, doneAt: at('2026-06-03') }]),
    session('c', '2026-06-05', [cardio('treadmill', { durationMin: 25 }), cardio('other', { durationMin: 15 }, { name: 'Boxing' })]),
  ];

  it('totals cardio only (warm-ups excluded); running distance is running + treadmill', () => {
    expect(cardioStats(sessions)).toEqual({
      sessions: 5, totalMinutes: 105, runningKm: 9.5,
      longest: { name: 'Running', minutes: 35 }, mostFrequent: { name: 'Treadmill', count: 2 },
    });
    expect(cardioStats([]).longest).toBeNull();
  });

  it('history lines show only what the workout has', () => {
    expect(historyLine(sessions[0])).toBe('30 min cardio');
    expect(historyLine(session('m', '2026-06-01', [strength('2026-06-01', 60, [10, 10]), cardio('running', { durationMin: 25 })]))).toBe('1 exercise · 2 sets · 25 min cardio');
    expect(historyLine(session('p', '2026-06-01', [strength('2026-06-01', 60, [10])]))).toBe('1 exercise · 1 set');
    expect(cardioMinutes(sessions[1])).toBe(35);
  });

  it('formats metrics in the user\'s units', () => {
    expect(formatMetrics({ durationMin: 20, inclinePct: 5, speedKmh: 6.5 }, 'treadmill')).toBe('20 min · 6.5 km/h · 5% incline');
    expect(formatMetrics({ durationMin: 10, distanceKm: 2 }, 'rowing')).toContain('2,000 m');
    expect(formatMetrics({ durationMin: 30, distanceKm: 5 }, 'running')).toContain('/km');
    setUnits('lb');
    try {
      expect(formatMetrics({ distanceKm: 1.609344 }, 'running')).toContain('1 mi');
    } finally { setUnits('kg'); }
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(125)).toBe('2 h 5 min');
  });

  it('keeps only known, sane metrics', () => {
    expect(cleanMetrics({ durationMin: 20, inclinePct: -3, calories: 1e9, bogus: 4 } as never)).toEqual({ durationMin: 20 });
    expect(cleanMetrics({})).toBeUndefined();
    expect(activityById('nope').id).toBe('other');
  });
});
