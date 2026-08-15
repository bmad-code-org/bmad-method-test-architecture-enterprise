# Timing Debugging and Race Condition Fixes

## Principle

Race conditions arise when tests make assumptions about asynchronous timing (network, animations, state updates). **Deterministic waiting** eliminates flakiness by explicitly waiting for observable events (network responses, element state changes) instead of arbitrary timeouts.

## Rationale

**The Problem**: Tests pass locally but fail in CI (different timing), or pass/fail randomly (race conditions). Hard waits (`waitForTimeout`, `sleep`) mask timing issues without solving them.

**The Solution**: Replace all hard waits with event-based waits (`waitForResponse`, `waitFor({ state })`). Implement network-first pattern (intercept before navigate). Use explicit state checks (loading spinner detached, data loaded). This makes tests deterministic regardless of network speed or system load.

**Why This Matters**:

- Eliminates flaky tests (0 tolerance for timing-based failures)
- Works consistently across environments (local, CI, production-like)
- Faster test execution (no unnecessary waits)
- Clearer test intent (explicit about what we're waiting for)

## Pattern Examples

### Example 1: Race Condition Identification (Network-First Pattern)

**Context**: Prevent race conditions by intercepting network requests before navigation

**Implementation**:

```typescript
// tests/timing/race-condition-prevention.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Race Condition Prevention Patterns', () => {
  test('❌ Anti-Pattern: Navigate then intercept (race condition)', async ({ page, context }) => {
    // BAD: Navigation starts before interception ready
    await page.goto('/products'); // ⚠️ Race! API might load before route is set

    await context.route('**/api/products', (route) => {
      route.fulfill({ status: 200, body: JSON.stringify({ products: [] }) });
    });

    // Test may see real API response or mock (non-deterministic)
  });

  test('✅ Pattern: Intercept BEFORE navigate (deterministic)', async ({ page, context }) => {
    // GOOD: Interception ready before navigation
    await context.route('**/api/products', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          products: [
            { id: 1, name: 'Product A', price: 29.99 },
            { id: 2, name: 'Product B', price: 49.99 },
          ],
        }),
      });
    });

    const responsePromise = page.waitForResponse('**/api/products');

    await page.goto('/products'); // Navigation happens AFTER route is ready
    await responsePromise; // Explicit wait for network

    // Test sees mock response reliably (deterministic)
    await expect(page.getByText('Product A')).toBeVisible();
  });

  test('✅ Pattern: Wait for element state change (loading → loaded)', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for loading indicator to appear (confirms load started)
    await page.getByTestId('loading-spinner').waitFor({ state: 'visible' });

    // Wait for loading indicator to disappear (confirms load complete)
    await page.getByTestId('loading-spinner').waitFor({ state: 'detached' });

    // Content now reliably visible
    await expect(page.getByTestId('dashboard-data')).toBeVisible();
  });

  test('✅ Pattern: Explicit visibility check (not just presence)', async ({ page }) => {
    await page.goto('/modal-demo');

    await page.getByRole('button', { name: 'Open Modal' }).click();

    // ❌ Bad: Element exists but may not be visible yet
    // await expect(page.getByTestId('modal')).toBeAttached()

    // ✅ Good: Wait for visibility (accounts for animations)
    await expect(page.getByTestId('modal')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Modal Title' })).toBeVisible();
  });

  test('❌ Anti-Pattern: waitForLoadState("networkidle") in SPAs', async ({ page }) => {
    // ⚠️ Deprecated for SPAs (WebSocket connections never idle)
    // await page.goto('/dashboard')
    // await page.waitForLoadState('networkidle') // May timeout in SPAs

    // ✅ Better: Wait for specific API response
    const responsePromise = page.waitForResponse('**/api/dashboard');
    await page.goto('/dashboard');
    await responsePromise;

    await expect(page.getByText('Dashboard loaded')).toBeVisible();
  });
});
```

**Key Points**:

- Network-first: ALWAYS intercept before navigate (prevents race conditions)
- State changes: Wait for loading spinner detached (explicit load completion)
- Visibility vs presence: `toBeVisible()` accounts for animations, `toBeAttached()` doesn't
- Avoid networkidle: Unreliable in SPAs (WebSocket, polling connections)
- Explicit waits: Document exactly what we're waiting for

---

### Example 2: Deterministic Waiting Patterns (Event-Based, Not Time-Based)

**Context**: Replace all hard waits with observable event waits

**Implementation**:

```typescript
// tests/timing/deterministic-waits.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Deterministic Waiting Patterns', () => {
  test('waitForResponse() with URL pattern', async ({ page }) => {
    const responsePromise = page.waitForResponse('**/api/products');

    await page.goto('/products');
    await responsePromise; // Deterministic (waits for exact API call)

    await expect(page.getByText('Products loaded')).toBeVisible();
  });

  test('waitForResponse() with predicate function', async ({ page }) => {
    const responsePromise = page.waitForResponse((resp) => resp.url().includes('/api/search') && resp.status() === 200);

    await page.goto('/search');
    await page.getByPlaceholder('Search').fill('laptop');
    await page.getByRole('button', { name: 'Search' }).click();

    await responsePromise; // Wait for successful search response

    await expect(page.getByTestId('search-results')).toBeVisible();
  });

  test('waitForFunction() for custom conditions', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for custom JavaScript condition
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="user-count"]');
      return element && parseInt(element.textContent || '0') > 0;
    });

    // User count now loaded
    await expect(page.getByTestId('user-count')).not.toHaveText('0');
  });

  test('waitFor() element state (attached, visible, hidden, detached)', async ({ page }) => {
    await page.goto('/products');

    // Wait for element to be attached to DOM
    await page.getByTestId('product-list').waitFor({ state: 'attached' });

    // Wait for element to be visible (animations complete)
    await page.getByTestId('product-list').waitFor({ state: 'visible' });

    // Perform action
    await page.getByText('Product A').click();

    // Wait for modal to be hidden (close animation complete)
    await page.getByTestId('modal').waitFor({ state: 'hidden' });
  });

  test('Cypress: cy.wait() with aliased intercepts', async () => {
    // Cypress example (not Playwright)
    /*
    cy.intercept('GET', '/api/products').as('getProducts')
    cy.visit('/products')
    cy.wait('@getProducts') // Deterministic wait for specific request

    cy.get('[data-testid="product-list"]').should('be.visible')
    */
  });
});
```

**Key Points**:

- `waitForResponse()`: Wait for specific API calls (URL pattern or predicate)
- `waitForFunction()`: Wait for custom JavaScript conditions
- `waitFor({ state })`: Wait for element state changes (attached, visible, hidden, detached)
- Cypress `cy.wait('@alias')`: Deterministic wait for aliased intercepts
- All waits are event-based (not time-based)

---

### Example 3: Timing Anti-Patterns (What NEVER to Do)

**Context**: Common timing mistakes that cause flakiness

**Problem Examples**:

```typescript
// tests/timing/anti-patterns.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Timing Anti-Patterns to Avoid', () => {
  test('❌ NEVER: page.waitForTimeout() (arbitrary delay)', async ({ page }) => {
    await page.goto('/dashboard');

    // ❌ Bad: Arbitrary 3-second wait (flaky)
    // await page.waitForTimeout(3000)
    // Problem: Might be too short (CI slower) or too long (wastes time)

    // ✅ Good: Wait for observable event
    await page.waitForResponse('**/api/dashboard');
    await expect(page.getByText('Dashboard loaded')).toBeVisible();
  });

  test('❌ NEVER: cy.wait(number) without alias (arbitrary delay)', async () => {
    // Cypress example
    /*
    // ❌ Bad: Arbitrary delay
    cy.visit('/products')
    cy.wait(2000) // Flaky!

    // ✅ Good: Wait for specific request
    cy.intercept('GET', '/api/products').as('getProducts')
    cy.visit('/products')
    cy.wait('@getProducts') // Deterministic
    */
  });

  test('❌ NEVER: Multiple hard waits in sequence (compounding delays)', async ({ page }) => {
    await page.goto('/checkout');

    // ❌ Bad: Stacked hard waits (6+ seconds wasted)
    // await page.waitForTimeout(2000) // Wait for form
    // await page.getByTestId('email').fill('test@example.com')
    // await page.waitForTimeout(1000) // Wait for validation
    // await page.getByTestId('submit').click()
    // await page.waitForTimeout(3000) // Wait for redirect

    // ✅ Good: Event-based waits (no wasted time)
    await page.getByTestId('checkout-form').waitFor({ state: 'visible' });
    await page.getByTestId('email').fill('test@example.com');
    await page.waitForResponse('**/api/validate-email');
    await page.getByTestId('submit').click();
    await page.waitForURL('**/confirmation');
  });

  test('❌ NEVER: waitForLoadState("networkidle") in SPAs', async ({ page }) => {
    // ❌ Bad: Unreliable in SPAs (WebSocket connections never idle)
    // await page.goto('/dashboard')
    // await page.waitForLoadState('networkidle') // Timeout in SPAs!

    // ✅ Good: Wait for specific API responses
    await page.goto('/dashboard');
    await page.waitForResponse('**/api/dashboard');
    await page.waitForResponse('**/api/user');
    await expect(page.getByTestId('dashboard-content')).toBeVisible();
  });

  test('❌ NEVER: Sleep/setTimeout in tests', async ({ page }) => {
    await page.goto('/products');

    // ❌ Bad: Node.js sleep (blocks test thread)
    // await new Promise(resolve => setTimeout(resolve, 2000))

    // ✅ Good: Playwright auto-waits for element
    await expect(page.getByText('Products loaded')).toBeVisible();
  });
});
```

**Why These Fail**:

- **Hard waits**: Arbitrary timeouts (too short → flaky, too long → slow)
- **Stacked waits**: Compound delays (wasteful, unreliable)
- **networkidle**: Broken in SPAs (WebSocket/polling never idle)
- **Sleep**: Blocks execution (wastes time, doesn't solve race conditions)

**Better Approach**: Use event-based waits from examples above

---

### Example 4: Fixtures Derived From the Live Clock

**Context**: A hard wait makes a test slow and flaky. Reading the live clock makes it flaky on a schedule nobody can reproduce. The test that builds an expiry, a token lifetime, a TTL, or a scheduling boundary from `Date.now()` passes all day and fails at a month boundary, at midnight UTC, on the last day of February, or on the CI runner whose clock drifted four seconds.

This is a HIGH rather than a MEDIUM because of what these values usually govern. A token lifetime computed from the wall clock is a security boundary tested against a moving target: the test cannot distinguish "the expiry logic is correct" from "the expiry has not happened yet."

The fix is to control time rather than to read it. Freeze it, then move it deliberately to the boundary the behavior is about.

**Implementation**:

```typescript
// ❌ BAD: the boundary moves with the clock, and the failure lands on a Tuesday
const token = issueToken({ expiresAt: Date.now() + 3600_000 });
await sleep(1000);
expect(isExpired(token)).toBe(false); // proves nothing about expiry

// ✅ GOOD: freeze, then step across the boundary on purpose.
// Restore in afterEach, never as the last line of the test: an assertion that
// throws would skip that line and leave every later test on a fake clock, which
// is the unreset-shared-state defect wearing a different hat.
afterEach(() => {
  vi.useRealTimers();
});

test('the token expires at its TTL', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const token = issueToken({ ttlSeconds: 3600 });
  expect(isExpired(token)).toBe(false);
  vi.advanceTimersByTime(3601_000);
  expect(isExpired(token)).toBe(true); // the boundary is what is under test
});
```

```python
# ❌ BAD: the fixture is different on every run
expires_at = time.time() + 3600

# ✅ GOOD: pin the clock, then move it
with freeze_time("2026-01-01T00:00:00Z") as frozen:
    token = issue_token(ttl_seconds=3600)
    assert not is_expired(token)
    frozen.tick(3601)
    assert is_expired(token)
```

**Key Points**:

- A time-bounded value built from the live clock is not a fixture, it is a variable
- Freeze the clock and advance it deliberately; the boundary is the behavior under test
- Restore real timers in `afterEach`, so a failing assertion cannot leave a later test on a fake clock
- Where the production code already takes an injectable clock, pass one. A production seam the application itself uses beats a test-only seam that only the suite knows about
- A timestamp merely stamped into a record and never asserted against is not this defect; the row is about values that govern an expiry, a lifetime, a TTL, or a schedule

### Example 5: Promises Nobody Awaited

**Context**: The most common way for a race condition to be in the test rather than in the application. A promise-returning call that is neither awaited nor returned starts its work and hands control straight to the next line, so the assertion runs against the state from before the effect. Usually it still passes, because the effect is fast. It fails on the loaded CI runner, which is the one machine where the failure is least reproducible.

An unawaited rejection is the second half: it surfaces as an unhandled rejection attributed to whichever test happened to be running when it settled, so the reported test and the broken test are different tests.

**Implementation**:

```typescript
// ❌ BAD: the click may not have landed when the assertion runs
test('adds the item to the cart', async ({ page }) => {
  page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});

// ❌ BAD: the setup promise is still in flight
test('shows the seeded order', async ({ page, request }) => {
  seedOrder(request, { id: 'ord-1' });
  await page.goto('/orders/ord-1');
  await expect(page.getByText('ord-1')).toBeVisible();
});

// ✅ GOOD: await the effect before asserting on it
test('adds the item to the cart', async ({ page }) => {
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});
```

**Key Points**:

- Every promise-returning call in a test body is awaited or explicitly returned
- The symptom is a test that passes locally and fails on a loaded runner, which reads as flake rather than as a missing `await`
- An unhandled rejection is usually attributed to the wrong test, so treat one as a signal to audit `await` coverage across the file, not only in the named test
- `no-floating-promises` in the linter catches this class before the suite ever runs; prefer that to catching it in review

---

## Async Debugging Techniques

### Technique 1: Promise Chain Analysis

```typescript
test('debug async waterfall with console logs', async ({ page }) => {
  console.log('1. Starting navigation...');
  await page.goto('/products');

  console.log('2. Waiting for API response...');
  const response = await page.waitForResponse('**/api/products');
  console.log('3. API responded:', response.status());

  console.log('4. Waiting for UI update...');
  await expect(page.getByText('Products loaded')).toBeVisible();
  console.log('5. Test complete');

  // Console output shows exactly where timing issue occurs
});
```

### Technique 2: Network Waterfall Inspection (DevTools)

```typescript
test('inspect network timing with trace viewer', async ({ page }) => {
  await page.goto('/dashboard');

  // Generate trace for analysis
  // npx playwright test --trace on
  // npx playwright show-trace trace.zip

  // In trace viewer:
  // 1. Check Network tab for API call timing
  // 2. Identify slow requests (>1s response time)
  // 3. Find race conditions (overlapping requests)
  // 4. Verify request order (dependencies)
});
```

### Technique 3: Trace Viewer for Timing Visualization

```typescript
test('use trace viewer to debug timing', async ({ page }) => {
  // Run with trace: npx playwright test --trace on

  await page.goto('/checkout');
  await page.getByTestId('submit').click();

  // In trace viewer, examine:
  // - Timeline: See exact timing of each action
  // - Snapshots: Hover to see DOM state at each moment
  // - Network: Identify slow/failed requests
  // - Console: Check for async errors

  await expect(page.getByText('Success')).toBeVisible();
});
```

---

## Race Condition Checklist

Before deploying tests:

- [ ] **Network-first pattern**: All routes intercepted BEFORE navigation (no race conditions)
- [ ] **Explicit waits**: Every navigation followed by `waitForResponse()` or state check
- [ ] **No hard waits**: Zero instances of `waitForTimeout()`, `cy.wait(number)`, `sleep()`
- [ ] **Element state waits**: Loading spinners use `waitFor({ state: 'detached' })`
- [ ] **Visibility checks**: Use `toBeVisible()` (accounts for animations), not just `toBeAttached()`
- [ ] **Response validation**: Wait for successful responses (`resp.ok()` or `status === 200`)
- [ ] **Trace viewer analysis**: Generate traces to identify timing issues (network waterfall, console errors)
- [ ] **CI/local parity**: Tests pass reliably in both environments (no timing assumptions)

## Integration Points

- **Used in workflows**: `*automate` (healing timing failures), `*test-review` (detect hard wait anti-patterns), `*framework` (configure timeout standards)
- **Related fragments**: `test-healing-patterns.md` (race condition diagnosis), `network-first.md` (interception patterns), `playwright-config.md` (timeout configuration), `visual-debugging.md` (trace viewer analysis)
- **Tools**: Playwright Inspector (`--debug`), Trace Viewer (`--trace on`), DevTools Network tab

_Source: Playwright timing best practices, network-first pattern from test-resources-for-ai, production race condition debugging_
