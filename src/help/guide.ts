/** The first-time guide: seven short steps. Plain data (screens/GuideScreen.tsx shows it). */
import type { IconName } from '../components/Icon';

export interface GuideStep {
  icon: IconName;
  title: string;
  lines: string[];
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    icon: 'dumbbell', title: 'Welcome',
    lines: [
      'Track your workouts in a few taps and improve a little each time.',
      'Spend less time on your phone and more time training.',
    ],
  },
  {
    icon: 'user', title: 'Your profile',
    lines: [
      'Choose kg or lb and the body for the muscle map. Name, experience and goal help tailor things.',
      'All optional - you can start training now and fill it in later in Profile.',
    ],
  },
  {
    icon: 'play', title: 'Start a workout',
    lines: [
      'On Train, tap a routine to start it - the one due next is at the top.',
      'Or tap Freestyle Workout and add exercises as you go.',
    ],
  },
  {
    icon: 'check', title: 'Log a set',
    lines: [
      'The weight is filled in for you. After your set, tap the number of reps you did. That\'s it.',
      'The rest timer starts by itself; the next exercise opens when you\'re done.',
    ],
  },
  {
    icon: 'target', title: "Today's Challenge",
    lines: [
      'Each exercise gets one small target based on your last workouts - often just one more rep.',
      'You don\'t need to add weight every session. Missing a target costs nothing; the next one adjusts.',
    ],
  },
  {
    icon: 'trendUp', title: 'Track your progress',
    lines: [
      'History has every workout. Profile shows your level, XP, achievements and personal bests.',
      'The Muscles tab shows what you trained and where you\'re progressing.',
    ],
  },
  {
    icon: 'help', title: 'Help any time',
    lines: [
      'Tap ? at the top of a screen for help with it, or open the Help centre from Profile.',
      'You can replay this guide from there too.',
    ],
  },
];
