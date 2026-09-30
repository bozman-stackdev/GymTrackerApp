import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { startWorkout } from '../data/actions';
import { createStarterData } from '../data/seed';
import { useStore } from '../data/store';
import { useProgress } from '../data/useProgress';
import { streakText } from '../components/ProgressWidgets';
import { relativeDay, routinesByNextUp } from '../logic/history';
import type { Routine } from '../types';

/** Start screen: one tap on a routine starts the workout. */
export function HomeScreen() {
  const { data, update, replace } = useStore();
  const navigate = useNavigate();
  const active = data.activeWorkout;
  const progress = useProgress();

  const lastDone = (routineId: string) =>
    data.sessions.filter((s) => s.routineId === routineId).at(-1)?.startedAt;
  // "Next up" (done longest ago) first, so it's one tap away.
  const routines = routinesByNextUp(data.routines, data.sessions);

  const startOwn = () => {
    if (confirm('Clear the sample data and start with your own (empty history, starter routines)?')) replace(createStarterData());
  };

  const start = (routine?: Routine) => {
    if (active && !confirm('A workout is already in progress. Discard it and start a new one?')) return;
    update((d) => startWorkout(d, routine));
    navigate(routine ? '/workout' : '/workout/add');
  };

  return (
    <Screen title={data.profile.name ? `Hi ${data.profile.name}` : 'Train'}>
      {data.isSample && (
        <div className="sample-banner" data-testid="sample-banner">
          <span className="grow">You're exploring sample data.</span>
          <button className="btn ghost" onClick={startOwn}>Start my own</button>
        </div>
      )}
      {active && (
        <Link to="/workout" className="banner">
          <span>Resume {active.session.name}</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <Link to="/profile" className="muted small home-progress" data-testid="home-progress">
        Level {progress.level.level} · {streakText(progress.streakWeeks)}
      </Link>

      <h2>Start a workout</h2>
      <div className="list">
        {routines.map((r, i) => {
          const last = lastDone(r.id);
          const nextUp = i === 0 && !active;
          return (
            <div key={r.id} className="row">
              <button className={`list-item grow${nextUp ? ' next-up' : ''}`} onClick={() => start(r)}>
                <div className="grow">
                  {nextUp && <div className="small next-up-label">Next up</div>}
                  <div className="title routine-name">{r.name}</div>
                  <div className="muted small">
                    {r.items.length} exercises{last ? ` · last ${relativeDay(last)}` : ''}
                  </div>
                </div>
                <span className="play" aria-hidden>▶</span>
              </button>
              <Link to={`/routines/${r.id}`} className="icon-btn" aria-label={`Edit ${r.name}`}>
                ✎
              </Link>
            </div>
          );
        })}
      </div>

      <div className="row">
        <Link to="/scan" className="btn grow scan-btn">📷 Scan machine</Link>
        <button className="btn grow" onClick={() => start()}>Empty workout</button>
      </div>
      <Link to="/routines/new" className="btn block ghost">+ New routine</Link>
    </Screen>
  );
}
