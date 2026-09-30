import { afterEach, describe, expect, it } from 'vitest';
import type { Exercise, WorkoutSession } from '../types';
import { formatSets } from './history';
import { nextLevel } from './journey';
import { recommend } from './progression';
import { formatWeight, fromDisplay, LB_PER_KG, setUnits, snapWeight, toDisplay, unitStepKg } from './units';

afterEach(() => setUnits('kg'));

const press: Exercise = { id: 'press', name: 'Press', muscleGroup: 'chest', equipment: 'machine', repRange: [8, 12], weightStepKg: 5 };
const lb = (pounds: number) => snapWeight(pounds / LB_PER_KG, 'lb');

describe('units (stored in kg, shown in kg or lb)', () => {
  it('converts and formats', () => {
    expect(formatWeight(60)).toBe('60 kg');
    expect(formatWeight(42.5)).toBe('42.5 kg');
    expect(formatWeight(lb(135), 'lb')).toBe('135 lb');
    expect(toDisplay(fromDisplay(135, 'lb'), 'lb')).toBeCloseTo(135);
  });

  it('snaps to what you can load: 0.01 kg or 0.5 lb, and the same input always gives the same stored number', () => {
    expect(snapWeight(60.004, 'kg')).toBe(60);
    expect(toDisplay(snapWeight(fromDisplay(133.3, 'lb'), 'lb'), 'lb')).toBeCloseTo(133.5);
    expect(lb(145)).toBe(snapWeight(lb(135) + unitStepKg(5, 'lb'), 'lb')); // typed 145 lb === suggested 135 + 10 lb
  });

  it('turns kg steps into realistic lb steps', () => {
    expect(toDisplay(unitStepKg(5, 'lb'), 'lb')).toBeCloseTo(10);
    expect(toDisplay(unitStepKg(2.5, 'lb'), 'lb')).toBeCloseTo(5);
    expect(toDisplay(unitStepKg(1, 'lb'), 'lb')).toBeCloseTo(2.5);
    expect(unitStepKg(5, 'kg')).toBe(5);
    expect(unitStepKg(0, 'lb')).toBe(0); // bodyweight
  });

  it('in lb mode, suggestions, journeys and text use pounds', () => {
    setUnits('lb');
    const at = (d: number) => new Date(Date.UTC(2026, 5, 1 + d)).toISOString();
    const sets = (reps: number[]) => reps.map((r) => ({ reps: r, weightKg: lb(135), loggedAt: '' }));
    const h: WorkoutSession[] = [[11, 11, 10], [12, 12, 12], [12, 12, 12]].map((reps, i) => ({
      id: `s${i}`, name: 'W', startedAt: at(i * 7), finishedAt: at(i * 7), entries: [{ exerciseId: 'press', targetSets: 3, sets: sets(reps) }],
    }));
    const rec = recommend(press, h);
    expect(rec.title).toBe('Try 145 lb × 8');
    expect(rec.reason).toContain('135 lb × 12+');
    expect(rec.weightKg).toBe(lb(145));
    expect(formatWeight(nextLevel(press, { weightKg: lb(145), reps: 12 }).weightKg)).toBe('155 lb');
    expect(formatSets(h[0].entries[0].sets)).toBe('135 lb × 11 · 11 · 10');
  });
});
