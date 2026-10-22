/**
 * Help centre content. Plain data, kept apart from workout logic so it can be edited freely. Every article answers:
 * what does it do, how do I use it, what happens. Numbers come from the game config, so help never disagrees with it.
 * Screens refer to articles by id (Screen `help`, HelpTip `topic`); a unit test checks those ids exist.
 */
import { GAME_CONFIG } from '../logic/game/config';

const XP = GAME_CONFIG.xp;
const LB = GAME_CONFIG.leaderboard;

export const HELP_CATEGORIES = [
  'Getting Started',
  'Workouts and Exercises',
  'Freestyle Workout',
  'Cardio and Timers',
  "Today's Challenge and Progression",
  'Workout History and Missed Workouts',
  'Progress, Muscle Map and Personal Records',
  'XP, Achievements and Leaderboard',
  'Account, Settings and Premium',
] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export interface HelpArticle {
  id: string;
  category: HelpCategory;
  title: string;
  /** What does this feature do? */
  what: string;
  /** How do I use it? */
  how: string;
  /** What happens when I use it? */
  result: string;
  keywords?: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  // ---------- Getting Started ----------
  {
    id: 'welcome', category: 'Getting Started', title: 'How the app works',
    what: 'It records your workouts with as few taps as possible, then suggests what to aim for next time so you improve steadily.',
    how: 'Pick a routine on Train and log each set with one tap. Check History and Profile when you want to see your progress.',
    result: 'Your phone stays in your pocket more, and each workout builds on the last one.',
    keywords: 'start begin overview intro',
  },
  {
    id: 'home', category: 'Getting Started', title: 'The Train screen',
    what: 'Your starting point: your routines (the one due next is at the top), a Freestyle Workout, Scan machine and New routine.',
    how: 'Tap a routine to start it straight away. The pencil edits a routine. "challenges ready" shows how many exercises have a target today.',
    result: 'The workout screen opens with the routine\'s exercises ready to log.',
    keywords: 'home train routine next up start',
  },
  {
    id: 'profile-setup', category: 'Getting Started', title: 'Your profile',
    what: 'Name, units (kg or lb), body type for the muscle map, experience and goal. Age, height and weight are optional.',
    how: 'Open Profile, fill in what you like and tap Save. Nothing is required to start training.',
    result: 'Units change everywhere at once; the muscle map shows the body you chose. Your details stay on this phone unless you create an account.',
    keywords: 'settings name units kg lb body weight height age',
  },
  {
    id: 'guide', category: 'Getting Started', title: 'Replay the introduction',
    what: 'The short first-time guide: starting a workout, logging, challenges and progress.',
    how: 'Tap "Replay the guide" at the top of Help, or in Profile → Help.',
    result: 'The guide opens; your data isn\'t changed. Finish or Skip takes you back.',
    keywords: 'onboarding tour tutorial introduction',
  },

  // ---------- Workouts and Exercises ----------
  {
    id: 'log-set', category: 'Workouts and Exercises', title: 'Log a set',
    what: 'Records the weight and reps of a set.',
    how: 'The weight is filled in for you (adjust with − / + or the quick chips). After the set, tap the number of reps you did - that\'s it. Tap "More" for numbers that aren\'t shown.',
    result: 'The set is saved at once and the weight carries over to the next set. After the last planned set, the next exercise opens by itself.',
    keywords: 'reps weight record enter sets quick',
  },
  {
    id: 'workout-screen', category: 'Workouts and Exercises', title: 'The workout screen',
    what: 'Everything for the current exercise, plus the strip of all items in this workout.',
    how: 'Tap an item in the strip to move to it (✓ = done, 2/3 = sets done). "+ Add" adds an exercise or cardio. "Finish Exercise" moves on; "Finish Session" ends the workout.',
    result: 'Nothing is lost if you close the app: opening it again takes you back to the workout.',
    keywords: 'strip move between exercises next finish',
  },
  {
    id: 'add-to-workout', category: 'Workouts and Exercises', title: 'Add or remove an exercise',
    what: 'Adds an exercise, cardio, a warm-up or a cool-down to the workout in progress - or takes out one added by mistake.',
    how: 'Tap "+ Add" in the header (or + at the end of the strip) and pick from your library, search by name, muscle or equipment. "Remove from workout" under an item takes it out.',
    result: 'Added items appear at the end of the strip. Removing asks first only if you logged something on it.',
    keywords: 'add exercise remove delete mistake library search',
  },
  {
    id: 'finish-workout', category: 'Workouts and Exercises', title: 'Finish or discard a workout',
    what: 'Ends the workout.',
    how: '"Finish Session" saves it; "Discard workout" (at the bottom) throws it away. You can finish at any time - you don\'t have to complete every set.',
    result: 'A finished workout goes to History with its rewards. Exercises without sets are left out.',
    keywords: 'end save done stop',
  },
  {
    id: 'rest-timer', category: 'Workouts and Exercises', title: 'Rest timer',
    what: 'Counts your rest between sets.',
    how: 'It starts by itself when you log a set. Tap the time to stop it; tap again to restart from 0:00.',
    result: 'It stays accurate if the screen locks. Logging the next set starts it from 0:00 again.',
    keywords: 'rest timer pause clock',
  },
  {
    id: 'undo-edit', category: 'Workouts and Exercises', title: 'Fix a mistake',
    what: 'Changes or deletes a logged set.',
    how: 'During a workout: "Undo" in the bar, or tap a done set. Afterwards: open the workout in History → Edit sets.',
    result: 'Rewards, challenges and your journey update automatically.',
    keywords: 'undo edit wrong mistake change delete set',
  },
  {
    id: 'warmup-sets', category: 'Workouts and Exercises', title: 'Warm-up sets',
    what: 'Lighter sets before your working sets.',
    how: 'Tap "Warm-up" by the set boxes, log the warm-up sets, then tap it again for working sets.',
    result: 'Warm-up sets are saved but never count for progression, challenges or personal bests.',
    keywords: 'warm up warmup light',
  },
  {
    id: 'my-gym', category: 'Workouts and Exercises', title: 'My Gym and Scan machine',
    what: 'Your exercise library and the machines at your gym, with their settings (seat height and so on).',
    how: 'My Gym lists exercises and machines; add your own. "Scan machine" on Train takes a photo to find the exercise.',
    result: 'Machine settings show during the workout, so you don\'t have to remember them.',
    keywords: 'library machine equipment scan camera exercises',
  },
  {
    id: 'routines', category: 'Workouts and Exercises', title: 'Routines',
    what: 'Saved workouts you do regularly (e.g. Push, Pull, Legs).',
    how: 'Train → New routine, or the pencil to edit. Add exercises, sets, cardio, warm-ups and cool-downs in any order.',
    result: 'Starting a routine fills the workout with its items.',
    keywords: 'routine plan template edit create',
  },

  // ---------- Freestyle ----------
  {
    id: 'freestyle', category: 'Freestyle Workout', title: 'Freestyle Workout',
    what: 'A workout without a routine: add exercises as you go, in any order.',
    how: 'Train → Freestyle Workout, pick your first exercise, and use "+ Add" whenever you want another.',
    result: 'Saved to History as "Freestyle Workout", with the same challenges, XP and progress as any workout.',
    keywords: 'empty free no routine any order',
  },

  // ---------- Cardio ----------
  {
    id: 'cardio', category: 'Cardio and Timers', title: 'Cardio timer',
    what: 'Records how long you did cardio. Duration is the only thing it records - nothing to type.',
    how: 'Pick the activity (e.g. Treadmill), tap START, train, tap STOP. "Adjust time" fixes a forgotten STOP; "Restart" starts over. DONE moves on.',
    result: `The time is saved with the workout and stays accurate if the screen locks. Any cardio of 1 minute or more earns +${XP.cardio} XP once per workout.`,
    keywords: 'cardio treadmill bike rowing timer start stop duration',
  },
  {
    id: 'warmup-cooldown', category: 'Cardio and Timers', title: 'Warm-ups and cool-downs',
    what: 'Activities like stretching or mobility before or after training.',
    how: 'Add them in a routine or with "+ Add" → Warm-up / Cool-down. They use the same START / STOP timer as cardio.',
    result: `When planned in a routine and done, each earns +${XP.warmup} XP once per workout. They never affect strength progression.`,
    keywords: 'stretch mobility cool down warm up',
  },

  // ---------- Challenge ----------
  {
    id: 'challenge', category: "Today's Challenge and Progression", title: "Today's Challenge",
    what: 'One small target for an exercise today, based on your recent workouts - e.g. one more rep, or the next weight once you\'ve mastered this one.',
    how: 'It\'s shown above the set boxes. Hit it in any set. "Why?" explains how it was chosen.',
    result: `Hit it: +${XP.challenge} XP (+${XP.repeatChallenge} for a "repeat" target). Missed it: no penalty, nothing deducted - next time's target adjusts. Beating it pays the same, so there's no reason to overdo it.`,
    keywords: 'target challenge goal progression next',
  },
  {
    id: 'progression', category: "Today's Challenge and Progression", title: 'How progression works',
    what: 'The app increases reps first, then weight once you reach the top of the rep range on every set two workouts in a row.',
    how: 'Just log what you actually do. You don\'t need to add weight every session - repeating or adding a rep is progress.',
    result: 'Steady, safe progress. A bad day lowers nothing permanently; the next target is adjusted.',
    keywords: 'progression increase weight reps safe deload',
  },
  {
    id: 'journey', category: "Today's Challenge and Progression", title: 'Exercise journey and mastery',
    what: 'Each exercise\'s path through weights: mastered levels, the current challenge, and what comes next.',
    how: 'Tap an exercise in My Gym (or in a workout summary) to see its journey.',
    result: `Mastering a weight (top of the range on every set, 2 workouts in a row) earns +${XP.mastery} XP and unlocks the next weight.`,
    keywords: 'mastery mastered level journey',
  },

  // ---------- History ----------
  {
    id: 'history', category: 'Workout History and Missed Workouts', title: 'Workout history',
    what: 'All finished workouts, newest first, grouped by week.',
    how: 'Tap a workout to see its sets, rewards and muscles. Edit sets fixes mistakes; Delete workout removes it.',
    result: 'Changes update your XP, challenges and progress automatically.',
    keywords: 'history past previous workouts week',
  },
  {
    id: 'missed-workout', category: 'Workout History and Missed Workouts', title: 'Add a missed workout',
    what: 'Records a workout you did but forgot to track.',
    how: 'History → "+ Missed workout". A date and type are enough; add duration, exercises with the sets you remember, cardio minutes and a note if you like.',
    result: 'It appears on its date, marked "Manually added", and counts for your streak. It earns no XP, and its sets help your next suggestions.',
    keywords: 'missed forgot add past manual record',
  },

  // ---------- Progress ----------
  {
    id: 'muscle-map', category: 'Progress, Muscle Map and Personal Records', title: 'Muscle map',
    what: 'Activity shows which muscles you trained and how much. Progress shows where your training performance is improving.',
    how: 'Muscles tab: switch Activity / Progress, choose a period, turn the body round, tap a muscle for its exercises.',
    result: 'It reflects your recorded training and performance trends - not a measurement of muscle size or growth.',
    keywords: 'muscle map body activity progress balance',
  },
  {
    id: 'personal-bests', category: 'Progress, Muscle Map and Personal Records', title: 'Personal bests',
    what: 'Your best set on each exercise: the heaviest full set in the rep range (most reps for bodyweight).',
    how: 'Profile → Personal bests. A new one is celebrated during the workout.',
    result: `A new personal best earns +${XP.personalBest} XP - only at or below the suggested weight, so it never pays to lift heavier than planned.`,
    keywords: 'pb pr record best',
  },

  // ---------- XP ----------
  {
    id: 'xp', category: 'XP, Achievements and Leaderboard', title: 'XP and levels',
    what: 'XP rewards following the plan, consistency and progress - never just training more or heavier.',
    how: `Earn it by finishing a workout (+${XP.workout}, 3+ sets, once a day), hitting Today's Challenge (+${XP.challenge}), personal bests (+${XP.personalBest}), mastering a weight (+${XP.mastery}), getting back on track after a miss (+${XP.comeback}) and cardio (+${XP.cardio}).`,
    result: 'XP fills your level bar (Profile). Workouts added afterwards from History earn no XP.',
    keywords: 'xp points level reward',
  },
  {
    id: 'streak', category: 'XP, Achievements and Leaderboard', title: 'Weekly streak',
    what: `Weeks in a row with at least ${GAME_CONFIG.streak.minWorkoutsPerWeek} workouts.`,
    how: 'Train at least twice a week. Extra workouts don\'t grow it - rest is part of the plan.',
    result: `Every ${GAME_CONFIG.streak.milestoneWeeks} weeks of streak earns +${XP.consistencyMilestone} XP.`,
    keywords: 'streak consistency flame week',
  },
  {
    id: 'achievements', category: 'XP, Achievements and Leaderboard', title: 'Achievements',
    what: 'Milestones like your first challenge, 5 workouts or mastering a weight.',
    how: 'Profile → Achievements shows unlocked and locked ones with how to earn them.',
    result: 'New ones are shown on the workout summary.',
    keywords: 'achievement badge milestone',
  },
  {
    id: 'leaderboard', category: 'XP, Achievements and Leaderboard', title: 'Leaderboard',
    what: 'Where your XP ranks this week, this month and all time, among people with an account who chose to join.',
    how: 'Profile → the line under your level bar. Only your display name and leaderboard XP are shown; turn it off any time.',
    result: `Up to ${LB.maxDaysPerWeek} training days a week count (max ${LB.maxDailyPoints} a day), so training more often doesn't climb the board. Places earn badges, never XP.`,
    keywords: 'leaderboard rank compete community',
  },

  // ---------- Account ----------
  {
    id: 'account', category: 'Account, Settings and Premium', title: 'Account and sync',
    what: 'An optional free account that backs up your data and syncs it between phones.',
    how: 'Profile → Create account. You can log out or delete the account at any time.',
    result: 'Without an account everything stays on this phone - the app works fully either way.',
    keywords: 'account login sign up sync cloud',
  },
  {
    id: 'backup', category: 'Account, Settings and Premium', title: 'Backups and data',
    what: 'A file copy of all your data.',
    how: 'Profile → Export backup; Restore backup loads one. Units (kg/lb) are in Profile too.',
    result: 'Useful before changing phones, or if you don\'t use an account.',
    keywords: 'backup export restore data units kg lb',
  },
  {
    id: 'premium', category: 'Account, Settings and Premium', title: 'Free and Premium',
    what: 'Everything for training is free: logging, challenges, cardio, history, the body map, XP and the leaderboard. Premium adds depth: longer muscle-map history, progress details, trends, comparisons and insights.',
    how: 'Premium isn\'t on sale yet. While the app is being tested, Profile → Plan has a Premium preview switch that turns it on for free.',
    result: 'Premium features show a small Premium badge. Nothing paid changes your workouts, XP or leaderboard position.',
    keywords: 'premium free paid subscription plan',
  },
];

export const helpArticle = (id: string): HelpArticle | undefined => HELP_ARTICLES.find((a) => a.id === id);

/** Articles matching every word of the query (title, keywords and text), best title matches first. */
export function searchHelp(query: string): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return HELP_ARTICLES;
  const text = (a: HelpArticle) => `${a.title} ${a.keywords ?? ''} ${a.category} ${a.what} ${a.how} ${a.result}`.toLowerCase();
  const titleHits = (a: HelpArticle) => words.filter((w) => `${a.title} ${a.keywords ?? ''}`.toLowerCase().includes(w)).length;
  return HELP_ARTICLES
    .filter((a) => words.every((w) => text(a).includes(w)))
    .sort((a, b) => titleHits(b) - titleHits(a));
}
