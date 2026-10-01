import { useMemo } from 'react';
import { buildProgress, scoreLiveSession, type LiveSession, type Progress } from '../logic/game/progress';
import type { AppData } from '../types';
import { useStore } from './store';

// One shared result for every screen (Home, History, Profile, summary), so opening a screen doesn't replay history
// again. Keyed by the data it depends on and today's date (the current streak depends on "now").
let cached: { sessions: AppData['sessions']; exercises: AppData['exercises']; day: string; progress: Progress } | null = null;

export function progressFor(sessions: AppData['sessions'], exercises: AppData['exercises'], now = new Date()): Progress {
  const day = now.toDateString();
  if (cached && cached.sessions === sessions && cached.exercises === exercises && cached.day === day) return cached.progress;
  const progress = buildProgress(sessions, exercises, now);
  cached = { sessions, exercises, day, progress };
  return progress;
}

/** XP, level, streak and achievements, derived from finished workouts (recomputed only when history changes). */
export function useProgress(): Progress {
  const { data } = useStore();
  return useMemo(() => progressFor(data.sessions, data.exercises), [data.sessions, data.exercises]);
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
