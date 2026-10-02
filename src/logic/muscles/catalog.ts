/**
 * The muscle map's vocabulary: the muscles, how they are grouped on screen, and which muscles an exercise trains.
 *
 * The exercise library (data/seed.ts) is the source of truth: every built-in exercise lists its primary and
 * secondary muscles, and older saved copies get them on load (data/validate.ts). Exercises without a list (custom
 * ones made before the muscle map, or synced from an older app) fall back to musclesFor(): their name, then their
 * muscle group. Pure data and functions, no React.
 */
import type { Exercise, ExerciseMuscles, MuscleGroup, MuscleId } from '../../types';
import { MUSCLE_CONFIG, type MuscleConfig } from './config';

export type BodyView = 'front' | 'back';

export interface MuscleInfo {
  id: MuscleId;
  name: string;
  group: MuscleGroup;
  /** Where it's drawn. A muscle visible from both sides (side shoulders, forearms...) is drawn in both. */
  views: BodyView[];
}

export const MUSCLES: MuscleInfo[] = [
  { id: 'chest', name: 'Chest', group: 'chest', views: ['front'] },
  { id: 'front-delts', name: 'Front shoulders', group: 'shoulders', views: ['front'] },
  { id: 'side-delts', name: 'Side shoulders', group: 'shoulders', views: ['front', 'back'] },
  { id: 'rear-delts', name: 'Rear shoulders', group: 'shoulders', views: ['back'] },
  { id: 'biceps', name: 'Biceps', group: 'arms', views: ['front'] },
  { id: 'triceps', name: 'Triceps', group: 'arms', views: ['back'] },
  { id: 'forearms', name: 'Forearms', group: 'arms', views: ['front', 'back'] },
  // The trapezius is part of the upper back; its top edge is visible from the front, between neck and shoulders.
  { id: 'upper-back', name: 'Upper back', group: 'back', views: ['back', 'front'] },
  { id: 'lats', name: 'Lats', group: 'back', views: ['back'] },
  { id: 'lower-back', name: 'Lower back', group: 'back', views: ['back'] },
  { id: 'abs', name: 'Abs', group: 'core', views: ['front'] },
  { id: 'obliques', name: 'Obliques', group: 'core', views: ['front', 'back'] },
  { id: 'glutes', name: 'Glutes', group: 'legs', views: ['back'] },
  { id: 'quads', name: 'Quadriceps', group: 'legs', views: ['front'] },
  { id: 'hamstrings', name: 'Hamstrings', group: 'legs', views: ['back'] },
  { id: 'adductors', name: 'Inner thighs', group: 'legs', views: ['front'] },
  { id: 'calves', name: 'Calves', group: 'legs', views: ['back', 'front'] },
];

export const MUSCLE_IDS: MuscleId[] = MUSCLES.map((m) => m.id);
const BY_ID = new Map(MUSCLES.map((m) => [m.id, m]));
export const muscleInfo = (id: MuscleId): MuscleInfo => BY_ID.get(id)!;
export const muscleName = (id: MuscleId): string => BY_ID.get(id)?.name ?? id;
export const isMuscleId = (v: unknown): v is MuscleId => typeof v === 'string' && BY_ID.has(v as MuscleId);

/** The groups shown in the summary, in this order. */
export const GROUPS: { id: MuscleGroup; name: string }[] = [
  { id: 'chest', name: 'Chest' },
  { id: 'back', name: 'Back' },
  { id: 'shoulders', name: 'Shoulders' },
  { id: 'arms', name: 'Arms' },
  { id: 'core', name: 'Core' },
  { id: 'legs', name: 'Legs' },
];
export const groupName = (g: MuscleGroup) => GROUPS.find((x) => x.id === g)?.name ?? g;
export const musclesInGroup = (g: MuscleGroup): MuscleId[] => MUSCLES.filter((m) => m.group === g).map((m) => m.id);

/** Training balance compares these (core and lower back are in neither pair). */
export type RegionId = 'upper' | 'lower' | 'push' | 'pull';
export const REGIONS: { id: RegionId; name: string; muscles: MuscleId[] }[] = [
  { id: 'upper', name: 'Upper body', muscles: ['chest', 'front-delts', 'side-delts', 'rear-delts', 'biceps', 'triceps', 'forearms', 'upper-back', 'lats'] },
  { id: 'lower', name: 'Lower body', muscles: ['glutes', 'quads', 'hamstrings', 'adductors', 'calves'] },
  { id: 'push', name: 'Pushing', muscles: ['chest', 'front-delts', 'side-delts', 'triceps'] },
  { id: 'pull', name: 'Pulling', muscles: ['lats', 'upper-back', 'rear-delts', 'biceps'] },
];

const m = (primary: MuscleId[], secondary: MuscleId[] = [], weights?: ExerciseMuscles['weights']): ExerciseMuscles =>
  ({ primary, secondary, ...(weights ? { weights } : {}) });

/**
 * Exercise names → muscles, for exercises without their own list. First match wins, so specific names come before
 * general ones ("leg curl" before "curl", "triceps kickback" before "kickback").
 */
const NAME_RULES: [RegExp, ExerciseMuscles][] = [
  [/calf|calves/i, m(['calves'])],
  [/leg curl|hamstring curl|nordic/i, m(['hamstrings'], ['calves'], { calves: 0.25 })],
  [/leg extension/i, m(['quads'])],
  [/romanian|\brdl\b|stiff[- ]?leg|good ?morning/i, m(['hamstrings', 'glutes'], ['lower-back'])],
  [/deadlift/i, m(['hamstrings', 'glutes', 'lower-back'], ['quads', 'upper-back', 'forearms'])],
  [/tricep|push ?down|skull ?crusher|french press|overhead extension/i, m(['triceps'])],
  [/adduct/i, m(['adductors'])],
  [/hip thrust|glute|bridge|kickback|abduct/i, m(['glutes'], ['hamstrings'])],
  [/squat|leg press|lunge|step[- ]?up|hack/i, m(['quads', 'glutes'], ['hamstrings', 'adductors'])],
  [/pull[- ]?up|chin[- ]?up|pull ?down|\blats?\b/i, m(['lats'], ['biceps', 'upper-back'])],
  [/face pull|rear delt|reverse fly|reverse pec/i, m(['rear-delts'], ['upper-back'])],
  [/upright row|lateral raise|side raise/i, m(['side-delts'], ['upper-back'], { 'upper-back': 0.25 })],
  [/\brow/i, m(['upper-back', 'lats'], ['biceps', 'rear-delts'])],
  [/shrug/i, m(['upper-back'], ['forearms'])],
  [/front raise/i, m(['front-delts'])],
  [/overhead press|shoulder press|military|arnold|\bohp\b/i, m(['front-delts'], ['side-delts', 'triceps'])],
  [/fly|flye|pec deck|crossover/i, m(['chest'], ['front-delts'], { 'front-delts': 0.25 })],
  [/bench|chest|push[- ]?up|press[- ]?up|\bdips?\b/i, m(['chest'], ['front-delts', 'triceps'])],
  [/curl|bicep/i, m(['biceps'], ['forearms'])],
  [/wrist|forearm|grip|farmer/i, m(['forearms'])],
  [/oblique|twist|side bend|woodchop|pallof/i, m(['obliques'], ['abs'])],
  [/crunch|sit[- ]?up|knee raise|leg raise|plank|ab wheel|rollout|hollow|\babs?\b/i, m(['abs'], ['obliques'])],
  [/back extension|hyperextension|superman/i, m(['lower-back'], ['glutes', 'hamstrings'])],
];

/** When neither the exercise nor its name says: what its muscle group usually means. */
const GROUP_DEFAULTS: Record<MuscleGroup, ExerciseMuscles> = {
  chest: m(['chest'], ['front-delts', 'triceps']),
  back: m(['lats', 'upper-back'], ['biceps', 'rear-delts']),
  shoulders: m(['front-delts', 'side-delts'], ['triceps']),
  arms: m(['biceps', 'triceps'], ['forearms']),
  legs: m(['quads', 'glutes'], ['hamstrings']),
  core: m(['abs'], ['obliques']),
};

/** Best guess for a new or older exercise: from its name, else its muscle group. Also prefills the exercise form. */
export function suggestMuscles(name: string, group: MuscleGroup): ExerciseMuscles {
  const rule = NAME_RULES.find(([re]) => re.test(name));
  return rule ? rule[1] : GROUP_DEFAULTS[group];
}

/** The muscles an exercise trains: its own list when it has one (unknown ids dropped), otherwise a sensible default. */
export function musclesFor(exercise: Pick<Exercise, 'name' | 'muscleGroup' | 'muscles'>): ExerciseMuscles {
  const own = exercise.muscles;
  if (own && Array.isArray(own.primary) && own.primary.some(isMuscleId)) {
    return {
      primary: own.primary.filter(isMuscleId),
      secondary: (own.secondary ?? []).filter(isMuscleId),
      ...(own.weights ? { weights: own.weights } : {}),
    };
  }
  return suggestMuscles(exercise.name, exercise.muscleGroup);
}

/**
 * How much one set of the exercise counts for each muscle: primary 1.0, secondary 0.5 by default (configurable),
 * or the exercise's own weight for that muscle. A muscle listed as both counts as primary.
 */
export function involvement(exercise: Pick<Exercise, 'name' | 'muscleGroup' | 'muscles'>, config: MuscleConfig = MUSCLE_CONFIG): Map<MuscleId, number> {
  const { primary, secondary, weights } = musclesFor(exercise);
  const out = new Map<MuscleId, number>();
  const w = (id: MuscleId, base: number) => {
    const v = weights?.[id];
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : base;
  };
  for (const id of secondary) out.set(id, w(id, config.involvement.secondary));
  for (const id of primary) out.set(id, w(id, config.involvement.primary));
  return out;
}

/** The groups an exercise mainly trains (from its primary muscles), e.g. a seated row → back. */
export function primaryGroups(exercise: Pick<Exercise, 'name' | 'muscleGroup' | 'muscles'>): MuscleGroup[] {
  return [...new Set(musclesFor(exercise).primary.map((id) => muscleInfo(id).group))];
}
