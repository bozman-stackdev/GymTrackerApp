import { expect, test, type Locator } from '@playwright/test';

/*
 * Big iPhones with a Dynamic Island (e.g. 16 Pro Max, 440×956 points) installed to the Home Screen: the app draws
 * under the status bar. Browsers here report no safe area, so the CSS safe-area tokens are set to the real iPhone values.
 */
const NOTCH = { top: 62, bottom: 34 };

test.use({ viewport: { width: 440, height: 956 } });

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.addStyleTag({ content: `:root { --safe-top: ${NOTCH.top}px !important; --safe-bottom: ${NOTCH.bottom}px !important; }` });
  await page.getByRole('button', { name: 'Try with sample data' }).click();
  await expect(page.getByTestId('sample-banner')).toBeVisible();
});

/** Fully below the status bar, inside the screen, and actually the element a tap at its centre hits. */
async function expectTappable(target: Locator) {
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(NOTCH.top);
  expect(box.y + box.height).toBeLessThanOrEqual(956 - NOTCH.bottom);
  const hit = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!top && (el === top || el.contains(top));
  });
  expect(hit).toBe(true);
}

test('back and header buttons sit below the status bar on every screen, and work', async ({ page }) => {
  const back = page.getByRole('button', { name: 'Back', exact: true });

  await expectTappable(page.getByRole('heading', { name: 'Hi Alex' }));
  await expectTappable(page.getByRole('link', { name: 'Profile' })); // tab bar above the home bar

  for (const [path, title] of [['/#/routines/push', 'Edit routine'], ['/#/exercises/face-pull', 'Face Pull'],
    ['/#/exercises/new', 'New exercise'], ['/#/gym/new', 'Add equipment']] as const) {
    await page.goto('/#/');
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expectTappable(back);
    await back.click();
    await expect(page).toHaveURL(/#\/$/);
  }

  // Workout summary: Back and Edit sets.
  await page.getByRole('link', { name: 'History' }).click();
  await page.locator('a.list-item').first().click();
  await expectTappable(page.getByRole('button', { name: 'Edit sets' }));
  await expectTappable(back);
  await page.screenshot({ path: 'test-results/screens/notch-session.png' });

  // Workout: Finish, and the add-exercise screen's Back.
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /^Push/ }).click();
  await expectTappable(page.getByRole('button', { name: 'Finish Session' }));
  await page.screenshot({ path: 'test-results/screens/notch-workout.png' });
  await page.goto('/#/workout/add');
  await expectTappable(back);
  await back.click();
  await expect(page).toHaveURL(/#\/workout$/);
});

test('header stays reachable after scrolling a long screen', async ({ page }) => {
  await page.goto('/#/exercises/face-pull');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const back = page.getByRole('button', { name: 'Back', exact: true });
  await expectTappable(back);
  await page.screenshot({ path: 'test-results/screens/notch-scrolled.png' });
  await back.click();
  await expect(page).not.toHaveURL(/face-pull/);
});

test('routine: create a custom exercise without losing the routine', async ({ page }) => {
  await page.goto('/#/routines/new');
  await page.getByPlaceholder('e.g. Upper body').fill('Leg day B');
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('button', { name: /Face Pull/ }).click();

  // No match → create it, with the name already filled in.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('Zercher Squat');
  await expect(page.getByText('No matches.')).toBeVisible();
  await page.getByRole('button', { name: 'Create “Zercher Squat”' }).click();
  await expect(page.getByRole('heading', { name: 'New exercise' })).toBeVisible();
  await expectTappable(page.getByRole('button', { name: 'Cancel' }));
  await expect(page.getByPlaceholder('e.g. Hack Squat')).toHaveValue('Zercher Squat');
  await page.getByRole('button', { name: 'legs' }).click();
  await page.getByRole('button', { name: 'barbell' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  // Back on the routine: name and earlier exercise kept, new one added with 3 sets.
  await expect(page.getByRole('heading', { name: 'New routine' })).toBeVisible();
  await expect(page.getByPlaceholder('e.g. Upper body')).toHaveValue('Leg day B');
  await expect(page.locator('.routine-item .title')).toHaveText(['Cable Face Pull', 'Zercher Squat']);
  await expect(page.locator('.routine-item').nth(1)).toContainText('3 sets');

  // The plain button (list not empty), and Cancel from the form returns to the list without adding anything.
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('button', { name: 'Create custom exercise' }).click();
  await expect(page.getByPlaceholder('e.g. Hack Squat')).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Add exercise' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.routine-item')).toHaveCount(2);

  await page.getByRole('button', { name: 'Save routine' }).click();
  await page.getByRole('button', { name: /Leg day B/ }).click();
  await expect(page.getByRole('heading', { name: 'Cable Face Pull' })).toBeVisible();
  await page.goto('/#/exercises');
  await page.getByPlaceholder('Search exercises').fill('zercher');
  await expect(page.getByRole('button', { name: /Zercher Squat.*legs · barbell/ })).toBeVisible();
});

test('workout: "Create" from an empty search starts the new exercise', async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  await page.goto('/#/workout/add');
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('Landmine Press');
  await page.getByRole('button', { name: 'Create “Landmine Press”' }).click();
  await expect(page.getByPlaceholder('e.g. Hack Squat')).toHaveValue('Landmine Press');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByRole('heading', { name: 'Landmine Press' })).toBeVisible();
});

test('no iPhone zoom-on-focus: every text field and drop-down uses 16px+ text', async ({ page }) => {
  const small: string[] = [];
  for (const path of ['/#/profile', '/#/exercises/new', '/#/gym/new', '/#/account?mode=signup', '/#/exercises', '/#/routines/push', '/#/workout/add']) {
    await page.goto(path);
    await page.locator('main').waitFor();
    small.push(...await page.evaluate((p) => [...document.querySelectorAll('input:not([type=file]), select, textarea')]
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${p} ${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? ''} ${getComputedStyle(el).fontSize}`), path));
  }
  expect(small).toEqual([]);
});
