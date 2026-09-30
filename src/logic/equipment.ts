/**
 * My gym: the machines the user actually uses. Pure helpers over AppData. "Last used" and "previous session"
 * are derived from workout history (each workout exercise records its equipmentId), never stored separately.
 */
import type { AppData, GymEquipment, SetLog, WorkoutSession } from '../types';

/** Machines the user has for an exercise. */
export function equipmentFor(equipment: GymEquipment[], exerciseId: string): GymEquipment[] {
  return equipment.filter((e) => e.exerciseIds.includes(exerciseId));
}

/** The machine to use for an exercise: the one used last time (if it still exists), else the first one saved for it. */
export function preferredEquipmentId(data: Pick<AppData, 'equipment' | 'sessions'>, exerciseId: string): string | undefined {
  const options = equipmentFor(data.equipment, exerciseId);
  if (options.length === 0) return undefined;
  const lastUsed = [...data.sessions]
    .filter((s) => s.finishedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((s) => s.entries)
    .find((e) => e.exerciseId === exerciseId && e.equipmentId && options.some((o) => o.id === e.equipmentId));
  return lastUsed?.equipmentId ?? options[0].id;
}

export interface EquipmentUsage {
  date: string;
  exerciseId: string;
  sets: SetLog[];
}

/** The latest finished workout that used this machine. */
export function lastUsage(sessions: WorkoutSession[], equipmentId: string): EquipmentUsage | undefined {
  let best: EquipmentUsage | undefined;
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    for (const e of s.entries) {
      if (e.equipmentId === equipmentId && e.sets.length && (!best || s.startedAt > best.date)) {
        best = { date: s.startedAt, exerciseId: e.exerciseId, sets: e.sets };
      }
    }
  }
  return best;
}

/** Gyms the user has named, most used first (for suggestions in the form). */
export function knownGyms(equipment: GymEquipment[]): string[] {
  const counts = new Map<string, number>();
  for (const e of equipment) if (e.gym.trim()) counts.set(e.gym.trim(), (counts.get(e.gym.trim()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}
