import { Link, useNavigate } from 'react-router-dom';
import { useWakeLock } from '../../components/useWakeLock';
import { discardWorkout, finishExercise, finishWorkout, goToExercise, stopActivityTimer, undoLastSet } from '../../data/actions';
import { useExerciseLookup, useStore } from '../../data/store';
import { useLiveSession } from '../../data/useProgress';
import { ExerciseStrip } from './ExerciseStrip';
import { LastSetBar } from './LastSetBar';
import { SetLogger } from './SetLogger';
import { Icon } from '../../components/Icon';
import { hasContent, isStrength } from '../../logic/entries';
import { ActivityLogger, RunningClock } from './ActivityLogger';
import { isRunning } from '../../logic/cardio';
import { activityName } from '../../logic/activities';
import { AddActivityRow } from '../../components/AddItemChoices';
import { KIND_LABEL } from '../../logic/activities';
import type { ActivityEntry, WorkoutSession } from '../../types';

/**
 * The in-gym screen, built for a tired user with a few seconds between sets:
 * weight is pre-filled and carried over, so recording a set is ONE tap on the number of reps done.
 * After the last planned set it moves on to the next exercise by itself. "Finish Exercise" moves on (or offers
 * "+ Add exercise"); only "Finish Session" ends the workout.
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
  // A running cardio timer counts: Finish Session stops and saves it.
  const hasSets = session.entries.some((e) => hasContent(e) || (!isStrength(e) && isRunning(e)));
  const runningIndex = session.entries.findIndex((e) => !isStrength(e) && isRunning(e));
  const runningEntry = runningIndex >= 0 ? (session.entries[runningIndex] as ActivityEntry) : null;
  const exerciseDone = !!entry && isStrength(entry) && entry.sets.length >= entry.targetSets;

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
        <button className="btn finish-btn" onClick={finish}>Finish Session</button>
      </header>

      <ExerciseStrip session={session} currentIndex={currentIndex} onSelect={(i) => update((d) => goToExercise(d, i))} />
      {runningEntry && runningIndex !== currentIndex ? (
        // The cardio timer stays in sight (and one tap from STOP) while looking at another item.
        <div className="running-bar" data-testid="running-bar">
          <button className="grow running-bar-main" onClick={() => update((d) => goToExercise(d, runningIndex))}>
            <Icon name="heartbeat" size={18} /> {activityName(runningEntry)} <RunningClock startedAt={runningEntry.startedAt!} small />
          </button>
          <button className="btn small stop" onClick={() => update((d) => stopActivityTimer(d, runningIndex))}>Stop</button>
        </div>
      ) : <LastSetBar session={session} live={live!} onUndo={(i) => update((d) => undoLastSet(d, i))} />}

      {exerciseDone && (
        <button className="btn primary huge" onClick={() => update(finishExercise)}><Icon name="check" size={26} /> Finish Exercise</button>
      )}

      {entry && isStrength(entry) ? (
        // Keyed by exercise (not position): logging the first warm-up set inserts an item before it.
        <SetLogger key={entry.exerciseId} exercise={getExercise(entry.exerciseId)} entryIndex={currentIndex} live={live!} />
      ) : entry ? (
        <ActivityLogger entry={entry} entryIndex={currentIndex} />
      ) : (
        <>
          {hasSets && <p className="muted center flush" data-testid="between">{lastDoneLabel(session)} done. Add the next one, or tap Finish Session when you're done.</p>}
          <Link to="/workout/add" className="btn primary huge"><Icon name="plus" size={26} /> Add exercise</Link>
          <AddActivityRow />
        </>
      )}

      <button className="btn ghost danger small" onClick={discard}>Discard workout</button>
    </main>
  );
}

/** "Exercise done" after lifting, "Cardio done" after a run (the last item completed in the workout). */
function lastDoneLabel(session: WorkoutSession): string {
  const last = [...session.entries].reverse().find(hasContent);
  return !last || isStrength(last) ? 'Exercise' : KIND_LABEL[last.kind];
}
