import { describe, expect, it } from 'vitest';
import { SAMPLE_EQUIPMENT, SAMPLE_EXERCISES } from '../../data/seed';
import { httpRecognizer } from './http';
import { mockRecognizer } from './mock';
import { MAX_SUGGESTIONS } from './types';

const photoA = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
const photoB = new Blob([new Uint8Array([9, 9, 9, 9, 9, 9, 9])], { type: 'image/jpeg' });
const exercises = SAMPLE_EXERCISES;

describe('demo recognizer', () => {
  it('returns a few known machine/cable exercises, best first, marked as demo', async () => {
    const res = await mockRecognizer.identify({ photo: photoA, exercises });
    expect(res.source).toBe('demo');
    expect(res.suggestions).toHaveLength(MAX_SUGGESTIONS);
    for (const s of res.suggestions) {
      const ex = exercises.find((e) => e.id === s.exerciseId)!;
      expect(['machine', 'cable']).toContain(ex.equipment);
    }
    const conf = res.suggestions.map((s) => s.confidence);
    expect([...conf].sort((a, b) => b - a)).toEqual(conf);
  });

  it('gives the same suggestions for the same photo, and can differ for another', async () => {
    const a1 = await mockRecognizer.identify({ photo: photoA, exercises });
    const a2 = await mockRecognizer.identify({ photo: photoA, exercises });
    const b = await mockRecognizer.identify({ photo: photoB, exercises });
    expect(a2).toEqual(a1);
    expect(b.suggestions.map((s) => s.exerciseId)).not.toEqual(a1.suggestions.map((s) => s.exerciseId));
  });

  it('puts what the user is likely doing first, ignoring unknown ids, without duplicates', async () => {
    const res = await mockRecognizer.identify({ photo: photoA, exercises, likelyExerciseIds: ['nope', 'lat-pulldown', 'db-curl'] });
    const ids = res.suggestions.map((s) => s.exerciseId);
    expect(ids.slice(0, 2)).toEqual(['lat-pulldown', 'db-curl']);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('equipment-aware recognition (My gym)', () => {
  it('demo: suggests your own machine for a suggested exercise', async () => {
    const res = await mockRecognizer.identify({ photo: photoA, exercises, likelyExerciseIds: ['leg-press'], equipment: SAMPLE_EQUIPMENT });
    expect(res.suggestions[0]).toMatchObject({ exerciseId: 'leg-press', equipmentId: 'eq-leg-press' });
  });

  it('remote: a machine name from your library maps to that machine and its exercise; brand/model are passed on', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      candidates: [{ name: 'Life Fitness Leg Press', confidence: 0.9 }], brand: 'Life Fitness', model: 'Signature',
    }))) as unknown as typeof fetch;
    const res = await httpRecognizer('https://example.test', { prepare: async (p) => p, fetchImpl }).identify({ photo: photoA, exercises, equipment: SAMPLE_EQUIPMENT });
    expect(res.suggestions).toEqual([{ exerciseId: 'leg-press', equipmentId: 'eq-leg-press', confidence: 0.9 }]);
    expect(res.detected).toEqual({ brand: 'Life Fitness', model: 'Signature' });
  });
});

describe('http recognizer (future real service)', () => {
  const reply = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const passThrough = async (p: Blob) => p;

  it('maps returned names onto the user\'s exercises, best first, dropping unknown names', async () => {
    const r = httpRecognizer('https://example.test/recognize', {
      prepare: passThrough,
      fetchImpl: reply({ candidates: [
        { name: 'seated cable row', confidence: 0.3 },
        { name: 'Lat Pulldown', confidence: 0.8 },
        { name: 'Unicorn Machine', confidence: 0.9 },
      ] }),
    });
    const res = await r.identify({ photo: photoA, exercises });
    expect(res).toEqual({
      source: 'remote',
      suggestions: [{ exerciseId: 'lat-pulldown', confidence: 0.8 }, { exerciseId: 'seated-cable-row', confidence: 0.3 }],
    });
  });

  it('sends the photo and exercise names', async () => {
    let sent: FormData | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = init.body as FormData;
      return new Response(JSON.stringify({ candidates: [] }));
    }) as unknown as typeof fetch;
    await httpRecognizer('https://example.test/recognize', { prepare: passThrough, fetchImpl }).identify({ photo: photoA, exercises });
    expect(sent?.get('photo')).toBeInstanceOf(Blob);
    expect(JSON.parse(sent?.get('exercises') as string)).toContain('Lat Pulldown');
  });

  it('throws on a server error so the UI can fall back to manual choice', async () => {
    const r = httpRecognizer('https://example.test/recognize', { prepare: passThrough, fetchImpl: reply({}, 500) });
    await expect(r.identify({ photo: photoA, exercises })).rejects.toThrow('500');
  });
});
