import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExercisePicker } from '../components/ExercisePicker';
import { Screen } from '../components/Screen';
import { deleteRoutine, newId, saveRoutine } from '../data/actions';
import { useExerciseLookup, useStore } from '../data/store';
import type { Routine } from '../types';

/** Create (/routines/new) or edit (/routines/:id) a routine. */
export function RoutineScreen() {
  const { id } = useParams();
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const navigate = useNavigate();
  const existing = data.routines.find((r) => r.id === id);
  const [routine, setRoutine] = useState<Routine>(existing ?? { id: newId(), name: '', items: [] });
  const [picking, setPicking] = useState(false);

  const setItems = (items: Routine['items']) => setRoutine((r) => ({ ...r, items }));
  const move = (i: number, dir: -1 | 1) => {
    const items = [...routine.items];
    [items[i], items[i + dir]] = [items[i + dir], items[i]];
    setItems(items);
  };

  if (picking) {
    return (
      <Screen title="Add exercise" action={<button className="btn ghost" onClick={() => setPicking(false)}>Cancel</button>}>
        <ExercisePicker
          exercises={data.exercises}
          exclude={routine.items.map((i) => i.exerciseId)}
          onPick={(e) => { setItems([...routine.items, { exerciseId: e.id, sets: 3 }]); setPicking(false); }}
        />
      </Screen>
    );
  }

  const save = () => {
    update((d) => saveRoutine(d, { ...routine, name: routine.name.trim() }));
    navigate('/', { replace: true });
  };
  const remove = () => {
    if (!confirm(`Delete routine "${routine.name}"? Your workout history is kept.`)) return;
    update((d) => deleteRoutine(d, routine.id));
    navigate('/', { replace: true });
  };

  return (
    <Screen title={existing ? 'Edit routine' : 'New routine'} back>
      <label className="field">
        Name
        <input className="input" value={routine.name} placeholder="e.g. Upper body" onChange={(e) => setRoutine({ ...routine, name: e.target.value })} />
      </label>

      <div className="list">
        {routine.items.map((item, i) => (
          <div key={item.exerciseId} className="card row" style={{ padding: 8 }}>
            <div className="stack" style={{ gap: 0 }}>
              <button className="icon-btn" style={{ minHeight: 32, fontSize: 16 }} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button className="icon-btn" style={{ minHeight: 32, fontSize: 16 }} aria-label="Move down" disabled={i === routine.items.length - 1} onClick={() => move(i, 1)}>▼</button>
            </div>
            <div className="grow">
              <div className="title">{getExercise(item.exerciseId).name}</div>
              <div className="row small muted" style={{ gap: 4 }}>
                <button className="icon-btn" aria-label="Fewer sets" onClick={() => setItems(routine.items.map((it, j) => (j === i ? { ...it, sets: Math.max(1, it.sets - 1) } : it)))}>−</button>
                <span>{item.sets} sets</span>
                <button className="icon-btn" aria-label="More sets" onClick={() => setItems(routine.items.map((it, j) => (j === i ? { ...it, sets: Math.min(10, it.sets + 1) } : it)))}>+</button>
              </div>
            </div>
            <button className="icon-btn" aria-label="Remove" onClick={() => setItems(routine.items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>

      <button className="btn block" onClick={() => setPicking(true)}>+ Add exercise</button>
      <button className="btn primary huge" disabled={!routine.name.trim() || routine.items.length === 0} onClick={save}>Save routine</button>
      {existing && <button className="btn ghost danger block" onClick={remove}>Delete routine</button>}
    </Screen>
  );
}
