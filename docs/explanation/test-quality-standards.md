---
title: 'Test Quality Standards Explained'
description: Understanding TEA's Definition of Done for deterministic, isolated, and maintainable tests
---

# Test Quality Standards Explained

Test quality standards define what makes a test "good" in TEA.
They are the Definition of Done that keeps tests from rotting in review.

## Overview

**TEA's quality principles:**

- **Deterministic**: same result every run
- **Isolated**: no dependencies on other tests
- **Explicit**: assertions visible in the test body
- **Focused**: single responsibility, appropriate size
- **Fast**: executes in reasonable time

A test needs to fail when its intended behavior breaks and pass when that behavior holds.
These standards make the result repeatable and the failure readable.

This example combines several violations:

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

The result must follow the supplied inputs and system behavior.

- ❌ No hard waits (`waitForTimeout`)
- ❌ No branches that skip assertions or accept whichever result the system returned
- ❌ No catch blocks that swallow failures
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
  await responsePromise; // waits for the matching response

  // Set up a known state in which the modal appears
  await expect(page.locator('.modal')).toBeVisible();
  await page.click('.dismiss');

  await expect(page.locator('.success')).toBeVisible(); // fails loudly
});
```

[Network-First Patterns](/docs/explanation/network-first-patterns.md) owns this argument in full: why hard waits escalate, when to add network evidence to a UI assertion, the intercept-before-navigate ordering, and the `interceptNetworkCall` form of the same test.

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
  const testEmail = faker.internet.email(); // generated data reduces collisions

  const { status: createStatus, body: user } = await apiRequest({
    method: 'POST',
    path: '/api/users',
    body: { email: testEmail, name: faker.person.fullName() },
  });

  expect(createStatus).toBe(201);

  try {
    const { status, body: updated } = await apiRequest({
      method: 'PATCH',
      path: `/api/users/${user.id}`,
      body: { name: 'Updated Name' },
    });

    expect(status).toBe(200);
    expect(updated.name).toBe('Updated Name');
  } finally {
    await apiRequest({ method: 'DELETE', path: `/api/users/${user.id}` });
  }
});
```

Vanilla Playwright reaches the same place with `request.post`, `request.patch`, and `request.delete` plus a manual `await resp.json()` on each.
See [what Playwright Utils adds](/docs/explanation/network-first-patterns.md#what-playwright-utils-adds) for the full list, including the `{ status, body }` versus `{ status, responseJson }` distinction.

### 3. Explicit assertions (no hidden validation)

Keep behavior assertions visible in the test body.

- ✅ Assertions in the test itself
- ✅ Assert the expected values
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
// ❌ A shape-only assertion skipped when the request fails
if (response.ok()) {
  const user = await response.json();
  expect(user).toBeTruthy(); // accepts any truthy value; skipped on a failed request
}

// ✅ Assert the status, then assert the specific fields
const { status, body } = await apiRequest({ method: 'POST', path: '/api/users', body: newUser });
expect(status).toBe(201);
expect(body.id).toBeDefined();
expect(body.email).toBe(newUser.email);
```

**Exception:** helpers are fine for setup and cleanup.
Only assertions must stay visible.

### 4. Focused tests (appropriate size)

Keep each test focused on one behavior.
The review registry flags test files over 1000 lines.

- ✅ Reviewed test file ≤ 1000 lines
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

All 35 registry rows are mapped to knowledge fragments.
`npm run test:criteria-fragments` checks that traceability against the registry and the fragment index.

`test-review` starts at 100 and applies a severity deduction ledger.
The criteria registry fixes the severity of each finding and the conditions under which it applies.

| Severity | Deduction per finding | Effective score cap |
| -------- | --------------------- | ------------------- |
| CRITICAL | 10                    | 69                  |
| HIGH     | 5                     | 79                  |
| MEDIUM   | 2                     | 89                  |
| LOW      | 1                     | 99                  |

Five bonus categories each award 0 or 5: fixture setup, data factories, network-first ordering, isolation, and stable test IDs.
A bonus applies only when its criterion holds across every reviewed file.

```text
raw score = clamp(100 - deductions + bonuses, 0, 100)
effective score = min(raw score, highest-severity cap)
```

The highest finding severity also determines the recommendation:

| Findings                                      | Recommendation        |
| --------------------------------------------- | --------------------- |
| Any CRITICAL                                  | Block                 |
| Any HIGH, or effective score below 70         | Request Changes       |
| MEDIUM or LOW findings with score at least 70 | Approve with Comments |
| No findings                                   | Approve               |

Grades are A at 90+, B at 80+, C at 70+, D at 60+, and F below 60.
The report shows the deductions, bonuses, and cap so a reviewer can check the arithmetic.

### Worked example: user login

A review with one HIGH hard wait and two LOW selector findings deducts 5 + 1 + 1 = 7 points.
With no bonuses, the raw score is 93.
The HIGH cap makes the effective score 79, grade C, and the recommendation is Request Changes.

Fix the findings, then re-run the review.
A numeric score alone does not establish that the test exercises the right behavior.

## How TEA Enforces Standards

`atdd` and `automate` generate tests that already meet the standard: response waits registered before actions, accessible selectors, explicit assertions, and a size and runtime inside budget.

`test-review` audits existing tests and reports violations with the deduction attached:

```markdown
## High Issues

### Conditional Flow Control (tests/profile.spec.ts:45)

**Issue:** `if (await page.locator('.banner').isVisible())`
**Severity:** HIGH
**Score Impact:** -5, with the HIGH score cap of 79
**Fix:** Make banner presence deterministic

## Recommendations

### Extract Fixture (tests/auth.spec.ts)

**Issue:** Login code repeated 5 times
**Score Impact:** Determined by the matching registry row
**Fix:** Extract to authSession fixture
```

## Definition of Done Checklist

**Test quality:**

- [ ] No hard waits (`waitForTimeout`)
- [ ] No branches that hide a failure
- [ ] No swallowed assertion failures
- [ ] Network-first patterns used
- [ ] Assertions explicit in test body
- [ ] Reviewed test file ≤ 1000 lines
- [ ] Cleanup runs after success and failure (fixture teardown, afterEach, or finally)
- [ ] Unique identifiers for records created by each test
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

// ✅ Option 2: give each state a separate test with a fixed precondition
test('optional button is available to an eligible user', async ({ page }) => {
  // Fixture setup supplies an eligible user.
  await page.goto('/profile');
  await expect(page.locator('#optional-button')).toBeVisible();
  await page.locator('#optional-button').click();
  await expect(page.locator('.result')).toHaveText('Complete');
});

test('optional button is absent for an ineligible user', async ({ page }) => {
  // Fixture setup supplies an ineligible user.
  await page.goto('/profile');
  await expect(page.locator('#optional-button')).toHaveCount(0);
});
```

## Related

- [Network-First Patterns](/docs/explanation/network-first-patterns.md): the determinism rule in full
- [Fixture Architecture](/docs/explanation/fixture-architecture.md): isolation through fixtures
- [Risk-Based Testing](/docs/explanation/risk-based-testing.md): how much quality a feature warrants
- [Testing as Engineering](/docs/explanation/testing-as-engineering.md): why standards exist
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md): audit against this rubric
- [Knowledge Base Index](/docs/reference/knowledge-base.md): the test-quality and test-levels fragments
