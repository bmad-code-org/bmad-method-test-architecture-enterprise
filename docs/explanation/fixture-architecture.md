---
title: 'Fixture Architecture Explained'
description: Understanding TEA's pure function → fixture → composition pattern for reusable test utilities
---

# Fixture Architecture Explained

Keep utility logic separate from fixture lifecycle code.
Pass dependencies into helpers, wrap them in fixtures, then compose the fixtures tests need.
TEA calls this its pure-function → fixture → composition pattern.
A helper that sends an HTTP request still has side effects; dependency injection makes it testable outside the fixture lifecycle.

## Overview

1. Write a helper with explicit dependencies so it can be unit-tested.
2. Wrap it in a framework fixture (Playwright, Cypress), which is where portability is lost.
3. Compose fixtures with `mergeTests`.
4. Package for reuse across projects.

The order is what makes it work: everything below the fixture layer stays testable and portable, and the framework-specific part is one thin file.

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'fontSize':'14px'}}}%%
flowchart TD
    Start([Testing Need]) --> Pure[Step 1: Pure Function<br/>helpers/api-request.ts]
    Pure -->|Unit testable<br/>Framework agnostic| Fixture[Step 2: Fixture Wrapper<br/>fixtures/api-request.ts]
    Fixture -->|Injects framework<br/>dependencies| Compose[Step 3: Composition<br/>fixtures/index.ts]
    Compose -->|mergeTests| Use[Step 4: Use in Tests<br/>tests/**.spec.ts]

    Pure -.->|Can test in isolation| UnitTest[Unit Tests<br/>No framework needed]
    Fixture -.->|Reusable pattern| Other[Other Projects<br/>Package export]
    Compose -.->|Combine utilities| Multi[Multiple Fixtures<br/>One test]

    style Pure fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    style Fixture fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style Compose fill:#f3e5f5,stroke:#6a1b9a,stroke-width:2px
    style Use fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    style UnitTest fill:#c8e6c9,stroke:#2e7d32,stroke-width:1px
    style Other fill:#c8e6c9,stroke:#2e7d32,stroke-width:1px
    style Multi fill:#c8e6c9,stroke:#2e7d32,stroke-width:1px
```

## The Problem

### Framework-First Approach (Common Anti-Pattern)

```typescript
// ❌ Built as a fixture from the start
export const test = base.extend({
  apiRequest: async ({ request }, use) => {
    await use(async (options) => {
      const response = await request.fetch(options.url, {
        method: options.method,
        data: options.data,
      });

      if (!response.ok()) {
        throw new Error(`API request failed: ${response.status()}`);
      }

      return response.json();
    });
  },
});
```

Testing this helper in isolation requires setting up the fixture lifecycle.
Extract the request logic so a unit test can supply a mock client.

### Copy-Paste Utilities

```typescript
// The alternative failure mode: the same block in every spec file
test('test 1', async ({ request }) => {
  const response = await request.post('/api/users', { data: {...} });
  const body = await response.json();
  if (!response.ok()) throw new Error('Failed');
});
```

Duplication with drift: error handling diverges between copies, and changing the behavior means editing fifty tests.

## The Solution: Three-Step Pattern

### Step 1: Pure Function

```typescript
// helpers/api-request.ts

export type ApiRequestParams = {
  request: {
    fetch: (
      url: string,
      options: { method: string; data?: unknown; headers: Record<string, string> },
    ) => Promise<{
      ok: () => boolean;
      status: () => number;
      json: () => Promise<Record<string, unknown>>;
    }>;
  };
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
};

export type ApiResponse = { status: number; body: Record<string, unknown> };

/**
 * Make API request with automatic error handling
 * Dependencies are supplied by the caller
 */
export async function apiRequest({
  request, // Passed in (dependency injection)
  method,
  url,
  data,
  headers = {},
}: ApiRequestParams): Promise<ApiResponse> {
  const response = await request.fetch(url, {
    method,
    data,
    headers,
  });

  if (!response.ok()) {
    throw new Error(`API request failed: ${response.status()}`);
  }

  return {
    status: response.status(),
    body: await response.json(),
  };
}

// ✅ Can unit test this function!
describe('apiRequest', () => {
  it('should throw on non-OK response', async () => {
    const mockRequest = {
      fetch: vi.fn().mockResolvedValue({ ok: () => false, status: () => 500 }),
    };

    await expect(
      apiRequest({
        request: mockRequest,
        method: 'GET',
        url: '/api/test',
      }),
    ).rejects.toThrow('API request failed: 500');
  });
});
```

The helper accepts a client with the `fetch`, `ok`, `status`, and `json` methods used above.
A unit test can supply a mock with that interface.
Using a different HTTP client requires an adapter with the same methods.

### Step 2: Fixture Wrapper

```typescript
// fixtures/api-request.ts
import { test as base } from '@playwright/test';
import { apiRequest as apiRequestFn } from '../helpers/api-request';
import type { ApiRequestParams, ApiResponse } from '../helpers/api-request';

/**
 * Playwright fixture wrapping the pure function
 */
type ApiRequestFixture = (params: Omit<ApiRequestParams, 'request'>) => Promise<ApiResponse>;

export const test = base.extend<{ apiRequest: ApiRequestFixture }>({
  apiRequest: async ({ request }, use) => {
    // Inject framework dependency (request)
    await use((params) => apiRequestFn({ request, ...params }));
  },
});

export { expect } from '@playwright/test';
```

The wrapper injects the client and manages fixture access.
A different runner needs its own lifecycle wrapper and a compatible client adapter.

### Step 3: Composition with mergeTests

```typescript
// fixtures/index.ts
import { mergeTests } from '@playwright/test';
import { test as apiRequestTest } from './api-request';
import { test as authSessionTest } from './auth-session';
import { test as logTest } from './log';

/**
 * Compose all fixtures into one test
 */
export const test = mergeTests(apiRequestTest, authSessionTest, logTest);

export { expect } from '@playwright/test';
```

**Usage:**

```typescript
// tests/profile.spec.ts
import { test, expect } from '../support/fixtures';

test('should update profile', async ({ apiRequest, authToken, log }) => {
  log.info('Starting profile update test');

  // Use API request fixture (matches pure function signature)
  const { status, body } = await apiRequest({
    method: 'PATCH',
    url: '/api/profile',
    data: { name: 'New Name' },
    headers: { Authorization: `Bearer ${authToken}` },
  });

  expect(status).toBe(200);
  expect(body.name).toBe('New Name');

  log.info('Profile updated successfully');
});
```

**Note:** This example uses the vanilla pure function signature (`url`, `data`).
Playwright Utils uses different parameter names (`path`, `body`).
See [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md) for the utilities API.

**Note:** `authToken` requires auth-session fixture setup with provider configuration.
See [auth-session documentation](https://seontechnologies.github.io/playwright-utils/auth-session.html).

One import, every fixture, and TypeScript knows the type of each one.

## How It Works in TEA

`framework` creates helpers and fixtures under `tests/support/`.
With Playwright Utils enabled, tests import the composed fixtures from `support/merged-fixtures.ts`:

```text
tests/
├── support/
│   ├── helpers/           # Pure functions
│   │   ├── api-request.ts
│   │   └── auth-session.ts
│   ├── merged-fixtures.ts # Composition
│   └── fixtures/          # Framework wrappers
│       ├── api-request.ts
│       ├── auth-session.ts
│       └── auth-fixture.ts # Project auth provider
└── e2e/
    └── example.spec.ts    # Uses composed fixtures
```

`test-review` checks the applicable fixture, isolation, and configured-utility criteria.
Its criteria registry determines which findings affect the score.

## Making Fixtures Reusable Across Projects

### Option 1: Use Playwright Utils (recommended)

```bash
npm install -D @seontechnologies/playwright-utils
```

```typescript
import { test as base, mergeTests } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';

const authFixtureTest = base.extend(createAuthFixtures());
export const test = mergeTests(apiRequestFixture, authFixtureTest);
```

Auth-session requires provider configuration.
See the [auth-session setup guide](https://seontechnologies.github.io/playwright-utils/auth-session.html).

Playwright Utils includes `api-request`, `intercept-network-call`, `auth-session`, `network-recorder`, `network-error-monitor`, `recurse`, `burn-in`, `file-utils`, `log`, and `webhook`.

### Option 2: Build your own

Build your own when you need company-specific patterns, a custom authentication system, or something the utilities do not cover.
Export one subpath per fixture so consumers compose only what they need:

```json
// package.json
{
  "name": "@company/test-utils",
  "exports": {
    "./api-request": "./fixtures/api-request.ts",
    "./auth-session": "./fixtures/auth-session.ts",
    "./log": "./fixtures/log.ts"
  }
}
```

```typescript
import { test as apiTest } from '@company/test-utils/api-request';
import { test as authTest } from '@company/test-utils/auth-session';
import { mergeTests } from '@playwright/test';

export const test = mergeTests(apiTest, authTest);
```

## Anti-Pattern: The God Fixture

```typescript
// ❌ Everything in one fixture
export const test = base.extend({
  testUtils: async ({ page, request, context }, use) => {
    await use({
      // 50 different methods crammed into one fixture
      apiRequest: async (...) => { },
      login: async (...) => { },
      createUser: async (...) => { },
      deleteUser: async (...) => { },
      uploadFile: async (...) => { },
      // ... 45 more methods
    });
  }
});
```

The single fixture couples unrelated helpers to the same dependencies and lifecycle.
Split it by concern so tests can compose the parts they need.

```typescript
// ✅ One concern per fixture

// api-request.ts
export const test = base.extend({ apiRequest });

// auth-session.ts
export const test = base.extend({ authSession });

// log.ts
export const test = base.extend({ log });

// Compose as needed
import { mergeTests } from '@playwright/test';
export const test = mergeTests(apiRequestTest, authSessionTest, logTest);
```

Unit-test the extracted helpers and compose fixtures by concern.

## When to Use This Pattern

### Always Use For:

**Reusable utilities:**

- API request helpers
- Authentication handlers
- File operations
- Network mocking

**Test infrastructure:**

- Shared fixtures across teams
- Packaged utilities (playwright-utils)
- Company-wide test standards

### Consider Skipping For:

**One-off test setup:**

```typescript
// Simple one-time setup: inline is fine
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.click('#accept-cookies');
});
```

**Test-specific helpers:**

```typescript
// Used in one test file only: keep local
function createTestUser(name: string) {
  return { name, email: `${name}@test.com` };
}
```

## Related

- [Test Quality Standards](/docs/explanation/test-quality-standards.md): the isolation rule fixtures exist to satisfy
- [Network-First Patterns](/docs/explanation/network-first-patterns.md): `interceptNetworkCall` as a fixture
- [How to Set Up Test Framework](/docs/how-to/workflows/setup-test-framework.md): TEA scaffolds this layout
- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md): the packaged fixtures
- [How to Run Automate](/docs/how-to/workflows/run-automate.md): fixture composition in generated tests
- [Knowledge Base Index](/docs/reference/knowledge-base.md): the fixture-architecture and fixtures-composition fragments
