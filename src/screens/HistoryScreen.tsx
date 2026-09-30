import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { formatDuration } from '../components/useNow';
import { deleteSession } from '../data/actions';
import { useExerciseLookup, useStore } from '../data/store';
import { formatDate, formatSets, formatTarget, volumeKg } from '../logic/history';
import { useProgress } from '../data/useProgress';
import { LevelBar, streakText } from '../components/ProgressWidgets';
import { ACHIEVEMENTS } from '../logic/game/achievements';
import { challengeFor, type Challenge, type Outcome } from '../logic/game/challenge';
import type { Progress, SessionProgress, XpEvent } from '../logic/game/progress';
import type { WorkoutSession } from '../types';

const sessionVolume = (s: WorkoutSession) => s.entries.reduce((sum, e) => sum + volumeKg(e.sets), 0);
const sessionSets = (s: WorkoutSession) => s.entries.reduce((sum, e) => sum + e.sets.length, 0);

export function HistoryScreen() {
  const { data } = useStore();
  const sessions = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const last7 = sessions.filter((s) => Date.now() - Date.parse(s.startedAt) < 7 * 86_400_000).length;

  return (
    <Screen title="History">
      <div className="row">
        <Stat label="This week" value={String(last7)} />
        <Stat label="Total workouts" value={String(sessions.length)} />
      </div>
      <div className="list">
        {sessions.map((s) => (
          <Link key={s.id} to={`/history/${s.id}`} className="list-item">
            <div className="grow">
              <div className="title">{s.name}</div>
              <div className="muted small">
                {formatDate(s.startedAt)} · {sessionSets(s)} sets · {Math.round(sessionVolume(s)).toLocaleString()} kg
              </div>
            </div>
            <span className="muted" aria-hidden>›</span>
          </Link>
        ))}
        {sessions.length === 0 && <p className="muted center">No workouts yet. Your finished workouts show up here.</p>}
      </div>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card grow center">
      <div style={{ fontSize: 32, fontWeight: 800 }}>{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

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
      <p className="muted" style={{ margin: 0 }}>
        {formatDate(session.startedAt)}
        {session.finishedAt && ` · ${formatDuration(Date.parse(session.finishedAt) - Date.parse(session.startedAt))}`}
        {` · ${Math.round(sessionVolume(session)).toLocaleString()} kg lifted`}
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
                {r?.challenge && r.outcome && <OutcomeLine outcome={r.outcome} target={formatTarget(r.challenge)} />}
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
function OutcomeLine({ outcome, target }: { outcome: Outcome; target: string }) {
  const text = {
    hit: `✓ Challenge ${target} complete`,
    exceeded: `✓ Challenge ${target} beaten`,
    matched: `✓ Matched last session · aiming for ${target}`,
    missed: `Challenge ${target} · same target next time`,
  }[outcome];
  return <div className={`outcome${outcome === 'missed' ? ' muted' : ' good'}`} data-testid="outcome">{text}</div>;
}

const EVENT_LABEL: Record<XpEvent['type'], string> = {
  workout: 'Workout complete',
  challenge: 'Challenge complete',
  matched: 'Matched last session',
  'personal-best': 'Personal best',
  consistency: 'Consistency milestone',
};

/** What this workout earned. `progress` is given for the latest workout only (level/streak "now"). */
function WorkoutRewards({ scored, progress }: { scored: SessionProgress; progress?: Progress }) {
  const getExercise = useExerciseLookup();
  return (
    <div className="card stack" data-testid="rewards">
      <div className="row" style={{ justifyContent: 'space-between' }}>
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
