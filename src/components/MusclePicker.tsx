import { GROUPS, muscleName, musclesInGroup } from '../logic/muscles/catalog';
import type { ExerciseMuscles, MuscleId } from '../types';

type State = 'off' | 'main' | 'also';
const NEXT: Record<State, State> = { off: 'main', main: 'also', also: 'off' };

/**
 * Which muscles an exercise works, for the exercise form: each muscle cycles off → main → also works → off.
 * Collapsed to a one-line summary until opened, so the form stays short.
 */
export function MusclePicker({ value, onChange }: { value: ExerciseMuscles; onChange: (m: ExerciseMuscles) => void }) {
  const stateOf = (id: MuscleId): State => (value.primary.includes(id) ? 'main' : value.secondary.includes(id) ? 'also' : 'off');
  const cycle = (id: MuscleId) => {
    const next = NEXT[stateOf(id)];
    const primary = value.primary.filter((x) => x !== id);
    const secondary = value.secondary.filter((x) => x !== id);
    if (next === 'main') primary.push(id);
    if (next === 'also') secondary.push(id);
    const weights = value.weights && Object.fromEntries(Object.entries(value.weights).filter(([k]) => k !== id || next === 'also'));
    onChange({ primary, secondary, ...(weights && Object.keys(weights).length ? { weights } : {}) });
  };
  const summary = value.primary.length
    ? `${value.primary.map(muscleName).join(', ')}${value.secondary.length ? ` · also ${value.secondary.map(muscleName).join(', ')}` : ''}`
    : 'Not set';
  return (
    <details className="field muscle-picker" data-testid="muscle-picker">
      <summary>
        <span className="muted small">Muscles worked</span>
        <span className="muscle-summary">{summary}</span>
      </summary>
      <p className="muted small flush">Tap a muscle once for <strong>main</strong>, again for <strong>also works</strong>, again to remove. Main muscles count fully on the muscle map, the others half.</p>
      {GROUPS.map((g) => (
        <div key={g.id} className="muscle-group-chips">
          <span className="caps small">{g.name}</span>
          <div className="chips">
            {musclesInGroup(g.id).map((id) => {
              const s = stateOf(id);
              return (
                <button key={id} type="button" className={`chip m-${s}`} aria-pressed={s !== 'off'}
                  aria-label={`${muscleName(id)}: ${s === 'main' ? 'main muscle' : s === 'also' ? 'also works' : 'not used'}`} onClick={() => cycle(id)}>
                  {muscleName(id)}{s !== 'off' && <span className="chip-note">{s === 'main' ? 'main' : 'also'}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!value.primary.length && <p className="field-error flush">Pick at least one main muscle.</p>}
    </details>
  );
}
