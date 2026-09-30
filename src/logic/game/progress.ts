/**
 * XP, level, streak and achievements - all DERIVED from workout history (the single source of truth).
 * Nothing game-related is stored: deleting a workout or undoing a set corrects everything automatically.
 *
 * buildProgress() replays finished workouts oldest → newest. For each one it scores every exercise against the
 * challenge that applied at the time (from the history before it), then awards XP and checks achievements.
 */
import type { Exercise, SetLog, WorkoutSession } from '../../types';
import { ACHIEVEMENTS, type GameStats } from './achievements';
import { isSuccess, pbScore, scoreExercise, type Challenge, type ExerciseResult } from './challenge';
import { GAME_CONFIG, type GameConfig } from './config';
import { levelFor, type LevelInfo } from './levels';
import { WeeklyStreak, weekIndex } from './streak';

export type XpEventType = 'workout' | 'challenge' | 'matched' | 'personal-best' | 'consistency';

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

  const stats: GameStats = { workouts: 0, challengesCompleted: 0, personalBests: 0, weightIncreases: 0, maxSessionsOnOneExercise: 0, streakWeeks: 0 };
  const sessionsPerExercise = new Map<string, number>();
  const streak = new WeeklyStreak(config);
  const bySession = new Map<string, SessionProgress>();
  const achievements: Progress['achievements'] = [];
  const prior: WorkoutSession[] = [];
  let totalXp = 0;
  let lastWorkoutXpDay = '';

  for (const session of ordered) {
    const events: XpEvent[] = [];
    const setCount = session.entries.reduce((n, e) => n + e.sets.length, 0);

    // Workout XP: once per day, for a real workout (so tiny extra sessions don't pay).
    if (setCount >= config.minSetsForWorkoutXp && localDay(session.startedAt) !== lastWorkoutXpDay) {
      events.push({ type: 'workout', xp: config.xp.workout });
      lastWorkoutXpDay = localDay(session.startedAt);
    }
    stats.workouts++;

    const results = session.entries
      .filter((e) => byId.has(e.exerciseId) && e.sets.length > 0)
      .map((e) => scoreExercise(byId.get(e.exerciseId)!, e.sets, prior));

    for (const r of results) {
      if (isSuccess(r.outcome)) {
        events.push({ type: 'challenge', xp: challengeXp(r.challenge!, config), exerciseId: r.exerciseId });
        stats.challengesCompleted++;
        if (r.challenge?.kind === 'more-weight') stats.weightIncreases++;
      } else if (r.outcome === 'matched' && config.xp.matched > 0) {
        events.push({ type: 'matched', xp: config.xp.matched, exerciseId: r.exerciseId });
      }
      if (r.personalBestSetIndex >= 0) {
        events.push({ type: 'personal-best', xp: config.xp.personalBest, exerciseId: r.exerciseId });
        stats.personalBests++;
      }
      const n = (sessionsPerExercise.get(r.exerciseId) ?? 0) + 1;
      sessionsPerExercise.set(r.exerciseId, n);
      stats.maxSessionsOnOneExercise = Math.max(stats.maxSessionsOnOneExercise, n);
    }

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
    prior.push(session);
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

/** Best set ever per exercise: heaviest weight for a full set in the rep range (most reps for bodyweight). */
function bestSets(sessions: WorkoutSession[], exercises: Exercise[]): PersonalBest[] {
  return exercises.flatMap((ex) => {
    const score = (s: SetLog) => pbScore(ex, s);
    let best: PersonalBest | undefined;
    for (const session of sessions) {
      for (const e of session.entries) {
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
