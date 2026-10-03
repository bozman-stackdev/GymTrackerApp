/**
 * Cardio, warm-ups and cool-downs: START → do it → STOP → saved. Nothing to type; duration is the only metric.
 * The clock is controlled (page.clock), so "23 minutes later" is instant and timers can be paused like on a locked phone.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

const activity = (page: Page) => page.getByTestId('activity');
/** Jump ahead without running the 1-second ticks in between (like a locked screen), then let the page catch up. */
const later = async (page: Page, time: string) => {
  await page.clock.fastForward(time);
  await page.clock.runFor(1000);
};
async function addCardio(page: Page, name: string) {
  await page.getByRole('button', { name: 'Empty workout' }).click();
  await page.getByRole('tab', { name: 'Cardio' }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name, exact: true }).click();
}

test('select cardio → START → train → STOP → saved: no typing, duration only, +10 XP', async ({ page }) => {
  await page.getByRole('button', { name: 'Empty workout' }).click();
  await page.getByRole('tab', { name: 'Cardio' }).click();
  await expect(page.getByTestId('activity-picker').getByRole('button')).toHaveText(
    ['Treadmill', 'Cycling', 'Rowing', 'Cross Trainer', 'Stair Climber', 'Walking', 'Running', 'Swimming', 'Stationary Bike', 'Ski Erg', 'Assault Bike',
      'Dynamic Stretching', 'Stretching', 'Mobility', 'Band Work', 'Bodyweight Squats', 'Foam Rolling', 'Other…'],
  );
  await page.getByTestId('activity-picker').getByRole('button', { name: 'Treadmill', exact: true }).click();

  // Straight to the timer: nothing to fill in.
  await expect(activity(page)).toContainText('Cardio');
  await expect(activity(page).getByTestId('timer')).toHaveText('00:00:00');
  await expect(activity(page).getByTestId('last-time')).toHaveText('Previous: 20:00');
  await expect(activity(page).locator('input, select, textarea')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/speed|incline|distance|calories|heart rate|km\/h/i);
  await page.screenshot({ path: 'test-results/screens/cardio-ready.png' });

  await activity(page).getByRole('button', { name: 'START' }).click();
  await later(page, '04:31');
  await expect(activity(page).getByTestId('timer')).toHaveText('00:04:32');
  await page.screenshot({ path: 'test-results/screens/cardio-running.png' });
  await later(page, '19:10'); // the screen was locked: no ticks, still exact
  await expect(activity(page).getByTestId('timer')).toHaveText('00:23:43');

  await activity(page).getByRole('button', { name: 'STOP' }).click();
  const done = page.getByTestId('activity-done');
  await expect(done).toContainText('CARDIO COMPLETE');
  await expect(done.getByTestId('duration')).toHaveText('23:43');
  await expect(done.getByTestId('activity-xp')).toHaveText('+10 XP');
  await expect(done.getByTestId('duration-change')).toHaveText('Previous 20:00 · Today 23:43 · +3:43');
  await page.screenshot({ path: 'test-results/screens/cardio-done.png' });
  await later(page, '05:00'); // stopped means stopped
  await expect(done.getByTestId('duration')).toHaveText('23:43');
  await done.getByRole('button', { name: 'DONE', exact: true }).click();
  await expect(page.getByTestId('between')).toHaveText(/^Cardio done/);

  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page.getByTestId('activity-item')).toContainText('Treadmill');
  await expect(page.getByTestId('activity-item')).toContainText('23 min 43 sec');
  await expect(page.getByTestId('rewards')).toContainText('Cardio');
  await expect(page.getByTestId('rewards')).toContainText('+10');
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.locator('.list-item').first()).toContainText('24 min cardio');
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByTestId('cardio-stats')).toContainText('Treadmill');
  await expect(page.getByTestId('cardio-stats')).toContainText('Total cardio time');
  await expect(page.getByTestId('cardio-stats')).not.toContainText(/distance|km/i);
});

test('the timer survives a reload; the running time stays in sight on other items; Finish Session saves it', async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.locator('a.ex-chip.add').click();
  await page.getByRole('tab', { name: 'Cardio' }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name: 'Rowing', exact: true }).click();
  await activity(page).getByRole('button', { name: 'START' }).click();
  await later(page, '05:00');
  await page.reload(); // e.g. the browser dropped the tab
  await expect(activity(page).getByTestId('timer')).toHaveText(/^00:0[5-6]:/);

  // Look at another item: the timer stays visible, one tap from STOP.
  await page.locator('.ex-chip', { hasText: 'Chest Press Machine' }).click();
  const bar = page.getByTestId('running-bar');
  await expect(bar).toContainText('Rowing');
  await expect(page.locator('.ex-chip', { hasText: 'Rowing' }).getByTestId('timer-small')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click(); // lift while... (sets still work)
  await later(page, '10:00');
  await page.getByRole('button', { name: 'Finish Session' }).click();
  const rowing = page.getByTestId('activity-item').filter({ hasText: 'Rowing' });
  await expect(rowing).toContainText(/1[5-6] min/);
  await expect(page.getByTestId('rewards')).toContainText('Challenge complete · Chest Press Machine'); // strength unaffected
});

test('stop from the bar; Adjust a forgotten STOP; Restart', async ({ page }) => {
  await addCardio(page, 'Cycling');
  await activity(page).getByRole('button', { name: 'START' }).click();
  await later(page, '02:00:00'); // forgot to stop
  await activity(page).getByRole('button', { name: 'STOP' }).click();
  await expect(page.getByTestId('duration')).toHaveText('2:00:01');
  await page.getByRole('button', { name: 'Adjust time' }).click();
  await page.getByRole('textbox', { name: 'Minutes' }).fill('25');
  await page.getByRole('textbox', { name: 'Minutes' }).blur();
  await expect(page.getByTestId('duration')).toHaveText('25:00');
  await page.screenshot({ path: 'test-results/screens/cardio-adjust.png' });
  await page.getByRole('button', { name: 'DONE', exact: true }).click();

  // A second activity: start it, look elsewhere, stop it from the running bar.
  await page.locator('.add-activity-row a', { hasText: 'Cardio' }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name: 'Stair Climber', exact: true }).click();
  await activity(page).getByRole('button', { name: 'START' }).click();
  await later(page, '03:00');
  await page.locator('.ex-chip', { hasText: 'Cycling' }).click();
  await page.getByTestId('running-bar').getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('running-bar')).toHaveCount(0);
  await page.locator('.ex-chip', { hasText: 'Stair Climber' }).click();
  await expect(page.getByTestId('duration')).toHaveText('3:01');
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(activity(page).getByTestId('timer')).toHaveText('00:00:00');
});

test('warm-up → strength → strength → cardio → cool-down, every activity a timer', async ({ page }) => {
  await page.getByRole('link', { name: 'Edit Push' }).click();
  await page.getByRole('button', { name: 'Warm-up', exact: true }).click();
  await page.getByRole('button', { name: 'Walking', exact: true }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Move Walking up' }).click();
  for (const name of ['Incline Dumbbell Press', 'Shoulder Press Machine', 'Dumbbell Lateral Raise', 'Cable Triceps Pushdown']) {
    await page.getByRole('button', { name: `Remove ${name}` }).click();
  }
  await page.getByRole('button', { name: 'Cardio', exact: true }).click();
  await page.getByRole('button', { name: 'Treadmill', exact: true }).click();
  await page.getByRole('button', { name: 'Cool-down', exact: true }).click();
  await page.getByRole('button', { name: 'Cycling', exact: true }).click();
  await page.getByRole('button', { name: 'Save routine' }).click();

  await page.getByRole('button', { name: /^Push/ }).click();
  await expect(activity(page)).toContainText('Warm-up');
  await expect(activity(page)).toContainText('Walking');
  await activity(page).getByRole('button', { name: 'START' }).click();
  await later(page, '05:31');
  await activity(page).getByRole('button', { name: 'STOP' }).click();
  await expect(page.getByTestId('activity-done')).toContainText('WARM-UP COMPLETE');
  await expect(page.getByTestId('duration')).toHaveText('5:32');
  await page.getByRole('button', { name: 'DONE', exact: true }).click();

  // Strength exactly as before: Today's Challenge and auto-advance.
  await expect(page.getByRole('heading', { name: 'Chest Press Machine' })).toBeVisible();
  await expect(page.getByTestId('challenge')).toContainText('50 kg × 8');
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click();
  await page.locator('a.ex-chip.add').click();
  await page.getByRole('button', { name: /Lat Pulldown/ }).click();
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click();

  await page.locator('.ex-chip', { hasText: 'Treadmill' }).click();
  await activity(page).getByRole('button', { name: 'START' }).click();
  await later(page, '20:00');
  await activity(page).getByRole('button', { name: 'STOP' }).click();
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
  await expect(activity(page)).toContainText('Cool-down');
  await activity(page).getByRole('button', { name: 'START' }).click();
  await later(page, '08:14');
  await activity(page).getByRole('button', { name: 'STOP' }).click();
  await expect(page.getByTestId('activity-done')).toContainText('COOL-DOWN COMPLETE');
  await expect(page.getByTestId('duration')).toHaveText('8:15');
  await page.getByRole('button', { name: 'DONE', exact: true }).click();
  await page.getByRole('button', { name: 'Finish Session' }).click();

  const items = page.getByTestId('activity-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('5 min 32 sec');
  await expect(items.nth(1)).toContainText('20 min 1 sec');
  await expect(items.nth(2)).toContainText('8 min 15 sec');
  const rewards = page.getByTestId('rewards');
  await expect(rewards).toContainText('Challenge complete · Chest Press Machine');
  await expect(rewards).toContainText('Warm-up');
  await expect(rewards).toContainText('Cool-down');
  await expect(rewards).toContainText('Cardio');
  await page.screenshot({ path: 'test-results/screens/cardio-mixed-summary.png', fullPage: true });
  // The muscle map counts the lifts, never the cardio.
  await page.getByTestId('muscles-trained').click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await expect(page.getByTestId('period-summary')).toContainText('6 sets');
});

test('older workouts with speed, incline and distance still show what they recorded', async ({ page }) => {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('gymtracker:data')!);
    const last = raw.sessions.at(-1);
    last.entries.push({ kind: 'cardio', activityId: 'treadmill', log: { durationMin: 20, speedKmh: 6.5, inclinePct: 5 }, doneAt: last.startedAt });
    localStorage.setItem('gymtracker:data', JSON.stringify(raw));
  });
  await page.reload();
  await page.getByRole('link', { name: 'History' }).click();
  await page.locator('.list-item').first().click();
  await expect(page.getByTestId('activity-item').last()).toContainText('20 min · 6.5 km/h · 5% incline');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`timer screens have no serious accessibility problems (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const check = async (screen: string) => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect.soft(serious.map((v) => `${screen}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
    };
    await addCardio(page, 'Treadmill');
    await check('timer ready');
    await activity(page).getByRole('button', { name: 'START' }).click();
    await later(page, '01:30');
    await check('timer running');
    await page.locator('a.ex-chip.add').click();
    await page.getByRole('button', { name: /Leg Press/ }).click();
    await check('running bar');
    await page.getByTestId('running-bar').getByRole('button', { name: 'Stop' }).click();
    await page.locator('.ex-chip', { hasText: 'Treadmill' }).click();
    await check('timer done');
    await page.getByRole('button', { name: 'Finish Session' }).click();
    await check('summary');
    await page.goto('/#/profile');
    await check('profile cardio');
  });
}

test.describe('small phone (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test('START and STOP are big and on screen without scrolling', async ({ page }) => {
    await addCardio(page, 'Treadmill');
    const start = activity(page).getByRole('button', { name: 'START' });
    await expect(start).toBeInViewport({ ratio: 1 });
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(100);
    await start.click();
    const stop = activity(page).getByRole('button', { name: 'STOP' });
    await expect(stop).toBeInViewport({ ratio: 1 });
    await expect(activity(page).getByTestId('timer')).toBeInViewport();
    await page.screenshot({ path: 'test-results/screens/cardio-se.png' });
  });
});
