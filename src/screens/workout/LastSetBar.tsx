import { streakText } from '../../components/ProgressWidgets';
import { formatDuration, useNow } from '../../components/useNow';
import { useExerciseLookup, useStore } from '../../data/store';
import { challengeFor } from '../../logic/game/challenge';
import { GAME_CONFIG } from '../../logic/game/config';
import { challengeXp, type LiveSession } from '../../logic/game/progress';
import { formatKg, formatTarget } from '../../logic/history';
import type { WorkoutSession } from '../../types';

/**
 * The most recent set of the whole workout, with rest time and undo. Derived from saved data, so it survives a reload.
 * When that set completed Today's Challenge or was a personal best, it briefly becomes a small reward.
 */
export function LastSetBar({ session, live, onUndo }: { session: WorkoutSession; live: LiveSession; onUndo: (entryIndex: number) => void }) {
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

  const result = live.results.find((r) => r.exerciseId === entry.exerciseId);
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

  const xp = (challengeDone && result?.challenge ? challengeXp(result.challenge) : 0) + (personalBest ? GAME_CONFIG.xp.personalBest : 0);
  // Next challenge, as if today were finished - only shown when the engine has one.
  const next = challengeDone ? challengeFor(exercise, [...data.sessions, { ...session, finishedAt: loggedAt }]) : null;
  return (
    <div className="last-bar reward" data-testid="last-set" aria-live="polite">
      <div className="grow">
        <div className="reward-title" data-testid="reward">{personalBest ? '🏆 NEW PERSONAL BEST!' : '✓ CHALLENGE COMPLETE'}</div>
        <div className="small"><strong className="xp">+{xp} XP</strong> · {streakText(live.streakWeeks)}</div>
        {next && <div className="small muted reward-next">Next time: {formatTarget(next)}</div>}
      </div>
      <div className="reward-side">{rest}{undo}</div>
    </div>
  );
}
