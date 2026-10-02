import { describe, expect, it } from 'vitest';
import { addExerciseToWorkout, deleteEquipment, finishWorkout, logSet, saveEquipment, setEntryEquipment, startExercise, startWorkout } from '../data/actions';
import { createSampleData, createStarterData, SAMPLE_EQUIPMENT, SAMPLE_ROUTINES } from '../data/seed';
import { parseAppData, validateEquipment } from '../data/validate';
import type { GymEquipment } from '../types';
import { equipmentFor, knownGyms, lastUsage, preferredEquipmentId } from './equipment';
import { S } from '../test/helpers';

const item = (over: Partial<GymEquipment> = {}): GymEquipment => ({
  id: 'e1', name: 'Life Fitness Leg Press', exerciseIds: ['leg-press'], type: 'machine', gym: 'Home Gym',
  source: 'manual', createdAt: '2026-06-01T00:00:00.000Z', ...over,
});

describe('equipment library', () => {
  it('finds machines for an exercise; a cable station can serve several exercises', () => {
    expect(equipmentFor(SAMPLE_EQUIPMENT, 'face-pull').map((e) => e.name)).toEqual(['Dual Cable Station']);
    expect(equipmentFor(SAMPLE_EQUIPMENT, 'triceps-pushdown').map((e) => e.name)).toEqual(['Dual Cable Station']);
    expect(equipmentFor(SAMPLE_EQUIPMENT, 'back-squat')).toEqual([]);
  });

  it('a new workout uses the machine you used last time (or the first one saved)', () => {
    let d = saveEquipment(createStarterData(), item());
    d = saveEquipment(d, item({ id: 'e2', name: 'Hammer Strength Leg Press', gym: 'Work Gym' }));
    expect(preferredEquipmentId(d, 'leg-press')).toBe('e1');

    d = startExercise(d, 'leg-press');
    d = setEntryEquipment(d, 0, 'e2');
    d = finishWorkout(logSet(logSet(logSet(d, 0, { reps: 10, weightKg: 100 }), 0, { reps: 10, weightKg: 100 }), 0, { reps: 9, weightKg: 100 }));
    expect(preferredEquipmentId(d, 'leg-press')).toBe('e2');
    const next = startWorkout(d, { id: 'r', name: 'Legs', items: [{ exerciseId: 'leg-press', sets: 3 }] });
    expect(S(next.activeWorkout!.session.entries[0]).equipmentId).toBe('e2');
  });

  it('"last used" and "previous session" come from workout history', () => {
    const d = createSampleData(new Date('2026-10-07T12:00:00'));
    const usage = lastUsage(d.sessions, 'eq-leg-press')!;
    expect(usage.exerciseId).toBe('leg-press');
    expect(usage.sets.length).toBe(3);
    expect(usage.date).toBe(d.sessions.filter((s) => s.name === 'Legs').at(-1)!.startedAt);
    expect(lastUsage(d.sessions, 'nope')).toBeUndefined();
  });

  it('adding an exercise from a scan can pick a specific machine', () => {
    let d = saveEquipment(createStarterData(), item());
    d = startWorkout(d, SAMPLE_ROUTINES[0]);
    d = addExerciseToWorkout(d, 'leg-press', 3, 'e1');
    expect(d.activeWorkout!.session.entries.at(-1)).toMatchObject({ exerciseId: 'leg-press', equipmentId: 'e1' });
  });

  it('deleting a machine keeps past workouts intact', () => {
    const d = createSampleData();
    const after = deleteEquipment(d, 'eq-leg-press');
    expect(after.equipment.some((e) => e.id === 'eq-leg-press')).toBe(false);
    expect(after.sessions).toBe(d.sessions);
  });

  it('suggests gyms you already use, most used first', () => {
    expect(knownGyms([...SAMPLE_EQUIPMENT, item({ id: 'x', gym: 'Home Gym' })])).toEqual(['Anytime Fitness Leeds', 'Home Gym']);
  });

  it('validates the form', () => {
    expect(validateEquipment(item(), [])).toEqual({});
    expect(validateEquipment(item({ name: ' ' }), []).name).toBeDefined();
    expect(validateEquipment(item({ exerciseIds: [] }), []).exerciseIds).toBeDefined();
    expect(validateEquipment(item({ id: 'e2' }), [item()]).name).toMatch(/already/); // same name, same gym
    expect(validateEquipment(item({ id: 'e2', gym: 'Other Gym' }), [item()])).toEqual({}); // same name elsewhere is fine
  });

  it('data saved before the equipment library existed still loads (empty library)', () => {
    const old = createSampleData() as Partial<ReturnType<typeof createSampleData>>;
    delete old.equipment;
    expect(parseAppData(JSON.parse(JSON.stringify(old))).equipment).toEqual([]);
  });
});
