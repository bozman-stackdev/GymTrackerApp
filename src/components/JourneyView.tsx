import { formatTarget } from '../logic/history';
import type { Journey, JourneyLevel } from '../logic/journey';
import type { Exercise } from '../types';
import { Icon } from './Icon';

/** The exercise as a ladder: mastered (check, or star for a whole weight), reached (half), current challenge (arrow), next (lock). */
export function JourneyView({ exercise, journey }: { exercise: Exercise; journey: Journey }) {
  if (journey.levels.length === 0) return <p className="muted small flush">Your journey starts with your first workout on this exercise.</p>;
  const isWeightLevel = (l: JourneyLevel) => exercise.weightStepKg > 0 && l.reps === exercise.repRange[1];
  const n = journey.sessionsToMaster;

  return (
    <div className="card journey" data-testid="journey">
      {journey.earlierMastered > 0 && <div className="muted small with-icon"><Icon name="check" size={16} /> {journey.earlierMastered} earlier level{journey.earlierMastered === 1 ? '' : 's'} mastered</div>}
      <ol className="journey-list">
        {journey.levels.map((l) => (
          <li key={`${l.weightKg}x${l.reps}`} className={`journey-level ${l.status}`} aria-current={l.status === 'current' ? 'step' : undefined}>
            <span className="journey-mark" aria-hidden>
              <Icon size={18} name={l.status === 'mastered' ? (isWeightLevel(l) ? 'star' : 'check') : l.status === 'reached' ? 'halfCircle' : l.status === 'current' ? 'forward' : 'lock'} />
            </span>
            <span className="journey-target">{formatTarget(l)}</span>
            <span className="journey-note">
              {l.status === 'current' && 'Current challenge'}
              {l.status === 'current' && l.sessionsInARow > 0 && ` · ${l.sessionsInARow} of ${n}`}
              {l.status === 'reached' && `${l.sessionsInARow} of ${n}`}
              {l.status === 'mastered' && (isWeightLevel(l) ? 'Weight mastered' : 'Mastered')}
            </span>
          </li>
        ))}
      </ol>
      <p className="muted small flush">Mastered = every set at that level, {n} workouts in a row.</p>
    </div>
  );
}
