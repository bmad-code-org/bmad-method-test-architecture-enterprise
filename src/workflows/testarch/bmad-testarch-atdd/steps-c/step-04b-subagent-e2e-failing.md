---
name: 'step-04b-subagent-e2e-failing'
description: 'Subagent: Generate red-phase E2E test scaffolds (TDD red phase)'
subagent: true
outputFile: '/tmp/tea-atdd-e2e-tests-{{timestamp}}.json'
---

# Subagent 4B: Generate Red-Phase E2E Test Scaffolds (TDD Red Phase)

## SUBAGENT CONTEXT

This is an **isolated subagent** running in parallel with API red-phase test generation.

**What you have from parent workflow:**

- Story acceptance criteria from Step 1
- Test strategy and user journey scenarios from Step 3
- Knowledge fragments loaded: playwright-utils-mandate, overview, intercept-network-call, network-error-monitor, fixtures-composition, log, auth-session, fixture-architecture, network-first, selector-resilience
- Config: test framework, `use_playwright_utils` (default `true`)

**When `use_playwright_utils` is `true`, `playwright-utils-mandate.md` binds this worker.** A red-phase scaffold is real test code; generate it in the playwright-utils style without being asked. `network-first.md` and `fixture-architecture.md` still supply the principles; the mechanism is `interceptNetworkCall` and `mergeTests`.

**Your task:** Generate E2E test scaffolds for the feature's expected UI behavior. They stay in `test.skip()` until the developer activates them for the current task (TDD RED PHASE).

---

## MANDATORY EXECUTION RULES

- 📖 Read this entire subagent file before acting
- ✅ Generate red-phase E2E test scaffolds ONLY
- ✅ Tests MUST be emitted with `test.skip()` until the developer activates them
- ✅ Output structured JSON to temp file
- ✅ Follow knowledge fragment patterns
- ❌ Do NOT generate API tests (that's subagent 4A)
- ❌ Do NOT generate active passing tests (this is TDD red phase)
- ❌ Do NOT run tests (that's step 5)

---

## SUBAGENT TASK

### 1. Identify User Journeys from Acceptance Criteria

From the story acceptance criteria (Step 1 output), identify:

- Which UI flows will be created for this story
- User interactions required
- Expected visual states
- Success/error messages expected

**Example Acceptance Criteria:**

```
Story: User Registration
- As a user, I can navigate to /register page
- I can fill in email and password fields
- I can click "Register" button
- System shows success message and redirects to dashboard
- System shows error if email already exists
```

### 2. Browser Interaction (Selector Verification)

**Automation mode:** `config.tea_browser_automation`

If `auto` (fall back to MCP if CLI unavailable; if neither available, generate from best practices):

- Open the target page first, then verify selectors with a snapshot:
  `playwright-cli -s=tea-atdd-{{timestamp}} open <target_url>`
  `playwright-cli -s=tea-atdd-{{timestamp}} snapshot` → map refs to Playwright locators
  - ref `{role: "button", name: "Submit"}` → `page.getByRole('button', { name: 'Submit' })`
  - ref `{role: "textbox", name: "Email"}` → `page.getByRole('textbox', { name: 'Email' })`
- `playwright-cli -s=tea-atdd-{{timestamp}} close` when done

If `cli` (CLI only — do NOT fall back to MCP; generate from best practices if CLI unavailable):

- Open the target page first, then verify selectors with a snapshot:
  `playwright-cli -s=tea-atdd-{{timestamp}} open <target_url>`
  `playwright-cli -s=tea-atdd-{{timestamp}} snapshot` → map refs to Playwright locators
  - ref `{role: "button", name: "Submit"}` → `page.getByRole('button', { name: 'Submit' })`
  - ref `{role: "textbox", name: "Email"}` → `page.getByRole('textbox', { name: 'Email' })`
- `playwright-cli -s=tea-atdd-{{timestamp}} close` when done

> **Session Hygiene:** Always close sessions using `playwright-cli -s=tea-atdd-{{timestamp}} close`. Do NOT use `close-all` — it kills every session on the machine and breaks parallel execution.

If `mcp`:

- Use MCP tools for selector verification (current behavior)

If `none`:

- Generate selectors from best practices without browser verification

### 3. Generate Red-Phase E2E Test Files

For each user journey, create test file in `tests/e2e/[feature].spec.ts`:

**Test Structure — when `use_playwright_utils` is `true` (the default). This is the shape you emit:**

```typescript
import { test, expect } from '../support/merged-fixtures';

test.describe('[Story Name] E2E User Journey (ATDD)', () => {
  test.skip('[P0] should complete user registration successfully', async ({ page, interceptNetworkCall }) => {
    // THIS TEST WILL FAIL - UI not implemented yet
    // Declare the interception BEFORE navigating.
    const registerCall = interceptNetworkCall({ url: '**/api/users/register', method: 'POST' });

    await page.goto('/register');

    // Expect registration form but will get 404 or missing elements
    await page.getByLabel('Email').fill('newuser@example.com');
    await page.getByLabel('Password').fill('SecurePass123!');
    await page.getByRole('button', { name: 'Register' }).click();

    const { status } = await registerCall;
    expect(status).toBe(201);

    await expect(page.getByText('Registration successful!')).toBeVisible();
    await page.waitForURL('/dashboard');
  });

  // Stubs a 409 on purpose, so it opts out of network monitoring.
  test.skip(
    '[P1] should show error if email exists',
    { annotation: [{ type: 'skipNetworkMonitoring' }] },
    async ({ page, interceptNetworkCall }) => {
      // THIS TEST WILL FAIL - UI not implemented yet
      // Stub the conflict instead of depending on backend state.
      const conflictCall = interceptNetworkCall({
        url: '**/api/users/register',
        method: 'POST',
        fulfillResponse: { status: 409, body: { message: 'Email already exists' } },
      });

      await page.goto('/register');

      await page.getByLabel('Email').fill('existing@example.com');
      await page.getByLabel('Password').fill('SecurePass123!');
      await page.getByRole('button', { name: 'Register' }).click();

      await conflictCall;
      await expect(page.getByText('Email already exists')).toBeVisible();
    },
  );
});
```

Note the selectors: `getByLabel` and `getByRole`, never `[name="email"]` or `button:has-text(...)`. In the red phase the labels and accessible names come from the acceptance criteria. When the criteria do not pin them down, apply `confidence-gate.md` and ask rather than inventing a CSS selector.

**Test Structure — when `use_playwright_utils` is `false`:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('[Story Name] E2E User Journey (ATDD)', () => {
  test.skip('[P0] should complete user registration successfully', async ({ page }) => {
    await page.route('**/api/users/register', (route) => route.continue());
    await page.goto('/register');

    await page.getByLabel('Email').fill('newuser@example.com');
    await page.getByLabel('Password').fill('SecurePass123!');
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page.getByText('Registration successful!')).toBeVisible();
  });
});
```

**Playwright Utils Mandate (when `use_playwright_utils` is `true`):**

Follow `playwright-utils-mandate.md`. The red phase does not relax it.

- ✅ `interceptNetworkCall({ url, method })` to observe the call the journey triggers, `fulfillResponse` to stub an error path the backend cannot produce yet.
- ✅ `test` imported from the project's merged fixtures, which also brings `networkErrorMonitor` so a silent 4xx/5xx fails the test once the feature lands.
- ✅ `apiRequest` for API-driven setup and teardown inside the journey. Never the raw `request` fixture.
- ✅ `authToken` from the auth-session fixture for journeys that start logged in.
- ✅ `log.step` for journey milestones.
- ✅ `skipNetworkMonitoring` on any scaffold that deliberately stubs a 4xx or 5xx. The merged fixtures include `network-error-monitor`, which fails a test on a backend error, so an error-path scaffold that omits the annotation fails for the wrong reason once the feature lands. Add it only where the error is the subject of the test.
- ❌ `page.route` or `page.waitForResponse` on an application API endpoint, `page.waitForTimeout`, `console.log`, `import { test } from '@playwright/test'` in a spec.
- ⚠️ `page.route` remains correct for blocking third-party scripts, analytics, fonts, and images.

Package and subpaths are exactly `@seontechnologies/playwright-utils` and its documented subpaths.

If the merged-fixtures file does not exist yet, generate the import against `../support/merged-fixtures` anyway and record it as a fixture need. Step 4C creates the file.

**CRITICAL ATDD Requirements:**

- ✅ Use `test.skip()` to mark tests as red-phase scaffolds
- ✅ Write assertions for EXPECTED UI behavior (even though not implemented)
- ✅ Use resilient selectors: getByRole, getByText, getByLabel (from selector-resilience). Never `[name="..."]`, `button:has-text(...)`, CSS classes, or XPath
- ✅ Network-first: interception declared before navigation when API calls are involved (from network-first; mechanism per the mandate when enabled)
- ✅ Test complete user journeys from acceptance criteria
- ✅ Include priority tags [P0], [P1], [P2], [P3]
- ✅ Use proper TypeScript types
- ✅ Deterministic waits (no hard sleeps)

**Why test.skip():**

- Tests are written correctly for EXPECTED UI behavior
- But we know they'll fail because UI isn't implemented
- `test.skip()` documents this is intentional (TDD red phase)
- Once UI is implemented, remove `test.skip()` to verify green phase

### 4. Track Fixture Needs

Identify fixtures needed for E2E tests:

- Authentication fixtures (if journey requires logged-in state)
- Network mocks (if API calls involved)
- Test data fixtures

**Do NOT create fixtures yet** - just track what's needed for aggregation step.

---

## OUTPUT FORMAT

Write JSON to temp file: `/tmp/tea-atdd-e2e-tests-{{timestamp}}.json`

```json
{
  "success": true,
  "subagent": "atdd-e2e-tests",
  "tests": [
    {
      "file": "tests/e2e/user-registration.spec.ts",
      "content": "[full TypeScript test file content with test.skip()]",
      "description": "ATDD E2E test scaffolds for user registration journey (RED PHASE)",
      "expected_to_fail": true,
      "acceptance_criteria_covered": [
        "User can navigate to /register",
        "User can fill registration form",
        "System shows success message on registration",
        "System shows error if email exists"
      ],
      "priority_coverage": {
        "P0": 1,
        "P1": 1,
        "P2": 0,
        "P3": 0
      }
    }
  ],
  "fixture_needs": ["registrationPageMock"],
  "knowledge_fragments_used": ["fixture-architecture", "network-first", "selector-resilience"],
  "test_count": 2,
  "tdd_phase": "RED",
  "summary": "Generated 2 red-phase E2E test scaffolds for user registration story"
}
```

**On Error:**

```json
{
  "success": false,
  "subagent": "atdd-e2e-tests",
  "error": "Error message describing what went wrong",
  "partial_output": {
    /* any tests generated before error */
  }
}
```

---

## EXIT CONDITION

Subagent completes when:

- ✅ All user journeys from acceptance criteria have test files
- ✅ All tests use `test.skip()` (documented red-phase scaffolds)
- ✅ All tests assert EXPECTED UI behavior (not placeholder assertions)
- ✅ Resilient selectors used (getByRole, getByText)
- ✅ JSON output written to temp file
- ✅ Fixture needs tracked

**Subagent terminates here.** Parent workflow will read output and proceed to aggregation.

---

## 🚨 SUBAGENT SUCCESS METRICS

### ✅ SUCCESS:

- All E2E tests generated with test.skip()
- Tests assert expected UI behavior (not placeholders)
- Resilient selectors used (getByRole, getByText)
- JSON output valid and complete
- No API/component/unit tests included (out of scope)
- Tests follow knowledge fragment patterns
- Playwright Utils mandate satisfied (if enabled): `interceptNetworkCall` for every application endpoint, `test` imported from merged fixtures, and every remaining vanilla call listed in `playwright_utils_deviations` with a reason

### ❌ FAILURE:

- Generated active passing tests (wrong - this is RED phase)
- Tests without test.skip() (will break CI)
- Placeholder assertions (expect(true).toBe(true))
- Brittle selectors used (CSS classes, XPath, `[name="..."]`, `:has-text(...)`)
- Did not follow knowledge fragment patterns
- Invalid or missing JSON output
- Emitted `page.route` or `page.waitForResponse` against an application API endpoint while `use_playwright_utils` was `true`, with no deviation entry
- Imported `test` from `@playwright/test` in a spec while `use_playwright_utils` was `true`
- Downgraded to vanilla shapes because the endpoint or UI does not exist yet
