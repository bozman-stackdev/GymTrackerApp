import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// "Add missed workout" from History: a workout that happened but wasn't tracked. A record - no XP.
test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

const day = (daysAgo: number) => {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const xpText = async (page: Page) => {
  await page.getByRole('link', { name: 'Profile' }).click();
  return page.getByTestId('level').textContent();
};
const openForm = async (page: Page) => {
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByTestId('add-missed').click();
  await expect(page.getByRole('heading', { name: 'Add missed workout' })).toBeVisible();
};

test('date and type only: one tap to save, on its date, labelled, no XP', async ({ page }) => {
  const xpBefore = await xpText(page);
  await openForm(page);
  await expect(page.getByLabel('Date')).toHaveValue(day(1)); // yesterday by default
  await expect(page.getByRole('button', { name: 'Freestyle Workout' })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/screens/missed-1-form.png', fullPage: true });
  await page.getByRole('button', { name: 'Save workout' }).click();

  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.getByRole('status')).toContainText('Added Freestyle Workout');
  const item = page.getByTestId('history-item').filter({ has: page.getByTestId('manual-tag') });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Manually added');
  await expect(item).not.toContainText('XP');
  // Yesterday is this week or last week - never under a later date.
  await expect(item.locator('xpath=ancestor::section')).toHaveAttribute('aria-label', /This week|Last week/);
  await page.screenshot({ path: 'test-results/screens/missed-2-history.png' });
  expect(await xpText(page)).toBe(xpBefore);
});

test('with details: exercise sets, cardio minutes, duration, note; then open, edit, delete', async ({ page }) => {
  const xpBefore = await xpText(page);
  await openForm(page);
  await page.getByLabel('Date').fill(day(3));
  await page.getByRole('group', { name: 'Workout' }).getByRole('button', { name: 'Push' }).click();
  await page.getByRole('button', { name: '45 min' }).click();

  await page.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByTestId('missed-add').getByRole('button', { name: /^Chest Press Machine/ }).click();
  const row = page.getByTestId('missed-exercise');
  await expect(row.getByRole('textbox')).toHaveCount(0); // nothing pre-filled, no made-up sets
  await row.getByRole('button', { name: 'Set', exact: true }).click();
  await row.getByLabel('Chest Press Machine set 1 weight (kg)').fill('50');
  await row.getByLabel('Chest Press Machine set 1 reps').fill('10');
  await row.getByRole('button', { name: 'Repeat set' }).click();
  await row.getByLabel('Chest Press Machine set 2 reps').fill('9');
  await row.getByRole('button', { name: 'Set', exact: true }).click(); // a 3rd set left empty: not saved

  await page.getByRole('button', { name: 'Cardio', exact: true }).click();
  await page.getByTestId('missed-add').getByTestId('activity-picker').getByRole('button', { name: 'Treadmill', exact: true }).click();
  await page.getByTestId('missed-activity').getByLabel('Minutes').fill('20');
  await page.getByLabel('Note (optional)').fill('Hotel gym');
  await page.screenshot({ path: 'test-results/screens/missed-3-detail.png', fullPage: true });
  await page.getByRole('button', { name: 'Save workout' }).click();

  const item = page.getByTestId('history-item').filter({ has: page.getByTestId('manual-tag') });
  await expect(item).toContainText('Push');
  await expect(item).toContainText('45 min');
  await item.click();
  await expect(page.getByTestId('manual-info')).toContainText('Hotel gym');
  await expect(page.getByTestId('manual-info')).toContainText('earns no XP');
  await expect(page.locator('main')).toContainText('50 kg × 10 · 9');
  await expect(page.getByTestId('activity-item')).toContainText('20 min');
  await expect(page.locator('main')).not.toContainText('Workout rewards');

  // Edit: fix a set and the date; the date and id stay as chosen.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Date')).toHaveValue(day(3));
  await page.getByLabel('Chest Press Machine set 2 reps').fill('8');
  await page.getByLabel('Date').fill(day(4));
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('main')).toContainText('50 kg × 10 · 8');

  // Delete with the existing button.
  await page.getByRole('button', { name: 'Delete workout' }).click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.getByTestId('manual-tag')).toHaveCount(0);
  expect(await xpText(page)).toBe(xpBefore);
});

test('a second workout on the same day: warned, still allowed; future dates blocked', async ({ page }) => {
  await openForm(page);
  await page.getByRole('button', { name: 'Save workout' }).click();
  await page.getByTestId('add-missed').click();
  await expect(page.getByTestId('same-day')).toContainText('You already have Freestyle Workout on this day');
  await page.getByLabel('Date').fill(day(-2));
  await expect(page.getByText('Missed workouts are in the past')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save workout' })).toBeDisabled();
  await page.getByLabel('Date').fill(day(1));
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByTestId('manual-tag')).toHaveCount(2);
});

test('a live workout still works while missed workouts exist', async ({ page }) => {
  await openForm(page);
  await page.getByRole('button', { name: 'Save workout' }).click();
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.locator('.rep-btn.target').click();
  await expect(page.getByTestId('last-set')).toBeVisible();
  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page.getByTestId('session-xp')).not.toHaveText('+0 XP');
});

test('accessible, and fits a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openForm(page);
  await page.getByRole('button', { name: 'Exercise', exact: true }).click();
  await page.getByTestId('missed-add').getByRole('button', { name: /^Chest Press Machine/ }).click();
  await page.getByTestId('missed-exercise').getByRole('button', { name: 'Set', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  }
  await page.screenshot({ path: 'test-results/screens/missed-4-se.png', fullPage: true });
});
