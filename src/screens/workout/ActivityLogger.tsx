import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { KindLabel } from '../../components/activityUi';
import { Stepper } from '../../components/Stepper';
import { completeActivity, goToExercise, reopenActivity } from '../../data/actions';
import { useExerciseLookup, useStore } from '../../data/store';
import { activityById, activityName, METRIC_LIMITS, type Metric } from '../../logic/activities';
import { cardioSuggestion, formatMetrics, fromShownMetric, lastActivity, METRIC_LABEL, metricUnit, toShownMetric } from '../../logic/cardio';
import { isStrength } from '../../logic/entries';
import { formatSets } from '../../logic/history';
import type { ActivityEntry, CardioMetrics } from '../../types';

/**
 * A cardio / warm-up / cool-down item in the workout: last time, an optional gentle hint, only the fields that make
 * sense for the activity (prefilled), and one tap on Complete. "Run, 20 minutes" is one stepper and one tap.
 */
export function ActivityLogger({ entry, entryIndex }: { entry: ActivityEntry; entryIndex: number }) {
  return entry.warmupFor ? <WarmupSetsView entry={entry} /> : <MetricsLogger key={entryIndex} entry={entry} entryIndex={entryIndex} />;
}

function MetricsLogger({ entry, entryIndex }: { entry: ActivityEntry; entryIndex: number }) {
  const { data, update } = useStore();
  const activity = activityById(entry.activityId);
  const last = lastActivity(data.sessions, entry.activityId, entry.kind);
  const suggestion = entry.kind === 'cardio' ? cardioSuggestion(data.sessions, entry.activityId) : null;
  const [values, setValues] = useState<CardioMetrics>(() => entry.log ?? entry.plan ?? last?.metrics ?? {});
  const done = !!entry.doneAt;

  const set = (metric: Metric, v: number | undefined) => setValues((m) => ({ ...m, [metric]: v && v > 0 ? v : undefined }));
  const fields = activity.metrics.filter((m) => m !== 'durationMin');
  // Keep the screen calm: up to three main fields; heart rate and calories (and any others) behind "More".
  const main: Metric[] = fields.filter((m) => m !== 'avgHeartRate' && m !== 'calories').slice(0, 3);
  const more = fields.filter((m) => !main.includes(m));

  return (
    <section className="stack logger" data-testid="activity">
      <div>
        <KindLabel kind={entry.kind} />
        <h1 className="ex-name">{activityName(entry)}</h1>
        <p className="muted last-session" data-testid="last-time">
          Last session: <strong>{last ? formatMetrics(last.metrics, entry.activityId) || 'done' : '—'}</strong>
        </p>
        {entry.plan && <p className="small flush" data-testid="plan">Plan: <strong>{formatMetrics(entry.plan, entry.activityId)}</strong></p>}
        {suggestion && !done && <p className="rec-line flush" data-testid="cardio-suggestion">{suggestion.text}</p>}
      </div>

      {done ? (
        <div className="card stack" data-testid="activity-done">
          <div className="with-icon"><Icon name="check" className="accent" /> <strong>Done</strong>
            <span className="muted">{formatMetrics(entry.log, entry.activityId)}</span></div>
          <button className="btn" onClick={() => update((d) => reopenActivity(d, entryIndex))}>Change</button>
        </div>
      ) : (
        <>
          <Stepper label="Minutes" value={values.durationMin ?? 0} step={1} min={0} max={METRIC_LIMITS.durationMin.max}
            onChange={(v) => set('durationMin', v)} />
          {main.length > 0 && (
            <div className="metric-grid">
              {main.map((m) => <MetricField key={m} metric={m} activityId={entry.activityId} value={values[m]} onChange={(v) => set(m, v)} />)}
            </div>
          )}
          {more.length > 0 && (
            <details className="more-metrics">
              <summary className="muted small">More (optional): {more.map((m) => METRIC_LABEL[m].toLowerCase()).join(', ')}</summary>
              <div className="metric-grid">
                {more.map((m) => <MetricField key={m} metric={m} activityId={entry.activityId} value={values[m]} onChange={(v) => set(m, v)} />)}
              </div>
            </details>
          )}
          <button className="btn primary huge" onClick={() => update((d) => completeActivity(d, entryIndex, values))}>
            <Icon name="check" size={26} /> Complete
          </button>
        </>
      )}
    </section>
  );
}

/** One optional number field in the user's units (km or mi, km/h or mph, metres for rowing). */
function MetricField({ metric, activityId, value, onChange }: { metric: Metric; activityId: string; value?: number; onChange: (v: number | undefined) => void }) {
  const shown = value === undefined ? '' : String(toShownMetric(metric, value, activityId));
  const [draft, setDraft] = useState<string | null>(null);
  const unit = metricUnit(metric, activityId);
  const id = `metric-${metric}`;
  return (
    <div className="metric-field">
      <label htmlFor={id} className="field-label">{METRIC_LABEL[metric]}{unit ? ` (${unit})` : ''}</label>
      <input id={id} className="input" inputMode="decimal" value={draft ?? shown} placeholder="–"
        onFocus={(e) => { setDraft(shown); e.target.select(); }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() === '') onChange(undefined);
          else if (Number.isFinite(n) && n >= 0) onChange(Math.min(fromShownMetric(metric, n, activityId), METRIC_LIMITS[metric].max));
        }} />
    </div>
  );
}

/** Warm-up sets are logged on the exercise itself; this only shows them (and leads back) if this item is selected. */
function WarmupSetsView({ entry }: { entry: ActivityEntry }) {
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const target = data.activeWorkout?.session.entries.findIndex((e) => isStrength(e) && e.exerciseId === entry.warmupFor) ?? -1;
  return (
    <section className="stack logger" data-testid="activity">
      <div>
        <KindLabel kind="warmup" />
        <h1 className="ex-name">{getExercise(entry.warmupFor!).name}</h1>
        <p className="muted last-session">Warm-up sets: <strong>{formatSets(entry.warmupSets ?? [])}</strong></p>
      </div>
      {target >= 0 && (
        <button className="btn primary huge" onClick={() => update((d) => goToExercise(d, target))}>
          Back to {getExercise(entry.warmupFor!).name}
        </button>
      )}
    </section>
  );
}
