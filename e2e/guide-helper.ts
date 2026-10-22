import type { Page } from '@playwright/test';

/** New users see the first-time guide after the welcome screen; most tests skip straight past it. */
export async function skipGuide(page: Page): Promise<void> {
  const shown = await page.getByTestId('guide-progress').waitFor({ timeout: 2000 }).then(() => true, () => false);
  if (shown) await page.getByRole('button', { name: 'Skip' }).click();
}
