/**
 * A fake backend with the same behaviour as the real one, for tests. Never used in the published app.
 * - Unit tests: `memoryServer()` shared by several "phones" (`memoryBackend(server)`).
 * - End-to-end tests (VITE_BACKEND=fake): the server lives in localStorage, so it survives reloads and can be
 *   copied into another browser to play "second phone". Confirmation and reset codes are always 123456.
 */
import { GAME_CONFIG } from '../../logic/game/config';
import { EMPTY_RECORD, rankBoard, type Competitor } from '../../logic/leaderboard/rank';
import { periodStart } from '../../logic/leaderboard/score';
import { mockCompetitors, mockCommunity, SCENARIOS, scenarioRecord } from './mockCommunity';
import {
  BackendError, OFFLINE_MESSAGE, type Account, type Backend, type DevScenario, type LeaderboardRecord, type RecordRef, type RemoteRecord, type SyncRecord,
} from './types';

interface StoredUser extends Account { password: string; confirmed: boolean; leaderboardVisible?: boolean }
interface ServerData {
  users: StoredUser[];
  records: (RemoteRecord & { userId: string })[];
  lastTime: number;
  /** Leaderboard points per day (like the real leaderboard_days table). */
  days?: { userId: string; day: string; points: number }[];
  /** Development: which mock leaderboard to show (see mockCommunity.ts). */
  scenario?: DevScenario;
}

export interface MemoryServer {
  read(): ServerData;
  write(data: ServerData): void;
  /** Simulates the server being unreachable. */
  offline?: boolean;
}

export const FAKE_CODE = '123456';
const emptyServer = (): ServerData => ({ users: [], records: [], lastTime: 0 });

export function memoryServer(options: { confirmEmail?: boolean } = {}): MemoryServer & { confirmEmail: boolean } {
  let data = emptyServer();
  return { read: () => data, write: (d) => { data = d; }, confirmEmail: options.confirmEmail ?? false };
}

export function localStorageServer(key = 'gymtracker:fake-server'): MemoryServer & { confirmEmail: boolean } {
  return {
    read: () => { try { return JSON.parse(localStorage.getItem(key) ?? '') as ServerData; } catch { return emptyServer(); } },
    write: (d) => localStorage.setItem(key, JSON.stringify(d)),
    confirmEmail: true,
  };
}

/** One phone's connection. `session` remembers who is signed in on that phone. */
export function memoryBackend(
  server: MemoryServer & { confirmEmail?: boolean },
  session: { get(): string | null; set(id: string | null): void } = inMemorySession(),
): Backend {
  const listeners = new Set<(a: Account | null) => void>();
  const account = (u: StoredUser): Account => ({ id: u.id, email: u.email, displayName: u.displayName });
  const reachable = () => { if (server.offline) throw new BackendError(OFFLINE_MESSAGE); };
  const signedIn = (u: StoredUser) => { session.set(u.id); listeners.forEach((l) => l(account(u))); return account(u); };
  const me = () => {
    const id = session.get();
    const u = server.read().users.find((x) => x.id === id);
    if (!u) throw new BackendError('Please log in again.');
    return u;
  };
  const find = (email: string) => server.read().users.find((u) => u.email === email.trim().toLowerCase());
  const tick = (d: ServerData) => { d.lastTime = Math.max(Date.now(), d.lastTime + 1); return new Date(d.lastTime).toISOString(); };

  return {
    async currentAccount() {
      const u = server.read().users.find((x) => x.id === session.get());
      return u ? account(u) : null;
    },
    onAccountChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },

    async signUp(email, password, displayName, leaderboard = false) {
      reachable();
      if (find(email)) throw new BackendError("There's already an account with this email. Log in instead.");
      const d = server.read();
      const u: StoredUser = {
        id: `user-${d.users.length + 1}-${Date.now().toString(36)}`, email: email.trim().toLowerCase(), password,
        displayName: displayName.includes('@') ? 'Gym member' : displayName, confirmed: !server.confirmEmail, leaderboardVisible: leaderboard,
      };
      server.write({ ...d, users: [...d.users, u] });
      return u.confirmed ? { status: 'signed-in', account: signedIn(u) } : { status: 'check-email' };
    },
    async confirmSignUp(email, code) {
      reachable();
      const u = find(email);
      if (!u || code.trim() !== FAKE_CODE) throw new BackendError('That code is wrong or has expired.');
      const d = server.read();
      server.write({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, confirmed: true } : x)) });
      return signedIn({ ...u, confirmed: true });
    },
    async signIn(email, password) {
      reachable();
      const u = find(email);
      if (!u || u.password !== password) throw new BackendError('Email or password is wrong.');
      if (!u.confirmed) throw new BackendError('Confirm your email first: enter the code we sent you.');
      return signedIn(u);
    },
    async signOut() { session.set(null); listeners.forEach((l) => l(null)); },
    async sendPasswordReset(email) { reachable(); void email; /* always "sent", so nobody can test which emails exist */ },
    async resetPassword(email, code, newPassword) {
      reachable();
      const u = find(email);
      if (!u || code.trim() !== FAKE_CODE) throw new BackendError('That code is wrong or has expired.');
      const d = server.read();
      server.write({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, password: newPassword, confirmed: true } : x)) });
      return signedIn(u);
    },
    async deleteAccount() {
      reachable();
      const u = me();
      const d = server.read();
      server.write({ ...d, users: d.users.filter((x) => x.id !== u.id), records: d.records.filter((r) => r.userId !== u.id), days: (d.days ?? []).filter((x) => x.userId !== u.id) });
      session.set(null);
      listeners.forEach((l) => l(null));
    },

    async pull(since) {
      reachable();
      const u = me();
      const records = server.read().records
        .filter((r) => r.userId === u.id && (!since || r.updatedAt > since))
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .map(({ userId: _u, ...r }) => structuredClone(r));
      return { records, cursor: records.at(-1)?.updatedAt ?? since };
    },
    async push(upserts: SyncRecord[], deletes: RecordRef[]) {
      reachable();
      const u = me();
      const d = server.read();
      let records = d.records;
      const put = (kind: RemoteRecord['kind'], id: string, data: unknown, deleted: boolean) => {
        const row = { userId: u.id, kind, id, data: structuredClone(data), deleted, updatedAt: tick(d) };
        records = [...records.filter((r) => !(r.userId === u.id && r.kind === kind && r.id === id)), row];
      };
      for (const r of upserts) put(r.kind, r.id, r.data, false);
      for (const r of deletes) put(r.kind, r.id, null, true);
      server.write({ ...d, records });
    },

    async getPublicProfile() {
      reachable();
      const u = me();
      return { displayName: u.displayName, leaderboardVisible: !!u.leaderboardVisible };
    },
    async updatePublicProfile(change) {
      reachable();
      const u = me();
      if (change.displayName?.includes('@')) throw new BackendError("A display name can't be an email address.");
      const next = { ...u, ...(change.displayName !== undefined && { displayName: change.displayName.trim() || 'Gym member' }), ...(change.leaderboardVisible !== undefined && { leaderboardVisible: change.leaderboardVisible }) };
      const d = server.read();
      server.write({ ...d, users: d.users.map((x) => (x.id === u.id ? next : x)) });
      return { displayName: next.displayName, leaderboardVisible: !!next.leaderboardVisible };
    },
    async publishLeaderboard(days, removeDays) {
      reachable();
      const u = me();
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      for (const x of days) {
        if (!Number.isInteger(x.points) || x.points < 1 || x.points > GAME_CONFIG.leaderboard.maxDailyPoints) throw new BackendError(`Bad points ${x.points}`);
        if (x.day > tomorrow) throw new BackendError('leaderboard day in the future');
      }
      const d = server.read();
      const changed = new Set([...days.map((x) => x.day), ...removeDays]);
      const kept = (d.days ?? []).filter((x) => !(x.userId === u.id && changed.has(x.day)));
      server.write({ ...d, days: [...kept, ...days.map((x) => ({ userId: u.id, day: x.day, points: x.points }))] });
    },
    async clearLeaderboard() {
      reachable();
      const u = me();
      const d = server.read();
      server.write({ ...d, days: (d.days ?? []).filter((x) => x.userId !== u.id) });
    },
    async leaderboard(period, today) {
      reachable();
      const u = me();
      const d = server.read();
      const from = periodStart(period, new Date(`${today}T12:00:00`)) ?? '';
      const real: Competitor[] = d.users.map((x) => {
        const mine = (d.days ?? []).filter((y) => y.userId === x.id && y.day >= from && y.day <= today);
        return {
          id: x.id, name: x.displayName, visible: !!x.leaderboardVisible,
          points: mine.reduce((n, y) => n + y.points, 0), previousPoints: mine.filter((y) => y.day < today).reduce((n, y) => n + y.points, 0),
        };
      });
      return rankBoard(mockCompetitors(today, from, real, d.scenario ?? 'default', u.id), u.id, period, GAME_CONFIG.leaderboard.topRows);
    },
    async leaderboardRecord(today) {
      reachable();
      const u = me();
      const d = server.read();
      const forced = scenarioRecord(d.scenario ?? 'default');
      if (forced) return forced;
      // Final ranks in finished weeks (before this week's Monday), like the SQL function.
      const thisWeek = periodStart('week', new Date(`${today}T12:00:00`))!;
      const weekOf = (day: string) => periodStart('week', new Date(`${day}T12:00:00`))!;
      const totals = new Map<string, Map<string, number>>(); // week → person → points
      const add = (person: string, day: string, points: number) => {
        if (day >= thisWeek) return;
        const w = weekOf(day);
        if (!totals.has(w)) totals.set(w, new Map());
        totals.get(w)!.set(person, (totals.get(w)!.get(person) ?? 0) + points);
      };
      const visible = new Set(d.users.filter((x) => x.leaderboardVisible).map((x) => x.id));
      for (const x of d.days ?? []) if (visible.has(x.userId)) add(x.userId, x.day, x.points);
      if (d.scenario !== 'empty') for (const p of mockCommunity(today)) for (const [day, points] of p.days) add(p.id, day, points);
      const record: LeaderboardRecord = structuredClone(EMPTY_RECORD);
      for (const week of totals.values()) {
        const mine = week.get(u.id);
        if (!mine) continue;
        const rank = 1 + [...week.values()].filter((v) => v > mine).length;
        record.bestWeeklyRank = Math.min(record.bestWeeklyRank ?? rank, rank);
        if (rank === 1) record.podiums.first++;
        if (rank === 2) record.podiums.second++;
        if (rank === 3) record.podiums.third++;
      }
      return record;
    },
    dev: {
      scenarios: SCENARIOS,
      scenario: () => server.read().scenario ?? 'default',
      setScenario: (scenario) => server.write({ ...server.read(), scenario }),
    },
  };
}

function inMemorySession() {
  let id: string | null = null;
  return { get: () => id, set: (v: string | null) => { id = v; } };
}

export function localStorageSession(key = 'gymtracker:fake-session') {
  return {
    get: () => localStorage.getItem(key),
    set: (id: string | null) => (id ? localStorage.setItem(key, id) : localStorage.removeItem(key)),
  };
}
