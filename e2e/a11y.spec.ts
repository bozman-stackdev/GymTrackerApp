import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Fails on serious/critical accessibility problems (contrast, missing labels, invalid ARIA, ...). */
async function checkA11y(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect.soft(serious.map((v) => `${screen}: ${v.id} – ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`main screens have no serious accessibility problems (${scheme})`, async ({ page }) => {
    // Reduced motion: measure contrast on the settled screen, not mid-way through the 0.2 s reward fade-in.
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    page.on('dialog', (d) => d.accept());
    await page.goto('/');
    await checkA11y(page, 'welcome');
    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await checkA11y(page, 'home');

    await page.getByRole('button', { name: /^Push/ }).click();
    await checkA11y(page, 'workout');
    await page.locator('.rep-btn.target').click(); // reward bar
    await page.getByTestId('challenge').click(); // "Why?" open
    await checkA11y(page, 'workout + reward');
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await checkA11y(page, 'summary');

    for (const [path, name] of [['/#/history', 'history'], ['/#/exercises', 'exercises'], ['/#/exercises/leg-press', 'exercise'],
      ['/#/exercises/new', 'exercise form'], ['/#/routines/push', 'routine'], ['/#/profile', 'profile']] as const) {
      await page.goto(path);
      await checkA11y(page, name);
    }

    await page.goto('/#/scan');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await page.getByTestId('photo-input').setInputFiles({ name: 'm.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('heading', { name: 'What are you using?' }).waitFor();
    await checkA11y(page, 'scan');
  });
}
