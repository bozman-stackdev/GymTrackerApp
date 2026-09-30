/** Small, calm building blocks for showing game progress (summary + profile). */
import { useExerciseLookup } from '../data/store';
import { ACHIEVEMENTS } from '../logic/game/achievements';
import type { LevelInfo } from '../logic/game/levels';
import type { PersonalBest } from '../logic/game/progress';
import { formatDate, formatKg } from '../logic/history';

export const streakText = (weeks: number) => (weeks > 0 ? `🔥 ${weeks}-week streak` : 'Streak starts with your next workout');

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

export function AchievementList({ unlocked }: { unlocked: string[] }) {
  return (
    <div className="achievements">
      {ACHIEVEMENTS.map((a) => {
        const done = unlocked.includes(a.id);
        return (
          <div key={a.id} className={`achievement${done ? ' done' : ''}`} data-testid={done ? 'achievement-done' : 'achievement-locked'}>
            <span className="achievement-icon" aria-hidden>{done ? a.icon : '🔒'}</span>
            <div>
              <div className="title">{a.title}</div>
              <div className="muted small">{a.description}</div>
            </div>
          </div>
        );
      })}
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
          <strong>{b.set.weightKg > 0 ? `${formatKg(b.set.weightKg)} × ${b.set.reps}` : `${b.set.reps} reps`}</strong>
          <span className="muted">{formatDate(b.date)}</span>
        </div>
      ))}
    </div>
  );
}
