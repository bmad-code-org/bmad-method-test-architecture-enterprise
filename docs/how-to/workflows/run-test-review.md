---
title: 'How to Run Test Review with TEA'
description: Audit test quality against TEA's criteria registry and get a deduction-based 0-100 score with a computed recommendation
---

# How to Run Test Review with TEA

Use TEA's `test-review` skill to audit existing tests and get a scored report with actionable findings. Each finding cites the criteria-registry row that produced it, and the score and recommendation are computed from those findings.

Coverage scoring is intentionally excluded from `test-review`. Use `trace` for requirements coverage analysis and coverage gate decisions.

## When to Use This

- Validate test quality before a release or merge
- Review team-written or AI-generated tests
- Gate pull requests on test quality in CI
- Establish a baseline before migrating or expanding a suite

## Prerequisites

- Tests to review
- Test framework configured
- For unattended or CI runs: the [`tea-test-review` CLI](/docs/reference/tea-test-review-cli.md)

## Steps

<a id="1-run-the-test-review-workflow"></a>

### 1. Run the Test Review Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-tea-test-review`
- **Codex:** `$bmad-tea-test-review`
- **Inside a `/bmad-tea` chat:** `RV`
- **Unattended or in CI:** [`tea-test-review`](/docs/reference/tea-test-review-cli.md) runs the same skill headlessly and turns the report into an exit code

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

### 2. Specify Review Scope

TEA asks what to review:

| Scope        | Example                      | Best for                                              |
| ------------ | ---------------------------- | ----------------------------------------------------- |
| Single file  | `tests/e2e/checkout.spec.ts` | A failing test, quick feedback on a new test          |
| Directory    | `tests/e2e/`                 | One suite, comparing files, finding repeated patterns |
| Entire suite | `tests/`                     | Release check, full audit, baseline metrics           |

### 3. Read the Quality Report

TEA writes the report to `{test_artifacts}/test-review/test-review-{run_key}.md`. The `run_key` names what was reviewed: `story-{story_key}` or `epic-{epic_num}` when a story or epic is in context, `system` for the entire suite, and `target-{slug}` for a file or directory, such as `target-tests-e2e` for `tests/e2e/`. Reviews of different scopes never overwrite each other, and re-reviewing the same scope replaces its report.

#### How the score is calculated

Rubric 5.0 uses one deduction ledger:

1. Start at 100. Deduct 10 per Critical, 5 per High, 2 per Medium and 1 per Low finding.
2. Add bonus points: five categories (comprehensive fixtures, data factories, network-first, perfect isolation, all test IDs), each worth 0 or 5, awarded only when the criterion holds in every reviewed file.
3. Clamp to 0-100. This is the raw deduction score.
4. Cap by the highest finding severity: Critical 69, High 79, Medium 89, Low 99. The result is the effective score, and it sets the grade (A 90+, B 80+, C 70+, D 60+, F below 60).

The recommendation is derived from the same findings:

| Findings                               | Recommendation        |
| -------------------------------------- | --------------------- |
| Any Critical                           | Block                 |
| Any High, or effective score below 70  | Request Changes       |
| Medium or Low findings only, score 70+ | Approve with Comments |
| No findings                            | Approve               |

Severity comes from the registry row the finding cites: a hard wait is row H1 (High); a test that cannot fail, such as a committed `.skip` or `expect(true).toBe(true)`, is Critical. The skill also scores four dimensions (determinism, isolation, maintainability, performance) and shows them in its summary. Those per-dimension scores are diagnostic; they carry no weight in the overall score.

#### Sample report excerpt

The excerpt below is the start of the skill's bundled example report: one High, one Medium and one Low finding, and the all-test-IDs bonus. Raw score 100 - 5 - 2 - 1 + 5 = 97; the High finding caps it at 79.

```markdown
# Test Quality Review: profile-notifications.spec.ts

**Quality Score**: 79/100 (C - Needs Improvement)
**Raw Deduction Score**: 97/100
**Score Cap**: 79/100

**Recommendation**: Request Changes
**Verdict Rule**: Critical = 0 and High > 0 => Request Changes (1 High).

### 1. Replace the Fixed Notification Delay

**Severity**: P1 (High)
**Location**: `tests/e2e/profile-notifications.spec.ts:37`
**Row**: H1

**Issue**: The test sleeps for two seconds after saving notification preferences. It can pass before persistence finishes on a fast response and fail on a slow runner.
```

Every finding carries a location, its registry row, the issue and a fix. The full report adds a criteria table, the printed deduction breakdown, and the decision section.

### 4. Apply the Fixes

The fixes below are the ones reports suggest most often.

#### Hard wait (H1, High)

Register the response listener before the action that triggers the request, then await it. A listener registered after the click can miss a response that returns immediately.

```typescript
// Before: fixed delay
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
await expect(page.locator('.success')).toBeVisible();

// After: listen first, then act
const checkoutResponse = page.waitForResponse((response) => response.url().includes('/api/checkout') && response.ok());
await page.click('button[type="submit"]');
await checkoutResponse;
await expect(page.locator('.success')).toBeVisible();
```

With Playwright Utils enabled, the same order applies with `interceptNetworkCall`, as in the sample finding.

#### Conditional assertion (H3, High)

Row H3 fires when a branch lets an assertion be skipped or picks the expected value from the system's own output. A branch on test inputs where every path asserts the expected value does not fire it.

```typescript
// Before: when the banner is absent, the test asserts nothing
if (await page.getByTestId('promo-banner').isVisible()) {
  await expect(page.getByTestId('promo-banner')).toContainText('20% off');
}

// After: seed the state that shows the banner, then assert unconditionally
await expect(page.getByTestId('promo-banner')).toContainText('20% off');
```

Cover the no-banner state in its own test with its own setup.

#### Repeated login setup

Move the login into a fixture so each test starts authenticated:

```typescript
// tests/support/fixtures/auth.ts
import { test as base, Page } from '@playwright/test';

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/dashboard/);
    await use(page);
  },
});
```

With Playwright Utils enabled, compose the auth-session fixture into the project's single fixture module, `tests/support/merged-fixtures.ts` (under your configured `test_dir`), and import `test` and `expect` from it in every spec. The `authToken` fixture supplies a Bearer token for API calls. A browser test is signed in only after the session's storage state is applied to its context, and the auth provider still performs a real login or token exchange. [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md) shows the setup.

#### Missing network assertion

Assert on the response as well as the UI, so an API error behind a cached success message fails the test:

```typescript
const responsePromise = page.waitForResponse((resp) => resp.url().includes('/api/profile') && resp.status() === 200);
await page.click('button[name="save"]');
const response = await responsePromise;
expect((await response.json()).success).toBe(true);
await expect(page.locator('.success')).toBeVisible();
```

### 5. Re-run and Compare

Re-run `test-review` on the same scope after fixing. Because the new report replaces the old one, commit each report or copy its score into a trend table:

```markdown
| Date       | Score | Recommendation        | Notes                 |
| ---------- | ----- | --------------------- | --------------------- |
| 2026-01-01 | 64    | Block                 | Baseline              |
| 2026-01-15 | 79    | Request Changes       | Fixed Critical issues |
| 2026-02-01 | 88    | Approve with Comments | Fixed hard waits      |
```

## Set a Quality Gate in CI

Use the CLI. It reviews the test files the branch changed against `origin/main`, scores the findings the branch introduced or worsened, and exits with the verdict:

```bash
tea-test-review --min-score 80 --output test-review.md --json test-review.json
```

- Exit `0`: the review passed, or the branch changed no test files (add `--fail-on-skip` to fail that case).
- Exit `1`: a failing verdict, such as a score below `--min-score` or a Request Changes or Block recommendation.
- Exit `3`: the agent wrote no report or the report failed validation. A missing or malformed report never passes.
- Exit `2`: a setup error, such as a missing or logged-out agent CLI.

Run it from a checkout with full history. The [CLI reference](/docs/reference/tea-test-review-cli.md) has the GitHub Actions job, the agent login, waivers and every gate flag.

Coverage gate checks are handled by `trace`, not `test-review`.

## Tips

- **Review after AI generation.** Run Automate in red or expand mode, review the generated tests, fix Critical and High findings, then commit.
- **Review regularly.** Spot-check per story, review per epic and per release, and audit the full suite quarterly.
- **Review large suites incrementally.** One directory at a time (E2E, API, component), then apply fixes across suites. TEA reviews Cypress Component Testing specs (`*.cy.tsx`) and Vitest component tests (`*.test.tsx`) with framework-specific knowledge.
- **Fix in severity order.** Critical first, then High, then the top Medium findings; re-run after each pass.

## Common Issues

### Low Determinism Dimension Score

**Symptoms:** tests fail randomly, pass locally and fail in CI.

**Common causes:** hard waits (`waitForTimeout`), conditional assertions, a `try`/`catch` that swallows a failure, interception registered after navigation.

**Fix:** apply network-first patterns: register listeners before the action, wait on conditions.

### Low Performance Dimension Score

**Symptoms:** slow tests, long suites, CI timeouts.

**Common causes:** fixed waits, heavy setup in every test, serial bottlenecks.

**Fix:** wait on conditions, move setup into fixtures, keep tests parallel-safe.

### Low Isolation Dimension Score

**Symptoms:** tests fail in a different order or in parallel; test data conflicts.

**Common causes:** shared mutable state without a reset, missing cleanup, hard-coded test data.

**Fix:** use fixtures with cleanup and unique test data.

### Too Many Findings

Fix every Critical and High finding first; each one caps the score and decides the recommendation. Then re-run and take the Medium findings in batches.

## Related Guides

- [Automate Red Mode](/docs/how-to/workflows/run-automate.md#red-mode) - Generate tests to review
- [How to Run Automate](/docs/how-to/workflows/run-automate.md) - Expand and improve tests before review
- [How to Run Trace](/docs/how-to/workflows/run-trace.md) - Coverage analysis and gate decisions

## Understanding the Concepts

- [Test Quality Standards](/docs/explanation/test-quality-standards.md) - What makes tests good
- [Network-First Patterns](/docs/explanation/network-first-patterns.md) - Avoiding flakiness
- [Fixture Architecture](/docs/explanation/fixture-architecture.md) - Reusable patterns

## Reference

- [`tea-test-review` CLI](/docs/reference/tea-test-review-cli.md) - Headless runner, exit codes, CI setup
- [Command: test-review](/docs/reference/commands.md#test-review) - Full command reference
- [Knowledge Base Index](/docs/reference/knowledge-base.md) - Patterns TEA reviews against
