import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../../components/Screen';
import { useStore } from '../../data/store';
import { useProgress } from '../../data/useProgress';
import { isSuccess } from '../../logic/game/challenge';
import { GAME_CONFIG } from '../../logic/game/config';
import { weekIndex } from '../../logic/game/streak';
import { formatDate, plural, sessionSetCount } from '../../logic/history';
import type { WorkoutSession } from '../../types';
import { Icon } from '../../components/Icon';

/** Workouts grouped by week (the same weeks the streak uses), newest first. One line of useful detail each. */
export function HistoryScreen() {
  const { data } = useStore();
  const progress = useProgress();
  const sessions = [...data.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const [thisWeek] = useState(() => weekIndex(new Date()));

  const weeks: { week: number; sessions: WorkoutSession[] }[] = [];
  for (const s of sessions) {
    const week = weekIndex(s.startedAt);
    if (weeks.at(-1)?.week === week) weeks.at(-1)!.sessions.push(s);
    else weeks.push({ week, sessions: [s] });
  }
  const weekTitle = (week: number, first: WorkoutSession) =>
    week === thisWeek ? 'This week' : week === thisWeek - 1 ? 'Last week' : `Week of ${formatDate(mondayOf(first.startedAt))}`;

  return (
    <Screen title="History">
      {sessions.length === 0 && <p className="muted center">No workouts yet. Finished workouts show up here.</p>}
      {weeks.map(({ week, sessions: inWeek }) => {
        const counts = inWeek.length >= GAME_CONFIG.streak.minWorkoutsPerWeek;
        return (
          <section key={week} className="stack" style={{ gap: 8 }} aria-label={weekTitle(week, inWeek[0])}>
            <h2 className="row between">
              <span>{weekTitle(week, inWeek[0])}</span>
              <span className="week-count with-icon">{plural(inWeek.length, 'workout')}{counts && <Icon name="flame" size={15} className="flame" label="counts for your streak" />}</span>
            </h2>
            <div className="list">
              {inWeek.map((s) => {
                const scored = progress.bySession.get(s.id);
                const challenges = scored?.results.filter((r) => r.challenge) ?? [];
                const hit = challenges.filter((r) => isSuccess(r.outcome)).length;
                return (
                  <Link key={s.id} to={`/history/${s.id}`} className="list-item" data-testid="history-item">
                    <div className="grow">
                      <div className="title">{s.name} <span className="muted small">· {formatDate(s.startedAt)}</span></div>
                      <div className="muted small">
                        {plural(s.entries.length, 'exercise')} · {plural(sessionSetCount(s), 'set')}
                        {challenges.length > 0 && <> · <Icon name="target" size={13} className="inline-icon" label="challenges" /> {hit}/{challenges.length}</>}
                      </div>
                    </div>
                    {scored && scored.xp > 0 && <span className="xp small">+{scored.xp} XP</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </Screen>
  );
}

function mondayOf(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString();
}
