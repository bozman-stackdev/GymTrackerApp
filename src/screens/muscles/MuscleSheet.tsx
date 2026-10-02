import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import { formatTarget } from '../../logic/history';
import { groupName, muscleInfo, muscleName, musclesInGroup } from '../../logic/muscles/catalog';
import { periodLabel, type ExerciseProgress, type MuscleAnalysis, type MuscleInput, type MuscleProgress } from '../../logic/muscles/analysis';
import { muscleWeeklyTrend } from '../../logic/muscles/insights';
import { can, type Plan } from '../../logic/plan';
import type { MuscleGroup, MuscleId } from '../../types';
import { ActivityTag, Bar, PremiumBadge, ProgressTag, type MapMode } from './parts';

export type SheetTarget = { kind: 'muscle'; id: MuscleId } | { kind: 'group'; id: MuscleGroup };

/**
 * Tap a muscle (or a group in the summary): its activity, training progress, the exercises that trained it and how
 * their performance changed. Premium adds what's behind the progress and a 12-week trend.
 */
export function MuscleSheet({ target, analysis, input, plan, mode, onClose, onSelect, onPremium }: {
  target: SheetTarget;
  analysis: MuscleAnalysis;
  input: MuscleInput;
  plan: Plan;
  mode: MapMode;
  onClose: () => void;
  onSelect: (t: SheetTarget) => void;
  onPremium: () => void;
}) {
  const exName = (id: string) => input.exercises.find((e) => e.id === id)?.name ?? 'Exercise';
  const muscles = target.kind === 'muscle' ? [target.id] : musclesInGroup(target.id);
  const title = target.kind === 'muscle' ? muscleName(target.id) : groupName(target.id);
  const context = target.kind === 'group' ? 'Muscle group' : groupName(muscleInfo(target.id).group); // "Chest" isn't repeated
  const group = target.kind === 'group' ? analysis.groups.find((g) => g.group === target.id)! : null;
  const activity = target.kind === 'muscle' ? analysis.activity[target.id] : null;
  const progress = target.kind === 'muscle' ? analysis.progress[target.id] : null;
  const pct = activity?.pct ?? group!.pct;
  const level = activity?.level ?? group!.level;
  const progressLevel = progress?.level ?? group!.progress;

  // Exercises that trained these muscles in the period (most sets first), and how their best sets changed.
  const sets = new Map<string, number>();
  for (const m of muscles) for (const e of analysis.activity[m].exercises) sets.set(e.exerciseId, (sets.get(e.exerciseId) ?? 0) + e.sets);
  const recent = [...sets.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const perf = new Map<string, ExerciseProgress>();
  for (const m of muscles) for (const e of analysis.progress[m].exercises) if (e.before && e.sessions > 0 && !perf.has(e.exerciseId)) perf.set(e.exerciseId, e);
  const performance = recent.filter((id) => perf.has(id)).slice(0, 3).map((id) => perf.get(id)!);

  return (
    <Sheet title={title} onClose={onClose} testId="muscle-sheet">
      <p className="muted small flush caps">
        {[context === title ? null : context, periodLabel(analysis.window.period)].filter(Boolean).join(' · ')}
      </p>

      <div className="sheet-facts">
        <div className="row between">
          <span>Activity</span>
          <span className="row tight"><ActivityTag level={level} /> {level !== 'none' && <span className="muted small">{pct}%</span>}</span>
        </div>
        <Bar pct={pct} level={level} />
        <div className="row between">
          <span>Training progress</span>
          <ProgressTag level={progressLevel} />
        </div>
      </div>

      {target.kind === 'group' && (
        <div className="list compact" data-testid="group-muscles">
          {muscles.map((m) => (
            <button key={m} className="list-row" onClick={() => onSelect({ kind: 'muscle', id: m })}>
              <span className="grow">{muscleName(m)}</span>
              {mode === 'activity' ? <ActivityTag level={analysis.activity[m].level} /> : <ProgressTag level={analysis.progress[m].level} short />}
              <Icon name="chevronRight" size={18} className="muted" />
            </button>
          ))}
        </div>
      )}

      <h3 className="sheet-h">Recent exercises</h3>
      {recent.length ? (
        <div className="chips" data-testid="recent-exercises">
          {recent.slice(0, 5).map((id) => <Link key={id} to={`/exercises/${id}`} className="tag link-tag">{exName(id)}</Link>)}
        </div>
      ) : <p className="muted small flush">None in this period.</p>}

      <h3 className="sheet-h">Recent performance</h3>
      {performance.length ? (
        <div className="stack tight" data-testid="recent-performance">
          {performance.map((e) => (
            <div key={e.exerciseId} className="perf-row">
              <span className="grow">{exName(e.exerciseId)}</span>
              <span className="perf-change">{formatTarget(e.before!)} <Icon name="forward" size={14} className="muted" /> <strong>{formatTarget(e.best)}</strong></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small flush">{recent.length ? 'Do these exercises again to compare with this time.' : 'Train it in two workouts to see your progress.'}</p>
      )}

      {progress && progress.level !== 'none' && (
        can(plan, 'progress-details') ? <ProgressDetails p={progress} /> : (
          <button className="premium-line" onClick={onPremium}>
            <PremiumBadge /> <span className="grow">See what's behind this progress, and a 12-week trend</span> <Icon name="chevronRight" size={18} />
          </button>
        )
      )}
      {target.kind === 'muscle' && can(plan, 'trends') && <Trend muscle={target.id} input={input} />}

      <p className="muted small flush">Your recorded training and performance - not a measure of muscle size or growth.</p>
    </Sheet>
  );
}

const word = (v: number | null) => (v === null ? '-' : v >= 0.5 ? 'Clearly up' : v > 0.15 ? 'Up' : v > -0.15 ? 'About the same' : 'Lower');

/** Premium: the factors behind a muscle's progress, in words. */
function ProgressDetails({ p }: { p: MuscleProgress }) {
  const basis = p.exercises.some((e) => e.primary && e.before) ? p.exercises.filter((e) => e.primary) : p.exercises;
  const attempted = basis.reduce((n, e) => n + e.challengesAttempted, 0);
  const completed = basis.reduce((n, e) => n + e.challengesCompleted, 0);
  const mastered = basis.reduce((n, e) => n + e.mastered, 0);
  const rows: [string, string][] = [
    ['Weights and reps', word(p.factors.performance)],
    ['Best workout volume', word(p.factors.volume)],
    ["Today's Challenges", attempted ? `${completed} of ${attempted} completed` : 'None yet'],
    ['Weights mastered', String(mastered)],
    ...(p.factors.consistency !== null ? [['Weeks trained', `${p.weeksTrained} of ${p.weeks}`] as [string, string]] : []),
  ];
  return (
    <div className="card inset stack tight" data-testid="progress-details">
      <div className="row between"><strong className="small">What's behind it</strong><PremiumBadge /></div>
      {rows.map(([k, v]) => <div key={k} className="row between small"><span className="muted">{k}</span><span>{v}</span></div>)}
    </div>
  );
}

/** Premium: weekly sets for this muscle over 12 weeks. */
function Trend({ muscle, input }: { muscle: MuscleId; input: MuscleInput }) {
  const weeks = muscleWeeklyTrend(muscle, input.sessions, input.exercises, input.now);
  const max = Math.max(1, ...weeks);
  return (
    <div className="card inset stack tight" data-testid="muscle-trend">
      <div className="row between"><strong className="small">Sets per week · 12 weeks</strong><PremiumBadge /></div>
      <div className="spark" role="img" aria-label={`Sets per week: ${weeks.join(', ')}`}>
        {weeks.map((w, i) => <span key={i} style={{ height: `${Math.max(4, (w / max) * 100)}%` }} className={w ? '' : 'zero'} />)}
      </div>
    </div>
  );
}
