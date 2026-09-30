/**
 * kg / lb. Everything is STORED in kg; the user's unit only affects display, input and sensible steps.
 *
 * The display unit is a small module-level setting (set once from the profile by the app shell) rather than a parameter
 * threaded through every formatter and rule - a deliberate trade-off to keep the rest of the code unchanged.
 */
export type Units = 'kg' | 'lb';

export const LB_PER_KG = 2.20462262;
let current: Units = 'kg';

export const getUnits = (): Units => current;
export const setUnits = (units: Units): void => { current = units; };

export const toDisplay = (kg: number, u: Units = current) => (u === 'lb' ? kg * LB_PER_KG : kg);
export const fromDisplay = (value: number, u: Units = current) => (u === 'lb' ? value / LB_PER_KG : value);

/**
 * The stored kg value for a weight in the user's units: 0.01 kg, or the nearest 0.5 lb.
 * Used by weight inputs AND the progression engine, so "145 lb" is always the very same number.
 */
export function snapWeight(kg: number, u: Units = current): number {
  if (u === 'kg') return Math.round(kg * 100) / 100;
  const lb = Math.round(kg * LB_PER_KG * 2) / 2;
  return Math.round((lb / LB_PER_KG) * 10000) / 10000;
}

/**
 * A SUGGESTED weight (from the progression engine or journey): in lb, rounded to 2.5 lb plates (e.g. 99.2 + 10 → 110 lb).
 * Typed weights keep 0.5 lb precision (snapWeight). In kg this is snapWeight. Values on both grids are identical numbers.
 */
export function suggestWeight(kg: number, u: Units = current): number {
  if (u === 'kg') return snapWeight(kg, u);
  return snapWeight((Math.round((kg * LB_PER_KG) / 2.5) * 2.5) / LB_PER_KG, u);
}

/** A realistic weight jump in the user's units (e.g. 5 kg ↔ 10 lb, 2.5 kg ↔ 5 lb), returned in kg. */
export function unitStepKg(stepKg: number, u: Units = current): number {
  if (u === 'kg' || stepKg <= 0) return stepKg;
  const lb = stepKg * LB_PER_KG;
  const nice = [1, 2.5, 5, 10, 20, 25, 45].reduce((a, b) => (Math.abs(b - lb) < Math.abs(a - lb) ? b : a));
  return nice / LB_PER_KG;
}

/** "60 kg", "132.5 lb". */
export function formatWeight(kg: number, u: Units = current): string {
  const v = toDisplay(kg, u);
  return `${Number(v.toFixed(u === 'lb' ? 1 : 2))} ${u}`;
}

/** Number only, for compact places like "60×10". */
export function weightNumber(kg: number, u: Units = current): string {
  return String(Number(toDisplay(kg, u).toFixed(u === 'lb' ? 1 : 2)));
}
