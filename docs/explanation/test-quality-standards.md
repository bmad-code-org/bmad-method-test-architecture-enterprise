---
title: 'Test Quality Standards Explained'
description: Understanding TEA's Definition of Done for deterministic, isolated, and maintainable tests
---

# Test Quality Standards Explained

Test quality standards define what makes a test "good" in TEA. They are the Definition of Done that keeps tests from rotting in review.

## Overview

**TEA's quality principles:**

- **Deterministic** - same result every run
- **Isolated** - no dependencies on other tests
- **Explicit** - assertions visible in the test body
- **Focused** - single responsibility, appropriate size
- **Fast** - executes in reasonable time

Tests that violate these create maintenance burden, slow development, and lose team trust. The failure mode is predictable: PR review says "this test is flaky, please fix", the test never merges, the test is deleted, the coverage is gone. AI generation makes this worse at scale, because a model with no standards produces fifty variations of the same flaky test. [Testing as Engineering](/docs/explanation/testing-as-engineering.md) covers why, and this page is the standard that answers it.

Everything below is one test, showing every violation at once:

```typescript
// ❌ The anti-pattern: this test will rot
test('user can do stuff', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5000); // hard wait: flaky and wastes time

  if (await page.locator('.banner').isVisible()) {
    await page.click('.dismiss'); // conditional: non-deterministic behavior
  }

  try {
    await page.click('#load-more');
  } catch (e) {
    // try-catch as flow control: hides failures
  }

  // ... 1100 more lines: too large to maintain, and no explicit assertions
  // Vague name: what is "stuff"?
});
```

## The Standards

### 1. Determinism (no flakiness)

**Rule:** the test produces the same result every run.

- ❌ No hard waits (`waitForTimeout`)
- ❌ No conditionals for flow control (`if/else`)
- ❌ No try-catch for flow control
- ✅ Wait for the network event that causes the UI change
- ✅ Use explicit waits (`waitForSelector`, `waitForResponse`)

```typescript
// ❌ Flaky
test('flaky test', async ({ page }) => {
  await page.click('button');
  await page.waitForTimeout(2000); // might be too short on CI

  if (await page.locator('.modal').isVisible()) {
    await page.click('.dismiss'); // non-deterministic
  }

  try {
    await expect(page.locator('.success')).toBeVisible();
  } catch (e) {
    // test passes even when the assertion fails
  }
});
```

```typescript
// ✅ Deterministic
test('deterministic test', async ({ page }) => {
  const responsePromise = page.waitForResponse((resp) => resp.url().includes('/api/submit') && resp.ok());

  await page.click('button');
  await responsePromise; // waits for the actual event, not a guess

  // Make the modal deterministic instead of testing whether it appeared
  await expect(page.locator('.modal')).toBeVisible();
  await page.click('.dismiss');

  await expect(page.locator('.success')).toBeVisible(); // fails loudly
});
```

[Network-First Patterns](/docs/explanation/network-first-patterns.md) owns this argument in full: why hard waits escalate, why `waitForSelector` alone is still a guess, the intercept-before-navigate ordering, and the `interceptNetworkCall` form of the same test.

### 2. Isolation (no dependencies)

**Rule:** the test runs independently, with no shared state.

- ✅ Self-cleaning (cleans up after itself)
- ✅ No global state dependencies
- ✅ Can run in parallel
- ✅ Can run in any order
- ✅ Uses unique test data

```typescript
// ❌ Tests depend on execution order
let userId: string; // shared global state

test('create user', async ({ apiRequest }) => {
  const { body } = await apiRequest({
    method: 'POST',
    path: '/api/users',
    body: { email: 'test@example.com' }, // hard-coded: conflicts across parallel workers
  });
  userId = body.id; // stored in a global
});

test('update user', async ({ apiRequest }) => {
  // Fails if the previous test was skipped with .only, and forces serial execution
  await apiRequest({
    method: 'PATCH',
    path: `/api/users/${userId}`,
    body: { name: 'Updated' },
  });
  // No cleanup: the user is left in the database
});
```

```typescript
// ✅ Self-contained
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { faker } from '@faker-js/faker';

test('should update user profile', async ({ apiRequest }) => {
  const testEmail = faker.internet.email(); // dynamic, never collides

  const { status: createStatus, body: user } = await apiRequest({
    method: 'POST',
    path: '/api/users',
    body: { email: testEmail, name: faker.person.fullName() },
  });

  expect(createStatus).toBe(201);

  const { status, body: updated } = await apiRequest({
    method: 'PATCH',
    path: `/api/users/${user.id}`,
    body: { name: 'Updated Name' },
  });

  expect(status).toBe(200);
  expect(updated.name).toBe('Updated Name');

  await apiRequest({ method: 'DELETE', path: `/api/users/${user.id}` }); // cleanup
});
```

Vanilla Playwright reaches the same place with `request.post`, `request.patch`, and `request.delete` plus a manual `await resp.json()` on each. See [what Playwright Utils adds](/docs/explanation/network-first-patterns.md#what-playwright-utils-adds) for the full list, including the `{ status, body }` versus `{ status, responseJson }` distinction.

### 3. Explicit assertions (no hidden validation)

**Rule:** assertions live in the test body, not behind a helper.

- ✅ Assertions in the test itself
- ✅ Specific assertions, not generic `toBeTruthy`
- ✅ Meaningful expectations that test actual behavior

```typescript
// ❌ Assertions buried in a helper
async function verifyProfilePage(page: Page) {
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.email')).toContainText('@');
  await expect(page.locator('.name')).not.toBeEmpty();
}

test('profile page', async ({ page }) => {
  await page.goto('/profile');
  await verifyProfilePage(page); // reader cannot see what is verified, or which line failed
});
```

```typescript
// ✅ Explicit in the test
test('should display profile with correct data', async ({ page }) => {
  await page.goto('/profile');

  await expect(page.locator('h1')).toContainText('Test User');
  await expect(page.locator('.email')).toContainText('test@example.com');
  await expect(page.locator('.bio')).toContainText('Software Engineer');
  await expect(page.locator('img[alt="Avatar"]')).toBeVisible();
});
```

The other way to hide validation is to make it optional or vacuous:

```typescript
// ❌ An assertion that cannot fail, inside a branch that may not run
if (response.ok()) {
  const user = await response.json();
  expect(user).toBeTruthy(); // true for any non-null value; skipped entirely on a failed request
}

// ✅ Assert the status, then assert the specific fields
const { status, body } = await apiRequest({ method: 'POST', path: '/api/users', body: newUser });
expect(status).toBe(201);
expect(body.id).toBeDefined();
expect(body.email).toBe(newUser.email);
```

**Exception:** helpers are fine for setup and cleanup. Only assertions must stay visible.

### 4. Focused tests (appropriate size)

**Rule:** one responsibility per test, reasonable size.

- ✅ Test size ≤ 1000 lines
- ✅ Single responsibility
- ✅ Clear describe and test names
- ✅ Appropriate scope: neither too granular nor too broad

A 2000-line `test('complete user flow')` covering registration, profile setup, settings, and export fails on all four counts: a failure at line 50 blocks the other 1950, nobody can tell which feature broke, and the whole thing runs even when you only care about registration.

```typescript
// ✅ One responsibility each
test('should register new user', async ({ page }) => {
  await page.goto('/register');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/welcome');
  await expect(page.locator('h1')).toContainText('Welcome');
});

// ... separate tests for profile, settings, and export, each under 50 lines
```

### 5. Fast execution (performance budget)

**Rule:** an individual test executes in under 1.5 minutes.

- ✅ Execution under 90 seconds
- ✅ Efficient selectors (`getByRole` over XPath)
- ✅ Minimal redundant actions
- ✅ Parallel execution enabled

```typescript
// ❌ 3+ minutes, 90 seconds of it pure waiting
test('slow test', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(10000); // 10s wasted

  for (let i = 1; i <= 10; i++) {
    await page.click(`a[href="/page-${i}"]`); // intermediate pages nobody asserts on
    await page.waitForTimeout(5000); // 50s wasted
  }

  await page.locator('//div[@class="container"]/section[3]/div[2]/p').click(); // slow, brittle XPath
  await page.waitForTimeout(30000); // 30s wasted

  await expect(page.locator('.result')).toBeVisible();
});
```

```typescript
// ✅ Under 10 seconds: same assertion, no guesses
test('fast test', async ({ page }) => {
  const apiPromise = page.waitForResponse((resp) => resp.url().includes('/api/result') && resp.ok());

  await page.goto('/');
  await page.goto('/page-10'); // navigate straight to the page under test

  await page.getByRole('button', { name: 'Submit' }).click(); // efficient selector

  await apiPromise; // as fast as the API, no faster and no slower

  await expect(page.locator('.result')).toBeVisible();
});
```

## TEA's Quality Scoring

`test-review` scores tests against these standards out of 100. Each item is awarded whole or not at all.

**Determinism (35 points)**

- No hard waits: 10
- No conditionals for flow control: 10
- No try-catch for flow control: 10
- Network-first: 5. The test waits on an actual network event rather than a timeout. A pure API test that awaits its own request satisfies this by construction.

**Isolation (25 points)**

- Self-cleaning: 15
- No global state: 5
- Parallel-safe: 5

**Assertions (20 points)**

- Explicit in the test body: 10
- Specific and meaningful: 10

**Structure (10 points)**

- Test size ≤ 1000 lines: 5
- Clear naming: 5

**Performance (10 points)**

- Execution time < 1.5 min: 10

| Score      | Interpretation | Action                                 |
| ---------- | -------------- | -------------------------------------- |
| **90-100** | Excellent      | Production-ready, minimal changes      |
| **80-89**  | Good           | Minor improvements recommended         |
| **70-79**  | Acceptable     | Address recommendations before release |
| **60-69**  | Needs Work     | Fix critical issues                    |
| **< 60**   | Critical       | Significant refactoring needed         |

### Worked example: user login

```typescript
// Score: 25/100
test('login test', async ({ page }) => {
  await page.goto('/login');
  await page.waitForTimeout(3000); // hard wait: -10, and network-first: -5

  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');

  if (await page.locator('.remember-me').isVisible()) {
    await page.click('.remember-me'); // conditional: -10
  }

  await page.click('button');

  try {
    await page.waitForURL('/dashboard', { timeout: 5000 });
  } catch (e) {
    // try-catch as flow control: -10
  }

  // No assertions: -20. No cleanup: -15. Name says nothing: -5.
});
```

| Category    | Awarded | Why                                                                |
| ----------- | ------- | ------------------------------------------------------------------ |
| Determinism | 0/35    | Hard wait, conditional, try-catch flow, no network-first wait      |
| Isolation   | 10/25   | No cleanup (0/15); no globals (5/5); parallel-safe (5/5)           |
| Assertions  | 0/20    | The test asserts nothing, so it cannot fail                        |
| Structure   | 5/10    | Size is fine (5/5); `login test` does not say what is tested (0/5) |
| Performance | 10/10   | Runs in seconds despite the waste                                  |
| **Total**   | **25**  | Critical: significant refactoring needed                           |

```typescript
// Score: 100/100
test('should login with valid credentials and redirect to dashboard', async ({ page, authSession }) => {
  const loginPromise = page.waitForResponse((resp) => resp.url().includes('/api/auth/login') && resp.ok());

  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const response = await loginPromise; // network-first, no timeout
  const { token } = await response.json();

  expect(token).toBeDefined();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('Welcome back')).toBeVisible();

  // authSession fixture handles cleanup, so the test is self-cleaning without a teardown block
});
```

Determinism 35/35, Isolation 25/25, Assertions 20/20, Structure 10/10, Performance 10/10.

## How TEA Enforces Standards

`atdd` and `automate` generate tests that already meet the standard: network-first waits instead of hard waits, accessible selectors, explicit assertions, and a size and runtime inside budget.

`test-review` audits existing tests and reports violations with the deduction attached:

```markdown
## Critical Issues

### Conditional Flow Control (tests/profile.spec.ts:45)

**Issue:** `if (await page.locator('.banner').isVisible())`
**Score Impact:** -10 (Determinism)
**Fix:** Make banner presence deterministic

## Recommendations

### Extract Fixture (tests/auth.spec.ts)

**Issue:** Login code repeated 5 times
**Score Impact:** -3 (Structure)
**Fix:** Extract to authSession fixture
```

## Definition of Done Checklist

**Test quality:**

- [ ] No hard waits (`waitForTimeout`)
- [ ] No conditionals for flow control
- [ ] No try-catch for flow control
- [ ] Network-first patterns used
- [ ] Assertions explicit in test body
- [ ] Test size ≤ 1000 lines
- [ ] Clear, descriptive test name
- [ ] Self-cleaning (cleanup in afterEach or in the test)
- [ ] Unique test data (no hard-coded values)
- [ ] Execution time < 1.5 minutes
- [ ] Can run in parallel
- [ ] Can run in any order

**Code review:**

- [ ] Test quality score > 80
- [ ] No critical issues from `test-review`
- [ ] Follows project patterns (fixtures, selectors)
- [ ] Test reviewed by a team member

## Common Objections

### "My test needs conditionals for optional elements"

```typescript
// ❌ Branching on what the app happened to render
if (await page.locator('.banner').isVisible()) {
  await page.click('.dismiss');
}

// ✅ Option 1: control the precondition so the banner always shows
await expect(page.locator('.banner')).toBeVisible();
await page.click('.dismiss');

// ✅ Option 2: split into two tests, each with a known precondition
test('should show banner for new users', ...);
test('should not show banner for returning users', ...);
```

### "My test needs try-catch for error handling"

```typescript
// ❌ Swallows the failure
try {
  await page.click('#optional-button');
} catch (e) {
  // silently continue
}

// ✅ Option 1: if the button should exist, let the click fail loudly
await page.click('#optional-button');

// ✅ Option 2: if it genuinely may not exist, test that as the behavior under test
test('should work with optional button', async ({ page }) => {
  const hasButton = (await page.locator('#optional-button').count()) > 0;
  if (hasButton) {
    await page.click('#optional-button');
  }
  // The optionality is now the declared subject of the test, not a hidden branch
});
```

## Related

- [Network-First Patterns](/docs/explanation/network-first-patterns.md) - the determinism rule in full
- [Fixture Architecture](/docs/explanation/fixture-architecture.md) - isolation through fixtures
- [Risk-Based Testing](/docs/explanation/risk-based-testing.md) - how much quality a feature warrants
- [Testing as Engineering](/docs/explanation/testing-as-engineering.md) - why standards exist
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md) - audit against this rubric
- [Knowledge Base Index](/docs/reference/knowledge-base.md) - the test-quality and test-levels fragments
