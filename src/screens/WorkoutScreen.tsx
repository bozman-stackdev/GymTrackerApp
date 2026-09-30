import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Stepper } from '../components/Stepper';
import { formatDuration, useNow } from '../components/useNow';
import { useWakeLock } from '../components/useWakeLock';
import { discardWorkout, finishWorkout, goToExercise, logSet, undoLastSet } from '../data/actions';
import { useExerciseLookup, useStore } from '../data/store';
import { formatKg, formatSets, lastPerformance, workingWeight } from '../logic/history';
import { plannedSet, recommend } from '../logic/progression';
import type { Exercise, WorkoutSession } from '../types';

/**
 * The in-gym screen, built for a tired user with a few seconds between sets:
 * weight is pre-filled and carried over, so recording a set is ONE tap on the number of reps done.
 * After the last planned set it moves on to the next exercise by itself.
 */
export function WorkoutScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const getExercise = useExerciseLookup();
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
  const allDone = session.entries.length > 0 && session.entries.every((e) => e.sets.length >= e.targetSets);

  const finish = (ask: boolean) => {
    if (ask && !confirm(hasSets ? 'Finish and save this workout?' : 'No sets logged. End without saving?')) return;
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
        <button className="btn finish-btn" onClick={() => finish(true)}>Finish</button>
      </header>

      <ExerciseStrip session={session} currentIndex={currentIndex} onSelect={(i) => update((d) => goToExercise(d, i))} />
      <LastSetBar session={session} onUndo={(i) => update((d) => undoLastSet(d, i))} />

      {allDone && (
        <button className="btn primary huge" onClick={() => finish(false)}>✓ Finish workout</button>
      )}

      {entry ? (
        <SetLogger key={currentIndex} exercise={getExercise(entry.exerciseId)} entryIndex={currentIndex} />
      ) : (
        <Link to="/workout/add" className="btn primary huge">+ Add exercise</Link>
      )}

      <button className="btn ghost danger small" onClick={discard}>Discard workout</button>
    </main>
  );
}

/** Every exercise in the workout, with progress. Tap to jump. Doubles as "what have I done". */
function ExerciseStrip({ session, currentIndex, onSelect }: { session: WorkoutSession; currentIndex: number; onSelect: (i: number) => void }) {
  const getExercise = useExerciseLookup();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.current')?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <nav className="ex-strip" ref={ref} aria-label="Exercises in this workout">
      {session.entries.map((e, i) => {
        const done = e.sets.length >= e.targetSets;
        return (
          <button
            key={e.exerciseId}
            className={`ex-chip${done ? ' done' : ''}${i === currentIndex ? ' current' : ''}`}
            aria-current={i === currentIndex}
            onClick={() => onSelect(i)}
          >
            <span className="ex-chip-name">{getExercise(e.exerciseId).name}</span>
            <span className="ex-chip-count">{done ? '✓' : `${e.sets.length}/${e.targetSets}`}</span>
          </button>
        );
      })}
      <Link to="/workout/add" className="ex-chip add" aria-label="Add exercise">＋</Link>
    </nav>
  );
}

/** The most recent set of the whole workout, with rest time and undo. Derived from saved data, so it survives a reload. */
function LastSetBar({ session, onUndo }: { session: WorkoutSession; onUndo: (entryIndex: number) => void }) {
  const getExercise = useExerciseLookup();
  const now = useNow();
  let latest: { entryIndex: number; loggedAt: string; text: string } | undefined;
  session.entries.forEach((e, i) => {
    const s = e.sets.at(-1);
    if (s && (!latest || s.loggedAt > latest.loggedAt)) {
      latest = { entryIndex: i, loggedAt: s.loggedAt, text: `${s.weightKg > 0 ? `${formatKg(s.weightKg)} × ` : ''}${s.reps}` };
    }
  });
  if (!latest) return null;
  const { entryIndex, loggedAt, text } = latest;

  return (
    <div className="last-bar" data-testid="last-set" aria-live="polite">
      <span className="last-bar-text">
        ✓ <strong>{text}</strong> <span className="muted">{getExercise(session.entries[entryIndex].exerciseId).name}</span>
      </span>
      <span className="muted small" aria-label="Rest time">{formatDuration(now - Date.parse(loggedAt))}</span>
      <button className="btn ghost" onClick={() => onUndo(entryIndex)}>Undo</button>
    </div>
  );
}

/** Logging for the current exercise: weight (pre-filled) + one tap on the reps done. */
function SetLogger({ exercise, entryIndex }: { exercise: Exercise; entryIndex: number }) {
  const { data, update } = useStore();
  const entry = data.activeWorkout!.session.entries[entryIndex];
  const last = lastPerformance(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const plan = plannedSet(rec, entry.sets, last);

  const [weight, setWeight] = useState(plan.weightKg);
  const usesWeight = exercise.weightStepKg > 0;
  const needsWeight = usesWeight && weight <= 0;
  const setsDone = entry.sets.length;

  // One-tap alternatives to the pre-filled weight, only when they differ from it.
  const quickWeights = [
    { kg: entry.sets.at(-1)?.weightKg, label: 'last set' },
    { kg: last && workingWeight(last.sets), label: 'last session' },
    { kg: rec.weightKg, label: 'suggested' },
  ].filter((q, i, all): q is { kg: number; label: string } =>
    !!q.kg && q.kg !== weight && all.findIndex((o) => o.kg === q.kg) === i);

  const log = (reps: number) => {
    update((d) => logSet(d, entryIndex, { reps, weightKg: usesWeight ? weight : 0 }));
    navigator.vibrate?.(30);
  };

  const hint =
    rec.kind === 'increase-weight' || rec.kind === 'increase-reps' || rec.kind === 'decrease-weight' ? rec.title
    : rec.kind === 'first-time' ? `First time – pick a weight for ${exercise.repRange[0]}–${exercise.repRange[1]} reps`
    : null;

  return (
    <section className="stack logger">
      <div>
        <h1 className="ex-name">{exercise.name}</h1>
        <p className="muted last-session" data-testid="last-time">
          Last session: <strong>{last ? formatSets(last.sets) : '—'}</strong>
        </p>
        {hint && <p className="target" data-testid="recommendation">{hint}</p>}
      </div>

      <div className="slots" data-testid="sets-today" aria-label="Sets this workout">
        {Array.from({ length: Math.max(entry.targetSets, setsDone + 1) }, (_, i) => {
          const s = entry.sets[i];
          if (s) return <span key={i} className="slot done">{s.weightKg > 0 ? `${Number(s.weightKg.toFixed(2))}×` : ''}{s.reps}</span>;
          return <span key={i} className={`slot${i === setsDone ? ' next' : ''}`}>{i < entry.targetSets ? `Set ${i + 1}` : 'Extra'}</span>;
        })}
      </div>

      {usesWeight && (
        <div>
          <Stepper label="Weight" suffix="kg" value={weight} step={exercise.weightStepKg} decimals onChange={setWeight} />
          {quickWeights.length > 0 && (
            <div className="chips quick-weights">
              {quickWeights.map((q) => (
                <button key={q.label} className="chip" onClick={() => setWeight(q.kg)}>
                  {formatKg(q.kg)} <span className="muted small">{q.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <RepPad target={plan.reps} disabled={needsWeight} onPick={log} label={setsDone >= entry.targetSets ? 'Extra set? Tap reps' : 'Tap reps done'} />
      {needsWeight && <p className="center warn small">Set the weight first</p>}
    </section>
  );
}

/** Big rep buttons around the target: tapping one logs the set. "More" reveals the full range. */
function RepPad({ target, disabled, label, onPick }: { target: number; disabled: boolean; label: string; onPick: (reps: number) => void }) {
  const [all, setAll] = useState(false);
  const start = Math.max(1, target - 4);
  const numbers = all ? Array.from({ length: 30 }, (_, i) => i + 1) : Array.from({ length: 8 }, (_, i) => start + i);

  return (
    <div>
      <div className="stepper-label">{label}</div>
      <div className={`rep-pad${all ? ' all' : ''}`}>
        {numbers.map((n) => (
          <button key={n} className={`rep-btn${n === target ? ' target' : ''}`} disabled={disabled} onClick={() => onPick(n)} aria-label={`${n} reps`}>
            {n}
          </button>
        ))}
        <button className="rep-btn more" onClick={() => setAll(!all)}>{all ? 'Less' : 'More'}</button>
      </div>
    </div>
  );
}
