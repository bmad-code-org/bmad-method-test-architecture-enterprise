import { defineConfig } from '@playwright/test';

// The service listens on PORT, 4310 unless overridden, and the tests talk to it
// through Playwright's request fixture. There is no browser anywhere in this
// project: every endpoint is JSON over HTTP and every acceptance test is an API
// test.
const port = Number(process.env.PORT ?? 4310);

// LOCKER_BASE_URL names a server something else already started and holds
// open, as tea-atdd-red-check does on an OS-assigned port. The webServer URL
// has to be that same server's, so `reuseExistingServer` finds it answering
// and Playwright starts nothing. Pointing the webServer at 4310 instead made
// Playwright start a second server on that fixed port for every spec file,
// which failed with "Process from config.webServer was not able to start"
// whenever another run on the host held 4310.
const baseURL = process.env.LOCKER_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  timeout: 15_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
  },
  webServer: {
    command: 'node src/server.js',
    url: `${baseURL}/health`,
    env: { PORT: String(port) },
    reuseExistingServer: !process.env.CI,
  },
});
