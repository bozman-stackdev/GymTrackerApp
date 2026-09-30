/**
 * Adapter for a real recognition service (not used until VITE_RECOGNITION_URL is set).
 *
 * Point it at YOUR OWN backend, never directly at an AI provider: API keys must not be shipped in a web app.
 * The backend can call any vision model and answer in this shape:
 *
 *   POST <url>   multipart/form-data: photo=<jpeg>, exercises=<JSON array of exercise names>
 *   200 OK       { "candidates": [ { "name": "Lat Pulldown", "confidence": 0.82 }, ... ] }
 *
 * Names are matched to the user's exercises, or to the user's own machines (My gym), case-insensitive;
 * unknown names are dropped. Optional "brand"/"model" in the response pre-fill "Add to My gym".
 */
import { resizeImage } from '../image';
import { MAX_SUGGESTIONS, type MachineRecognizer } from './types';

interface RemoteResponse {
  candidates: { name: string; confidence: number }[];
  brand?: string;
  model?: string;
}

interface HttpOptions {
  fetchImpl?: typeof fetch;
  /** Prepares the photo for upload. Default: shrink to 1024 px JPEG (phone photos are several MB). */
  prepare?: (photo: Blob) => Promise<Blob>;
}

export function httpRecognizer(
  url: string,
  { fetchImpl = fetch, prepare = (p) => resizeImage(p, 1024) }: HttpOptions = {},
): MachineRecognizer {
  return {
    async identify({ photo, exercises, equipment = [] }) {
      const form = new FormData();
      form.append('photo', await prepare(photo), 'photo.jpg');
      form.append('exercises', JSON.stringify(exercises.map((e) => e.name)));

      const res = await fetchImpl(url, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Recognition failed: ${res.status}`);
      const body = (await res.json()) as RemoteResponse;

      const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e.id]));
      const machines = new Map(equipment.map((e) => [e.name.toLowerCase(), e]));
      const suggestions = body.candidates
        .map((c) => {
          const machine = machines.get(c.name.toLowerCase());
          return machine
            ? { exerciseId: machine.exerciseIds[0], equipmentId: machine.id, confidence: c.confidence }
            : { exerciseId: byName.get(c.name.toLowerCase()), confidence: c.confidence };
        })
        .filter((s): s is { exerciseId: string; confidence: number; equipmentId?: string } => !!s.exerciseId)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_SUGGESTIONS);
      return { source: 'remote', suggestions, detected: body.brand || body.model ? { brand: body.brand, model: body.model } : undefined };
    },
  };
}
