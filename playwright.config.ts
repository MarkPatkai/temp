import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4200', headless: true,
    launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || undefined },
    viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-preview.mjs', url: 'http://127.0.0.1:4200', reuseExistingServer: !process.env['CI'] },
});
