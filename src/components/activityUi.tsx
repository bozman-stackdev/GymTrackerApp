/** Shared bits for showing workout items of any kind (strength, cardio, warm-up, cool-down). */
import { activityName, KIND_LABEL } from '../logic/activities';
import { isStrength } from '../logic/entries';
import type { ActivityKind, Exercise, SessionEntry } from '../types';
import { Icon, type IconName } from './Icon';

export const KIND_ICON: Record<ActivityKind, IconName> = { warmup: 'sun', cardio: 'heartbeat', cooldown: 'snowflake' };

/** The item's name: the exercise, the activity, or "Bench Press warm-up" for warm-up sets. */
export function entryTitle(e: SessionEntry, getExercise: (id: string) => Exercise): string {
  if (isStrength(e)) return getExercise(e.exerciseId).name;
  if (e.warmupFor) return `${getExercise(e.warmupFor).name} warm-up`;
  return activityName(e);
}

/** "WARM-UP" / "CARDIO" / "COOL-DOWN" with its icon. */
export function KindLabel({ kind, className = '' }: { kind: ActivityKind; className?: string }) {
  return (
    <span className={`kind-label with-icon kind-${kind} ${className}`}>
      <Icon name={KIND_ICON[kind]} size={15} /> {KIND_LABEL[kind]}
    </span>
  );
}
