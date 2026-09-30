import { PROGRESSION_DISCLAIMER, type Recommendation } from '../logic/progression';

const ICONS: Record<Recommendation['kind'], string> = {
  'increase-weight': '⬆️',
  'increase-reps': '➕',
  'decrease-weight': '⬇️',
  hold: '⏸️',
  'not-enough-data': '⏳',
  'first-time': '👋',
};

/** The "what to do today" hint. The left border colour shows the kind of advice. */
export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const tone = rec.kind === 'decrease-weight' ? 'down' : rec.kind === 'not-enough-data' || rec.kind === 'first-time' ? 'wait' : '';
  return (
    <div className={`card hint ${tone}`} data-testid="recommendation">
      <div className="title">{ICONS[rec.kind]} {rec.title}</div>
      <div className="muted small">{rec.reason}</div>
      <div className="muted disclaimer">{PROGRESSION_DISCLAIMER}</div>
    </div>
  );
}
