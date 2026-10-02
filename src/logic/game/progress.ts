/**
 * XP, level, streak and achievements - all DERIVED from workout history (the single source of truth).
 * Nothing game-related is stored: deleting a workout or undoing a set corrects everything automatically.
 *
 * buildProgress() replays finished workouts oldest → newest. For each one it scores every exercise against the
 * challenge that applied at the time (from the history before it), then awards XP and checks achievements.
 */
import type { Exercise, SetLog, WorkoutSession } from '../../types';
import { ACHIEVEMENTS, type GameStats } from './achievements';
import { MasteryTracker } from '../journey';
import { isSuccess, pbScore, scoreExercise, type Challenge, type ExerciseResult } from './challenge';
import { GAME_CONFIG, type GameConfig } from './config';
import { levelFor, type LevelInfo } from './levels';
import { WeeklyStreak, weekIndex } from './streak';
import { activityEntries, hasContent, strengthEntries } from '../entries';
import { cardioMinutes } from '../cardio';
import { primaryGroups, REGIONS } from '../muscles/catalog';
import { involvementLookup, weightedSets } from '../muscles/analysis';
import type { MuscleGroup, MuscleId } from '../../types';

export type XpEventType = 'workout' | 'challenge' | 'matched' | 'personal-best' | 'consistency' | 'mastery' | 'comeback'
  | 'cardio' | 'warmup' | 'cooldown';

export interface XpEvent {
  type: XpEventType;
  xp: number;
  exerciseId?: string;
}

export interface SessionProgress {
  sessionId: string;
  results: ExerciseResult[];
  events: XpEvent[];
  xp: number;
  /** Achievement ids first unlocked by this workout. */
  unlocked: string[];
  /** Weekly streak after this workout. */
  streakWeeks: number;
}

export interface PersonalBest {
  exerciseId: string;
  set: SetLog;
  date: string;
}

export interface Progress {
  totalXp: number;
  level: LevelInfo;
  streakWeeks: number;
  stats: GameStats;
  personalBests: PersonalBest[];
  achievements: { id: string; sessionId: string; date: string }[];
  bySession: Map<string, SessionProgress>;
}

const localDay = (iso: string) => new Date(iso).toDateString();

/** XP for completing a challenge: a "repeat" target pays less than one that asks for progress. */
export function challengeXp(challenge: Challenge, config: GameConfig = GAME_CONFIG): number {
  return challenge.kind === 'repeat' ? config.xp.repeatChallenge : config.xp.challenge;
}

/** XP events one exercise earned (shared by the replay and live feedback, so they always agree). */
export function exerciseEvents(r: ExerciseResult, config: GameConfig = GAME_CONFIG): XpEvent[] {
  const events: XpEvent[] = [];
  const e = (type: XpEventType, xp: number) => events.push({ type, xp, exerciseId: r.exerciseId });
  if (isSuccess(r.outcome)) e('challenge', challengeXp(r.challenge!, config));
  else if (r.outcome === 'matched' && config.xp.matched > 0) e('matched', config.xp.matched);
  if (r.comeback) e('comeback', config.xp.comeback);
  if (r.personalBestSetIndex >= 0) e('personal-best', config.xp.personalBest);
  if (r.weightMastered) e('mastery', config.xp.mastery);
  return events;
}

/** Cardio / warm-up / cool-down XP for one workout: each at most once, warm-up and cool-down only when planned. */
export function activityEvents(session: WorkoutSession, config: GameConfig = GAME_CONFIG): XpEvent[] {
  const done = activityEntries(session).filter((e) => e.doneAt);
  const events: XpEvent[] = [];
  if (done.some((e) => e.kind === 'cardio')) events.push({ type: 'cardio', xp: config.xp.cardio });
  if (done.some((e) => e.kind === 'warmup' && e.planned)) events.push({ type: 'warmup', xp: config.xp.warmup });
  if (done.some((e) => e.kind === 'cooldown' && e.planned)) events.push({ type: 'cooldown', xp: config.xp.cooldown });
  return events;
}

/**
 * @param sessions finished workouts; may also include the workout in progress (pass it with a `finishedAt`) to
 *                 preview what it has earned so far.
 */
export function buildProgress(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  now: Date = new Date(),
  config: GameConfig = GAME_CONFIG,
): Progress {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const ordered = sessions.filter((s) => s.finishedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const stats: GameStats = {
    workouts: 0, challengesCompleted: 0, personalBests: 0, weightIncreases: 0, maxSessionsOnOneExercise: 0, streakWeeks: 0,
    levelsMastered: 0, successfulSessions: 0, masteredByGroup: {}, challengesByGroup: {}, completeLegDays: 0, balancedWeeks: 0,
  };
  const muscles = new MuscleStats(exercises, config);
  const trackers = new Map<string, MasteryTracker>();
  const sessionsPerExercise = new Map<string, number>();
  const streak = new WeeklyStreak(config);
  const bySession = new Map<string, SessionProgress>();
  const achievements: Progress['achievements'] = [];
  // Earlier workouts per exercise: each exercise is scored against its own history only (keeps the replay fast).
  const priorByExercise = new Map<string, WorkoutSession[]>();
  let totalXp = 0;
  let lastWorkoutXpDay = '';

  for (const session of ordered) {
    const events: XpEvent[] = [];
    const setCount = strengthEntries(session).reduce((n, e) => n + e.sets.length, 0);

    // Workout XP: once per day, for a real workout (so tiny extra sessions don't pay). A cardio day counts too.
    const realWorkout = setCount >= config.minSetsForWorkoutXp || cardioMinutes(session) >= config.minCardioMinutesForWorkoutXp;
    if (realWorkout && localDay(session.startedAt) !== lastWorkoutXpDay) {
      events.push({ type: 'workout', xp: config.xp.workout });
      lastWorkoutXpDay = localDay(session.startedAt);
    }
    stats.workouts++;
    events.push(...activityEvents(session, config));

    const results = strengthEntries(session)
      .filter((e) => byId.has(e.exerciseId) && e.sets.length > 0)
      .map((e) => {
        const ex = byId.get(e.exerciseId)!;
        if (!trackers.has(ex.id)) trackers.set(ex.id, new MasteryTracker(ex));
        return scoreExercise(ex, e.sets, priorByExercise.get(e.exerciseId) ?? [], trackers.get(ex.id));
      });

    for (const r of results) {
      events.push(...exerciseEvents(r, config));
      if (isSuccess(r.outcome)) {
        stats.challengesCompleted++;
        if (r.challenge?.kind === 'more-weight') stats.weightIncreases++;
      }
      if (r.personalBestSetIndex >= 0) stats.personalBests++;
      if (r.weightMastered) stats.levelsMastered++;
      const n = (sessionsPerExercise.get(r.exerciseId) ?? 0) + 1;
      sessionsPerExercise.set(r.exerciseId, n);
      stats.maxSessionsOnOneExercise = Math.max(stats.maxSessionsOnOneExercise, n);
    }

    const withChallenge = results.filter((r) => r.challenge);
    if (withChallenge.length > 0 && withChallenge.every((r) => isSuccess(r.outcome))) stats.successfulSessions++;
    muscles.add(session, results, stats);

    streak.add(session.startedAt);
    stats.streakWeeks = streak.endingAt(weekIndex(session.startedAt));
    if (streak.justQualified(session.startedAt) && stats.streakWeeks % config.streak.milestoneWeeks === 0) {
      events.push({ type: 'consistency', xp: config.xp.consistencyMilestone });
    }

    const unlocked = ACHIEVEMENTS.filter((a) => !achievements.some((u) => u.id === a.id) && a.test(stats)).map((a) => a.id);
    for (const id of unlocked) achievements.push({ id, sessionId: session.id, date: session.startedAt });

    const xp = events.reduce((sum, e) => sum + e.xp, 0);
    totalXp += xp;
    bySession.set(session.id, { sessionId: session.id, results, events, xp, unlocked, streakWeeks: stats.streakWeeks });
    for (const e of strengthEntries(session)) {
      if (!priorByExercise.has(e.exerciseId)) priorByExercise.set(e.exerciseId, []);
      priorByExercise.get(e.exerciseId)!.push(session);
    }
  }

  return {
    totalXp,
    level: levelFor(totalXp, config),
    streakWeeks: streak.current(now),
    stats,
    personalBests: bestSets(ordered, exercises),
    achievements,
    bySession,
  };
}

/**
 * Running muscle-map stats for the achievements: progress per muscle group (weights mastered, challenges completed),
 * complete leg days and balanced weeks. Strength sets only; computed from the same replay, so nothing is stored.
 */
class MuscleStats {
  private groups = new Map<string, MuscleGroup[]>();
  private weeks = new Map<number, Record<MuscleId, number>>();
  private balanced = new Set<number>();
  private byId: Map<string, Exercise>;
  private involvement: ReturnType<typeof involvementLookup>;

  constructor(private exercises: Exercise[], private config: GameConfig) {
    this.byId = new Map(exercises.map((e) => [e.id, e]));
    this.involvement = involvementLookup(exercises);
  }

  private groupsOf(exerciseId: string): MuscleGroup[] {
    if (!this.groups.has(exerciseId)) {
      const ex = this.byId.get(exerciseId);
      this.groups.set(exerciseId, ex ? primaryGroups(ex) : []);
    }
    return this.groups.get(exerciseId)!;
  }

  add(session: WorkoutSession, results: ExerciseResult[], stats: GameStats): void {
    const cfg = this.config.muscleAchievements;
    for (const r of results) {
      for (const g of this.groupsOf(r.exerciseId)) {
        if (r.weightMastered) stats.masteredByGroup[g] = (stats.masteredByGroup[g] ?? 0) + 1;
        if (isSuccess(r.outcome)) stats.challengesByGroup[g] = (stats.challengesByGroup[g] ?? 0) + 1;
      }
    }

    const entries = strengthEntries(session).filter((e) => this.byId.has(e.exerciseId) && e.sets.length > 0);
    if (entries.length === 0) return;
    const sets = weightedSets([session], this.exercises, undefined, this.involvement);
    const allPlannedDone = entries.every((e) => e.sets.length >= e.targetSets);
    if (allPlannedDone && (['quads', 'hamstrings', 'glutes'] as MuscleId[]).every((id) => sets[id] >= cfg.legDayMinSets)) stats.completeLegDays++;

    const week = weekIndex(session.startedAt);
    const total = this.weeks.get(week) ?? ({} as Record<MuscleId, number>);
    for (const [id, n] of Object.entries(sets) as [MuscleId, number][]) total[id] = (total[id] ?? 0) + n;
    this.weeks.set(week, total);
    if (!this.balanced.has(week)) {
      const region = (id: string) => REGIONS.find((r) => r.id === id)!.muscles.reduce((n, m) => n + (total[m] ?? 0), 0);
      const amounts = [region('push'), region('pull'), region('lower')];
      const max = Math.max(...amounts);
      if (Math.min(...amounts) >= cfg.balancedMinSets && Math.min(...amounts) >= cfg.balancedMinShare * max) {
        this.balanced.add(week);
        stats.balancedWeeks++;
      }
    }
  }
}

/** Best set ever per exercise: heaviest weight for a full set in the rep range (most reps for bodyweight). */
function bestSets(sessions: WorkoutSession[], exercises: Exercise[]): PersonalBest[] {
  return exercises.flatMap((ex) => {
    const score = (s: SetLog) => pbScore(ex, s);
    let best: PersonalBest | undefined;
    for (const session of sessions) {
      for (const e of strengthEntries(session)) {
        if (e.exerciseId !== ex.id) continue;
        for (const set of e.sets) {
          if (set.reps < ex.repRange[0]) continue;
          if (!best || score(set) > score(best.set)) best = { exerciseId: ex.id, set, date: session.startedAt };
        }
      }
    }
    return best ? [best] : [];
  });
}

export interface LiveSession {
  results: ExerciseResult[];
  /** Streak including the workout in progress. */
  streakWeeks: number;
}

/**
 * Scores the workout in progress against finished history, for instant feedback after each set.
 * Much cheaper than buildProgress(): finished workouts aren't replayed, so logging stays instant with years of data.
 */
export function scoreLiveSession(
  session: WorkoutSession,
  finished: WorkoutSession[],
  exercises: Exercise[],
  now: Date = new Date(),
  config: GameConfig = GAME_CONFIG,
): LiveSession {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const results = strengthEntries(session)
    .filter((e) => byId.has(e.exerciseId) && e.sets.length > 0)
    .map((e) => scoreExercise(byId.get(e.exerciseId)!, e.sets, finished));
  const streak = new WeeklyStreak(config);
  for (const s of finished) if (s.finishedAt) streak.add(s.startedAt);
  if (session.entries.some(hasContent)) streak.add(session.startedAt); // cardio-only workouts count too
  return { results, streakWeeks: streak.current(now) };
}
