import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '../../components/Screen';
import { Stepper } from '../../components/Stepper';
import { newId, saveExercise, startExercise } from '../../data/actions';
import { useStore } from '../../data/store';
import { validateExercise } from '../../data/validate';
import type { Equipment, Exercise, MuscleGroup } from '../../types';

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
const EQUIPMENT: Equipment[] = ['machine', 'cable', 'barbell', 'dumbbell', 'bodyweight'];
const DEFAULT_STEP: Record<Equipment, number> = { machine: 5, cable: 2.5, barbell: 2.5, dumbbell: 2, bodyweight: 0 };

/** Create (/exercises/new) or edit (/exercises/:id/edit) an exercise. */
export function ExerciseFormScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const existing = data.exercises.find((e) => e.id === id);

  const [form, setForm] = useState<Exercise>(
    existing ?? { id: newId(), name: '', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5, isCustom: true },
  );
  const set = <K extends keyof Exercise>(key: K, value: Exercise[K]) => setForm((f) => ({ ...f, [key]: value }));
  const [min, max] = form.repRange;
  const errors = validateExercise(form, data.exercises);
  const valid = Object.keys(errors).length === 0;

  const save = () => {
    if (!valid) return;
    const exercise = { ...form, name: form.name.trim() };
    // ?start=1 (from a workout or the scan flow): start tracking the new exercise straight away.
    const startNow = !existing && params.get('start') === '1';
    update((d) => (startNow ? startExercise(saveExercise(d, exercise), exercise.id) : saveExercise(d, exercise)));
    navigate(startNow ? '/workout' : `/exercises/${exercise.id}`, { replace: true });
  };

  return (
    <Screen title={existing ? 'Edit exercise' : 'New exercise'} back>
      <label className="field">
        Name
        <input className="input" value={form.name} placeholder="e.g. Hack Squat" maxLength={80} aria-invalid={!!(form.name && errors.name)} onChange={(e) => set('name', e.target.value)} />
        {form.name && errors.name && <span className="field-error">{errors.name}</span>}
      </label>

      <div className="field">
        <span className="muted small">Muscle group</span>
        <div className="chips">
          {MUSCLES.map((m) => (
            <button key={m} className={`chip${form.muscleGroup === m ? ' on' : ''}`} aria-pressed={form.muscleGroup === m} onClick={() => set('muscleGroup', m)}>{m}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="muted small">Equipment</span>
        <div className="chips">
          {EQUIPMENT.map((eq) => (
            <button key={eq} className={`chip${form.equipment === eq ? ' on' : ''}`} aria-pressed={form.equipment === eq}
              onClick={() => setForm((f) => ({ ...f, equipment: eq, weightStepKg: DEFAULT_STEP[eq] }))}>{eq}</button>
          ))}
        </div>
      </div>

      {/* Min can't pass max and vice versa, so the range is always valid. */}
      <Stepper label="Min reps" value={min} step={1} min={1} max={max} onChange={(v) => set('repRange', [v, max])} />
      <Stepper label="Max reps" value={max} step={1} min={min} max={100} onChange={(v) => set('repRange', [min, v])} />
      {form.equipment !== 'bodyweight' && (
        <Stepper label="Weight jump" suffix="kg" value={form.weightStepKg} step={0.5} min={0.5} max={50} decimals onChange={(v) => set('weightStepKg', v)} />
      )}
      {(errors.repRange || errors.weightStepKg) && <p className="field-error">{errors.repRange ?? errors.weightStepKg}</p>}
      <p className="muted small flush">
        Challenges add a rep at a time. After {max}+ reps on every set in 2 workouts in a row, they add{' '}
        {form.equipment === 'bodyweight' ? 'more reps' : `${form.weightStepKg} kg`}.
      </p>

      <button className="btn primary huge" disabled={!valid} onClick={save}>Save</button>
    </Screen>
  );
}
