import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
});

test('first run: "Start my own" gives starter routines and no history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gym Tracker' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/0-welcome.png' });
  await page.getByRole('button', { name: 'Start my own' }).click();

  await expect(page.getByRole('heading', { name: 'Train' })).toBeVisible();
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Push/ })).toBeVisible();
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByText('No workouts yet.')).toBeVisible();

  // A brand-new user's first set: no challenge yet, pick a weight, one tap.
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /Push/ }).click();
  await expect(page.getByTestId('recommendation')).toContainText('First time');
  await page.getByLabel('Weight', { exact: true }).fill('40');
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveText(['40×8']);

  // Reload: still their data, no welcome screen.
  await page.reload();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveCount(1);
});

test('sample data can be swapped for your own from the banner', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await expect(page.getByRole('heading', { name: 'Hi Alex' })).toBeVisible();
  await page.getByTestId('sample-banner').getByRole('button', { name: 'Start my own' }).click();
  await expect(page.getByRole('heading', { name: 'Train' })).toBeVisible();
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);
});

test('backup: export, then restore it on a "new phone" from the welcome screen', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await page.getByRole('link', { name: 'Profile' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^gym-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();

  // "New phone": empty storage.
  const fresh = await context.newPage();
  fresh.on('dialog', (d) => d.accept());
  await fresh.goto('/');
  await fresh.evaluate(() => localStorage.clear());
  await fresh.reload();
  await fresh.getByTestId('restore-input').setInputFiles(path);
  await expect(fresh.getByRole('heading', { name: 'Hi Alex' })).toBeVisible();
  await fresh.getByRole('link', { name: 'History' }).click();
  await expect(fresh.getByTestId('history-item')).toHaveCount(16);
});

test('a wrong backup file is refused with a clear message, nothing changes', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('restore-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
  await expect(page.getByRole('alert')).toContainText('unsupported version');
  await expect(page.getByRole('heading', { name: 'Gym Tracker' })).toBeVisible();
});

test('corrupted saved data: welcome screen explains, and a copy is kept', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gymtracker:data', '{broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText("couldn't be read");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((k) => k.startsWith('gymtracker:data:backup-'))).toBe(true);
});

test('two tabs stay in sync instead of overwriting each other', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start my own' }).click();
  const other = await context.newPage();
  await other.goto('/#/profile');
  await other.getByRole('textbox', { name: 'Name' }).fill('Sam');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hi Sam' })).toBeVisible(); // first tab picked it up
});

test('storage failure shows a warning instead of silently losing data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start my own' }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: /Push/ }).click();
  await expect(page.getByRole('alert')).toContainText('Not saved');
});
