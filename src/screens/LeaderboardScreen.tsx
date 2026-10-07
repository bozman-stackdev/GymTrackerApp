import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LeaderboardRows, RankChange } from '../components/LeaderboardWidgets';
import { LevelBar } from '../components/ProgressWidgets';
import { Screen } from '../components/Screen';
import { syncedAgo, useAccount } from '../data/account';
import { useBoard, useLeaderboard } from '../data/leaderboard';
import { usePlan } from '../data/useMuscles';
import { useProgress } from '../data/useProgress';
import { GAME_CONFIG } from '../logic/game/config';
import { insights } from '../logic/leaderboard/rank';
import { PERIODS, type LeaderboardPeriod } from '../logic/leaderboard/score';
import { can } from '../logic/plan';
import type { DevTools } from '../services/backend';
import { PremiumBadge } from './muscles/parts';

const isPeriod = (p: string | null): p is LeaderboardPeriod => PERIODS.some((x) => x.id === p);
const L = GAME_CONFIG.leaderboard;

/** /leaderboard?period=week|month|all - the community board. Your own progress stays on top. */
export function LeaderboardScreen() {
  const lb = useLeaderboard();
  const progress = useProgress();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('period');
  const period: LeaderboardPeriod = isPeriod(wanted) ? wanted : 'week';

  return (
    <Screen title="Leaderboard" back>
      <div className="card"><LevelBar level={progress.level} /></div>
      {!lb.available ? <p className="muted">The leaderboard needs accounts, which this version of the app doesn't have.</p>
        : lb.state === 'signed-out' ? <SignedOut />
        : lb.state === 'loading' ? <p className="muted" role="status">{lb.error ?? 'Loading…'}</p>
        : !lb.profile?.leaderboardVisible ? <JoinCard />
        : <Board period={period} onPeriod={(p) => setParams(p === 'week' ? {} : { period: p }, { replace: true })} />}
      <DevScenarios />
    </Screen>
  );
}

function SignedOut() {
  return (
    <div className="card stack" data-testid="lb-signed-out">
      <strong className="with-icon"><Icon name="trophy" size={20} /> Compete on the leaderboard</strong>
      <p className="muted small flush">
        Create a free account to see how your XP compares with others this week, this month and all time.
        You choose a display name; nothing else about you is shown. Tracking your workouts never needs an account.
      </p>
      <Link to="/account?mode=signup" className="btn primary">Create account</Link>
      <Link to="/account?mode=login" className="btn ghost">Log in</Link>
    </div>
  );
}

function JoinCard() {
  const lb = useLeaderboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    setBusy(true);
    try { await lb.setVisible(true); setError(null); } catch (err) { setError(err instanceof Error ? err.message : "Couldn't join. Try again."); } finally { setBusy(false); }
  };
  return (
    <div className="card stack" data-testid="lb-join">
      <strong className="with-icon"><Icon name="trophy" size={20} /> You're not on the leaderboard</strong>
      <p className="muted small flush">
        Join to see your weekly, monthly and all-time position. Others see only your display name
        (<strong>{lb.profile?.displayName}</strong>) and your leaderboard XP - never your email, body details or workouts.
      </p>
      <button className="btn primary" disabled={busy} onClick={() => void join()}>{busy ? 'Please wait…' : 'Join the leaderboard'}</button>
      {error && <p className="field-error flush" role="alert">{error}</p>}
    </div>
  );
}

function Board({ period, onPeriod }: { period: LeaderboardPeriod; onPeriod: (p: LeaderboardPeriod) => void }) {
  const lb = useLeaderboard();
  const board = useBoard(period);
  const result = board?.result;
  const title = PERIODS.find((p) => p.id === period)!.title;
  const me = result?.me;

  return (
    <>
      <div className="card lb-summary" data-testid="lb-summary">
        <div className="caps small with-icon"><Icon name="trophy" size={16} /> Your rank · {title.toLowerCase()}</div>
        {me?.rank != null ? (
          <div className="lb-big">
            <span data-testid="lb-big-rank">#{me.rank}</span> <RankChange me={me} />
            <span className="muted small lb-of">of {result!.participants.toLocaleString()} · {me.points.toLocaleString()} XP</span>
          </div>
        ) : result ? (
          <p className="small flush" data-testid="lb-no-points">
            {period === 'week' ? 'No leaderboard XP this week yet. Your next workout puts you on the board.' : 'No leaderboard XP in this period yet.'}
          </p>
        ) : <p className="muted small flush">Loading…</p>}
      </div>

      <div className="seg" role="tablist" aria-label="Leaderboard period">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={period === p.id} className={`seg-btn${period === p.id ? ' on' : ''}`} onClick={() => onPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {result && (result.top.length ? <LeaderboardRows result={result} /> : <p className="muted small">Nobody is on this board yet.</p>)}

      <div className="row between small">
        <span className="muted" role="status" data-testid="lb-updated">
          {lb.error ? <span className="warn">{lb.error}</span> : board ? `Updated ${syncedAgo(new Date(board.fetchedAt).toISOString())}` : ''}
        </span>
        <button className="btn ghost small" disabled={lb.busy} onClick={() => void lb.load(period, true)}><Icon name="refresh" size={16} /> Refresh</button>
      </div>
      <p className="muted small flush" data-testid="lb-rule">
        Leaderboard XP is the XP you earn, counting up to {L.maxDaysPerWeek} training days a week (max {L.maxDailyPoints} a day).
        Rest days are part of the plan: training more often doesn't climb the board.
      </p>

      {result && <Insights result={result} />}
      <Medals />
      <VisibilityCard />
    </>
  );
}

/** Premium extras: secondary, and nothing in them changes anyone's position. */
function Insights({ result }: { result: NonNullable<ReturnType<typeof useBoard>>['result'] }) {
  const plan = usePlan();
  const lb = useLeaderboard();
  if (!can(plan, 'leaderboard-insights')) {
    return (
      <div className="card stack tight" data-testid="lb-insights-locked">
        <div className="row between"><strong>Leaderboard insights</strong><PremiumBadge /></div>
        <span className="muted small">How much XP to the next place, your top percentage, and your best weekly finish.</span>
      </div>
    );
  }
  const i = insights(result);
  const lines = [
    i.toNextPlace !== null && i.nextRank !== null ? `You're ${i.toNextPlace} XP away from #${i.nextRank}.` : result.me.rank === 1 ? "You're at the top. Keep it steady." : null,
    i.topPercent !== null && i.topPercent <= 50 ? `You're in the top ${i.topPercent}%.` : null,
    lb.record.bestWeeklyRank !== null ? `Your best weekly finish: #${lb.record.bestWeeklyRank}.` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="card stack tight" data-testid="lb-insights">
      <div className="row between"><div className="caps small">Insights</div><PremiumBadge /></div>
      {lines.length ? lines.map((s) => <p key={s} className="small flush insight"><Icon name="info" size={15} className="accent" /> {s}</p>)
        : <p className="muted small flush">Get on the board to see insights.</p>}
    </div>
  );
}

function Medals() {
  const { record } = useLeaderboard();
  const { first, second, third } = record.podiums;
  if (!first && !second && !third) return null;
  return (
    <div className="card row between" data-testid="lb-medals">
      <span className="small">Weekly podiums</span>
      <span className="lb-medals" aria-label={`${first} first, ${second} second, ${third} third place weeks`}>
        <span aria-hidden>🥇 {first}</span> <span aria-hidden>🥈 {second}</span> <span aria-hidden>🥉 {third}</span>
      </span>
    </div>
  );
}

export function VisibilityCard() {
  const lb = useLeaderboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = !!lb.profile?.leaderboardVisible;
  const toggle = async (v: boolean) => {
    setBusy(true);
    try { await lb.setVisible(v); setError(null); } catch (err) { setError(err instanceof Error ? err.message : "Couldn't change it. Try again."); } finally { setBusy(false); }
  };
  return (
    <div className="card stack tight" data-testid="lb-visibility">
      <div className="row between">
        <strong id="lb-visibility-label">Leaderboard visibility</strong>
        <label className="switch">
          <input type="checkbox" role="switch" checked={on} aria-checked={on} disabled={busy} aria-labelledby="lb-visibility-label"
            onChange={(e) => void toggle(e.target.checked)} />
          <span aria-hidden />
        </label>
      </div>
      <p className="muted small flush">
        Allow other users to see me on the leaderboard. Shown as <strong>{lb.profile?.displayName}</strong> (change it in Profile → Account).
        Off: you're removed from the board; your XP, level and progress keep working as normal.
      </p>
      {error && <p className="field-error flush" role="alert">{error}</p>}
    </div>
  );
}

/** Development only (the fake backend): pick a mock leaderboard to see every state of the screen. */
function DevScenarios() {
  const { backend, account } = useAccount();
  const lb = useLeaderboard();
  const [dev, setDev] = useState<DevTools | null>(null);
  const [value, setValue] = useState('default');
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void backend().then((b) => { if (!cancelled && b.dev) { setDev(b.dev); setValue(b.dev.scenario()); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [account, backend]);
  if (!dev) return null;
  return (
    <label className="field dev-tools" data-testid="lb-dev">
      <span className="muted small">Development: mock leaderboard</span>
      <select className="input" value={value} onChange={(e) => {
        dev.setScenario(e.target.value as Parameters<DevTools['setScenario']>[0]);
        setValue(e.target.value);
        for (const p of PERIODS) void lb.load(p.id, true);
      }}>
        {dev.scenarios.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </label>
  );
}
