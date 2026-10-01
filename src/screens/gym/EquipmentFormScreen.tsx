import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExercisePicker } from '../../components/ExercisePicker';
import { Screen } from '../../components/Screen';
import { deleteEquipment, newId, saveEquipment } from '../../data/actions';
import { useExerciseLookup, useStore } from '../../data/store';
import { validateEquipment } from '../../data/validate';
import { knownGyms, lastUsage } from '../../logic/equipment';
import { formatSets, relativeDay } from '../../logic/history';
import type { Equipment, GymEquipment } from '../../types';
import { Icon } from '../../components/Icon';

const TYPES: Equipment[] = ['machine', 'cable', 'barbell', 'dumbbell', 'bodyweight'];

/** Add (/gym/new[?exercise=id]) or edit (/gym/:id) a machine in My gym. Only the name and exercise are required. */
export function EquipmentFormScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const navigate = useNavigate();
  const existing = data.equipment.find((e) => e.id === id);
  const gyms = knownGyms(data.equipment);
  const firstExercise = params.get('exercise');

  const [item, setItem] = useState<GymEquipment>(() => existing ?? ({
    id: newId(), name: '', exerciseIds: firstExercise ? [firstExercise] : [],
    type: firstExercise ? getExercise(firstExercise).equipment : 'machine',
    gym: gyms[0] ?? '', source: 'manual', createdAt: new Date().toISOString(),
  }));
  const [picking, setPicking] = useState(false);
  const set = <K extends keyof GymEquipment>(key: K, value: GymEquipment[K]) => setItem((i) => ({ ...i, [key]: value }));
  const errors = validateEquipment(item, data.equipment);
  const valid = Object.keys(errors).length === 0;
  const usage = existing && lastUsage(data.sessions, existing.id);

  if (picking) {
    return (
      <Screen title="Used for…" action={<button className="btn ghost" onClick={() => setPicking(false)}>Cancel</button>}>
        <ExercisePicker
          exercises={data.exercises}
          exclude={item.exerciseIds}
          onPick={(e) => {
            setItem((i) => ({ ...i, exerciseIds: [...i.exerciseIds, e.id], type: i.exerciseIds.length ? i.type : e.equipment }));
            setPicking(false);
          }}
        />
      </Screen>
    );
  }

  const save = () => {
    if (!valid) return;
    const trim = (v?: string) => (v?.trim() ? v.trim() : undefined);
    update((d) => saveEquipment(d, {
      ...item, name: item.name.trim(), gym: item.gym.trim(),
      brand: trim(item.brand), model: trim(item.model), settings: trim(item.settings), notes: trim(item.notes),
    }));
    navigate(-1);
  };
  const remove = () => {
    if (!existing || !confirm(`Remove "${existing.name}" from My gym? Your workout history is kept.`)) return;
    update((d) => deleteEquipment(d, existing.id));
    navigate(-1);
  };
  const text = (label: string, key: 'name' | 'gym' | 'brand' | 'model' | 'settings', placeholder: string, list?: string) => (
    <label className="field">
      {label}
      <input className="input" value={item[key] ?? ''} placeholder={placeholder} list={list} maxLength={220}
        aria-invalid={!!(errors[key] && item[key])} onChange={(e) => set(key, e.target.value)} />
      {errors[key] && item[key] && <span className="field-error">{errors[key]}</span>}
    </label>
  );

  return (
    <Screen title={existing ? 'Edit equipment' : 'Add equipment'} back>
      {usage && (
        <div className="card small" data-testid="equipment-usage">
          Last used {relativeDay(usage.date)}: <strong>{formatSets(usage.sets)}</strong>
        </div>
      )}

      {text('Name', 'name', 'e.g. Life Fitness Leg Press')}

      <div className="field">
        <span className="muted small">Used for</span>
        <div className="chips">
          {item.exerciseIds.map((exId) => (
            <button key={exId} className="chip on" aria-label={`Remove ${getExercise(exId).name}`}
              onClick={() => set('exerciseIds', item.exerciseIds.filter((x) => x !== exId))}>
              {getExercise(exId).name} <Icon name="close" size={16} />
            </button>
          ))}
          <button className="chip" onClick={() => setPicking(true)}><Icon name="plus" size={16} /> Exercise</button>
        </div>
        {errors.exerciseIds && item.name && <span className="field-error">{errors.exerciseIds}</span>}
      </div>

      <div className="field">
        <span className="muted small">Type</span>
        <div className="chips">
          {TYPES.map((t) => (
            <button key={t} className={`chip${item.type === t ? ' on' : ''}`} aria-pressed={item.type === t} onClick={() => set('type', t)}>{t}</button>
          ))}
        </div>
      </div>

      {text('Gym', 'gym', 'e.g. Anytime Fitness Leeds', 'gym-list')}
      <datalist id="gym-list">{gyms.map((g) => <option key={g} value={g}>{g}</option>)}</datalist>
      {text('Settings', 'settings', 'e.g. Seat 5, feet mid-platform')}

      <details className="card">
        <summary><span className="muted small">More (optional): brand, model, notes</span></summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {text('Brand', 'brand', 'e.g. Life Fitness')}
          {text('Model', 'model', 'e.g. Signature Series')}
          <label className="field">
            Notes
            <textarea className="input textarea" value={item.notes ?? ''} maxLength={500} rows={3} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </div>
      </details>

      <button className="btn primary huge" disabled={!valid} onClick={save}>Save</button>
      {existing && <button className="btn ghost danger block" onClick={remove}>Remove from My gym</button>}
    </Screen>
  );
}
