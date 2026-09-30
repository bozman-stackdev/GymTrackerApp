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

test('open app -> routine -> set logged in 2 taps; auto-advance, undo, reload, finish', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Hi Alex' })).toBeVisible();
  await expect(page.locator('.next-up')).toContainText('Pull'); // done longest ago
  await page.screenshot({ path: 'test-results/screens/1-home.png' });

  // Tap 1: pick the routine.
  await page.getByRole('button', { name: /^Push/ }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByRole('heading', { name: 'Chest Press Machine' })).toBeVisible();
  await expect(page.getByTestId('last-time')).toHaveText(/^Last session: \d+ kg × /);
  const weight = await page.getByLabel('Weight', { exact: true }).inputValue();
  await page.screenshot({ path: 'test-results/screens/2-workout.png' });
  await expectNoHorizontalScroll(page);

  // Tap 2: the highlighted rep target. That's the whole set.
  const target = await page.locator('.rep-btn.target').innerText();
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveText([`${weight}×${target}`]);
  await expect(page.getByTestId('last-set')).toContainText(`${weight} kg × ${target}`);

  // A different rep count is still one tap; weight carried over.
  await page.getByRole('button', { name: `${Number(target) - 1} reps` }).click();
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue(weight);

  // Reload mid-workout: nothing is lost, and the last-set bar is still there.
  await page.reload();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveCount(2);
  await expect(page.getByTestId('last-set')).toBeVisible();

  // Undo, redo, then the 3rd set moves on to the next exercise by itself.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveCount(1);
  await page.locator('.rep-btn.target').click();
  await page.locator('.rep-btn.target').click();
  await expect(page.getByRole('heading', { name: 'Incline Dumbbell Press' })).toBeVisible();
  await expect(page.locator('.ex-chip.done')).toContainText('Chest Press Machine');
  await page.screenshot({ path: 'test-results/screens/3-auto-advanced.png' });

  // Undo from the next exercise goes back to the one it belongs to.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Chest Press Machine' })).toBeVisible();
  await page.locator('.rep-btn.target').click();
  await expect(page.getByRole('heading', { name: 'Incline Dumbbell Press' })).toBeVisible();

  // Quick weight chip: after nudging the weight, one tap restores the last set's weight.
  const inclineWeight = await page.getByLabel('Weight', { exact: true }).inputValue();
  await page.locator('.rep-btn.target').click();
  await page.getByRole('button', { name: 'More Weight' }).click();
  await expect(page.getByLabel('Weight', { exact: true })).not.toHaveValue(inclineWeight);
  await page.getByRole('button', { name: /last set/ }).click();
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue(inclineWeight);

  // Jump between exercises with the strip.
  await page.locator('.ex-chip', { hasText: 'Lateral Raise' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Lateral Raise' })).toBeVisible();

  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page).toHaveURL(/#\/history\/.+/);
  await expect(page.getByText(`${weight} kg ×`).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/4-summary.png' });

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.locator('.list-item').first()).toContainText('Push');
  await expect(page.locator('.list-item').first()).toContainText('4 sets'); // 3 chest + 1 incline
  await page.screenshot({ path: 'test-results/screens/5-history.png' });
});

test('finishing every exercise shows a one-tap Finish, and reopening the app resumes the workout', async ({ page }) => {
  await page.getByRole('button', { name: /Pull/ }).click();
  await page.goto('/'); // "reopen" the app on the home screen
  await expect(page).toHaveURL(/#\/workout$/);

  for (let i = 0; i < 4 * 3; i++) {
    const pad = page.locator('.rep-btn.target');
    // First-time exercises have no weight yet: set one.
    const w = page.getByLabel('Weight', { exact: true });
    if ((await w.count()) && (await w.inputValue()) === '0') await w.fill('20');
    await pad.click();
  }
  await expect(page.locator('.ex-chip.done')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/screens/3b-all-done.png' });
  await page.getByRole('button', { name: '✓ Finish workout' }).click();
  await expect(page).toHaveURL(/#\/history\/.+/);
  await expect(page.locator('.list-item')).toHaveCount(4);
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

  await page.getByRole('button', { name: /Leg day B/ }).click();
  await expect(page.getByTestId('sets-today').locator('.slot')).toHaveCount(4);
  // First time: no weight yet, so reps are locked until one is set.
  await expect(page.getByText('Set the weight first')).toBeVisible();
  await expect(page.locator('.rep-btn.target')).toBeDisabled();
  await page.getByLabel('Weight', { exact: true }).fill('80');
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveText(['80×8']);
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

test.describe('small phone (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('rep buttons are reachable without scrolling, even after a set is logged', async ({ page }) => {
    await page.getByRole('button', { name: /^Push/ }).click();
    await expect(page.locator('.rep-btn.target')).toBeInViewport();
    await page.locator('.rep-btn.target').click();
    await page.locator('.rep-btn.target').click();
    await page.locator('.rep-btn.target').click(); // auto-advance: last-set bar now showing
    await expect(page.getByTestId('last-set')).toBeVisible();
    await expect(page.locator('.rep-btn').last()).toBeInViewport({ ratio: 1 });
    // Worst case: weight changed, so shortcut chips appear under the weight.
    await page.getByRole('button', { name: 'More Weight' }).click();
    await expect(page.locator('.quick-weights')).toBeVisible();
    await expect(page.locator('.rep-btn').last()).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: 'test-results/screens/10-small-phone.png' });
  });
});
