import { expect, test, type Page } from '@playwright/test';

// Accounts against the fake backend (VITE_BACKEND=fake): its "server" lives in localStorage, codes are always 123456.
const SERVER = 'gymtracker:fake-server';
const CODE = '123456';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => { throw e; });
});

async function startOwn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start my own' }).click();
}

async function signUp(page: Page, email = 'alex@example.com', password = 'secret-pass') {
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('link', { name: 'Create account' }).click();
  await expect(page.getByTestId('privacy-note')).toContainText('Photos are never saved');
  await page.getByLabel('Display name').fill('Alex');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.screenshot({ path: 'test-results/screens/account-1-signup.png' });
  await page.getByRole('button', { name: 'Create account' }).click();
  // Email confirmation: enter the code.
  await expect(page.getByRole('status')).toContainText(`We emailed a code to ${email}`);
  await page.getByLabel('Code from the email').fill(CODE);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByTestId('account')).toContainText('Alex');
  await expect(page.getByTestId('sync-status')).toContainText('✓ Synced');
}

async function logOneWorkout(page: Page) {
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByRole('button', { name: /Push \d+ exercises/ }).click();
  await page.getByLabel('Weight', { exact: true }).fill('40');
  await page.locator('.rep-btn.target').click();
  await page.getByRole('button', { name: 'Finish Session' }).click();
  await expect(page).toHaveURL(/#\/history\/.+/);
}

const serverRecords = (page: Page) =>
  page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{"records":[]}') as { records: { kind: string; deleted: boolean }[] }).records, SERVER);

test('sign up uploads this phone; a finished workout syncs; a second phone logs in and gets everything', async ({ page, browser }) => {
  await startOwn(page);
  await signUp(page);
  await logOneWorkout(page);
  // Synced shortly after Finish Session.
  await expect.poll(async () => (await serverRecords(page)).filter((r) => r.kind === 'session' && !r.deleted).length).toBe(1);
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByTestId('account').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('sync-status')).toContainText('✓ Synced');
  await page.screenshot({ path: 'test-results/screens/account-2-profile.png' });

  // "Second phone": a fresh browser with the same (fake) server.
  const server = await page.evaluate((key) => localStorage.getItem(key)!, SERVER);
  const phone2 = await browser.newContext({ ...test.info().project.use });
  const page2 = await phone2.newPage();
  page2.on('pageerror', (e) => { throw e; });
  await page2.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [SERVER, server]);
  await page2.goto('/');
  await page2.getByRole('button', { name: 'Log in to my account' }).click();
  await page2.getByLabel('Email').fill('ALEX@example.com ');
  await page2.getByLabel('Password', { exact: true }).fill('secret-pass');
  await page2.getByRole('button', { name: 'Log in' }).click();
  await expect(page2.getByRole('heading', { name: 'Hi Alex' })).toBeVisible();
  await page2.getByRole('link', { name: 'History' }).click();
  await expect(page2.locator('a.list-item')).toHaveCount(1);
  await expect(page2.locator('a.list-item')).toContainText('Push');
  // The routines came from the account, not added twice.
  await page2.getByRole('link', { name: 'Train' }).click();
  await expect(page2.getByRole('button', { name: /Push \d+ exercises/ })).toHaveCount(1);
  await phone2.close();
});

test('wrong password, then "forgot password" with an emailed code', async ({ page }) => {
  await startOwn(page);
  await signUp(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByLabel('Email').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong-pass');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is wrong.');

  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill('alex@example.com');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('status')).toContainText("we've emailed it a code");
  await page.getByLabel('Code from the email').fill('000000');
  await page.getByLabel('New password').fill('new-secret');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('alert')).toHaveText('That code is wrong or has expired.');
  await page.getByLabel('Code from the email').fill(CODE);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByTestId('account')).toContainText('alex@example.com');
});

test('"Start fresh" while logged in logs out first and never empties the account', async ({ page }) => {
  await startOwn(page);
  await signUp(page);
  await logOneWorkout(page);
  await expect.poll(async () => (await serverRecords(page)).filter((r) => r.kind === 'session').length).toBe(1);
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Start fresh (delete all)' }).click();
  await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible(); // logged out
  await page.waitForTimeout(2500); // past the sync delay: nothing may be deleted
  expect((await serverRecords(page)).filter((r) => r.kind === 'session' && !r.deleted)).toHaveLength(1);
});

test('sample data is replaced by the account on log in; delete account keeps the phone data', async ({ page }) => {
  // Create the account from a real start, then go to sample data (which logs out).
  await startOwn(page);
  await signUp(page);
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('link', { name: 'Train' }).click();
  await expect(page.getByTestId('sample-banner')).toBeVisible();

  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page.getByText('The sample data is not saved to an account')).toBeVisible();
  await page.getByLabel('Email').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('secret-pass');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('sync-status')).toContainText('✓ Synced');
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.locator('a.list-item')).toHaveCount(0); // the account's (empty) history, not the sample's
  await expect(page.getByTestId('sample-banner')).toHaveCount(0);

  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByText('Your account was deleted')).toBeVisible();
  expect(await serverRecords(page)).toHaveLength(0);
  await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible(); // the app keeps working
});

test('offline: changes wait on the phone and sync when the connection is back', async ({ page, context }) => {
  await startOwn(page);
  await signUp(page);
  await context.setOffline(true);
  await logOneWorkout(page);
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByTestId('sync-status')).toHaveText("Offline: changes will sync when you're back online.");
  expect((await serverRecords(page)).filter((r) => r.kind === 'session')).toHaveLength(0);
  await context.setOffline(false);
  await expect(page.getByTestId('sync-status')).toContainText('✓ Synced');
  expect((await serverRecords(page)).filter((r) => r.kind === 'session')).toHaveLength(1);
});
