/** Small, calm building blocks for showing game progress (summary + profile). */
import { useExerciseLookup } from '../data/store';
import { ACHIEVEMENTS, COMMUNITY_ACHIEVEMENTS, type AchievementIcon } from '../logic/game/achievements';
import type { LevelInfo } from '../logic/game/levels';
import type { PersonalBest } from '../logic/game/progress';
import { formatDate, formatWeight } from '../logic/history';
import { Icon } from './Icon';

export const streakText = (weeks: number) => (weeks > 0 ? `${weeks}-week streak` : 'Streak starts with your next workout');

/** "5-week streak" with a flame icon. */
export function Streak({ weeks }: { weeks: number }) {
  return <span className="with-icon">{weeks > 0 && <Icon name="flame" size={16} className="flame" />}{streakText(weeks)}</span>;
}

export function LevelBar({ level }: { level: LevelInfo }) {
  return (
    <div data-testid="level">
      <div className="row small between">
        <strong>Level {level.level}</strong>
        <span className="muted">{level.xp} / {level.nextLevelXp} XP</span>
      </div>
      <div className="bar" role="progressbar" aria-label={`Progress to level ${level.level + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress * 100)}>
        <div className="bar-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
      <div className="muted small">{level.nextLevelXp - level.xp} XP to level {level.level + 1}</div>
    </div>
  );
}

/**
 * @param community leaderboard achievements unlocked (accounts only); undefined hides that group, e.g. in a version
 *                  of the app without accounts.
 */
export function AchievementList({ unlocked, community }: { unlocked: string[]; community?: string[] }) {
  const item = (a: { id: string; icon: AchievementIcon; title: string; description: string }, done: boolean) => (
    <div key={a.id} className={`achievement${done ? ' done' : ''}`} data-testid={done ? 'achievement-done' : 'achievement-locked'}>
      <span className="achievement-icon" aria-hidden><Icon name={done ? a.icon : 'lock'} size={22} /></span>
      <div>
        <div className="title">{a.title}</div>
        <div className="muted small">{a.description}</div>
      </div>
    </div>
  );
  return (
    <div className="achievements">
      {ACHIEVEMENTS.map((a) => item(a, unlocked.includes(a.id)))}
      {community && (
        <>
          <div className="caps small achievements-group">Community · no XP, just recognition</div>
          {COMMUNITY_ACHIEVEMENTS.map((a) => item(a, community.includes(a.id)))}
        </>
      )}
    </div>
  );
}

export function PersonalBestList({ bests }: { bests: PersonalBest[] }) {
  const getExercise = useExerciseLookup();
  if (bests.length === 0) return <p className="muted small">Your best sets show up here.</p>;
  return (
    <div className="list">
      {bests.map((b) => (
        <div key={b.exerciseId} className="row small pb-row">
          <span className="grow">{getExercise(b.exerciseId).name}</span>
          <strong>{b.set.weightKg > 0 ? `${formatWeight(b.set.weightKg)} × ${b.set.reps}` : `${b.set.reps} reps`}</strong>
          <span className="muted">{formatDate(b.date)}</span>
        </div>
      ))}
    </div>
  );
}
