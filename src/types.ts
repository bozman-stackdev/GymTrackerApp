// The whole data model lives here. All weights are stored in kilograms.

export type Equipment = 'machine' | 'cable' | 'barbell' | 'dumbbell' | 'bodyweight';

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  /** Target rep range used by the progression logic, e.g. [8, 12]. */
  repRange: [number, number];
  /** Smallest sensible weight jump in kg. 0 = bodyweight (reps-only progression). */
  weightStepKg: number;
  isCustom?: boolean;
  /** Small JPEG data URL of the user's own photo of the machine (optional). */
  photo?: string;
}

export interface RoutineItem {
  exerciseId: string;
  sets: number;
}

/** A saved workout plan, e.g. "Push day". */
export interface Routine {
  id: string;
  name: string;
  items: RoutineItem[];
}

export interface SetLog {
  reps: number;
  weightKg: number;
  loggedAt: string; // ISO date-time
}

export interface SessionEntry {
  exerciseId: string;
  targetSets: number;
  sets: SetLog[];
}

/** One visit to the gym. */
export interface WorkoutSession {
  id: string;
  name: string;
  routineId?: string;
  startedAt: string;
  finishedAt?: string;
  entries: SessionEntry[];
}

/** The workout currently in progress (persisted so a page refresh doesn't lose it). */
export interface ActiveWorkout {
  session: WorkoutSession;
  currentIndex: number;
}

export type Sex = 'male' | 'female' | 'other' | '';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'strength' | 'muscle' | 'general';

export interface Profile {
  name: string;
  sex: Sex;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  experience: Experience;
  goal: Goal;
}

/** Everything the app stores. Bump `version` and add a migration in storage.ts when this changes shape. */
export interface AppData {
  version: 1;
  profile: Profile;
  exercises: Exercise[];
  routines: Routine[];
  sessions: WorkoutSession[];
  activeWorkout: ActiveWorkout | null;
}
