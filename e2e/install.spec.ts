import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { skipGuide } from './guide-helper';

// First-visit "Add to Home Screen" guide. A clean browser (nothing seen yet), as a real first visit.
const IPHONE = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
};
const ANDROID = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
};
const CHROME_ON_IPHONE = { ...IPHONE, userAgent: IPHONE.userAgent.replace('Version/18.0', 'CriOS/130.0.0.0') };

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => { page.on('pageerror', (e) => { throw e; }); });

const sheet = (page: Page) => page.getByTestId('install-sheet');

test.describe('iPhone', () => {
  test.use(IPHONE);

  test('first visit: Safari steps; "Maybe later" and it stays away; then the normal first-run flow', async ({ page }) => {
    await page.goto('/');
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toContainText('Take your workouts with you');
    await expect(page.getByRole('tab', { name: 'iPhone / iPad' })).toHaveAttribute('aria-selected', 'true');
    const steps = page.getByTestId('install-ios');
    await expect(steps.locator('li')).toHaveCount(4);
    await expect(steps).toContainText('Open this page in Safari');
    await expect(steps).toContainText('Tap the Share button');
    await expect(steps).toContainText('Add to Home Screen');
    await expect(steps).toContainText('Scroll down the menu, or tap Edit Actions');
    await expect(steps).toContainText('Tap Add');
    await expect(sheet(page)).toContainText("can't add apps from websites automatically");
    await expect(page.getByTestId('install-ios-other')).toHaveCount(0);

    await sheet(page).getByRole('button', { name: 'Maybe later' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start my own' })).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);

    // Then the existing first-run flow, unchanged (no stacked pop-ups).
    await page.getByRole('button', { name: 'Start my own' }).click();
    await expect(page.getByTestId('guide-progress')).toHaveText('Step 1 of 7');
    await skipGuide(page);
    await expect(page.getByRole('heading', { name: 'Train' })).toBeVisible();
  });

  test('"Got it" also dismisses it; it can be reopened from the welcome screen, Help and Profile', async ({ page }) => {
    await page.goto('/');
    await sheet(page).getByRole('button', { name: 'Got it' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'add the app to your Home Screen' }).click();
    await expect(sheet(page)).toBeVisible();
    await sheet(page).getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await skipGuide(page);
    await page.goto('/#/help');
    await page.getByRole('button', { name: 'Add to Home Screen' }).click();
    await expect(page.getByTestId('install-ios')).toBeVisible();
    await sheet(page).getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('link', { name: 'Profile' }).click();
    await page.getByRole('button', { name: 'Add to Home Screen' }).click();
    await expect(sheet(page)).toBeVisible();
    // Android steps are one tap away for someone helping a friend.
    await page.getByRole('tab', { name: 'Android' }).click();
    await expect(page.getByTestId('install-android')).toContainText('Install app or Add to Home screen');
  });

  test('accessible (light and dark), no horizontal scroll on a small iPhone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await expect(sheet(page)).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});

test.describe('Chrome on iPhone', () => {
  test.use(CHROME_ON_IPHONE);
  test('explains that Safari is the recommended way', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('install-ios-other')).toContainText('Safari is the recommended way');
  });
});

test.describe('Android', () => {
  test.use(ANDROID);

  test('first visit: Chrome steps; the real "Install app" button only when the browser offers it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Android' })).toHaveAttribute('aria-selected', 'true');
    const steps = page.getByTestId('install-android');
    await expect(steps.locator('li')).toHaveCount(4);
    await expect(steps).toContainText('Open this page in Chrome');
    await expect(steps).toContainText('Tap the menu');
    await expect(steps).toContainText('Install app or Add to Home screen');
    await expect(sheet(page).getByRole('button', { name: 'Install app' })).toHaveCount(0); // not offered (dev server)

    // When the browser offers installation, the guide offers its prompt.
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => { (window as unknown as { prompted: boolean }).prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await sheet(page).getByRole('button', { name: 'Install app' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
    await expect(sheet(page)).toContainText('Installed');
  });
});

test.describe('already installed (opened from the home screen)', () => {
  test.use(ANDROID);
  test('never shows by itself; reopening says it is installed', async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q === '(display-mode: standalone)' ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : real(q));
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start my own' })).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'add the app to your Home Screen' }).click();
    await expect(page.getByTestId('install-installed')).toContainText("You're already using the installed app");
  });
});
