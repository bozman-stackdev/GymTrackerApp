import { useMemo, useState } from 'react';
import { hasContent } from '../logic/entries';
import type { MuscleInput } from '../logic/muscles/analysis';
import { planOf, type Plan } from '../logic/plan';
import type { BodyType, Profile } from '../types';
import { useStore } from './store';
import { useLiveSession, useProgress } from './useProgress';

/**
 * What the muscle map analyses: finished workouts plus the one in progress (so "This workout" is live), the exercise
 * library, and the game's challenge results for each workout (progress replay, or live scoring for the current one).
 */
export function useMuscleInput(): MuscleInput {
  const { data } = useStore();
  const progress = useProgress();
  const live = useLiveSession();
  const active = data.activeWorkout?.session;
  // "Now" for the periods (this week, last 4 weeks...): fixed while the screen is open, so it doesn't re-analyse.
  const [now] = useState(() => new Date());
  return useMemo(() => {
    const current = active && active.entries.some(hasContent) ? { ...active, finishedAt: now.toISOString() } : null;
    const sessions = current ? [...data.sessions, current] : data.sessions;
    return {
      sessions,
      exercises: data.exercises,
      now,
      results: (id: string) => (current && id === current.id ? live?.results : progress.bySession.get(id)?.results),
    };
  }, [data.sessions, data.exercises, active, progress, live, now]);
}

/** The body the map shows: the user's choice, else their profile's sex, else male. */
export function bodyTypeOf(profile: Profile): BodyType {
  if (profile.bodyMap === 'male' || profile.bodyMap === 'female') return profile.bodyMap; // anything else (e.g. an odd backup): ignore
  return profile.sex === 'female' ? 'female' : 'male';
}

export function usePlan(): Plan {
  const { data } = useStore();
  return planOf(data);
}
