import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { LevelBar, Streak } from '../../components/ProgressWidgets';
import { LeaderboardLine } from '../../components/LeaderboardWidgets';
import { Screen } from '../../components/Screen';
import { formatDuration } from '../../components/useNow';
import { useMemo, useState } from 'react';
import { SetEditor } from '../../components/SetEditor';
import { MiniMaps } from '../../components/body/MiniMaps';
import { bodyTypeOf } from '../../data/useMuscles';
import { analyseMuscles } from '../../logic/muscles/analysis';
import { muscleName, MUSCLE_IDS } from '../../logic/muscles/catalog';
import { activityTone } from '../muscles/parts';
import { deleteEntry, deleteSession, editSet } from '../../data/actions';
import { isStrength, strengthEntries } from '../../logic/entries';
import { cardioMinutes, describeActivity } from '../../logic/cardio';
import { entryTitle, KindLabel } from '../../components/activityUi';
import { useExerciseLookup, useStore } from '../../data/store';
import { useProgress } from '../../data/useProgress';
import { ACHIEVEMENTS } from '../../logic/game/achievements';
import { challengeFor, type Challenge, type Outcome } from '../../logic/game/challenge';
import type { Progress, SessionProgress, XpEvent } from '../../logic/game/progress';
import { formatDate, formatSets, formatTarget, formatWeight, sessionSetCount, sessionVolumeKg } from '../../logic/history';
import { getUnits, toDisplay, unitStepKg } from '../../logic/units';
import type { WorkoutSession } from '../../types';
import { Icon } from '../../components/Icon';
import { GAME_CONFIG } from '../../logic/game/config';

/** One finished workout: what you did, what it earned, and what's next. Also the "workout complete" screen. */
export function SessionScreen() {
  const { id } = useParams();
  const { data, update } = useStore();
  const getExercise = useExerciseLookup();
  const navigate = useNavigate();
  const progress = useProgress();
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<{ entry: number; set: number } | null>(null);
  const session = data.sessions.find((s) => s.id === id);
  if (!session) return <Navigate to="/history" replace />;

  const scored = progress.bySession.get(session.id);
  const isLatest = [...data.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).at(-1)?.id === session.id;
  const resultFor = (exerciseId: string) => scored?.results.find((r) => r.exerciseId === exerciseId);
  const editingEntry = editing ? session.entries[editing.entry] : undefined;
  const editingStrength = editingEntry && isStrength(editingEntry) ? editingEntry : undefined;

  const remove = () => {
    if (!confirm('Delete this workout from your history?')) return;
    update((d) => deleteSession(d, session.id));
    navigate('/history', { replace: true });
  };

  return (
    <Screen title={session.name} back action={
      <button className="btn ghost" aria-pressed={editMode} onClick={() => setEditMode(!editMode)}>{editMode ? 'Done editing' : 'Edit sets'}</button>
    }>
      <p className="muted flush">
        {formatDate(session.startedAt)}
        {session.finishedAt && ` · ${formatDuration(Date.parse(session.finishedAt) - Date.parse(session.startedAt))}`}
        {sessionVolumeKg(session) > 0 && ` · ${Math.round(toDisplay(sessionVolumeKg(session))).toLocaleString()} ${getUnits()} lifted`}
        {cardioMinutes(session) > 0 && ` · ${cardioMinutes(session)} min cardio`}
      </p>

      {scored && <WorkoutRewards scored={scored} session={session} progress={isLatest ? progress : undefined} />}
      {!editMode && <MusclesTrained session={session} />}

      {editMode && (
        <div className="list" data-testid="edit-sets">
          <p className="muted small flush">Tap a set to fix it. Rewards and your journey update automatically.</p>
          {session.entries.map((e, ei) => isStrength(e) ? (
            <div key={`s${ei}`} className="card">
              <div className="title">{getExercise(e.exerciseId).name}</div>
              <div className="set-chips">
                {e.sets.map((s, si) => (
                  <button key={si} className="set-chip" onClick={() => setEditing({ entry: ei, set: si })}
                    aria-label={`Edit ${getExercise(e.exerciseId).name} set ${si + 1}`}>
                    {s.weightKg > 0 ? `${formatWeight(s.weightKg)} × ` : ''}{s.reps}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div key={`a${ei}`} className="card row">
              <div className="grow">
                <KindLabel kind={e.kind} />
                <div className="title">{entryTitle(e, getExercise)}</div>
                <div className="muted small">{describeActivity(e, formatSets)}</div>
              </div>
              <button className="btn ghost danger" aria-label={`Remove ${entryTitle(e, getExercise)}`}
                onClick={() => { if (confirm(`Remove ${entryTitle(e, getExercise)} from this workout?`)) update((d) => deleteEntry(d, session.id, ei)); }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {editing && editingStrength && editingStrength.sets[editing.set] && (() => {
        const ex = getExercise(editingStrength.exerciseId);
        const save = (patch: { reps: number; weightKg: number } | null) => {
          update((d) => editSet(d, session.id, editing.entry, editing.set, patch));
          setEditing(null);
        };
        return (
          <SetEditor
            title={`${ex.name} · set ${editing.set + 1}`}
            set={editingStrength.sets[editing.set]}
            usesWeight={ex.weightStepKg > 0}
            weightStep={unitStepKg(ex.weightStepKg)}
            onSave={save}
            onDelete={() => save(null)}
            onClose={() => setEditing(null)}
          />
        );
      })()}

      <div className="list" hidden={editMode}>
        {session.entries.map((e, ei) => {
          if (!isStrength(e)) {
            return (
              <div key={`a${ei}`} className="list-item static" data-testid="activity-item">
                <div className="grow">
                  <KindLabel kind={e.kind} />
                  <div className="title">{entryTitle(e, getExercise)}</div>
                  <div className="muted small">{describeActivity(e, formatSets) || 'Done'}</div>
                </div>
              </div>
            );
          }
          const r = resultFor(e.exerciseId);
          return (
            <Link key={`s${ei}`} to={`/exercises/${e.exerciseId}`} className="list-item">
              <div className="grow">
                <div className="title">{getExercise(e.exerciseId).name}</div>
                <div className="muted small">{formatSets(e.sets)}</div>
                {r?.challenge && r.outcome && <OutcomeLine outcome={r.outcome} target={formatTarget(r.challenge)} comeback={r.comeback} />}
                {r?.weightMastered ? <div className="outcome good with-icon" data-testid="mastered"><Icon name="star" size={14} /> Weight mastered: {formatTarget(r.weightMastered)} - next weight unlocked</div>
                  : r?.newlyMastered && <div className="outcome muted with-icon" data-testid="mastered"><Icon name="check" size={14} /> {formatTarget(r.newlyMastered)} mastered</div>}
              </div>
            </Link>
          );
        })}
      </div>

      {isLatest && <NextChallenges session={session} />}

      <Link to="/" className="btn primary block">Done</Link>
      <button className="btn ghost danger block" onClick={remove}>Delete workout</button>
    </Screen>
  );
}


/** Positive for hit/beaten/matched; neutral (never negative) for a miss. */
function OutcomeLine({ outcome, target, comeback }: { outcome: Outcome; target: string; comeback: boolean }) {
  const text = {
    hit: comeback ? `Back on track: ${target} complete` : `Target ${target} hit`,
    exceeded: comeback ? `Back on track: ${target} beaten` : `Target ${target} beaten`,
    matched: `Matched last session · target was ${target}`,
    missed: `Not today · target ${target} · next challenge adjusted`,
  }[outcome];
  return <div className={`outcome with-icon${outcome === 'missed' ? ' muted' : ' good'}`} data-testid="outcome">{outcome !== 'missed' && <Icon name="check" size={14} />}{text}</div>;
}

const EVENT_LABEL: Record<XpEvent['type'], string> = {
  workout: 'Workout complete',
  challenge: 'Challenge complete',
  matched: 'Matched last session',
  'personal-best': 'Personal best',
  consistency: 'Consistency milestone',
  mastery: 'Level mastered',
  comeback: 'Back on track',
  cardio: 'Cardio',
  warmup: 'Warm-up',
  cooldown: 'Cool-down',
};

/** What this workout earned. `progress` is given for the latest workout only (level/streak "now"). */
/** The muscles this workout trained, on a small map; opens the muscle map for this workout. */
function MusclesTrained({ session }: { session: WorkoutSession }) {
  const { data } = useStore();
  const a = useMemo(() => analyseMuscles({ sessions: [session], exercises: data.exercises }, 'workout', session.id), [session, data.exercises]);
  const top = MUSCLE_IDS.filter((m) => a.activity[m].sets > 0).sort((x, y) => a.activity[y].sets - a.activity[x].sets).slice(0, 3);
  if (top.length === 0) return null; // cardio only
  return (
    <Link to={`/muscles?period=workout&session=${session.id}`} className="card muscles-worked muscles-trained" data-testid="muscles-trained">
      <MiniMaps body={bodyTypeOf(data.profile)} tone={(m) => activityTone(a.activity[m].level)} label={`Muscles in this workout: ${top.map(muscleName).join(', ')}`} />
      <div className="stack tight grow">
        <div className="caps small">Muscles in this workout</div>
        <div className="title">{top.map(muscleName).join(', ')}</div>
        <span className="small accent with-icon">Open the muscle map <Icon name="chevronRight" size={16} /></span>
      </div>
    </Link>
  );
}

function WorkoutRewards({ scored, session, progress }: { scored: SessionProgress; session: WorkoutSession; progress?: Progress }) {
  const getExercise = useExerciseLookup();
  // Nothing earned: say why, instead of a bare "+0 XP".
  const why = scored.events.length > 0 ? null
    : sessionSetCount(session) < GAME_CONFIG.minSetsForWorkoutXp ? `Workouts with ${GAME_CONFIG.minSetsForWorkoutXp}+ sets earn XP.`
    : 'Workout XP counts once a day. Challenges and personal bests always count.';
  return (
    <div className="card stack" data-testid="rewards">
      <div className="row between">
        <strong>Workout rewards</strong>
        <strong className="xp" data-testid="session-xp">+{scored.xp} XP</strong>
      </div>
      <div className="reward-list small">
        {scored.events.map((e, i) => (
          <div key={i} className="reward-row">
            <span>{EVENT_LABEL[e.type]}{e.exerciseId ? ` · ${getExercise(e.exerciseId).name}` : ''}</span>
            <span className="muted">+{e.xp}</span>
          </div>
        ))}
        {why && <div className="muted" data-testid="no-xp-reason">{why}</div>}
      </div>
      {progress && <LevelBar level={progress.level} />}
      {progress && <LeaderboardLine />}
      <div className="small"><Streak weeks={progress?.streakWeeks ?? scored.streakWeeks} /></div>
      {scored.unlocked.map((id) => {
        const a = ACHIEVEMENTS.find((x) => x.id === id)!;
        return <div key={id} className="small with-icon" data-testid="new-achievement"><Icon name={a.icon} size={18} className="accent" /> <span><strong>New achievement:</strong> {a.title}</span></div>;
      })}
    </div>
  );
}

/** The next challenge for each exercise of this workout (when the engine has one). */
function NextChallenges({ session }: { session: WorkoutSession }) {
  const { data } = useStore();
  const getExercise = useExerciseLookup();
  const next = strengthEntries(session)
    .map((e) => challengeFor(getExercise(e.exerciseId), data.sessions))
    .filter((c): c is Challenge => !!c);
  if (next.length === 0) return null;
  return (
    <div className="card" data-testid="next-challenges">
      <strong>Next time</strong>
      <div className="reward-list small" style={{ marginTop: 6 }}>
        {next.map((c) => (
          <div key={c.exerciseId} className="reward-row">
            <span>{getExercise(c.exerciseId).name}</span>
            <strong>{c.kind === 'repeat' ? 'Repeat ' : ''}{formatTarget(c)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
