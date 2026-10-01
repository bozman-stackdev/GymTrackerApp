/** Achievements: a plain list. Add one by adding an entry - `test` sees running totals after each workout. */
import { GAME_CONFIG } from './config';

export interface GameStats {
  workouts: number;
  challengesCompleted: number;
  personalBests: number;
  weightIncreases: number;
  maxSessionsOnOneExercise: number;
  streakWeeks: number;
  /** Weights mastered on exercise journeys (top of the rep range, 2 workouts in a row). */
  levelsMastered: number;
  /** Workouts where every challenge was completed. */
  successfulSessions: number;
}

export type AchievementIcon = 'flag' | 'target' | 'dumbbell' | 'ten' | 'repeat' | 'star' | 'circleCheck' | 'trophy' | 'calendar' | 'medal' | 'arrowUp';

export interface Achievement {
  id: string;
  /** Name of the app icon shown for it (see components/Icon.tsx). */
  icon: AchievementIcon;
  title: string;
  description: string;
  test: (s: GameStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-workout', icon: 'flag', title: 'First Workout', description: 'Finish your first workout', test: (s) => s.workouts >= 1 },
  { id: 'first-challenge', icon: 'target', title: 'First Challenge Complete', description: "Hit Today's Challenge", test: (s) => s.challengesCompleted >= 1 },
  { id: 'five-workouts', icon: 'dumbbell', title: '5 Workouts', description: 'Finish 5 workouts', test: (s) => s.workouts >= 5 },
  { id: 'ten-challenges', icon: 'ten', title: '10 Challenges Complete', description: 'Hit 10 challenges', test: (s) => s.challengesCompleted >= 10 },
  { id: 'five-sessions-exercise', icon: 'repeat', title: '5 Sessions on the Same Exercise', description: 'Train one exercise in 5 workouts', test: (s) => s.maxSessionsOnOneExercise >= 5 },
  { id: 'exercise-mastered', icon: 'star', title: 'Exercise Mastered', description: 'Master a weight: top of the rep range on every set, 2 workouts in a row', test: (s) => s.levelsMastered >= 1 },
  { id: 'five-successful-sessions', icon: 'circleCheck', title: '5 Successful Sessions', description: 'Complete every challenge in 5 workouts', test: (s) => s.successfulSessions >= 5 },
  { id: 'personal-best', icon: 'trophy', title: 'Personal Best', description: 'Set a personal best', test: (s) => s.personalBests >= 1 },
  {
    id: 'consistency', icon: 'calendar', title: 'Consistency', description: `Train ${GAME_CONFIG.streak.minWorkoutsPerWeek}+ times a week for ${GAME_CONFIG.streak.milestoneWeeks} weeks in a row`,
    test: (s) => s.streakWeeks >= GAME_CONFIG.streak.milestoneWeeks,
  },
  { id: 'twenty-five-workouts', icon: 'medal', title: '25 Workouts', description: 'Finish 25 workouts', test: (s) => s.workouts >= 25 },
  { id: 'first-weight-increase', icon: 'arrowUp', title: 'First Weight Increase', description: 'Complete a challenge at a heavier weight', test: (s) => s.weightIncreases >= 1 },
];
