import { useMemo } from 'react';
import { buildProgress, type Progress } from '../logic/game/progress';
import { useStore } from './store';

/**
 * XP, level, streak and achievements, derived from history.
 * With `includeActive`, the workout in progress is scored too (for instant feedback during the workout).
 */
export function useProgress(includeActive = false): Progress {
  const { data } = useStore();
  return useMemo(() => {
    const active = includeActive ? data.activeWorkout?.session : undefined;
    const sessions = active ? [...data.sessions, { ...active, finishedAt: new Date().toISOString() }] : data.sessions;
    return buildProgress(sessions, data.exercises);
  }, [data.sessions, data.exercises, data.activeWorkout, includeActive]);
}
