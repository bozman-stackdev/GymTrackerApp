import { PROGRESSION_DISCLAIMER, type Recommendation } from '../logic/progression';
import { Icon, type IconName } from './Icon';

const ICONS: Record<Recommendation['kind'], IconName> = {
  'increase-weight': 'arrowUp',
  'increase-reps': 'plus',
  'decrease-weight': 'arrowDown',
  hold: 'pause',
  retry: 'repeat',
  'not-enough-data': 'hourglass',
  'first-time': 'wave',
};

/** The "what to do today" hint. The left border colour shows the kind of advice. */
export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const tone = rec.kind === 'decrease-weight' ? 'down' : rec.kind === 'not-enough-data' || rec.kind === 'first-time' ? 'wait' : '';
  return (
    <div className={`card hint ${tone}`} data-testid="recommendation">
      <div className="title with-icon"><Icon name={ICONS[rec.kind]} size={18} /> {rec.title}</div>
      <div className="muted small">{rec.reason}</div>
      <div className="muted disclaimer">{PROGRESSION_DISCLAIMER}</div>
    </div>
  );
}
