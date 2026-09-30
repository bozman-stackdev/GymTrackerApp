import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { LevelBar, streakText } from '../../components/ProgressWidgets';
import { Screen } from '../../components/Screen';
import { formatDuration } from '../../components/useNow';
import { deleteSession } from '../../data/actions';
import { useExerciseLookup, useStore } from '../../data/store';
import { useProgress } from '../../data/useProgress';
import { ACHIEVEMENTS } from '../../logic/game/achievements';
import { challengeFor, type Challenge, type Outcome } from '../../logic/game/challenge';
import type { Progress, SessionProgress, XpEvent } from '../../logic/game/progress';
import { formatDate, formatSets, formatTarget, sessionVolumeKg } from '../../logic/history';
import type { WorkoutSession } from '../../types';

/** One finished workout: what you did, what it earned, and what's next. Also the "workout complete" screen. */
export function SessionScreen() {
  const { id } = useParams();
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const navigate = useNavigate();
  const progress = useProgress();
  const session = data.sessions.find((s) => s.id === id);
  if (!session) return <Navigate to="/history" replace />;

  const scored = progress.bySession.get(session.id);
  const isLatest = [...data.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1)?.id === session.id;
  const resultFor = (exerciseId: string) => scored?.results.find((r) => r.exerciseId === exerciseId);

  const remove = () => {
    if (!confirm('Delete this workout from your history?')) return;
    update((d) => deleteSession(d, session.id));
    navigate('/history', { replace: true });
  };

  return (
    <Screen title={session.name} back>
      <p className="muted flush">
        {formatDate(session.startedAt)}
        {session.finishedAt && ` · ${formatDuration(Date.parse(session.finishedAt) - Date.parse(session.startedAt))}`}
        {` · ${Math.round(sessionVolumeKg(session)).toLocaleString()} kg lifted`}
      </p>

      {scored && <WorkoutRewards scored={scored} progress={isLatest ? progress : undefined} />}

      <div className="list">
        {session.entries.map((e) => {
          const r = resultFor(e.exerciseId);
          return (
            <Link key={e.exerciseId} to={`/exercises/${e.exerciseId}`} className="list-item">
              <div className="grow">
                <div className="title">{getExercise(e.exerciseId).name}</div>
                <div className="muted small">{formatSets(e.sets)}</div>
                {r?.challenge && r.outcome && <OutcomeLine outcome={r.outcome} target={formatTarget(r.challenge)} comeback={r.comeback} />}
                {r?.weightMastered ? <div className="outcome good" data-testid="mastered">★ Weight mastered: {formatTarget(r.weightMastered)} - next weight unlocked</div>
                  : r?.newlyMastered && <div className="outcome muted" data-testid="mastered">✓ {formatTarget(r.newlyMastered)} mastered</div>}
              </div>
            </Link>
          );
        })}
      </div>

      {isLatest && <NextChallenges session={session} />}

      <Link to="/" className="btn primary block">Done</Link>
      <button className="btn ghost danger block" onClick={remove}>Delete workout</button>
    </Screen>
  );
}


/** Positive for hit/beaten/matched; neutral (never negative) for a miss. */
function OutcomeLine({ outcome, target, comeback }: { outcome: Outcome; target: string; comeback: boolean }) {
  const text = {
    hit: comeback ? `✓ Back on track: ${target} complete` : `✓ Target ${target} hit`,
    exceeded: comeback ? `✓ Back on track: ${target} beaten` : `✓ Target ${target} beaten`,
    matched: `✓ Matched last session · target was ${target}`,
    missed: `Not today · target ${target} · next challenge adjusted`,
  }[outcome];
  return <div className={`outcome${outcome === 'missed' ? ' muted' : ' good'}`} data-testid="outcome">{text}</div>;
}

const EVENT_LABEL: Record<XpEvent['type'], string> = {
  workout: 'Workout complete',
  challenge: 'Challenge complete',
  matched: 'Matched last session',
  'personal-best': 'Personal best',
  consistency: 'Consistency milestone',
  mastery: 'Level mastered',
  comeback: 'Back on track',
};

/** What this workout earned. `progress` is given for the latest workout only (level/streak "now"). */
function WorkoutRewards({ scored, progress }: { scored: SessionProgress; progress?: Progress }) {
  const getExercise = useExerciseLookup();
  return (
    <div className="card stack" data-testid="rewards">
      <div className="row between">
        <strong>Workout rewards</strong>
        <strong className="xp" data-testid="session-xp">+{scored.xp} XP</strong>
      </div>
      <div className="reward-list small">
        {scored.events.map((e, i) => (
          <div key={i} className="reward-row">
            <span>{EVENT_LABEL[e.type]}{e.exerciseId ? ` · ${getExercise(e.exerciseId).name}` : ''}</span>
            <span className="muted">+{e.xp}</span>
          </div>
        ))}
      </div>
      {progress && <LevelBar level={progress.level} />}
      <div className="small">{streakText(progress?.streakWeeks ?? scored.streakWeeks)}</div>
      {scored.unlocked.map((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        return <div key={id} className="small" data-testid="new-achievement">{a.icon} <strong>New achievement:</strong> {a.title}</div>;
      })}
    </div>
  );
}

/** The next challenge for each exercise of this workout (when the engine has one). */
function NextChallenges({ session }: { session: WorkoutSession }) {
  const { data } = useStore();
  const getExercise = useExerciseLookup();
  const next = session.entries
    .map((e) => challengeFor(getExercise(e.exerciseId), data.sessions))
    .filter((c): c is Challenge => !!c);
  if (next.length === 0) return null;
  return (
    <div className="card" data-testid="next-challenges">
      <strong>Next time</strong>
      <div className="reward-list small" style={{ marginTop: 6 }}>
        {next.map((c) => (
          <div key={c.exerciseId} className="reward-row">
            <span>{getExercise(c.exerciseId).name}</span>
            <strong>{c.kind === 'repeat' ? 'Repeat ' : ''}{formatTarget(c)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
