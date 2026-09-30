/**
 * Where AppData lives. The app talks to a `DataStore`; today that's the browser's localStorage.
 *
 * To move to a backend or native storage, write another DataStore (e.g. SQLite / AsyncStorage / an API client)
 * and pass it to <StoreProvider store={...}>. Nothing else changes. (Native storage is async; see docs/ROADMAP.md.)
 */
import type { AppData } from '../types';
import { DataError, parseAppData } from './validate';

export type LoadResult =
  | { status: 'ok'; data: AppData }
  | { status: 'empty' } // first run
  | { status: 'unreadable'; error: string }; // corrupted; a backup copy of the raw data was kept

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface DataStore {
  load(): LoadResult;
  save(data: AppData): SaveResult;
  /** Called when the data was changed elsewhere (e.g. another browser tab). Returns an unsubscribe function. */
  subscribe(onExternalChange: (data: AppData) => void): () => void;
}

const KEY = 'gymtracker:data';

export function localStorageStore(storage: Storage = localStorage, key = KEY): DataStore {
  return {
    load() {
      const raw = storage.getItem(key);
      if (!raw) return { status: 'empty' };
      try {
        return { status: 'ok', data: parseAppData(JSON.parse(raw)) };
      } catch (err) {
        // Keep a copy so unreadable data is never silently lost when we save over it.
        try { storage.setItem(`${key}:backup-${Date.now()}`, raw); } catch { /* storage full: nothing more we can do */ }
        console.error('Could not read saved data', err);
        return { status: 'unreadable', error: err instanceof DataError ? err.message : 'The saved data could not be read.' };
      }
    },

    save(data) {
      try {
        storage.setItem(key, JSON.stringify(data));
        return { ok: true };
      } catch (err) {
        console.error('Could not save data', err);
        return { ok: false, error: 'Storage is full or blocked (private browsing?). Export a backup from Profile to be safe.' };
      }
    },

    subscribe(onExternalChange) {
      if (typeof window === 'undefined') return () => {};
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key || !e.newValue) return;
        try { onExternalChange(parseAppData(JSON.parse(e.newValue))); } catch { /* ignore a bad write from elsewhere */ }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

/** Ask the browser not to clear our data under storage pressure (best effort, silently ignored if unsupported). */
export function requestPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {});
}
