import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useExerciseLookup } from '../../data/store';
import type { WorkoutSession } from '../../types';
import { Icon } from '../../components/Icon';

/** Every exercise in the workout, with progress. Tap to jump. Doubles as "what have I done". */
export function ExerciseStrip({ session, currentIndex, onSelect }: { session: WorkoutSession; currentIndex: number; onSelect: (i: number) => void }) {
  const getExercise = useExerciseLookup();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.current')?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <nav className="ex-strip" ref={ref} aria-label="Exercises in this workout">
      {session.entries.map((e, i) => {
        const done = e.sets.length >= e.targetSets;
        return (
          <button
            key={e.exerciseId}
            className={`ex-chip${done ? ' done' : ''}${i === currentIndex ? ' current' : ''}`}
            aria-current={i === currentIndex}
            onClick={() => onSelect(i)}
          >
            <span className="ex-chip-name">{getExercise(e.exerciseId).name}</span>
            <span className="ex-chip-count">{done ? <Icon name="check" size={16} label="done" /> : `${e.sets.length}/${e.targetSets}`}</span>
          </button>
        );
      })}
      <Link to="/workout/add" className="ex-chip add" aria-label="Add exercise"><Icon name="plus" size={20} /></Link>
    </nav>
  );
}
