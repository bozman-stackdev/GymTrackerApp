import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { EquipmentCard } from '../../components/EquipmentCard';
import { JourneyView } from '../../components/JourneyView';
import { RecommendationCard } from '../../components/RecommendationCard';
import { Screen } from '../../components/Screen';
import { TrendChart } from '../../components/TrendChart';
import { startExercise } from '../../data/actions';
import { useStore } from '../../data/store';
import { bestEstimated1RM, exerciseHistory, formatDate, formatSets } from '../../logic/history';
import { equipmentFor } from '../../logic/equipment';
import { challengeFor } from '../../logic/game/challenge';
import { buildJourney } from '../../logic/journey';
import { recommend } from '../../logic/progression';
import { getUnits, toDisplay } from '../../logic/units';
import { Icon } from '../../components/Icon';
import { MiniMaps, involvementTone } from '../../components/body/MiniMaps';
import { bodyTypeOf, useMuscleInput } from '../../data/useMuscles';
import { involvement, muscleName, musclesFor } from '../../logic/muscles/catalog';
import { exerciseShare } from '../../logic/muscles/insights';
import type { Exercise } from '../../types';

/** Progress for one exercise: today's suggestion, a trend chart and past sessions. */
export function ExerciseScreen() {
  const { id } = useParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const exercise = data.exercises.find((e) => e.id === id);
  if (!exercise) return <Navigate to="/exercises" replace />;

  const history = exerciseHistory(data.sessions, exercise.id);
  const rec = recommend(exercise, data.sessions);
  const challenge = challengeFor(exercise, data.sessions);
  const usesWeight = exercise.weightStepKg > 0;
  const points = history.map((p) => ({
    date: p.date,
    value: usesWeight ? toDisplay(bestEstimated1RM(p.sets)) : Math.max(...p.sets.map((s) => s.reps)),
  }));

  return (
    <Screen title={exercise.name} back action={<Link to={`/exercises/${exercise.id}/edit`} className="icon-btn" aria-label="Edit exercise"><Icon name="edit" /></Link>}>
      <div className="chips">
        <span className="tag">{exercise.muscleGroup}</span>
        <span className="tag">{exercise.equipment}</span>
        <span className="tag">{exercise.repRange[0]}–{exercise.repRange[1]} reps</span>
      </div>

      <MusclesWorked exercise={exercise} />

      <h2>Journey</h2>
      <JourneyView exercise={exercise} journey={buildJourney(exercise, data.sessions, challenge)} />

      <h2>{challenge ? 'Why this challenge' : 'Next time'}</h2>
      <RecommendationCard rec={rec} />

      <button className="btn primary block" onClick={() => { update((d) => startExercise(d, exercise.id)); navigate('/workout'); }}>
        <Icon name="play" size={18} /> {data.activeWorkout ? 'Add to current workout' : 'Start this exercise'}
      </button>

      <h2>Equipment</h2>
      <div className="list">
        {equipmentFor(data.equipment, exercise.id).map((e) => <EquipmentCard key={e.id} item={e} />)}
      </div>
      <Link to={`/gym/new?exercise=${exercise.id}`} className="btn block ghost"><Icon name="plus" /> Add equipment for this exercise</Link>

      <h2>{usesWeight ? 'Strength trend' : 'Best set (reps)'}</h2>
      <div className="card">
        <TrendChart points={points} unit={usesWeight ? getUnits() : 'reps'} />
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

/** Which muscles the exercise trains (from the exercise library), on a small front/back map. */
function MusclesWorked({ exercise }: { exercise: Exercise }) {
  const { data } = useStore();
  const input = useMuscleInput();
  const { primary, secondary } = musclesFor(exercise);
  const share = exerciseShare(exercise.id, input);
  const names = (ids: typeof primary) => ids.map(muscleName).join(', ');
  return (
    <div className="card muscles-worked" data-testid="muscles-worked">
      <MiniMaps body={bodyTypeOf(data.profile)} tone={involvementTone(involvement(exercise))} label={`Muscles worked: ${names(primary)}${secondary.length ? `; also ${names(secondary)}` : ''}`} />
      <div className="stack tight">
        <div><div className="caps small">Main</div><div className="title">{names(primary)}</div></div>
        {secondary.length > 0 && <div><div className="caps small">Also works</div><div>{names(secondary)}</div></div>}
        {share && share.share >= 0.3 && (
          <p className="muted small flush">{Math.round(share.share * 100)}% of your {muscleName(share.muscle).toLowerCase()} sets in the last 4 weeks.</p>
        )}
        <Link to="/muscles" className="small accent with-icon">Muscle map <Icon name="chevronRight" size={16} /></Link>
      </div>
    </div>
  );
}
