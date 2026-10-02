/**
 * The one place that tells workout items apart. Strength code uses `isStrength` / `strengthEntries` and so never
 * sees cardio, warm-ups or cool-downs (or warm-up sets) - that's what keeps the progression engine separate.
 */
import type { ActivityEntry, ActivityRoutineItem, RoutineItem, SessionEntry, StrengthEntry, StrengthRoutineItem, WorkoutSession } from '../types';

export const isStrength = (e: SessionEntry): e is StrengthEntry => e.kind === undefined || e.kind === 'strength';
export const isActivity = (e: SessionEntry): e is ActivityEntry => !isStrength(e);
export const isStrengthItem = (i: RoutineItem): i is StrengthRoutineItem => i.kind === undefined || i.kind === 'strength';
export const isActivityItem = (i: RoutineItem): i is ActivityRoutineItem => !isStrengthItem(i);

export const strengthEntries = (s: WorkoutSession): StrengthEntry[] => s.entries.filter(isStrength);
export const activityEntries = (s: WorkoutSession): ActivityEntry[] => s.entries.filter(isActivity);

/** Done = all planned sets (strength) or marked complete (activities). */
export function isEntryDone(e: SessionEntry): boolean {
  return isStrength(e) ? e.sets.length >= e.targetSets : !!e.doneAt;
}

/** Anything worth keeping when the workout is finished. */
export function hasContent(e: SessionEntry): boolean {
  return isStrength(e) ? e.sets.length > 0 : !!e.doneAt || (e.warmupSets?.length ?? 0) > 0;
}
