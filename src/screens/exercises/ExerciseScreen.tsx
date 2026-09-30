import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { RecommendationCard } from '../../components/RecommendationCard';
import { Screen } from '../../components/Screen';
import { TrendChart } from '../../components/TrendChart';
import { startExercise } from '../../data/actions';
import { useStore } from '../../data/store';
import { bestEstimated1RM, exerciseHistory, formatDate, formatSets } from '../../logic/history';
import { recommend } from '../../logic/progression';

/** Progress for one exercise: today's suggestion, a trend chart and past sessions. */
export function ExerciseScreen() {
  const { id } = useParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const exercise = data.exercises.find((e) => e.id === id);
  if (!exercise) return <Navigate to="/exercises" replace />;

  const history = exerciseHistory(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const usesWeight = exercise.weightStepKg > 0;
  const points = history.map((p) => ({
    date: p.date,
    value: usesWeight ? bestEstimated1RM(p.sets) : Math.max(...p.sets.map((s) => s.reps)),
  }));

  return (
    <Screen title={exercise.name} back action={<Link to={`/exercises/${exercise.id}/edit`} className="icon-btn" aria-label="Edit exercise">✎</Link>}>
      <div className="chips">
        <span className="tag">{exercise.muscleGroup}</span>
        <span className="tag">{exercise.equipment}</span>
        <span className="tag">{exercise.repRange[0]}–{exercise.repRange[1]} reps</span>
      </div>

      <h2>Next challenge</h2>
      <RecommendationCard rec={rec} />

      <button className="btn primary block" onClick={() => { update((d) => startExercise(d, exercise.id)); navigate('/workout'); }}>
        ▶ {data.activeWorkout ? 'Add to current workout' : 'Start this exercise'}
      </button>

      <h2>{usesWeight ? 'Strength trend' : 'Best set (reps)'}</h2>
      <div className="card">
        <TrendChart points={points} unit={usesWeight ? 'kg' : 'reps'} />
        {usesWeight && <p className="muted small flush">Estimated from your best set each workout (the weight you could lift once).</p>}
      </div>

      <h2>History</h2>
      <div className="list">
        {[...history].reverse().map((p) => (
          <Link key={p.sessionId} to={`/history/${p.sessionId}`} className="list-item" style={{ minHeight: 52 }}>
            <span className="muted small" style={{ width: 96, flex: 'none' }}>{formatDate(p.date)}</span>
            <span className="grow">{formatSets(p.sets)}</span>
          </Link>
        ))}
        {history.length === 0 && <p className="muted">Not done yet.</p>}
      </div>
    </Screen>
  );
}
