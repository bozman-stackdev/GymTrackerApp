import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Rest timer between strength sets: the time itself is the control. Logging a set starts it; tap = stop;
 * tap again = restart from 0:00. The clock is controlled (page.clock): fastForward without ticks is a locked phone.
 */
test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

const later = async (page: Page, time: string) => {
  await page.clock.fastForward(time); // no ticks in between, like a locked screen
  await page.clock.runFor(1000);
};

async function logOneSet(page: Page) {
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.locator('.rep-btn.target').click();
}

test('logging a set starts it; tap stops; tap again restarts from 0:00; the next set restarts it', async ({ page }) => {
  await logOneSet(page);
  const timer = page.getByTestId('rest-timer');
  await expect(timer).toHaveAttribute('data-state', 'running');

  // Screen locked for a minute and a half: still exact.
  await later(page, '01:29');
  await expect(timer).toHaveText('1:30');

  // 1. Tap the running timer: it stops, and the time stays put.
  await timer.click();
  await expect(timer).toHaveAttribute('data-state', 'stopped');
  await expect(timer).toHaveText('1:30');
  await later(page, '01:00');
  await expect(timer).toHaveText('1:30');

  // 2. Tap the stopped timer: it starts again from zero.
  await timer.click();
  await expect(timer).toHaveAttribute('data-state', 'running');
  await expect(timer).toHaveText('0:00');
  await later(page, '00:19');
  await expect(timer).toHaveText('0:20');

  // Reload mid-rest: the state is kept (it's saved with the workout, not counted in memory).
  await page.reload();
  await expect(page.getByTestId('rest-timer')).toHaveAttribute('data-state', 'running');
  await expect(page.getByTestId('rest-timer')).toHaveText(/^0:2\d$/);

  // Stopped, then the next set: back to 0:00 and running by itself.
  await page.getByTestId('rest-timer').click();
  await expect(page.getByTestId('rest-timer')).toHaveAttribute('data-state', 'stopped');
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('rest-timer')).toHaveAttribute('data-state', 'running');
  await expect(page.getByTestId('rest-timer')).toHaveText('0:00');
  await expect(page.getByTestId('sets-today').locator('.slot.done')).toHaveCount(2); // logging unaffected
});

test('minimal: no Start/Stop buttons or hints, a big enough touch target, accessible, fits a small phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // measure the real size, not mid "pop" animation
  await logOneSet(page);
  const timer = page.getByTestId('rest-timer');
  await expect(timer).toBeVisible();
  const bar = page.getByTestId('last-set');
  await expect(bar.getByRole('button', { name: /^(start|stop)$/i })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/tap to/i);
  const box = (await timer.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  await expect(timer).toHaveAccessibleName(/^Rest timer \d+:\d\d, running$/);

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  }
  await timer.click(); // stopped state is accessible too
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(timer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/screens/rest-timer-se.png' });
});
