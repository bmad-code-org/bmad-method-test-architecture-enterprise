import { defineConfig } from '@playwright/test';

// The service listens on PORT, 4320 unless overridden, and the tests talk to it
// through Playwright's request fixture. There is no browser anywhere in this
// project: every endpoint is JSON over HTTP and every acceptance test is an API
// test.
const port = Number(process.env.PORT ?? 4320);

export default defineConfig({
  testDir: './tests',
  timeout: 15_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.VOUCHER_BASE_URL ?? `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: 'node src/server.js',
    url: `http://127.0.0.1:${port}/health`,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
  },
});
