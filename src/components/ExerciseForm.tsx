import { useState } from 'react';
import { newId } from '../data/actions';
import { useStore } from '../data/store';
import { validateExercise } from '../data/validate';
import { formatWeight, fromDisplay, getUnits, unitStepKg } from '../logic/units';
import type { Equipment, Exercise, ExerciseMuscles, MuscleGroup } from '../types';
import { Stepper } from './Stepper';
import { MusclePicker } from './MusclePicker';
import { suggestMuscles } from '../logic/muscles/catalog';

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];
const EQUIPMENT: Equipment[] = ['machine', 'cable', 'barbell', 'dumbbell', 'bodyweight'];
const DEFAULT_STEP: Record<Equipment, number> = { machine: 5, cable: 2.5, barbell: 2.5, dumbbell: 2, bodyweight: 0 };

/** Exercise fields + Save. Used by the exercise screen and inline while building a routine. The parent saves. */
export function ExerciseForm({ initial, initialName = '', onSave }: {
  initial?: Exercise;
  initialName?: string;
  onSave: (exercise: Exercise) => void;
}) {
  const { data } = useStore();
  const [form, setForm] = useState<Exercise>(
    initial ?? { id: newId(), name: initialName, muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5, isCustom: true },
  );
  const set = <K extends keyof Exercise>(key: K, value: Exercise[K]) => setForm((f) => ({ ...f, [key]: value }));
  // Muscles follow the name and group (e.g. "Hack Squat" → quads, glutes) until the user picks them.
  const [musclesPicked, setMusclesPicked] = useState(!!initial?.muscles);
  const muscles: ExerciseMuscles = musclesPicked && form.muscles ? form.muscles : suggestMuscles(form.name, form.muscleGroup);
  const [min, max] = form.repRange;
  const errors = validateExercise(form, data.exercises);
  const valid = Object.keys(errors).length === 0;

  return (
    <>
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

      <MusclePicker value={muscles} onChange={(m) => { set('muscles', m); setMusclesPicked(true); }} />

      {/* Min can't pass max and vice versa, so the range is always valid. */}
      <Stepper label="Min reps" value={min} step={1} min={1} max={max} onChange={(v) => set('repRange', [v, max])} />
      <Stepper label="Max reps" value={max} step={1} min={min} max={100} onChange={(v) => set('repRange', [min, v])} />
      {form.equipment !== 'bodyweight' && (
        <Stepper label="Weight jump" weight value={form.weightStepKg} step={fromDisplay(getUnits() === 'lb' ? 2.5 : 0.5)} min={fromDisplay(0.5)} max={50} onChange={(v) => set('weightStepKg', v)} />
      )}
      {(errors.repRange || errors.weightStepKg) && <p className="field-error">{errors.repRange ?? errors.weightStepKg}</p>}
      <p className="muted small flush">
        Challenges add a rep at a time. After {max}+ reps on every set in 2 workouts in a row, they add{' '}
        {form.equipment === 'bodyweight' ? 'more reps' : formatWeight(unitStepKg(form.weightStepKg))}.
      </p>

      <button className="btn primary huge" disabled={!valid} onClick={() => valid && onSave({ ...form, name: form.name.trim(), muscles: muscles.primary.length ? muscles : undefined })}>Save</button>
    </>
  );
}
