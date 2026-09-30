import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExercisePicker } from '../components/ExercisePicker';
import { RecommendationCard } from '../components/RecommendationCard';
import { Screen } from '../components/Screen';
import { Stepper } from '../components/Stepper';
import { TrendChart } from '../components/TrendChart';
import { newId, saveExercise, startExercise } from '../data/actions';
import { useStore } from '../data/store';
import { bestEstimated1RM, exerciseHistory, formatDate, formatSets } from '../logic/history';
import { recommend } from '../logic/progression';
import type { Equipment, Exercise, MuscleGroup } from '../types';

export function ExercisesScreen() {
  const { data } = useStore();
  const navigate = useNavigate();
  return (
    <Screen
      title="Exercises"
      action={
        <>
          <Link to="/scan" className="icon-btn" aria-label="Identify machine by photo" style={{ display: 'grid', placeItems: 'center' }}>📷</Link>
          <Link to="/exercises/new" className="icon-btn" aria-label="New exercise" style={{ display: 'grid', placeItems: 'center' }}>＋</Link>
        </>
      }
    >
      <ExercisePicker exercises={data.exercises} onPick={(e) => navigate(`/exercises/${e.id}`)} />
    </Screen>
  );
}

/** Progress for one exercise: today's suggestion, a trend chart and past sessions. */
export function ExerciseScreen() {
  const { id } = useParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const exercise = data.exercises.find((e) => e.id === id);
  if (!exercise) return <Navigate to="/exercises" replace />;

  const history = exerciseHistory(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const usesWeight = exercise.weightStepKg > 0;
  const points = history.map((p) => ({
    date: p.date,
    value: usesWeight ? bestEstimated1RM(p.sets) : Math.max(...p.sets.map((s) => s.reps)),
  }));

  return (
    <Screen title={exercise.name} back action={<Link to={`/exercises/${exercise.id}/edit`} className="icon-btn" aria-label="Edit exercise" style={{ display: 'grid', placeItems: 'center' }}>✎</Link>}>
      {exercise.photo && <img className="photo-preview" src={exercise.photo} alt={`Your photo of ${exercise.name}`} />}
      <div className="chips">
        <span className="tag">{exercise.muscleGroup}</span>
        <span className="tag">{exercise.equipment}</span>
        <span className="tag">{exercise.repRange[0]}–{exercise.repRange[1]} reps</span>
      </div>

      <h2>Next time</h2>
      <RecommendationCard rec={rec} />

      <button className="btn primary block" onClick={() => { update((d) => startExercise(d, exercise.id)); navigate('/workout'); }}>
        ▶ {data.activeWorkout ? 'Add to current workout' : 'Start this exercise'}
      </button>

      <h2>{usesWeight ? 'Strength trend (estimated 1-rep max)' : 'Best set (reps)'}</h2>
      <div className="card">
        <TrendChart points={points} unit={usesWeight ? 'kg' : 'reps'} />
      </div>

      <h2>History</h2>
      <div className="list">
        {[...history].reverse().map((p) => (
          <Link key={p.sessionId} to={`/history/${p.sessionId}`} className="list-item" style={{ minHeight: 52 }}>
            <span className="muted small" style={{ width: 96, flex: 'none' }}>{formatDate(p.date)}</span>
            <span className="grow">{formatSets(p.sets)}</span>
          </Link>
        ))}
        {history.length === 0 && <p className="muted">Not done yet.</p>}
      </div>
    </Screen>
  );
}

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

  const save = () => {
    const exercise = { ...form, name: form.name.trim(), repRange: [Math.min(min, max), Math.max(min, max)] as [number, number] };
    // ?start=1 (from a workout or the photo flow): start tracking the new exercise straight away.
    const startNow = !existing && params.get('start') === '1';
    update((d) => (startNow ? startExercise(saveExercise(d, exercise), exercise.id) : saveExercise(d, exercise)));
    navigate(startNow ? '/workout' : `/exercises/${exercise.id}`, { replace: true });
  };

  return (
    <Screen title={existing ? 'Edit exercise' : 'New exercise'} back>
      <label className="field">
        Name
        <input className="input" value={form.name} placeholder="e.g. Hack Squat" onChange={(e) => set('name', e.target.value)} />
      </label>

      <div className="field">
        <span className="muted small">Muscle group</span>
        <div className="chips">
          {MUSCLES.map((m) => (
            <button key={m} className={`chip${form.muscleGroup === m ? ' on' : ''}`} onClick={() => set('muscleGroup', m)}>{m}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="muted small">Equipment</span>
        <div className="chips">
          {EQUIPMENT.map((eq) => (
            <button key={eq} className={`chip${form.equipment === eq ? ' on' : ''}`}
              onClick={() => setForm((f) => ({ ...f, equipment: eq, weightStepKg: DEFAULT_STEP[eq] }))}>{eq}</button>
          ))}
        </div>
      </div>

      <Stepper label="Min reps" value={min} step={1} min={1} onChange={(v) => set('repRange', [v, max])} />
      <Stepper label="Max reps" value={max} step={1} min={1} onChange={(v) => set('repRange', [min, v])} />
      {form.equipment !== 'bodyweight' && (
        <Stepper label="Weight jump" suffix="kg" value={form.weightStepKg} step={0.5} min={0.5} decimals onChange={(v) => set('weightStepKg', v)} />
      )}
      <p className="muted small" style={{ margin: 0 }}>
        Suggestions add reps until you reach {Math.max(min, max)} on every set, then add {form.equipment === 'bodyweight' ? 'more reps' : `${form.weightStepKg} kg`}.
      </p>

      <button className="btn primary huge" disabled={!form.name.trim()} onClick={save}>Save</button>
    </Screen>
  );
}
