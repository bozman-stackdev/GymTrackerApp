/**
 * Demo recognizer: NO image analysis. It returns plausible example suggestions so the flow can be built and tested:
 *   1. exercises the user is likely doing right now (context hint), then
 *   2. machine/cable exercises picked from a simple fingerprint of the photo bytes
 *      (so the same photo always gives the same suggestions).
 */
import { MAX_SUGGESTIONS, type MachineRecognizer } from './types';

const FAKE_CONFIDENCE = [0.6, 0.25, 0.15];

export const mockRecognizer: MachineRecognizer = {
  async identify({ photo, exercises, likelyExerciseIds = [] }) {
    await new Promise((r) => setTimeout(r, 700)); // feel like a real request

    const machines = exercises.filter((e) => e.equipment === 'machine' || e.equipment === 'cable');
    const seed = await fingerprint(photo);
    const rotated = machines.map((_, i) => machines[(i + seed) % machines.length].id);
    const known = new Set(exercises.map((e) => e.id));

    const ids = [...new Set([...likelyExerciseIds.filter((id) => known.has(id)), ...rotated])].slice(0, MAX_SUGGESTIONS);
    return {
      source: 'demo',
      suggestions: ids.map((exerciseId, i) => ({ exerciseId, confidence: FAKE_CONFIDENCE[i] ?? 0.1 })),
    };
  },
};

/** A tiny number derived from the first bytes of the photo. */
async function fingerprint(photo: Blob): Promise<number> {
  const bytes = new Uint8Array(await photo.slice(0, 4096).arrayBuffer());
  return bytes.reduce((sum, b) => (sum + b) % 9973, photo.size % 9973);
}
