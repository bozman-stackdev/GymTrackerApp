/** Day 2: cardio, warm-ups and cool-downs in real workouts, mixed with strength (sample data). */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

const done = (page: Page) => page.getByTestId('sets-today').locator('.slot.done');

async function addActivity(page: Page, kind: 'Cardio' | 'Warm-up' | 'Cool-down', name: string) {
  await page.locator('.add-activity-row a', { hasText: kind }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('activity').getByRole('heading', { name })).toBeVisible();
}

test('warm-up sets + strength: warm-ups never change the challenge, the sets or the rewards', async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  const challenge = (await page.getByTestId('challenge').textContent())!;

  await page.getByRole('button', { name: 'Warm-up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Warm-up', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Warm-up set: tap reps')).toBeVisible();
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('25'); // about half of 50 kg
  await page.getByRole('button', { name: '10 reps', exact: true }).click();
  await page.getByLabel('Weight', { exact: true }).fill('35');
  await page.getByRole('button', { name: '6 reps', exact: true }).click();
  await expect(page.getByTestId('warmup-sets').locator('.slot')).toHaveText(['25×10', '35×6']);
  await expect(done(page)).toHaveCount(0); // not working sets
  await expect(page.getByTestId('challenge')).toHaveText(challenge); // unchanged
  await expect(page.locator('.ex-chip', { hasText: 'warm-up' })).toHaveCount(0); // no extra strip item
  await page.screenshot({ path: 'test-results/screens/cardio-warmup-sets.png' });

  // Undo the last warm-up set; back to working sets at the working weight.
  await page.getByTestId('warmup-sets').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('warmup-sets').locator('.slot')).toHaveText(['25×10']);
  await page.getByRole('button', { name: 'Warm-up', exact: true }).click();
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('50');
  await page.locator('.rep-btn.target').click();
  await expect(done(page)).toHaveCount(1);
  await expect(page.getByTestId('challenge')).toContainText('Challenge complete');

  // Survives a reload.
  await page.reload();
  await expect(page.getByTestId('warmup-sets').locator('.slot')).toHaveText(['25×10']);

  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page.getByTestId('rewards')).toContainText('Challenge complete · Chest Press Machine');
  await expect(page.getByTestId('activity-item')).toHaveCount(1);
  await expect(page.getByTestId('activity-item')).toContainText('Chest Press Machine warm-up');
  await expect(page.getByTestId('activity-item')).toContainText('25 kg × 10');
  await expect(page.getByTestId('rewards')).not.toContainText('Warm-up'); // unplanned warm-up sets: no XP
});

test('strength + cardio (twice) + cool-down: last session, gentle hint, history and Profile stats', async ({ page }) => {
  await page.getByRole('button', { name: 'Empty workout' }).click();
  await page.getByRole('button', { name: /Cable Face Pull/ }).click();
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click();
  await page.getByRole('button', { name: 'Finish Exercise' }).click();
  await expect(page.getByTestId('between')).toHaveText(/^Exercise done/);

  await addActivity(page, 'Cardio', 'Treadmill');
  const a = page.getByTestId('activity');
  await expect(a).toContainText('Cardio');
  await expect(page.getByTestId('last-time')).toContainText('20 min · 6.5 km/h · 5% incline');
  await expect(page.getByTestId('cardio-suggestion')).toHaveText('Try 21 minutes today');
  await expect(a.getByRole('textbox', { name: 'Minutes' })).toHaveValue('20'); // prefilled with last time, not the hint
  await expect(a.getByLabel('Incline (%)')).toHaveValue('5');
  await page.screenshot({ path: 'test-results/screens/cardio-treadmill.png' });
  await a.getByRole('button', { name: 'More Minutes' }).click();
  await a.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByTestId('between')).toHaveText(/^Cardio done/);
  await expect(page.locator('.ex-chip.done')).toHaveCount(2);

  // A second cardio activity with its own fields (rowing: metres, level); a mistake is fixed with Change.
  await addActivity(page, 'Cardio', 'Rowing Machine');
  await expect(page.getByTestId('last-time')).toContainText('—');
  await expect(page.getByTestId('cardio-suggestion')).toHaveCount(0); // no history: no hint
  await expect(a.getByLabel('Incline (%)')).toHaveCount(0); // only what makes sense for rowing
  await a.getByRole('textbox', { name: 'Minutes' }).fill('10');
  await a.getByLabel('Distance (m)').fill('2000');
  await a.getByRole('button', { name: 'Complete' }).click();
  await page.locator('.ex-chip', { hasText: 'Rowing Machine' }).click();
  await expect(page.getByTestId('activity-done')).toContainText('2,000 m');
  await page.getByRole('button', { name: 'Change' }).click();
  await a.getByRole('textbox', { name: 'Minutes' }).fill('12');
  await a.getByRole('button', { name: 'Complete' }).click();

  await addActivity(page, 'Cool-down', 'Stretching');
  await expect(page.getByTestId('cardio-suggestion')).toHaveCount(0); // cool-downs stay easy
  await page.getByTestId('activity').getByRole('textbox', { name: 'Minutes' }).fill('5');
  await page.getByTestId('activity').getByRole('button', { name: 'Complete' }).click();

  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page.getByText(/33 min cardio/)).toBeVisible();
  const items = page.getByTestId('activity-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('Treadmill');
  await expect(items.nth(0)).toContainText('21 min');
  await expect(items.nth(1)).toContainText('12 min · 2,000 m');
  await expect(items.nth(2)).toContainText('Cool-down');
  // XP for cardio once, however many; the extra (unplanned) cool-down earns nothing.
  await expect(page.getByTestId('rewards')).toContainText('Cardio');
  await expect(page.getByTestId('rewards')).not.toContainText('Cool-down');
  await page.screenshot({ path: 'test-results/screens/cardio-summary.png', fullPage: true });

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.locator('.list-item').first()).toContainText('1 exercise · 3 sets · 33 min cardio');

  await page.getByRole('link', { name: 'Profile' }).click();
  const stats = page.getByTestId('cardio-stats');
  await expect(stats).toContainText('Treadmill'); // most frequent (3 sample sessions + today)
  await page.screenshot({ path: 'test-results/screens/cardio-profile.png', fullPage: true });
});

test('routine builder: warm-up, exercises, cardio and cool-down in any order; the workout follows it', async ({ page }) => {
  await page.getByRole('link', { name: 'Edit Push' }).click();
  await page.getByRole('button', { name: 'Warm-up', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add warm-up' })).toBeVisible();
  await page.getByRole('button', { name: 'Mobility', exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Move Mobility up' }).click();
  await expect(page.getByRole('button', { name: 'Move Mobility up' })).toBeDisabled();
  await page.getByRole('button', { name: 'More minutes of Mobility' }).click();
  await page.getByRole('button', { name: 'Cardio', exact: true }).click();
  await page.getByRole('button', { name: 'Treadmill', exact: true }).click();
  await page.getByRole('button', { name: 'Cool-down', exact: true }).click();
  await page.getByRole('tab', { name: 'Cool-down' }).click();
  await page.getByRole('button', { name: 'Other…' }).click();
  await page.getByLabel('What is it?').fill('Hip circles');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.screenshot({ path: 'test-results/screens/cardio-routine.png', fullPage: true });
  await page.getByRole('button', { name: 'Save routine' }).click();

  await expect(page.locator('.list-item', { hasText: 'Push' })).toContainText('5 exercises · warm-up + cardio + cool-down');
  await page.getByRole('button', { name: /^Push/ }).click();
  const a = page.getByTestId('activity');
  await expect(a.getByRole('heading', { name: 'Mobility' })).toBeVisible(); // first item
  await expect(page.getByTestId('plan')).toHaveText('Plan: 6 min');
  await expect(a.getByRole('textbox', { name: 'Minutes' })).toHaveValue('6');
  await a.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Chest Press Machine' })).toBeVisible(); // on to the first exercise
  await expect(page.getByTestId('challenge')).toBeVisible(); // Today's Challenge unaffected
  await page.screenshot({ path: 'test-results/screens/cardio-strip.png' });

  // Several challenges, then the planned cardio and cool-down (skipping the rest is fine).
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click();
  await expect(page.getByRole('heading', { name: 'Incline Dumbbell Press' })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click();
  await page.locator('.ex-chip', { hasText: 'Treadmill' }).click();
  await a.getByRole('button', { name: 'Complete' }).click();
  await expect(a.getByRole('heading', { name: 'Hip circles' })).toBeVisible(); // next unfinished after the treadmill
  await a.getByRole('button', { name: 'Complete' }).click();
  await page.getByRole('button', { name: 'Finish Session' }).click();

  const rewards = page.getByTestId('rewards');
  await expect(rewards).toContainText('Challenge complete · Chest Press Machine');
  await expect(rewards).toContainText('Challenge complete · Incline Dumbbell Press');
  await expect(rewards).toContainText('Warm-up'); // planned: small XP
  await expect(rewards).toContainText('Cool-down');
  await expect(page.getByTestId('activity-item')).toHaveCount(3);

  // Remove an activity from the finished workout.
  await page.getByRole('button', { name: 'Edit sets' }).click();
  await page.getByRole('button', { name: 'Remove Hip circles' }).click();
  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(page.getByTestId('activity-item')).toHaveCount(2);
  await expect(rewards).not.toContainText('Cool-down');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`cardio screens have no serious accessibility problems (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const check = async (screen: string) => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect.soft(serious.map((v) => `${screen}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
    };
    await page.getByRole('button', { name: /^Push/ }).click();
    await page.getByRole('button', { name: 'Warm-up', exact: true }).click();
    await page.locator('.rep-btn').first().click();
    await check('warm-up sets');
    await page.goto('/#/workout/add?kind=cardio');
    await check('add cardio');
    await page.getByRole('button', { name: 'Treadmill', exact: true }).click();
    await page.getByText(/More \(optional\)/).click();
    await check('cardio logger');
    await page.getByRole('button', { name: 'Complete' }).click();
    await page.locator('.ex-chip', { hasText: 'Treadmill' }).click();
    await check('cardio done');
    await page.getByRole('button', { name: 'Finish Session' }).click();
    await check('summary with cardio');
    await page.goto('/#/routines/push');
    await page.getByRole('button', { name: 'Cardio', exact: true }).click();
    await check('routine: add cardio');
    await page.goto('/#/profile');
    await check('profile with cardio stats');
  });
}

test.describe('small phone (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test('treadmill: every main field and Complete are on screen without scrolling', async ({ page }) => {
    await page.getByRole('button', { name: /^Push/ }).click();
    await page.locator('.rep-btn.target').click(); // a set logged: the last-set bar is showing too
    await page.goto('/#/workout/add?kind=cardio');
    await page.getByRole('button', { name: 'Treadmill', exact: true }).click();
    for (const el of [page.getByLabel('Incline (%)'), page.getByRole('button', { name: 'Complete' })]) {
      const box = (await el.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(667);
    }
    await page.screenshot({ path: 'test-results/screens/cardio-se.png' });
  });
});
