import { defineConfig } from '@playwright/test';

// Canonical frontend/Playwright/TypeScript scaffold config, as bmad-testarch-framework's
// step-03-scaffold-framework.md section 2 describes it: standardized timeouts, an
// env-fallback base URL, failure-focused artifacts, and HTML + JUnit + console reporters.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60000,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    trace: 'retain-on-failure-and-retries',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
