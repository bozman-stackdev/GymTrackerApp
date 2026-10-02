/**
 * Deeper muscle analysis (Premium): weekly trends, comparison with the previous period, and a few plain-language
 * insights. Built on analysis.ts; the wording describes training and performance, never the body.
 */
import type { Exercise, MuscleGroup, MuscleId, WorkoutSession } from '../../types';
import { formatTarget } from '../history';
import { weekIndex } from '../game/streak';
import { GROUPS, muscleName, musclesInGroup, MUSCLE_IDS } from './catalog';
import { MUSCLE_CONFIG, type MuscleConfig } from './config';
import { analyseWindow, periodWindow, previousWindow, weightedSets, type MuscleAnalysis, type MuscleInput, type MusclePeriod } from './analysis';
import { involvement, musclesFor } from './catalog';
import { strengthEntries } from '../entries';

/** The period before, in words ("compared with last week"). */
export const PREVIOUS: Record<MusclePeriod, string> = {
  workout: 'the workout before', week: 'last week', '4w': 'the 4 weeks before', '12w': 'the 12 weeks before', all: 'before',
};

const sum = (muscles: MuscleId[], sets: Record<MuscleId, number>) => muscles.reduce((n, id) => n + sets[id], 0);
const round1 = (v: number) => Math.round(v * 10) / 10;

export interface GroupTrend {
  group: MuscleGroup;
  name: string;
  /** Weighted sets per week, oldest first; the last entry is the current week. */
  weeks: number[];
}

/** Weekly training per group over the last `weeks` weeks (Monday-based, like the streak). */
export function weeklyTrends(sessions: WorkoutSession[], exercises: Exercise[], now = new Date(), weeks = 12, config: MuscleConfig = MUSCLE_CONFIG): GroupTrend[] {
  const current = weekIndex(now);
  const byWeek = new Map<number, WorkoutSession[]>();
  for (const s of sessions) {
    const w = weekIndex(s.startedAt);
    if (w > current - weeks && w <= current) byWeek.set(w, [...(byWeek.get(w) ?? []), s]);
  }
  const perWeek = Array.from({ length: weeks }, (_, i) => weightedSets(byWeek.get(current - weeks + 1 + i) ?? [], exercises, config));
  return GROUPS.map(({ id, name }) => ({ group: id, name, weeks: perWeek.map((sets) => round1(sum(musclesInGroup(id), sets))) }));
}

export interface MuscleTrend {
  muscle: MuscleId;
  weeks: number[];
}

export function muscleWeeklyTrend(muscle: MuscleId, sessions: WorkoutSession[], exercises: Exercise[], now = new Date(), weeks = 12, config: MuscleConfig = MUSCLE_CONFIG): number[] {
  const current = weekIndex(now);
  const out = Array.from({ length: weeks }, () => 0);
  for (const s of sessions) {
    const i = weekIndex(s.startedAt) - (current - weeks + 1);
    if (i >= 0 && i < weeks) out[i] += weightedSets([s], exercises, config)[muscle];
  }
  return out.map(round1);
}

export interface GroupChange {
  group: MuscleGroup;
  name: string;
  current: number;
  previous: number;
  /** e.g. 0.2 = 20% more training volume than the previous period; null when there was none before. */
  change: number | null;
}

/** Training volume per group compared with the equally long period before. Null for "this workout" and "all time". */
export function compareWithPrevious(input: MuscleInput, analysis: MuscleAnalysis, config: MuscleConfig = MUSCLE_CONFIG): GroupChange[] | null {
  const prev = previousWindow(analysis.window, input.sessions);
  if (!prev) return null;
  const before = weightedSets(prev.sessions, input.exercises, config);
  const now = Object.fromEntries(MUSCLE_IDS.map((id) => [id, analysis.activity[id].sets])) as Record<MuscleId, number>;
  return GROUPS.map(({ id, name }) => {
    const current = round1(sum(musclesInGroup(id), now));
    const previous = round1(sum(musclesInGroup(id), before));
    return { group: id, name, current, previous, change: previous > 0 ? Math.round(((current - previous) / previous) * 100) / 100 : null };
  });
}

/**
 * Up to three short observations: the clearest performance progress, muscles not trained in the period, muscles with
 * lower training volume than before, performance below earlier bests. Neutral language: about training, not appearance.
 */
export function muscleInsights(input: MuscleInput, analysis: MuscleAnalysis, config: MuscleConfig = MUSCLE_CONFIG): string[] {
  const out: string[] = [];
  const name = (id: string) => input.exercises.find((e) => e.id === id)?.name ?? 'an exercise';
  const progressing = MUSCLE_IDS.map((id) => analysis.progress[id])
    .filter((p) => p.level === 'strong' || p.level === 'moderate')
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = progressing[0];
  if (top) {
    const ex = top.exercises.find((e) => e.before && e.steps > 0);
    const detail = ex?.before ? ` (${name(ex.exerciseId)} ${formatTarget(ex.before)} → ${formatTarget(ex.best)})` : '';
    out.push(`${muscleName(top.muscle)}: ${top.level} performance progression${detail}.`);
  }

  // (The training emphasis is already in the balance card.) Muscles with no training at all in the period, over weeks -
  // a single workout is meant to focus. Only muscles the user has trained before, so a muscle they never train isn't nagged about.
  if (analysis.window.period !== 'workout') {
    const everTrained = weightedSets(input.sessions, input.exercises, config);
    const untrained = MUSCLE_IDS.filter((id) => analysis.activity[id].sets === 0 && everTrained[id] > 0);
    if (untrained.length) out.push(`No training in this period for: ${untrained.slice(0, 3).map((id) => muscleName(id).toLowerCase()).join(', ')}.`);
  }

  const prev = previousWindow(analysis.window, input.sessions);
  if (prev) {
    const before = analyseWindow(input, prev, config).activity;
    const dropped = MUSCLE_IDS.filter((id) => before[id].sets >= 2 && analysis.activity[id].sets < before[id].sets / 2);
    if (dropped.length) {
      out.push(`Lower training volume than ${PREVIOUS[analysis.window.period]}: ${dropped.slice(0, 3).map((id) => muscleName(id).toLowerCase()).join(', ')}.`);
    }
  }

  const lower = MUSCLE_IDS.map((id) => analysis.progress[id]).filter((p) => p.level === 'lower');
  if (lower.length) {
    out.push(`${lower.slice(0, 2).map((p) => muscleName(p.muscle)).join(' and ')}: recent performance below your earlier best. Today's Challenge adjusts to this by itself.`);
  }
  return out.slice(0, 3).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

/**
 * Context for Today's Challenge and the exercise page: how much of a main muscle's training this exercise gave in the
 * last 4 weeks ("your main chest exercise: 55% of chest sets"). Information only - the progression engine alone
 * decides the challenge.
 */
export function exerciseShare(exerciseId: string, input: MuscleInput, config: MuscleConfig = MUSCLE_CONFIG): { muscle: MuscleId; share: number } | null {
  const ex = input.exercises.find((e) => e.id === exerciseId);
  if (!ex) return null;
  const w = periodWindow('4w', input.sessions, input.now ?? new Date());
  const total = weightedSets(w.sessions, input.exercises, config);
  const sets = w.sessions.reduce((n, s) => n + strengthEntries(s).filter((e) => e.exerciseId === exerciseId).reduce((k, e) => k + e.sets.length, 0), 0);
  if (!sets) return null;
  const inv = involvement(ex, config);
  const best = musclesFor(ex).primary
    .map((muscle) => ({ muscle, share: total[muscle] > 0 ? (sets * (inv.get(muscle) ?? 0)) / total[muscle] : 0 }))
    .sort((a, b) => b.share - a.share)[0];
  return best && best.share > 0 ? { muscle: best.muscle, share: Math.round(best.share * 100) / 100 } : null;
}
