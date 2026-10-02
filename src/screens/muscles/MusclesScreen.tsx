import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BodyMap } from '../../components/body/BodyMap';
import { Icon } from '../../components/Icon';
import { Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { saveProfile } from '../../data/actions';
import { useStore } from '../../data/store';
import { bodyTypeOf, useMuscleInput, usePlan } from '../../data/useMuscles';
import { formatDate, plural } from '../../logic/history';
import { analyseMuscles, PERIODS, periodLabel, type MuscleAnalysis, type MuscleInput, type MusclePeriod } from '../../logic/muscles/analysis';
import { muscleName, type BodyView } from '../../logic/muscles/catalog';
import { compareWithPrevious, muscleInsights, PREVIOUS, weeklyTrends } from '../../logic/muscles/insights';
import { ACTIVITY_LABEL, ACTIVITY_NOTE, BALANCE_LABEL, MAP_DISCLAIMER, PROGRESS_LABEL, PROGRESS_NOTE } from '../../logic/muscles/labels';
import { can, canUsePeriod, PREMIUM_FEATURES, type Plan } from '../../logic/plan';
import type { BodyType, MuscleId } from '../../types';
import { MuscleSheet, type SheetTarget } from './MuscleSheet';
import { Bar, Legend, PremiumBadge, ProgressTag, toneFor, type MapMode } from './parts';

const isPeriod = (v: string | null): v is MusclePeriod => PERIODS.some((p) => p.id === v);

/**
 * The muscle map: "What am I training?" (Activity) and "Where am I progressing?" (Progress), at a glance.
 * State lives in the URL (?mode=progress&period=week&view=back&session=…) so links and Back keep it.
 */
export function MusclesScreen() {
  const { data, update } = useStore();
  const input = useMuscleInput();
  const plan = usePlan();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [premiumInfo, setPremiumInfo] = useState(false);

  const mode: MapMode = params.get('mode') === 'progress' ? 'progress' : 'activity';
  const wanted = params.get('period');
  const period: MusclePeriod = isPeriod(wanted) && canUsePeriod(plan, wanted) ? wanted : '4w';
  const view: BodyView = params.get('view') === 'back' ? 'back' : 'front';
  const sessionId = params.get('session') ?? undefined;
  const body = bodyTypeOf(data.profile);
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) if (v === null) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const analysis = useMemo(() => analyseMuscles(input, period, sessionId), [input, period, sessionId]);
  // Balance is about weeks: for a single workout it looks at the last 4 weeks instead (leg day is meant to be all legs).
  const balanceAnalysis = useMemo(() => (period === 'workout' ? analyseMuscles(input, '4w') : analysis), [input, period, analysis]);
  const tone = toneFor(analysis, mode);
  const describe = (m: MuscleId) => `${muscleName(m)}: ${mode === 'activity' ? `${ACTIVITY_LABEL[analysis.activity[m].level]} activity` : PROGRESS_LABEL[analysis.progress[m].level]}`;
  const workout = period === 'workout' ? analysis.window.sessions[0] : undefined;
  const live = workout && data.activeWorkout?.session.id === workout.id;

  return (
    <Screen title="Muscles">
      {!data.profile.bodyMap && data.profile.sex !== 'male' && data.profile.sex !== 'female' && (
        <BodyChoice onPick={(b) => update((d) => saveProfile(d, { ...d.profile, bodyMap: b }))} />
      )}

      <div className="seg" role="tablist" aria-label="Map mode">
        {(['activity', 'progress'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`seg-btn${mode === m ? ' on' : ''}`} onClick={() => set({ mode: m === 'activity' ? null : m })}>
            <Icon name={m === 'activity' ? 'flame' : 'trendUp'} size={18} /> {m === 'activity' ? 'Activity' : 'Progress'}
          </button>
        ))}
      </div>

      <div className="seg period-seg" role="group" aria-label="Period">
        {PERIODS.map((p) => {
          const locked = !canUsePeriod(plan, p.id);
          return (
            <button key={p.id} className={`seg-btn${period === p.id ? ' on' : ''}${locked ? ' locked' : ''}`} aria-pressed={period === p.id}
              aria-label={locked ? `${p.label} (Premium)` : p.label}
              onClick={() => (locked ? setPremiumInfo(true) : set({ period: p.id === '4w' ? null : p.id, session: null }))}>
              {locked && <Icon name="lock" size={13} />}{p.short}
            </button>
          );
        })}
      </div>

      <div className="card map-card" data-testid="muscle-map">
        <div className="map-head">
          <div className="grow">
            <div className="caps small map-title">{mode === 'activity' ? 'Muscle activity' : 'Muscle progress'}</div>
            <div className="muted small" data-testid="period-summary">
              {workout ? `${live ? 'In progress' : `${workout.name} · ${formatDate(workout.startedAt)}`} · ${plural(analysis.totalSets, 'set')}`
                : `${plural(analysis.window.sessions.length, 'workout')} · ${plural(analysis.totalSets, 'set')}`}
            </div>
          </div>
          <div className="seg small-seg" role="tablist" aria-label="Body view">
            {(['front', 'back'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={`seg-btn${view === v ? ' on' : ''}`} onClick={() => set({ view: v === 'front' ? null : v })}>
                {v === 'front' ? 'Front' : 'Back'}
              </button>
            ))}
          </div>
        </div>
        <Headline analysis={analysis} mode={mode} />
        <SwipeToFlip onFlip={() => set({ view: view === 'front' ? 'back' : null })}>
          <BodyMap body={body} view={view} tone={tone} selected={sheet?.kind === 'muscle' ? sheet.id : null}
            onSelect={(m) => setSheet({ kind: 'muscle', id: m })} describe={describe} label={`${view === 'front' ? 'Front' : 'Back'} view. Tap a muscle for details.`} />
        </SwipeToFlip>
        <Legend mode={mode} />
        {analysis.totalSets === 0 && (
          <p className="muted small center flush" data-testid="map-empty">
            {analysis.window.sessions.length ? 'No strength sets in this period - cardio, warm-ups and cool-downs aren’t on the map.' : 'No workouts in this period yet.'}
          </p>
        )}
      </div>

      <GroupSummary analysis={analysis} mode={mode} onOpen={(g) => setSheet({ kind: 'group', id: g })} />
      <BalanceCard analysis={balanceAnalysis} fallback={period === 'workout'} />
      <PremiumCards analysis={analysis} input={input} plan={plan} onPremium={() => setPremiumInfo(true)} />

      <p className="muted small flush" data-testid="muscle-disclaimer"><Icon name="info" size={14} /> {MAP_DISCLAIMER}</p>

      {sheet && (
        <MuscleSheet target={sheet} analysis={analysis} input={input} plan={plan} mode={mode}
          onClose={() => setSheet(null)} onSelect={setSheet} onPremium={() => { setSheet(null); setPremiumInfo(true); }} />
      )}
      {premiumInfo && <PremiumSheet plan={plan} onClose={() => setPremiumInfo(false)} onToggle={(on) => update((d) => ({ ...d, premiumPreview: on || undefined }))} />}
    </Screen>
  );
}

/** The answer in words: "Most trained: Triceps · Chest · Front shoulders" / "Progressing most: Chest · Quadriceps". */
function Headline({ analysis, mode }: { analysis: MuscleAnalysis; mode: MapMode }) {
  const ids = Object.keys(analysis.activity) as MuscleId[];
  const top = mode === 'activity'
    ? ids.filter((m) => analysis.activity[m].sets > 0).sort((a, b) => analysis.activity[b].sets - analysis.activity[a].sets)
    : ids.filter((m) => analysis.progress[m].level === 'strong' || analysis.progress[m].level === 'moderate')
      .sort((a, b) => (analysis.progress[b].score ?? 0) - (analysis.progress[a].score ?? 0) || analysis.activity[b].sets - analysis.activity[a].sets);
  const text = top.length
    ? `${mode === 'activity' ? 'Most trained' : 'Progressing most'}: ${top.slice(0, 3).map(muscleName).join(' · ')}`
    : mode === 'activity' ? 'Nothing trained in this period yet' : 'No clear progression in this period yet';
  return <p className="map-headline flush" data-testid="map-headline">{text}</p>;
}

/** First visit (no body chosen and no sex in the profile): which body should the map show? Changeable in Profile. */
function BodyChoice({ onPick }: { onPick: (b: BodyType) => void }) {
  return (
    <div className="card stack tight" data-testid="body-choice">
      <strong>Which body should the map show?</strong>
      <div className="row">
        <button className="btn grow" onClick={() => onPick('male')}>Male</button>
        <button className="btn grow" onClick={() => onPick('female')}>Female</button>
      </div>
      <p className="muted small flush">You can change this any time in Profile.</p>
    </div>
  );
}

/** A horizontal swipe on the figure flips between front and back (the Front | Back toggle does the same). */
function SwipeToFlip({ onFlip, children }: { onFlip: () => void; children: ReactNode }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  return (
    <div
      className="map-figure"
      onPointerDown={(e: PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; swiped.current = false; }}
      onPointerUp={(e: PointerEvent) => {
        const s = start.current;
        start.current = null;
        if (s && Math.abs(e.clientX - s.x) > 50 && Math.abs(e.clientX - s.x) > 1.5 * Math.abs(e.clientY - s.y)) {
          swiped.current = true;
          onFlip();
        }
      }}
      onClickCapture={(e) => { if (swiped.current) { e.stopPropagation(); swiped.current = false; } }}
    >
      {children}
    </div>
  );
}

function GroupSummary({ analysis, mode, onOpen }: { analysis: MuscleAnalysis; mode: MapMode; onOpen: (g: MuscleAnalysis['groups'][number]['group']) => void }) {
  return (
    <div className="card stack tight" data-testid="group-summary">
      <div className="caps small">{mode === 'activity' ? 'Muscle activity' : 'Training progress'}</div>
      <div className="group-rows">
        {analysis.groups.map((g) => (
          <button key={g.group} className="group-row" data-group={g.group} onClick={() => onOpen(g.group)}
            aria-label={`${g.name}: ${mode === 'activity' ? `${ACTIVITY_LABEL[g.level]} activity, ${g.pct}%` : PROGRESS_LABEL[g.progress]}`}>
            <span className="group-name">{g.name}</span>
            {mode === 'activity' ? (
              <>
                <Bar pct={g.pct} level={g.level} />
                <span className="group-pct">{g.level === 'none' ? '–' : `${g.pct}%`}</span>
              </>
            ) : <ProgressTag level={g.progress} />}
          </button>
        ))}
      </div>
      <p className="muted small flush">{mode === 'activity' ? ACTIVITY_NOTE : PROGRESS_NOTE}</p>
    </div>
  );
}

function BalanceCard({ analysis, fallback }: { analysis: MuscleAnalysis; fallback: boolean }) {
  const b = analysis.balance;
  return (
    <div className="card stack tight" data-testid="balance">
      <div className="row between">
        <div className="caps small">Muscle balance</div>
        <span className="muted small">{fallback ? 'Last 4 weeks' : periodLabel(analysis.window.period)}</span>
      </div>
      <strong>Your recent training</strong>
      {b.enough ? (
        <>
          <div className="balance-grid">
            {b.regions.map((r) => (
              <div key={r.id} className="balance-cell">
                <span className="muted small">{r.name}</span>
                <span className={`bal-tag b-${r.level}`}>{BALANCE_LABEL[r.level]}</span>
              </div>
            ))}
          </div>
          {b.notes.map((n) => <p key={n} className="small flush">{n}</p>)}
        </>
      ) : <p className="muted small flush">Not enough training in this period to compare yet.</p>}
    </div>
  );
}

function PremiumCards({ analysis, input, plan, onPremium }: { analysis: MuscleAnalysis; input: MuscleInput; plan: Plan; onPremium: () => void }) {
  const premium = can(plan, 'insights');
  const insights = useMemo(() => (premium ? muscleInsights(input, analysis) : []), [input, analysis, premium]);
  const changes = useMemo(() => (can(plan, 'comparisons') ? compareWithPrevious(input, analysis) : null), [input, analysis, plan]);
  const trends = useMemo(() => (can(plan, 'trends') ? weeklyTrends(input.sessions, input.exercises, input.now) : []), [input, plan]);
  if (!premium) {
    return (
      <button className="card premium-teaser" data-testid="premium-teaser" onClick={onPremium}>
        <div className="row between"><strong>Go deeper</strong><PremiumBadge /></div>
        <span className="muted small">Longer history, what's behind each muscle's progress, training trends, comparisons and personal insights.</span>
        <span className="small accent with-icon">See what's included <Icon name="chevronRight" size={16} /></span>
      </button>
    );
  }

  const max = Math.max(1, ...trends.flatMap((t) => t.weeks));
  return (
    <>
      <div className="card stack tight" data-testid="insights">
        <div className="row between"><div className="caps small">Insights</div><PremiumBadge /></div>
        {insights.length ? insights.map((s) => <p key={s} className="small flush insight"><Icon name="info" size={15} className="accent" /> {s}</p>)
          : <p className="muted small flush">Nothing stands out in this period.</p>}
      </div>
      {changes && (
        <div className="card stack tight" data-testid="comparisons">
          <div className="row between"><div className="caps small">Compared with {PREVIOUS[analysis.window.period]}</div><PremiumBadge /></div>
          <div className="group-rows">
            {changes.map((c) => (
              <div key={c.group} className="group-row static">
                <span className="group-name">{c.name}</span>
                <span className="grow" />
                <span className={`change ${c.change === null ? '' : c.change > 0.05 ? 'up' : c.change < -0.05 ? 'down' : ''}`}>
                  {c.change === null ? (c.current > 0 ? 'New' : '–') : c.change > 0.05 ? `+${Math.round(c.change * 100)}%` : c.change < -0.05 ? `${Math.round(c.change * 100)}%` : 'Similar'}
                </span>
              </div>
            ))}
          </div>
          <p className="muted small flush">Training volume (weighted sets) per group.</p>
        </div>
      )}
      {trends.length > 0 && (
        <div className="card stack tight" data-testid="trends">
          <div className="row between"><div className="caps small">Trend · 12 weeks</div><PremiumBadge /></div>
          {trends.map((t) => (
            <div key={t.group} className="trend-row">
              <span className="group-name small">{t.name}</span>
              <span className="spark small-spark" role="img" aria-label={`${t.name}, sets per week: ${t.weeks.join(', ')}`}>
                {t.weeks.map((w, i) => <span key={i} style={{ height: `${Math.max(6, (w / max) * 100)}%` }} className={w ? '' : 'zero'} />)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** What Premium adds. There are no payments yet: testers can switch on a preview. */
function PremiumSheet({ plan, onClose, onToggle }: { plan: Plan; onClose: () => void; onToggle: (on: boolean) => void }) {
  return (
    <Sheet title="Premium" onClose={onClose} testId="premium-sheet">
      <p className="small flush">The body map and muscle activity are free. Premium adds depth:</p>
      <ul className="premium-list">
        {PREMIUM_FEATURES.map((f) => <li key={f.id}><strong>{f.title}</strong><span className="muted small">{f.description}</span></li>)}
      </ul>
      <p className="muted small flush">Premium isn't on sale yet. While the app is being tested, you can try everything with the Premium preview (also in Profile → Plan).</p>
      {plan === 'premium'
        ? <button className="btn block" onClick={() => { onToggle(false); onClose(); }}>Turn off Premium preview</button>
        : <button className="btn primary block" onClick={() => { onToggle(true); onClose(); }}><Icon name="crown" size={18} /> Try Premium preview</button>}
    </Sheet>
  );
}
