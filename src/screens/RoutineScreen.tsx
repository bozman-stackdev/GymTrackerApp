import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExerciseForm } from '../components/ExerciseForm';
import { ExercisePicker } from '../components/ExercisePicker';
import { Screen } from '../components/Screen';
import { deleteRoutine, newId, saveExercise, saveRoutine } from '../data/actions';
import { useExerciseLookup, useStore } from '../data/store';
import type { ActivityKind, EntryKind, Routine } from '../types';
import { ActivityPicker, KindTabs } from '../components/AddItemChoices';
import { KIND_ICON, KindLabel } from '../components/activityUi';
import { activityName, KIND_LABEL } from '../logic/activities';
import { isStrengthItem } from '../logic/entries';

const DEFAULT_MINUTES: Record<ActivityKind, number> = { warmup: 5, cardio: 20, cooldown: 5 };
import { Icon } from '../components/Icon';
import { plural } from '../logic/history';

/** Create (/routines/new) or edit (/routines/:id) a routine. */
export function RoutineScreen() {
  const { id } = useParams();
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const navigate = useNavigate();
  const existing = data.routines.find((r) => r.id === id);
  const [routine, setRoutine] = useState<Routine>(existing ?? { id: newId(), name: '', items: [] });
  // Adding happens inside this screen, so the routine being built is never lost.
  const [picking, setPicking] = useState<null | { kind?: EntryKind; create?: string }>(null);

  const setItems = (items: Routine['items']) => setRoutine((r) => ({ ...r, items }));
  const move = (i: number, dir: -1 | 1) => {
    const items = [...routine.items];
    [items[i], items[i + dir]] = [items[i + dir], items[i]];
    setItems(items);
  };

  const addItem = (exerciseId: string) => { setItems([...routine.items, { exerciseId, sets: 3 }]); setPicking(null); };
  const addActivity = (kind: ActivityKind, activityId: string, name?: string) => {
    setItems([...routine.items, { kind, activityId, ...(name ? { name } : {}), plan: { durationMin: DEFAULT_MINUTES[kind] } }]);
    setPicking(null);
  };
  const setMinutes = (i: number, delta: number) => setItems(routine.items.map((it, j) => {
    if (j !== i || isStrengthItem(it)) return it;
    const minutes = Math.min(180, Math.max(1, (it.plan?.durationMin ?? DEFAULT_MINUTES[it.kind]) + delta));
    return { ...it, plan: { ...it.plan, durationMin: minutes } };
  }));

  if (picking?.create !== undefined) {
    return (
      <Screen title="New exercise" action={<button className="btn ghost" onClick={() => setPicking({})}>Cancel</button>}>
        <ExerciseForm initialName={picking.create} onSave={(ex) => { update((d) => saveExercise(d, ex)); addItem(ex.id); }} />
      </Screen>
    );
  }
  if (picking) {
    const kind = picking.kind ?? 'strength';
    return (
      <Screen title={kind === 'strength' ? 'Add exercise' : `Add ${KIND_LABEL[kind].toLowerCase()}`}
        action={<button className="btn ghost" onClick={() => setPicking(null)}>Cancel</button>}>
        <KindTabs value={kind} onChange={(k) => setPicking({ kind: k })} />
        {kind === 'strength' ? (
          <ExercisePicker
            exercises={data.exercises}
            exclude={routine.items.filter(isStrengthItem).map((i) => i.exerciseId)}
            onPick={(e) => addItem(e.id)}
            onCreate={(name) => setPicking({ create: name })}
          />
        ) : (
          <ActivityPicker kind={kind} onPick={(activityId, name) => addActivity(kind, activityId, name)} />
        )}
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
        {routine.items.map((item, i) => {
          const name = isStrengthItem(item) ? getExercise(item.exerciseId).name : activityName(item);
          return (
          <div key={isStrengthItem(item) ? item.exerciseId : `a${i}:${item.activityId}`} className="card row routine-item">
            <div className="reorder">
              <button className="icon-btn" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronUp" /></button>
              <button className="icon-btn" aria-label={`Move ${name} down`} disabled={i === routine.items.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" /></button>
            </div>
            {!isStrengthItem(item) ? (
            <div className="grow">
              <KindLabel kind={item.kind} />
              <div className="title">{name}</div>
              <div className="row small muted sets-control">
                <button className="icon-btn" aria-label={`Fewer minutes of ${name}`} onClick={() => setMinutes(i, -1)}><Icon name="minus" size={18} /></button>
                <span>{item.plan?.durationMin ?? DEFAULT_MINUTES[item.kind]} min</span>
                <button className="icon-btn" aria-label={`More minutes of ${name}`} onClick={() => setMinutes(i, 1)}><Icon name="plus" size={18} /></button>
              </div>
            </div>
            ) : (
            <div className="grow">
              <div className="title">{name}</div>
              <div className="row small muted sets-control">
                <button className="icon-btn" aria-label={`Fewer sets of ${name}`} onClick={() => setItems(routine.items.map((it, j) => (j === i && isStrengthItem(it) ? { ...it, sets: Math.max(1, it.sets - 1) } : it)))}><Icon name="minus" size={18} /></button>
                <span>{plural(item.sets, 'set')}</span>
                <button className="icon-btn" aria-label={`More sets of ${name}`} onClick={() => setItems(routine.items.map((it, j) => (j === i && isStrengthItem(it) ? { ...it, sets: Math.min(10, it.sets + 1) } : it)))}><Icon name="plus" size={18} /></button>
              </div>
            </div>
            )}
            <button className="icon-btn" aria-label={`Remove ${name}`} onClick={() => setItems(routine.items.filter((_, j) => j !== i))}><Icon name="close" /></button>
          </div>
          );
        })}
      </div>

      <button className="btn block" onClick={() => setPicking({})}><Icon name="plus" /> Add exercise</button>
      <div className="row add-activity-row">
        {(['cardio', 'warmup', 'cooldown'] as const).map((k) => (
          <button key={k} className="btn grow" onClick={() => setPicking({ kind: k })}><Icon name={KIND_ICON[k]} size={18} /> {KIND_LABEL[k]}</button>
        ))}
      </div>
      <button className="btn primary huge" disabled={!routine.name.trim() || routine.items.length === 0} onClick={save}>Save routine</button>
      {existing && <button className="btn ghost danger block" onClick={remove}>Delete routine</button>}
    </Screen>
  );
}
