import { Link } from 'react-router-dom';
import { useExerciseLookup, useStore } from '../data/store';
import { lastUsage } from '../logic/equipment';
import { formatWeight, formatSets, relativeDay, workingWeight } from '../logic/history';
import type { GymEquipment } from '../types';
import { Icon } from './Icon';

/** One machine in My gym: what it's for, your settings, and what you did on it last time. */
export function EquipmentCard({ item }: { item: GymEquipment }) {
  const { data } = useStore();
  const getExercise = useExerciseLookup();
  const usage = lastUsage(data.sessions, item.id);
  return (
    <Link to={`/gym/${item.id}`} className="list-item equipment-card" data-testid="equipment-card">
      <div className="grow">
        <div className="title">{item.name}</div>
        <div className="muted small">{item.exerciseIds.map((id) => getExercise(id).name).join(', ')}</div>
        {item.settings && <div className="small with-icon"><Icon name="settings" size={15} /> {item.settings}</div>}
        {usage ? (
          <>
            <div className="small">Last used: <strong>{usage.sets.some((s) => s.weightKg > 0) ? formatWeight(workingWeight(usage.sets)) : 'bodyweight'}</strong> · {relativeDay(usage.date)}</div>
            <div className="muted small">Previous session: {formatSets(usage.sets)}</div>
          </>
        ) : (
          <div className="muted small">Not used yet</div>
        )}
      </div>
      <Icon name="chevronRight" className="muted" />
    </Link>
  );
}
