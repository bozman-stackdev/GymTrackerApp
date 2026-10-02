import type { KeyboardEvent } from 'react';
import type { BodyType, MuscleId } from '../../types';
import { muscleName, type BodyView } from '../../logic/muscles/catalog';
import { figure, musclesInView } from './figure';

/**
 * How a muscle is coloured: activity heat (a1 low → a3 high), training progress (lower / stable / moderate / strong),
 * or 'none' (not trained / no data). Colours are theme tokens in styles.css (--heat-*, --prog-*).
 */
export type MuscleTone = 'none' | 'a1' | 'a2' | 'a3' | 'lower' | 'stable' | 'moderate' | 'strong';

/**
 * The body map: an anatomical-style figure whose muscles are coloured by `tone`. With `onSelect`, each muscle is a
 * button (tap, or Tab + Enter): left and right are separate shapes of the same muscle.
 */
export function BodyMap({ body, view, tone, selected, onSelect, describe, label, className }: {
  body: BodyType;
  view: BodyView;
  tone: (m: MuscleId) => MuscleTone;
  selected?: MuscleId | null;
  onSelect?: (m: MuscleId) => void;
  /** Accessible name of each muscle button, e.g. "Chest: high activity". */
  describe?: (m: MuscleId) => string;
  /** Accessible description of a non-interactive map. */
  label?: string;
  className?: string;
}) {
  const fig = figure(body, view);
  // The selected muscle is drawn last, so its outline isn't covered by its neighbours.
  const muscles = musclesInView(view).sort((a, b) => Number(a === selected) - Number(b === selected));
  const press = (m: MuscleId) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(m);
    }
  };
  return (
    <svg
      viewBox="0 0 200 440"
      className={`body-map${className ? ` ${className}` : ''}`}
      data-body={body}
      data-view={view}
      role={onSelect ? 'group' : 'img'}
      aria-label={label ?? `${view === 'front' ? 'Front' : 'Back'} view`}
    >
      <g className="bm-base" aria-hidden>
        {fig.base.map((d, i) => <path key={i} d={d} />)}
        {fig.lines.map((d, i) => <path key={`l${i}`} d={d} className="bm-line" />)}
        {fig.hair.map((d, i) => <path key={`h${i}`} d={d} className="bm-hair" />)}
      </g>
      {muscles.map((m) => {
        const t = tone(m);
        const parts = fig.parts.filter((p) => p.muscle === m);
        const interactive = onSelect
          ? { role: 'button', tabIndex: 0, 'aria-label': describe?.(m) ?? muscleName(m), 'aria-pressed': selected === m, onClick: () => onSelect(m), onKeyDown: press(m) }
          : { 'aria-hidden': true };
        return (
          <g key={m} className={`bm-muscle t-${t}${selected === m ? ' sel' : ''}`} data-muscle={m} data-tone={t} {...interactive}>
            {parts.map((p, i) => <path key={i} d={p.d} data-side={p.side} />)}
          </g>
        );
      })}
    </svg>
  );
}
