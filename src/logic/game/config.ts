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
    /** Hitting a "repeat" challenge (the engine said stay at the same weight × reps): less, as it isn't new progress. */
    repeatChallenge: 10,
    /** Matching last session when the challenge wasn't hit: positive feedback, but no XP (XP is for progress). */
    matched: 0,
    /** New personal best (only at or below the suggested weight - see challenge.ts). */
    personalBest: 50,
    /** Every `milestoneWeeks` weeks of streak. */
    consistencyMilestone: 50,
    /**
     * Mastering a WEIGHT on the journey: the top of the rep range on every set, 2 workouts in a row
     * (what unlocks the next weight). Rep levels on the way are ticked in the journey without XP - they
     * already earn challenge XP, and celebrating each one would make mastery meaningless.
     */
    mastery: 50,
    /** Completing a challenge after missing the previous one on that exercise ("back on track"). */
    comeback: 15,
    /**
     * Cardio, warm-up and cool-down: small, and at most once per workout each, so adding extra cardio never pays more.
     * Warm-up and cool-down only count when they were planned in the routine (rewarding the plan, not padding).
     */
    cardio: 5,
    warmup: 3,
    cooldown: 3,
  },
  minSetsForWorkoutXp: 3,
  /** A workout without enough sets still counts (workout XP) with this much completed cardio: cardio days are workouts. */
  minCardioMinutesForWorkoutXp: 10,
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
