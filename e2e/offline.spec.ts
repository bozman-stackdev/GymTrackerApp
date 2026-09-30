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
