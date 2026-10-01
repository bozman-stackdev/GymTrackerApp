import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { startWorkout } from '../data/actions';
import { exportBackup, needsBackupReminder, snoozeBackupReminder } from '../data/backup';
import { createStarterData } from '../data/seed';
import { useStore } from '../data/store';
import { useAccount } from '../data/account';
import { useProgress } from '../data/useProgress';
import { Streak } from '../components/ProgressWidgets';
import { challengeFor } from '../logic/game/challenge';
import { lastDoneAt, plural, relativeDay, routinesByNextUp } from '../logic/history';
import type { Routine } from '../types';
import { Icon } from '../components/Icon';

/** Start screen: one tap on a routine starts the workout. */
export function HomeScreen() {
  const { data, update, replace } = useStore();
  const { account } = useAccount();
  const navigate = useNavigate();
  const active = data.activeWorkout;
  const progress = useProgress();

  const lastDone = (routineId: string) => lastDoneAt(data.sessions, routineId) || undefined;
  // "Next up" (done longest ago) first, so it's one tap away.
  const routines = routinesByNextUp(data.routines, data.sessions);

  // Today's Challenge is the heart of a workout: show how many are waiting in each routine.
  const challengesReady = (r: Routine) =>
    r.items.filter((i) => { const ex = data.exercises.find((e) => e.id === i.exerciseId); return ex && challengeFor(ex, data.sessions); }).length;

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
      {/* With an account the data is already saved off the phone: no reminder. */}
      {account === null && needsBackupReminder(data) && (
        <div className="sample-banner" data-testid="backup-reminder" role="status">
          <span className="grow with-icon"><Icon name="save" size={18} /> Keep your workouts safe: export a backup.</span>
          <button className="btn ghost" onClick={() => exportBackup(data, update)}>Export</button>
          <button className="btn ghost" onClick={() => update((d) => snoozeBackupReminder(d))}>Later</button>
        </div>
      )}
      {active && (
        <Link to="/workout" className="banner">
          <span>Resume {active.session.name}</span>
          <Icon name="forward" size={22} />
        </Link>
      )}

      <Link to="/profile" className="muted small home-progress" data-testid="home-progress">
        Level {progress.level.level} · <Streak weeks={progress.streakWeeks} />
      </Link>

      <h2>Start a workout</h2>
      <div className="list">
        {routines.map((r, i) => {
          const last = lastDone(r.id);
          const ready = challengesReady(r);
          const nextUp = i === 0 && !active;
          return (
            <div key={r.id} className="row">
              <button className={`list-item grow${nextUp ? ' next-up' : ''}`} onClick={() => start(r)}>
                <div className="grow">
                  {nextUp && <div className="small next-up-label">Next up</div>}
                  <div className="title routine-name">{r.name}</div>
                  <div className="muted small">
                    {plural(r.items.length, 'exercise')}{last ? ` · last ${relativeDay(last)}` : ''}
                  </div>
                  {ready > 0 && <div className="small challenges-ready with-icon"><Icon name="target" size={15} /> {plural(ready, 'challenge')} ready</div>}
                </div>
                <span className="play" aria-hidden><Icon name="play" size={18} /></span>
              </button>
              <Link to={`/routines/${r.id}`} className="icon-btn" aria-label={`Edit ${r.name}`}>
                <Icon name="edit" />
              </Link>
            </div>
          );
        })}
      </div>

      <div className="row home-actions">
        <Link to="/scan" className="btn grow scan-btn"><Icon name="camera" /> Scan machine</Link>
        <button className="btn grow" onClick={() => start()}><Icon name="plus" /> Empty workout</button>
      </div>
      <Link to="/routines/new" className="btn block ghost"><Icon name="plus" /> New routine</Link>
    </Screen>
  );
}
