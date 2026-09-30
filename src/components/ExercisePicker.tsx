import { useMemo, useState } from 'react';
import type { Exercise } from '../types';

/** Searchable exercise list. Reused for adding to a workout, building routines and the scan flow. */
export function ExercisePicker({ exercises, onPick, exclude = [] }: {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  exclude?: string[];
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => !exclude.includes(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup.includes(q) || e.equipment.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, exclude, query]);

  return (
    <div className="stack">
      <input className="input" type="search" placeholder="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="list">
        {shown.map((e) => (
          <ExerciseRow key={e.id} exercise={e} onClick={() => onPick(e)} />
        ))}
        {shown.length === 0 && <p className="muted center">No matches.</p>}
      </div>
    </div>
  );
}

export function ExerciseRow({ exercise, detail, onClick }: { exercise: Exercise; detail?: string; onClick: () => void }) {
  return (
    <button className="list-item" onClick={onClick}>
      <div className="grow">
        <div className="title">{exercise.name}</div>
        <div className="muted small">{detail ?? `${exercise.muscleGroup} · ${exercise.equipment}`}</div>
      </div>
      <span className="muted" aria-hidden>›</span>
    </button>
  );
}
