/**
 * Ranking a leaderboard. The real server does the same in SQL (supabase/schema.sql, function `leaderboard`); this
 * version is used by the fake backend (tests, development) and is the reference for what the board shows.
 *
 * - Only people who chose to be visible, with points in the period, are ranked.
 * - Ties share a rank (1, 2, 2, 4).
 * - Only public fields leave the server: rank, display name, points.
 */
import type { LeaderboardPeriod } from './score';

export interface LeaderboardRow {
  rank: number;
  name: string;
  points: number;
  /** This row is the person asking. */
  me: boolean;
}

export interface LeaderboardResult {
  period: LeaderboardPeriod;
  /** How many people are on this board. */
  participants: number;
  /** The leaders. */
  top: LeaderboardRow[];
  /** The person just above you, you, and the person just below (rows already in `top` are left out). */
  around: LeaderboardRow[];
  me: {
    /** Whether you have chosen to appear on the leaderboard. */
    visible: boolean;
    /** null: not on this board (hidden, or no points in the period yet). */
    rank: number | null;
    points: number;
    /** Your rank at the end of yesterday (null if you weren't on the board then). */
    previousRank: number | null;
  };
}

export interface Competitor {
  id: string;
  name: string;
  visible: boolean;
  /** Points in the period, now and at the end of yesterday. */
  points: number;
  previousPoints: number;
}

/** A display name safe to show: never something that looks like an email address. */
export function publicName(name: string): string {
  const n = name.trim();
  return !n || n.includes('@') ? 'Gym member' : n.slice(0, 30);
}

function ranks(list: { id: string; points: number }[]): Map<string, number> {
  const sorted = list.filter((c) => c.points > 0).sort((a, b) => b.points - a.points);
  const out = new Map<string, number>();
  sorted.forEach((c, i) => out.set(c.id, i > 0 && c.points === sorted[i - 1].points ? out.get(sorted[i - 1].id)! : i + 1));
  return out;
}

export function rankBoard(competitors: Competitor[], meId: string, period: LeaderboardPeriod, topRows = 5): LeaderboardResult {
  const visible = competitors.filter((c) => c.visible);
  const now = ranks(visible);
  const before = ranks(visible.map((c) => ({ id: c.id, points: c.previousPoints })));
  const ordered = visible
    .filter((c) => now.has(c.id))
    .sort((a, b) => b.points - a.points || publicName(a.name).localeCompare(publicName(b.name)) || a.id.localeCompare(b.id));
  const row = (c: Competitor): LeaderboardRow => ({ rank: now.get(c.id)!, name: publicName(c.name), points: c.points, me: c.id === meId });

  const self = competitors.find((c) => c.id === meId);
  const index = ordered.findIndex((c) => c.id === meId);
  const top = ordered.slice(0, topRows).map(row);
  const around = index < topRows ? [] : ordered.slice(Math.max(topRows, index - 1), index + 2).map(row);
  return {
    period,
    participants: ordered.length,
    top,
    around,
    me: {
      visible: !!self?.visible,
      rank: now.get(meId) ?? null,
      points: self?.visible ? self.points : 0,
      previousRank: before.get(meId) ?? null,
    },
  };
}

/** Places moved since yesterday: positive = up. null when there's nothing to compare (new on the board). */
export function rankChange(r: LeaderboardResult['me']): number | null {
  return r.rank !== null && r.previousRank !== null ? r.previousRank - r.rank : null;
}

/** Extra insights (Premium): how far to the next place, and which top percentage you're in. */
export function insights(result: LeaderboardResult): { toNextPlace: number | null; nextRank: number | null; topPercent: number | null } {
  const { rank, points } = result.me;
  if (rank === null) return { toNextPlace: null, nextRank: null, topPercent: null };
  const above = [...result.top, ...result.around].filter((r) => r.rank < rank).sort((a, b) => b.rank - a.rank)[0];
  return {
    toNextPlace: above ? above.points - points + 1 : null,
    nextRank: above?.rank ?? null,
    topPercent: Math.max(1, Math.ceil((rank / result.participants) * 100)),
  };
}

/** Your finishes in completed weeks: the badges come from these. */
export interface LeaderboardRecord {
  /** Best final rank in any finished week (null: never ranked). */
  bestWeeklyRank: number | null;
  /** Finished weeks in 1st, 2nd and 3rd place. */
  podiums: { first: number; second: number; third: number };
}

export const EMPTY_RECORD: LeaderboardRecord = { bestWeeklyRank: null, podiums: { first: 0, second: 0, third: 0 } };
