import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { RecommendationCard } from '../components/RecommendationCard';
import { Screen } from '../components/Screen';
import { Stepper } from '../components/Stepper';
import { formatDuration, useNow } from '../components/useNow';
import { discardWorkout, finishWorkout, goToExercise, logSet, undoLastSet } from '../data/actions';
import { useExerciseLookup, useStore } from '../data/store';
import { formatKg, formatSets, lastPerformance, relativeDay } from '../logic/history';
import { plannedSet, recommend } from '../logic/progression';
import type { Exercise } from '../types';

/**
 * The in-gym screen. Designed so a normal set is ONE tap:
 * weight and reps are pre-filled from the plan, the user only adjusts when reality differs.
 */
export function WorkoutScreen() {
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const navigate = useNavigate();
  const now = useNow();
  // Set while we finish/discard, so the "no workout -> go home" redirect doesn't override our own navigation.
  const leaving = useRef(false);

  const active = data.activeWorkout;
  if (!active) return leaving.current ? null : <Navigate to="/" replace />;

  const { session, currentIndex } = active;
  const entry = session.entries[currentIndex];
  const hasSets = session.entries.some((e) => e.sets.length > 0);

  const finish = () => {
    if (!confirm(hasSets ? 'Finish and save this workout?' : 'No sets logged. End workout without saving?')) return;
    leaving.current = true;
    update((d) => finishWorkout(d));
    navigate(hasSets ? `/history/${session.id}` : '/', { replace: true });
  };
  const discard = () => {
    if (!confirm('Discard this workout? Logged sets will be lost.')) return;
    leaving.current = true;
    update(discardWorkout);
    navigate('/', { replace: true });
  };

  const header = (
    <>
      <span className="muted small" aria-label="Workout time">{formatDuration(now - Date.parse(session.startedAt))}</span>
      <button className="btn primary" style={{ minHeight: 44 }} onClick={finish}>Finish</button>
    </>
  );

  return (
    <Screen title={session.name} full action={header}>
      {!entry ? (
        <div className="stack" style={{ marginTop: 32 }}>
          <p className="muted center">No exercises yet.</p>
          <Link to="/workout/add" className="btn primary huge">+ Add exercise</Link>
        </div>
      ) : (
        <ExerciseLogger
          key={`${currentIndex}-${entry.sets.length}`}
          exercise={getExercise(entry.exerciseId)}
          entryIndex={currentIndex}
          now={now}
        />
      )}

      {session.entries.length > 0 && (
        <nav className="dots" aria-label="Exercises in this workout">
          {session.entries.map((e, i) => (
            <button
              key={e.exerciseId}
              className={`dot${e.sets.length >= e.targetSets ? ' done' : ''}${i === currentIndex ? ' current' : ''}`}
              aria-label={`${getExercise(e.exerciseId).name}, ${e.sets.length} of ${e.targetSets} sets`}
              onClick={() => update((d) => goToExercise(d, i))}
            />
          ))}
          <Link to="/workout/add" className="dot" aria-label="Add exercise" style={{ display: 'grid', placeItems: 'center', fontSize: 16 }}>+</Link>
        </nav>
      )}

      <button className="btn ghost danger small" onClick={discard}>Discard workout</button>
    </Screen>
  );
}

/** Logging UI for the current exercise. Re-mounted after every set so the pre-fill resets. */
function ExerciseLogger({ exercise, entryIndex, now }: { exercise: Exercise; entryIndex: number; now: number }) {
  const { data, update } = useStore();
  const session = data.activeWorkout!.session;
  const entry = session.entries[entryIndex];
  const isLast = entryIndex === session.entries.length - 1;

  const last = lastPerformance(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const plan = plannedSet(rec, entry.sets, last);
  const [weight, setWeight] = useState(plan.weightKg);
  const [reps, setReps] = useState(plan.reps);
  const [extra, setExtra] = useState(false);

  const usesWeight = exercise.weightStepKg > 0;
  const setsDone = entry.sets.length;
  const targetReached = setsDone >= entry.targetSets && !extra;
  const lastSetAt = entry.sets.at(-1)?.loggedAt;

  const log = () => update((d) => logSet(d, entryIndex, { reps, weightKg: usesWeight ? weight : 0 }));
  const next = () => update((d) => goToExercise(d, entryIndex + 1));

  return (
    <div className="stack">
      <div className="row">
        <button className="icon-btn" aria-label="Previous exercise" disabled={entryIndex === 0} onClick={() => update((d) => goToExercise(d, entryIndex - 1))}>‹</button>
        <h2 className="ex-name grow center" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>{exercise.name}</h2>
        <button className="icon-btn" aria-label="Next exercise" disabled={isLast} onClick={next}>›</button>
      </div>

      <div className="card small" data-testid="last-time">
        <span className="muted">Last time{last ? ` (${relativeDay(last.date)})` : ''}: </span>
        <strong>{last ? formatSets(last.sets) : '—'}</strong>
      </div>
      <RecommendationCard rec={rec} />

      <div className="row small muted" style={{ justifyContent: 'space-between' }}>
        <span data-testid="set-counter">
          {targetReached ? `${setsDone} of ${entry.targetSets} sets done` : `Set ${setsDone + 1} of ${entry.targetSets}`}
        </span>
        {lastSetAt && <span>Rest {formatDuration(now - Date.parse(lastSetAt))}</span>}
      </div>

      {targetReached ? (
        <>
          {isLast ? (
            <p className="center muted">All sets done 💪 Tap <strong>Finish</strong> when you're done.</p>
          ) : (
            <button className="btn primary huge" onClick={next}>Next exercise →</button>
          )}
          <button className="btn block" onClick={() => setExtra(true)}>+ Extra set</button>
        </>
      ) : (
        <>
          {usesWeight && <Stepper label="Weight" suffix="kg" value={weight} step={exercise.weightStepKg} decimals onChange={setWeight} />}
          <Stepper label="Reps" value={reps} step={1} onChange={setReps} />
          <button className="btn primary huge" onClick={log} disabled={reps <= 0}>
            ✓ Done
          </button>
        </>
      )}

      {setsDone > 0 && (
        <div className="row">
          <div className="set-pills grow" data-testid="sets-today">
            {entry.sets.map((s, i) => (
              <span key={i} className="set-pill">{s.weightKg > 0 ? `${formatKg(s.weightKg)} × ` : ''}{s.reps}</span>
            ))}
          </div>
          <button className="btn ghost small" onClick={() => update((d) => undoLastSet(d, entryIndex))}>Undo</button>
        </div>
      )}
    </div>
  );
}
