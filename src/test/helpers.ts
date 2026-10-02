import { isStrength } from '../logic/entries';
import type { SessionEntry, StrengthEntry } from '../types';

/** Tests: this workout item is a strength exercise (fails loudly if not). */
export function S(e: SessionEntry | undefined): StrengthEntry {
  if (!e || !isStrength(e)) throw new Error('expected a strength entry');
  return e;
}
