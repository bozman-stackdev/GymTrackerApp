import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

test('fix a mis-tapped set during the workout (tap the set box)', async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.getByRole('button', { name: '5 reps', exact: true }).click(); // oops, meant 8
  await page.getByRole('button', { name: /^Edit set 1:/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Chest Press Machine · set 1');
  await sheet.getByRole('button', { name: 'More Reps' }).click();
  await sheet.getByRole('button', { name: 'More Reps' }).click();
  await sheet.getByRole('button', { name: 'More Reps' }).click();
  await page.screenshot({ path: 'test-results/screens/19-edit-set.png' });
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveText(['50×8']);
  await expect(page.getByTestId('challenge')).toContainText('✓ Challenge complete'); // result follows the fix

  // Delete a set.
  await page.getByRole('button', { name: /^Edit set 1:/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete this set' }).click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveCount(0);
});

test('fix a finished workout from its summary; rewards follow', async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '5 reps', exact: true }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByTestId('rewards')).not.toContainText('Challenge complete');

  await page.getByRole('button', { name: 'Edit sets' }).click();
  await page.getByRole('button', { name: 'Edit Chest Press Machine set 1' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Reps' }).fill('8');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('rewards')).toContainText('Challenge complete · Chest Press Machine');
  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(page.getByText('50 kg × 8 · 5 · 5')).toBeVisible();
});

test('pounds: switch in Profile; weights show, step and log in lb (stored in kg)', async ({ page }) => {
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await expect(page.getByLabel('Weight (lb)')).toHaveValue('176.4'); // 80 kg
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /^Push/ }).click();
  await expect(page.getByTestId('last-time')).toContainText('99.2 lb × 12'); // 45 kg
  await expect(page.getByTestId('challenge')).toContainText('110 lb × 8'); // 45 kg + 10 lb step, snapped
  await expect(page.getByText('Weight (lb)')).toBeVisible();
  await page.getByLabel('Weight', { exact: true }).fill('110');
  await page.getByRole('button', { name: 'More Weight' }).click(); // +10 lb
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('120');
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveText(['120×8']);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gymtracker:data')!).activeWorkout.session.entries[0].sets[0].weightKg);
  expect(stored).toBeCloseTo(120 / 2.20462, 2);
});

test('feedback link carries app/device basics only; backup reminder appears and can be snoozed', async ({ page }) => {
  await page.getByRole('link', { name: 'Profile' }).click();
  const href = await page.getByTestId('feedback').getAttribute('href');
  expect(href).toContain('github.com/bozman-stackdev/GymTrackerApp/issues/new');
  expect(decodeURIComponent(href!)).toContain('App version:');
  expect(decodeURIComponent(href!)).not.toContain('Chest Press'); // no workout data

  // A real user (not sample) with old, un-backed-up workouts.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('gymtracker:data')!);
    delete d.isSample;
    localStorage.setItem('gymtracker:data', JSON.stringify(d));
  });
  await page.goto('/');
  await page.reload();
  const reminder = page.getByTestId('backup-reminder');
  await expect(reminder).toBeVisible();
  await reminder.getByRole('button', { name: 'Later' }).click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0); // snooze is saved
});
