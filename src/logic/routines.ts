import { KIND_LABEL } from './activities';
import { isActivityItem, isStrengthItem } from './entries';
import { plural } from './history';
import type { Routine } from '../types';

/** "5 exercises", "4 exercises · warm-up + cardio", "Cardio" - what's in a routine at a glance. */
export function routineSummary(r: Routine): string {
  const strength = r.items.filter(isStrengthItem).length;
  const kinds = [...new Set(r.items.filter(isActivityItem).map((i) => i.kind))]
    .sort((a, b) => ['warmup', 'cardio', 'cooldown'].indexOf(a) - ['warmup', 'cardio', 'cooldown'].indexOf(b))
    .map((k, i) => (i === 0 && strength === 0 ? KIND_LABEL[k] : KIND_LABEL[k].toLowerCase()));
  const parts = [strength > 0 ? plural(strength, 'exercise') : '', kinds.join(' + ')].filter(Boolean);
  return parts.join(' · ') || plural(0, 'exercise');
}
