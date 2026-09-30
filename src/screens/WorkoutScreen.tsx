import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Stepper } from '../components/Stepper';
import { formatDuration, useNow } from '../components/useNow';
import { useWakeLock } from '../components/useWakeLock';
import { discardWorkout, finishWorkout, goToExercise, logSet, undoLastSet } from '../data/actions';
import { useExerciseLookup, useStore } from '../data/store';
import { useProgress } from '../data/useProgress';
import { streakText } from '../components/ProgressWidgets';
import { challengeFor, isSuccess, scoreExercise, type Challenge } from '../logic/game/challenge';
import { GAME_CONFIG } from '../logic/game/config';
import type { Progress } from '../logic/game/progress';
import { formatKg, formatSets, formatTarget, lastPerformance, workingWeight } from '../logic/history';
import { PROGRESSION_DISCLAIMER, plannedSet, recommend } from '../logic/progression';
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
  const progress = useProgress(true); // includes this workout, for instant feedback
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
      <LastSetBar session={session} progress={progress} onUndo={(i) => update((d) => undoLastSet(d, i))} />

      {allDone && (
        <button className="btn primary huge" onClick={() => finish(false)}>✓ Finish workout</button>
      )}

      {entry ? (
        <SetLogger key={currentIndex} exercise={getExercise(entry.exerciseId)} entryIndex={currentIndex} progress={progress} />
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

/**
 * The most recent set of the whole workout, with rest time and undo. Derived from saved data, so it survives a reload.
 * When that set completed Today's Challenge or was a personal best, it briefly becomes a small reward.
 */
function LastSetBar({ session, progress, onUndo }: { session: WorkoutSession; progress: Progress; onUndo: (entryIndex: number) => void }) {
  const { data } = useStore();
  const getExercise = useExerciseLookup();
  const now = useNow();
  let latest: { entryIndex: number; setIndex: number; loggedAt: string } | undefined;
  session.entries.forEach((e, i) => {
    const s = e.sets.at(-1);
    if (s && (!latest || s.loggedAt > latest.loggedAt)) latest = { entryIndex: i, setIndex: e.sets.length - 1, loggedAt: s.loggedAt };
  });
  if (!latest) return null;
  const { entryIndex, setIndex, loggedAt } = latest;
  const entry = session.entries[entryIndex];
  const exercise = getExercise(entry.exerciseId);
  const set = entry.sets[setIndex];
  const text = `${set.weightKg > 0 ? `${formatKg(set.weightKg)} × ` : ''}${set.reps}`;
  const rest = <span className="muted small" aria-label="Rest time">{formatDuration(now - Date.parse(loggedAt))}</span>;
  const undo = <button className="btn ghost" onClick={() => onUndo(entryIndex)}>Undo</button>;

  const result = progress.bySession.get(session.id)?.results.find((r) => r.exerciseId === entry.exerciseId);
  const challengeDone = result?.challengeSetIndex === setIndex;
  const personalBest = result?.personalBestSetIndex === setIndex;

  if (!challengeDone && !personalBest) {
    return (
      <div className="last-bar" data-testid="last-set" aria-live="polite">
        <span className="last-bar-text">✓ <strong>{text}</strong> <span className="muted">{exercise.name}</span></span>
        {rest}
        {undo}
      </div>
    );
  }

  const xp = (challengeDone ? GAME_CONFIG.xp.challenge : 0) + (personalBest ? GAME_CONFIG.xp.personalBest : 0);
  // Next challenge, as if today were finished - only shown when the engine has one.
  const next = challengeDone ? challengeFor(exercise, [...data.sessions, { ...session, finishedAt: loggedAt }]) : null;
  return (
    <div className="last-bar reward" data-testid="last-set" aria-live="polite">
      <div className="grow">
        <div className="reward-title" data-testid="reward">{personalBest ? '🏆 NEW PERSONAL BEST!' : '✓ CHALLENGE COMPLETE'}</div>
        <div className="small"><strong className="xp">+{xp} XP</strong> · {streakText(progress.streakWeeks)}</div>
        {next && <div className="small muted reward-next">Next time: {formatTarget(next)}</div>}
      </div>
      <div className="reward-side">{rest}{undo}</div>
    </div>
  );
}


/** Logging for the current exercise: weight (pre-filled) + one tap on the reps done. */
function SetLogger({ exercise, entryIndex, progress }: { exercise: Exercise; entryIndex: number; progress: Progress }) {
  const { data, update } = useStore();
  const entry = data.activeWorkout!.session.entries[entryIndex];
  const last = lastPerformance(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const plan = plannedSet(rec, entry.sets, last);
  const challenge = challengeFor(exercise, data.sessions);
  const result = progress.bySession.get(data.activeWorkout!.session.id)?.results.find((r) => r.exerciseId === exercise.id);
  const challengeDone = isSuccess(result?.outcome ?? null);

  const [weight, setWeight] = useState(plan.weightKg);
  const [showWhy, setShowWhy] = useState(false);
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
    const set = { reps, weightKg: usesWeight ? weight : 0 };
    // A slightly longer buzz when this set earns a reward.
    const scored = scoreExercise(exercise, [...entry.sets, { ...set, loggedAt: '' }], data.sessions);
    const rewarded = scored.challengeSetIndex === setsDone || scored.personalBestSetIndex === setsDone;
    update((d) => logSet(d, entryIndex, set));
    navigator.vibrate?.(rewarded ? [40, 60, 40] : 30);
  };

  // One calm line; the explanation is one tap away so the rep pad stays on screen.
  const hint = rec.kind === 'first-time' ? `First time – pick a weight for ${exercise.repRange[0]}–${exercise.repRange[1]} reps` : rec.title;
  const waiting = rec.kind === 'first-time' || rec.kind === 'not-enough-data';

  return (
    <section className="stack logger">
      <div>
        <h1 className="ex-name">{exercise.name}</h1>
        <p className="muted last-session" data-testid="last-time">
          Last session: <strong>{last ? formatSets(last.sets) : '—'}</strong>
        </p>
        {challenge ? (
          <ChallengeLine challenge={challenge} done={challengeDone} showWhy={showWhy} onWhy={() => setShowWhy(!showWhy)} />
        ) : (
          <button className={`rec-line${waiting ? ' wait' : ''}`} data-testid="recommendation" aria-expanded={showWhy} onClick={() => setShowWhy(!showWhy)}>
            {hint} <span className="why">{showWhy ? 'Hide' : 'Why?'}</span>
          </button>
        )}
        {showWhy && (
          <p className="muted small why-text" data-testid="recommendation-reason">
            {rec.reason} <span className="disclaimer">{PROGRESSION_DISCLAIMER}</span>
          </p>
        )}
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

/** "TODAY'S CHALLENGE  60 kg × 9" - the one number to aim for. Tap for why. */
function ChallengeLine({ challenge, done, showWhy, onWhy }: { challenge: Challenge; done: boolean; showWhy: boolean; onWhy: () => void }) {
  const label = done ? '✓ Challenge complete' : challenge.kind === 'repeat' ? "Today's challenge · repeat" : "Today's challenge";
  return (
    <button className={`challenge${done ? ' done' : ''}`} data-testid="challenge" aria-expanded={showWhy} onClick={onWhy}>
      <span className="challenge-label">{label}</span>
      <span className="challenge-target" data-testid="recommendation">
        {formatTarget(challenge)} <span className="why">{showWhy ? 'Hide' : 'Why?'}</span>
      </span>
    </button>
  );
}
