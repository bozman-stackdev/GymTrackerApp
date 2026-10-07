import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Community leaderboard against the fake backend (VITE_BACKEND=fake): its "server" lives in localStorage, with a mock
// community of ~300 people and development scenarios (src/services/backend/mockCommunity.ts). Codes are always 123456.
const SERVER = 'gymtracker:fake-server';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
});

async function startOwn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start my own' }).click();
}

/** A real workout (3 sets, earns XP) on this phone. */
async function logWorkout(page: Page) {
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /Push \d+ exercises/ }).click();
  await page.getByLabel('Weight', { exact: true }).fill('40');
  for (let i = 0; i < 3; i++) await page.locator('.rep-btn.target').click();
  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page).toHaveURL(/#\/history\/.+/);
  await expect(page.getByTestId('session-xp')).not.toHaveText('+0 XP');
}

async function signUp(page: Page, { name = 'Alex', email = 'alex@example.com', leaderboard = true } = {}) {
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('link', { name: 'Create account' }).first().click();
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('secret-pass');
  const choice = page.getByTestId('leaderboard-choice').getByRole('checkbox');
  await expect(choice).toBeChecked();
  if (!leaderboard) await choice.uncheck();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Code from the email').fill('123456');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced');
}

/** Picks a mock leaderboard, as a developer would. */
async function scenario(page: Page, label: string) {
  await page.getByTestId('lb-dev').getByRole('combobox').selectOption({ label });
}

type FakeServer = { users: { id: string; displayName: string; leaderboardVisible?: boolean }[]; days?: { userId: string; day: string; points: number }[]; scenario?: string };
const readServer = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!) as FakeServer, SERVER);
const writeServer = (page: Page, s: FakeServer) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [SERVER, JSON.stringify(s)] as const);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Another person with an account, as the server has them (real users only: the 'empty' scenario hides the mocks). */
async function addPerson(page: Page, name: string, points: number) {
  const s = await readServer(page);
  const id = `user-${name}`;
  s.users.push({ id, email: `${name}@x.com`, displayName: name, leaderboardVisible: true, password: 'x', confirmed: true } as FakeServer['users'][0]);
  s.days = [...(s.days ?? []), { userId: id, day: today(), points }];
  await writeServer(page, s);
}

async function secondPhone(browser: Browser, page: Page, email: string) {
  const server = await page.evaluate((k) => localStorage.getItem(k)!, SERVER);
  const ctx = await browser.newContext({ ...test.info().project.use });
  const other = await ctx.newPage();
  await other.goto('/');
  await other.evaluate(([k, v]) => localStorage.setItem(k, v), [SERVER, server] as const);
  await other.getByRole('button', { name: 'Start my own' }).click();
  await other.getByRole('link', { name: 'Profile' }).click();
  await other.getByRole('link', { name: 'Log in' }).first().click();
  await other.getByLabel('Email').fill(email);
  await other.getByLabel('Password', { exact: true }).fill('secret-pass');
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other.getByTestId('sync-status')).toContainText('Synced');
  return other;
}

test('signed out: everything works without an account; the leaderboard invites you to sign up', async ({ page }) => {
  await startOwn(page);
  await logWorkout(page); // the core tracker needs no account
  await expect(page.getByTestId('lb-line')).toHaveText(/Sign up to compete on the leaderboard/);
  await page.getByRole('link', { name: 'Profile' }).click();
  const card = page.getByTestId('progress');
  await expect(card.getByTestId('lb-line')).toHaveText(/Sign up to compete on the leaderboard/);
  await page.goto('/#/leaderboard');
  await expect(page.getByTestId('lb-signed-out')).toContainText('Tracking your workouts never needs an account');
  await expect(page.getByTestId('lb-signed-out').getByRole('link', { name: 'Create account' })).toBeVisible();
});

test('history from before the account counts; your rank sits right under the level bar; week / month / all time', async ({ page }) => {
  await startOwn(page);
  await logWorkout(page);
  await signUp(page);

  // Profile: level bar, then the rank line.
  const card = page.getByTestId('progress');
  await expect(card.getByTestId('lb-line')).toContainText(/You're #\d+ this week/);
  const order = await card.evaluate((el) => [...el.querySelectorAll('[data-testid="level"], [data-testid="lb-line"]')].map((n) => n.getAttribute('data-testid')));
  expect(order).toEqual(['level', 'lb-line']);
  await card.screenshot({ path: 'test-results/screens/lb-1-under-level.png' });

  // Home shows the rank in the progress line.
  await page.getByRole('link', { name: 'Train' }).click();
  await expect(page.getByTestId('home-rank')).toHaveText(/#\d+ this week/);

  // The board: This Week by default, your own row always visible and highlighted.
  await page.getByRole('link', { name: 'Profile' }).click();
  await card.getByTestId('lb-line').click();
  await expect(page).toHaveURL(/#\/leaderboard/);
  await expect(page.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('lb-row').first()).toContainText('🥇');
  const me = page.getByTestId('lb-me');
  await expect(me).toHaveCount(1);
  await expect(me).toContainText('You');
  await expect(me).toContainText(/\d+ XP/);
  await expect(page.getByTestId('lb-big-rank')).toHaveText(/#\d+/);
  await expect(page.getByTestId('lb-rule')).toContainText('up to 5 training days a week');
  await page.screenshot({ path: 'test-results/screens/lb-2-week.png', fullPage: true });

  // All time counts the workout logged before the account existed.
  await page.getByRole('tab', { name: 'All time' }).click();
  await expect(page).toHaveURL(/period=all/);
  await expect(page.getByTestId('lb-me')).toBeVisible();
  await expect(page.getByTestId('lb-summary')).toContainText(/\d XP/);
  const allTime = await page.getByTestId('lb-summary').textContent();
  expect(Number(allTime!.match(/(\d[\d,]*) XP/)![1].replace(',', ''))).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Month' }).click();
  await expect(page.getByTestId('lb-me')).toBeVisible();

  // Nothing private is ever shown: no email anywhere on the board.
  await expect(page.locator('main')).not.toContainText('@');
  await expect(page.locator('main')).not.toContainText('alex@example.com');
});

test('development scenarios: #1, top 10, top 100 (shown without scrolling), near the bottom, moving up and down', async ({ page }) => {
  await startOwn(page);
  await logWorkout(page);
  await signUp(page);
  await page.goto('/#/leaderboard');

  await scenario(page, 'You are in the top 100');
  await expect(page.getByTestId('lb-big-rank')).toHaveText('#64');
  await expect(page.locator('.lb-gap')).toBeVisible();
  await expect(page.getByTestId('lb-list').locator('li')).toHaveCount(5 + 1 + 3); // top 5, …, above / you / below
  await expect(page.getByTestId('lb-me')).toContainText('#64');
  await expect(page.getByTestId('lb-me').getByTestId('rank-change')).toHaveText('↑ 7');
  await expect(page.getByTestId('lb-me')).toBeInViewport();
  await page.screenshot({ path: 'test-results/screens/lb-3-top100.png' });

  await scenario(page, 'You are in the top 10');
  await expect(page.getByTestId('lb-big-rank')).toHaveText('#7');
  await expect(page.getByTestId('lb-me')).toContainText('#7');

  await scenario(page, 'You are #1');
  await expect(page.getByTestId('lb-big-rank')).toHaveText('#1');
  await expect(page.getByTestId('lb-me')).toContainText('🥇');
  await expect(page.getByTestId('lb-medals')).toContainText('🥇 2');
  await page.screenshot({ path: 'test-results/screens/lb-4-first.png', fullPage: true });

  await scenario(page, 'You moved down');
  await expect(page.getByTestId('lb-me').getByTestId('rank-change')).toHaveText('↓ 2');
  await expect(page.getByTestId('lb-me').getByTestId('rank-change')).toHaveAttribute('aria-label', 'Down 2 places since yesterday');

  await scenario(page, 'You moved up');
  await expect(page.getByTestId('lb-big-rank')).toHaveText('#24');
  await expect(page.getByTestId('lb-me').getByTestId('rank-change')).toHaveText('↑ 3');

  await scenario(page, 'You are near the bottom');
  await expect(page.getByTestId('lb-me')).toBeVisible();
  await expect(page.getByTestId('lb-summary')).toContainText(/of 30\d/);

  await scenario(page, 'No activity this period');
  await expect(page.getByTestId('lb-no-points')).toContainText('Your next workout puts you on the board');
  await expect(page.getByTestId('lb-me')).toHaveCount(0);

  // Badges: Top 100 / 50 / 10 / 3 / #1 in the achievement list (no XP).
  await scenario(page, 'You are #1');
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByText('Achievements').click();
  for (const title of ['Top 100', 'Top 50', 'Top 10', 'Top 3', 'Leaderboard #1']) {
    await expect(page.locator('.achievement.done .title').getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByText('Community · no XP, just recognition')).toBeVisible();
  await expect(page.getByTestId('lb-line')).toContainText("You're #1 this week");
});

test('two real people: ranks, a finished workout moves you up, privacy switch removes you, display name', async ({ page, browser }) => {
  await startOwn(page);
  await signUp(page);
  await page.goto('/#/leaderboard');
  await scenario(page, 'No mock users (real accounts only)');
  await addPerson(page, 'Sam', 5);
  await page.getByRole('button', { name: 'Refresh' }).click();
  // Alex has no points yet: Sam alone on the board.
  await expect(page.getByTestId('lb-row')).toHaveCount(1);
  await expect(page.getByTestId('lb-row')).toContainText('Sam');
  await expect(page.getByTestId('lb-no-points')).toBeVisible();

  // A workout (more XP than Sam's 5): the board refreshes after it syncs, Alex is #1.
  await logWorkout(page);
  await expect(page.getByTestId('lb-line')).toContainText("You're #1 this week", { timeout: 15_000 });
  await page.getByTestId('lb-line').click();
  await expect(page.getByTestId('lb-list').locator('li').nth(0)).toContainText('You');
  await expect(page.getByTestId('lb-list').locator('li').nth(1)).toContainText('Sam');

  // Display name: public, never an email.
  await page.getByRole('link', { name: 'Profile' }).click();
  const name = page.getByTestId('public-name').getByLabel('Display name');
  await name.fill('alex@example.com');
  await expect(page.getByTestId('public-name')).toContainText("Don't use your email address");
  await name.fill('GymBeast92');
  await page.getByRole('button', { name: 'Save display name' }).click();
  await expect(page.getByTestId('public-name')).toContainText('Saved');

  // Another person sees the chosen name only.
  const sam = await secondPhone(browser, page, 'alex@example.com');
  await sam.goto('/#/leaderboard');
  await expect(sam.getByTestId('lb-big-rank')).toHaveText('#1');
  await sam.close();

  // Visibility off (Profile → Account): off the board, points removed from the server; XP and level keep working.
  const level = await page.getByTestId('level').textContent();
  await page.getByTestId('lb-visibility').getByRole('switch').uncheck();
  await expect(page.getByTestId('progress').getByTestId('lb-line')).toContainText('Join the leaderboard');
  const s = await readServer(page);
  const alex = s.users.find((u) => u.displayName === 'GymBeast92')!;
  expect(alex.leaderboardVisible).toBe(false);
  expect((s.days ?? []).filter((d) => d.userId === alex.id)).toHaveLength(0);
  await expect(page.getByTestId('level')).toHaveText(level!);
  await page.goto('/#/leaderboard');
  await expect(page.getByTestId('lb-join')).toContainText("You're not on the leaderboard");

  // Back on: published again.
  await page.getByRole('button', { name: 'Join the leaderboard' }).click();
  await expect(page.getByTestId('lb-big-rank')).toHaveText('#1');
  expect(((await readServer(page)).days ?? []).filter((d) => d.userId === alex.id).length).toBeGreaterThan(0);
});

test('signing up without the leaderboard: not listed until you join', async ({ page }) => {
  await startOwn(page);
  await logWorkout(page);
  await signUp(page, { leaderboard: false });
  await expect(page.getByTestId('progress').getByTestId('lb-line')).toContainText('Join the leaderboard');
  const s = await readServer(page);
  expect(s.days ?? []).toHaveLength(0); // nothing published while hidden
  await page.getByTestId('progress').getByTestId('lb-line').click();
  await expect(page.getByTestId('lb-join')).toBeVisible();
});

test('Premium insights are extra; the board itself is free', async ({ page }) => {
  await startOwn(page);
  await logWorkout(page);
  await signUp(page);
  await page.goto('/#/leaderboard');
  await scenario(page, 'You are in the top 10');
  await expect(page.getByTestId('lb-list')).toBeVisible();
  await expect(page.getByTestId('lb-insights-locked')).toContainText('Premium');
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByTestId('plan').getByRole('switch').check();
  await page.goto('/#/leaderboard');
  await expect(page.getByTestId('lb-insights')).toContainText(/XP away from #6/);
  await expect(page.getByTestId('lb-insights')).toContainText(/top \d+%/);
  await expect(page.getByTestId('lb-insights')).toContainText('Your best weekly finish: #7');
});

test('accessibility (light and dark) and a small phone', async ({ page }) => {
  await startOwn(page);
  await logWorkout(page);
  await signUp(page);
  await page.goto('/#/leaderboard');
  await scenario(page, 'You are in the top 100');
  await expect(page.getByTestId('lb-me')).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
  }
  await page.goto('/#/profile');
  await expect(page.getByTestId('lb-visibility')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/#/leaderboard');
  await expect(page.getByTestId('lb-me')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  for (const row of await page.locator('.lb-row').all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/screens/lb-5-se.png', fullPage: true });
});
