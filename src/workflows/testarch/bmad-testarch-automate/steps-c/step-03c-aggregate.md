---
name: 'step-03c-aggregate'
description: 'Aggregate subagent outputs and complete test infrastructure'
outputFile: '{test_artifacts}/automation-summary.md'
nextStepFile: '{skill-root}/steps-c/step-04-validate-and-summarize.md'
---

# Step 3C: Aggregate Test Generation Results

## STEP GOAL

Read outputs from parallel subagents (API + E2E and/or Backend test generation based on `{detected_stack}`), aggregate results, and create supporting infrastructure (fixtures, helpers).

---

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`
- ✅ Read subagent outputs from temp files
- ✅ Generate shared fixtures based on fixture needs from both subagents
- ✅ Write all generated test files to disk
- ❌ Do NOT regenerate tests (use subagent outputs)
- ❌ Do NOT run tests yet (that's step 4)

---

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config, subagent outputs from temp files
- Focus: aggregation and fixture generation only
- Limits: do not execute future steps
- Dependencies: Step 3A and 3B subagent outputs

---

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Read Subagent Outputs

**Read API test subagent output (always):**

```javascript
const apiTestsPath = '/tmp/tea-automate-api-tests-{{timestamp}}.json';
const apiTestsOutput = JSON.parse(fs.readFileSync(apiTestsPath, 'utf8'));
```

**Read E2E test subagent output (if {detected_stack} is `frontend` or `fullstack`):**

```javascript
let e2eTestsOutput = null;
if (detected_stack === 'frontend' || detected_stack === 'fullstack') {
  const e2eTestsPath = '/tmp/tea-automate-e2e-tests-{{timestamp}}.json';
  e2eTestsOutput = JSON.parse(fs.readFileSync(e2eTestsPath, 'utf8'));
}
```

**Read Backend test subagent output (if {detected_stack} is `backend` or `fullstack`):**

```javascript
let backendTestsOutput = null;
if (detected_stack === 'backend' || detected_stack === 'fullstack') {
  const backendTestsPath = '/tmp/tea-automate-backend-tests-{{timestamp}}.json';
  backendTestsOutput = JSON.parse(fs.readFileSync(backendTestsPath, 'utf8'));
}
```

**Read Mobile test subagent output (if {detected_stack} is `mobile`):**

```javascript
let mobileTestsOutput = null;
if (detected_stack === 'mobile') {
  const mobileTestsPath = '/tmp/tea-automate-mobile-tests-{{timestamp}}.json';
  mobileTestsOutput = JSON.parse(fs.readFileSync(mobileTestsPath, 'utf8'));
}
```

The mobile payload uses the backend shape (`testsGenerated`, `coverageSummary.fixtureNeeds`) plus a per-file `level`. When counting tests, exclude entries whose `level` is `subflow`: a shared sequence is setup, not coverage, and counting it inflates the reported number.

**Verify all launched subagents succeeded:**

- Check `apiTestsOutput.success === true`
- If E2E was launched: check `e2eTestsOutput.success === true`
- If Backend was launched: check `backendTestsOutput.success === true`
- If Mobile was launched: check `mobileTestsOutput.success === true`
- If any failed, report error and stop (don't proceed)

---

### 2. Write All Test Files to Disk

**Write API test files:**

```javascript
apiTestsOutput.tests.forEach((test) => {
  fs.writeFileSync(test.file, test.content, 'utf8');
  console.log(`✅ Created: ${test.file}`);
});
```

**Write E2E test files (if {detected_stack} is `frontend` or `fullstack`):**

```javascript
if (e2eTestsOutput) {
  e2eTestsOutput.tests.forEach((test) => {
    fs.writeFileSync(test.file, test.content, 'utf8');
    console.log(`✅ Created: ${test.file}`);
  });
}
```

**Write Backend test files (if {detected_stack} is `backend` or `fullstack`):**

```javascript
if (backendTestsOutput) {
  backendTestsOutput.testsGenerated.forEach((test) => {
    fs.writeFileSync(test.file, test.content, 'utf8');
    console.log(`✅ Created: ${test.file}`);
  });
}
```

---

### 3. Aggregate Fixture Needs

**Collect all fixture needs from all launched subagents:**

```javascript
const allFixtureNeeds = [
  ...apiTestsOutput.fixture_needs,
  ...(e2eTestsOutput ? e2eTestsOutput.fixture_needs : []),
  ...(backendTestsOutput ? backendTestsOutput.coverageSummary?.fixtureNeeds || [] : []),
];

// Remove duplicates
const uniqueFixtures = [...new Set(allFixtureNeeds)];
```

**Categorize fixtures:**

- **Authentication fixtures:** authToken, authenticatedUserFixture, etc.
- **Data factories:** userDataFactory, productDataFactory, etc.
- **Network mocks:** paymentMockFixture, apiResponseMocks, etc.
- **Test helpers:** wait/retry/assertion helpers

---

### 4. Generate Fixture Infrastructure

**Create or update fixture files based on needs.**

**If `use_playwright_utils` is `true` (the default), generate section 4-PU and skip 4-V. Otherwise generate 4-V.**

---

#### 4-PU. Playwright Utils Fixture Infrastructure

Per `playwright-utils-mandate.md`.

**A) Merged fixtures — the single entry point** (`{test_dir}/support/merged-fixtures.ts`):

Every spec imports `test` from here. Include only the utility fixtures the generated suite actually uses, plus the project's own.

```typescript
import { mergeTests } from '@playwright/test';
import { log } from '@seontechnologies/playwright-utils';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { test as interceptFixture } from '@seontechnologies/playwright-utils/intercept-network-call/fixtures';
import { test as networkErrorFixture } from '@seontechnologies/playwright-utils/network-error-monitor/fixtures';
import { test as recurseFixture } from '@seontechnologies/playwright-utils/recurse/fixtures';
import { test as authFixture } from './auth-fixture';

export const test = mergeTests(apiRequestFixture, interceptFixture, networkErrorFixture, recurseFixture, authFixture);

export { expect } from '@playwright/test';
export { log };
```

If the suite has no browser tests, drop `interceptFixture` and `networkErrorFixture` from the merge.

**If `{test_dir}/support/merged-fixtures.ts` already exists, extend its `mergeTests` call instead of replacing the file.** `automate` runs repeatedly over a suite that already exists, so overwriting the entry point drops whatever fixtures the project added by hand since the last run.

**B) Auth fixture** (`{test_dir}/support/auth-fixture.ts`):

Built on `auth-session`, not on a login form walk. The provider is the one project-specific piece; everything else is the utility.

```typescript
import { test as base } from '@playwright/test';
import { createAuthFixtures, setAuthProvider, type AuthProvider } from '@seontechnologies/playwright-utils/auth-session';

// The AuthProvider contract, per auth-session.md. These six members are the
// interface; do not invent a shorter one.
const provider: AuthProvider = {
  getEnvironment: (options) => options.environment || 'local',
  getUserIdentifier: (options) => options.userIdentifier || 'default-user',
  extractToken: (storageState) => storageState.cookies.find((c) => c.name === 'auth_token')?.value,
  extractCookies: (tokenData) => [{ name: 'auth_token', value: tokenData, domain: '<domain>', path: '/', httpOnly: true, secure: true }],
  isTokenExpired: (storageState) => {
    const expiresAt = storageState.cookies.find((c) => c.name === 'expires_at');
    return Date.now() > Number.parseInt(expiresAt?.value || '0', 10);
  },
  // Acquires the token and returns the storage state. The only place a raw
  // request context is correct: it runs before the fixtures exist.
  manageAuthToken: async (request, options) => {
    /* project-specific */
  },
};

setAuthProvider(provider);

export const test = base.extend(createAuthFixtures());
```

Tests then take `authToken` from the fixture. Tokens persist to disk and are reused across runs.

If the project has no auth endpoint to wire, do not fall back to a form-driven login fixture. Emit the file with a `TODO` on `manageAuthToken` and on the cookie names, and list "auth provider not wired" in the summary's `Playwright Utils deviations`. Read `auth-session.md` § _Custom Auth Provider Pattern_ before filling any of it in: the storage shape the six members agree on is project-specific and guessing it produces a fixture that silently returns no token.

**C) Data factories** (`{test_dir}/support/factories.ts`): same as 4-V section B below.

**D) Network stubs:**

Do not create a network-mock helper module. A stub belongs in the test that needs it, as `interceptNetworkCall({ url, fulfillResponse })`, so the mock and the assertion stay side by side. Extract a shared factory only when three or more specs stub the same endpoint with the same payload, and even then export the `fulfillResponse` payload, not a `page.route` wrapper.

```typescript
// {test_dir}/support/payloads.ts
export const paymentSuccess = { success: true, transactionId: '12345' };
```

```typescript
// in the spec
const payment = interceptNetworkCall({ url: '**/api/payment/**', fulfillResponse: { status: 200, body: paymentSuccess } });
```

**E) Helper utilities:** create these only for genuinely project-specific logic. A wrapper whose body is one `interceptNetworkCall` or one `apiRequest` call adds indirection without adding meaning; call the utility directly.

---

#### 4-V. Vanilla Fixture Infrastructure (only when `use_playwright_utils` is `false`)

**A) Authentication Fixtures** (`tests/fixtures/auth.ts`):

```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedUser: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('/dashboard');

    await use(page);
  },

  authToken: async ({ request }, use) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password' },
    });
    const { token } = await response.json();

    await use(token);
  },
});
```

**B) Data Factories** (`tests/fixtures/data-factories.ts`):

```typescript
import { faker } from '@faker-js/faker';

export const createUserData = (overrides = {}) => ({
  name: faker.person.fullName(),
  email: faker.internet.email(),
  ...overrides,
});

export const createProductData = (overrides = {}) => ({
  name: faker.commerce.productName(),
  price: faker.number.int({ min: 10, max: 1000 }),
  ...overrides,
});
```

**C) Network Mocks** (`tests/fixtures/network-mocks.ts`):

```typescript
import { Page } from '@playwright/test';

export const mockPaymentSuccess = async (page: Page) => {
  await page.route('/api/payment/**', (route) => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true, transactionId: '12345' }),
    });
  });
};
```

**D) Helper Utilities** (`tests/fixtures/helpers.ts`): project-specific wait, retry, and assertion helpers only.

---

### 4b. Mandate Deviation Roll-Up

Collect `playwright_utils_deviations` and `pactjs_utils_deviations` from every worker output. Carry each non-empty list into the summary in Step 6 under its own heading (`Playwright Utils deviations`, `Pact.js Utils deviations`) with file, line, and reason. The two roll up separately: a run can be clean on one mandate and not the other, and merging them hides which.

If `use_playwright_utils` is `true` and any written file still contains an unexplained `page.route` on an application endpoint, a raw `request.<method>`, a `page.waitForTimeout`, a `console.log`, or a spec-level `import { test } from '@playwright/test'`, fix it here before writing to disk.

Apply the same pass to Pact artifacts when `use_pactjs_utils` is `true`: a hand-cast `.given()`, a literal `VerifierOptions`, or bespoke auth middleware with no stated reason gets fixed or recorded. Aggregation is the last gate before the code lands.

---

### 5. Calculate Summary Statistics

**Aggregate test counts (based on `{detected_stack}`):**

```javascript
const e2eCount = e2eTestsOutput ? e2eTestsOutput.test_count : 0;
const backendCount = backendTestsOutput ? (backendTestsOutput.coverageSummary?.totalTests ?? 0) : 0;

const resolvedMode = subagentContext?.execution?.resolvedMode;
const subagentExecutionLabel =
  resolvedMode === 'sequential'
    ? 'SEQUENTIAL (API then dependent workers)'
    : resolvedMode === 'agent-team'
      ? 'AGENT-TEAM (parallel worker squad)'
      : resolvedMode === 'subagent'
        ? 'SUBAGENT (parallel subagents)'
        : `PARALLEL (based on ${detected_stack})`;
const performanceGainLabel =
  resolvedMode === 'sequential'
    ? 'baseline (no parallel speedup)'
    : resolvedMode === 'agent-team' || resolvedMode === 'subagent'
      ? '~40-70% faster than sequential'
      : 'mode-dependent';

const summary = {
  detected_stack: '{detected_stack}',
  total_tests: apiTestsOutput.test_count + e2eCount + backendCount,
  api_tests: apiTestsOutput.test_count,
  e2e_tests: e2eCount,
  backend_tests: backendCount,
  fixtures_created: uniqueFixtures.length,
  api_test_files: apiTestsOutput.tests.length,
  e2e_test_files: e2eTestsOutput ? e2eTestsOutput.tests.length : 0,
  backend_test_files: backendTestsOutput ? backendTestsOutput.testsGenerated.length : 0,
  priority_coverage: {
    P0:
      (apiTestsOutput.priority_coverage?.P0 ?? 0) +
      (e2eTestsOutput?.priority_coverage?.P0 ?? 0) +
      (backendTestsOutput?.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P0 ?? 0), 0) ?? 0),
    P1:
      (apiTestsOutput.priority_coverage?.P1 ?? 0) +
      (e2eTestsOutput?.priority_coverage?.P1 ?? 0) +
      (backendTestsOutput?.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P1 ?? 0), 0) ?? 0),
    P2:
      (apiTestsOutput.priority_coverage?.P2 ?? 0) +
      (e2eTestsOutput?.priority_coverage?.P2 ?? 0) +
      (backendTestsOutput?.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P2 ?? 0), 0) ?? 0),
    P3:
      (apiTestsOutput.priority_coverage?.P3 ?? 0) +
      (e2eTestsOutput?.priority_coverage?.P3 ?? 0) +
      (backendTestsOutput?.testsGenerated?.reduce((sum, t) => sum + (t.priority_coverage?.P3 ?? 0), 0) ?? 0),
  },
  knowledge_fragments_used: [
    ...apiTestsOutput.knowledge_fragments_used,
    ...(e2eTestsOutput ? e2eTestsOutput.knowledge_fragments_used : []),
    ...(backendTestsOutput ? backendTestsOutput.knowledge_fragments_used || [] : []),
  ],
  subagent_execution: subagentExecutionLabel,
  performance_gain: performanceGainLabel,
};
```

**Store summary for Step 4:**
Save summary to temp file for validation step:

```javascript
fs.writeFileSync('/tmp/tea-automate-summary-{{timestamp}}.json', JSON.stringify(summary, null, 2), 'utf8');
```

---

### 6. Optional Cleanup

**Clean up subagent temp files** (optional - can keep for debugging):

```javascript
fs.unlinkSync(apiTestsPath);
if (e2eTestsOutput) fs.unlinkSync('/tmp/tea-automate-e2e-tests-{{timestamp}}.json');
if (backendTestsOutput) fs.unlinkSync('/tmp/tea-automate-backend-tests-{{timestamp}}.json');
console.log('✅ Subagent temp files cleaned up');
```

---

## OUTPUT SUMMARY

Display to user:

```
✅ Test Generation Complete ({subagent_execution})

📊 Summary:
- Stack Type: {detected_stack}
- Total Tests: {total_tests}
  - API Tests: {api_tests} ({api_test_files} files)
  - E2E Tests: {e2e_tests} ({e2e_test_files} files)         [if frontend/fullstack]
  - Backend Tests: {backend_tests} ({backend_test_files} files)  [if backend/fullstack]
- Fixtures Created: {fixtures_created}
- Priority Coverage:
  - P0 (Critical): {P0} tests
  - P1 (High): {P1} tests
  - P2 (Medium): {P2} tests
  - P3 (Low): {P3} tests

🚀 Performance: {performance_gain}

📂 Generated Files:
- tests/api/[feature].spec.ts                                [always]
- tests/e2e/[feature].spec.ts                                [if frontend/fullstack]
- tests/unit/[feature].test.*                                 [if backend/fullstack]
- tests/integration/[feature].test.*                          [if backend/fullstack]
- tests/fixtures/ or tests/support/                           [shared infrastructure]

✅ Ready for validation (Step 4)
```

---

## EXIT CONDITION

Proceed to Step 4 when:

- ✅ All test files written to disk (API + E2E and/or Backend, based on `{detected_stack}`)
- ✅ All fixtures and helpers created
- ✅ Summary statistics calculated and saved
- ✅ Output displayed to user

---

### 7. Save Progress

**Save this step's accumulated work to `{outputFile}`.**

- **If `{outputFile}` does not exist** (first save), create it with YAML frontmatter:

  ```yaml
  ---
  stepsCompleted: ['step-03c-aggregate']
  lastStep: 'step-03c-aggregate'
  lastSaved: '{date}'
  ---
  ```

  Then write this step's output below the frontmatter.

- **If `{outputFile}` already exists**, update:
  - Add `'step-03c-aggregate'` to `stepsCompleted` array (only if not already present)
  - Set `lastStep: 'step-03c-aggregate'`
  - Set `lastSaved: '{date}'`
  - Append this step's output to the appropriate section.

Load next step: `{nextStepFile}`

---

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- All launched subagents succeeded (based on `{detected_stack}`)
- All test files written to disk
- Fixtures generated based on subagent needs
- Summary complete and accurate

### ❌ SYSTEM FAILURE:

- One or more subagents failed
- Test files not written to disk
- Fixtures missing or incomplete
- Summary missing or inaccurate

**Master Rule:** Do NOT proceed to Step 4 if aggregation incomplete.
