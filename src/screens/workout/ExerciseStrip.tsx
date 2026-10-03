import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useExerciseLookup } from '../../data/store';
import { isEntryDone, isStrength } from '../../logic/entries';
import type { WorkoutSession } from '../../types';
import { Icon } from '../../components/Icon';
import { entryTitle, KIND_ICON } from '../../components/activityUi';
import { isRunning } from '../../logic/cardio';
import { RunningClock } from './ActivityLogger';

/** Every item of the workout, with progress. Tap to jump. Doubles as "what have I done". */
export function ExerciseStrip({ session, currentIndex, onSelect }: { session: WorkoutSession; currentIndex: number; onSelect: (i: number) => void }) {
  const getExercise = useExerciseLookup();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-index="${currentIndex}"]`)?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <nav className="ex-strip" ref={ref} aria-label="Exercises in this workout">
      {session.entries.map((e, i) => {
        // Warm-up sets are shown on their exercise, not as a separate item.
        if (!isStrength(e) && e.warmupFor) return null;
        const done = isEntryDone(e);
        return (
          <button
            key={isStrength(e) ? `s:${e.exerciseId}` : `a:${i}:${e.activityId}`}
            data-index={i}
            className={`ex-chip${done ? ' done' : ''}${i === currentIndex ? ' current' : ''}${isStrength(e) ? '' : ` kind-${e.kind}`}`}
            aria-current={i === currentIndex}
            onClick={() => onSelect(i)}
          >
            {!isStrength(e) && <Icon name={KIND_ICON[e.kind]} size={16} />}
            <span className="ex-chip-name">{entryTitle(e, getExercise)}</span>
            <span className="ex-chip-count">
              {done ? <Icon name="check" size={16} label="done" /> : isStrength(e) ? `${e.sets.length}/${e.targetSets}`
                : isRunning(e) ? <RunningClock startedAt={e.startedAt!} small /> : null}
            </span>
          </button>
        );
      })}
      <Link to="/workout/add" className="ex-chip add" aria-label="Add exercise"><Icon name="plus" size={20} /></Link>
    </nav>
  );
}
