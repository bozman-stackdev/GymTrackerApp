import { useState } from 'react';
import { Stepper } from '../../components/Stepper';
import { logSet, SET_LIMITS } from '../../data/actions';
import { useStore } from '../../data/store';
import { challengeFor, isSuccess, scoreExercise, type Challenge } from '../../logic/game/challenge';
import type { LiveSession } from '../../logic/game/progress';
import { formatKg, formatSets, formatTarget, lastPerformance, workingWeight } from '../../logic/history';
import { PROGRESSION_DISCLAIMER, plannedSet, recommend } from '../../logic/progression';
import type { Exercise } from '../../types';
import { RepPad } from './RepPad';

/** Logging for the current exercise: weight (pre-filled) + one tap on the reps done. */
export function SetLogger({ exercise, entryIndex, live }: { exercise: Exercise; entryIndex: number; live: LiveSession }) {
  const { data, update } = useStore();
  const entry = data.activeWorkout!.session.entries[entryIndex];
  const last = lastPerformance(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const plan = plannedSet(rec, entry.sets, last);
  const challenge = challengeFor(exercise, data.sessions);
  const result = live.results.find((r) => r.exerciseId === exercise.id);
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
          <Stepper label="Weight" suffix="kg" value={weight} step={exercise.weightStepKg} max={SET_LIMITS.maxWeightKg} decimals onChange={setWeight} />
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
