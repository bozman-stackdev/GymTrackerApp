/**
 * Progression recommendations ("double progression").
 *
 * Plain rules, checked in order against the user's own history:
 *   0. Not enough history yet            -> no recommendation, just "match last time".
 *   1. Every working set hit the top of the rep range -> add weight, drop reps to the bottom of the range.
 *   2. Below the bottom of the rep range for the last N sessions at the same weight -> drop weight.
 *   3. Otherwise                         -> keep the weight, add a rep.
 *
 * Every recommendation carries a human-readable `reason` so the user can see *why*.
 * To tune behaviour, change PROGRESSION_RULES or edit a rule below - nothing else depends on the internals.
 */
import type { Exercise, SetLog, WorkoutSession } from '../types';
import { daysBetween, exerciseHistory, formatKg, workingSets, workingWeight, type ExercisePerformance } from './history';

export const PROGRESSION_RULES = {
  /** Sessions of an exercise needed before we suggest changes. */
  minSessions: 3,
  /** Days between the first and latest session needed before we suggest changes. */
  minDaysOfHistory: 14,
  /** Consecutive under-range sessions (same weight) before suggesting a lighter weight. */
  sessionsBeforeDeload: 2,
};

export type RecommendationKind = 'not-enough-data' | 'first-time' | 'increase-weight' | 'increase-reps' | 'decrease-weight';

export interface Recommendation {
  kind: RecommendationKind;
  /** Suggested weight and reps for every set today (used to pre-fill the logging screen). */
  weightKg: number;
  reps: number;
  /** Short headline, e.g. "Go up to 42.5 kg". */
  title: string;
  /** Why - based on what the user actually did. */
  reason: string;
}

/**
 * What to pre-fill for the next set, so logging is usually a single tap.
 * - Once a set is logged today, keep that weight (the user may have adjusted it).
 * - Without a recommendation yet, copy last time set-by-set.
 * - Otherwise use the recommended weight and reps.
 */
export function plannedSet(
  rec: Recommendation,
  setsToday: SetLog[],
  last: ExercisePerformance | undefined,
): { weightKg: number; reps: number } {
  const prevToday = setsToday.at(-1);
  if (rec.kind === 'not-enough-data' && last) {
    const s = last.sets[Math.min(setsToday.length, last.sets.length - 1)];
    return { weightKg: prevToday?.weightKg ?? s.weightKg, reps: s.reps };
  }
  return { weightKg: prevToday?.weightKg ?? rec.weightKg, reps: rec.reps };
}

export function recommend(
  exercise: Exercise,
  sessions: WorkoutSession[],
  rules = PROGRESSION_RULES,
): Recommendation {
  const [repMin, repMax] = exercise.repRange;
  const history = exerciseHistory(sessions, exercise.id);
  const last = history.at(-1);

  if (!last) {
    return {
      kind: 'first-time',
      weightKg: 0,
      reps: repMin,
      title: 'First time',
      reason: `Pick a weight you can lift for ${repMin}–${repMax} reps with good form.`,
    };
  }

  const weight = workingWeight(last.sets);
  const sets = workingSets(last.sets);
  const reps = sets.map((s) => s.reps);
  const lowest = Math.min(...reps);
  const lastText = `${reps.join(', ')} reps${weight > 0 ? ` at ${formatKg(weight)}` : ''}`;

  // Rule 0: be patient - no advice until there is real history.
  const span = daysBetween(history[0].date, last.date);
  if (history.length < rules.minSessions || span < rules.minDaysOfHistory) {
    const needSessions = Math.max(0, rules.minSessions - history.length);
    const needDays = Math.max(0, Math.ceil(rules.minDaysOfHistory - span));
    const waiting = [
      needSessions > 0 ? `${needSessions} more session${needSessions > 1 ? 's' : ''}` : '',
      needDays > 0 ? `${needDays} more day${needDays > 1 ? 's' : ''} of history` : '',
    ]
      .filter(Boolean)
      .join(' and ');
    return {
      kind: 'not-enough-data',
      weightKg: weight,
      reps: Math.max(...reps),
      title: 'Match last time',
      reason: `Suggestions start after ${waiting}.`,
    };
  }

  // Rule 1: top of the range on every working set -> heavier.
  if (lowest >= repMax) {
    if (exercise.weightStepKg <= 0) {
      return {
        kind: 'increase-reps',
        weightKg: weight,
        reps: lowest + 1,
        title: `Aim for ${lowest + 1} reps`,
        reason: `You did ${lastText} last time - every set at or above ${repMax}.`,
      };
    }
    const next = weight + exercise.weightStepKg;
    return {
      kind: 'increase-weight',
      weightKg: next,
      reps: repMin,
      title: `Go up to ${formatKg(next)}`,
      reason: `You hit ${repMax}+ reps on every set last time (${lastText}).`,
    };
  }

  // Rule 2: repeatedly below the range at the same weight -> lighter.
  const recent = history.slice(-rules.sessionsBeforeDeload);
  const struggling =
    exercise.weightStepKg > 0 &&
    recent.length === rules.sessionsBeforeDeload &&
    recent.every((p) => workingWeight(p.sets) === weight && Math.min(...workingSets(p.sets).map((s) => s.reps)) < repMin);
  if (struggling) {
    const next = Math.max(0, weight - exercise.weightStepKg);
    return {
      kind: 'decrease-weight',
      weightKg: next,
      reps: repMin,
      title: `Drop to ${formatKg(next)}`,
      reason: `Below ${repMin} reps at ${formatKg(weight)} for ${rules.sessionsBeforeDeload} sessions in a row.`,
    };
  }

  // Rule 3: same weight, one more rep.
  const target = Math.min(repMax, Math.max(repMin, lowest + 1));
  return {
    kind: 'increase-reps',
    weightKg: weight,
    reps: target,
    title: `Aim for ${target} reps`,
    reason: `Last time: ${lastText}. Add a rep before adding weight.`,
  };
}
