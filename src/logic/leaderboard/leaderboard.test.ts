/** Leaderboard score (healthy limits) and ranking. 2026-06-01 is a Monday. */
import { describe, expect, it } from 'vitest';
import { createSampleData } from '../../data/seed';
import type { WorkoutSession } from '../../types';
import { COMMUNITY_ACHIEVEMENTS } from '../game/achievements';
import { GAME_CONFIG } from '../game/config';
import { buildProgress, type SessionProgress } from '../game/progress';
import { EMPTY_RECORD, insights, publicName, rankBoard, rankChange, type Competitor } from './rank';
import { countedDaysThisWeek, dailyPoints, dayKey, periodPoints, periodStart } from './score';

/** Workouts [local date-time, xp] and a progress replay that says each one earned that XP. */
function workouts(rows: [string, number][]) {
  const sessions: WorkoutSession[] = rows.map(([at, _xp], i) => {
    const iso = new Date(at).toISOString();
    return { id: `s${i}`, name: 'W', startedAt: iso, finishedAt: iso, entries: [] };
  });
  const bySession = new Map(rows.map(([, xp], i) => [`s${i}`, { xp } as SessionProgress]));
  return { sessions, progress: { bySession } };
}

describe('leaderboard score', () => {
  it('is the XP earned per day', () => {
    const { sessions, progress } = workouts([['2026-06-01T18:00', 60], ['2026-06-03T07:00', 35], ['2026-06-03T19:00', 10]]);
    expect(dailyPoints(progress, sessions)).toEqual([{ day: '2026-06-01', points: 60 }, { day: '2026-06-03', points: 45 }]);
  });

  it('counts only the first 5 training days of a week: a 6th and 7th day add nothing', () => {
    const week = ['01', '02', '03', '04', '05', '06', '07'].map((d) => [`2026-06-${d}T18:00`, 40] as [string, number]);
    const { sessions, progress } = workouts([...week, ['2026-06-08T18:00', 40]]);
    const days = dailyPoints(progress, sessions);
    expect(days.map((d) => d.day)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-08']);
    expect(periodPoints(days, 'week', new Date('2026-06-07T20:00'))).toBe(5 * 40);
    // A new week starts fresh.
    expect(periodPoints(days, 'week', new Date('2026-06-08T20:00'))).toBe(40);
    expect(countedDaysThisWeek(days, new Date('2026-06-07T20:00'))).toBe(GAME_CONFIG.leaderboard.maxDaysPerWeek);
  });

  it('a day without XP does not use up one of the 5 days', () => {
    const { sessions, progress } = workouts([
      ['2026-06-01T18:00', 0], ['2026-06-02T18:00', 10], ['2026-06-03T18:00', 10], ['2026-06-04T18:00', 10],
      ['2026-06-05T18:00', 10], ['2026-06-06T18:00', 10],
    ]);
    expect(dailyPoints(progress, sessions)).toHaveLength(5);
  });

  it('caps one day at 300', () => {
    const { sessions, progress } = workouts([['2026-06-01T08:00', 250], ['2026-06-01T18:00', 250]]);
    expect(dailyPoints(progress, sessions)).toEqual([{ day: '2026-06-01', points: GAME_CONFIG.leaderboard.maxDailyPoints }]);
  });

  it('ignores workouts in progress and anything the replay did not score', () => {
    const { sessions, progress } = workouts([['2026-06-01T18:00', 50]]);
    const inProgress: WorkoutSession = { id: 'live', name: 'W', startedAt: new Date('2026-06-01T19:00').toISOString(), entries: [] };
    expect(dailyPoints(progress, [...sessions, inProgress])).toEqual([{ day: '2026-06-01', points: 50 }]);
  });

  it('deleting a workout lowers the score (it is derived, nothing is stored)', () => {
    const { sessions, progress } = workouts([['2026-06-01T18:00', 50], ['2026-06-02T18:00', 30]]);
    expect(periodPoints(dailyPoints(progress, sessions), 'all')).toBe(80);
    expect(periodPoints(dailyPoints(progress, sessions.slice(1)), 'all')).toBe(30);
  });

  it('periods: Monday-based weeks, calendar months, and "as of yesterday"', () => {
    expect(periodStart('week', new Date('2026-06-07T23:00'))).toBe('2026-06-01'); // Sunday → Monday
    expect(periodStart('week', new Date('2026-06-01T00:30'))).toBe('2026-06-01');
    expect(periodStart('month', new Date('2026-06-17T12:00'))).toBe('2026-06-01');
    expect(periodStart('all')).toBeNull();
    const days = [{ day: '2026-05-31', points: 10 }, { day: '2026-06-01', points: 20 }, { day: '2026-06-02', points: 30 }];
    const today = new Date('2026-06-02T12:00');
    expect(periodPoints(days, 'week', today)).toBe(50);
    expect(periodPoints(days, 'week', today, true)).toBe(20);
    expect(periodPoints(days, 'month', today)).toBe(50);
    expect(periodPoints(days, 'all', today)).toBe(60);
    expect(dayKey(new Date('2026-06-02T23:59'))).toBe('2026-06-02');
  });

  it('works on the real replay (sample data): points follow XP and stay within the limits', () => {
    const data = createSampleData();
    const progress = buildProgress(data.sessions, data.exercises);
    const days = dailyPoints(progress, data.sessions);
    const total = periodPoints(days, 'all');
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(progress.totalXp);
    expect(days.every((d) => d.points > 0 && d.points <= GAME_CONFIG.leaderboard.maxDailyPoints)).toBe(true);
  });
});

const person = (id: string, points: number, previousPoints = points, visible = true): Competitor => ({ id, name: id, visible, points, previousPoints });

describe('ranking', () => {
  it('ranks by points; ties share a rank', () => {
    const r = rankBoard([person('a', 50), person('b', 80), person('c', 50), person('d', 10)], 'd', 'week');
    expect(r.top.map((x) => [x.rank, x.name])).toEqual([[1, 'b'], [2, 'a'], [2, 'c'], [4, 'd']]);
    expect(r.me).toMatchObject({ rank: 4, points: 10, visible: true });
    expect(r.participants).toBe(4);
  });

  it('always shows your own position: the leaders, then the person above you, you and the person below', () => {
    const people = Array.from({ length: 300 }, (_, i) => person(`u${i}`, 1000 - i * 3));
    const r = rankBoard(people, 'u246', 'week');
    expect(r.top.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(r.around.map((x) => [x.rank, x.me])).toEqual([[246, false], [247, true], [248, false]]);
    expect(r.me.rank).toBe(247);
  });

  it('in the top 5 you are simply highlighted there', () => {
    const r = rankBoard([person('a', 50), person('me', 40), person('c', 30)], 'me', 'week');
    expect(r.top.find((x) => x.me)?.rank).toBe(2);
    expect(r.around).toEqual([]);
  });

  it('the last place has nobody below', () => {
    const people = Array.from({ length: 20 }, (_, i) => person(`u${i}`, 100 - i));
    expect(rankBoard(people, 'u19', 'all').around.map((x) => x.rank)).toEqual([19, 20]);
  });

  it('places moved since yesterday', () => {
    const up = rankBoard([person('a', 50, 50), person('b', 40, 45), person('me', 45, 30)], 'me', 'week');
    expect(rankChange(up.me)).toBe(1);
    const down = rankBoard([person('a', 60, 20), person('me', 30, 30)], 'me', 'week');
    expect(rankChange(down.me)).toBe(-1);
    const same = rankBoard([person('a', 60, 50), person('me', 30, 30)], 'me', 'week');
    expect(rankChange(same.me)).toBe(0);
    const fresh = rankBoard([person('a', 60, 50), person('me', 30, 0)], 'me', 'week');
    expect(rankChange(fresh.me)).toBeNull();
  });

  it('hidden people never appear and are not counted; a hidden user gets no rank', () => {
    const r = rankBoard([person('a', 90, 90, false), person('b', 50), person('me', 40)], 'me', 'week');
    expect(r.top.map((x) => x.name)).toEqual(['b', 'me']);
    expect(r.participants).toBe(2);
    expect(r.me.rank).toBe(2);
    const hiddenMe = rankBoard([person('b', 50), person('me', 40, 40, false)], 'me', 'week');
    expect(hiddenMe.me).toEqual({ visible: false, rank: null, points: 0, previousRank: null });
    expect(hiddenMe.top.some((x) => x.me)).toBe(false);
  });

  it('nobody with 0 points is listed', () => {
    const r = rankBoard([person('a', 20), person('me', 0)], 'me', 'week');
    expect(r.me.rank).toBeNull();
    expect(r.participants).toBe(1);
  });

  it('never shows anything that looks like an email', () => {
    expect(publicName('alex@example.com')).toBe('Gym member');
    expect(publicName('  ')).toBe('Gym member');
    expect(publicName('GymBeast92')).toBe('GymBeast92');
    const r = rankBoard([{ ...person('a', 20), name: 'a@b.co' }], 'x', 'week');
    expect(r.top[0].name).toBe('Gym member');
  });

  it('insights: XP to the next place and the top percentage', () => {
    const people = Array.from({ length: 200 }, (_, i) => person(`u${i}`, 1000 - i * 5));
    const r = rankBoard(people, 'u19', 'week');
    expect(insights(r)).toEqual({ toNextPlace: 6, nextRank: 19, topPercent: 10 });
    expect(insights(rankBoard(people, 'u0', 'week')).toNextPlace).toBeNull();
  });
});

describe('community achievements (recognition only)', () => {
  const unlocked = (bestWeeklyRank: number | null) => COMMUNITY_ACHIEVEMENTS.filter((a) => a.test({ ...EMPTY_RECORD, bestWeeklyRank })).map((a) => a.id);
  it('come from your best finished week', () => {
    expect(unlocked(null)).toEqual([]);
    expect(unlocked(247)).toEqual([]);
    expect(unlocked(80)).toEqual(['lb-top-100']);
    expect(unlocked(9)).toEqual(['lb-top-100', 'lb-top-50', 'lb-top-10']);
    expect(unlocked(1)).toHaveLength(5);
  });
  it('give no XP', () => {
    expect(GAME_CONFIG.leaderboard.rewardXp).toBe(0);
  });
});
