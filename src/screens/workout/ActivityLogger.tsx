import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { KindLabel } from '../../components/activityUi';
import { Stepper } from '../../components/Stepper';
import { useNow } from '../../components/useNow';
import { adjustActivityDuration, doneActivity, goToExercise, restartActivity, startActivityTimer, stopActivityTimer } from '../../data/actions';
import { useExerciseLookup, useStore } from '../../data/store';
import { activityName, KIND_LABEL } from '../../logic/activities';
import {
  activityDurationSec, durationChange, elapsedSec, formatChange, formatClock, formatDuration, isRunning, lastActivity, MIN_CARDIO_SEC,
} from '../../logic/cardio';
import { isStrength } from '../../logic/entries';
import { GAME_CONFIG } from '../../logic/game/config';
import { formatSets } from '../../logic/history';
import type { ActivityEntry } from '../../types';

/**
 * A cardio / warm-up / cool-down item: a stopwatch. START → do it → STOP → saved. Nothing to type.
 * The time is always worked out from the start timestamp (saved with the workout), so it stays right when the
 * screen locks, the browser is in the background, or the app is reopened.
 */
export function ActivityLogger({ entry, entryIndex }: { entry: ActivityEntry; entryIndex: number }) {
  return entry.warmupFor ? <WarmupSetsView entry={entry} /> : <ActivityTimer entry={entry} entryIndex={entryIndex} />;
}

function ActivityTimer({ entry, entryIndex }: { entry: ActivityEntry; entryIndex: number }) {
  const { data, update } = useStore();
  const previous = lastActivity(data.sessions, entry.activityId, entry.kind);
  const running = isRunning(entry);
  const done = !!entry.doneAt;
  const hint = previous ? `Previous: ${formatDuration(previous.durationSec)}` : entry.plan?.durationMin ? `Plan: ${entry.plan.durationMin} min` : null;

  return (
    <section className="stack logger activity-timer" data-testid="activity" data-state={done ? 'done' : running ? 'running' : 'ready'}>
      <div>
        <KindLabel kind={entry.kind} />
        <h1 className="ex-name">{activityName(entry)}</h1>
        {!done && hint && <p className="muted last-session" data-testid="last-time">{hint}</p>}
      </div>

      {done ? <DoneCard entry={entry} entryIndex={entryIndex} previousSec={previous?.durationSec} />
        : running ? (
          <>
            <RunningClock startedAt={entry.startedAt!} />
            <button className="btn huge timer-btn stop" onClick={() => update((d) => stopActivityTimer(d, entryIndex))}>
              <Icon name="stop" size={26} /> STOP
            </button>
          </>
        ) : (
          <>
            <div className="timer-clock" data-testid="timer" aria-label="Timer 0 seconds">00:00:00</div>
            <button className="btn primary huge timer-btn" onClick={() => update((d) => startActivityTimer(d, entryIndex))}>
              <Icon name="play" size={26} /> START
            </button>
          </>
        )}
    </section>
  );
}

/** The live stopwatch: re-rendered every second, but the value is always now - start (never a counter). */
export function RunningClock({ startedAt, small }: { startedAt: string; small?: boolean }) {
  const now = useNow();
  const sec = elapsedSec(startedAt, now);
  return small ? <span className="timer-small" data-testid="timer-small">{formatDuration(sec)}</span>
    : <div className="timer-clock running" data-testid="timer" role="timer" aria-live="off">{formatClock(sec)}</div>;
}

function DoneCard({ entry, entryIndex, previousSec }: { entry: ActivityEntry; entryIndex: number; previousSec?: number }) {
  const { data, update } = useStore();
  const [adjusting, setAdjusting] = useState(false);
  const sec = activityDurationSec(entry);
  const change = durationChange(previousSec, sec);
  // The workout's cardio XP is earned once: show it on the item that earned it.
  const earner = data.activeWorkout?.session.entries.find((e): e is ActivityEntry =>
    !isStrength(e) && e.kind === 'cardio' && !!e.doneAt && activityDurationSec(e) >= MIN_CARDIO_SEC);
  const xp = entry.kind === 'cardio' && earner === entry ? GAME_CONFIG.xp.cardio : 0;

  return (
    <div className="card stack timer-done" data-testid="activity-done">
      <div className="timer-done-title with-icon"><Icon name="check" size={22} className="accent" /> {KIND_LABEL[entry.kind].toUpperCase()} COMPLETE</div>
      <div className="timer-clock done" data-testid="duration">{formatDuration(sec)}</div>
      {xp > 0 && <div className="xp center" data-testid="activity-xp">+{xp} XP</div>}
      {change && (
        <p className="muted small center flush" data-testid="duration-change">
          Previous {formatDuration(change.previous)} · Today {formatDuration(change.today)} · <strong>{formatChange(change.change)}</strong>
        </p>
      )}
      <button className="btn primary huge timer-btn" onClick={() => update((d) => doneActivity(d, entryIndex))}>DONE</button>
      {adjusting ? (
        <Stepper label="Minutes" value={Math.round(sec / 60)} step={1} min={0} max={600}
          onChange={(v) => update((d) => adjustActivityDuration(d, entryIndex, v * 60))} />
      ) : (
        <div className="row center-row">
          <button className="btn ghost small" onClick={() => setAdjusting(true)}>Adjust time</button>
          <button className="btn ghost small" onClick={() => update((d) => restartActivity(d, entryIndex))}>Restart</button>
        </div>
      )}
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
