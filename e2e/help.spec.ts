import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The first-time guide, the Help centre, "?" help beside features, and one-time tips.
test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
});

const progress = (page: Page) => page.getByTestId('guide-progress');
const finishGuide = async (page: Page) => page.getByRole('button', { name: 'Skip' }).click();

test('first run: the guide - Next, Back, all 7 steps, Finish; never again on its own', async ({ page }) => {
  await page.getByRole('button', { name: 'Start my own' }).click();
  await expect(page).toHaveURL(/#\/guide/);
  await expect(progress(page)).toHaveText('Step 1 of 7');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/screens/guide-1.png' });

  const titles = ['Welcome', 'Your profile', 'Start a workout', 'Log a set', "Today's Challenge", 'Track your progress', 'Help any time'];
  for (let i = 1; i < 7; i++) {
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(progress(page)).toHaveText(`Step ${i + 1} of 7`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles[i]);
  }
  await expect(page.getByText("You don't need to add weight every session", { exact: false })).toHaveCount(0); // that's step 5
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Track your progress');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('main')).toContainText("You don't need to add weight every session");
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Train' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Train' })).toBeVisible();
  await expect(progress(page)).toHaveCount(0);
});

test('Skip from the first step; profile is optional; returning users never get the guide', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await finishGuide(page);
  await expect(page.getByTestId('sample-banner')).toBeVisible();
  await page.reload();
  await expect(progress(page)).toHaveCount(0);

  // "Set up my profile now" on step 2 (replayed): opens Profile, nothing required.
  await page.goto('/#/guide');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Set up my profile now' }).click();
  await expect(page).toHaveURL(/#\/profile/);
});

test('Help: from the header "?", search, open an article, replay the guide, back to where you were', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await finishGuide(page);

  // "?" in the header: help for this screen, in a sheet.
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Help: Workout history' }).click();
  const sheet = page.getByTestId('help-sheet');
  await expect(sheet).toContainText('What it does');
  await expect(sheet).toContainText('Edit sets fixes mistakes');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/#\/history$/);

  // Browse all help → search → open → Back returns to History.
  await page.getByRole('button', { name: 'Help: Workout history' }).click();
  await page.getByRole('link', { name: 'Browse all help' }).click();
  await expect(page).toHaveURL(/#\/help\?topic=history/);
  await expect(page.getByRole('button', { name: 'Workout history' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Search help').fill('missed');
  await expect(page.getByTestId('help-item').first()).toContainText('Add a missed workout');
  await page.getByRole('button', { name: 'Add a missed workout' }).click();
  await expect(page.locator('main')).toContainText('It earns no XP');
  await page.getByLabel('Search help').fill('zzzz');
  await expect(page.getByRole('status')).toContainText('Nothing found');
  await page.getByLabel('Search help').fill('');
  await page.screenshot({ path: 'test-results/screens/help-centre.png', fullPage: true });
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/#\/history$/);

  // Profile → Help centre / Replay the guide; finishing a replay goes back.
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('link', { name: 'Replay the guide' }).click();
  await expect(progress(page)).toHaveText('Step 1 of 7');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/#\/profile/);
  await page.getByRole('link', { name: 'Help centre' }).click();
  await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
});

test('"?" beside features: challenge, cardio timer, muscle map - and it never touches the workout', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await finishGuide(page);
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.locator('.rep-btn.target').click();
  const sets = page.getByTestId('sets-today').locator('.slot.done');
  await expect(sets).toHaveCount(1);
  await page.getByTestId('help-tip-challenge').click();
  await expect(page.getByTestId('help-sheet')).toContainText("Today's Challenge");
  await expect(page.getByTestId('help-sheet')).toContainText('no penalty');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('help-sheet')).toHaveCount(0);
  await expect(sets).toHaveCount(1); // logging untouched
  await expect(page.getByTestId('rest-timer')).toHaveAttribute('data-state', 'running');

  await page.getByRole('button', { name: 'How this screen works' }).click();
  await expect(page.getByTestId('help-sheet')).toContainText('Finish Session');
  await page.getByTestId('help-sheet').getByRole('button', { name: 'Close' }).click();

  // Cardio: timer-only flow, no speed/incline/distance to enter.
  await page.getByRole('link', { name: 'Add to workout' }).click();
  await page.getByRole('tab', { name: 'Cardio' }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name: 'Treadmill', exact: true }).click();
  await page.getByRole('button', { name: 'START' }).click();
  await page.getByTestId('help-tip-cardio').click();
  const cardio = page.getByTestId('help-sheet');
  await expect(cardio).toContainText('START');
  await expect(cardio).not.toContainText(/incline|speed|distance|calories/i);
  await cardio.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('activity')).toHaveAttribute('data-state', 'running'); // still running
  await page.getByRole('button', { name: 'STOP' }).click();
  await page.getByRole('button', { name: 'Finish Session' }).click();

  await page.getByRole('link', { name: 'Muscles', exact: true }).click();
  await page.getByTestId('help-tip-muscle-map').click();
  await expect(page.getByTestId('help-sheet')).toContainText('not a measurement of muscle size or growth');
});

test('first-use tips: one at a time, "Got it" is remembered, none while a cardio timer runs', async ({ page }) => {
  await page.getByRole('button', { name: 'Start my own' }).click();
  await finishGuide(page);
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByTestId('tip-history')).toBeVisible();
  await page.getByTestId('tip-history').getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('tip-history')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(page.getByTestId('tip-history')).toHaveCount(0);

  // Workout: the logging tip sits below the controls; never during a running timer.
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'Freestyle Workout' }).click();
  await page.getByRole('tab', { name: 'Cardio' }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name: 'Treadmill', exact: true }).click();
  await page.getByRole('button', { name: 'START' }).click();
  await page.getByRole('link', { name: 'Add to workout' }).click();
  await page.getByRole('button', { name: /^Chest Press/ }).first().click();
  await expect(page.getByTestId('tip-log')).toHaveCount(0); // treadmill still running
  await page.getByTestId('running-bar').getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('tip-log')).toBeVisible();
  await expect(page.locator('[data-testid^="tip-"]')).toHaveCount(1);
  const pad = (await page.locator('.rep-btn').last().boundingBox())!;
  const tip = (await page.getByTestId('tip-log').boundingBox())!;
  expect(tip.y).toBeGreaterThan(pad.y); // below the rep pad, never pushing it down
  await page.getByTestId('tip-log').getByRole('button', { name: 'More' }).click();
  await expect(page.getByTestId('help-sheet')).toContainText('Log a set');
  await page.getByTestId('help-sheet').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('tip-log').getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByTestId('tip-log')).toHaveCount(0);
});

test('returning user (restored backup): no guide, no tips', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await finishGuide(page);
  // Old data (no guide state) as an existing user would have it.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('gymtracker') && localStorage.getItem(k)?.includes('"sessions"'))!;
    const d = JSON.parse(localStorage.getItem(key)!);
    delete d.guide;
    localStorage.setItem(key, JSON.stringify(d));
  });
  await page.reload();
  await expect(progress(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(page.getByTestId('tip-history')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Help: Workout history' })).toBeVisible(); // help is still there
});

test('accessible and fits a small phone: guide, help centre, help sheet', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  }
  await expect(page.getByRole('button', { name: 'Next' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/screens/guide-se.png' });
  await finishGuide(page);
  await page.goto('/#/help');
  await page.getByRole('button', { name: 'Log a set' }).click();
  let a = await new AxeBuilder({ page }).analyze();
  expect(a.violations.map((v) => v.id)).toEqual([]);
  await page.goto('/#/history');
  await page.getByRole('button', { name: 'Help: Workout history' }).click();
  a = await new AxeBuilder({ page }).analyze();
  expect(a.violations.map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/screens/help-sheet-se.png' });
});
