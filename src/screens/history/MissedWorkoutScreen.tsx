import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ActivityPicker, KindTabs } from '../../components/AddItemChoices';
import { ExercisePicker } from '../../components/ExercisePicker';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { KindLabel } from '../../components/activityUi';
import { FREESTYLE_NAME, MANUAL_LIMITS, manualDateProblem, sameDayWorkouts, saveManualWorkout, toManualInput, type ManualItem, type ManualWorkoutInput } from '../../data/manual';
import { newId } from '../../data/actions';
import { useExerciseLookup, useStore } from '../../data/store';
import { activityName } from '../../logic/activities';
import { isStrengthItem } from '../../logic/entries';
import { dayKey } from '../../logic/leaderboard/score';
import { fromDisplay, getUnits, toDisplay } from '../../logic/units';
import type { ActivityKind, AppData, EntryKind } from '../../types';

/** Form rows keep what's typed as text; numbers are read on save. */
type SetRow = { reps: string; weight: string };
type Row = { type: 'strength'; exerciseId: string; sets: SetRow[] } | { type: 'activity'; kind: ActivityKind; activityId: string; name?: string; minutes: string };

const DURATIONS = [30, 45, 60, 90];
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
const yesterday = () => dayKey(new Date(Date.now() - 86_400_000));

/**
 * /history/add (?edit=<id>) - a workout that already happened but wasn't tracked. Date and type are enough; exercises,
 * sets, cardio, duration and a note are optional. Nothing is filled in from earlier workouts.
 */
export function MissedWorkoutScreen() {
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = params.get('edit') ? data.sessions.find((s) => s.id === params.get('edit') && s.manual) : undefined;
  const start = editing ? toManualInput(editing) : null;

  const [date, setDate] = useState(start?.date ?? yesterday());
  const [routineId, setRoutineId] = useState<string | undefined>(start?.routineId);
  const [duration, setDuration] = useState(start?.durationMin ? String(start.durationMin) : '');
  const [note, setNote] = useState(start?.note ?? '');
  const [rows, setRows] = useState<Row[]>(() => (start?.items ?? []).map((i): Row => (i.type === 'strength'
    ? { type: 'strength', exerciseId: i.exerciseId, sets: i.sets.map((s) => ({ reps: String(s.reps ?? ''), weight: s.weightKg === null ? '' : String(round1(toDisplay(s.weightKg))) })) }
    : { type: 'activity', kind: i.kind, activityId: i.activityId, name: i.name, minutes: i.minutes ? String(i.minutes) : '' })));
  const [adding, setAdding] = useState<EntryKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened] = useState(() => new Date()); // "today" for the date limits, fixed while the form is open

  if (params.get('edit') && !editing) return <Navigate to="/history" replace />;

  const routine = data.routines.find((r) => r.id === routineId);
  const dateProblem = manualDateProblem(date, opened);
  const sameDay = dateProblem ? [] : sameDayWorkouts(data.sessions, date, editing?.id);
  const units = getUnits();

  const setRow = (i: number, row: Row) => setRows(rows.map((r, k) => (k === i ? row : r)));
  const removeRow = (i: number) => setRows(rows.filter((_, k) => k !== i));
  const addRoutineExercises = () => {
    if (!routine) return;
    const have = new Set(rows.flatMap((r) => (r.type === 'strength' ? [r.exerciseId] : [])));
    const add = routine.items.filter(isStrengthItem).filter((i) => !have.has(i.exerciseId))
      .map((i): Row => ({ type: 'strength', exerciseId: i.exerciseId, sets: [] }));
    setRows([...rows, ...add]);
  };

  const save = () => {
    const items: ManualItem[] = rows.map((r) => (r.type === 'strength'
      ? { type: 'strength', exerciseId: r.exerciseId, sets: r.sets.map((s) => ({ reps: num(s.reps), weightKg: num(s.weight) === null ? null : fromDisplay(num(s.weight)!) })) }
      : { type: 'activity', kind: r.kind, activityId: r.activityId, name: r.name, minutes: num(r.minutes) }));
    const saved = persist(data, update, { id: editing?.id, date, routineId, durationMin: num(duration), note, items });
    if ('error' in saved) { setError(saved.error); return; }
    navigate(editing ? `/history/${saved.id}` : '/history', { replace: true, state: { added: saved.id } });
  };

  return (
    <Screen title={editing ? 'Edit missed workout' : 'Add missed workout'} back help="missed-workout">
      <p className="muted small flush">For a workout you did but didn't track. It's saved to your history on its date. Added workouts don't earn XP.</p>

      <label className="field">
        Date
        <input className="input" type="date" value={date} max={dayKey(opened)} min={MANUAL_LIMITS.earliest} aria-invalid={!!dateProblem}
          onChange={(e) => { setDate(e.target.value); setError(null); }} />
        {dateProblem && <span className="field-error">{dateProblem}</span>}
      </label>
      {sameDay.length > 0 && (
        <p className="small flush warn-note" role="status" data-testid="same-day">
          You already have {sameDay.map((s) => s.name).join(' and ')} on this day. Save anyway if it was a separate session.
        </p>
      )}

      <div className="field">
        <span className="muted small">Workout</span>
        <div className="chips" role="group" aria-label="Workout">
          <button type="button" className={`chip${!routineId ? ' on' : ''}`} aria-pressed={!routineId} onClick={() => setRoutineId(undefined)}>{FREESTYLE_NAME}</button>
          {data.routines.map((r) => (
            <button key={r.id} type="button" className={`chip${routineId === r.id ? ' on' : ''}`} aria-pressed={routineId === r.id} onClick={() => setRoutineId(r.id)}>{r.name}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="muted small">Duration (optional)</span>
        <div className="row duration-row">
          {DURATIONS.map((m) => (
            <button key={m} type="button" className={`chip${duration === String(m) ? ' on' : ''}`} aria-pressed={duration === String(m)}
              onClick={() => setDuration(duration === String(m) ? '' : String(m))}>{m} min</button>
          ))}
          <input className="input duration-input" inputMode="numeric" type="number" min={1} max={MANUAL_LIMITS.maxDurationMin} placeholder="min"
            aria-label="Duration in minutes" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>

      <h2 className="flush">Exercises <span className="muted small">(optional)</span></h2>
      {rows.length === 0 && <p className="muted small flush">Add what you remember - or nothing at all.</p>}
      <div className="stack missed-rows">
        {rows.map((r, i) => r.type === 'strength' ? (
          <StrengthRow key={i} row={r} name={getExercise(r.exerciseId).name} usesWeight={getExercise(r.exerciseId).weightStepKg > 0} units={units}
            onChange={(row) => setRow(i, row)} onRemove={() => removeRow(i)} />
        ) : (
          <div key={i} className="card stack tight" data-testid="missed-activity">
            <div className="row between">
              <div><KindLabel kind={r.kind} /><div className="title">{activityName(r)}</div></div>
              <button type="button" className="btn ghost small" onClick={() => removeRow(i)}>Remove</button>
            </div>
            <label className="field inline-field">
              Minutes
              <input className="input" inputMode="numeric" type="number" min={1} max={MANUAL_LIMITS.maxCardioMin} placeholder="optional" value={r.minutes}
                onChange={(e) => setRow(i, { ...r, minutes: e.target.value })} />
            </label>
          </div>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn grow" onClick={() => setAdding('strength')}><Icon name="plus" /> Exercise</button>
        <button type="button" className="btn grow" onClick={() => setAdding('cardio')}><Icon name="plus" /> Cardio</button>
      </div>
      {routine && routine.items.some(isStrengthItem) && (
        <button type="button" className="btn ghost block" onClick={addRoutineExercises}>Add {routine.name}'s exercises</button>
      )}

      <label className="field">
        Note (optional)
        <textarea className="input note-input" maxLength={MANUAL_LIMITS.maxNote} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <p className="field-error flush" role="alert">{error}</p>}
      <button type="button" className="btn primary huge" disabled={!!dateProblem} onClick={save}>{editing ? 'Save changes' : 'Save workout'}</button>
      <button type="button" className="btn ghost block" onClick={() => navigate(-1)}>Cancel</button>

      {adding && (
        <Sheet title="Add to this workout" onClose={() => setAdding(null)} testId="missed-add">
          <KindTabs value={adding} onChange={setAdding} />
          {adding === 'strength' ? (
            <ExercisePicker exercises={data.exercises} onPick={(e) => { setRows([...rows, { type: 'strength', exerciseId: e.id, sets: [] }]); setAdding(null); }} />
          ) : (
            <ActivityPicker kind={adding as ActivityKind} onPick={(activityId, name) => {
              setRows([...rows, { type: 'activity', kind: adding as ActivityKind, activityId, name, minutes: '' }]);
              setAdding(null);
            }} />
          )}
        </Sheet>
      )}
    </Screen>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Checks against the data on screen, then applies the same change (same id and time) to the latest data. */
function persist(data: AppData, update: (fn: (d: AppData) => AppData) => void, input: ManualWorkoutInput): { id: string } | { error: string } {
  const now = new Date();
  const id = input.id ?? newId();
  const check = saveManualWorkout(data, input, now, id);
  if ('error' in check) return check;
  update((d) => { const r = saveManualWorkout(d, input, now, id); return 'data' in r ? r.data : d; });
  return { id };
}

/** One exercise: the sets the user remembers. Empty to start with; "Repeat" copies the set above only when tapped. */
function StrengthRow({ row, name, usesWeight, units, onChange, onRemove }: {
  row: Extract<Row, { type: 'strength' }>; name: string; usesWeight: boolean; units: string; onChange: (r: Row) => void; onRemove: () => void;
}) {
  const setSet = (k: number, s: SetRow) => onChange({ ...row, sets: row.sets.map((x, j) => (j === k ? s : x)) });
  return (
    <div className="card stack tight" data-testid="missed-exercise">
      <div className="row between">
        <div className="title">{name}</div>
        <button type="button" className="btn ghost small" onClick={onRemove}>Remove</button>
      </div>
      {row.sets.length > 0 && (
        <div className="row missed-set missed-set-head muted small" aria-hidden>
          <span className="set-no" />{usesWeight && <span className="grow">{units}</span>}<span className="grow">reps</span><span className="icon-btn-space" />
        </div>
      )}
      {row.sets.map((s, k) => (
        <div key={k} className="row missed-set">
          <span className="muted small set-no">{k + 1}</span>
          {usesWeight && (
            <input className="input" inputMode="decimal" type="number" min={0} step="any" placeholder={units} aria-label={`${name} set ${k + 1} weight (${units})`}
              value={s.weight} onChange={(e) => setSet(k, { ...s, weight: e.target.value })} />
          )}
          <input className="input" inputMode="numeric" type="number" min={1} max={100} placeholder="reps" aria-label={`${name} set ${k + 1} reps`}
            value={s.reps} onChange={(e) => setSet(k, { ...s, reps: e.target.value })} />
          <button type="button" className="icon-btn" aria-label={`Remove ${name} set ${k + 1}`} onClick={() => onChange({ ...row, sets: row.sets.filter((_, j) => j !== k) })}>
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn small grow" onClick={() => onChange({ ...row, sets: [...row.sets, { reps: '', weight: '' }] })}><Icon name="plus" size={16} /> Set</button>
        {row.sets.length > 0 && (
          <button type="button" className="btn small grow" onClick={() => onChange({ ...row, sets: [...row.sets, { ...row.sets.at(-1)! }] })}>Repeat set</button>
        )}
      </div>
      {row.sets.length === 0 && <p className="muted small flush">No sets? It's saved as done, without details.</p>}
    </div>
  );
}
