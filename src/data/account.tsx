/**
 * React glue for accounts: who is signed in on this phone, and background sync.
 *
 * Sync runs when the app opens, when it comes back to the foreground or online, after a change that the account
 * doesn't have yet (e.g. Finish Session), and on "Sync now". It never blocks the app: the phone is the working copy.
 * Sample data is never uploaded.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { accountsAvailable, BackendError, loadBackend, OFFLINE_MESSAGE, type Account, type Backend } from '../services/backend';
import { applyPatch, dataFromAccount, hasLocalChanges, loadSyncState, saveSyncState, syncOnce, type SyncState } from '../services/backend/sync';
import type { AppData } from '../types';
import { useAppState } from './store';

export type SyncStatus =
  | { state: 'idle' | 'syncing'; lastSyncAt: string | null }
  | { state: 'error'; lastSyncAt: string | null; message: string };

export interface AccountApi {
  /** False when the app was built without a backend: no account features are shown. */
  available: boolean;
  /** undefined while checking for a saved login. */
  account: Account | null | undefined;
  status: SyncStatus;
  backend(): Promise<Backend>;
  /** After signing in or up: brings the account's data onto this phone (replacing sample data) and syncs. */
  connect(account: Account): Promise<void>;
  syncNow(): Promise<void>;
  /** This phone only. Its data stays here. */
  logOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

export const SYNC_TIMING = { afterChangeMs: 2000, minForegroundGapMs: 60_000 };

const AccountContext = createContext<AccountApi | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { data, update, replace } = useAppState();
  const [account, setAccount] = useState<Account | null | undefined>(accountsAvailable ? undefined : null);
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle', lastSyncAt: null });
  const dataRef = useRef<AppData | null>(data);
  const syncState = useRef<SyncState | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const lastSyncMs = useRef(0);

  useEffect(() => { dataRef.current = data; }, [data]);

  const backend = useCallback(async () => {
    const b = await loadBackend();
    if (!b) throw new BackendError('Accounts are not available in this version of the app.');
    return b;
  }, []);

  const runSync = useCallback(async (): Promise<void> => {
    if (running.current) { again.current = true; return running.current; }
    const job = (async () => {
      do {
        again.current = false;
        const state = syncState.current;
        if (!state || !dataRef.current || dataRef.current.isSample) return;
        if (navigator.onLine === false) { // don't even try; the "online" event syncs as soon as we're back
          setStatus((s) => ({ state: 'error', lastSyncAt: s.lastSyncAt, message: OFFLINE_MESSAGE }));
          return;
        }
        setStatus((s) => ({ state: 'syncing', lastSyncAt: s.lastSyncAt }));
        try {
          const result = await syncOnce(await backend(), () => dataRef.current!, state);
          if (syncState.current?.accountId !== state.accountId) return; // logged out meanwhile
          if (result.patch.length) {
            const next = applyPatch(dataRef.current!, result.patch);
            dataRef.current = next; // so a sync right after sees it too
            update((d) => applyPatch(d, result.patch));
          }
          syncState.current = result.state;
          saveSyncState(result.state);
          lastSyncMs.current = Date.now();
          setStatus({ state: 'idle', lastSyncAt: new Date().toISOString() });
        } catch (err) {
          console.error('Sync failed', err);
          const message = err instanceof BackendError ? err.message : "Couldn't sync. We'll try again later.";
          setStatus((s) => ({ state: 'error', lastSyncAt: s.lastSyncAt, message }));
          return;
        }
      } while (again.current);
    })();
    running.current = job;
    try { await job; } finally { running.current = null; }
  }, [backend, update]);

  const forget = useCallback(() => {
    syncState.current = null;
    saveSyncState(null);
    setAccount(null);
    setStatus({ state: 'idle', lastSyncAt: null });
  }, []);

  // On launch: is someone signed in on this phone? Then sync. Also follow sign-outs from elsewhere (expired login).
  useEffect(() => {
    if (!accountsAvailable) return;
    let unsubscribe = () => {};
    let cancelled = false;
    void (async () => {
      try {
        const b = await backend();
        const current = await b.currentAccount();
        if (cancelled) return;
        if (current) {
          syncState.current = loadSyncState(current.id);
          setAccount(current);
          void runSync();
        } else {
          setAccount(null);
        }
        unsubscribe = b.onAccountChange((a) => {
          if (!a && syncState.current) forget();
        });
      } catch (err) {
        console.error('Could not check the account', err);
        if (!cancelled) setAccount(null);
      }
    })();
    return () => { cancelled = true; unsubscribe(); };
  }, [backend, runSync, forget]);

  // Upload changes the account doesn't have yet, shortly after they happen (e.g. Finish Session, an edited set).
  useEffect(() => {
    if (!account || !data || data.isSample) return;
    const t = setTimeout(() => {
      const state = syncState.current;
      if (state && dataRef.current && hasLocalChanges(dataRef.current, state.synced)) void runSync();
    }, SYNC_TIMING.afterChangeMs);
    return () => clearTimeout(t);
  }, [data, account, runSync]);

  // Back online, or back in the foreground: pick up changes from other phones.
  useEffect(() => {
    if (!account) return;
    const online = () => void runSync();
    const visible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSyncMs.current > SYNC_TIMING.minForegroundGapMs) void runSync();
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', visible); };
  }, [account, runSync]);

  const connect = useCallback(async (a: Account) => {
    let start = dataRef.current;
    if (!start || start.isSample) start = await dataFromAccount(await backend(), a.displayName);
    // No name on this phone yet: use the account's display name (for "Hi Alex").
    if (!start.profile.name.trim() && a.displayName) start = { ...start, profile: { ...start.profile, name: a.displayName } };
    if (start !== dataRef.current) {
      dataRef.current = start;
      replace(start);
    }
    // A fresh start: everything is matched by id, so nothing is duplicated; the account's version wins where both have it.
    syncState.current = { accountId: a.id, cursor: null, synced: {} };
    saveSyncState(syncState.current);
    setAccount(a);
    await runSync();
  }, [backend, replace, runSync]);

  const logOut = useCallback(async () => {
    await (await backend()).signOut();
    forget();
  }, [backend, forget]);

  const deleteAccount = useCallback(async () => {
    await (await backend()).deleteAccount();
    forget();
  }, [backend, forget]);

  const value = useMemo<AccountApi>(() => ({
    available: accountsAvailable, account, status, backend, connect, syncNow: runSync, logOut, deleteAccount,
  }), [account, status, backend, connect, runSync, logOut, deleteAccount]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountApi {
  const api = useContext(AccountContext);
  if (!api) throw new Error('useAccount must be used inside <AccountProvider>');
  return api;
}

/** "just now", "5 min ago", "today 14:05", "12 Mar". */
export function syncedAgo(iso: string, now = new Date()): string {
  const ms = now.getTime() - Date.parse(iso);
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? `today ${time}` : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
