/**
 * Adapter for a real recognition service (not used until VITE_RECOGNITION_URL is set).
 *
 * Point it at YOUR OWN backend, never directly at an AI provider: API keys must not be shipped in a web app.
 * The backend can call any vision model and answer in this shape:
 *
 *   POST <url>   multipart/form-data: photo=<jpeg>, exercises=<JSON array of exercise names>
 *   200 OK       { "candidates": [ { "name": "Lat Pulldown", "confidence": 0.82 }, ... ] }
 *
 * Names are matched to the user's exercises (case-insensitive); unknown names are dropped.
 */
import { resizeImage } from '../image';
import { MAX_SUGGESTIONS, type MachineRecognizer } from './types';

interface RemoteResponse {
  candidates: { name: string; confidence: number }[];
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
    async identify({ photo, exercises }) {
      const form = new FormData();
      form.append('photo', await prepare(photo), 'photo.jpg');
      form.append('exercises', JSON.stringify(exercises.map((e) => e.name)));

      const res = await fetchImpl(url, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Recognition failed: ${res.status}`);
      const body = (await res.json()) as RemoteResponse;

      const byName = new Map(exercises.map((e) => [e.name.toLowerCase(), e.id]));
      const suggestions = body.candidates
        .map((c) => ({ exerciseId: byName.get(c.name.toLowerCase()), confidence: c.confidence }))
        .filter((s): s is { exerciseId: string; confidence: number } => !!s.exerciseId)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_SUGGESTIONS);
      return { source: 'remote', suggestions };
    },
  };
}
