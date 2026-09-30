import { expect, test, type Page } from '@playwright/test';

// Every test starts from the sample data (fresh browser context = empty localStorage).
test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // confirm() prompts
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('log a workout with one tap per set, survive a reload, and save it to history', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Hi Alex' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/1-home.png' });
  await page.getByRole('button', { name: /^Push/ }).click();

  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByRole('heading', { name: 'Chest Press Machine' })).toBeVisible();
  await expect(page.getByTestId('last-time')).toContainText('kg ×');
  await expect(page.getByTestId('recommendation')).toBeVisible();
  const plannedWeight = await page.getByLabel('Weight', { exact: true }).inputValue();
  await page.screenshot({ path: 'test-results/screens/2-workout.png' });
  await expectNoHorizontalScroll(page);

  // Set 1: accept the pre-fill. Set 2: one rep fewer.
  await page.getByRole('button', { name: '✓ Done' }).click();
  await expect(page.getByTestId('set-counter')).toHaveText('Set 2 of 3');
  await page.getByRole('button', { name: 'Less Reps' }).click();
  await page.getByRole('button', { name: '✓ Done' }).click();

  // Reload mid-workout: nothing is lost.
  await page.reload();
  await expect(page.getByTestId('sets-today').locator('.set-pill')).toHaveCount(2);

  // Undo, then redo, then finish the exercise.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('sets-today').locator('.set-pill')).toHaveCount(1);
  await page.getByRole('button', { name: '✓ Done' }).click();
  await page.getByRole('button', { name: '✓ Done' }).click();
  await expect(page.getByTestId('set-counter')).toHaveText('3 of 3 sets done');
  await page.screenshot({ path: 'test-results/screens/3-sets-done.png' });
  await page.getByRole('button', { name: 'Next exercise →' }).click();
  await expect(page.getByRole('heading', { name: 'Incline Dumbbell Press' })).toBeVisible();
  await page.getByRole('button', { name: '✓ Done' }).click();

  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(/#\/history\/.+/);
  await expect(page.getByText('Chest Press Machine')).toBeVisible();
  await expect(page.getByText(`${plannedWeight} kg ×`).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/4-summary.png' });

  // It is now "last time" for the next workout, and the newest item in history.
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.locator('.list-item').first()).toContainText('Push');
  await expect(page.locator('.list-item').first()).toContainText('4 sets'); // 3 chest (after undo) + 1 incline
  await page.screenshot({ path: 'test-results/screens/5-history.png' });
});

test('empty workout + add exercise by photo (mock recognition)', async ({ page }) => {
  await page.getByRole('button', { name: 'Empty workout' }).click();
  await expect(page).toHaveURL(/#\/workout\/add$/);
  await page.getByRole('link', { name: /Photograph a machine/ }).click();

  // A tiny valid PNG stands in for the camera.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('photo-input').setInputFiles({ name: 'machine.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('Which machine is this?')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/6-scan.png' });
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: /Leg Press/ }).click();

  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByRole('heading', { name: 'Leg Press' })).toBeVisible();

  // The photo was saved with the exercise.
  await page.goto('/#/exercises/leg-press');
  await expect(page.getByRole('img', { name: /Your photo of Leg Press/ })).toBeVisible();
});

test('exercise progress page shows recommendation, chart and history', async ({ page }) => {
  await page.getByRole('link', { name: 'Exercises' }).click();
  await page.getByPlaceholder('Search exercises').fill('shoulder press');
  await page.getByRole('button', { name: /Shoulder Press Machine/ }).click();
  await expect(page.getByTestId('recommendation')).toContainText('Drop to');
  await expect(page.locator('svg.chart')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/7-exercise.png', fullPage: true });
  await expectNoHorizontalScroll(page);

  await page.goto('/#/exercises/face-pull');
  await expect(page.getByTestId('recommendation')).toContainText('Match last time');
});

test('create an exercise and a routine, then start it', async ({ page }) => {
  await page.goto('/#/exercises/new');
  await page.getByPlaceholder('e.g. Hack Squat').fill('Hack Squat');
  await page.getByRole('button', { name: 'legs' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Hack Squat' })).toBeVisible();
  await expect(page.getByTestId('recommendation')).toContainText('First time');

  await page.goto('/#/routines/new');
  await page.getByPlaceholder('e.g. Upper body').fill('Leg day B');
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByRole('button', { name: /Hack Squat/ }).click();
  await page.getByRole('button', { name: 'More sets' }).click();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Save routine' }).click();

  await page.getByRole('button', { name: /^Leg day B/ }).click();
  await expect(page.getByTestId('set-counter')).toHaveText('Set 1 of 4');
  // First time: no weight pre-filled, the user sets it once.
  await page.getByLabel('Weight', { exact: true }).fill('80');
  await page.getByRole('button', { name: '✓ Done' }).click();
  await expect(page.getByTestId('sets-today')).toContainText('80 kg × 8');
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('80'); // carried to the next set
});

test('profile saves and persists', async ({ page }) => {
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByLabel('Weight (kg)').fill('82.5');
  await page.getByRole('button', { name: 'Build muscle' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/BMI 26\.0/)).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/8-profile.png' });
  await expectNoHorizontalScroll(page);
  await page.reload();
  await expect(page.getByLabel('Weight (kg)')).toHaveValue('82.5');
});
