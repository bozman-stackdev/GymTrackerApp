/**
 * Sample data so the prototype is testable immediately.
 * History is generated relative to "now" so it always looks recent.
 */
import type { AppData, Exercise, Profile, Routine, SetLog, WorkoutSession } from '../types';

export const SAMPLE_EXERCISES: Exercise[] = [
  // Push
  { id: 'chest-press-machine', name: 'Chest Press Machine', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 },
  { id: 'incline-db-press', name: 'Incline Dumbbell Press', muscleGroup: 'chest', equipment: 'dumbbell', repRange: [8, 12], weightStepKg: 2 },
  { id: 'shoulder-press-machine', name: 'Shoulder Press Machine', muscleGroup: 'shoulders', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 },
  { id: 'lateral-raise', name: 'Dumbbell Lateral Raise', muscleGroup: 'shoulders', equipment: 'dumbbell', repRange: [12, 15], weightStepKg: 1 },
  { id: 'triceps-pushdown', name: 'Cable Triceps Pushdown', muscleGroup: 'arms', equipment: 'cable', repRange: [10, 15], weightStepKg: 2.5 },
  // Pull
  { id: 'lat-pulldown', name: 'Lat Pulldown', muscleGroup: 'back', equipment: 'cable', repRange: [8, 12], weightStepKg: 5 },
  { id: 'seated-cable-row', name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', repRange: [8, 12], weightStepKg: 5 },
  { id: 'face-pull', name: 'Cable Face Pull', muscleGroup: 'shoulders', equipment: 'cable', repRange: [12, 15], weightStepKg: 2.5 },
  { id: 'db-curl', name: 'Dumbbell Biceps Curl', muscleGroup: 'arms', equipment: 'dumbbell', repRange: [8, 12], weightStepKg: 1 },
  // Legs
  { id: 'leg-press', name: 'Leg Press', muscleGroup: 'legs', equipment: 'machine', repRange: [8, 12], weightStepKg: 10 },
  { id: 'leg-extension', name: 'Leg Extension', muscleGroup: 'legs', equipment: 'machine', repRange: [10, 15], weightStepKg: 5 },
  { id: 'lying-leg-curl', name: 'Lying Leg Curl', muscleGroup: 'legs', equipment: 'machine', repRange: [10, 15], weightStepKg: 5 },
  { id: 'calf-raise-machine', name: 'Standing Calf Raise', muscleGroup: 'legs', equipment: 'machine', repRange: [10, 15], weightStepKg: 5 },
  { id: 'hanging-knee-raise', name: 'Hanging Knee Raise', muscleGroup: 'core', equipment: 'bodyweight', repRange: [10, 15], weightStepKg: 0 },
  // Not in a routine yet
  { id: 'back-squat', name: 'Barbell Back Squat', muscleGroup: 'legs', equipment: 'barbell', repRange: [5, 8], weightStepKg: 2.5 },
  { id: 'bench-press', name: 'Barbell Bench Press', muscleGroup: 'chest', equipment: 'barbell', repRange: [5, 8], weightStepKg: 2.5 },
  { id: 'pec-deck', name: 'Pec Deck Fly', muscleGroup: 'chest', equipment: 'machine', repRange: [10, 15], weightStepKg: 5 },
  { id: 'hip-thrust-machine', name: 'Hip Thrust Machine', muscleGroup: 'legs', equipment: 'machine', repRange: [8, 12], weightStepKg: 10 },
  { id: 'assisted-pull-up', name: 'Assisted Pull-up Machine', muscleGroup: 'back', equipment: 'machine', repRange: [6, 10], weightStepKg: 5 },
  { id: 'pull-up', name: 'Pull-up', muscleGroup: 'back', equipment: 'bodyweight', repRange: [5, 10], weightStepKg: 0 },
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

export const EMPTY_PROFILE: Profile = { name: '', sex: '', age: null, heightCm: null, weightKg: null, experience: 'beginner', goal: 'general' };

const SAMPLE_PROFILE: Profile = { name: 'Alex', sex: '', age: 32, heightCm: 178, weightKg: 80, experience: 'intermediate', goal: 'muscle' };

/** Starting weight per exercise for the generated history. */
const START_KG: Record<string, number> = {
  'chest-press-machine': 45, 'incline-db-press': 18, 'shoulder-press-machine': 40, 'lateral-raise': 7, 'triceps-pushdown': 20,
  'lat-pulldown': 50, 'seated-cable-row': 50, 'face-pull': 15, 'db-curl': 12,
  'leg-press': 120, 'leg-extension': 40, 'lying-leg-curl': 35, 'calf-raise-machine': 60, 'hanging-knee-raise': 0,
};

/** Exercises that show off specific recommendation cases. */
const STALLED = new Set(['shoulder-press-machine']); // too heavy -> "drop weight"
const RECENTLY_ADDED = new Set(['face-pull']); // too little history -> "match last time"

/** Days ago of each sample gym visit; routines rotate Push -> Pull -> Legs. */
const VISIT_DAYS_AGO = [36, 34, 32, 29, 27, 25, 22, 20, 18, 15, 13, 11, 8, 6, 4, 2];

export function createSampleData(now = new Date()): AppData {
  const exercises = SAMPLE_EXERCISES;
  const state = new Map(Object.entries(START_KG).map(([id, kg]) => [id, { kg, reps: 0 }]));
  const sessions: WorkoutSession[] = [];

  VISIT_DAYS_AGO.forEach((daysAgo, visit) => {
    const routine = SAMPLE_ROUTINES[visit % SAMPLE_ROUTINES.length];
    const start = new Date(now);
    start.setDate(start.getDate() - daysAgo);
    start.setHours(18, 0, 0, 0);
    let minute = 0;

    const entries = routine.items
      .filter((item) => !RECENTLY_ADDED.has(item.exerciseId) || daysAgo <= 10)
      .map((item) => {
        const ex = exercises.find((e) => e.id === item.exerciseId)!;
        const s = state.get(ex.id)!;
        const [min, max] = ex.repRange;
        if (s.reps === 0) s.reps = min;
        const top = STALLED.has(ex.id) ? min - 2 : s.reps;
        const sets: SetLog[] = Array.from({ length: item.sets }, (_, i) => {
          minute += 3;
          const t = new Date(start.getTime() + minute * 60_000);
          // The last set is usually a rep short - realistic fatigue.
          const reps = i === item.sets - 1 && top < max ? top - 1 : top;
          return { reps, weightKg: s.kg, loggedAt: t.toISOString() };
        });
        // Simple simulated progress: +1 rep per session, add weight at the top of the range.
        if (!STALLED.has(ex.id)) {
          if (s.reps >= max) {
            s.kg += ex.weightStepKg;
            s.reps = min;
          } else s.reps += 1;
        }
        return { exerciseId: ex.id, targetSets: item.sets, sets };
      });

    sessions.push({
      id: `sample-${visit}`,
      name: routine.name,
      routineId: routine.id,
      startedAt: start.toISOString(),
      finishedAt: new Date(start.getTime() + (minute + 5) * 60_000).toISOString(),
      entries,
    });
  });

  return { version: 1, profile: SAMPLE_PROFILE, exercises, routines: SAMPLE_ROUTINES, sessions, activeWorkout: null };
}

export function createEmptyData(): AppData {
  return { version: 1, profile: EMPTY_PROFILE, exercises: SAMPLE_EXERCISES, routines: [], sessions: [], activeWorkout: null };
}
