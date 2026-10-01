import { formatDuration, useNow } from '../../components/useNow';
import { useExerciseLookup, useStore } from '../../data/store';
import { challengeFor, isSuccess, type ExerciseResult } from '../../logic/game/challenge';
import { GAME_CONFIG } from '../../logic/game/config';
import { challengeXp, type LiveSession } from '../../logic/game/progress';
import { formatWeight, formatTarget } from '../../logic/history';
import type { WorkoutSession } from '../../types';
import { Icon, type IconName } from '../../components/Icon';

type Feedback = 'personal-best' | 'mastered' | 'comeback' | 'hit' | 'matched' | 'not-today';

const TITLES: Record<Feedback, string> = {
  'personal-best': 'NEW PERSONAL BEST!',
  mastered: 'LEVEL MASTERED',
  comeback: 'BACK ON TRACK',
  hit: 'TARGET HIT',
  matched: 'SOLID – MATCHED LAST TIME',
  'not-today': 'NOT TODAY',
};
const ICONS: Partial<Record<Feedback, IconName>> = { 'personal-best': 'trophy', mastered: 'star', comeback: 'check', hit: 'check', matched: 'check' };

/**
 * What the latest set earned. Challenge hit / personal best show on the set that did it;
 * mastery, "matched" and "not today" show once the planned sets for the exercise are done (they depend on all sets).
 */
function feedbackFor(r: ExerciseResult | undefined, setIndex: number, targetSets: number): { list: Feedback[]; xp: number } {
  const list: Feedback[] = [];
  let xp = 0;
  if (!r) return { list, xp };
  const exerciseDone = setIndex === targetSets - 1;
  if (r.challengeSetIndex === setIndex) {
    list.push(r.comeback ? 'comeback' : 'hit');
    xp += challengeXp(r.challenge!) + (r.comeback ? GAME_CONFIG.xp.comeback : 0);
  }
  if (r.personalBestSetIndex === setIndex) { list.push('personal-best'); xp += GAME_CONFIG.xp.personalBest; }
  if (exerciseDone && r.weightMastered) { list.push('mastered'); xp += GAME_CONFIG.xp.mastery; }
  if (exerciseDone && r.challenge && !isSuccess(r.outcome)) list.push(r.outcome === 'matched' ? 'matched' : 'not-today');
  const order: Feedback[] = ['personal-best', 'mastered', 'comeback', 'hit', 'matched', 'not-today'];
  return { list: list.sort((a, b) => order.indexOf(a) - order.indexOf(b)), xp };
}

/**
 * The most recent set of the whole workout, with rest time and undo. Derived from saved data, so it survives a reload.
 * When that set earned something (or finished an exercise), it briefly becomes a small result card.
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
  const text = `${set.weightKg > 0 ? `${formatWeight(set.weightKg)} × ` : ''}${set.reps}`;
  const rest = <span className="muted small" aria-label="Rest time">{formatDuration(now - Date.parse(loggedAt))}</span>;
  const undo = <button className="btn ghost" onClick={() => onUndo(entryIndex)}>Undo</button>;

  const result = live.results.find((r) => r.exerciseId === entry.exerciseId);
  const { list, xp } = feedbackFor(result, setIndex, entry.targetSets);

  if (list.length === 0) {
    return (
      <div className="last-bar" data-testid="last-set" aria-live="polite">
        <span className="last-bar-text with-icon"><Icon name="check" size={16} className="accent" /> <strong>{text}</strong> <span className="muted">{exercise.name}</span></span>
        {rest}
        {undo}
      </div>
    );
  }

  const main = list[0];
  const supportive = main === 'not-today' || main === 'matched';
  // For a miss, show the best set of the exercise (more useful - and kinder - than the last one).
  const best = entry.sets.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
  const shown = supportive ? `${best.weightKg > 0 ? `${formatWeight(best.weightKg)} × ` : ''}${best.reps}` : text;
  // Next challenge, as if today were finished - only shown when the engine has one.
  const next = challengeFor(exercise, [...data.sessions, { ...session, finishedAt: loggedAt }]);
  const mastered = result?.weightMastered;

  return (
    <div className={`last-bar ${supportive ? 'result' : 'reward'}`} data-testid="last-set" aria-live="polite">
      <div className="grow">
        <div className="reward-title with-icon">{ICONS[main] && <Icon name={ICONS[main]} size={18} />}<span data-testid="reward">{TITLES[main]}</span></div>
        <div className="small">
          {main === 'mastered' && mastered ? <strong>{formatTarget(mastered)}</strong> : <strong>{supportive ? `Best ${shown}` : shown}</strong>}
          {xp > 0 && <> · <strong className="xp">+{xp} XP</strong></>}
          {supportive && result?.challenge && <> · target {formatTarget(result.challenge)}</>}
        </div>
        {main === 'not-today'
          ? <div className="small reward-next">We'll adjust your next challenge based on this.</div>
          : next && <div className="small reward-next">Next time: {formatTarget(next)}</div>}
      </div>
      <div className="reward-side">{rest}{undo}</div>
    </div>
  );
}
