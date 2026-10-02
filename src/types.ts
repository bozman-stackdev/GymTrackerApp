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
}

/**
 * What a workout item is. Strength items are the original kind (no `kind` field in older data = strength).
 * Cardio, warm-up and cool-down items use activities and metrics instead of sets, and are never seen by the
 * strength progression engine (see docs/CARDIO.md).
 */
export type ActivityKind = 'cardio' | 'warmup' | 'cooldown';
export type EntryKind = 'strength' | ActivityKind;

export interface StrengthRoutineItem {
  kind?: 'strength';
  exerciseId: string;
  sets: number;
}

/** A planned cardio / warm-up / cool-down in a routine, e.g. "Treadmill, 20 min". */
export interface ActivityRoutineItem {
  kind: ActivityKind;
  /** Built-in activity id (logic/activities.ts), or 'other' with `name`. */
  activityId: string;
  name?: string;
  plan?: CardioMetrics;
}

export type RoutineItem = StrengthRoutineItem | ActivityRoutineItem;

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

export interface StrengthEntry {
  kind?: 'strength';
  exerciseId: string;
  targetSets: number;
  sets: SetLog[];
  /** Which machine/station was used (from My gym), if any. */
  equipmentId?: string;
}

/**
 * Cardio / warm-up / cool-down metrics. Everything optional: "Run, 20 minutes" is a complete entry.
 * Stored in metric units (km, km/h); shown in miles when the profile uses lb. Pace is derived, not stored.
 */
export interface CardioMetrics {
  durationMin?: number;
  distanceKm?: number;
  speedKmh?: number;
  inclinePct?: number;
  /** Machine level / resistance. */
  level?: number;
  calories?: number;
  avgHeartRate?: number;
}

/** A cardio, warm-up or cool-down item of a workout. */
export interface ActivityEntry {
  kind: ActivityKind;
  /** Built-in activity id (logic/activities.ts), or 'other' with `name`. */
  activityId: string;
  name?: string;
  /** Planned values (from the routine), shown as the target. */
  plan?: CardioMetrics;
  /** What was done. */
  log?: CardioMetrics;
  /** Warm-up sets for a strength exercise ("light sets of the exercise being trained"). Never progression data. */
  warmupFor?: string;
  warmupSets?: SetLog[];
  /** When it was marked complete. */
  doneAt?: string;
  /** Came from the routine (only planned warm-ups / cool-downs earn their small XP). */
  planned?: boolean;
}

export type SessionEntry = StrengthEntry | ActivityEntry;

/** A specific machine, bench or station in the user's gym ("My gym"). */
export interface GymEquipment {
  id: string;
  /** e.g. "Life Fitness Leg Press". */
  name: string;
  /** Exercises done on it (a cable station can have several). The first is the main one. */
  exerciseIds: string[];
  type: Equipment;
  /** Gym / location, e.g. "Anytime Fitness Leeds" ('' when not set). */
  gym: string;
  brand?: string;
  model?: string;
  /** Machine settings to remember, e.g. "Seat 5, feet mid-platform". */
  settings?: string;
  notes?: string;
  /** Reserved for a photo of the machine. Not captured yet: photos aren't stored (decision D23). */
  photo?: string;
  /** Added by hand, or (future) recognised from a photo. */
  source: 'manual' | 'scan';
  createdAt: string;
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
  /** Display/input units. Everything is stored in kg. */
  units?: 'kg' | 'lb';
}

/** Everything the app stores. Bump `version` and add a migration in storage.ts when this changes shape. */
export interface AppData {
  version: 1;
  profile: Profile;
  exercises: Exercise[];
  routines: Routine[];
  sessions: WorkoutSession[];
  /** The user's personal equipment library ("My gym"). */
  equipment: GymEquipment[];
  activeWorkout: ActiveWorkout | null;
  /** True while the user is exploring the demo data (shows a banner with a way out). */
  isSample?: boolean;
  /** When a backup was last exported, and until when the backup reminder is snoozed. */
  backup?: { lastExportAt?: string; remindAfter?: string };
}
