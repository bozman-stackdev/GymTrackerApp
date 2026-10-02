import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ActivityPicker, KindTabs } from '../components/AddItemChoices';
import { ExercisePicker } from '../components/ExercisePicker';
import { Screen } from '../components/Screen';
import { addActivityToWorkout, addExerciseToWorkout } from '../data/actions';
import { useStore } from '../data/store';
import { Icon } from '../components/Icon';
import { KIND_LABEL } from '../logic/activities';
import type { ActivityKind, EntryKind } from '../types';

const KINDS: EntryKind[] = ['strength', 'cardio', 'warmup', 'cooldown'];

/** Add to the workout in progress: an exercise (by list or photo), cardio, a warm-up or a cool-down. */
export function AddExerciseScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  if (!data.activeWorkout) return <Navigate to="/" replace />;
  const kind = (KINDS as string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as EntryKind) : 'strength';

  return (
    <Screen title={kind === 'strength' ? 'Add exercise' : `Add ${KIND_LABEL[kind as ActivityKind].toLowerCase()}`} back full>
      <KindTabs value={kind} onChange={(k) => setParams(k === 'strength' ? {} : { kind: k }, { replace: true })} />
      {kind === 'strength' ? (
        <>
          <Link to="/scan" className="btn primary block"><Icon name="camera" /> Scan a machine</Link>
          <ExercisePicker
            exercises={data.exercises}
            onPick={(e) => {
              update((d) => addExerciseToWorkout(d, e.id));
              navigate('/workout', { replace: true });
            }}
            onCreate={(name) => navigate(`/exercises/new?start=1${name ? `&name=${encodeURIComponent(name)}` : ''}`)}
          />
        </>
      ) : (
        <ActivityPicker
          kind={kind as ActivityKind}
          onPick={(activityId, name) => {
            update((d) => addActivityToWorkout(d, kind as ActivityKind, activityId, name));
            navigate('/workout', { replace: true });
          }}
        />
      )}
    </Screen>
  );
}
