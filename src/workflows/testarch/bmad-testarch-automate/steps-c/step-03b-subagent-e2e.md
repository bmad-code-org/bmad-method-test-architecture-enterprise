---
name: 'step-03b-subagent-e2e'
description: 'Subagent: Generate E2E tests only'
subagent: true
outputFile: '/tmp/tea-automate-e2e-tests-{{timestamp}}.json'
---

# Subagent 3B: Generate E2E Tests

## SUBAGENT CONTEXT

This is an **isolated subagent** running in parallel with API test generation.

**What you have from parent workflow:**

- Target features/user journeys identified in Step 2
- Knowledge fragments loaded: playwright-utils-mandate, overview, intercept-network-call, network-error-monitor, fixtures-composition, log, auth-session, network-recorder, fixture-architecture, network-first, selector-resilience, playwright-cli
- Config: test framework, `use_playwright_utils` (default `true`)
- Coverage plan: which user journeys need E2E testing

**When `use_playwright_utils` is `true`, `playwright-utils-mandate.md` binds this worker.** Generate in the playwright-utils style without being asked. `network-first.md` and `fixture-architecture.md` still supply the principles — intercept before you navigate, compose fixtures once — but the mechanism is `interceptNetworkCall` and `mergeTests`, not `page.route` and per-spec `base.extend`.

**Your task:** Generate E2E tests ONLY (not API, not fixtures, not other test types).

---

## MANDATORY EXECUTION RULES

- 📖 Read this entire subagent file before acting
- ✅ Generate E2E tests ONLY
- ✅ Output structured JSON to temp file
- ✅ Follow knowledge fragment patterns
- ❌ Do NOT generate API tests (that's subagent 3A)
- ❌ Do NOT run tests (that's step 4)
- ❌ Do NOT generate fixtures yet (that's step 3C aggregation)

---

## SUBAGENT TASK

### 1. Identify User Journeys

From the coverage plan (Step 2 output), identify:

- Which user journeys need E2E coverage
- Critical user paths (authentication, checkout, profile, etc.)
- UI interactions required
- Expected visual states

### 2. Browser Interaction (Selector Verification)

**Automation mode:** `config.tea_browser_automation`

If `auto` (fall back to MCP if CLI unavailable; if neither available, generate from best practices):

- Open the target page first, then verify selectors with a snapshot:
  `playwright-cli -s=tea-automate-{{timestamp}} open <target_url>`
  `playwright-cli -s=tea-automate-{{timestamp}} snapshot` → map refs to Playwright locators
  - ref `{role: "button", name: "Submit"}` → `page.getByRole('button', { name: 'Submit' })`
  - ref `{role: "textbox", name: "Email"}` → `page.getByRole('textbox', { name: 'Email' })`
- `playwright-cli -s=tea-automate-{{timestamp}} close` when done

If `cli` (CLI only — do NOT fall back to MCP; generate from best practices if CLI unavailable):

- Open the target page first, then verify selectors with a snapshot:
  `playwright-cli -s=tea-automate-{{timestamp}} open <target_url>`
  `playwright-cli -s=tea-automate-{{timestamp}} snapshot` → map refs to Playwright locators
  - ref `{role: "button", name: "Submit"}` → `page.getByRole('button', { name: 'Submit' })`
  - ref `{role: "textbox", name: "Email"}` → `page.getByRole('textbox', { name: 'Email' })`
- `playwright-cli -s=tea-automate-{{timestamp}} close` when done

> **Session Hygiene:** Always close sessions using `playwright-cli -s=tea-automate-{{timestamp}} close`. Do NOT use `close-all` — it kills every session on the machine and breaks parallel execution.

If `mcp`:

- Use MCP tools for selector verification (current behavior)

If `none`:

- Generate selectors from best practices without browser verification

### 3. Generate E2E Test Files

For each user journey, create test file in `tests/e2e/[feature].spec.ts`:

**Test Structure — when `use_playwright_utils` is `true` (the default). This is the shape you emit:**

```typescript
import { test, expect, log } from '../support/merged-fixtures';

test.describe('[Feature] E2E User Journey', () => {
  test('[P0] should complete [user journey]', async ({ page, interceptNetworkCall }) => {
    // Declare the interception BEFORE navigating — this is network-first,
    // expressed through the utility instead of page.route.
    const featureCall = interceptNetworkCall({ url: '**/api/feature' });

    await page.goto('/feature');

    const { responseJson, status } = await featureCall;
    expect(status).toBe(200);

    await log.step('Submit the form');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Success')).toBeVisible();
    expect(responseJson.items).toHaveLength(3);
  });

  // This test stubs a 5xx on purpose, so it opts out of network monitoring.
  test(
    '[P1] should handle [error scenario]',
    { annotation: [{ type: 'skipNetworkMonitoring' }] },
    async ({ page, interceptNetworkCall }) => {
      // Stub the failure instead of waiting for the backend to produce one.
      const failingCall = interceptNetworkCall({
        url: '**/api/feature',
        fulfillResponse: { status: 500, body: { message: 'Internal error' } },
      });

      await page.goto('/feature');
      await failingCall;

      await expect(page.getByRole('alert')).toContainText('Something went wrong');
    },
  );
});
```

Note what the merged fixtures give you for free: `network-error-monitor` is in the merge, so a silent backend 4xx/5xx fails the test even when the UI assertions pass. That is why the second test carries `skipNetworkMonitoring` — a test that deliberately drives an error response opts out per `network-error-monitor.md` rather than being dropped from the merge. Add the annotation only where the error is the subject of the test.

**Test Structure — when `use_playwright_utils` is `false`:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('[Feature] E2E User Journey', () => {
  test('[P0] should complete [user journey]', async ({ page }) => {
    await page.route('**/api/feature', (route) => route.continue());
    await page.goto('/feature');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

**Playwright Utils Mandate (when `use_playwright_utils` is `true`):**

Follow `playwright-utils-mandate.md`. In an E2E worker that means:

- ✅ `interceptNetworkCall({ url })` to observe a call, `interceptNetworkCall({ url, fulfillResponse })` to stub one. Declared before `page.goto`, awaited after.
- ✅ `test` imported from the project's merged fixtures, so `interceptNetworkCall`, `networkErrorMonitor`, `apiRequest`, and `authToken` are all in the signature. `expect` comes from the same module, which re-exports Playwright's — playwright-utils does not export one of its own.
- ✅ `apiRequest` for API-driven setup and teardown inside a UI test — seeding a record, cleaning one up. Never the raw `request` fixture.
- ✅ `authToken` from the auth-session fixture for a logged-in starting state, rather than driving the login form in every test. If no auth provider is wired, say so in the summary and name the wiring needed; do not inline a login as if it were the intended pattern.
- ✅ `recurse` for a UI condition that genuinely needs polling beyond what `expect().toBeVisible()` covers.
- ✅ `log.step` for journey milestones, so the HTML report reads as a narrative.
- ✅ `networkRecorder` when the coverage plan calls for offline or backend-free runs (recommended; needs a HAR directory).
- ❌ `page.route` or `page.waitForResponse` on an application API endpoint, `page.waitForTimeout`, `console.log`, `import { test } from '@playwright/test'` in a spec.
- ⚠️ `page.route` is still correct for blocking third-party scripts, analytics, fonts, and images. That is not a deviation.

Package and subpaths are exactly `@seontechnologies/playwright-utils` and its documented subpaths. No other package name is valid.

Before writing each file, run the self-check in `playwright-utils-mandate.md`. If a vanilla call survives, either fix it or mark it `// playwright-utils deviation: <reason>` and list it in the output `summary`.

**Requirements:**

- ✅ Follow fixture architecture principles (from fixture-architecture fragment; mechanism per the mandate when enabled)
- ✅ Network-first: interception declared before navigation (from network-first fragment; mechanism per the mandate when enabled)
- ✅ Use resilient selectors: getByRole, getByText, getByLabel (from selector-resilience fragment). Never CSS attribute selectors such as `[name="email"]` or `button:has-text(...)`
- ✅ Include priority tags [P0], [P1], [P2], [P3]
- ✅ Test complete user journeys (not isolated clicks)
- ✅ Use proper TypeScript types
- ✅ Deterministic waits (no hard sleeps, use expect().toBeVisible())

### 4. Track Fixture Needs

Identify fixtures needed for E2E tests:

- Page object models (if complex)
- Authentication fixtures (logged-in user state)
- Network mocks/intercepts
- Test data fixtures

**Do NOT create fixtures yet** - just track what's needed for aggregation step.

---

## OUTPUT FORMAT

Write JSON to temp file: `/tmp/tea-automate-e2e-tests-{{timestamp}}.json`

```json
{
  "success": true,
  "subagent": "e2e-tests",
  "tests": [
    {
      "file": "tests/e2e/authentication.spec.ts",
      "content": "[full TypeScript test file content]",
      "description": "E2E tests for user authentication journey",
      "priority_coverage": {
        "P0": 2,
        "P1": 3,
        "P2": 2,
        "P3": 0
      }
    },
    {
      "file": "tests/e2e/checkout.spec.ts",
      "content": "[full TypeScript test file content]",
      "description": "E2E tests for checkout journey",
      "priority_coverage": {
        "P0": 3,
        "P1": 2,
        "P2": 1,
        "P3": 0
      }
    }
  ],
  "fixture_needs": ["authenticatedUserFixture", "paymentMockFixture", "checkoutDataFixture"],
  "knowledge_fragments_used": [
    "playwright-utils-mandate",
    "intercept-network-call",
    "network-error-monitor",
    "fixtures-composition",
    "selector-resilience",
    "playwright-cli"
  ],
  "playwright_utils_deviations": [],
  "test_count": 15,
  "summary": "Generated 15 E2E test cases covering 5 user journeys"
}
```

**On Error:**

```json
{
  "success": false,
  "subagent": "e2e-tests",
  "error": "Error message describing what went wrong",
  "partial_output": {
    /* any tests generated before error */
  }
}
```

---

## EXIT CONDITION

Subagent completes when:

- ✅ All user journeys have E2E test files generated
- ✅ All tests follow knowledge fragment patterns
- ✅ JSON output written to temp file
- ✅ Fixture needs tracked

**Subagent terminates here.** Parent workflow will read output and proceed to aggregation.

---

## 🚨 SUBAGENT SUCCESS METRICS

### ✅ SUCCESS:

- All E2E tests generated following patterns
- JSON output valid and complete
- No API/component/unit tests included (out of scope)
- Resilient selectors used (getByRole, getByText)
- Network-first patterns applied (intercept before navigate)
- Playwright Utils mandate satisfied (if enabled): `interceptNetworkCall` for every application endpoint the test observes or stubs, `test` imported from merged fixtures, `apiRequest` for setup/teardown, and every remaining vanilla call listed in `playwright_utils_deviations` with a reason

### ❌ FAILURE:

- Generated tests other than E2E tests
- Did not follow knowledge fragment patterns
- Invalid or missing JSON output
- Ran tests (not subagent responsibility)
- Used brittle selectors (CSS classes, XPath, `[name="..."]`, `:has-text(...)`)
- Emitted `page.route` or `page.waitForResponse` against an application API endpoint while `use_playwright_utils` was `true`, with no deviation entry
- Imported `test` from `@playwright/test` in a spec while `use_playwright_utils` was `true`
- Used a package name other than `@seontechnologies/playwright-utils`
