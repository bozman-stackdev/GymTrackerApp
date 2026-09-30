/**
 * All gamification numbers in one place. Change them here; nothing else hard-codes XP, levels or streak rules.
 *
 * Safety principle: rewards recognise following the plan, consistency and gradual progress.
 * Nothing pays more for lifting heavier than suggested, training extra days or ignoring fatigue.
 */
export const GAME_CONFIG = {
  xp: {
    /** Finishing a workout (max once per day, needs `minSetsForWorkoutXp` sets). */
    workout: 10,
    /** Hitting (or beating) Today's Challenge on an exercise. Beating it pays the same - no incentive to overdo it. */
    challenge: 25,
    /** Matching last session when the challenge wasn't hit: positive feedback, but no XP (XP is for progress). */
    matched: 0,
    /** New personal best (only at or below the suggested weight - see challenge.ts). */
    personalBest: 50,
    /** Every `milestoneWeeks` weeks of streak. */
    consistencyMilestone: 50,
  },
  minSetsForWorkoutXp: 3,
  /** XP needed to reach level 1, 2, 3, ... Levels beyond the list add `xpPerLevelAfterList` each. */
  levels: [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000],
  xpPerLevelAfterList: 800,
  streak: {
    /** A week (Mon–Sun) counts towards the streak with at least this many workouts. More doesn't help. */
    minWorkoutsPerWeek: 2,
    /** Consistency milestone every N weeks of streak. */
    milestoneWeeks: 4,
  },
};

export type GameConfig = typeof GAME_CONFIG;
