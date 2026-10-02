/** The muscle-map drawing: every muscle is drawn where it should be, on both sides, for both bodies. */
import { describe, expect, it } from 'vitest';
import { MUSCLES } from '../../logic/muscles/catalog';
import { figure, musclesInView } from './figure';

describe('body map figure', () => {
  for (const body of ['male', 'female'] as const) {
    for (const view of ['front', 'back'] as const) {
      it(`${body} ${view}: draws exactly the muscles meant for this view, left and right`, () => {
        const f = figure(body, view);
        const expected = MUSCLES.filter((m) => m.views.includes(view)).map((m) => m.id).sort();
        expect([...musclesInView(view)].sort()).toEqual(expected);
        for (const id of expected) {
          const parts = f.parts.filter((p) => p.muscle === id);
          expect(parts.some((p) => p.side === 'left'), `${id} left`).toBe(true);
          expect(parts.some((p) => p.side === 'right'), `${id} right`).toBe(true);
        }
        for (const p of f.parts) expect(p.d).toMatch(/^M[\d.]+ [\d.]+(C[\d. -]+)+Z$/);
        expect(f.base.length).toBeGreaterThan(5);
      });
    }
  }

  it('front and back match: muscles seen from both sides are in both views', () => {
    for (const m of MUSCLES.filter((x) => x.views.length === 2)) {
      expect(musclesInView('front'), m.id).toContain(m.id);
      expect(musclesInView('back'), m.id).toContain(m.id);
    }
  });

  it('the female figure is the same drawing with different proportions (narrower waist, wider hips)', () => {
    const width = (d: string) => {
      const xs = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
      return Math.max(...xs) - Math.min(...xs);
    };
    const part = (body: 'male' | 'female', id: string) => figure(body, 'front').parts.find((p) => p.muscle === id && p.side === 'right')!.d;
    expect(width(part('female', 'obliques'))).toBeLessThan(width(part('male', 'obliques')));
    expect(figure('female', 'front').parts).toHaveLength(figure('male', 'front').parts.length);
    expect(figure('female', 'front').hair.length).toBeGreaterThan(0);
    expect(figure('male', 'front').hair).toHaveLength(0);
  });

  it('is built once per body and view', () => {
    expect(figure('male', 'back')).toBe(figure('male', 'back'));
  });
});
