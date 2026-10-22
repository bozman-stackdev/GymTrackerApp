import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Freestyle Workout (no routine), the always-visible "+ Add" in the workout header, and removing an item added by mistake.
let dialogs: string[] = [];
test.beforeEach(async ({ page }) => {
  dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

const pick = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
const chips = (page: Page) => page.locator('.ex-strip .ex-chip:not(.add) .ex-chip-name');

test('Freestyle Workout: add as you go, remove a mistake, finish to history', async ({ page }) => {
  await page.getByRole('button', { name: 'Freestyle Workout' }).click();
  await expect(page).toHaveURL(/#\/workout\/add/);
  await pick(page, 'Chest Press Machine');
  await expect(page.locator('.workout .header')).toContainText('Freestyle Workout');
  await page.locator('.rep-btn.target').click();

  // "+ Add" in the header: always there.
  await page.getByRole('link', { name: 'Add to workout' }).click();
  await pick(page, 'Lat Pulldown');
  await expect(chips(page)).toHaveText(['Chest Press Machine', 'Lat Pulldown']);

  // Added by mistake, nothing logged: removed straight away, no question.
  await page.getByTestId('remove-entry').click();
  expect(dialogs).toEqual([]);
  await expect(chips(page)).toHaveText(['Chest Press Machine']);
  await expect(page.getByRole('link', { name: 'Add exercise', exact: true }).last()).toBeVisible(); // "what next?" state

  // Cardio the same way (existing timer flow), then removed: it has a running timer, so it asks first.
  await page.getByRole('link', { name: 'Add to workout' }).click();
  await page.getByRole('tab', { name: 'Cardio' }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name: 'Treadmill', exact: true }).click();
  await page.getByRole('button', { name: 'START' }).click();
  await page.getByTestId('remove-entry').click();
  expect(dialogs).toEqual(['Remove Treadmill and what you logged on it from this workout?']);
  await expect(chips(page)).toHaveText(['Chest Press Machine']);
  await expect(page.getByTestId('running-bar')).toHaveCount(0);

  // An exercise with a set: asks first, then removes.
  await page.getByRole('link', { name: 'Add to workout' }).click();
  await pick(page, 'Lat Pulldown');
  await page.locator('.rep-btn.target').click();
  await page.getByTestId('remove-entry').click();
  expect(dialogs.at(-1)).toBe('Remove Lat Pulldown and what you logged on it from this workout?');
  await expect(chips(page)).toHaveText(['Chest Press Machine']);

  // Interrupted: a reload resumes the same workout.
  await page.reload();
  await expect(page.locator('.workout .header')).toContainText('Freestyle Workout');
  await expect(chips(page)).toHaveText(['Chest Press Machine']);

  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page).toHaveURL(/#\/history\/.+/);
  await expect(page.locator('main')).toContainText('Freestyle Workout');
  await expect(page.locator('main')).toContainText('Chest Press Machine');
  await expect(page.locator('main')).not.toContainText('Lat Pulldown');
});

test('a routine workout works as before (and also has "+ Add" and Remove)', async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  await expect(page.locator('.workout .header')).toContainText('Push');
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Add to workout' })).toBeVisible();
});

test('header fits a small phone; accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Freestyle Workout' }).click();
  await pick(page, 'Chest Press Machine');
  const header = page.locator('.workout .header');
  for (const el of [header.getByRole('link', { name: 'Add to workout' }), header.getByRole('button', { name: 'Finish Session' })]) {
    await expect(el).toBeInViewport({ ratio: 1 });
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: 'test-results/screens/freestyle-se.png' });
});
