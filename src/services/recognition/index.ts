/**
 * Machine / exercise recognition from a photo.
 *
 * The UI talks ONLY to `recognizer` and these types. To switch from the demo to real recognition:
 *   - set VITE_RECOGNITION_URL (see http.ts for the request/response contract), or
 *   - write another MachineRecognizer (e.g. an on-device model) and return it from pickRecognizer().
 * Nothing else in the app needs to change.
 */
import { httpRecognizer } from './http';
import { mockRecognizer } from './mock';
import type { MachineRecognizer } from './types';

export * from './types';

function pickRecognizer(): MachineRecognizer {
  const url = import.meta.env.VITE_RECOGNITION_URL as string | undefined;
  return url ? httpRecognizer(url) : mockRecognizer;
}

export const recognizer: MachineRecognizer = pickRecognizer();
