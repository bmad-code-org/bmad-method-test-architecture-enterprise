---
title: 'How to Run Automate with TEA'
description: Generate red acceptance scaffolds or expand coverage with the Automate skill
tableOfContents:
  maxHeadingLevel: 4
---

# How to Run Automate with TEA

Use the Automate skill's `expand` mode to add tests for implemented features. It also supports `red` mode for acceptance scaffolds before implementation. Your prompt selects the mode; the automate command and `TA` menu code default to expand.

Create runs execute the generated tests and repair test issues by default, for up to three rounds. The summary records the repairs and any remaining failures. Real product defects keep their failing assertions and appear as findings.

Choose [red mode](#red-mode) before implementation or [expand mode](#expand-mode) for existing code. Both modes support Create, Resume, Validate, and Edit. Each keeps its customization files and saved progress.

## Expand Mode

### When to Use This

- Feature already exists and works
- Want to add test coverage to existing code
- Expanding existing test suite
- Adding tests to legacy code

For acceptance tests before implementation, use [red mode](/docs/how-to/workflows/run-automate.md#red-mode).

### Prerequisites

- Test framework setup complete (run `framework` if needed)
- Feature implemented and working

This guide uses Playwright examples.
If using Cypress, commands and syntax will differ.

### Steps

<a id="1-run-the-automate-workflow"></a>

#### 1. Run the Automate Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-automate`
- **Codex:** `$bmad-testarch-automate`
- **Inside a `/bmad-tea` chat:** `TA`

Acceptance scaffolds before implementation select red; coverage for existing code selects expand. A single explicit mode overrides the command default. With no task mode signal, the ATDD entry and `AT` default to red, while the Automate entry and `TA` default to expand. Conflicting task mode signals prompt one mode question in an interactive run; an unattended run uses its entry default. Every entry-default fallback states the selected mode in the final summary. Existing customization files and interrupted progress keep working.

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

#### 2. Provide Context

TEA will ask for context about what you're testing.

##### Option A: BMad-Integrated Mode (Recommended)

If you have BMad artifacts (stories, test designs, PRDs):

**What are you testing?**

```text
I'm testing the user profile feature we just implemented.
Story: story-profile-management.md
Test Design: test-design/test-design-epic-1.md
```

**Reference documents:**

- Story file with acceptance criteria
- Test design document (if available)
- PRD sections relevant to this feature
- Tech spec (if available)

**Existing tests:**

```text
We have basic tests in tests/e2e/profile-view.spec.ts
Avoid duplicating that coverage
```

TEA will analyze your artifacts and generate tests that:

- Cover acceptance criteria from the story
- Follow priorities from test design (P0 → P1 → P2)
- Avoid duplicating existing tests
- Include edge cases and error scenarios

##### Option B: Standalone Mode

If you're using TEA Solo or don't have BMad artifacts:

**What are you testing?**

```text
TodoMVC React application at https://todomvc.com/examples/react/dist/
Features: Create todos, mark as complete, filter by status, delete todos
```

**Specific scenarios to cover:**

```text
- Creating todos (happy path)
- Marking todos as complete/incomplete
- Filtering (All, Active, Completed)
- Deleting todos
- Edge cases (empty input, long text)
```

TEA will analyze the application and generate tests based on your description.

#### 3. Specify Test Levels

TEA will ask which test levels to generate:

**Options:**

- **E2E tests**: Full browser-based user workflows
- **API tests**: Backend endpoint testing (faster, more reliable)
- **Component tests**: UI component testing in isolation (framework-dependent)
- **Mix**: Combination of levels (recommended)

**Example response:**

```text
Generate:
- API tests for all CRUD operations
- E2E tests for critical user workflows (P0)
- Focus on P0 and P1 scenarios
- Skip P3 (low priority edge cases)
```

#### 4. Review Generated Tests

TEA generates a test suite with multiple test levels.

##### API Tests (`tests/api/profile.spec.ts`):

**Vanilla Playwright:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Profile API', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Manual auth token fetch
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password123' },
    });
    const { token } = await response.json();
    authToken = token;
  });

  test('should fetch user profile', async ({ request }) => {
    const response = await request.get('/api/profile', {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(response.ok()).toBeTruthy();
    const profile = await response.json();
    expect(profile).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      email: expect.any(String),
    });
  });

  test('should update profile successfully', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: 'Updated Name',
        bio: 'Test bio',
      },
    });

    expect(response.ok()).toBeTruthy();
    const updated = await response.json();
    expect(updated.name).toBe('Updated Name');
    expect(updated.bio).toBe('Test bio');
  });

  test('should validate email format', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { email: 'invalid-email' },
    });

    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Invalid email');
  });

  test('should require authentication', async ({ request }) => {
    const response = await request.get('/api/profile');
    expect(response.status()).toBe(401);
  });
});
```

**With Playwright Utils:**

```typescript
import { test as base, expect } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';
import { mergeTests } from '@playwright/test';
import { z } from 'zod';

const ProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

// Merge API and auth fixtures
const authFixtureTest = base.extend(createAuthFixtures());
export const testWithAuth = mergeTests(apiRequestFixture, authFixtureTest);

testWithAuth.describe('Profile API', () => {
  testWithAuth('should fetch user profile', async ({ apiRequest, authToken }) => {
    const { status, body } = await apiRequest({
      method: 'GET',
      path: '/api/profile',
      headers: { Authorization: `Bearer ${authToken}` },
    }).validateSchema(ProfileSchema); // Chained validation

    expect(status).toBe(200);
    // Schema already validated, type-safe access
    expect(body.name).toBeDefined();
  });

  testWithAuth('should update profile successfully', async ({ apiRequest, authToken }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: { name: 'Updated Name', bio: 'Test bio' },
      headers: { Authorization: `Bearer ${authToken}` },
    }).validateSchema(ProfileSchema); // Chained validation

    expect(status).toBe(200);
    expect(body.name).toBe('Updated Name');
  });

  testWithAuth('should validate email format', async ({ apiRequest, authToken }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: { email: 'invalid-email' },
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(status).toBe(400);
    expect(body.message).toContain('Invalid email');
  });
});
```

`apiRequest` returns `{ status, body }`, supports chained Zod validation, and retries 5xx responses.
Use `retryConfig: { maxRetries: 0 }` when testing a server-error response.

##### E2E Tests (`tests/e2e/profile.spec.ts`):

```typescript
import { test, expect } from '@playwright/test';

test('should edit profile', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Edit profile
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await page.getByLabel('Name').fill('New Name');
  await page.getByRole('button', { name: 'Save' }).click();

  // Verify success
  await expect(page.getByText('Profile updated')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Updated Name');
});
```

TEA generates validation and edge-case tests according to the priorities you supplied.

##### Fixtures (`tests/support/fixtures/profile.ts`):

**Vanilla Playwright:**

```typescript
import { test as base, Page } from '@playwright/test';

type ProfileFixtures = {
  authenticatedPage: Page;
  testProfile: {
    name: string;
    email: string;
    bio: string;
  };
};

export const test = base.extend<ProfileFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Manual login flow
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/dashboard/);

    await use(page);
  },

  testProfile: async ({ request }, use) => {
    // Static test data
    const profile = {
      name: 'Test User',
      email: 'test@example.com',
      bio: 'Test bio',
    };

    await use(profile);
  },
});
```

**With Playwright Utils:**

```typescript
import { test as base } from '@playwright/test';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';
import { mergeTests } from '@playwright/test';
import { faker } from '@faker-js/faker';

type ProfileFixtures = {
  testProfile: {
    name: string;
    email: string;
    bio: string;
  };
};

// Merge auth fixtures with custom fixtures
const authTest = base.extend(createAuthFixtures());
const profileTest = base.extend<ProfileFixtures>({
  testProfile: async ({}, use) => {
    // Dynamic test data with faker
    const profile = {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      bio: faker.person.bio(),
    };

    await use(profile);
  },
});

export const test = mergeTests(authTest, profileTest);
export { expect } from '@playwright/test';
```

**Usage:**

```typescript
import { test, expect } from '../support/fixtures/profile';

test('should update profile', async ({ page, authToken, testProfile }) => {
  // authToken from auth-session (automatic, persisted)
  // testProfile from custom fixture (dynamic data)

  await page.goto('/profile');
  // Test with dynamic, unique data
});
```

The merged fixture exposes an auth token and generates profile data for each test.
Configure the auth provider and browser session separately before visiting an authenticated page.
Add cleanup if the test creates persistent records.

#### 5. Review Additional Artifacts

TEA also generates:

##### Updated README (`tests/README.md`):

```markdown
# Test Suite

## Running Tests

### All Tests

npm test

### Specific Levels

npm run test:api # API tests only
npm run test:e2e # E2E tests only
npm run test:smoke # Smoke tests (@smoke tag)

### Single File

npx playwright test tests/api/profile.spec.ts

## Test Structure

tests/
├── api/ # API tests (fast, reliable)
├── e2e/ # E2E tests (full workflows)
├── fixtures/ # Shared test utilities
└── README.md

## Writing Tests

Follow the patterns in existing tests:

- Use fixtures for authentication
- Network-first patterns (no hard waits)
- Explicit assertions
- Self-cleaning tests
```

##### Definition of Done Summary:

The checklist is part of the automation summary at `{test_artifacts}/automate/automation-summary-{run_key}.md`.
The `run_key` names the scope: `story-{story_key}` or `epic-{epic_num}` when you name a story or epic, `target-{slug}` for a feature or path with neither, and `system` for a run across the whole codebase.

```markdown
## Test Quality Checklist

✅ All tests pass on first run
✅ No hard waits (waitForTimeout)
✅ No conditionals for flow control
✅ Assertions are explicit
✅ Tests clean up after themselves
✅ Tests can run in parallel
✅ Execution time < 1.5 minutes per test
✅ Test files ≤ 1000 lines
```

#### 6. Run the Tests

Run the generated tests against the implemented feature:

**For Playwright:**

```bash
npx playwright test
```

**For Cypress:**

```bash
npx cypress run
```

Expected output:

```text
Running 6 tests using 4 workers

  ✓ tests/api/profile.spec.ts (4 tests) - 2.1s
  ✓ tests/e2e/profile-workflow.spec.ts (2 tests) - 5.3s

  6 passed (7.4s)
```

Investigate each failure: it can reveal a product defect, an incorrect assertion, or missing test setup.

#### 7. Review Test Coverage

Check which scenarios are covered:

```bash
npx playwright show-report
```

For code coverage, use whatever your project already has.
TEA's `framework` skill does not add a coverage script.

Compare against:

- Acceptance criteria from story
- Test priorities from test design
- Edge cases and error scenarios

### What You Get

#### Test Suite

- **API tests**: Fast, reliable backend testing
- **E2E tests**: Critical user workflows
- **Component tests**: UI component testing (if requested)
- **Fixtures**: Shared utilities and setup

#### Component Testing by Framework

TEA supports component testing using framework-appropriate tools:

| Your Framework | Component Testing Tool         | Tests Location                            |
| -------------- | ------------------------------ | ----------------------------------------- |
| **Cypress**    | Cypress Component Testing      | `tests/component/`                        |
| **Playwright** | Vitest + React Testing Library | `tests/component/` or `src/**/*.test.tsx` |

Component tests use separate tooling from E2E tests:

- Cypress users: TEA generates Cypress Component Tests
- Playwright users: TEA generates Vitest + React Testing Library tests

#### Quality Features

- **Network-first patterns**: Wait for the response a user action triggers
- **Deterministic tests**: Explicit assertions and controlled setup
- **Self-cleaning**: Tests don't leave test data behind
- **Parallel-safe setup**: Isolated data for concurrent runs

#### Documentation

- **Updated README**: How to run tests
- **Test structure explanation**: Where tests live
- **Definition of Done**: Quality standards

### Tips

#### Start with Test Design

Run `test-design` before `automate` for better results:

```text
/bmad-testarch-test-design   # risk assessment, priorities
/bmad-testarch-automate      # generate tests based on those priorities
```

TEA will focus on P0/P1 scenarios and skip low-value tests.

#### Prioritize Test Levels

Not everything needs E2E tests:

**Good strategy:**

```text
- P0 scenarios: API + E2E tests      # reserve E2E for critical user journeys
- P1 scenarios: API tests only       # API tests run ~10x faster, no browser flakiness
- P2 scenarios: API tests (happy path)
- P3 scenarios: Skip or add later
```

#### Avoid Duplicate Coverage

Tell TEA about existing tests:

```text
We already have tests in:
- tests/e2e/profile-view.spec.ts (viewing profile)
- tests/api/auth.spec.ts (authentication)

Don't duplicate that coverage
```

TEA will analyze existing tests and only generate new scenarios.

#### Run and Heal

Create runs execute the generated tests, classify failures, apply the matching test fixes, and rerun up to three rounds. Selector failures use resilient locators; timing and hard-wait failures use observable readiness; data and network failures use controlled fixtures and request handling. A real product defect remains a finding with the assertion intact. The run reports blocked execution when its environment cannot run the tests.

Validate checks the selected outputs and reports execution evidence. Edit checks the requested changes. These operations never run test repairs or require the full suite to pass.

Run and heal is enabled by default. Customize `auto_validate`, `auto_heal_failures`, `max_healing_iterations`, and `use_mcp_healing` in the [automation settings](/docs/reference/configuration.md#automate-run-and-heal).

#### Browser Automation (Optional)

If browser automation is configured (`tea_browser_automation: "auto"` or `"cli"` or `"mcp"`), TEA can use browser tools during `automate` for:

- **Healing mode:** Fix broken selectors using CLI snapshots or MCP DOM analysis
- **Recording mode:** Verify selectors with CLI snapshots or MCP browser, capture network requests
- **Evidence capture:** CLI traces and screenshots for test validation

TEA uses browser tools automatically when available and appropriate; it does not prompt.

See [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md) for setup.

#### Generate Tests Incrementally

Don't generate all tests at once:

**Iteration 1:**

```text
Generate P0 tests only (critical path)
Run: automate
```

**Iteration 2:**

```text
Generate P1 tests (high value scenarios)
Run: automate
Tell TEA to avoid P0 coverage
```

**Iteration 3:**

```text
Generate P2 tests (if time permits)
Run: automate
```

Run and review each batch before generating the next one.

### Common Issues

#### Tests Pass But Coverage Is Incomplete

Tests pass but don't cover all scenarios.

TEA wasn't given complete context.

Provide more details:

```text
Generate tests for:
- All acceptance criteria in story-profile.md
- Error scenarios (validation, authorization)
- Edge cases (empty fields, long inputs)
```

#### Too Many Tests Generated

TEA generated 50 tests for a simple feature.

Didn't specify priorities or scope.

Be specific:

```text
Generate ONLY:
- P0 and P1 scenarios
- API tests for all scenarios
- E2E tests only for critical workflows
- Skip P2/P3 for now
```

#### Tests Duplicate Existing Coverage

New tests cover the same scenarios as existing tests.

Didn't tell TEA about existing tests.

Specify existing coverage:

```text
We already have these tests:
- tests/api/profile.spec.ts (GET /api/profile)
- tests/e2e/profile-view.spec.ts (viewing profile)

Generate tests for scenarios NOT covered by those files
```

#### Browser Automation for Better Selectors

If browser automation is configured (`tea_browser_automation: "auto"`, `"cli"`, or `"mcp"`), TEA verifies selectors against live browser using CLI snapshots or MCP.
Otherwise, TEA generates accessible selectors (`getByRole`, `getByLabel`) by default.

Setup: Set `tea_browser_automation: "auto"` in config + install CLI and/or configure MCP servers.
See [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md).

### Related Guides

- [How to Run Test Design](/docs/how-to/workflows/run-test-design.md): Plan before generating
- [Automate Red Mode](/docs/how-to/workflows/run-automate.md#red-mode): Failing tests before implementation
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md): Audit generated quality

### Understanding the Concepts

- [Testing as Engineering](/docs/explanation/testing-as-engineering.md): **Why TEA generates quality tests** (foundational)
- [Risk-Based Testing](/docs/explanation/risk-based-testing.md): Why prioritize P0 over P3
- [Test Quality Standards](/docs/explanation/test-quality-standards.md): What makes tests good
- [Fixture Architecture](/docs/explanation/fixture-architecture.md): Reusable test patterns

### Reference

- [Command: automate](/docs/reference/commands.md#automate): Full command reference
- [TEA Configuration](/docs/reference/configuration.md): MCP and Playwright Utils options

## Red Mode

Use the Automate skill's `red` mode to generate acceptance test scaffolds before implementation. The existing `atdd` command and `AT` menu code select red by default; you can also ask `/bmad-testarch-automate` for red mode.
TEA emits these scaffolds with `test.skip()` so they can be reviewed, linked into the story, and activated task-by-task during implementation.

<a id="red-when-to-use-this"></a>

### When to Use This

- You are about to implement a feature
- You want to follow TDD workflow (red → green → refactor)
- You want tests to guide your implementation
- You're practicing acceptance test-driven development

For tests of implemented features, use [Automate](/docs/how-to/workflows/run-automate.md).

<a id="red-prerequisites"></a>

### Prerequisites

- Test framework setup complete (run `framework` if needed)
- Story or feature defined with acceptance criteria

The examples use Playwright.
Adapt the commands and selectors for Cypress.

<a id="red-steps"></a>

### Steps

<a id="red-1-run-automate-in-red-mode"></a>

#### 1. Run Automate in Red Mode

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-automate`
- **Codex:** `$bmad-testarch-automate`
- **Inside a `/bmad-tea` chat:** `TA`

Request red mode explicitly:

```text
Generate red acceptance scaffolds for this story before implementation.
```

The compatibility entries `/bmad-testarch-atdd`, `$bmad-testarch-atdd`, and `AT` default to red mode.

Acceptance scaffolds before implementation select red; coverage for existing code selects expand. A single explicit mode overrides the command default. With no task mode signal, the ATDD entry and `AT` default to red, while the Automate entry and `TA` default to expand. Conflicting task mode signals prompt one mode question in an interactive run; an unattended run uses its entry default. Every entry-default fallback states the selected mode in the final summary. Existing customization files and interrupted ATDD progress keep working.

Create runs verify the generated tests in a disposable copy with their scaffold skips activated. TEA uses `tea-atdd-red-check` for compatible browserless loopback tests when the command is installed. Browser tests and projects needing their own environment or services use the installed project test runner with the original configuration and environment. Execution respects the project's existing test budgets, and the summary names the runner and any fallback reason. Tests must fail for the acceptance behavior that implementation will add. TEA repairs syntax, imports, selectors, data, timing, network, hard waits, and setup that cause the wrong failure, for up to three rounds. The implementation handoff retains its deliberate skipped scaffolds. The summary records repairs, intended red failures, and unresolved problems. Validate reports findings and Edit checks the changes you requested; neither operation repairs tests.

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

<a id="red-2-provide-context"></a>

#### 2. Provide Context

TEA will ask for:

**Story/Feature Details:**

```text
We're adding a user profile page where users can:
- View their profile information
- Edit their name and email
- Upload a profile picture
- Save changes with validation
```

**Acceptance Criteria:**

```text
Given I'm logged in
When I navigate to /profile
Then I see my current name and email

Given I'm on the profile page
When I click "Edit Profile"
Then I can modify my name and email

Given I've edited my profile
When I click "Save"
Then my changes are persisted
And I see a success message

Given I enter an invalid email address
When I try to save
Then the update returns status 400
And the error message contains "Invalid email format"
```

TEA builds a criterion registry before it generates tests.
Existing `AC-<n>` ids remain unchanged.
For criteria without ids, TEA reserves the supplied ids, visits unnamed criteria in source order, and assigns each the lowest unused `AC-<n>` id.
Every executable test title carries exactly one id from that registry.

TEA emits exactly one red-phase leaf scaffold per declared criterion.
Secondary branches and journeys remain implementation-checklist work until green-phase automation.
Each scaffold puts one direct criterion assertion first.
That assertion isolates the exact newly promised status, scalar, or property before broad object, schema, or secondary checks.
API setup calls to unimplemented endpoints keep their responses opaque until this assertion runs.
E2E scaffolds place the complete browser journey inside the first potentially failing assertion boundary.

**Reference Documents** (optional):

- Point to your story file
- Reference PRD or tech spec
- Link to test design (if you ran `test-design` first)

<a id="red-3-specify-test-levels"></a>

#### 3. Specify Test Levels

TEA will ask what test levels to generate:

**Options:**

- E2E tests (browser-based, full user journey)
- API tests (backend only, faster)
- Component tests (UI components in isolation)
- Mix of levels (see [API Tests First, E2E Later](#red-api-tests-first-e2e-later) tip)

<a id="red-component-testing-by-framework"></a>

#### Component Testing by Framework

TEA generates component tests using framework-appropriate tools:

| Your Framework | Component Testing Tool                       |
| -------------- | -------------------------------------------- |
| **Cypress**    | Cypress Component Testing (\*.cy.tsx)        |
| **Playwright** | Vitest + React Testing Library (\*.test.tsx) |

**Example response:**

```text
Generate:
- API tests for profile CRUD operations
- E2E tests for the complete profile editing flow
- Component tests for ProfileForm validation (if using Cypress or Vitest)
- Focus on P0 and P1 scenarios
```

<a id="red-4-review-generated-tests"></a>

#### 4. Review Generated Tests

TEA generates **red-phase test scaffolds** in appropriate directories:

<a id="red-api-tests-testsapiprofilespects"></a>

##### API Tests (`tests/api/profile.spec.ts`):

**Vanilla Playwright:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Profile API', () => {
  test.skip('[P0] AC-1 should fetch user profile', async ({ request }) => {
    const response = await request.get('/api/profile');

    expect(response.status()).toBe(200);
    const profile = await response.json();
    expect(profile).toHaveProperty('name');
    expect(profile).toHaveProperty('email');
    expect(profile).toHaveProperty('avatarUrl');
  });

  test.skip('[P0] AC-2 should update user profile', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      data: {
        name: 'Updated Name',
        email: 'updated@example.com',
      },
    });

    expect(response.status()).toBe(200);
    const updated = await response.json();
    expect(updated.name).toBe('Updated Name');
    expect(updated.email).toBe('updated@example.com');
  });

  test.skip('[P1] AC-4 should validate email format', async ({ request }) => {
    const response = await request.patch('/api/profile', {
      data: {
        email: 'invalid-email',
      },
    });

    expect(response.status()).toBe(400);
    const error = await response.json();
    expect(error.message).toContain('Invalid email format');
  });
});
```

**With Playwright Utils:**

```typescript
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { expect } from '@playwright/test';
import { z } from 'zod';

const ProfileSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url(),
});

test.describe('Profile API', () => {
  test.skip('[P0] AC-1 should fetch user profile', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'GET',
      path: '/api/profile',
    });

    expect(status).toBe(200);
    const profile = ProfileSchema.parse(body);
    expect(profile.name).toBeDefined();
    expect(profile.email).toContain('@');
  });

  test.skip('[P0] AC-2 should update user profile', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: {
        name: 'Updated Name',
        email: 'updated@example.com',
      },
    });

    expect(status).toBe(200);
    const updated = ProfileSchema.parse(body);
    expect(updated.name).toBe('Updated Name');
    expect(updated.email).toBe('updated@example.com');
  });

  test.skip('[P1] AC-4 should validate email format', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'PATCH',
      path: '/api/profile',
      body: { email: 'invalid-email' },
    });

    expect(status).toBe(400);
    expect(body.message).toContain('Invalid email format');
  });
});
```

`apiRequest` returns `{ status, body }` and supports chained Zod validation.
Disable retries with `retryConfig: { maxRetries: 0 }` for tests that assert a 5xx response.

<a id="red-e2e-tests-testse2eprofilespects"></a>

##### E2E Tests (`tests/e2e/profile.spec.ts`):

```typescript
import { test, expect } from '@playwright/test';

test.skip('[P0] AC-3 should edit and save profile', async ({ page }) => {
  // This assertion is the first potentially failing operation. Every browser
  // failure in the journey retains AC-3 provenance.
  await expect(
    (async () => {
      await page.goto('/login');
      await page.getByLabel('Email').fill('test@example.com');
      await page.getByLabel('Password').fill('password123');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.goto('/profile');
      await page.getByRole('button', { name: 'Edit Profile' }).click();
      await page.getByLabel('Name').fill('Updated Name');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Profile updated')).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'Edit Profile' }).click();
      await expect(page.getByLabel('Name')).toHaveValue('Updated Name');
    })(),
  ).resolves.toBeUndefined();
});
```

TEA records additional display, validation-error, and other secondary E2E journeys in the implementation checklist for green-phase automation.

<a id="red-implementation-checklist"></a>

##### Implementation Checklist

TEA also provides an implementation checklist, saved as `{test_artifacts}/atdd/atdd-checklist-{story_key}.md` (for example `atdd-checklist-1-2-user-authentication.md`):

```markdown
## Implementation Checklist

### Backend

- [ ] Create `GET /api/profile` endpoint
- [ ] Create `PATCH /api/profile` endpoint
- [ ] Add email validation middleware
- [ ] Add profile picture upload handling
- [ ] Write API unit tests

### Frontend

- [ ] Create ProfilePage component
- [ ] Implement profile form with validation
- [ ] Add file upload for avatar
- [ ] Handle API errors gracefully
- [ ] Add loading states

### Tests

- [x] API test scaffolds generated (`test.skip()`)
- [x] E2E test scaffolds generated (`test.skip()`)
- [ ] Activate and run tests during implementation (should fail before code changes, then pass)
```

<a id="red-5-verify-red-phase-scaffolds"></a>

#### 5. Verify Red-Phase Scaffolds

TEA verifies the TDD red phase using an isolated, un-skipped copy. The saved scaffolds keep `test.skip()` until you're ready to work on a task.
Review the generated files, then remove `test.skip()` for the current task and confirm that the newly activated test fails before you implement the feature.

**For Playwright:**

```bash
npx playwright test
```

**For Cypress:**

```bash
npx cypress run
```

Initial output with scaffolds still skipped:

```text
Running 4 tests using 1 worker

  - tests/api/profile.spec.ts:3:3 › [P0] AC-1 should fetch user profile
  - tests/api/profile.spec.ts:15:3 › [P0] AC-2 should update user profile
  - tests/api/profile.spec.ts:30:3 › [P1] AC-4 should validate email format
  - tests/e2e/profile.spec.ts:18:3 › [P0] AC-3 should edit and save profile

  4 skipped
```

After you remove `test.skip()`, confirm the test fails at the assertion for the promised behavior.
A setup failure needs repair before implementation starts.

<a id="red-6-implement-the-feature"></a>

#### 6. Implement the Feature

Now implement the feature following the test guidance:

1. Start with API tests (backend first)
2. Remove `test.skip()` from the first API test and confirm RED
3. Implement until that test passes
4. Move to the next API or E2E test and repeat
5. Refactor with confidence (tests protect you)

<a id="red-7-verify-tests-pass"></a>

#### 7. Verify Tests Pass

After implementation, run your test suite.

**For Playwright:**

```bash
npx playwright test
```

**For Cypress:**

```bash
npx cypress run
```

Expected output:

```text
Running 4 tests using 1 worker

  ✓ tests/api/profile.spec.ts:3:3 › [P0] AC-1 should fetch user profile (850ms)
  ✓ tests/api/profile.spec.ts:15:3 › [P0] AC-2 should update user profile (1.2s)
  ✓ tests/api/profile.spec.ts:30:3 › [P1] AC-4 should validate email format (650ms)
  ✓ tests/e2e/profile.spec.ts:18:3 › [P0] AC-3 should edit and save profile (3.2s)

  4 passed (5.9s)
```

That completes the red → green → refactor cycle for the generated scaffolds.

<a id="red-what-you-get"></a>

### What You Get

<a id="red-red-phase-test-scaffolds"></a>

#### Red-Phase Test Scaffolds

- API tests for backend endpoints
- E2E tests for user workflows
- Component tests (if requested)
- Generated with `test.skip()` until you activate them task-by-task

<a id="red-implementation-guidance"></a>

#### Implementation Guidance

- Clear checklist of what to build
- Acceptance criteria translated to assertions
- Edge cases and error scenarios identified

<a id="red-tdd-workflow-support"></a>

#### TDD Workflow Support

- Activated tests guide implementation
- Confidence to refactor
- Living documentation of features

<a id="red-tips"></a>

### Tips

<a id="red-start-with-test-design"></a>

#### Start with Test Design

Run `test-design` before Automate red mode for better results:

```text
/bmad-testarch-test-design   # risk assessment and priorities
/bmad-testarch-atdd          # generate tests based on that design
```

<a id="red-browser-automation-optional"></a>

#### Browser Automation (Optional)

If browser automation is configured (`tea_browser_automation: "auto"` or `"cli"` or `"mcp"`), TEA can verify selectors against live browsers during Automate red mode.

- **CLI mode:** Takes snapshots to verify element names and roles before generating selectors
- **MCP mode:** Full browser automation for complex UI interactions
- **Auto mode:** Uses CLI for simple verification, MCP for complex flows

Red mode is for features that don't exist yet, so browser verification only applies if you have skeleton/mockup UI already implemented.
For red mode with no UI yet, TEA infers selectors from best practices.

See [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md) for setup.

<a id="red-focus-on-p0p1-scenarios"></a>

#### Focus on P0/P1 Scenarios

Don't generate tests for everything at once:

```text
Generate tests for:
- P0: Critical path (happy path)
- P1: High value (validation, errors)

Skip P2/P3 for now; add them later with Automate expand mode.
```

<a id="red-api-tests-first-e2e-later"></a>

#### API Tests First, E2E Later

Recommended order:

1. Generate API tests with Automate red mode
2. Implement backend (make API tests pass)
3. Generate E2E tests with Automate red mode for missing behavior or expand mode for implemented behavior
4. Implement frontend (make E2E tests pass)

<a id="red-keep-tests-deterministic"></a>

#### Keep Tests Deterministic

TEA generates deterministic tests by default:

- No hard waits (`waitForTimeout`)
- Network-first patterns (wait for responses)
- Explicit assertions (no conditionals)

Preserve response waits and explicit assertions when editing the generated tests.

<a id="red-related-guides"></a>

### Related Guides

- [How to Run Test Design](/docs/how-to/workflows/run-test-design.md): Plan before generating
- [How to Run Automate](/docs/how-to/workflows/run-automate.md): Tests for existing features
- [How to Set Up Test Framework](/docs/how-to/workflows/setup-test-framework.md): Initial setup

<a id="red-understanding-the-concepts"></a>

### Understanding the Concepts

- [Testing as Engineering](/docs/explanation/testing-as-engineering.md): **Why TEA generates quality tests** (foundational)
- [Risk-Based Testing](/docs/explanation/risk-based-testing.md): Why P0 vs P3 matters
- [Test Quality Standards](/docs/explanation/test-quality-standards.md): What makes tests good
- [Network-First Patterns](/docs/explanation/network-first-patterns.md): Avoiding flakiness

<a id="red-reference"></a>

### Reference

- [Command: atdd](/docs/reference/commands.md#atdd): Full command reference
- [TEA Configuration](/docs/reference/configuration.md): MCP and Playwright Utils options
