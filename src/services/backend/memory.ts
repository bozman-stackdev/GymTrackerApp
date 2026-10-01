/**
 * A fake backend with the same behaviour as the real one, for tests. Never used in the published app.
 * - Unit tests: `memoryServer()` shared by several "phones" (`memoryBackend(server)`).
 * - End-to-end tests (VITE_BACKEND=fake): the server lives in localStorage, so it survives reloads and can be
 *   copied into another browser to play "second phone". Confirmation and reset codes are always 123456.
 */
import { BackendError, OFFLINE_MESSAGE, type Account, type Backend, type RecordRef, type RemoteRecord, type SyncRecord } from './types';

interface StoredUser extends Account { password: string; confirmed: boolean }
interface ServerData { users: StoredUser[]; records: (RemoteRecord & { userId: string })[]; lastTime: number }

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

    async signUp(email, password, displayName) {
      reachable();
      if (find(email)) throw new BackendError("There's already an account with this email. Log in instead.");
      const d = server.read();
      const u: StoredUser = { id: `user-${d.users.length + 1}-${Date.now().toString(36)}`, email: email.trim().toLowerCase(), password, displayName, confirmed: !server.confirmEmail };
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
      server.write({ ...d, users: d.users.filter((x) => x.id !== u.id), records: d.records.filter((r) => r.userId !== u.id) });
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
