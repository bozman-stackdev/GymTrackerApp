/**
 * Every number the muscle map uses, in one place. Change them here; no screen hard-codes a weighting or threshold.
 *
 * What the map measures: recorded TRAINING (sets) and PERFORMANCE (weights, reps, challenges) from the user's own
 * workouts. It can't measure muscle size or growth, and never claims to.
 */
export const MUSCLE_CONFIG = {
  /** How much one set counts for a muscle the exercise trains. An exercise can override this per muscle. */
  involvement: { primary: 1, secondary: 0.5 },

  activity: {
    /**
     * Activity = weighted working sets in the period (warm-up sets and cardio never count). The map shows it relative
     * to the most-trained muscle of that period (100%): it answers "what am I training most?", not "is it enough?".
     * Levels by that percentage:
     */
    levels: { medium: 34, high: 67 },
  },

  progress: {
    /**
     * Each factor is scored -1..1 (performance, volume) or 0..1 (the rest), then averaged with these weights.
     * Factors without data (e.g. no challenges yet, or consistency over a single workout) are left out.
     */
    factors: { performance: 0.45, volume: 0.15, challenges: 0.2, mastery: 0.1, consistency: 0.1 },
    /**
     * Performance is measured in journey steps (one more rep, or the next weight back at the bottom of the rep range):
     * the same ladder Today's Challenge climbs. One step every 2 workouts on an exercise = full score.
     */
    stepsPerSessionForFull: 0.5,
    /** Best workout volume of an exercise (weight × reps) this much above before = full volume score. */
    volumeGainForFull: 0.1,
    /** Weights mastered (weighted by involvement) for a full mastery score. */
    masteredForFull: 1,
    /** Exercises that only lightly involve a muscle (e.g. calves in a leg curl) don't decide its progress. */
    minInvolvement: 0.5,
    /** Consistency (weeks trained / weeks) only means something over this many weeks. */
    minWeeksForConsistency: 2,
    /** Score thresholds for the labels. */
    levels: { strong: 0.45, moderate: 0.15, lower: -0.15 },
  },

  balance: {
    /** Below this many weighted sets in the period there's too little to compare. */
    minSets: 6,
    /** One side this many times the other = a clear training emphasis worth mentioning. */
    emphasisRatio: 1.5,
    /** Region level by its share of the busiest region. */
    levels: { high: 0.7, moderate: 0.4 },
  },
};

export type MuscleConfig = typeof MUSCLE_CONFIG;
