---
title: 'Using TEA with Existing Tests (Brownfield)'
description: Apply TEA skills to legacy codebases with existing test suites
---

# Using TEA with Existing Tests (Brownfield)

Use TEA on brownfield projects (existing codebases with legacy tests) to establish coverage baselines, identify gaps, and improve test quality without starting from scratch.

## When to Use This

- Existing codebase with some tests already written
- Legacy test suite needs quality improvement
- Adding features to existing application
- Need to understand current test coverage
- Want to prevent regression as you add features

## Prerequisites

- Existing codebase with tests (even if incomplete or low quality)
- Tests run successfully (or at least can be executed)

For an undocumented codebase, the BMad Method `document-project` workflow can create baseline documentation.

## Brownfield Strategy

### Phase 1: Establish Baseline

Understand what you have before changing anything.

#### Step 1: Baseline Coverage with `trace`

Run the trace skill and select Phase 1 (Requirements Traceability):

```text
/bmad-tea-trace
```

**Provide:**

- Existing requirements docs (PRD, user stories, feature specs)
- Test location (`tests/` or wherever tests live)
- Focus areas (specific features if large codebase)

No requirements docs? TEA traces against journeys it infers from routes, screens, and auth flows (`allow_synthetic_oracle`, on by default) and states its confidence.
Confirm those journeys with the product owner before ranking gaps; below high confidence the gate gives at most CONCERNS.

**Output:** `trace/traceability-matrix-{run_key}.md` under `{test_artifacts}` (`run_key` is `system` for a whole-project baseline) showing:

- Which requirements have tests
- Which requirements lack coverage
- Coverage classification (FULL/PARTIAL/NONE)
- Gap prioritization

**Example Baseline:**

```markdown
# Baseline Coverage (Before Improvements)

**Total Requirements:** 50
**Full Coverage:** 15 (30%)
**Partial Coverage:** 20 (40%)
**No Coverage:** 15 (30%)

**By Priority:**

- P0: 50% coverage (5/10) ❌ Critical gap
- P1: 40% coverage (8/20) ⚠️ Needs improvement
- P2: 20% coverage (2/10) ✅ Acceptable
```

#### Step 2: Quality Audit with `test-review`

Run the test review skill and answer `tests/` when it asks for scope:

```text
/bmad-tea-test-review
```

**Output:** `test-review/test-review-{run_key}.md` under `{test_artifacts}` with quality score and issues.

**Common Brownfield Issues:**

- Hard waits everywhere (`page.waitForTimeout(5000)`)
- Fragile CSS selectors (`.class > div:nth-child(3)`)
- No test isolation (tests depend on execution order)
- Try-catch for flow control
- Tests don't clean up (leave test data in DB)

**Example Baseline Quality:**

```markdown
# Quality Score: 40/100

**High findings:** 12 (12 × 5 = 60 points deducted)

- 8 hard waits
- 4 conditional assertions

**Recommendations:**

- Extract fixtures
- Improve selectors
- Add network assertions
```

### Phase 2: Prioritize Improvements

Don't try to fix everything at once.

#### Focus on Critical Path First

**Priority 1: P0 Requirements.** Goal: P0 coverage at 100%.

1. Identify P0 requirements with no tests (from the trace matrix)
2. Run `/bmad-tea-automate` to generate tests for the missing P0 scenarios
3. Fix the critical quality issues those tests carry (from the test-review report)

**Priority 2: Fix Flaky Tests.** Goal: eliminate flakiness.

1. Identify tests with hard waits (from the test-review report)
2. Replace them with network-first patterns
3. Run burn-in loops to verify stability

**Example Modernization:**

**Before (Flaky: Hard Waits):**

```typescript
test('checkout completes', async ({ page }) => {
  await page.click('button[name="checkout"]');
  await page.waitForTimeout(5000); // ❌ Flaky
  await expect(page.locator('.confirmation')).toBeVisible();
});
```

**After (Network-First: Vanilla):**

```typescript
test('checkout completes', async ({ page }) => {
  const checkoutPromise = page.waitForResponse((resp) => resp.url().includes('/api/checkout') && resp.ok());
  await page.click('button[name="checkout"]');
  await checkoutPromise; // ✅ Deterministic
  await expect(page.locator('.confirmation')).toBeVisible();
});
```

**After (With Playwright Utils: Cleaner API):**

```typescript
// tests/e2e/checkout.spec.ts
import { test, expect } from '../support/merged-fixtures';

test('checkout completes', async ({ page, interceptNetworkCall }) => {
  const checkoutCall = interceptNetworkCall({
    method: 'POST',
    url: '**/api/checkout',
  });

  await page.click('button[name="checkout"]');

  // Wait for response (automatic JSON parsing)
  const { status, responseJson: order } = await checkoutCall;

  // Validate API response
  expect(status).toBe(200);
  expect(order.status).toBe('confirmed');

  // Validate UI
  await expect(page.locator('.confirmation')).toBeVisible();
});
```

`interceptNetworkCall` waits for the matching response and parses it as `responseJson`.
The spec imports the project's one fixture module, `tests/support/merged-fixtures.ts` under your configured `test_dir`; merge `network-error-monitor` there for automatic error detection.
See [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md#network-error-monitor).

**Priority 3: P1 Requirements.** Goal: P1 coverage at 80% as an interim milestone; the trace gate needs 90% for PASS.

1. Generate tests for the highest-risk P1 gaps
2. Improve test quality incrementally

#### Create Improvement Roadmap

```markdown
# Test Improvement Roadmap

## Week 1: Critical Path (P0)

- [ ] Add 5 missing P0 tests (Epic 1: Auth)
- [ ] Fix 8 hard waits in auth tests
- [ ] Verify P0 coverage = 100%

## Week 2: Flakiness

- [ ] Replace all hard waits with network-first
- [ ] Fix conditional flow control
- [ ] Run burn-in loops (target: 0 failures in 10 runs)

## Week 3: High-Value Coverage (P1)

- [ ] Add 10 missing P1 tests
- [ ] Improve selector resilience
- [ ] P1 coverage milestone: 80% (PASS needs 90%)

## Week 4: Quality Polish

- [ ] Extract fixtures for common patterns
- [ ] Add network assertions
- [ ] Quality score target: 75+
```

### Phase 3: Incremental Improvement

Apply TEA skills to new work while improving legacy tests.

#### For New Features (Greenfield Within Brownfield)

**Use the full TEA sequence:**

1. `/bmad-tea-test-design` (epic-level) to plan tests for the new feature
2. `/bmad-tea-automate` in red mode to generate failing tests first
3. Implement the feature
4. `/bmad-tea-automate` to expand coverage
5. `/bmad-tea-test-review` to check quality

#### For Bug Fixes (Regression Prevention)

**Add regression tests:**

1. Reproduce the bug with a failing test
2. Fix the bug
3. Verify the test passes
4. Run `/bmad-tea-test-review` on the regression test
5. Add it to the regression suite

#### For Refactoring (Regression Safety)

1. Run the relevant suite and record the results as the execution baseline
2. Run `/bmad-tea-trace` and note coverage by priority as the trace baseline
3. Refactor the code
4. Rerun the same suite and investigate every new failure before going further
5. Run `/bmad-tea-trace` again and compare priority coverage with the baseline

An unchanged matrix shows the tests still map to requirements; only the test run shows behavior still passes.

### Phase 4: Continuous Improvement

Track improvement over time.

#### Quarterly Quality Audits

| Quarter       | Coverage          | Quality score | Flakiness     |
| ------------- | ----------------- | ------------- | ------------- |
| Q1 (baseline) | 30%               | 40/100        | 15% fail rate |
| Q2 target     | 50% (focus on P0) | 65/100        | 5%            |
| Q3 target     | 70%               | 75/100        | 1%            |
| Q4 target     | 85%               | 85/100        | <0.5%         |

## Brownfield-Specific Tips

### Don't Rewrite Everything

Keep existing coverage while improving the suite:

1. Keep tests that work, even imperfect ones
2. Fix critical quality issues incrementally
3. Add tests for the gaps
4. Improve gradually

### Use Regression Hotspots

Rank areas by bug reports from the last six months, customer complaints, code complexity (cyclomatic complexity above 10), and change frequency in `git log`.
For example, authentication (12 bugs in six months), checkout (8), and payments (6) get regression tests first, and their P0 coverage is complete before anyone touches the code.

### Quarantine Flaky Tests

Don't let flaky tests block improvement:

```typescript
// Mark flaky tests with .skip temporarily
test.skip('flaky test - needs fixing', async ({ page }) => {
  // TODO: Fix hard wait on line 45
  // TODO: Add network-first pattern
});
```

**Track quarantined tests:**

```markdown
# Quarantined Tests

| Test                | Reason                     | Owner    | Target Fix Date |
| ------------------- | -------------------------- | -------- | --------------- |
| checkout.spec.ts:45 | Hard wait causes flakiness | QA Team  | 2026-01-20      |
| profile.spec.ts:28  | Conditional flow control   | Dev Team | 2026-01-25      |
```

**Fix systematically:**

- Don't accumulate quarantined tests
- Set deadlines for fixes
- Review quarantine list weekly

### Migrate One Directory at a Time

**Large test suite?** Improve incrementally:

Take one directory per week (`tests/auth/`, then `tests/api/`, then `tests/e2e/`), running the same loop on each:

1. Run `/bmad-tea-test-review` and give that directory as the scope
2. Fix the critical issues
3. Re-review
4. Mark the directory as "modernized"

### Document Migration Status

**Track which tests are modernized:**

```markdown
# Test Suite Status

| Directory          | Tests | Quality Score | Status         | Notes          |
| ------------------ | ----- | ------------- | -------------- | -------------- |
| tests/auth/        | 15    | 85/100        | ✅ Modernized  | Week 1 cleanup |
| tests/api/         | 32    | 78/100        | ⚠️ In Progress | Week 2         |
| tests/e2e/         | 28    | 62/100        | ❌ Legacy      | Week 3 planned |
| tests/integration/ | 12    | 45/100        | ❌ Legacy      | Week 4 planned |

**Legend:**

- ✅ Modernized: Quality >80, no critical issues
- ⚠️ In Progress: Active improvement
- ❌ Legacy: Untouched
```

## Common Brownfield Challenges

### "We Don't Know What Tests Cover"

No documentation, unclear what tests do.

1. Run `/bmad-tea-trace`; TEA maps the tests to requirements, or to inferred journeys when none exist (see the confidence note in Phase 1, Step 1)
2. Review the traceability matrix
3. Document the findings
4. Use it as your improvement baseline

### "Tests Are Too Brittle to Touch"

Afraid to modify tests (might break them).

Make one change at a time and verify it:

1. Run the tests and capture current behavior as the baseline
2. Make one small improvement, such as removing a single hard wait
3. Run the tests again
4. If they still pass, continue; if they fail, investigate before going further

### "No One Knows How to Run Tests"

Test documentation is outdated or missing.

1. Document manually, or ask TEA to analyze the test structure for you
2. Create `tests/README.md` covering how to install dependencies, how to run the tests (`npx playwright test`, `npm test`, or whatever your runner is), what each test directory contains, and common troubleshooting
3. Commit it for the team

Document the existing setup before deciding whether it needs new scaffolding.

### "Tests Take Hours to Run"

Full test suite takes 4+ hours.

Sharding and selective testing can reduce runtime.
Measure the result with your suite and runner capacity.

1. Configure parallel execution (shard tests across workers)
2. Add selective testing so PRs run only affected tests
3. Run the full suite nightly only
4. Optimize slow tests by removing hard waits and improving selectors

`/bmad-tea-framework` with CI scope scaffolds sharded CI, selective-testing scripts, and burn-in for your repository.
With Playwright Utils, [burn-in](/docs/how-to/customization/integrate-playwright-utils.md#burn-in) selects tests from the git diff and can run a percentage of them.

### "We Have Tests But They Always Fail"

Tests are so flaky they're ignored.

1. Run `/bmad-tea-test-review` to identify the flakiness patterns
2. Fix the tests with the highest failure rate
3. Quarantine the rest
4. Re-enable them as you fix them

<a id="brownfield-tea-workflow"></a>

<a id="brownfield-tea-skill"></a>

## Brownfield TEA Sequence

### Recommended Sequence

The BMad Method module provides `document-project`, `prd`, and `architecture`.
The `/bmad-tea-*` commands are TEA skills.
On Codex, use `$` for the skill prefix.

| Stage                        | Command                               | Purpose                                           |
| ---------------------------- | ------------------------------------- | ------------------------------------------------- |
| 1. Documentation (if needed) | `document-project` (BMM)              | Baseline docs for an undocumented codebase        |
| 2. Baseline (Phase 2)        | `/bmad-tea-trace`, Phase 1            | Coverage baseline                                 |
| 2. Baseline (Phase 2)        | `/bmad-tea-test-review`               | Quality baseline                                  |
| 3. Planning (Phase 2-3)      | `prd`, `architecture` (BMM)           | Document requirements and architecture if missing |
| 3. Planning (Phase 2-3)      | `/bmad-tea-test-design`, system-level | Testability review                                |
| 4. Infrastructure (Phase 3)  | `/bmad-tea-framework`                 | Modernize the framework; include CI if needed     |
| 4. Infrastructure (Phase 3)  | `/bmad-tea-framework` with CI scope   | Set up or improve CI/CD                           |
| 5. Per epic (Phase 4)        | `/bmad-tea-test-design`, epic-level   | Focus on regression hotspots                      |
| 5. Per epic (Phase 4)        | `/bmad-tea-automate`                  | Add the missing tests                             |
| 5. Per epic (Phase 4)        | `/bmad-tea-test-review`               | Check quality                                     |
| 5. Per epic (Phase 4)        | `/bmad-tea-trace`, Phase 1            | Refresh coverage                                  |
| 6. Release gate              | `/bmad-tea-nfr`                       | Audit NFR evidence, where evidence exists         |
| 6. Release gate              | `/bmad-tea-trace`, Phase 2            | Gate decision                                     |

## Related Guides

**Skill Guides:**

- [How to Run Trace](/docs/how-to/workflows/run-trace.md): Baseline coverage analysis
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md): Quality audit
- [How to Run Automate](/docs/how-to/workflows/run-automate.md): Fill coverage gaps
- [How to Run Test Design](/docs/how-to/workflows/run-test-design.md): Risk assessment

**Customization:**

- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md): Modernize tests with utilities

## Understanding the Concepts

- [Engagement Models](/docs/explanation/engagement-models.md): Brownfield model explained
- [Test Quality Standards](/docs/explanation/test-quality-standards.md): What makes tests good
- [Network-First Patterns](/docs/explanation/network-first-patterns.md): Fix flakiness
- [Risk-Based Testing](/docs/explanation/risk-based-testing.md): Prioritize improvements

## Reference

- [TEA Command Reference](/docs/reference/commands.md): Skill commands
- [TEA Configuration](/docs/reference/configuration.md): Config options
- [Knowledge Base Index](/docs/reference/knowledge-base.md): Testing patterns
- [Glossary](/docs/glossary/index.md#test-architect-tea-concepts): TEA terminology
