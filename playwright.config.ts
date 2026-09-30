import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Use a pre-installed Chromium if one exists (e.g. in CI containers); otherwise run `npx playwright install chromium`.
const localChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:5173',
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
});
