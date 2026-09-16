import { defineConfig } from '@playwright/test';

// This corpus has no browser and no webServer block. test/eval-automate.js starts
// and stops the fixed voucher-service and the mutated scratch copy itself, and
// points one run at each through VOUCHER_BASE_URL, the same override
// voucher-service/playwright.config.ts declares. TEA_AUTOMATE_OUTPUT_DIR and
// PWTEST_CACHE_DIR are both set by the harness to a scratch directory outside
// this corpus, since these spec files are run directly out of the repository
// rather than staged into a disposable workspace first: a run that wrote its
// own output or cache here would leave untracked droppings in a fixture
// directory every `npm test` is supposed to leave clean.
const port = Number(process.env.PORT ?? 4320);

export default defineConfig({
  testDir: '.',
  timeout: 15_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: process.env.TEA_AUTOMATE_OUTPUT_DIR ?? 'test-results',
  use: {
    baseURL: process.env.VOUCHER_BASE_URL ?? `http://127.0.0.1:${port}`,
  },
});
