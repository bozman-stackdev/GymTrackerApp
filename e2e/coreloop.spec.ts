import { expect, test } from '@playwright/test';

// The core loop: previous performance → challenge → set → result → reward → journey → next challenge. Sample data.
test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

const finishPushWith = async (page: import('@playwright/test').Page, reps: string[]) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  for (const r of reps) await page.getByRole('button', { name: `${r} reps`, exact: true }).click();
};

test('journey: mastered levels, the current challenge and what comes next', async ({ page }) => {
  await page.goto('/#/exercises/chest-press-machine');
  const journey = page.getByTestId('journey');
  await expect(journey.locator('.journey-level.current')).toContainText('50 kg × 8');
  await expect(journey.locator('.journey-level.current')).toContainText('Current challenge');
  await expect(journey.locator('.journey-level.mastered').last()).toContainText('45 kg × 12');
  await expect(journey.locator('.journey-level.mastered').last()).toContainText('Weight mastered');
  await expect(journey.locator('.journey-level.locked')).toHaveCount(2);
  await expect(journey).toContainText('every set at that level, 2 workouts in a row');
  await page.screenshot({ path: 'test-results/screens/16-journey.png', fullPage: true });
});

test('missed challenge: "NOT TODAY", never "failed"; next time: same target again; then back on track', async ({ page }) => {
  // Chest press challenge is 50 kg × 8. Do 7, 7, 6: a near miss.
  await finishPushWith(page, ['7', '7', '6']);
  const bar = page.getByTestId('last-set');
  await expect(page.getByTestId('reward')).toHaveText('NOT TODAY');
  await expect(bar).toContainText('Best 50 kg × 7 · target 50 kg × 8');
  await expect(bar).not.toHaveClass(/reward/); // calm, neutral styling
  await expect(page.locator('body')).not.toContainText(/fail/i);
  await page.screenshot({ path: 'test-results/screens/17-not-today.png' });

  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page.getByTestId('outcome').first()).toContainText('Not today · target 50 kg × 8 · next challenge adjusted');
  await expect(page.getByTestId('rewards')).not.toContainText(/[-−]\s?\d/); // nothing deducted

  // Next workout: the engine offers the same target again ("so close").
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /^Push/ }).click();
  await expect(page.getByTestId('challenge')).toContainText("Today's challenge · try again");
  await expect(page.getByTestId('challenge')).toContainText('50 kg × 8');
  await page.getByTestId('challenge').click();
  await expect(page.getByTestId('recommendation-reason')).toContainText('So close last time: 7 of 8');

  // Hit it: challenge + back on track + (first full set at 50 kg) personal best.
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('reward')).toHaveText('NEW PERSONAL BEST!');
  await expect(page.getByTestId('last-set')).toContainText('+90 XP'); // 25 challenge + 15 comeback + 50 PB
  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page.getByTestId('rewards')).toContainText('Back on track · Chest Press Machine');
  await expect(page.getByTestId('outcome').first()).toContainText('Back on track: 50 kg × 8 complete');
});

test('target hit: "TARGET HIT ✓" with the set and XP', async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.locator('.ex-chip', { hasText: 'Lateral Raise' }).click();
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('reward')).toHaveText('TARGET HIT');
  await expect(page.getByTestId('last-set')).toContainText(/8 kg × \d+ · \+25 XP/);
});

test('My gym: machines with settings and last weights; add one; it shows in the workout and remembers use', async ({ page }) => {
  await page.getByRole('link', { name: 'My Gym' }).click();
  const legPress = page.getByTestId('equipment-card').filter({ hasText: 'Life Fitness Leg Press' });
  await expect(legPress).toContainText('Seat 5, feet mid-platform');
  await expect(legPress).toContainText('Last used: 120 kg');
  await expect(legPress).toContainText('Previous session: 120 kg ×');
  await page.screenshot({ path: 'test-results/screens/18-my-gym.png', fullPage: true });

  // Add a second leg press at another gym.
  await page.getByRole('link', { name: 'Add equipment', exact: true }).click();
  await page.getByPlaceholder('e.g. Life Fitness Leg Press').fill('Hammer Strength Leg Press');
  await page.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByRole('button', { name: /Leg Press/ }).first().click();
  await page.getByPlaceholder('e.g. Anytime Fitness Leeds').fill('Work Gym');
  await page.getByPlaceholder('e.g. Seat 5, feet mid-platform').fill('Seat 3');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.gym-name', { hasText: 'Work Gym' })).toBeVisible();

  // In the workout: the machine line, with a picker now that there are two.
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /Legs/ }).click();
  await expect(page.getByTestId('equipment')).toContainText('Seat 5, feet mid-platform');
  await page.getByLabel('Equipment').selectOption({ label: 'Hammer Strength Leg Press (Work Gym)' });
  await expect(page.getByTestId('equipment')).toContainText('Seat 3');
  await page.getByLabel('Weight', { exact: true }).fill('90');
  await page.locator('.rep-btn.target').click();
  await page.getByRole('button', { name: 'Finish Session' }).click();

  await page.getByRole('link', { name: 'My Gym' }).click();
  await expect(page.getByTestId('equipment-card').filter({ hasText: 'Hammer Strength Leg Press' })).toContainText('Last used: 90 kg');
  // Next time the app picks the machine you used last.
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /Legs/ }).click();
  await expect(page.getByLabel('Equipment')).toHaveValue(/.+/);
  await expect(page.getByTestId('equipment')).toContainText('Seat 3');
});

test('scan suggests your own machine and starts on it', async ({ page }) => {
  await page.getByRole('link', { name: /Scan machine/ }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('photo-input').setInputFiles({ name: 'm.png', mimeType: 'image/png', buffer: png });
  const first = page.getByRole('radio').first();
  await expect(first).toContainText('Lat Pulldown');
  await expect(first).toContainText('Matrix Lat Pulldown');
  await page.getByRole('button', { name: /^Start Lat Pulldown/ }).click();
  await expect(page.getByTestId('equipment')).toContainText('Matrix Lat Pulldown');
});
