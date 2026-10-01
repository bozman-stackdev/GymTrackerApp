import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExerciseForm } from '../../components/ExerciseForm';
import { Screen } from '../../components/Screen';
import { saveExercise, startExercise } from '../../data/actions';
import { useStore } from '../../data/store';
import type { Exercise } from '../../types';

/** Create (/exercises/new, optional ?name=) or edit (/exercises/:id/edit) an exercise. */
export function ExerciseFormScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const existing = data.exercises.find((e) => e.id === id);

  const save = (exercise: Exercise) => {
    // ?start=1 (from a workout or the scan flow): start tracking the new exercise straight away.
    const startNow = !existing && params.get('start') === '1';
    update((d) => (startNow ? startExercise(saveExercise(d, exercise), exercise.id) : saveExercise(d, exercise)));
    navigate(startNow ? '/workout' : `/exercises/${exercise.id}`, { replace: true });
  };

  return (
    <Screen title={existing ? 'Edit exercise' : 'New exercise'} back>
      <ExerciseForm initial={existing} initialName={params.get('name') ?? ''} onSave={save} />
    </Screen>
  );
}
