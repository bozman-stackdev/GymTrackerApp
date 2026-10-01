import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ExercisePicker } from '../components/ExercisePicker';
import { Screen } from '../components/Screen';
import { addExerciseToWorkout } from '../data/actions';
import { useStore } from '../data/store';

/** Add an exercise to the workout in progress - by list or by photo. */
export function AddExerciseScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  if (!data.activeWorkout) return <Navigate to="/" replace />;

  return (
    <Screen title="Add exercise" back full>
      <Link to="/scan" className="btn primary block">📷 Scan a machine</Link>
      <ExercisePicker
        exercises={data.exercises}
        onPick={(e) => {
          update((d) => addExerciseToWorkout(d, e.id));
          navigate('/workout', { replace: true });
        }}
        onCreate={(name) => navigate(`/exercises/new?start=1${name ? `&name=${encodeURIComponent(name)}` : ''}`)}
      />
    </Screen>
  );
}
