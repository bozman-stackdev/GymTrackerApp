/**
 * Progression recommendations ("double progression": add reps within a range, then add weight).
 *
 * How it works - two plain steps, both easy to read and change:
 *   1. analyse()  turns the exercise's history into a few facts (streaks, trend, counts).
 *   2. recommend() applies the rules below, IN ORDER; the first that matches wins.
 *
 *   R0 first time            no history                               -> pick a starting weight
 *   R1 not enough data       < minSessions sessions or < minDays       -> match last time, no advice yet
 *   R2 ready to add weight   top of range on every set, N sessions     -> weight + step, reps back to bottom
 *   R3 one more strong one   top of range, but fewer than N sessions   -> stay, repeat the strong session
 *   R4 too heavy             no set reached the range, M sessions      -> weight - step
 *   R5 recent dip            recent sessions clearly below earlier     -> stay, aim to match last session
 *   R7 near miss             last target missed by ≤ nearMissReps      -> same target again ("so close")
 *   R6 default               otherwise                                 -> same weight, +1 rep on weakest set
 *                            (after a bigger miss this re-bases on what was actually done, and says so)
 *
 * All thresholds live in PROGRESSION_CONFIG. The UI only displays the result (title + reason),
 * so rules can change without touching any screen. These are simple rules of thumb, not medical advice.
 */
import type { Exercise, SetLog, WorkoutSession } from '../types';
import { bestEstimated1RM, bestRepsAtWeight, daysBetween, exerciseHistory, formatKg, workingSets, workingWeight, type ExercisePerformance } from './history';

export interface ProgressionConfig {
  /** Sessions of an exercise needed before any advice. */
  minSessions: number;
  /** Days between the first and latest session needed before any advice. */
  minDaysOfHistory: number;
  /**
   * Consecutive sessions with EVERY set at a level to master it (see journey.ts).
   * Mastering the top of the rep range is what unlocks the next weight (rule R2).
   */
  sessionsToMaster: number;
  /** Consecutive sessions below the rep range (same weight) before suggesting less weight. */
  sessionsBelowRangeBeforeDecrease: number;
  /** How many recent sessions count as "recent" when comparing with earlier ones. */
  recentSessions: number;
  /** How many sessions before those count as "earlier". */
  earlierSessions: number;
  /** A drop larger than this (0.05 = 5%) in recent vs earlier performance counts as a dip. */
  dipThreshold: number;
  /** Missing the last target by at most this many reps (at the target weight) means: try the same target again. */
  nearMissReps: number;
}

export const PROGRESSION_CONFIG: ProgressionConfig = {
  minSessions: 3,
  minDaysOfHistory: 14,
  sessionsToMaster: 2,
  sessionsBelowRangeBeforeDecrease: 2,
  recentSessions: 2,
  earlierSessions: 3,
  dipThreshold: 0.05,
  nearMissReps: 1,
};

/** Shown next to recommendations. */
export const PROGRESSION_DISCLAIMER =
  'Suggestions follow simple rules based on your own history. They are not medical or coaching advice - listen to your body.';

export type RecommendationKind =
  | 'first-time'
  | 'not-enough-data'
  | 'increase-weight'
  | 'hold'
  | 'decrease-weight'
  | 'increase-reps'
  | 'retry';

/** Recommendations that are real targets (they become Today's Challenge). */
export const TARGET_KINDS: RecommendationKind[] = ['increase-reps', 'increase-weight', 'hold', 'decrease-weight', 'retry'];

export interface Recommendation {
  kind: RecommendationKind;
  /** Which rule produced this (R0-R6), for transparency and tests. */
  rule: string;
  /** Suggested weight and reps for today's sets (pre-fills the workout screen). */
  weightKg: number;
  reps: number;
  /** Short headline, e.g. "Try 60 kg × 9". */
  title: string;
  /** Why - based on what the user actually did. */
  reason: string;
}

/** Facts about an exercise's history that the rules use. */
export interface ProgressionFacts {
  sessions: number;
  daysOfHistory: number;
  last?: { weightKg: number; reps: number[]; lowest: number; best: number };
  /** Most recent sessions in a row at the last weight with every working set at the top of the range. */
  sessionsAtTopInARow: number;
  /** Most recent sessions in a row at the last weight where NO working set reached the range (a missed last set is normal fatigue). */
  sessionsBelowRangeInARow: number;
  /** Sessions at the last weight where every working set was within or above the range. */
  successfulSessionsAtWeight: number;
  /** Recent vs earlier performance (best estimated 1RM, or reps for bodyweight). -0.07 = 7% lower. Undefined if too little data. */
  recentChange?: number;
}

export function analyse(exercise: Exercise, history: ExercisePerformance[], config = PROGRESSION_CONFIG): ProgressionFacts {
  const [repMin, repMax] = exercise.repRange;
  const facts: ProgressionFacts = {
    sessions: history.length,
    daysOfHistory: history.length ? daysBetween(history[0].date, history.at(-1)!.date) : 0,
    sessionsAtTopInARow: 0,
    sessionsBelowRangeInARow: 0,
    successfulSessionsAtWeight: 0,
  };
  const lastPerf = history.at(-1);
  if (!lastPerf) return facts;

  const weight = workingWeight(lastPerf.sets);
  const reps = workingSets(lastPerf.sets).map((s) => s.reps);
  facts.last = { weightKg: weight, reps, lowest: Math.min(...reps), best: Math.max(...reps) };

  const lowestAtWeight = (p: ExercisePerformance) => Math.min(...workingSets(p.sets).map((s) => s.reps));
  const bestAtWeight = (p: ExercisePerformance) => Math.max(...workingSets(p.sets).map((s) => s.reps));
  const atWeight = history.filter((p) => workingWeight(p.sets) === weight);
  facts.successfulSessionsAtWeight = atWeight.filter((p) => lowestAtWeight(p) >= repMin).length;

  // Streaks, counted backwards from the latest session, stopping at the first break or weight change.
  for (const p of [...history].reverse()) {
    if (workingWeight(p.sets) !== weight || lowestAtWeight(p) < repMax) break;
    facts.sessionsAtTopInARow++;
  }
  for (const p of [...history].reverse()) {
    if (workingWeight(p.sets) !== weight || bestAtWeight(p) >= repMin) break;
    facts.sessionsBelowRangeInARow++;
  }

  // Trend: average of the recent sessions vs the sessions just before them.
  const { recentSessions: r, earlierSessions: e } = config;
  if (history.length >= r + e) {
    const score = (p: ExercisePerformance) => (weight > 0 ? bestEstimated1RM(p.sets) : Math.max(...p.sets.map((s) => s.reps)));
    const avg = (ps: ExercisePerformance[]) => ps.reduce((sum, p) => sum + score(p), 0) / ps.length;
    const recent = avg(history.slice(-r));
    const earlier = avg(history.slice(-(r + e), -r));
    if (earlier > 0) facts.recentChange = recent / earlier - 1;
  }
  return facts;
}

/** The target that applied to the latest workout of this exercise, and how close that workout got to it. */
export function previousTarget(exercise: Exercise, sessions: WorkoutSession[], config = PROGRESSION_CONFIG) {
  const last = exerciseHistory(sessions, exercise.id).at(-1);
  if (!last) return null;
  const target = recommend(exercise, sessions.filter((s) => s.id !== last.sessionId), config, false);
  if (!TARGET_KINDS.includes(target.kind)) return null;
  const best = bestRepsAtWeight(last.sets, target.weightKg);
  return { target, best, missed: best < target.reps };
}

export function recommend(exercise: Exercise, sessions: WorkoutSession[], config = PROGRESSION_CONFIG, lookBack = true): Recommendation {
  const [repMin, repMax] = exercise.repRange;
  const facts = analyse(exercise, exerciseHistory(sessions, exercise.id), config);
  const usesWeight = exercise.weightStepKg > 0;
  const setText = (kg: number, reps: number) => (usesWeight && kg > 0 ? `${formatKg(kg)} × ${reps}` : `${reps} reps`);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // R0
  if (!facts.last) {
    return {
      kind: 'first-time', rule: 'R0', weightKg: 0, reps: repMin, title: 'First time',
      reason: `Pick a weight you can lift for ${repMin}–${repMax} reps with good form.`,
    };
  }
  const { weightKg: w, reps, lowest, best } = facts.last;
  const lastText = `${reps.join(', ')} reps${usesWeight ? ` at ${formatKg(w)}` : ''}`;

  // R1: be patient - no advice until there is a real history.
  if (facts.sessions < config.minSessions || facts.daysOfHistory < config.minDaysOfHistory) {
    const needSessions = Math.max(0, config.minSessions - facts.sessions);
    const needDays = Math.max(0, Math.ceil(config.minDaysOfHistory - facts.daysOfHistory));
    const waiting = [needSessions > 0 && plural(needSessions, 'more session'), needDays > 0 && plural(needDays, 'more day') + ' of history']
      .filter(Boolean)
      .join(' and ');
    return {
      kind: 'not-enough-data', rule: 'R1', weightKg: w, reps: best, title: 'Match last time',
      reason: `Building your history: suggestions start after ${waiting}.`,
    };
  }

  // R2: consistently at the top of the range -> more weight (reps-only for bodyweight).
  if (facts.sessionsAtTopInARow >= config.sessionsToMaster) {
    const why = `You completed ${setText(w, repMax)}+ on every set in your last ${plural(facts.sessionsAtTopInARow, 'session')}.`;
    if (!usesWeight) {
      return { kind: 'increase-reps', rule: 'R2', weightKg: 0, reps: lowest + 1, title: `Try ${lowest + 1} reps`, reason: `${why} Aim a little higher.` };
    }
    const next = w + exercise.weightStepKg;
    return {
      kind: 'increase-weight', rule: 'R2', weightKg: next, reps: repMin, title: `Try ${setText(next, repMin)}`,
      reason: `${why} Consider increasing the weight and building the reps back up.`,
    };
  }

  // R3: at the top once - confirm it before moving up.
  if (facts.sessionsAtTopInARow > 0) {
    return {
      kind: 'hold', rule: 'R3', weightKg: w, reps: best, title: `Stay at ${setText(w, best)}`,
      reason: `You hit ${repMax}+ on every set last session (${lastText}). Aim for another strong session before increasing.`,
    };
  }

  // R4: repeatedly below the range -> lighter.
  if (usesWeight && facts.sessionsBelowRangeInARow >= config.sessionsBelowRangeBeforeDecrease) {
    const next = Math.max(0, w - exercise.weightStepKg);
    return {
      kind: 'decrease-weight', rule: 'R4', weightKg: next, reps: repMin, title: `Try ${setText(next, repMin)}`,
      reason: `No set reached ${repMin} reps at ${formatKg(w)} in your last ${plural(facts.sessionsBelowRangeInARow, 'session')}. A little lighter should get you back into the ${repMin}–${repMax} range.`,
    };
  }

  // R5: recent sessions clearly weaker than earlier ones -> don't push, consolidate.
  if (facts.recentChange !== undefined && facts.recentChange <= -config.dipThreshold) {
    const pct = Math.round(-facts.recentChange * 100);
    return {
      kind: 'hold', rule: 'R5', weightKg: w, reps: best, title: `Stay at ${setText(w, best)}`,
      reason: `Your last ${config.recentSessions} sessions were about ${pct}% below the ones before. Match last session before pushing on - rest and sleep matter too.`,
    };
  }

  // R7: the last target was only just missed -> the same target again.
  const prev = lookBack ? previousTarget(exercise, sessions, config) : null;
  if (prev?.missed && prev.best > 0 && prev.target.reps - prev.best <= config.nearMissReps) {
    const t = prev.target;
    return {
      kind: 'retry', rule: 'R7', weightKg: t.weightKg, reps: t.reps, title: `Try ${setText(t.weightKg, t.reps)} again`,
      reason: `So close last time: ${prev.best} of ${t.reps} reps${usesWeight ? ` at ${formatKg(t.weightKg)}` : ''}. Same target again.`,
    };
  }

  // R6: default - same weight, one more rep on the weakest set.
  const target = Math.min(repMax, Math.max(repMin, lowest + 1));
  const track = facts.successfulSessionsAtWeight > 1 ? ` You've done ${plural(facts.successfulSessionsAtWeight, 'good session')} at this weight.` : '';
  const adjusted = prev?.missed
    ? `Last target was ${setText(prev.target.weightKg, prev.target.reps)}; you did ${lastText}. Adjusted to that: add a rep to your weakest set.`
    : `Last session: ${lastText}. Add a rep to your weakest set before adding weight.${track}`;
  return { kind: 'increase-reps', rule: 'R6', weightKg: w, reps: target, title: `Try ${setText(w, target)}`, reason: adjusted };
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
