/**
 * Checks that saved or imported data has the shape the app expects, and upgrades older versions.
 * Used on every load and on backup import, so bad data is rejected with a clear message instead of crashing screens.
 */
import type { AppData, Exercise, GymEquipment, Profile, WorkoutSession } from '../types';

export class DataError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, min = -Infinity, max = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isDate = (v: unknown) => isStr(v) && !Number.isNaN(Date.parse(v));

function check(ok: boolean, what: string): asserts ok {
  if (!ok) throw new DataError(`Invalid data: ${what}`);
}

function checkExercise(e: unknown, i: number): asserts e is Exercise {
  check(isObj(e) && isStr(e.id) && isStr(e.name), `exercise #${i + 1}`);
  const r = e.repRange;
  check(Array.isArray(r) && r.length === 2 && isNum(r[0], 1, 100) && isNum(r[1], 1, 100), `rep range of "${String(e.name)}"`);
  check(isNum(e.weightStepKg, 0, 100), `weight step of "${String(e.name)}"`);
}

function checkSession(s: unknown, i: number, finished: boolean): asserts s is WorkoutSession {
  check(isObj(s) && isStr(s.id) && isDate(s.startedAt) && Array.isArray(s.entries), `workout #${i + 1}`);
  if (finished) check(isDate(s.finishedAt), `finish time of workout #${i + 1}`);
  for (const e of s.entries as unknown[]) {
    check(isObj(e) && isStr(e.exerciseId) && isNum(e.targetSets, 0, 50) && Array.isArray(e.sets), `exercise in workout #${i + 1}`);
    for (const set of e.sets as unknown[]) {
      check(isObj(set) && isNum(set.reps, 0, 1000) && isNum(set.weightKg, 0, 2000), `a set in workout #${i + 1}`);
    }
  }
}

/** Validates + migrates. Throws DataError with a readable message. */
export function parseAppData(input: unknown): AppData {
  check(isObj(input), 'not a Gym Tracker file');
  check(input.version === 1, `unsupported version ${String(input.version)}`);
  check(isObj(input.profile), 'profile');
  check(Array.isArray(input.exercises) && Array.isArray(input.routines) && Array.isArray(input.sessions), 'missing lists');
  input.exercises.forEach(checkExercise);
  input.sessions.forEach((s, i) => checkSession(s, i, true));
  for (const [i, r] of (input.routines as unknown[]).entries()) {
    check(isObj(r) && isStr(r.id) && typeof r.name === 'string' && Array.isArray(r.items), `routine #${i + 1}`);
  }
  if (input.equipment !== undefined) {
    check(Array.isArray(input.equipment), 'equipment list');
    for (const [i, e] of (input.equipment as unknown[]).entries()) {
      check(isObj(e) && isStr(e.id) && isStr(e.name) && Array.isArray(e.exerciseIds) && e.exerciseIds.every(isStr), `equipment #${i + 1}`);
    }
  }
  if (input.activeWorkout != null) {
    const a = input.activeWorkout;
    check(isObj(a) && isNum(a.currentIndex, 0), 'workout in progress');
    checkSession(a.session, 0, false);
  }
  return migrate(input as unknown as AppData);
}

/** Upgrade older saved shapes to the current one. Add a step whenever AppData.version changes. */
function migrate(data: AppData): AppData {
  // Earlier versions could save machine photos on exercises. Photos are no longer kept: drop them to free space.
  const exercises = data.exercises.map(({ photo: _photo, ...e }: Exercise & { photo?: string }) => e);
  // Rebuild with known fields only, so stray fields in an imported file are not kept.
  return {
    version: 1,
    profile: data.profile,
    exercises,
    routines: data.routines,
    sessions: data.sessions,
    equipment: (data.equipment ?? []).map((e) => ({ ...e, gym: e.gym ?? '', source: e.source ?? 'manual' })), // added in Phase 6
    activeWorkout: data.activeWorkout ?? null,
    ...(data.isSample ? { isSample: true } : {}),
  };
}

// ---------- Form validation (returns field → message; empty object = valid) ----------

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const outside = (v: number | null, min: number, max: number) => v !== null && !(Number.isFinite(v) && v >= min && v <= max);

export function validateProfile(p: Profile): FieldErrors<Profile> {
  const e: FieldErrors<Profile> = {};
  if (p.name.length > 40) e.name = 'Keep it under 40 characters';
  if (outside(p.age, 13, 100)) e.age = 'Age 13–100';
  if (outside(p.heightCm, 100, 250)) e.heightCm = 'Height 100–250 cm';
  if (outside(p.weightKg, 25, 350)) e.weightKg = 'Weight 25–350 kg';
  return e;
}

export function validateExercise(ex: Exercise, all: Exercise[]): FieldErrors<Exercise> {
  const e: FieldErrors<Exercise> = {};
  const name = ex.name.trim();
  if (!name) e.name = 'Give it a name';
  else if (name.length > 60) e.name = 'Keep it under 60 characters';
  else if (all.some((o) => o.id !== ex.id && o.name.trim().toLowerCase() === name.toLowerCase())) e.name = 'You already have an exercise with this name';
  const [min, max] = ex.repRange;
  if (!(min >= 1 && max <= 100 && min <= max)) e.repRange = 'Reps: min 1, max 100, min ≤ max';
  if (ex.equipment !== 'bodyweight' && !(ex.weightStepKg > 0 && ex.weightStepKg <= 50)) e.weightStepKg = 'Weight jump 0.25–50 kg';
  return e;
}

export function validateEquipment(item: GymEquipment, all: GymEquipment[]): FieldErrors<GymEquipment> {
  const e: FieldErrors<GymEquipment> = {};
  const name = item.name.trim();
  if (!name) e.name = 'Give it a name';
  else if (name.length > 60) e.name = 'Keep it under 60 characters';
  else if (all.some((o) => o.id !== item.id && o.name.trim().toLowerCase() === name.toLowerCase() && o.gym.trim().toLowerCase() === item.gym.trim().toLowerCase())) {
    e.name = 'This gym already has equipment with this name';
  }
  if (item.exerciseIds.length === 0) e.exerciseIds = 'Pick at least one exercise';
  if (item.gym.length > 60) e.gym = 'Keep it under 60 characters';
  if ((item.brand ?? '').length > 60) e.brand = 'Keep it under 60 characters';
  if ((item.model ?? '').length > 60) e.model = 'Keep it under 60 characters';
  if ((item.settings ?? '').length > 200) e.settings = 'Keep it under 200 characters';
  if ((item.notes ?? '').length > 500) e.notes = 'Keep it under 500 characters';
  return e;
}
