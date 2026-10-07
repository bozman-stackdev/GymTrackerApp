/**
 * React glue for the community leaderboard (docs/LEADERBOARD.md).
 *
 * Publishing: after each successful sync (the phone's data then matches the account), the leaderboard points per
 * day are worked out from the history (logic/leaderboard/score.ts) and only the days that changed are sent. Never for
 * sample data, and never while the user is hidden.
 *
 * Fetching: when a board is opened (if older than a minute), after publishing (a finished workout, edited history),
 * on Refresh, and when the app returns to the foreground (that triggers a sync, which ends here). No polling.
 * The last result is kept on this phone, so the board shows instantly (and offline, marked as such).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EMPTY_RECORD, type LeaderboardRecord, type LeaderboardResult } from '../logic/leaderboard/rank';
import { dailyPoints, dayKey, type DayPoints, type LeaderboardPeriod } from '../logic/leaderboard/score';
import { BackendError, type PublicProfile } from '../services/backend';
import { useAccount } from './account';
import { useAppState } from './store';
import { progressFor } from './useProgress';

export const LEADERBOARD_TIMING = { staleMs: 60_000 };

export interface Board { result: LeaderboardResult; fetchedAt: number }

export interface LeaderboardApi {
  /** Accounts exist in this version of the app (otherwise nothing about the leaderboard is shown). */
  available: boolean;
  /** 'signed-out': show "Sign up to compete"; 'loading': account or profile still being checked. */
  state: 'signed-out' | 'loading' | 'ready';
  profile: PublicProfile | null;
  boards: Partial<Record<LeaderboardPeriod, Board>>;
  record: LeaderboardRecord;
  /** Set when the last fetch failed (the boards above are then the last known ones). */
  error: string | null;
  busy: boolean;
  /** Fetches a board if it's missing or older than a minute (`force`: always). */
  load(period: LeaderboardPeriod, force?: boolean): Promise<void>;
  setVisible(visible: boolean): Promise<void>;
  setDisplayName(name: string): Promise<void>;
}

interface Saved { profile: PublicProfile | null; boards: LeaderboardApi['boards']; record: LeaderboardRecord }

const cacheKey = (accountId: string) => `gymtracker:leaderboard:${accountId}`;
const publishedKey = (accountId: string) => `gymtracker:leaderboard-published:${accountId}`;

function readJson<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; }
}
function writeJson(key: string, value: unknown): void {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: only a cache */ }
}

/** What to send: changed or new days, and days that no longer have points. */
export function leaderboardDiff(days: DayPoints[], published: Record<string, number>): { upserts: DayPoints[]; removes: string[] } {
  const now = new Set(days.map((d) => d.day));
  return {
    upserts: days.filter((d) => published[d.day] !== d.points),
    removes: Object.keys(published).filter((day) => !now.has(day)),
  };
}

export const DISPLAY_NAME_MAX = 30;
/** Problem with a public display name, or null. */
export function displayNameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return 'At least 2 characters';
  if (n.length > DISPLAY_NAME_MAX) return `At most ${DISPLAY_NAME_MAX} characters`;
  if (n.includes('@')) return "Don't use your email address";
  return null;
}

const Ctx = createContext<LeaderboardApi | null>(null);

export function LeaderboardProvider({ children }: { children: ReactNode }) {
  const { data } = useAppState();
  const { available, account, status, backend } = useAccount();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [boards, setBoards] = useState<LeaderboardApi['boards']>({});
  const [record, setRecord] = useState<LeaderboardRecord>(EMPTY_RECORD);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dataRef = useRef(data);
  const boardsRef = useRef(boards);
  const profileRef = useRef(profile);
  const accountId = account?.id ?? null;
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { boardsRef.current = boards; }, [boards]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Another account (or none): start from what this phone last knew for it, so the board shows at once.
  const [owner, setOwner] = useState<string | null>(null);
  if (owner !== accountId) {
    const saved = accountId ? readJson<Saved>(cacheKey(accountId)) : null;
    setOwner(accountId);
    setProfile(saved?.profile ?? null);
    setBoards(saved?.boards ?? {});
    setRecord(saved?.record ?? EMPTY_RECORD);
    setError(null);
  }

  // Then check the public profile (name, visibility) with the server.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await (await backend()).getPublicProfile();
        if (!cancelled) setProfile(p);
      } catch (err) {
        if (!cancelled && !profileRef.current) setError(err instanceof BackendError ? err.message : "Couldn't load the leaderboard.");
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, backend]);

  // Keep the last result on this phone.
  useEffect(() => {
    if (accountId && profile) writeJson(cacheKey(accountId), { profile, boards, record } satisfies Saved);
  }, [accountId, profile, boards, record]);

  const fetchBoard = useCallback(async (period: LeaderboardPeriod) => {
    if (!accountId) return;
    setBusy(true);
    try {
      const b = await backend();
      const today = dayKey(new Date());
      const [result, rec] = await Promise.all([b.leaderboard(period, today), b.leaderboardRecord(today)]);
      setBoards((s) => ({ ...s, [period]: { result, fetchedAt: Date.now() } }));
      setRecord(rec);
      setError(null);
    } catch (err) {
      setError(err instanceof BackendError ? err.message : "Couldn't load the leaderboard.");
    } finally {
      setBusy(false);
    }
  }, [accountId, backend]);

  const load = useCallback(async (period: LeaderboardPeriod, force = false) => {
    const board = boardsRef.current[period];
    if (!force && board && Date.now() - board.fetchedAt < LEADERBOARD_TIMING.staleMs) return;
    await fetchBoard(period);
  }, [fetchBoard]);

  /** Sends changed days. Returns true if anything was sent. */
  const publish = useCallback(async (): Promise<boolean> => {
    const d = dataRef.current;
    if (!accountId || !d || d.isSample || !profileRef.current?.leaderboardVisible) return false;
    const days = dailyPoints(progressFor(d.sessions, d.exercises), d.sessions);
    const published = readJson<Record<string, number>>(publishedKey(accountId));
    const b = await backend();
    if (!published) {
      // First time on this phone: replace whatever is on the server (another phone may have published older days).
      await b.clearLeaderboard();
      await b.publishLeaderboard(days, []);
    } else {
      const { upserts, removes } = leaderboardDiff(days, published);
      if (!upserts.length && !removes.length) return false;
      await b.publishLeaderboard(upserts, removes);
    }
    writeJson(publishedKey(accountId), Object.fromEntries(days.map((x) => [x.day, x.points])));
    return true;
  }, [accountId, backend]);

  // After every successful sync: publish what changed, then refresh the boards that are open or out of date.
  const lastSyncAt = status.state === 'idle' ? status.lastSyncAt : null;
  const visible = profile?.leaderboardVisible;
  useEffect(() => {
    if (!lastSyncAt || visible === undefined) return;
    let cancelled = false;
    void (async () => {
      let sent = false;
      try { sent = await publish(); } catch (err) { console.error('Leaderboard publish failed', err); }
      if (cancelled) return;
      const periods = Object.keys(boardsRef.current) as LeaderboardPeriod[];
      for (const p of periods.length ? periods : (['week'] as LeaderboardPeriod[])) await load(p, sent);
    })();
    return () => { cancelled = true; };
  }, [lastSyncAt, visible, publish, load]);

  const setVisible = useCallback(async (v: boolean) => {
    if (!accountId) return;
    const b = await backend();
    if (!v) {
      // Off: stop publishing at once (a sync finishing meanwhile must not send points again), then remove the points
      // from the server before hiding, so nothing of this account stays public.
      if (profileRef.current) profileRef.current = { ...profileRef.current, leaderboardVisible: false };
      await b.clearLeaderboard();
      writeJson(publishedKey(accountId), null);
    }
    const p = await b.updatePublicProfile({ leaderboardVisible: v });
    profileRef.current = p;
    setProfile(p);
    if (v) await publish();
    await Promise.all((Object.keys(boardsRef.current).length ? Object.keys(boardsRef.current) as LeaderboardPeriod[] : ['week' as const]).map((x) => fetchBoard(x)));
  }, [accountId, backend, publish, fetchBoard]);

  const setDisplayName = useCallback(async (name: string) => {
    const problem = displayNameProblem(name);
    if (problem) throw new BackendError(problem);
    const p = await (await backend()).updatePublicProfile({ displayName: name.trim() });
    setProfile(p);
    await Promise.all((Object.keys(boardsRef.current) as LeaderboardPeriod[]).map((x) => fetchBoard(x)));
  }, [backend, fetchBoard]);

  const state: LeaderboardApi['state'] = account === null ? 'signed-out' : account === undefined || !profile ? 'loading' : 'ready';
  const value = useMemo<LeaderboardApi>(() => ({
    available, state, profile, boards, record, error, busy, load, setVisible, setDisplayName,
  }), [available, state, profile, boards, record, error, busy, load, setVisible, setDisplayName]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLeaderboard(): LeaderboardApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useLeaderboard must be used inside <LeaderboardProvider>');
  return api;
}

/** A board, fetched when shown (if it's missing or more than a minute old). */
export function useBoard(period: LeaderboardPeriod): Board | undefined {
  const lb = useLeaderboard();
  const { state, load } = lb;
  useEffect(() => { if (state === 'ready') void load(period); }, [state, period, load]);
  return lb.boards[period];
}
