/**
 * Which backend the app uses, decided at build time:
 *   - VITE_SUPABASE_URL + VITE_SUPABASE_KEY set → Supabase (see docs/ACCOUNTS.md);
 *   - VITE_BACKEND=fake → the fake backend (end-to-end tests only);
 *   - neither → no accounts: the app works exactly as before, on this phone only.
 * The backend code is loaded only when needed, so the app stays small without it.
 */
import type { Backend } from './types';

export * from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
const fake = import.meta.env.VITE_BACKEND === 'fake';

export const accountsAvailable = fake || !!(url && key);

let loading: Promise<Backend | null> | null = null;

export function loadBackend(): Promise<Backend | null> {
  loading ??= (async () => {
    if (fake) {
      const { memoryBackend, localStorageServer, localStorageSession } = await import('./memory');
      return memoryBackend(localStorageServer(), localStorageSession());
    }
    if (url && key) {
      const { supabaseBackend } = await import('./supabase');
      return supabaseBackend(url, key);
    }
    return null;
  })();
  return loading;
}
