/**
 * React glue: holds AppData in state, saves it on every change, and exposes it via useStore().
 * Screens call `update(d => someAction(d, ...))` with a function from actions.ts.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppData } from '../types';
import { loadData, saveData } from './storage';

interface Store {
  data: AppData;
  update: (fn: (data: AppData) => AppData) => void;
  replace: (data: AppData) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());

  useEffect(() => saveData(data), [data]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData(fn), []);
  const store = useMemo(() => ({ data, update, replace: setData }), [data, update]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
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
