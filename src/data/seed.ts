/**
 * Sample data so the prototype is testable immediately.
 * History is generated relative to "now" so it always looks recent.
 */
import type { AppData, Exercise, ExerciseMuscles, GymEquipment, Profile, Routine, SessionEntry, SetLog, WorkoutSession } from '../types';
import { isStrengthItem } from '../logic/entries';

/** Primary and secondary muscles (primary count 1.0 per set, secondary 0.5; `weights` overrides). Feeds the muscle map. */
const mu = (primary: ExerciseMuscles['primary'], secondary: ExerciseMuscles['secondary'] = [], weights?: ExerciseMuscles['weights']): ExerciseMuscles =>
  ({ primary, secondary, ...(weights ? { weights } : {}) });

/** The built-in exercise library: the source of truth for each exercise's muscles too. */
export const SAMPLE_EXERCISES: Exercise[] = [
  // Push
  { id: 'chest-press-machine', name: 'Chest Press Machine', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5, muscles: mu(['chest'], ['front-delts', 'triceps']) },
  { id: 'incline-db-press', name: 'Incline Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell', repRange: [8, 12], weightStepKg: 2, muscles: mu(['chest'], ['front-delts', 'triceps'], { 'front-delts': 0.6 }) },
  { id: 'shoulder-press-machine', name: 'Shoulder Press Machine', muscleGroup: 'shoulders', equipment: 'machine', repRange: [8, 12], weightStepKg: 5, muscles: mu(['front-delts'], ['side-delts', 'triceps']) },
  { id: 'lateral-raise', name: 'Dumbbell Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', repRange: [12, 15], weightStepKg: 1, muscles: mu(['side-delts'], ['upper-back'], { 'upper-back': 0.25 }) },
  { id: 'triceps-pushdown', name: 'Cable Triceps Pushdown', muscleGroup: 'arms', equipment: 'cable', repRange: [10, 15], weightStepKg: 2.5, muscles: mu(['triceps']) },
  // Pull
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'cable', repRange: [8, 12], weightStepKg: 5, muscles: mu(['lats'], ['biceps', 'upper-back']) },
  { id: 'seated-cable-row', name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', repRange: [8, 12], weightStepKg: 5, muscles: mu(['upper-back', 'lats'], ['biceps', 'rear-delts']) },
  { id: 'face-pull', name: 'Cable Face Pull', muscleGroup: 'shoulders', equipment: 'cable', repRange: [12, 15], weightStepKg: 2.5, muscles: mu(['rear-delts'], ['upper-back']) },
  { id: 'db-curl', name: 'Dumbbell Biceps Curl', muscleGroup: 'arms', equipment: 'dumbbell', repRange: [8, 12], weightStepKg: 1, muscles: mu(['biceps'], ['forearms']) },
  // Legs
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine', repRange: [8, 12], weightStepKg: 10, muscles: mu(['quads'], ['glutes', 'hamstrings']) },
  { id: 'leg-extension', name: 'Leg Extension', muscleGroup: 'legs', equipment: 'machine', repRange: [10, 15], weightStepKg: 5, muscles: mu(['quads']) },
  { id: 'lying-leg-curl', name: 'Lying Leg Curl', muscleGroup: 'legs', equipment: 'machine', repRange: [10, 15], weightStepKg: 5, muscles: mu(['hamstrings'], ['calves'], { calves: 0.25 }) },
  { id: 'calf-raise-machine', name: 'Standing Calf Raise', muscleGroup: 'legs', equipment: 'machine', repRange: [10, 15], weightStepKg: 5, muscles: mu(['calves']) },
  { id: 'hanging-knee-raise', name: 'Hanging Knee Raise', muscleGroup: 'core', equipment: 'bodyweight', repRange: [10, 15], weightStepKg: 0, muscles: mu(['abs'], ['obliques', 'forearms']) },
  // Not in a routine yet
  { id: 'back-squat', name: 'Barbell Back Squat', muscleGroup: 'legs', equipment: 'barbell', repRange: [5, 8], weightStepKg: 2.5, muscles: mu(['quads', 'glutes'], ['hamstrings', 'adductors', 'lower-back']) },
  { id: 'bench-press', name: 'Barbell Bench Press', muscleGroup: 'chest', equipment: 'barbell', repRange: [5, 8], weightStepKg: 2.5, muscles: mu(['chest'], ['triceps', 'front-delts']) },
  { id: 'pec-deck', name: 'Pec Deck Fly', muscleGroup: 'chest', equipment: 'machine', repRange: [10, 15], weightStepKg: 5, muscles: mu(['chest'], ['front-delts'], { 'front-delts': 0.25 }) },
  { id: 'hip-thrust-machine', name: 'Hip Thrust Machine', muscleGroup: 'legs', equipment: 'machine', repRange: [8, 12], weightStepKg: 10, muscles: mu(['glutes'], ['hamstrings']) },
  { id: 'assisted-pull-up', name: 'Assisted Pull-up Machine', muscleGroup: 'back', equipment: 'machine', repRange: [6, 10], weightStepKg: 5, muscles: mu(['lats'], ['biceps', 'upper-back']) },
  { id: 'pull-up', name: 'Pull-up', muscleGroup: 'back', equipment: 'bodyweight', repRange: [5, 10], weightStepKg: 0, muscles: mu(['lats'], ['biceps', 'upper-back', 'forearms']) },
];

export const SAMPLE_ROUTINES: Routine[] = [
  {
    id: 'push',
    name: 'Push',
    items: ['chest-press-machine', 'incline-db-press', 'shoulder-press-machine', 'lateral-raise', 'triceps-pushdown'].map((exerciseId) => ({ exerciseId, sets: 3 })),
  },
  {
    id: 'pull',
    name: 'Pull',
    items: ['lat-pulldown', 'seated-cable-row', 'face-pull', 'db-curl'].map((exerciseId) => ({ exerciseId, sets: 3 })),
  },
  {
    id: 'legs',
    name: 'Legs',
    items: ['leg-press', 'leg-extension', 'lying-leg-curl', 'calf-raise-machine', 'hanging-knee-raise'].map((exerciseId) => ({ exerciseId, sets: 3 })),
  },
];

const GYM = 'Anytime Fitness Leeds';
const eq = (id: string, name: string, exerciseIds: string[], type: GymEquipment['type'], extra: Partial<GymEquipment> = {}): GymEquipment =>
  ({ id, name, exerciseIds, type, gym: GYM, source: 'manual', createdAt: '2026-08-20T18:00:00.000Z', ...extra });

/** A sample "My gym": the machines the sample user trains on. */
export const SAMPLE_EQUIPMENT: GymEquipment[] = [
  eq('eq-leg-press', 'Life Fitness Leg Press', ['leg-press'], 'machine', { brand: 'Life Fitness', model: 'Signature Series', settings: 'Seat 5, feet mid-platform' }),
  eq('eq-chest-press', 'Technogym Chest Press', ['chest-press-machine'], 'machine', { brand: 'Technogym', model: 'Selection 700', settings: 'Seat 3, handles middle' }),
  eq('eq-shoulder-press', 'Hammer Strength Shoulder Press', ['shoulder-press-machine'], 'machine', { brand: 'Hammer Strength', settings: 'Seat 2', notes: 'Plate-loaded: log the plates only.' }),
  eq('eq-lat-pulldown', 'Matrix Lat Pulldown', ['lat-pulldown'], 'cable', { brand: 'Matrix', settings: 'Knee pad 4' }),
  eq('eq-cable', 'Dual Cable Station', ['triceps-pushdown', 'face-pull', 'seated-cable-row'], 'cable', { brand: 'Precor', notes: 'Left stack runs smoother.' }),
];

export const EMPTY_PROFILE: Profile = { name: '', sex: '', age: null, heightCm: null, weightKg: null, experience: 'beginner', goal: 'general' };

const SAMPLE_PROFILE: Profile = { name: 'Alex', sex: '', age: 32, heightCm: 178, weightKg: 80, experience: 'intermediate', goal: 'muscle' };

/** Starting weight per exercise for the generated history. */
const START_KG: Record<string, number> = {
  'chest-press-machine': 45, 'incline-db-press': 18, 'shoulder-press-machine': 40, 'lateral-raise': 7, 'triceps-pushdown': 20,
  'lat-pulldown': 50, 'seated-cable-row': 50, 'face-pull': 15, 'db-curl': 12,
  'leg-press': 120, 'leg-extension': 40, 'lying-leg-curl': 35, 'calf-raise-machine': 60, 'hanging-knee-raise': 0,
};

/** Exercises that show off specific recommendation cases. */
const STALLED = new Set(['shoulder-press-machine']); // too heavy -> "try lighter"
const RECENTLY_ADDED = new Set(['face-pull']); // too little history -> "match last time"
const RECENT_DIP = new Set(['lat-pulldown']); // weaker last two sessions -> "stay and consolidate"
/** Starting reps where it differs from the bottom of the rep range. */
const START_REPS: Record<string, number> = { 'lat-pulldown': 10 };

/** Days ago of each sample gym visit; routines rotate Push -> Pull -> Legs. */
const VISIT_DAYS_AGO = [36, 34, 32, 29, 27, 25, 22, 20, 18, 15, 13, 11, 8, 6, 4, 2];

export function createSampleData(now = new Date()): AppData {
  const exercises = SAMPLE_EXERCISES;
  const state = new Map(Object.entries(START_KG).map(([id, kg]) => [id, { kg, reps: 0, topSessions: 0 }]));
  const sessions: WorkoutSession[] = [];

  VISIT_DAYS_AGO.forEach((daysAgo, visit) => {
    const routine = SAMPLE_ROUTINES[visit % SAMPLE_ROUTINES.length];
    const start = new Date(now);
    start.setDate(start.getDate() - daysAgo);
    start.setHours(18, 0, 0, 0);
    let minute = 0;

    const entries: SessionEntry[] = routine.items
      .filter(isStrengthItem)
      .filter((item) => !RECENTLY_ADDED.has(item.exerciseId) || daysAgo <= 10)
      .map((item) => {
        const ex = exercises.find((e) => e.id === item.exerciseId)!;
        const s = state.get(ex.id)!;
        const [min, max] = ex.repRange;
        if (s.reps === 0) s.reps = START_REPS[ex.id] ?? min;
        const dip = RECENT_DIP.has(ex.id) && daysAgo <= 14 ? 4 : 0;
        const top = STALLED.has(ex.id) ? min - 2 : s.reps - dip;
        const sets: SetLog[] = Array.from({ length: item.sets }, (_, i) => {
          minute += 3;
          const t = new Date(start.getTime() + minute * 60_000);
          // The last set is usually a rep short - realistic fatigue.
          const reps = i === item.sets - 1 && top < max ? top - 1 : top;
          return { reps, weightKg: s.kg, loggedAt: t.toISOString() };
        });
        // Simulated progress that follows the app's own advice: +1 rep per session,
        // and add weight after two sessions at the top of the range.
        if (!STALLED.has(ex.id) && !dip) {
          if (s.reps >= max) {
            if (++s.topSessions >= 2) {
              s.kg += ex.weightStepKg;
              s.reps = min;
              s.topSessions = 0;
            }
          } else s.reps += 1;
        }
        return { exerciseId: ex.id, targetSets: item.sets, sets, equipmentId: SAMPLE_EQUIPMENT.find((e) => e.exerciseIds.includes(ex.id))?.id };
      });

    // The last three visits also show cardio: a mobility warm-up, a steady treadmill finisher, a stretch.
    const fromEnd = VISIT_DAYS_AGO.length - visit;
    if (fromEnd <= 3) {
      const at = (min: number) => new Date(start.getTime() + min * 60_000).toISOString();
      entries.unshift({ kind: 'warmup', activityId: 'mobility', log: { durationMin: 5 }, doneAt: at(0) });
      minute += 20;
      entries.push({ kind: 'cardio', activityId: 'treadmill', log: { durationMin: 20, inclinePct: fromEnd === 3 ? 4 : 5, speedKmh: 6.5 }, doneAt: at(minute) });
      if (fromEnd === 1) {
        minute += 5;
        entries.push({ kind: 'cooldown', activityId: 'stretching', log: { durationMin: 5 }, doneAt: at(minute) });
      }
    }

    sessions.push({
      id: `sample-${visit}`,
      name: routine.name,
      routineId: routine.id,
      startedAt: start.toISOString(),
      finishedAt: new Date(start.getTime() + (minute + 5) * 60_000).toISOString(),
      entries,
    });
  });

  return { version: 1, profile: SAMPLE_PROFILE, exercises, routines: SAMPLE_ROUTINES, sessions, equipment: SAMPLE_EQUIPMENT, activeWorkout: null, isSample: true };
}

/** A real user's starting point: the exercise library and three editable starter routines, no history. */
export function createStarterData(): AppData {
  return { version: 1, profile: EMPTY_PROFILE, exercises: SAMPLE_EXERCISES, routines: SAMPLE_ROUTINES, sessions: [], equipment: [], activeWorkout: null };
}
