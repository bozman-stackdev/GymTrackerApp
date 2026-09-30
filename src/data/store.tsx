/**
 * React glue: holds AppData in state, saves it through a DataStore on every change, and exposes it via hooks.
 * Screens call `update(d => someAction(d, ...))` with a pure function from actions.ts.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from '../types';
import { localStorageStore, requestPersistentStorage, type DataStore } from './storage';

interface AppState {
  /** null on first run (or unreadable data): the app shows the welcome screen. */
  data: AppData | null;
  update: (fn: (data: AppData) => AppData) => void;
  replace: (data: AppData) => void;
  /** Why the saved data couldn't be loaded (a backup copy was kept). */
  loadError: string | null;
  /** Set while saving fails (e.g. storage full); cleared by the next successful save. */
  saveError: string | null;
}

const StoreContext = createContext<AppState | null>(null);

export function StoreProvider({ children, store: dataStore }: { children: ReactNode; store?: DataStore }) {
  const [store] = useState(() => dataStore ?? localStorageStore());
  const [initial] = useState(() => store.load());
  const [data, setData] = useState<AppData | null>(initial.status === 'ok' ? initial.data : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSaved = useRef<AppData | null>(data);

  // Save every change (skipping data we just loaded or received from another tab).
  useEffect(() => {
    if (!data || data === lastSaved.current) return;
    const result = store.save(data);
    setSaveError(result.ok ? null : result.error);
    if (result.ok) {
      if (!lastSaved.current) requestPersistentStorage(); // first save on this device
      lastSaved.current = data;
    }
  }, [data, store]);

  // Another tab changed the data: take it, so the two tabs don't overwrite each other.
  useEffect(() => store.subscribe((external) => { lastSaved.current = external; setData(external); }), [store]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => (d ? fn(d) : d)), []);
  const value = useMemo<AppState>(
    () => ({ data, update, replace: setData, loadError: initial.status === 'unreadable' ? initial.error : null, saveError }),
    [data, update, initial, saveError],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** App-level state, including "no data yet". */
export function useAppState(): AppState {
  const state = useContext(StoreContext);
  if (!state) throw new Error('useAppState must be used inside <StoreProvider>');
  return state;
}

/** For screens, which only render once data exists. */
export function useStore(): AppState & { data: AppData } {
  const state = useAppState();
  if (!state.data) throw new Error('useStore used before data was loaded');
  return state as AppState & { data: AppData };
}

/** Look up an exercise by id (returns a placeholder if it was somehow deleted). */
export function useExerciseLookup() {
  const { data } = useStore();
  return useCallback(
    (id: string) =>
      data.exercises.find((e) => e.id === id) ?? {
        id, name: 'Unknown exercise', muscleGroup: 'core' as const, equipment: 'machine' as const, repRange: [8, 12] as [number, number], weightStepKg: 5,
      },
    [data.exercises],
  );
}
