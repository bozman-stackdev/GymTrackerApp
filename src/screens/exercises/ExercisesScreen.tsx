import { Link, useNavigate } from 'react-router-dom';
import { ExercisePicker } from '../../components/ExercisePicker';
import { Screen } from '../../components/Screen';
import { useStore } from '../../data/store';

/** The exercise library: search, open one to see progress, or add your own. */
export function ExercisesScreen() {
  const { data } = useStore();
  const navigate = useNavigate();
  return (
    <Screen
      title="Exercises"
      action={
        <>
          <Link to="/exercises/new" className="icon-btn" aria-label="New exercise">＋</Link>
        </>
      }
    >
      <ExercisePicker exercises={data.exercises} onPick={(e) => navigate(`/exercises/${e.id}`)} />
    </Screen>
  );
}
