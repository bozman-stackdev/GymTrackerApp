/**
 * Mock leaderboard community for development and tests: ~300 made-up people training realistically (1–5 days a
 * week, ordinary XP per day). Used ONLY by the fake backend (memory.ts, VITE_BACKEND=fake), which is never part of the
 * published app. Deterministic: the same day always gives the same board.
 *
 * Dev scenarios reshape the board around your own score, to see every state of the UI (you at #1, in the top 10,
 * near the bottom, moving up or down, no activity, hidden).
 */
import { GAME_CONFIG } from '../../logic/game/config';
import { EMPTY_RECORD, type Competitor, type LeaderboardRecord } from '../../logic/leaderboard/rank';
import { dayKey, type DayPoints } from '../../logic/leaderboard/score';
import type { DevScenario } from './types';

export const SCENARIOS: { id: DevScenario; label: string }[] = [
  { id: 'default', label: 'Realistic community' },
  { id: 'first', label: 'You are #1' },
  { id: 'top10', label: 'You are in the top 10' },
  { id: 'top100', label: 'You are in the top 100' },
  { id: 'bottom', label: 'You are near the bottom' },
  { id: 'movingUp', label: 'You moved up' },
  { id: 'movingDown', label: 'You moved down' },
  { id: 'noActivity', label: 'No activity this period' },
  { id: 'hidden', label: 'Visibility off' },
  { id: 'empty', label: 'No mock users (real accounts only)' },
];

const SIZE = 300;
const HISTORY_DAYS = 420;
const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Robin', 'Charlie', 'Avery', 'Quinn',
  'Rowan', 'Kai', 'Noor', 'Mika', 'Sasha', 'Leah', 'Omar', 'Priya', 'Mateo', 'Yuki', 'Ines', 'Tomas', 'Zara', 'Felix'];
const HANDLES = ['GymBeast', 'StrongSam', 'IronWill', 'LiftLeah', 'RepQueen', 'SteadyEddie', 'PlateMate', 'BarbellBen',
  'KettleKat', 'DeadliftDan', 'SquatSquad', 'PumpPriya', 'RowRider', 'CoreCore', 'FlexFelix', 'GainTrain'];

/** Small fast hash → [0, 1). Same inputs, same number. */
function rand(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const c of parts.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function nameOf(i: number): string {
  const r = rand('name', i);
  if (r < 0.45) return `${HANDLES[i % HANDLES.length]}${10 + Math.floor(rand('n', i) * 89)}`;
  if (r < 0.75) return FIRST[i % FIRST.length];
  return `${FIRST[(i * 7) % FIRST.length]}${['', '_lifts', 'Trains', 'Fit'][i % 4]}`;
}

export interface MockPerson { id: string; name: string; days: Map<string, number> }

let cache: { today: string; people: MockPerson[] } | null = null;

/** The community as of `today` (YYYY-MM-DD): everyone's points per day, within the same limits as real users. */
export function mockCommunity(today: string): MockPerson[] {
  if (cache?.today === today) return cache.people;
  const end = new Date(`${today}T12:00:00`);
  const people: MockPerson[] = [];
  for (let i = 0; i < SIZE; i++) {
    const perWeek = 1 + Math.floor(rand('rate', i) ** 0.8 * 5); // 1–5 days a week
    const typical = 30 + Math.floor(rand('xp', i) * 110); // XP on a typical day
    const days = new Map<string, number>();
    let weekCount = 0;
    for (let d = HISTORY_DAYS; d >= 0; d--) {
      const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - d, 12);
      if (date.getDay() === 1) weekCount = 0;
      const day = dayKey(date);
      if (weekCount >= GAME_CONFIG.leaderboard.maxDaysPerWeek || rand('train', i, day) > perWeek / 7) continue;
      weekCount++;
      days.set(day, Math.min(GAME_CONFIG.leaderboard.maxDailyPoints, Math.round(typical * (0.5 + rand('pts', i, day)))));
    }
    people.push({ id: `mock-${i}`, name: nameOf(i), days });
  }
  cache = { today, people };
  return people;
}

const sum = (days: Map<string, number> | DayPoints[], from: string, to: string, beforeTo: boolean) => {
  let n = 0;
  for (const [day, points] of days instanceof Map ? days : days.map((d) => [d.day, d.points] as const)) {
    if (day >= from && (beforeTo ? day < to : day <= to)) n += points;
  }
  return n;
};

/** Competitors in a period: the mock community, plus the real accounts on the fake server. */
export function mockCompetitors(today: string, from: string, real: Competitor[], scenario: DevScenario, meId: string): Competitor[] {
  const mocks = scenario === 'empty' ? [] : mockCommunity(today).map((p): Competitor => ({
    id: p.id, name: p.name, visible: true, points: sum(p.days, from, today, false), previousPoints: sum(p.days, from, today, true),
  }));
  let all = [...mocks, ...real];
  const me = all.find((c) => c.id === meId);
  if (!me) return all;
  if (scenario === 'hidden') return all.map((c) => (c.id === meId ? { ...c, visible: false } : c));
  if (scenario === 'noActivity') return all.map((c) => (c.id === meId ? { ...c, points: 0, previousPoints: 0 } : c));
  const target: Partial<Record<DevScenario, [rank: number, previous: number]>> = {
    first: [1, 2], top10: [7, 9], top100: [64, 71], bottom: [mocks.length - 1, mocks.length - 3], movingUp: [24, 27], movingDown: [27, 25],
  };
  const t = target[scenario];
  if (!t || mocks.length === 0) return all;
  // Rebuild the others around you: (rank - 1) people above, everyone else below, steady gaps (no ties with you).
  const mine = Math.max(me.points, 40);
  const others = all.filter((c) => c.id !== meId).sort((a, b) => b.points - a.points);
  const pointsAt = (index: number, rank: number) => (index < rank - 1 ? mine + 6 * (rank - 1 - index) : Math.max(1, mine - 4 * (index - rank + 2)));
  all = others.map((c, i) => ({ ...c, points: pointsAt(i, t[0]), previousPoints: pointsAt(i, t[0]) }));
  // Yesterday, you were between the people at your previous rank.
  const prev = t[1] === 1 ? mine + 10 * 6 : pointsAt(t[1] - 2, t[0]) - 1;
  return [...all, { ...me, points: mine, previousPoints: prev }];
}

/** Badges for the scenarios that should show them; otherwise the record from the real ranking. */
export function scenarioRecord(scenario: DevScenario): LeaderboardRecord | null {
  if (scenario === 'first') return { bestWeeklyRank: 1, podiums: { first: 2, second: 1, third: 0 } };
  if (scenario === 'top10') return { bestWeeklyRank: 7, podiums: EMPTY_RECORD.podiums };
  if (scenario === 'top100') return { bestWeeklyRank: 64, podiums: EMPTY_RECORD.podiums };
  return null;
}
