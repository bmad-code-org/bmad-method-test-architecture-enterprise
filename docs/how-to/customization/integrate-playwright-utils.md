---
title: 'Integrate Playwright Utils with TEA'
description: Add fixtures and utilities to your TEA-generated tests
---

# Integrate Playwright Utils with TEA

Use `@seontechnologies/playwright-utils` with TEA for API requests, authentication, and network fixtures.

## What is Playwright Utils?

A utility library that provides:

- Typed API request helper
- Authentication session management
- Network recording and replay (HAR)
- Network request interception
- Async polling (recurse)
- Structured logging
- File validation (CSV, PDF, XLSX, ZIP)
- Burn-in testing utilities
- Network error monitoring

**Repository:** [https://github.com/seontechnologies/playwright-utils](https://github.com/seontechnologies/playwright-utils)

**npm Package:** `@seontechnologies/playwright-utils`

## When to Use This

- You want shared fixtures for API and browser tests
- Your team benefits from standardized patterns
- You need utilities like API testing, auth handling, network mocking
- You want TEA to generate tests using these utilities
- You're building reusable test infrastructure

**Don't use if:**

- You're just learning testing (keep it simple first)
- You have your own fixture library
- You don't need the utilities

## Prerequisites

- Test framework setup complete (Playwright)
- Node.js v18 or later

This integration applies to JavaScript and TypeScript suites using the Playwright runner.

## Installation

### Step 1: Install Package

```bash
npm install -D @seontechnologies/playwright-utils
```

### Step 2: Enable in TEA Config

Set it under `[modules.tea]` in `_bmad/config.toml`, by running `bmad setup tea` or by editing the file:

```toml
[modules.tea]
tea_use_playwright_utils = "true"
```

`"true"` is the setup default, so if you accepted it during `bmad setup tea`, it's already set.

### Step 3: Verify Installation

```bash
# Check package installed
npm list @seontechnologies/playwright-utils

# Check TEA config
grep tea_use_playwright_utils _bmad/config.toml
```

Example output; the installed version may differ:

```text
└── @seontechnologies/playwright-utils@4.4.0
tea_use_playwright_utils = "true"
```

## What Changes When Enabled

### Utility Selection

When the flag is enabled and the package is installed, TEA uses the utilities for supported operations.
The `playwright-utils-mandate` knowledge fragment defines the rule for generation and review.

Two enforcement levels:

Use the following utilities for supported operations:

| You need                                     | TEA emits                                           | Not                                                       |
| -------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Observe or stub an app API call in a UI test | `interceptNetworkCall({ url, fulfillResponse? })`   | `page.route`, `page.waitForResponse`                      |
| An HTTP call from a test                     | `apiRequest({ method, path, body? })`               | `request.get/post/...`, `await response.json()`           |
| Wait for an eventually consistent condition  | `recurse(fn, predicate, { timeout })`               | `page.waitForTimeout`, a `while` loop, bare `expect.poll` |
| Output the report should show                | `log.step` / `log.info`                             | `console.log`                                             |
| A test's entry point (spec files)            | `import { test } from '../support/merged-fixtures'` | `import { test } from '@playwright/test'`                 |
| Reading a downloaded CSV/XLSX/PDF/ZIP        | `handleDownload` plus `readCSV` / `readXLSX` / …    | a parser per format                                       |
| Catching a 4xx/5xx a green UI hides          | the `network-error-monitor` fixture                 | per-spec `page.on('response')` handlers                   |

The following utilities need project setup: `auth-session` needs an auth provider, `network-recorder` a HAR directory, the webhook module a mock provider, and `burn-in` a config file and script.
TEA proposes them and adds the setup when it falls within the workflow's scope.
It records any fallback in the summary.

Use `page.route` directly to block analytics, fonts, or third-party scripts.
For other package gaps, TEA adds `// playwright-utils deviation: <reason>` and lists the reason in its summary.

The entry-point rule is about **spec files**.
The merged-fixtures module itself imports `mergeTests` and re-exports `expect` from `@playwright/test`, and the examples below show exactly that; it is the one file that must reach for Playwright directly.

**Scope.** The mandate covers JavaScript/TypeScript suites on the Playwright runner, browser and API alike.
Cypress, Maestro flows, Pact/Vitest contract suites, and backend suites in pytest, JUnit, Go test, xUnit, or RSpec are untouched by it.

### `framework` Workflow

**Vanilla Playwright:**

```typescript
// Basic Playwright fixtures only
import { test, expect } from '@playwright/test';

test('api test', async ({ request }) => {
  const response = await request.get('/api/users');
  const users = await response.json();
  expect(response.status()).toBe(200);
});
```

**With Playwright Utils (Merged Fixtures):**

```typescript
// Merge the fixtures your project needs into one test object
import { expect, mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
// Auth fixture built in your project (setAuthProvider + createAuthFixtures)
import { test as authFixture } from './support/auth/auth-fixture';

const test = mergeTests(authFixture, apiRequestFixture);

test('api test', async ({ apiRequest, authToken }) => {
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/users',
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await log.info('Fetched users');
  expect(status).toBe(200);
});
```

**With Playwright Utils (Selective Merge):**

```typescript
import { expect, mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as interceptNetworkCallFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';

export const test = mergeTests(apiRequestFixture, interceptNetworkCallFixture);
export { expect, log };

test('api test', async ({ apiRequest }) => {
  await log.info('Fetching users');
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/users',
  });
  expect(status).toBe(200);
});
```

### `atdd` and `automate` Workflows

**Without Playwright Utils:**

```typescript
// Manual API calls
test('should fetch profile', async ({ page, request }) => {
  const response = await request.get('/api/profile');
  const profile = await response.json();
  // Manual parsing and validation
});
```

**With Playwright Utils:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';

test('should fetch profile', async ({ apiRequest }) => {
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/profile', // 'path' not 'url'
  }).validateSchema(ProfileSchema); // Chained validation

  expect(status).toBe(200);
  // body is type-safe: { id: string, name: string, email: string }
});
```

### `test-review` Workflow

**Without Playwright Utils:**
Reviews against generic Playwright patterns

**With Playwright Utils:**
Reviews against playwright-utils best practices:

- Fixture composition patterns
- Utility usage (apiRequest, authSession, etc.)
- Network-first patterns
- Structured logging

### `ci` Workflow

**Without Playwright Utils:**

- Parallel sharding
- Burn-in loops (basic shell scripts)
- CI triggers (PR, push, schedule)
- Artifact collection

**With Playwright Utils:**
Enhanced with smart testing:

- Burn-in utility (git diff-based, volume control)
- Selective testing (skip config/docs/types changes)
- Test prioritization by file changes

## Available Utilities

### api-request

Typed HTTP client with schema validation.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/api-request.html>

**Usage:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

test('should create user', async ({ apiRequest }) => {
  const { status, body } = await apiRequest({
    method: 'POST',
    path: '/api/users', // Note: 'path' not 'url'
    body: { name: 'Test User', email: 'test@example.com' }, // Note: 'body' not 'data'
  }).validateSchema(UserSchema); // Chained method (can await separately if needed)

  expect(status).toBe(201);
  expect(body.id).toBeDefined();
  expect(body.email).toBe('test@example.com');
});
```

### auth-session

Authentication session management with token persistence.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/auth-session.html>

**Usage:**

```typescript
import { test as base, expect } from '@playwright/test';
import { createAuthFixtures, setAuthProvider } from '@seontechnologies/playwright-utils/auth-session';
import myCustomProvider from './support/auth/provider';

setAuthProvider(myCustomProvider); // Register before creating the fixtures
const test = base.extend(createAuthFixtures());

test('should access protected route', async ({ page, authToken }) => {
  // authToken automatically fetched and persisted
  // The fixture provides the token.

  await page.goto('/dashboard');
  await expect(page).toHaveURL('/dashboard');

  // Token is reused across tests (persisted to disk)
});
```

**Configuration required** (see auth-session docs for provider setup):

```typescript
// global-setup.ts
import { authStorageInit, setAuthProvider, authGlobalInit } from '@seontechnologies/playwright-utils/auth-session';
import myCustomProvider from './support/auth/provider';

export default async function globalSetup() {
  authStorageInit();
  setAuthProvider(myCustomProvider); // Define your auth mechanism
  await authGlobalInit(); // Fetch token once
}
```

### network-recorder

Record and replay network traffic (HAR) for offline testing.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/network-recorder.html>

**Usage:**

```typescript
import { test } from '@seontechnologies/playwright-utils/network-recorder/fixtures';

// Choose the mode with PW_NET_MODE when running the suite.

test('should work with recorded traffic', async ({ page, context, networkRecorder }) => {
  // Setup recorder (records or replays based on PW_NET_MODE)
  await networkRecorder.setup(context);

  // Your normal test code
  await page.goto('/dashboard');
  await page.click('#add-item');

  // First run (record): Saves traffic to HAR file
  // Subsequent runs (playback): Uses HAR file, no backend needed
});
```

**Switch modes:**

```bash
# Record traffic
PW_NET_MODE=record npx playwright test

# Playback traffic (offline)
PW_NET_MODE=playback npx playwright test
```

### intercept-network-call

Spy or stub network requests with automatic JSON parsing.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/intercept-network-call.html>

**Usage:**

```typescript
import { expect } from '@playwright/test';
import { test } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';

test('should handle API errors', async ({ page, interceptNetworkCall }) => {
  // Stub API to return error (set up BEFORE navigation)
  const profileCall = interceptNetworkCall({
    method: 'GET',
    url: '**/api/profile',
    fulfillResponse: {
      status: 500,
      body: { error: 'Server error' },
    },
  });

  await page.goto('/profile');

  // Wait for the intercepted response
  const { status, responseJson } = await profileCall;

  expect(status).toBe(500);
  expect(responseJson.error).toBe('Server error');
  await expect(page.getByText('Server error occurred')).toBeVisible();
});
```

### recurse

Async polling for eventual consistency (Cypress-style).

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/recurse.html>

**Usage:**

```typescript
import { expect, mergeTests } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';

const test = mergeTests(apiRequestFixture, recurseFixture);

test('should wait for async job completion', async ({ apiRequest, recurse }) => {
  // Start async job
  const { body: job } = await apiRequest({
    method: 'POST',
    path: '/api/jobs'
  });

  // Poll until complete (smart waiting)
  const completed = await recurse(
    () => apiRequest({ method: 'GET', path: `/api/jobs/${job.id}` }),
    (result) => result.body.status === 'completed',
    {
      timeout: 30000,
      interval: 2000,
      log: 'Waiting for job to complete'
    }
  });

  expect(completed.body.status).toBe('completed');
});
```

### log

Structured logging that integrates with Playwright reports.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/log.html>

**Usage:**

```typescript
import { log } from '@seontechnologies/playwright-utils';
import { test, expect } from '@playwright/test';

test('should login', async ({ page }) => {
  await log.info('Starting login test');

  await page.goto('/login');
  await log.step('Navigated to login page'); // Shows in Playwright UI

  await page.getByLabel('Email').fill('test@example.com');
  await log.debug('Filled email field');

  await log.info('Login credentials entered');
  // Logs appear in test output and Playwright reports
});
```

### file-utils

Read and validate CSV, PDF, XLSX, ZIP files.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/file-utils.html>

**Usage:**

```typescript
import { handleDownload, readCSV } from '@seontechnologies/playwright-utils/file-utils';
import { test, expect } from '@playwright/test';
import path from 'node:path';

const DOWNLOAD_DIR = path.join(__dirname, '../downloads');

test('should export valid CSV', async ({ page }) => {
  // Handle download and get file path
  const downloadPath = await handleDownload({
    page,
    downloadDir: DOWNLOAD_DIR,
    trigger: () => page.click('button:has-text("Export")'),
  });

  // Read and parse CSV
  const csvResult = await readCSV({ filePath: downloadPath });
  const { data, headers } = csvResult.content;

  // Validate structure
  expect(headers).toEqual(['Name', 'Email', 'Status']);
  expect(data.length).toBeGreaterThan(0);
  expect(data[0]).toMatchObject({
    Name: expect.any(String),
    Email: expect.any(String),
    Status: expect.any(String),
  });
});
```

### burn-in

Smart test selection with git diff analysis for CI optimization.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/burn-in.html>

**Usage:**

```typescript
// scripts/burn-in-changed.ts
import { runBurnIn } from '@seontechnologies/playwright-utils/burn-in';

async function main() {
  await runBurnIn({
    configPath: 'playwright.burn-in.config.ts',
    baseBranch: 'main',
  });
}

main().catch(console.error);
```

**Config:**

```typescript
// playwright.burn-in.config.ts
import type { BurnInConfig } from '@seontechnologies/playwright-utils/burn-in';

const config: BurnInConfig = {
  skipBurnInPatterns: ['**/config/**', '**/*.md', '**/*types*'],
  burnInTestPercentage: 0.3,
  burnIn: {
    repeatEach: 3,
    retries: 1,
  },
};

export default config;
```

**Package script:**

```json
{
  "scripts": {
    "test:burn-in": "tsx scripts/burn-in-changed.ts"
  }
}
```

### network-error-monitor

Automatically detect HTTP 4xx/5xx errors during tests.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/network-error-monitor.html>

**Usage:**

```typescript
import { test } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';

// Network monitoring is enabled from here on
test('should not have API errors', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('button');

  // Test fails automatically if any HTTP 4xx/5xx errors occur
  // Error message shows: "Network errors detected: 2 request(s) failed"
  //   GET 500 https://api.example.com/users
  //   POST 503 https://api.example.com/metrics
});
```

**Opt-out for validation tests:**

```typescript
// When testing error scenarios, opt-out with annotation
test(
  'should show error message on 404',
  { annotation: [{ type: 'skipNetworkMonitoring' }] }, // Array format
  async ({ page }) => {
    await page.goto('/invalid-page'); // Will 404
    await expect(page.getByText('Page not found')).toBeVisible();
    // Test won't fail on 404 because of annotation
  },
);

// Or opt-out entire describe block
test.describe('error handling', { annotation: [{ type: 'skipNetworkMonitoring' }] }, () => {
  test('handles 404', async ({ page }) => {
    // Monitoring disabled for all tests in block
  });
});
```

## Fixture Composition

### Option 1: Merge Fixtures Inline (Simplest)

```typescript
// Merge the fixtures this spec needs
import { expect, mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as interceptNetworkCallFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';

const test = mergeTests(apiRequestFixture, interceptNetworkCallFixture);

test('api test', async ({ apiRequest, interceptNetworkCall }) => {
  await log.info('Fetching users');

  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/users',
  });

  expect(status).toBe(200);
});
```

### Option 2: Create Custom Merged Fixtures (Selective)

#### File 1: support/merged-fixtures.ts

```typescript
import { test as base, mergeTests } from '@playwright/test';
import { test as apiRequest } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as interceptNetworkCall } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorMonitor } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { log } from '@seontechnologies/playwright-utils';

// Merge only what you need
export const test = mergeTests(base, apiRequest, interceptNetworkCall, networkErrorMonitor);

export const expect = base.expect;
export { log };
```

#### File 2: tests/api/users.spec.ts

```typescript
import { test, expect, log } from '../support/merged-fixtures';

test('api test', async ({ apiRequest, interceptNetworkCall }) => {
  await log.info('Fetching users');

  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/users',
  });

  expect(status).toBe(200);
});
```

Inline merging keeps the selected fixtures in the spec file.
A shared module gives specs a common fixture entry point.

**See working examples:** <https://github.com/seontechnologies/playwright-utils/tree/main/playwright/support>

## Troubleshooting

### Import Errors

Cannot find module '@seontechnologies/playwright-utils/api-request'

```bash
# Verify package installed
npm list @seontechnologies/playwright-utils

# Check package.json has correct version
"@seontechnologies/playwright-utils": "^2.0.0"

# Reinstall if needed
npm install -D @seontechnologies/playwright-utils
```

### TEA Not Using Utilities

TEA generates tests without playwright-utils.

**Causes:**

1. Config not set: `tea_use_playwright_utils: false`
2. Workflow run before config change
3. Package not installed

```bash
# Check config
grep tea_use_playwright_utils _bmad/config.toml

# Should show: tea_use_playwright_utils = "true"

# Start fresh chat (TEA loads config at start)
```

### Type Errors with apiRequest

TypeScript errors on apiRequest response.

No schema validation.

```typescript
// Add Zod schema for type safety
import { z } from 'zod';

const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const { status, body } = await apiRequest({
  method: 'GET',
  path: '/api/profile', // 'path' not 'url'
}).validateSchema(ProfileSchema); // Chained method

expect(status).toBe(200);
// body is typed as { id: string, name: string, email: string }
```

## Related Guides

- [Integrate Pact.js Utils](/docs/how-to/customization/integrate-pactjs-utils.md): the same mandate shape for contract testing

**Getting Started:**

- [TEA Lite Quickstart Tutorial](/docs/tutorials/tea-lite-quickstart.md): Learn TEA basics
- [How to Set Up Test Framework](/docs/how-to/workflows/setup-test-framework.md): Initial framework setup

**Workflow Guides:**

- [How to Run ATDD](/docs/how-to/workflows/run-atdd.md): Generate tests with utilities
- [How to Run Automate](/docs/how-to/workflows/run-automate.md): Expand coverage with utilities
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md): Review against PW-Utils patterns

**Other Customization:**

- [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md): Playwright CLI + MCP setup, auto mode

## Understanding the Concepts

- [Testing as Engineering](/docs/explanation/testing-as-engineering.md): **Why Playwright Utils matters** (part of TEA's three-part solution)
- [Fixture Architecture](/docs/explanation/fixture-architecture.md): Pure function → fixture pattern
- [Network-First Patterns](/docs/explanation/network-first-patterns.md): Network utilities explained
- [Test Quality Standards](/docs/explanation/test-quality-standards.md): Patterns PW-Utils enforces

## Reference

- [TEA Configuration](/docs/reference/configuration.md): tea_use_playwright_utils option
- [Knowledge Base Index](/docs/reference/knowledge-base.md): Playwright Utils fragments
- [Glossary](/docs/glossary/index.md#test-architect-tea-concepts): Playwright Utils term
- [Official PW-Utils Docs](https://seontechnologies.github.io/playwright-utils/): Complete API reference
