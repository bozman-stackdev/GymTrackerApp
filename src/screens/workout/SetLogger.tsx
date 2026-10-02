import { useMemo, useState } from 'react';
import { Stepper } from '../../components/Stepper';
import { editSet, logSet, logWarmupSet, setEntryEquipment, SET_LIMITS, undoWarmupSet } from '../../data/actions';
import { isActivity } from '../../logic/entries';
import { SetEditor } from '../../components/SetEditor';
import { unitStepKg, weightNumber } from '../../logic/units';
import { equipmentFor } from '../../logic/equipment';
import { useStore } from '../../data/store';
import { challengeFor, isSuccess, scoreExercise, type Challenge } from '../../logic/game/challenge';
import type { LiveSession } from '../../logic/game/progress';
import { formatWeight, formatSets, formatTarget, lastPerformance, workingWeight } from '../../logic/history';
import { PROGRESSION_DISCLAIMER, plannedSet, recommend } from '../../logic/progression';
import type { ActivityEntry, Exercise, StrengthEntry } from '../../types';
import { RepPad } from './RepPad';
import { Icon } from '../../components/Icon';
import { useMuscleInput } from '../../data/useMuscles';
import { analyseMuscles } from '../../logic/muscles/analysis';
import { muscleName, musclesFor } from '../../logic/muscles/catalog';
import { exerciseShare } from '../../logic/muscles/insights';
import { PROGRESS_LABEL } from '../../logic/muscles/labels';

/** Logging for the current exercise: weight (pre-filled) + one tap on the reps done. */
export function SetLogger({ exercise, entryIndex, live }: { exercise: Exercise; entryIndex: number; live: LiveSession }) {
  const { data, update } = useStore();
  const entry = data.activeWorkout!.session.entries[entryIndex] as StrengthEntry; // the screen only shows this for strength
  // Warm-up sets for this exercise live in their own warm-up item (never in `entry.sets`): see logWarmupSet.
  const warmup = data.activeWorkout!.session.entries.find((e): e is ActivityEntry => isActivity(e) && e.kind === 'warmup' && e.warmupFor === exercise.id);
  const warmupSets = warmup?.warmupSets ?? [];
  const last = lastPerformance(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const plan = plannedSet(rec, entry.sets, last);
  const challenge = challengeFor(exercise, data.sessions);
  const result = live.results.find((r) => r.exerciseId === exercise.id);
  const challengeDone = isSuccess(result?.outcome ?? null);

  const [weight, setWeight] = useState(plan.weightKg);
  const [showWhy, setShowWhy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // set being fixed (tap a done set)
  const [warmingUp, setWarmingUp] = useState(false);
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

  // My gym: which machine this is on (quiet one-liner; a picker only when there's more than one).
  const machines = equipmentFor(data.equipment, exercise.id);
  const machine = machines.find((m) => m.id === entry.equipmentId) ?? machines[0];

  const toggleWarmup = () => {
    // Warm-up weight starts at about half the working weight; back to the working weight afterwards.
    const working = entry.sets.at(-1)?.weightKg ?? plan.weightKg;
    if (usesWeight) setWeight(warmingUp ? working : Math.max(0, Math.round((working * 0.5) / exercise.weightStepKg) * exercise.weightStepKg));
    setWarmingUp(!warmingUp);
  };

  const log = (reps: number) => {
    const set = { reps, weightKg: usesWeight ? weight : 0 };
    if (warmingUp) {
      update((d) => logWarmupSet(d, entryIndex, set));
      navigator.vibrate?.(20);
      return;
    }
    // A slightly longer buzz when this set earns a reward.
    const scored = scoreExercise(exercise, [...entry.sets, { ...set, loggedAt: '' }], data.sessions);
    const rewarded = scored.challengeSetIndex === setsDone || scored.personalBestSetIndex === setsDone;
    update((d) => logSet(machine && !entry.equipmentId ? setEntryEquipment(d, entryIndex, machine.id) : d, entryIndex, set));
    navigator.vibrate?.(rewarded ? [40, 60, 40] : 30);
  };

  // One calm line; the explanation is one tap away so the rep pad stays on screen.
  const hint = rec.kind === 'first-time' ? `First time – pick a weight for ${exercise.repRange[0]}–${exercise.repRange[1]} reps` : rec.title;
  const waiting = rec.kind === 'first-time' || rec.kind === 'not-enough-data';

  return (
    <section className="stack logger">
      <div>
        <h1 className="ex-name">{exercise.name}</h1>
        {machine && (
          <div className="equipment-line small muted" data-testid="equipment">
            <Icon name="pin" size={15} />
            {machines.length > 1 ? (
              <select className="equipment-select" aria-label="Equipment" value={machine.id}
                onChange={(e) => update((d) => setEntryEquipment(d, entryIndex, e.target.value))}>
                {machines.map((m) => <option key={m.id} value={m.id}>{m.name}{m.gym ? ` (${m.gym})` : ''}</option>)}
              </select>
            ) : <span>{machine.name}</span>}
            {machine.settings && <span className="equipment-settings"><Icon name="settings" size={14} /> {machine.settings}</span>}
          </div>
        )}
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
        {showWhy && <ChallengeMuscles exercise={exercise} />}
      </div>

      {warmupSets.length > 0 && (
        <div className="warmup-sets" data-testid="warmup-sets" aria-label="Warm-up sets">
          <span className="muted small">Warm-up</span>
          {warmupSets.map((s, i) => (
            <span key={i} className="slot warmup">{s.weightKg > 0 ? `${weightNumber(s.weightKg)}×` : ''}{s.reps}</span>
          ))}
          <button className="btn ghost small" onClick={() => update((d) => undoWarmupSet(d, exercise.id))}>Undo</button>
        </div>
      )}
      <div className="slots" data-testid="sets-today" aria-label="Sets this workout">
        {Array.from({ length: Math.max(entry.targetSets, setsDone + 1) }, (_, i) => {
          const s = entry.sets[i];
          if (s) {
            return (
              <button key={i} className="slot done" aria-label={`Edit set ${i + 1}: ${s.weightKg > 0 ? `${formatWeight(s.weightKg)} × ` : ''}${s.reps} reps`}
                onClick={() => setEditing(i)}>
                {s.weightKg > 0 ? `${weightNumber(s.weightKg)}×` : ''}{s.reps}
              </button>
            );
          }
          return <span key={i} className={`slot${i === setsDone && !warmingUp ? ' next' : ''}`}>{i < entry.targetSets ? `Set ${i + 1}` : 'Extra'}</span>;
        })}
        <button className={`warmup-toggle${warmingUp ? ' on' : ''}`} aria-pressed={warmingUp} onClick={toggleWarmup}>
          Warm-up
        </button>
      </div>

      {usesWeight && (
        <div>
          <Stepper label="Weight" weight value={weight} step={unitStepKg(exercise.weightStepKg)} max={SET_LIMITS.maxWeightKg} onChange={setWeight} />
          {quickWeights.length > 0 && (
            <div className="chips quick-weights">
              {quickWeights.map((q) => (
                <button key={q.label} className="chip" onClick={() => setWeight(q.kg)}>
                  {formatWeight(q.kg)} <span className="muted small">{q.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <RepPad target={plan.reps} highlight={!warmingUp} disabled={needsWeight} onPick={log}
        label={warmingUp ? 'Warm-up set: tap reps' : setsDone >= entry.targetSets ? 'Extra set? Tap reps' : 'Tap reps done'} />
      {needsWeight && <p className="center warn small">Set the weight first</p>}
      {editing !== null && entry.sets[editing] && (
        <SetEditor
          title={`${exercise.name} · set ${editing + 1}`}
          set={entry.sets[editing]}
          usesWeight={usesWeight}
          weightStep={unitStepKg(exercise.weightStepKg)}
          onSave={(patch) => { update((d) => editSet(d, d.activeWorkout!.session.id, entryIndex, editing, patch)); setEditing(null); }}
          onDelete={() => { update((d) => editSet(d, d.activeWorkout!.session.id, entryIndex, editing, null)); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/** "TODAY'S CHALLENGE  60 kg × 9" - the one number to aim for. Tap for why. */
function ChallengeLine({ challenge, done, showWhy, onWhy }: { challenge: Challenge; done: boolean; showWhy: boolean; onWhy: () => void }) {
  const label = done ? 'Challenge complete'
    : challenge.kind === 'repeat' ? "Today's challenge · repeat"
    : challenge.kind === 'retry' ? "Today's challenge · try again"
    : "Today's challenge";
  return (
    <button className={`challenge${done ? ' done' : ''}`} data-testid="challenge" aria-expanded={showWhy} onClick={onWhy}>
      <span className="challenge-label with-icon">{done ? <Icon name="check" size={14} /> : <Icon name="target" size={14} />}{label}</span>
      <span className="challenge-target" data-testid="recommendation">
        {formatTarget(challenge)} <span className="why">{showWhy ? 'Hide' : 'Why?'}</span>
      </span>
    </button>
  );
}

/**
 * Muscle-map context in "Why?": what the exercise works, and how much of its main muscle's recent training it gives.
 * Information only - Today's Challenge comes from the progression engine alone and is never changed by the map.
 */
function ChallengeMuscles({ exercise }: { exercise: Exercise }) {
  const input = useMuscleInput();
  const { primary, secondary } = musclesFor(exercise);
  const context = useMemo(() => {
    const share = exerciseShare(exercise.id, input);
    if (!share || share.share < 0.3) return null;
    return { ...share, progress: analyseMuscles(input, '4w').progress[share.muscle].level };
  }, [exercise.id, input]);
  const names = (ids: typeof primary) => ids.map(muscleName).join(', ');
  return (
    <p className="muted small why-text" data-testid="challenge-muscles">
      Works {names(primary)}{secondary.length ? `, plus ${names(secondary).toLowerCase()}` : ''}.
      {context && ` Your main ${muscleName(context.muscle).toLowerCase()} exercise lately (${Math.round(context.share * 100)}% of its sets in 4 weeks)`}
      {context && context.progress !== 'none' && ` · ${muscleName(context.muscle).toLowerCase()} training progress: ${PROGRESS_LABEL[context.progress].toLowerCase()}`}
      {context && '.'}
    </p>
  );
}
