import type { BodyType, MuscleId } from '../../types';
import { BodyMap, type MuscleTone } from './BodyMap';

/** Front and back side by side, small and not interactive (exercise page, workout summary, exercise form preview). */
export function MiniMaps({ body, tone, label }: { body: BodyType; tone: (m: MuscleId) => MuscleTone; label: string }) {
  return (
    <div className="mini-maps" role="img" aria-label={label}>
      <div className="mini-maps-inner" aria-hidden>
        <BodyMap body={body} view="front" tone={tone} label="Front view" />
        <BodyMap body={body} view="back" tone={tone} label="Back view" />
      </div>
    </div>
  );
}

/** How much an exercise uses each muscle, as map colours: main muscles strongest, light helpers faintest. */
export function involvementTone(inv: Map<MuscleId, number>) {
  return (m: MuscleId): MuscleTone => {
    const v = inv.get(m) ?? 0;
    return v >= 1 ? 'a3' : v >= 0.5 ? 'a2' : v > 0 ? 'a1' : 'none';
  };
}
