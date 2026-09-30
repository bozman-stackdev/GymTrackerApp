/**
 * Today's Challenge: the progression engine's recommendation, turned into one clear target (weight × reps).
 * The game only reads recommend()'s output, so the engine and the game can evolve independently.
 */
import type { Exercise, SetLog, WorkoutSession } from '../../types';
import { exerciseHistory, workingWeight, type ExercisePerformance } from '../history';
import { recommend, type Recommendation } from '../progression';

export type ChallengeKind = 'more-reps' | 'more-weight' | 'repeat' | 'lighter';

export interface Challenge {
  exerciseId: string;
  kind: ChallengeKind;
  weightKg: number;
  reps: number;
  recommendation: Recommendation;
}

const KIND_BY_RECOMMENDATION: Partial<Record<Recommendation['kind'], ChallengeKind>> = {
  'increase-reps': 'more-reps',
  'increase-weight': 'more-weight',
  hold: 'repeat',
  'decrease-weight': 'lighter',
};

/** Null while the engine is still building history (first time / not enough data): no challenge yet. */
export function challengeFor(exercise: Exercise, priorSessions: WorkoutSession[]): Challenge | null {
  const rec = recommend(exercise, priorSessions);
  const kind = KIND_BY_RECOMMENDATION[rec.kind];
  return kind ? { exerciseId: exercise.id, kind, weightKg: rec.weightKg, reps: rec.reps, recommendation: rec } : null;
}

export type Outcome = 'exceeded' | 'hit' | 'matched' | 'missed';

export const isSuccess = (o: Outcome | null) => o === 'hit' || o === 'exceeded';

/**
 * Compares today's sets with the challenge. One set reaching the target is enough.
 * - hit/exceeded: a set at (at least) the target weight with the target reps (or more)
 * - matched: not the target, but as good as last session's best set - still positive
 * - missed: neither (no penalty, the same target simply comes back)
 */
export function evaluate(challenge: Challenge, sets: SetLog[], last?: ExercisePerformance): Outcome | null {
  if (sets.length === 0) return null;
  const atWeight = sets.filter((s) => s.weightKg >= challenge.weightKg);
  const best = atWeight.length ? Math.max(...atWeight.map((s) => s.reps)) : 0;
  if (best > challenge.reps) return 'exceeded';
  if (best === challenge.reps) return 'hit';
  if (last) {
    const w = workingWeight(last.sets);
    const lastBest = Math.max(...last.sets.filter((s) => s.weightKg === w).map((s) => s.reps));
    if (sets.some((s) => s.weightKg >= w && s.reps >= lastBest)) return 'matched';
  }
  return 'missed';
}

/**
 * A personal best = the heaviest weight ever done for a full set within the rep range (most reps for bodyweight).
 * Counts only if there is earlier history to beat, the set is in the rep range (no heavy singles),
 * and the weight is not above the suggested weight (no reward for going heavier than planned).
 */
export function pbScore(exercise: Exercise, set: SetLog): number {
  if (set.reps < exercise.repRange[0]) return -Infinity;
  // Weight first; reps only break ties (so "most reps at the heaviest weight" is the best set to show).
  return exercise.weightStepKg > 0 ? set.weightKg + set.reps / 1000 : set.reps;
}

/** Index of the first set today that is a personal best, or -1. */
export function personalBestIndex(exercise: Exercise, sets: SetLog[], prior: ExercisePerformance[], challenge: Challenge | null): number {
  const best = (s: SetLog) => (exercise.weightStepKg > 0 ? (s.reps >= exercise.repRange[0] ? s.weightKg : -Infinity) : pbScore(exercise, s));
  const priorBest = Math.max(...prior.flatMap((p) => p.sets.map(best)));
  if (!Number.isFinite(priorBest)) return -1; // nothing to beat yet
  const cap = challenge ? challenge.weightKg : workingWeight(prior.at(-1)!.sets);
  return sets.findIndex((s) => s.weightKg <= cap && best(s) > priorBest);
}

export interface ExerciseResult {
  exerciseId: string;
  challenge: Challenge | null;
  outcome: Outcome | null;
  /** Which set completed the challenge / was a personal best (-1 = none). Used for instant feedback. */
  challengeSetIndex: number;
  personalBestSetIndex: number;
}

export function scoreExercise(exercise: Exercise, sets: SetLog[], priorSessions: WorkoutSession[]): ExerciseResult {
  const challenge = challengeFor(exercise, priorSessions);
  const prior = exerciseHistory(priorSessions, exercise.id);
  return {
    exerciseId: exercise.id,
    challenge,
    outcome: challenge ? evaluate(challenge, sets, prior.at(-1)) : null,
    challengeSetIndex: challenge ? sets.findIndex((_, i) => isSuccess(evaluate(challenge, sets.slice(0, i + 1)))) : -1,
    personalBestSetIndex: personalBestIndex(exercise, sets, prior, challenge),
  };
}
