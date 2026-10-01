import { expect, test } from '@playwright/test';

// Runs against the production build, where the service worker is active.
test.use({ baseURL: 'http://localhost:4173', serviceWorkers: 'allow' });

test('works with no internet connection after the first visit, and is installable', async ({ page, context }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  // Wait until the service worker has cached the app and controls the page.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  expect(manifest).toMatchObject({ name: 'Gym Tracker', display: 'standalone' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveCount(1);

  // Photo scan still works offline (demo recognizer runs on the phone).
  await page.goto('/#/scan');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('photo-input').setInputFiles({ name: 'm.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('heading', { name: 'What are you using?' })).toBeVisible();
  await context.setOffline(false);
});

test('built without a backend (as published until Supabase is set up): no account features anywhere', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start my own' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in to my account' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start my own' }).click();
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create account' })).toHaveCount(0);
  await page.goto('/#/account?mode=signup');
  await expect(page).toHaveURL(/#\/profile$/);
  // The account code isn't even downloaded.
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.endsWith('.js')));
  expect(scripts.some((s) => /supabase|memory/i.test(s))).toBe(false);
});
