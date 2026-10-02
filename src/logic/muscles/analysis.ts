/**
 * Muscle analysis: what the user has been TRAINING (activity) and where their PERFORMANCE has been improving
 * (progress), per muscle and per group, over a chosen period. Pure functions over workout history.
 *
 * - Activity counts weighted working sets: each set of an exercise counts 1.0 for its primary muscles and 0.5 for its
 *   secondary ones (config). Warm-up sets are never in a strength entry's sets, and cardio, warm-ups and cool-downs are
 *   activity entries, so none of them count.
 * - Progress compares performance with before the period: journey steps gained (weight and reps), best workout
 *   volume, Today's Challenges completed, weights mastered and consistency. It describes training performance only;
 *   it does not (and cannot) measure muscle growth.
 *
 * See docs/MUSCLES.md for the full rules and examples.
 */
import type { Exercise, MuscleGroup, MuscleId, SetLog, WorkoutSession } from '../../types';
import { strengthEntries } from '../entries';
import { isSuccess, type ExerciseResult } from '../game/challenge';
import { weekIndex } from '../game/streak';
import { bestRepsAtWeight, workingWeight } from '../history';
import { GROUPS, involvement, MUSCLE_IDS, musclesFor, musclesInGroup, REGIONS, type RegionId } from './catalog';
import { MUSCLE_CONFIG, type MuscleConfig } from './config';

// ---------- Periods ----------

export type MusclePeriod = 'workout' | 'week' | '4w' | '12w' | 'all';

export const PERIODS: { id: MusclePeriod; label: string; short: string }[] = [
  { id: 'workout', label: 'This workout', short: 'Workout' },
  { id: 'week', label: 'This week', short: 'Week' },
  { id: '4w', label: 'Last 4 weeks', short: '4 wks' },
  { id: '12w', label: 'Last 12 weeks', short: '12 wks' },
  { id: 'all', label: 'All time', short: 'All' },
];
export const periodLabel = (p: MusclePeriod) => PERIODS.find((x) => x.id === p)!.label;

export interface PeriodWindow {
  period: MusclePeriod;
  /** Workouts in the period, oldest first. */
  sessions: WorkoutSession[];
  /** Start of the period (ms, inclusive). For "this workout", that workout's start. */
  from: number;
  /** Calendar weeks the period covers (consistency is measured over these). */
  weeks: number;
}

const DAY = 86_400_000;
const time = (s: WorkoutSession) => new Date(s.startedAt).getTime();
const byStart = (a: WorkoutSession, b: WorkoutSession) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * The workouts of a period. "This workout" is `workoutId` when given, else the latest workout (the one in progress,
 * if it's included in `sessions`). Weeks start on Monday, like the streak.
 */
export function periodWindow(period: MusclePeriod, sessions: WorkoutSession[], now = new Date(), workoutId?: string): PeriodWindow {
  const sorted = [...sessions].sort(byStart);
  if (period === 'workout') {
    const s = (workoutId && sorted.find((x) => x.id === workoutId)) || sorted.at(-1);
    return { period, sessions: s ? [s] : [], from: s ? time(s) : now.getTime(), weeks: 1 };
  }
  let from: number;
  let weeks: number;
  if (period === 'week') {
    from = startOfDay(now) - ((now.getDay() + 6) % 7) * DAY;
    weeks = 1;
  } else if (period === '4w' || period === '12w') {
    weeks = period === '4w' ? 4 : 12;
    from = startOfDay(now) - (weeks * 7 - 1) * DAY;
  } else {
    from = -Infinity;
    weeks = sorted.length ? Math.max(1, weekIndex(now) - weekIndex(sorted[0].startedAt) + 1) : 1;
  }
  return { period, sessions: sorted.filter((s) => time(s) >= from), from, weeks };
}

/**
 * The equally long period just before (for "compared with the previous 4 weeks"). Only for the rolling periods: a week
 * in progress isn't comparable with a whole week, and a single workout or all time has nothing before it to compare.
 */
export function previousWindow(w: PeriodWindow, sessions: WorkoutSession[]): PeriodWindow | null {
  if (w.period !== '4w' && w.period !== '12w') return null;
  const length = w.weeks * 7 * DAY;
  const from = w.from - length;
  return { period: w.period, weeks: w.weeks, from, sessions: [...sessions].sort(byStart).filter((s) => time(s) >= from && time(s) < w.from) };
}

// ---------- Activity ----------

export type ActivityLevel = 'none' | 'low' | 'medium' | 'high';

export interface MuscleActivity {
  muscle: MuscleId;
  /** Weighted working sets in the period. */
  sets: number;
  /** Relative to the most-trained muscle of the period (100). */
  pct: number;
  level: ActivityLevel;
  /** Exercises that trained it, most sets first. */
  exercises: { exerciseId: string; sets: number; primary: boolean }[];
}

type Involvement = Map<MuscleId, number>;

/** Involvement per exercise id, computed once per analysis. Exercises no longer in the library are skipped. */
export function involvementLookup(exercises: Exercise[], config: MuscleConfig = MUSCLE_CONFIG) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const cache = new Map<string, Involvement | null>();
  return (exerciseId: string): Involvement | null => {
    if (!cache.has(exerciseId)) {
      const ex = byId.get(exerciseId);
      cache.set(exerciseId, ex ? involvement(ex, config) : null);
    }
    return cache.get(exerciseId)!;
  };
}

/**
 * Weighted working sets per muscle in some workouts (the raw activity numbers). Pass a lookup from involvementLookup()
 * when calling it many times (the progress replay does, once per workout).
 */
export function weightedSets(
  sessions: WorkoutSession[], exercises: Exercise[], config: MuscleConfig = MUSCLE_CONFIG, inv = involvementLookup(exercises, config),
): Record<MuscleId, number> {
  const out = Object.fromEntries(MUSCLE_IDS.map((id) => [id, 0])) as Record<MuscleId, number>;
  for (const s of sessions) {
    for (const e of strengthEntries(s)) {
      const muscles = e.sets.length ? inv(e.exerciseId) : null;
      if (muscles) for (const [id, w] of muscles) out[id] += e.sets.length * w;
    }
  }
  return out;
}

export function activityLevel(pct: number, config: MuscleConfig = MUSCLE_CONFIG): ActivityLevel {
  const { medium, high } = config.activity.levels;
  return pct <= 0 ? 'none' : pct >= high ? 'high' : pct >= medium ? 'medium' : 'low';
}

function muscleActivity(w: PeriodWindow, exercises: Exercise[], config: MuscleConfig): Record<MuscleId, MuscleActivity> {
  const inv = involvementLookup(exercises, config);
  const sets = weightedSets(w.sessions, exercises, config);
  const perExercise = new Map<MuscleId, Map<string, number>>();
  for (const s of w.sessions) {
    for (const e of strengthEntries(s)) {
      const muscles = e.sets.length ? inv(e.exerciseId) : null;
      if (!muscles) continue;
      for (const [id, weight] of muscles) {
        const m = perExercise.get(id) ?? new Map<string, number>();
        m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + e.sets.length * weight);
        perExercise.set(id, m);
      }
    }
  }
  const max = Math.max(0, ...Object.values(sets));
  return Object.fromEntries(MUSCLE_IDS.map((id) => {
    const raw = sets[id];
    // A muscle that was trained at all shows as at least 1% (Low), never as untrained.
    const pct = max > 0 && raw > 0 ? Math.max(1, Math.round((raw / max) * 100)) : 0;
    const list = [...(perExercise.get(id) ?? new Map()).entries()]
      .map(([exerciseId, n]) => ({ exerciseId, sets: round(n), primary: (inv(exerciseId)?.get(id) ?? 0) >= config.involvement.primary }))
      .sort((a, b) => b.sets - a.sets);
    return [id, { muscle: id, sets: round(raw), pct, level: activityLevel(pct, config), exercises: list }];
  })) as Record<MuscleId, MuscleActivity>;
}

// ---------- Progress ----------

export type ProgressLevel = 'none' | 'lower' | 'stable' | 'moderate' | 'strong';

/** A workout's best set on an exercise: its working weight and the most reps done with it. */
export interface TopSet {
  weightKg: number;
  reps: number;
  date: string;
}

export interface ExerciseProgress {
  exerciseId: string;
  /** Best set just before the period (or the period's first workout of it, when there was nothing before). Null: nothing to compare with yet. */
  before: TopSet | null;
  /** Best set in the period (compared with `before`). */
  best: TopSet;
  /** Workouts in the period compared with `before`. */
  sessions: number;
  /** Journey steps gained: +1 for each extra rep, or for the next weight back at the bottom of the rep range. */
  steps: number;
  /** Best workout volume in the period vs before, e.g. 0.12 = +12%. */
  volumeChange: number | null;
  challengesAttempted: number;
  challengesCompleted: number;
  /** Weights mastered in the period. */
  mastered: number;
}

export interface ProgressFactors {
  performance: number | null;
  volume: number | null;
  challenges: number | null;
  mastery: number | null;
  consistency: number | null;
}

export interface MuscleProgress {
  muscle: MuscleId;
  level: ProgressLevel;
  /** -1 (well below before) … 1 (strong progression); null without enough history. */
  score: number | null;
  factors: ProgressFactors;
  /** Exercises behind it (main ones first), with how much each involves this muscle. */
  exercises: (ExerciseProgress & { involvement: number; primary: boolean })[];
  weeksTrained: number;
  weeks: number;
}

/**
 * Position on the exercise's journey ladder (60 kg × 8 → … → 60 × 12 → 65 × 8 …), so a weight increase that resets the
 * reps to the bottom of the range still counts as one step forward, exactly like Today's Challenge.
 */
export function ladderPosition(ex: Pick<Exercise, 'repRange' | 'weightStepKg'>, t: { weightKg: number; reps: number }): number {
  const [lo, hi] = ex.repRange;
  if (ex.weightStepKg <= 0) return t.reps; // bodyweight: every rep is a step
  return (t.weightKg / ex.weightStepKg) * (hi - lo + 1) + Math.min(t.reps, hi) - lo;
}

function topSet(sets: SetLog[], date: string): TopSet {
  const w = workingWeight(sets);
  return { weightKg: w, reps: w > 0 ? bestRepsAtWeight(sets, w) : Math.max(0, ...sets.map((s) => s.reps)), date };
}

const volume = (sets: SetLog[]) => sets.reduce((sum, s) => sum + s.reps * (s.weightKg > 0 ? s.weightKg : 1), 0);

type Results = (sessionId: string) => ExerciseResult[] | undefined;

/** How one exercise went in the period compared with before it. Null when it wasn't done in the period. */
export function exerciseProgress(ex: Exercise, all: WorkoutSession[], w: PeriodWindow, results?: Results): ExerciseProgress | null {
  const inPeriod = new Set(w.sessions.map((s) => s.id));
  const hist: { id: string; top: TopSet; vol: number; inPeriod: boolean; t: number }[] = [];
  for (const s of [...all].sort(byStart)) {
    for (const e of strengthEntries(s)) {
      if (e.exerciseId === ex.id && e.sets.length) hist.push({ id: s.id, top: topSet(e.sets, s.startedAt), vol: volume(e.sets), inPeriod: inPeriod.has(s.id), t: time(s) });
    }
  }
  const during = hist.filter((h) => h.inPeriod);
  if (during.length === 0) return null;

  let base = hist.filter((h) => !h.inPeriod && h.t < w.from).at(-1);
  let compared = during;
  if (!base && during.length >= 2) [base, ...compared] = during;

  let attempted = 0;
  let completed = 0;
  let mastered = 0;
  for (const h of during) {
    const r = results?.(h.id)?.find((x) => x.exerciseId === ex.id);
    if (r?.challenge && r.outcome) {
      attempted++;
      if (isSuccess(r.outcome)) completed++;
    }
    if (r?.weightMastered) mastered++;
  }

  const pos = (t: TopSet) => ladderPosition(ex, t);
  const best = compared.reduce((a, b) => (pos(b.top) > pos(a.top) ? b : a)).top;
  const bestVol = Math.max(...compared.map((h) => h.vol));
  return {
    exerciseId: ex.id,
    before: base ? base.top : null,
    best,
    sessions: base ? compared.length : 0,
    steps: base ? round(pos(best) - pos(base.top)) : 0,
    volumeChange: base && base.vol > 0 ? (bestVol - base.vol) / base.vol : null,
    challengesAttempted: attempted,
    challengesCompleted: completed,
    mastered,
  };
}

const clamp = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;

export function progressLevel(score: number | null, config: MuscleConfig = MUSCLE_CONFIG): ProgressLevel {
  if (score === null) return 'none';
  const { strong, moderate, lower } = config.progress.levels;
  return score >= strong ? 'strong' : score >= moderate ? 'moderate' : score > lower ? 'stable' : 'lower';
}

/** Combines the factors with their weights, leaving out the ones without data. */
export function progressScore(f: ProgressFactors, config: MuscleConfig = MUSCLE_CONFIG): number | null {
  if (f.performance === null) return null; // performance is the core: without a comparison there's no progress to show
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(config.progress.factors) as [keyof ProgressFactors, number][]) {
    const v = f[key];
    if (v === null) continue;
    sum += v * w;
    weight += w;
  }
  return weight > 0 ? round(sum / weight) : null;
}

function muscleProgress(
  w: PeriodWindow, all: WorkoutSession[], exercises: Exercise[], results: Results | undefined, config: MuscleConfig,
): Record<MuscleId, MuscleProgress> {
  const cfg = config.progress;
  const done = new Set(w.sessions.flatMap((s) => strengthEntries(s).filter((e) => e.sets.length).map((e) => e.exerciseId)));
  const rows = exercises
    .filter((ex) => done.has(ex.id))
    .map((ex) => ({ inv: involvement(ex, config), main: new Set(musclesFor(ex).primary), p: exerciseProgress(ex, all, w, results) }))
    .filter((r): r is { inv: Involvement; main: Set<MuscleId>; p: ExerciseProgress } => r.p !== null);

  // Weeks in which each muscle got real work (an exercise that involves it at least `minInvolvement`).
  const weeksByMuscle = new Map<MuscleId, Set<number>>();
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const s of w.sessions) {
    for (const e of strengthEntries(s)) {
      const ex = byId.get(e.exerciseId);
      if (!ex || !e.sets.length) continue;
      for (const [id, v] of involvement(ex, config)) {
        if (v < cfg.minInvolvement) continue;
        const set = weeksByMuscle.get(id) ?? new Set<number>();
        set.add(weekIndex(s.startedAt));
        weeksByMuscle.set(id, set);
      }
    }
  }

  return Object.fromEntries(MUSCLE_IDS.map((id) => {
    const mine = rows
      .map((r) => ({ ...r.p, involvement: r.inv.get(id) ?? 0, primary: r.main.has(id) }))
      .filter((r) => r.involvement >= cfg.minInvolvement)
      .sort((a, b) => Number(b.primary) - Number(a.primary) || b.involvement - a.involvement || b.sessions - a.sessions);
    // A muscle's progress is how its MAIN exercises went (a stalled shoulder press isn't hidden by chest presses that
    // also work the front shoulders). Exercises that only also work it decide only when there's no main one to go by.
    const comparable = mine.filter((r) => r.before && r.sessions > 0);
    const compared = comparable.some((r) => r.primary) ? comparable.filter((r) => r.primary) : comparable;
    const basis = compared.some((r) => r.primary) ? mine.filter((r) => r.primary) : mine;
    const weigh = (pick: (r: (typeof mine)[number]) => number | null, list = compared) => {
      let sum = 0;
      let total = 0;
      for (const r of list) {
        const v = pick(r);
        if (v === null) continue;
        const k = r.involvement * r.sessions;
        sum += v * k;
        total += k;
      }
      return total > 0 ? sum / total : null;
    };
    const attempted = basis.reduce((n, r) => n + r.involvement * r.challengesAttempted, 0);
    const completed = basis.reduce((n, r) => n + r.involvement * r.challengesCompleted, 0);
    const masteredW = basis.reduce((n, r) => n + r.involvement * r.mastered, 0);
    const weeksTrained = weeksByMuscle.get(id)?.size ?? 0;
    const factors: ProgressFactors = {
      performance: weigh((r) => clamp(r.steps / (r.sessions * cfg.stepsPerSessionForFull))),
      volume: weigh((r) => (r.volumeChange === null ? null : clamp(r.volumeChange / cfg.volumeGainForFull))),
      challenges: attempted > 0 ? completed / attempted : null,
      mastery: compared.length ? clamp(masteredW / cfg.masteredForFull, 0, 1) : null,
      consistency: compared.length && w.weeks >= cfg.minWeeksForConsistency ? clamp(weeksTrained / w.weeks, 0, 1) : null,
    };
    for (const k of Object.keys(factors) as (keyof ProgressFactors)[]) if (factors[k] !== null) factors[k] = round(factors[k]!);
    const score = progressScore(factors, config);
    return [id, { muscle: id, level: progressLevel(score, config), score, factors, exercises: mine, weeksTrained, weeks: w.weeks }];
  })) as Record<MuscleId, MuscleProgress>;
}

// ---------- Groups and balance ----------

export interface GroupSummary {
  group: MuscleGroup;
  name: string;
  /** Average activity of its muscles (0–100). */
  pct: number;
  level: ActivityLevel;
  /** Progress of its muscles, weighted by how much each was trained. */
  score: number | null;
  progress: ProgressLevel;
}

export type BalanceLevel = 'high' | 'moderate' | 'low';

export interface BalanceRegion {
  id: RegionId;
  name: string;
  /** Average weighted sets per muscle in the region (regions have different numbers of muscles). */
  sets: number;
  level: BalanceLevel;
}

export interface Balance {
  /** False when there's too little training in the period to compare. */
  enough: boolean;
  regions: BalanceRegion[];
  /** Neutral sentences about training emphasis, e.g. "Training emphasis: pushing. Pulling: lower recent training volume." */
  notes: string[];
}

export function trainingBalance(activity: Record<MuscleId, MuscleActivity>, config: MuscleConfig = MUSCLE_CONFIG): Balance {
  const cfg = config.balance;
  const total = MUSCLE_IDS.reduce((n, id) => n + activity[id].sets, 0);
  const avg = (muscles: MuscleId[]) => muscles.reduce((n, id) => n + activity[id].sets, 0) / muscles.length;
  const raw = REGIONS.map((r) => ({ id: r.id, name: r.name, sets: round(avg(r.muscles)) }));
  const max = Math.max(...raw.map((r) => r.sets));
  const regions = raw.map((r) => {
    const share = max > 0 ? r.sets / max : 0;
    return { ...r, level: (share >= cfg.levels.high ? 'high' : share >= cfg.levels.moderate ? 'moderate' : 'low') as BalanceLevel };
  });
  const enough = total >= cfg.minSets;
  const get = (id: RegionId) => regions.find((r) => r.id === id)!;
  const notes = enough ? [compare(get('upper'), get('lower'), cfg.emphasisRatio), compare(get('push'), get('pull'), cfg.emphasisRatio)] : [];
  return { enough, regions, notes };
}

/** One neutral sentence about two regions. Describes training only - never the body. */
function compare(a: BalanceRegion, b: BalanceRegion, ratio: number): string {
  const [hi, lo] = a.sets >= b.sets ? [a, b] : [b, a];
  if (hi.sets === 0) return `No ${a.name.toLowerCase()} or ${b.name.toLowerCase()} training in this period.`;
  if (lo.sets === 0) return `Training emphasis: ${hi.name.toLowerCase()}. No ${lo.name.toLowerCase()} training in this period.`;
  if (hi.sets / lo.sets < ratio) return `${a.name} and ${b.name.toLowerCase()}: similar training volume.`;
  const times = hi.sets / lo.sets;
  const about = times >= 2.5 ? ' (more than twice as much)' : times >= 1.75 ? ' (about twice as much)' : '';
  return `Training emphasis: ${hi.name.toLowerCase()}${about}. ${lo.name}: lower recent training volume.`;
}

// ---------- Everything for the screen ----------

export interface MuscleAnalysis {
  window: PeriodWindow;
  activity: Record<MuscleId, MuscleActivity>;
  progress: Record<MuscleId, MuscleProgress>;
  groups: GroupSummary[];
  balance: Balance;
  /** Working sets in the period (unweighted). */
  totalSets: number;
}

export interface MuscleInput {
  /** Finished workouts, plus the one in progress (with a `finishedAt`) when it should count. */
  sessions: WorkoutSession[];
  exercises: Exercise[];
  /** Challenge outcomes and mastery per workout, from the game (progress replay or live scoring). */
  results?: Results;
  now?: Date;
}

export function analyseMuscles(input: MuscleInput, period: MusclePeriod, workoutId?: string, config: MuscleConfig = MUSCLE_CONFIG): MuscleAnalysis {
  const now = input.now ?? new Date();
  const w = periodWindow(period, input.sessions, now, workoutId);
  return analyseWindow(input, w, config);
}

export function analyseWindow(input: MuscleInput, w: PeriodWindow, config: MuscleConfig = MUSCLE_CONFIG): MuscleAnalysis {
  const activity = muscleActivity(w, input.exercises, config);
  const progress = muscleProgress(w, input.sessions, input.exercises, input.results, config);
  const groups = GROUPS.map(({ id, name }) => {
    const muscles = musclesInGroup(id);
    const pct = Math.round(muscles.reduce((n, m) => n + activity[m].pct, 0) / muscles.length);
    let sum = 0;
    let weight = 0;
    for (const m of muscles) {
      const s = progress[m].score;
      if (s === null) continue;
      sum += s * Math.max(activity[m].sets, 0.01);
      weight += Math.max(activity[m].sets, 0.01);
    }
    const score = weight > 0 ? round(sum / weight) : null;
    return { group: id, name, pct, level: activityLevel(pct, config), score, progress: progressLevel(score, config) };
  });
  const totalSets = w.sessions.reduce((n, s) => n + strengthEntries(s).reduce((k, e) => k + e.sets.length, 0), 0);
  return { window: w, activity, progress, groups, balance: trainingBalance(activity, config), totalSets };
}
