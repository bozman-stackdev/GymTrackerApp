import { Link, useNavigate } from 'react-router-dom';
import { EquipmentCard } from '../../components/EquipmentCard';
import { ExercisePicker } from '../../components/ExercisePicker';
import { Screen } from '../../components/Screen';
import { useStore } from '../../data/store';
import { Icon } from '../../components/Icon';

/** My gym: your machines (with settings and last weights) and the exercise library. */
export function ExercisesScreen() {
  const { data } = useStore();
  const navigate = useNavigate();
  const gyms = [...new Set(data.equipment.map((e) => e.gym.trim()))];

  return (
    <Screen title="My Gym">
      <h2>Equipment</h2>
      {data.equipment.length === 0 && (
        <p className="muted small flush">Save the machines you use: the app remembers your settings and last weights.</p>
      )}
      {gyms.map((gym) => (
        <section key={gym} className="stack gym-group" aria-label={gym || 'Equipment'}>
          {gyms.length > 1 && <div className="gym-name with-icon"><Icon name="pin" size={16} /> {gym || 'No gym set'}</div>}
          <div className="list">
            {data.equipment.filter((e) => e.gym.trim() === gym).map((e) => <EquipmentCard key={e.id} item={e} />)}
          </div>
        </section>
      ))}
      <Link to="/gym/new" className="btn block"><Icon name="plus" /> Add equipment</Link>

      <h2>Exercises</h2>
      <ExercisePicker exercises={data.exercises} onPick={(e) => navigate(`/exercises/${e.id}`)} />
      <Link to="/exercises/new" className="btn block ghost"><Icon name="plus" /> New exercise</Link>
    </Screen>
  );
}
