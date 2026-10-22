/** Help content and first-time guide state. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completeGuide, dismissTip, guidePending, tipActive, withGuidePending } from '../data/guide';
import { createSampleData, createStarterData } from '../data/seed';
import { parseAppData } from '../data/validate';
import { GAME_CONFIG } from '../logic/game/config';
import { HELP_ARTICLES, HELP_CATEGORIES, helpArticle, searchHelp } from './content';
import { GUIDE_STEPS } from './guide';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('help content', () => {
  it('every article answers what / how / what happens, in a known category, with a unique id', () => {
    expect(new Set(HELP_ARTICLES.map((a) => a.id)).size).toBe(HELP_ARTICLES.length);
    for (const a of HELP_ARTICLES) {
      expect(HELP_CATEGORIES).toContain(a.category);
      expect(a.what.length).toBeGreaterThan(10);
      expect(a.how.length).toBeGreaterThan(10);
      expect(a.result.length).toBeGreaterThan(10);
    }
    for (const c of HELP_CATEGORIES) expect(HELP_ARTICLES.some((a) => a.category === c)).toBe(true);
  });

  it('every "?" in the app points at a real article', () => {
    const used = sourceFiles(join(__dirname, '..')).flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return [...text.matchAll(/\b(?:help|topic)="([a-z-]+)"/g)].map((m) => m[1]);
    });
    expect(used.length).toBeGreaterThan(10);
    for (const id of used) expect(helpArticle(id), id).toBeDefined();
  });

  it('numbers come from the game config', () => {
    expect(helpArticle('challenge')!.result).toContain(`+${GAME_CONFIG.xp.challenge} XP`);
    expect(helpArticle('cardio')!.result).toContain(`+${GAME_CONFIG.xp.cardio} XP`);
    expect(helpArticle('leaderboard')!.result).toContain(`${GAME_CONFIG.leaderboard.maxDaysPerWeek} training days`);
  });

  it('cardio help never asks for speed, incline, distance or calories', () => {
    const a = helpArticle('cardio')!;
    expect(`${a.what} ${a.how} ${a.result}`).not.toMatch(/speed|incline|distance|calorie/i);
  });

  it('muscle map help says it is not a measure of growth', () => {
    expect(helpArticle('muscle-map')!.result).toMatch(/not a measurement of muscle size or growth/);
  });

  it('search: title, keywords and text; all words must match; title hits first', () => {
    expect(searchHelp('')).toHaveLength(HELP_ARTICLES.length);
    expect(searchHelp('missed')[0].id).toBe('missed-workout');
    expect(searchHelp('TREADMILL').map((a) => a.id)).toContain('cardio');
    expect(searchHelp('rest timer')[0].id).toBe('rest-timer');
    expect(searchHelp('qwertyuiop')).toEqual([]);
  });

  it('the guide has the seven steps', () => {
    expect(GUIDE_STEPS.map((s) => s.title)).toEqual(['Welcome', 'Your profile', 'Start a workout', 'Log a set', "Today's Challenge", 'Track your progress', 'Help any time']);
  });
});

describe('guide and tips state', () => {
  const now = new Date('2026-10-22T10:00:00Z');

  it('new users get the guide once; finishing or skipping ends it; existing data never gets it', () => {
    const fresh = withGuidePending(createStarterData());
    expect(guidePending(fresh)).toBe(true);
    const done = completeGuide(fresh, now);
    expect(guidePending(done)).toBe(false);
    expect(done.guide).toEqual({ doneAt: now.toISOString() });
    expect(guidePending(createSampleData())).toBe(false); // e.g. a restored backup
    // Nothing else changes.
    expect({ ...done, guide: undefined }).toEqual({ ...fresh, guide: undefined });
  });

  it('tips: only after the guide, only for new users, gone once dismissed', () => {
    const fresh = withGuidePending(createStarterData());
    expect(tipActive(fresh, 'history')).toBe(false); // not during the guide
    const done = completeGuide(fresh, now);
    expect(tipActive(done, 'history')).toBe(true);
    const dismissed = dismissTip(done, 'history');
    expect(tipActive(dismissed, 'history')).toBe(false);
    expect(tipActive(dismissed, 'log')).toBe(true);
    expect(dismissTip(dismissed, 'history')).toBe(dismissed);
    expect(tipActive(createStarterData(), 'history')).toBe(false); // long-time user
  });

  it('kept through save/reload; an odd value is dropped without rejecting the data', () => {
    const d = dismissTip(completeGuide(withGuidePending(createStarterData()), now), 'log');
    expect(parseAppData(JSON.parse(JSON.stringify(d))).guide).toEqual(d.guide);
    const odd = JSON.parse(JSON.stringify(d));
    odd.guide = { tips: 'log' };
    const parsed = parseAppData(odd);
    expect(parsed.guide).toBeUndefined();
    expect(parsed.routines).toHaveLength(d.routines.length);
  });
});
