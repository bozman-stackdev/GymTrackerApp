/** The muscle map: activity and training progress per muscle, front/back, periods, details, balance, Free vs Premium. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try with sample data' }).click();
});

const muscle = (page: Page, id: string) => page.locator(`.map-figure [data-muscle="${id}"]`);
const openMap = async (page: Page) => {
  await page.getByRole('link', { name: 'Muscles', exact: true }).click();
  await page.getByTestId('body-choice').getByRole('button', { name: 'Male', exact: true }).click(); // first visit: pick a body
  await expect(page.getByTestId('body-choice')).toHaveCount(0);
};
const NO_CLAIMS = /grew|bigger|unbalanced|imbalance|physique|lagging/i;

test('activity at a glance: heat map, front/back, periods change the numbers', async ({ page }) => {
  await openMap(page);
  const map = page.locator('.map-figure svg');
  await expect(map).toHaveAttribute('data-body', 'male');
  await expect(map).toHaveAttribute('data-view', 'front');
  await expect(page.getByTestId('map-headline')).toContainText('Most trained:');
  await expect(muscle(page, 'chest')).toHaveAttribute('data-tone', 'a3'); // Push days: chest is high
  await expect(page.getByTestId('legend')).toContainText('Low');
  await expect(page.getByTestId('legend')).toContainText('High');
  await expect(page.locator('[data-group="chest"]')).toContainText('%');
  await page.screenshot({ path: 'test-results/screens/muscles-activity.png' });

  // Back view: the back muscles, and the same muscles keep their colour on both views.
  await page.getByRole('tab', { name: 'Back' }).click();
  await expect(map).toHaveAttribute('data-view', 'back');
  await expect(muscle(page, 'lats')).toBeVisible();
  await expect(muscle(page, 'glutes')).toBeVisible();
  await expect(muscle(page, 'chest')).toHaveCount(0);
  const sideBack = await muscle(page, 'side-delts').getAttribute('data-tone');
  await page.getByRole('tab', { name: 'Front' }).click();
  await expect(muscle(page, 'side-delts')).toHaveAttribute('data-tone', sideBack!);

  // Periods: "This workout" (the last sample workout is a push day) has no legs; the last 4 weeks do.
  const fourWeeks = await page.getByTestId('period-summary').textContent();
  await page.getByRole('button', { name: 'This workout' }).click();
  await expect(page.getByTestId('period-summary')).not.toHaveText(fourWeeks!);
  await expect(page.getByTestId('period-summary')).toContainText('Push');
  await expect(muscle(page, 'quads')).toHaveAttribute('data-tone', 'none');
  await expect(muscle(page, 'chest')).not.toHaveAttribute('data-tone', 'none');
  await page.getByRole('button', { name: 'Last 4 weeks' }).click();
  await expect(muscle(page, 'quads')).not.toHaveAttribute('data-tone', 'none');
  await expect(page.getByTestId('muscle-disclaimer')).toContainText('can’t measure muscle size or growth');
});

test('tap a muscle: activity, training progress, recent exercises and performance in a bottom sheet', async ({ page }) => {
  await openMap(page);
  await muscle(page, 'chest').locator('path').first().click();
  const sheet = page.getByRole('dialog', { name: 'Chest' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Activity');
  await expect(sheet).toContainText('High');
  await expect(sheet).toContainText('Training progress');
  await expect(sheet).toContainText('Strong progression');
  await expect(sheet.getByTestId('recent-exercises')).toContainText('Chest Press Machine');
  await expect(sheet.getByTestId('recent-exercises')).toContainText('Incline Dumbbell Press');
  await expect(sheet.getByTestId('recent-performance')).toContainText(/Chest Press Machine\s*45 kg × \d+\s*45 kg × 12/);
  await expect(muscle(page, 'chest')).toHaveAttribute('aria-pressed', 'true'); // highlighted on the map
  await page.screenshot({ path: 'test-results/screens/muscles-sheet.png' });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // Keyboard: a muscle is a button.
  await muscle(page, 'abs').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Abs' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Abs' }).getByRole('button', { name: 'Close' }).click();

  // A group from the summary lists its muscles; tap one for its details.
  await page.locator('[data-group="back"]').click();
  const group = page.getByRole('dialog', { name: 'Back' });
  await expect(group.getByTestId('group-muscles')).toContainText('Upper back');
  await expect(group.getByTestId('group-muscles')).toContainText('Lats');
  await expect(group.getByTestId('group-muscles')).toContainText('Lower back');
  await group.getByRole('button', { name: /^Lats/ }).click();
  await expect(page.getByRole('dialog', { name: 'Lats' }).getByTestId('recent-exercises')).toContainText('Lat Pulldown');
});

test('progress mode: performance progression per muscle, in neutral words', async ({ page }) => {
  await openMap(page);
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.getByTestId('muscle-map')).toContainText('Muscle progress');
  await expect(page.getByTestId('map-headline')).toContainText('Progressing most:');
  await expect(muscle(page, 'chest')).toHaveAttribute('data-tone', 'strong');
  // The sample shoulder press has stalled: front shoulders are stable, not "progressing".
  await expect(muscle(page, 'front-delts')).toHaveAttribute('data-tone', 'stable');
  await expect(page.getByTestId('legend')).toContainText('Stable');
  await expect(page.locator('[data-group="chest"]')).toContainText('Strong progression');
  await expect(page.getByTestId('group-summary')).toContainText('It measures performance, not muscle growth.');
  await page.screenshot({ path: 'test-results/screens/muscles-progress.png' });
  await expect(page.locator('main')).not.toContainText(NO_CLAIMS);
  await muscle(page, 'front-delts').locator('path').first().click();
  await expect(page.getByRole('dialog', { name: 'Front shoulders' })).toContainText('Stable');
});

test('balance: training emphasis in neutral language; a single workout looks at weeks', async ({ page }) => {
  await openMap(page);
  const balance = page.getByTestId('balance');
  await expect(balance).toContainText('Your recent training');
  for (const r of ['Upper body', 'Lower body', 'Pushing', 'Pulling']) await expect(balance).toContainText(r);
  await expect(balance).toContainText(/similar training volume|Training emphasis/);
  await expect(balance).not.toContainText(NO_CLAIMS);
  await page.getByRole('button', { name: 'This workout' }).click();
  await expect(balance).toContainText('Last 4 weeks'); // a push day is meant to be all pushing
});

test('Free shows the map and activity; Premium adds history, details, trends, comparisons and insights', async ({ page }) => {
  await openMap(page);
  // Free: longer periods are locked, deeper analysis is a teaser - the map itself is never locked.
  await expect(page.getByRole('button', { name: 'Last 12 weeks (Premium)' })).toBeVisible();
  await expect(page.getByTestId('premium-teaser')).toBeVisible();
  await expect(page.getByTestId('insights')).toHaveCount(0);
  await expect(muscle(page, 'chest')).toHaveAttribute('data-tone', 'a3');
  await muscle(page, 'chest').locator('path').first().click();
  await expect(page.getByTestId('progress-details')).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Chest' }).getByRole('button', { name: /Premium/ }).click(); // "See what's behind…"
  const premium = page.getByRole('dialog', { name: 'Premium' });
  await expect(premium).toContainText('Longer history');
  await expect(premium).toContainText("isn't on sale yet");
  await page.screenshot({ path: 'test-results/screens/muscles-premium-sheet.png' });
  await premium.getByRole('button', { name: 'Try Premium preview' }).click();

  // Premium preview on.
  await expect(page.getByTestId('premium-teaser')).toHaveCount(0);
  await expect(page.getByTestId('insights')).toBeVisible();
  await expect(page.getByTestId('comparisons')).toContainText('Compared with the 4 weeks before');
  await expect(page.getByTestId('trends')).toContainText('Chest');
  await expect(page.locator('main')).not.toContainText(NO_CLAIMS);
  await page.getByRole('button', { name: 'Last 12 weeks', exact: true }).click();
  await expect(page.getByTestId('period-summary')).toContainText('16 workouts');
  await page.getByRole('button', { name: 'All time', exact: true }).click();
  await muscle(page, 'chest').locator('path').first().click();
  await expect(page.getByTestId('progress-details')).toContainText("Today's Challenges");
  await expect(page.getByTestId('muscle-trend')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/muscles-premium-details.png' });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/screens/muscles-premium.png', fullPage: true });

  // The switch in Profile shows it, and turns it off again (kept across a reload).
  await page.reload();
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('switch', { name: 'Premium preview' })).toBeChecked();
  await page.getByRole('switch', { name: 'Premium preview' }).click();
  await page.getByRole('link', { name: 'Muscles', exact: true }).click();
  await expect(page.getByTestId('premium-teaser')).toBeVisible();
});

test('body type: chosen in Profile, the map shows the female figure (front and back)', async ({ page }) => {
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Female', exact: true }).last().click(); // "Body on the muscle map"
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('link', { name: 'Muscles', exact: true }).click();
  await expect(page.getByTestId('body-choice')).toHaveCount(0);
  await expect(page.locator('.map-figure svg')).toHaveAttribute('data-body', 'female');
  await page.screenshot({ path: 'test-results/screens/muscles-female.png' });
  await page.getByRole('tab', { name: 'Back' }).click();
  await expect(page.locator('.map-figure svg')).toHaveAttribute('data-view', 'back');
  await page.screenshot({ path: 'test-results/screens/muscles-female-back.png' });
});

test('this workout: strength counts, warm-up sets and cardio do not; the summary links to the map', async ({ page }) => {
  await page.getByRole('button', { name: 'Empty workout' }).click();
  await page.getByRole('button', { name: /Leg Press/ }).click();
  await page.getByRole('button', { name: 'Warm-up', exact: true }).click();
  await page.locator('.rep-btn').first().click(); // a warm-up set
  await page.getByRole('button', { name: 'Warm-up', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click();
  await page.getByRole('button', { name: 'Finish Exercise' }).click();
  await page.locator('.add-activity-row a', { hasText: 'Cardio' }).click();
  await page.getByTestId('activity-picker').getByRole('button', { name: 'Treadmill', exact: true }).click();
  await page.getByTestId('activity').getByRole('button', { name: 'Complete' }).click();
  await page.getByRole('button', { name: 'Finish Session' }).click();

  const card = page.getByTestId('muscles-trained');
  await expect(card).toContainText('Muscles in this workout');
  await expect(card).toContainText('Quadriceps');
  await page.screenshot({ path: 'test-results/screens/muscles-summary-card.png' });
  await card.click();
  await expect(page).toHaveURL(/#\/muscles\?period=workout&session=/);
  await page.getByTestId('body-choice').getByRole('button', { name: 'Male', exact: true }).click();
  await expect(page.getByTestId('period-summary')).toContainText('3 sets'); // not the warm-up set, not the treadmill
  await expect(muscle(page, 'quads')).toHaveAttribute('data-tone', 'a3');
  await expect(muscle(page, 'chest')).toHaveAttribute('data-tone', 'none');
  await expect(muscle(page, 'adductors')).toHaveAttribute('data-tone', 'none');
  await page.getByRole('tab', { name: 'Back' }).click();
  await expect(muscle(page, 'glutes')).toHaveAttribute('data-tone', 'a2'); // secondary: half
  await expect(muscle(page, 'hamstrings')).toHaveAttribute('data-tone', 'a2');
});

test('exercise library: muscles worked on each exercise; a custom exercise gets sensible muscles and can be changed', async ({ page }) => {
  await page.getByRole('link', { name: 'My Gym' }).click();
  await page.getByRole('button', { name: /^Lat Pulldown/ }).click();
  const worked = page.getByTestId('muscles-worked');
  await expect(worked).toContainText('Lats');
  await expect(worked).toContainText('Biceps, Upper back');
  await page.screenshot({ path: 'test-results/screens/muscles-exercise.png' });

  await page.goto('/#/exercises/new');
  await page.getByLabel('Name').fill('Hack Squat');
  const picker = page.getByTestId('muscle-picker');
  await expect(picker).toContainText('Quadriceps, Glutes'); // from the name, though the group still says chest
  await picker.locator('summary').click();
  await picker.getByRole('button', { name: 'Calves: not used' }).click();
  await expect(picker.getByRole('button', { name: 'Calves: main muscle' })).toBeVisible();
  await picker.getByRole('button', { name: 'Glutes: main muscle' }).click(); // main → also works
  await expect(picker.getByRole('button', { name: 'Glutes: also works' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/muscles-picker.png', fullPage: true });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('muscles-worked')).toContainText('Quadriceps, Calves');
  await expect(page.getByTestId('muscles-worked')).toContainText('Also works');
});

test("Today's Challenge: the Why? shows muscle context, the challenge itself is unchanged", async ({ page }) => {
  await page.getByRole('button', { name: /^Push/ }).click();
  const before = await page.getByTestId('challenge').textContent();
  await page.getByTestId('challenge').click();
  await expect(page.getByTestId('challenge-muscles')).toContainText('Works Chest, plus front shoulders, triceps.');
  await expect(page.getByTestId('challenge-muscles')).toContainText('Your main chest exercise lately');
  await expect(page.getByTestId('challenge')).toContainText((before ?? '').replace('Why?', '').trim());
});

test('older data without muscle lists still works (the library fills them in)', async ({ page }) => {
  const stripped = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('gymtracker:data')!);
    raw.exercises = raw.exercises.map(({ muscles: _m, ...e }: Record<string, unknown>) => e);
    localStorage.setItem('gymtracker:data', JSON.stringify(raw));
    return raw.exercises.every((e: Record<string, unknown>) => !('muscles' in e));
  });
  expect(stripped).toBe(true);
  await page.reload();
  await openMap(page);
  await expect(muscle(page, 'chest')).toHaveAttribute('data-tone', 'a3');
  await page.getByRole('button', { name: /^Push/ }).count(); // app still fine
  await page.getByRole('link', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: /^Push/ }).click();
  await expect(page.getByTestId('challenge')).toBeVisible(); // progression unaffected
});

for (const scheme of ['light', 'dark'] as const) {
  test(`muscle map has no serious accessibility problems (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const check = async (screen: string) => {
      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect.soft(serious.map((v) => `${screen}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
    };
    await page.getByRole('link', { name: 'Muscles', exact: true }).click();
    await check('muscles (first visit)');
    await page.getByTestId('body-choice').getByRole('button', { name: 'Female', exact: true }).click();
    await check('muscles activity');
    await page.getByRole('tab', { name: 'Progress' }).click();
    await page.getByRole('tab', { name: 'Back' }).click();
    await check('muscles progress back');
    await muscle(page, 'lats').locator('path').first().click();
    await check('muscle sheet');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'All time (Premium)' }).click();
    await check('premium sheet');
    await page.getByRole('button', { name: 'Try Premium preview' }).click();
    await check('muscles premium');
    await page.goto('/#/exercises/lat-pulldown');
    await check('exercise muscles');
    await page.goto('/#/exercises/new');
    await page.getByTestId('muscle-picker').locator('summary').click();
    await check('muscle picker');
    await page.goto('/#/profile');
    await check('profile plan');
  });
}

test.describe('small phone (iPhone SE)', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  test('the map and its controls fit; no sideways scrolling', async ({ page }) => {
    await openMap(page);
    await expect(page.getByRole('tab', { name: 'Back' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'All time (Premium)' })).toBeInViewport({ ratio: 1 });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(375);
    const figure = await page.locator('.map-figure svg').boundingBox();
    expect(figure!.height).toBeGreaterThan(250);
    await page.screenshot({ path: 'test-results/screens/muscles-se.png' });
  });
});

test('switching tabs opens the new screen at the top', async ({ page }) => {
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByTestId('app-version').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await page.getByRole('link', { name: 'Muscles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Muscles' })).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
