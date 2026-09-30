/**
 * Exercise Progression Journey: an exercise as a ladder of levels (weight × reps) instead of a list of numbers.
 *
 *   60 kg × 8 → 60 × 9 → … → 60 × 12 → 65 × 8 → 65 × 9 → …   (rep range and weight step come from the exercise)
 *
 * A level is MASTERED when EVERY working set reached it in `sessionsToMaster` workouts in a row.
 * That is the same rule the progression engine uses before adding weight (R2), so mastering the top of the
 * rep range is exactly what unlocks the next weight. The current level is Today's Challenge (passed in).
 * Pure functions, no React: reusable anywhere.
 */
import type { Exercise, SetLog, WorkoutSession } from '../types';
import { exerciseHistory, workingSets, workingWeight } from './history';
import { PROGRESSION_CONFIG } from './progression';
import { snapWeight, suggestWeight, unitStepKg } from './units';

export interface Level {
  weightKg: number;
  reps: number;
}

export const JOURNEY_CONFIG = {
  /** Locked levels shown after the current one. */
  lockedPreview: 2,
  /** Mastered/reached levels shown before the current one (older ones are summarised as "N earlier levels"). */
  recentShown: 3,
};

export const levelKey = (l: Level) => `${l.weightKg}x${l.reps}`;
export const compareLevels = (a: Level, b: Level) => a.weightKg - b.weightKg || a.reps - b.reps;
const usesWeight = (ex: Exercise) => ex.weightStepKg > 0;

/** The level after `l`: one more rep, or the next weight back at the bottom of the rep range. */
export function nextLevel(ex: Exercise, l: Level): Level {
  const [repMin, repMax] = ex.repRange;
  if (!usesWeight(ex) || l.reps < repMax) return { weightKg: l.weightKg, reps: l.reps + 1 };
  return { weightKg: suggestWeight(l.weightKg + unitStepKg(ex.weightStepKg)), reps: repMin };
}

/** What a workout "proves": its working weight and the reps of its weakest working set. */
function sessionProof(ex: Exercise, sets: SetLog[]): Level | null {
  if (sets.length === 0) return null;
  const w = usesWeight(ex) ? workingWeight(sets) : 0;
  return { weightKg: w, reps: Math.min(...workingSets(sets).map((s) => s.reps)) };
}

/**
 * Tracks mastery workout by workout (incremental, so replaying years of history stays cheap).
 * add() returns the levels that became mastered with that workout.
 */
export class MasteryTracker {
  private runs = new Map<string, number>();
  private bestRuns = new Map<string, number>();
  private mastered = new Set<string>();
  private weights = new Set<number>();

  constructor(private exercise: Exercise, private sessionsToMaster = PROGRESSION_CONFIG.sessionsToMaster) {}

  add(sets: SetLog[]): Level[] {
    const proof = sessionProof(this.exercise, sets);
    if (!proof) return [];
    this.weights.add(proof.weightKg);
    const achieved = new Set(this.levelsUpTo(proof).map(levelKey));

    for (const key of this.runs.keys()) if (!achieved.has(key)) this.runs.set(key, 0);
    const newly: Level[] = [];
    for (const level of this.levelsUpTo(proof)) {
      const key = levelKey(level);
      const run = (this.runs.get(key) ?? 0) + 1;
      this.runs.set(key, run);
      this.bestRuns.set(key, Math.max(run, this.bestRuns.get(key) ?? 0));
      if (run >= this.sessionsToMaster && !this.mastered.has(key)) {
        this.mastered.add(key);
        newly.push(level);
      }
    }
    return newly;
  }

  isMastered(l: Level): boolean {
    return this.mastered.has(levelKey(l));
  }

  /** Longest run of workouts in a row that reached this level (0 = never). */
  bestRun(l: Level): number {
    return this.bestRuns.get(levelKey(l)) ?? 0;
  }

  /** Weights on the ladder: every weight used, plus the step grid from the lightest one. */
  ladderWeights(upTo: number): number[] {
    const used = [...this.weights];
    if (!usesWeight(this.exercise) || used.length === 0) return used.length ? [0] : [];
    const set = new Set(used.filter((w) => w <= upTo));
    for (let w = Math.min(...used); w <= upTo + 1e-9; w = snapWeight(w + unitStepKg(this.exercise.weightStepKg))) set.add(w);
    return [...set].sort((a, b) => a - b);
  }

  /** All ladder levels a workout with this proof achieves. */
  private levelsUpTo(proof: Level): Level[] {
    const [repMin, repMax] = this.exercise.repRange;
    const maxReps = usesWeight(this.exercise) ? Math.min(proof.reps, repMax) : proof.reps;
    return this.ladderWeights(proof.weightKg).flatMap((w) =>
      Array.from({ length: Math.max(0, maxReps - repMin + 1) }, (_, i) => ({ weightKg: w, reps: repMin + i })),
    );
  }
}

export type LevelStatus = 'mastered' | 'reached' | 'current' | 'locked';

export interface JourneyLevel extends Level {
  status: LevelStatus;
  /** For "reached": workouts in a row so far (e.g. 1 of 2). */
  sessionsInARow: number;
}

export interface Journey {
  levels: JourneyLevel[];
  /** Mastered levels not shown in `levels` ("12 earlier levels mastered"). */
  earlierMastered: number;
  masteredCount: number;
  sessionsToMaster: number;
}

export function buildJourney(exercise: Exercise, sessions: WorkoutSession[], current: Level | null): Journey {
  const tracker = new MasteryTracker(exercise);
  const history = exerciseHistory(sessions, exercise.id);
  for (const p of history) tracker.add(p.sets);
  const sessionsToMaster = PROGRESSION_CONFIG.sessionsToMaster;

  const statusOf = (l: Level): JourneyLevel => {
    const run = tracker.bestRun(l);
    const status: LevelStatus = current && levelKey(current) === levelKey(l) ? 'current'
      : tracker.isMastered(l) ? 'mastered' : run > 0 ? 'reached' : 'locked';
    return { ...l, status, sessionsInARow: run };
  };

  // Every ladder level achieved so far (reached or mastered).
  const topWeight = Math.max(0, ...history.map((p) => (usesWeight(exercise) ? workingWeight(p.sets) : 0)));
  const [repMin, repMax] = exercise.repRange;
  const maxBodyweightReps = Math.max(repMin, ...history.flatMap((p) => p.sets.map((s) => s.reps)));
  const ladder: Level[] = tracker.ladderWeights(topWeight).flatMap((w) => {
    const top = usesWeight(exercise) ? repMax : maxBodyweightReps;
    return Array.from({ length: top - repMin + 1 }, (_, i) => ({ weightKg: w, reps: repMin + i }));
  });
  const achieved = ladder.map(statusOf).filter((l) => l.status === 'mastered' || l.status === 'reached');

  // Before the current level: the most recent achieved ones. After it: a short locked preview.
  const anchor = current ?? achieved.at(-1) ?? null;
  const below = achieved.filter((l) => !anchor || compareLevels(l, anchor) < 0);
  const shown = below.slice(-JOURNEY_CONFIG.recentShown);
  const levels: JourneyLevel[] = [...shown];
  let cursor = anchor;
  if (current) levels.push(statusOf(current));
  else if (anchor && !shown.some((l) => levelKey(l) === levelKey(anchor))) levels.push(statusOf(anchor));
  for (let i = 0; cursor && i < JOURNEY_CONFIG.lockedPreview; i++) {
    cursor = nextLevel(exercise, cursor);
    levels.push(statusOf(cursor));
  }

  const masteredCount = ladder.filter((l) => tracker.isMastered(l)).length;
  const hidden = below.slice(0, Math.max(0, below.length - JOURNEY_CONFIG.recentShown));
  return { levels, earlierMastered: hidden.filter((l) => l.status === 'mastered').length, masteredCount, sessionsToMaster };
}
