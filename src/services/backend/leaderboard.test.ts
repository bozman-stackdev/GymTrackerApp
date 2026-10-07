/** The fake backend's leaderboard (same rules as supabase/schema.sql) and its development scenarios. */
import { describe, expect, it } from 'vitest';
import { dayKey } from '../../logic/leaderboard/score';
import { memoryBackend, memoryServer } from './memory';
import { mockCommunity } from './mockCommunity';
import type { Backend, DevScenario } from './types';

const today = dayKey(new Date());
const yesterday = dayKey(new Date(Date.now() - 86_400_000));

async function phone(server = memoryServer(), name = 'Alex', leaderboard = true): Promise<Backend> {
  const b = memoryBackend(server);
  await b.signUp(`${name.toLowerCase()}@x.com`, 'secret-pass', name, leaderboard);
  return b;
}

describe('fake backend leaderboard', () => {
  it('real accounts only (empty scenario): ranks, names, privacy', async () => {
    const server = memoryServer();
    const alex = await phone(server, 'Alex');
    const sam = await phone(server, 'Sam');
    const hidden = await phone(server, 'Hidden', false);
    alex.dev!.setScenario('empty');
    await alex.publishLeaderboard([{ day: today, points: 80 }], []);
    await sam.publishLeaderboard([{ day: today, points: 120 }], []);
    await hidden.publishLeaderboard([{ day: today, points: 300 }], []);
    const board = await alex.leaderboard('week', today);
    expect(board.top.map((r) => [r.rank, r.name, r.points, r.me])).toEqual([[1, 'Sam', 120, false], [2, 'Alex', 80, true]]);
    expect(board.participants).toBe(2);
    expect(JSON.stringify(board)).not.toContain('@');
    expect((await hidden.leaderboard('week', today)).me).toEqual({ visible: false, rank: null, points: 0, previousRank: null });
  });

  it('visibility and display name live in the public profile', async () => {
    const b = await phone(memoryServer(), 'Alex', false);
    expect(await b.getPublicProfile()).toEqual({ displayName: 'Alex', leaderboardVisible: false });
    expect(await b.updatePublicProfile({ leaderboardVisible: true, displayName: 'GymBeast92' })).toEqual({ displayName: 'GymBeast92', leaderboardVisible: true });
    await expect(b.updatePublicProfile({ displayName: 'me@x.com' })).rejects.toThrow('email');
  });

  it('rejects points the real server would reject', async () => {
    const b = await phone();
    await expect(b.publishLeaderboard([{ day: today, points: 301 }], [])).rejects.toThrow();
    await expect(b.publishLeaderboard([{ day: '2999-01-01', points: 10 }], [])).rejects.toThrow('future');
  });

  it('removing days and clearing', async () => {
    const b = await phone();
    b.dev!.setScenario('empty');
    await b.publishLeaderboard([{ day: today, points: 50 }, { day: yesterday, points: 20 }], []);
    expect((await b.leaderboard('all', today)).me.points).toBe(70);
    await b.publishLeaderboard([], [yesterday]);
    expect((await b.leaderboard('all', today)).me.points).toBe(50);
    await b.clearLeaderboard();
    expect((await b.leaderboard('all', today)).me.rank).toBeNull();
  });

  it('deleting the account removes its points', async () => {
    const server = memoryServer();
    const a = await phone(server, 'Alex');
    const s = await phone(server, 'Sam');
    a.dev!.setScenario('empty');
    await a.publishLeaderboard([{ day: today, points: 50 }], []);
    await a.deleteAccount();
    expect((await s.leaderboard('all', today)).participants).toBe(0);
  });

  it('the mock community is realistic and within the healthy limits', () => {
    const people = mockCommunity(today);
    expect(people.length).toBe(300);
    const all = people.flatMap((p) => [...p.days.values()]);
    expect(Math.max(...all)).toBeLessThanOrEqual(300);
    expect(new Set(people.map((p) => p.name)).size).toBeGreaterThan(60);
    expect(mockCommunity(today)).toBe(people); // cached, deterministic
  });
});

describe('development scenarios', () => {
  async function scenario(s: DevScenario) {
    const b = await phone();
    await b.publishLeaderboard([{ day: today, points: 90 }, { day: yesterday, points: 40 }], []);
    b.dev!.setScenario(s);
    return { board: await b.leaderboard('week', today), record: await b.leaderboardRecord(today) };
  }

  it.each<[DevScenario, number | null, number | null]>([
    ['first', 1, 2], ['top10', 7, 9], ['top100', 64, 71], ['movingUp', 24, 27], ['movingDown', 27, 25],
  ])('%s → #%s (yesterday #%s)', async (s, rank, previous) => {
    const { board } = await scenario(s);
    expect(board.me.rank).toBe(rank);
    expect(board.me.previousRank).toBe(previous);
    expect(board.top).toHaveLength(5);
    if (rank! > 5) expect(board.around.find((r) => r.me)?.rank).toBe(rank);
  });

  it('near the bottom: you are shown, with one person below', async () => {
    const { board } = await scenario('bottom');
    expect(board.me.rank).toBeGreaterThan(board.participants - 5);
    expect(board.around.map((r) => r.me)).toEqual([false, true, false]);
  });

  it('no activity: on nobody\'s board, not even your own', async () => {
    const { board } = await scenario('noActivity');
    expect(board.me).toMatchObject({ visible: true, rank: null });
    expect(board.participants).toBeGreaterThan(0);
  });

  it('visibility off', async () => {
    const { board } = await scenario('hidden');
    expect(board.me.visible).toBe(false);
    expect(board.top.some((r) => r.me)).toBe(false);
  });

  it('badges in the scenarios that have them; otherwise the real finished weeks', async () => {
    expect((await scenario('first')).record.bestWeeklyRank).toBe(1);
    expect((await scenario('top10')).record.bestWeeklyRank).toBe(7);
    // Default: Alex has points only this week (not finished yet) → no record.
    expect((await scenario('default')).record.bestWeeklyRank).toBeNull();
  });

  it('default: you are ranked among ~300 people', async () => {
    const { board } = await scenario('default');
    expect(board.participants).toBeGreaterThan(150);
    expect(board.me.rank).toBeGreaterThan(0);
  });
});
