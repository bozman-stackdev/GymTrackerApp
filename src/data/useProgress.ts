import { useMemo } from 'react';
import { buildProgress, scoreLiveSession, type LiveSession, type Progress } from '../logic/game/progress';
import { useStore } from './store';

/** XP, level, streak and achievements, derived from finished workouts (recomputed only when history changes). */
export function useProgress(): Progress {
  const { data } = useStore();
  return useMemo(() => buildProgress(data.sessions, data.exercises), [data.sessions, data.exercises]);
}

/** Instant feedback for the workout in progress (cheap: doesn't replay history). */
export function useLiveSession(): LiveSession | null {
  const { data } = useStore();
  const session = data.activeWorkout?.session;
  return useMemo(
    () => (session ? scoreLiveSession(session, data.sessions, data.exercises) : null),
    [session, data.sessions, data.exercises],
  );
}
