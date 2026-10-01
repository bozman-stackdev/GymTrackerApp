import { Link, useNavigate } from 'react-router-dom';
import { useWakeLock } from '../../components/useWakeLock';
import { discardWorkout, finishExercise, finishWorkout, goToExercise, undoLastSet } from '../../data/actions';
import { useExerciseLookup, useStore } from '../../data/store';
import { useLiveSession } from '../../data/useProgress';
import { ExerciseStrip } from './ExerciseStrip';
import { LastSetBar } from './LastSetBar';
import { SetLogger } from './SetLogger';

/**
 * The in-gym screen, built for a tired user with a few seconds between sets:
 * weight is pre-filled and carried over, so recording a set is ONE tap on the number of reps done.
 * After the last planned set it moves on to the next exercise by itself. "Finish exercise" moves on (or offers
 * "+ Add exercise"); only "Finish session" ends the workout.
 */
export function WorkoutScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const getExercise = useExerciseLookup();
  const live = useLiveSession(); // instant feedback for this workout
  useWakeLock();

  const active = data.activeWorkout;
  if (!active) {
    // Also shown for a moment while finishing, before navigation completes - so no redirect here.
    return (
      <main className="screen full">
        <p className="muted center">No workout in progress.</p>
        <Link to="/" className="btn primary block">Start a workout</Link>
      </main>
    );
  }

  const { session, currentIndex } = active;
  const entry = session.entries[currentIndex];
  const hasSets = session.entries.some((e) => e.sets.length > 0);
  const exerciseDone = !!entry && entry.sets.length >= entry.targetSets;

  const finish = () => {
    if (!confirm(hasSets ? 'Finish and save this session?' : 'No sets logged. End the session without saving?')) return;
    update((d) => finishWorkout(d));
    navigate(hasSets ? `/history/${session.id}` : '/', { replace: true });
  };
  const discard = () => {
    if (!confirm('Discard this workout? Logged sets will be lost.')) return;
    update(discardWorkout);
    navigate('/', { replace: true });
  };

  return (
    <main className="screen full workout">
      <header className="header">
        <span className="muted grow">{session.name}</span>
        <button className="btn finish-btn" onClick={finish}>Finish session</button>
      </header>

      <ExerciseStrip session={session} currentIndex={currentIndex} onSelect={(i) => update((d) => goToExercise(d, i))} />
      <LastSetBar session={session} live={live!} onUndo={(i) => update((d) => undoLastSet(d, i))} />

      {exerciseDone && (
        <button className="btn primary huge" onClick={() => update(finishExercise)}>✓ Finish exercise</button>
      )}

      {entry ? (
        <SetLogger key={currentIndex} exercise={getExercise(entry.exerciseId)} entryIndex={currentIndex} live={live!} />
      ) : (
        <>
          {hasSets && <p className="muted center flush" data-testid="between">Exercise done. Add the next one, or tap Finish session when you're done.</p>}
          <Link to="/workout/add" className="btn primary huge">+ Add exercise</Link>
        </>
      )}

      <button className="btn ghost danger small" onClick={discard}>Discard workout</button>
    </main>
  );
}
