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

### Step 3: Create the Shared Fixture Module

Every spec imports `test` and `expect` from one module under your configured `test_dir`.
The examples on this page use `tests/`; substitute your own `test_dir` (`e2e/`, `playwright/`) in every path.
TEA's `framework` skill scaffolds this file when the flag is on; create it yourself on an existing suite.

```typescript
// tests/support/merged-fixtures.ts
import { mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';

export const test = mergeTests(apiRequestFixture, interceptFixture, networkErrorFixture, recurseFixture);

export { expect } from '@playwright/test';
export { log };
```

To use another utility fixture, import it here and add it to the `mergeTests` call; specs keep the same import.
The [auth-session](#auth-session) fixture joins the same way once your project has an auth provider.

### Step 4: Write One Spec Against It

```typescript
// tests/api/users.spec.ts
import { test, expect, log } from '../support/merged-fixtures';

test('lists users', async ({ apiRequest }) => {
  await log.step('Fetch users');

  const { status } = await apiRequest({ method: 'GET', path: '/api/users' });

  expect(status).toBe(200);
});
```

`apiRequest` resolves `path` against the `baseURL` in your Playwright config.

### Step 5: Verify

```bash
# Package and TEA flag
npm list @seontechnologies/playwright-utils
grep tea_use_playwright_utils _bmad/config.toml

# Imports resolve and the spec is discovered (no server needed)
npx playwright test users.spec --list
```

Example output; the installed version may differ:

```text
└── @seontechnologies/playwright-utils@4.4.0
tea_use_playwright_utils = "true"
```

`--list` fails on a wrong import path or a missing fixture.
If your config is not at the project root, use the test script your setup created: TEA's scaffold adds `test:e2e` with the config path, so `npm run test:e2e -- users.spec --list`.
Drop `--list` to run the spec against your running application.

## What Changes When Enabled

### Utility Selection

When the flag is enabled and the package is installed, TEA uses the utilities for supported operations.
The `playwright-utils-mandate` knowledge fragment defines the rule for generation and review.

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
TEA scaffolds this wiring when the skill covers setup, and states any fallback to the vanilla equivalent in its output.

Use `page.route` directly to block analytics, fonts, or third-party scripts.
For other package gaps, TEA adds `// playwright-utils deviation: <reason>` and lists the reason in its summary.

The entry-point rule is about **spec files**.
The merged-fixtures module and the fixture files it merges import from `@playwright/test` directly, as [Step 3](#step-3-create-the-shared-fixture-module) shows; spec files import `test` from the module.

**Scope.** The mandate covers JavaScript/TypeScript suites on the Playwright runner, browser and API alike.
Cypress, Maestro flows, Pact/Vitest contract suites, and backend suites in pytest, JUnit, Go test, xUnit, or RSpec are untouched by it.

<a id="framework-workflow"></a>

### `framework` Skill

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

**With Playwright Utils:** the skill scaffolds `tests/support/merged-fixtures.ts` ([Step 3](#step-3-create-the-shared-fixture-module)) and writes specs against it:

```typescript
import { test, expect, log } from '../support/merged-fixtures';

test('api test', async ({ apiRequest, authToken }) => {
  const { status } = await apiRequest({
    method: 'GET',
    path: '/api/users',
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await log.info('Fetched users');
  expect(status).toBe(200);
});
```

`authToken` comes from the auth fixture the skill merges into the module when your project has an auth provider; see [auth-session](#auth-session).

<a id="automation-red-and-expand-modes"></a>

### Automate Red and Expand Modes

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
import { z } from 'zod';
import { test, expect } from '../support/merged-fixtures';

const ProfileSchema = z.object({ id: z.string(), name: z.string(), email: z.string().email() });

test('should fetch profile', async ({ apiRequest }) => {
  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/profile', // 'path' not 'url'
  }).validateSchema(ProfileSchema); // Chained validation

  expect(status).toBe(200);
  // body is type-safe: { id: string, name: string, email: string }
});
```

<a id="test-review-workflow"></a>

### `test-review` Skill

**Without Playwright Utils:**
Reviews against generic Playwright patterns

**With Playwright Utils:**
Reviews against playwright-utils best practices:

- Fixture composition patterns
- Utility usage (apiRequest, authSession, etc.)
- Network-first patterns
- Structured logging

<a id="ci-workflow"></a>

### Framework CI Phase

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

Each example below is a spec that imports from the shared module.
A utility whose fixture is not in the Step 3 module needs one import and one `mergeTests` entry there first; the example says which.
The upstream documentation shows the same calls with a `playwright/support/` layout, which is that repository's own test directory.

### api-request

Typed HTTP client with schema validation.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/api-request.html>

```typescript
import { test, expect } from '../support/merged-fixtures';
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
It needs a project-owned auth provider: the code that signs in and stores the session.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/auth-session.html>

Build the auth fixture from your provider, then merge it in `tests/support/merged-fixtures.ts`:

```typescript
// tests/support/auth-fixture.ts
import { test as base } from '@playwright/test';
import { createAuthFixtures, setAuthProvider } from '@seontechnologies/playwright-utils/auth-session';
import myCustomProvider from './auth/provider';

setAuthProvider(myCustomProvider); // Register before creating the fixtures
export const test = base.extend(createAuthFixtures());
```

```typescript
// tests/global-setup.ts (registered as globalSetup in the Playwright config)
import { authStorageInit, setAuthProvider, authGlobalInit } from '@seontechnologies/playwright-utils/auth-session';
import myCustomProvider from './support/auth/provider';

export default async function globalSetup() {
  authStorageInit();
  setAuthProvider(myCustomProvider); // Define your auth mechanism
  await authGlobalInit(); // Fetch token once
}
```

With `import { test as authFixture } from './auth-fixture'` added to the module's `mergeTests` call, specs get `authToken` for API calls:

```typescript
import { test, expect } from '../support/merged-fixtures';

test('reads a protected endpoint', async ({ apiRequest, authToken }) => {
  const { status } = await apiRequest({
    method: 'GET',
    path: '/api/profile',
    headers: { Authorization: `Bearer ${authToken}` },
  });

  expect(status).toBe(200);
});
```

The auth-session fixtures also replace `context` and `page`.
With `authSessionEnabled` on (the default), the context opens with the storage state your provider saved, so `page` starts signed in when that state carries your app's session cookies.
Your provider performs the real sign-in or token exchange and returns that state; `authToken` is the token extracted from it for API calls.
The official auth-session docs cover provider setup and per-worker accounts.

### network-recorder

Record and replay network traffic (HAR) for offline testing.
Add `@seontechnologies/playwright-utils/network-recorder/fixtures` to the shared module first.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/network-recorder.html>

```typescript
import { test } from '../support/merged-fixtures';

test('should work with recorded traffic', async ({ page, context, networkRecorder }) => {
  // Records or replays based on PW_NET_MODE
  await networkRecorder.setup(context);

  await page.goto('/dashboard');
  await page.click('#add-item');
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

```typescript
import { test, expect } from '../support/merged-fixtures';

// The stubbed 500 is expected, so opt out of the module's network-error-monitor
test('should handle API errors', { annotation: [{ type: 'skipNetworkMonitoring' }] }, async ({ page, interceptNetworkCall }) => {
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

```typescript
import { test, expect } from '../support/merged-fixtures';

test('should wait for async job completion', async ({ apiRequest, recurse }) => {
  const { body: job } = await apiRequest({ method: 'POST', path: '/api/jobs' });

  // Poll until complete
  const completed = await recurse(
    () => apiRequest({ method: 'GET', path: `/api/jobs/${job.id}` }),
    (result) => result.body.status === 'completed',
    { timeout: 30000, interval: 2000, log: 'Waiting for job to complete' },
  );

  expect(completed.body.status).toBe('completed');
});
```

### log

Structured logging that integrates with Playwright reports.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/log.html>

```typescript
import { test, log } from '../support/merged-fixtures';

test('should login', async ({ page }) => {
  await log.info('Starting login test');

  await page.goto('/login');
  await log.step('Navigated to login page'); // Shows in Playwright UI

  await page.getByLabel('Email').fill('test@example.com');
  await log.debug('Filled email field');
});
```

### file-utils

Read and validate CSV, PDF, XLSX, ZIP files.
These are plain functions, so they need no fixture entry.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/file-utils.html>

```typescript
import { test, expect } from '../support/merged-fixtures';
import { handleDownload, readCSV } from '@seontechnologies/playwright-utils/file-utils';
import path from 'node:path';

const DOWNLOAD_DIR = path.join(__dirname, '../downloads');

test('should export valid CSV', async ({ page }) => {
  const downloadPath = await handleDownload({
    page,
    downloadDir: DOWNLOAD_DIR,
    trigger: () => page.click('button:has-text("Export")'),
  });

  const csvResult = await readCSV({ filePath: downloadPath });
  const { data, headers } = csvResult.content;

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
The Step 3 module includes it, so every spec that imports the module is monitored.

**Official Docs:** <https://seontechnologies.github.io/playwright-utils/network-error-monitor.html>

```typescript
import { test, expect } from '../support/merged-fixtures';

test('should not have API errors', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('button');

  // Test fails automatically if any HTTP 4xx/5xx errors occur
  // Error message shows: "Network errors detected: 2 request(s) failed"
});

// When testing error scenarios, opt out with an annotation
test(
  'should show error message on 404',
  { annotation: [{ type: 'skipNetworkMonitoring' }] }, // Array format
  async ({ page }) => {
    await page.goto('/invalid-page'); // Will 404
    await expect(page.getByText('Page not found')).toBeVisible();
  },
);

// Or opt out an entire describe block
test.describe('error handling', { annotation: [{ type: 'skipNetworkMonitoring' }] }, () => {
  test('handles 404', async ({ page }) => {
    // Monitoring disabled for all tests in block
  });
});
```

## Troubleshooting

### Import Errors

Cannot find module '@seontechnologies/playwright-utils/api-request'

```bash
# Verify the package is installed, then reinstall if it is missing
npm list @seontechnologies/playwright-utils
npm install -D @seontechnologies/playwright-utils
```

Cannot find module '../support/merged-fixtures': the spec's relative path does not reach `{test_dir}/support/merged-fixtures.ts`.
Count directories from the spec to `test_dir`; `tests/api/users.spec.ts` uses `../support/merged-fixtures`.

### TEA Not Using Utilities

TEA generates tests without playwright-utils.

**Causes:**

1. Config not set: `tea_use_playwright_utils = "false"`
2. Skill run before config change
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

**Skill Guides:**

- [Automate Red Mode](/docs/how-to/workflows/run-automate.md#red-mode): Generate tests with utilities
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
