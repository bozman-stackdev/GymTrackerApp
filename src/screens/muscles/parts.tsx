import type { MuscleTone } from '../../components/body/BodyMap';
import { Icon, type IconName } from '../../components/Icon';
import type { ActivityLevel, MuscleAnalysis, ProgressLevel } from '../../logic/muscles/analysis';
import { ACTIVITY_LABEL, PROGRESS_LABEL, PROGRESS_SHORT } from '../../logic/muscles/labels';
import type { MuscleId } from '../../types';

export type MapMode = 'activity' | 'progress';

const ACTIVITY_TONE: Record<ActivityLevel, MuscleTone> = { none: 'none', low: 'a1', medium: 'a2', high: 'a3' };
export const activityTone = (l: ActivityLevel): MuscleTone => ACTIVITY_TONE[l];

export function toneFor(a: MuscleAnalysis, mode: MapMode) {
  return (m: MuscleId): MuscleTone => (mode === 'activity' ? ACTIVITY_TONE[a.activity[m].level] : a.progress[m].level);
}

const ARROW: Record<ProgressLevel, IconName | null> = { strong: 'arrowUp', moderate: 'trendUp', stable: 'forward', lower: 'arrowDown', none: null };

/** "↑ Strong progression", coloured by level. */
export function ProgressTag({ level, short }: { level: ProgressLevel; short?: boolean }) {
  const icon = ARROW[level];
  return (
    <span className={`prog-tag p-${level}`}>
      {icon && <Icon name={icon} size={15} />}
      {short ? PROGRESS_SHORT[level] : PROGRESS_LABEL[level]}
    </span>
  );
}

export function ActivityTag({ level }: { level: ActivityLevel }) {
  return <span className={`act-tag l-${level}`}>{ACTIVITY_LABEL[level]}</span>;
}

/** A thin bar for an activity percentage, in the heat colour of its level. */
export function Bar({ pct, level }: { pct: number; level: ActivityLevel }) {
  return <span className={`m-bar l-${level}`} aria-hidden><span style={{ width: `${pct}%` }} /></span>;
}

/** The colour scale under the map. */
export function Legend({ mode }: { mode: MapMode }) {
  const items: [MuscleTone, string][] = mode === 'activity'
    ? [['none', 'None'], ['a1', 'Low'], ['a2', 'Medium'], ['a3', 'High']]
    : [['lower', PROGRESS_SHORT.lower], ['stable', PROGRESS_SHORT.stable], ['moderate', PROGRESS_SHORT.moderate], ['strong', PROGRESS_SHORT.strong]];
  return (
    <div className="m-legend" data-testid="legend" aria-label={mode === 'activity' ? 'Colour scale: activity from none to high' : 'Colour scale: training progress from lower to strong'}>
      {items.map(([tone, label]) => (
        <span key={tone} className="m-legend-item">
          <span className={`m-swatch t-${tone}`} aria-hidden />
          <span className="small">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Small "Premium" badge for locked features. */
export function PremiumBadge() {
  return <span className="premium-badge"><Icon name="crown" size={13} /> Premium</span>;
}
