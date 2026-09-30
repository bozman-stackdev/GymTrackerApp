import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { startWorkout } from '../data/actions';
import { useStore } from '../data/store';
import { relativeDay } from '../logic/history';
import type { Routine } from '../types';

/** Start screen: one tap on a routine starts the workout. */
export function HomeScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const active = data.activeWorkout;

  const lastDone = (routineId: string) =>
    data.sessions.filter((s) => s.routineId === routineId).at(-1)?.startedAt;

  const start = (routine?: Routine) => {
    if (active && !confirm('A workout is already in progress. Discard it and start a new one?')) return;
    update((d) => startWorkout(d, routine));
    navigate(routine ? '/workout' : '/workout/add');
  };

  return (
    <Screen title={data.profile.name ? `Hi ${data.profile.name}` : 'Train'}>
      {active && (
        <Link to="/workout" className="banner">
          <span>Resume {active.session.name}</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <h2>Start a workout</h2>
      <div className="list">
        {data.routines.map((r) => {
          const last = lastDone(r.id);
          return (
            <div key={r.id} className="row">
              <button className="list-item grow" onClick={() => start(r)}>
                <div className="grow">
                  <div className="title" style={{ fontSize: 20 }}>{r.name}</div>
                  <div className="muted small">
                    {r.items.length} exercises{last ? ` · last ${relativeDay(last)}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 24 }} aria-hidden>▶</span>
              </button>
              <Link to={`/routines/${r.id}`} className="icon-btn" aria-label={`Edit ${r.name}`} style={{ display: 'grid', placeItems: 'center' }}>
                ✎
              </Link>
            </div>
          );
        })}
      </div>

      <button className="btn block" onClick={() => start()}>Empty workout</button>
      <Link to="/routines/new" className="btn block ghost">+ New routine</Link>
    </Screen>
  );
}
