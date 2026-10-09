import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 1000,
  retries: 0,
  workers: 1,
});
