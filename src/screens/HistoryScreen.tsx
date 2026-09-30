import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { formatDuration } from '../components/useNow';
import { deleteSession } from '../data/actions';
import { useExerciseLookup, useStore } from '../data/store';
import { formatDate, formatSets, volumeKg } from '../logic/history';
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
  const session = data.sessions.find((s) => s.id === id);
  if (!session) return <Navigate to="/history" replace />;

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
      <div className="list">
        {session.entries.map((e) => (
          <Link key={e.exerciseId} to={`/exercises/${e.exerciseId}`} className="list-item">
            <div className="grow">
              <div className="title">{getExercise(e.exerciseId).name}</div>
              <div className="muted small">{formatSets(e.sets)}</div>
            </div>
          </Link>
        ))}
      </div>
      <Link to="/" className="btn primary block">Done</Link>
      <button className="btn ghost danger block" onClick={remove}>Delete workout</button>
    </Screen>
  );
}
