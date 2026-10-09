---
title: 'How to Run Trace with TEA'
description: Map requirements, specs, or inferred journeys to tests and make quality gate decisions using TEA's trace workflow
---

# How to Run Trace with TEA

Use TEA's `trace` workflow for coverage traceability and quality gate decisions.
This is a two-phase workflow: Phase 1 analyzes coverage, Phase 2 makes the go/no-go decision.

The workflow resolves the best available coverage oracle automatically: formal requirements first, contract/spec artifacts second, resolvable external pointers third, and synthetic journeys inferred from source as the brownfield fallback.

## When to Use This

### Phase 1: Coverage Traceability

- Map requirements or inferred journeys to implemented tests
- Identify coverage gaps
- Prioritize missing tests
- Refresh coverage after each story/epic

### Phase 2: Quality Gate Decision

- Make go/no-go decision for release
- Validate coverage meets thresholds
- Document gate decision with evidence
- Support business-approved waivers

## Prerequisites

- Formal requirements, specs, or an analyzable source tree available
- Tests implemented
- For brownfield: Existing codebase with tests

## Steps

### 1. Run the Trace Workflow

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-trace`
- **Codex:** `$bmad-testarch-trace`
- **Inside a `/bmad-tea` chat:** `TR`

Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

### 2. Specify Phase

TEA will ask which phase you're running.

#### Phase 1: Coverage Traceability

- Analyze coverage
- Identify gaps
- Generate recommendations

#### Phase 2: Quality Gate Decision

- Derive PASS, CONCERNS, or FAIL from the evidence
- Requires Phase 1 complete

**Typical flow:** Run Phase 1 first, review gaps, then run Phase 2 for gate decision.

---

## Phase 1: Coverage Traceability

### 3. Provide Coverage Source

TEA will first look for the best available coverage oracle.

**Options:**

| Source          | Example                             | Best For                                                         |
| --------------- | ----------------------------------- | ---------------------------------------------------------------- |
| **Story file**  | `story-profile-management.md`       | Single story coverage                                            |
| **Test design** | `test-design/test-design-epic-1.md` | Epic coverage                                                    |
| **PRD**         | `PRD.md`                            | System-level coverage                                            |
| **Spec**        | `openapi.yaml`                      | API/contract coverage                                            |
| **Pointer**     | `requirements.md -> tracker/doc`    | External system of record (for example Jira, Linear, Confluence) |
| **Synthetic**   | inferred from `src/`                | Brownfield UI fallback                                           |
| **Multiple**    | All of the above                    | Combined coverage analysis                                       |

**Example Response:**

```text
Run trace for epic 1.
Coverage sources:
- story-profile-management.md (acceptance criteria)
- test-design/test-design-epic-1.md (test priorities)
```

If none of those exist and `allow_synthetic_oracle` is enabled, TEA should infer provisional journeys from routes/pages/screens, major user actions, auth flows, and important UI states, then trace tests against those inferred journeys with an explicit confidence level.

### 4. Specify Test Location

TEA will ask where tests are located.

**Example:**

```text
Test location: tests/
Include:
- tests/api/
- tests/e2e/
```

#### Requirements Verified by Running the System

You can record requirements verified by driving the application in `{test_artifacts}/live-verification-results.json`.

Trace counts current-commit results at the `live` coverage level.
Results for other commits are excluded.
A requirement covered only by live evidence caps the gate at CONCERNS.

The file format and the test-case ID format are published in [Live Verification Results](/docs/reference/live-verification-results.md).
Any producer can emit it: an agent, a script, a CI job, or a person recording an outcome by hand.

### 5. Specify Focus Areas (Optional)

**Example:**

```text
Focus on:
- Profile CRUD operations
- Validation scenarios
- Authorization checks
```

### 6. Review Coverage Matrix

TEA generates a traceability matrix.

Every trace output lands in `{test_artifacts}/trace/` and carries the run's scope in its name: `epic-1` for this epic 1 run, `story-{story_key}` for one story, `release-{slug}` or `hotfix-{slug}` for a release or hotfix gate, and `system` for the whole project.
A run for epic 2 writes its own files and never opens epic 1's.
Re-running the same scope replaces that scope's files.
See [Output Layout](/docs/reference/configuration.md#output-layout) for the full rules.

#### Traceability Matrix (`trace/traceability-matrix-epic-1.md`):

```markdown
# Requirements Traceability Matrix

**Date:** 2026-01-13
**Scope:** Epic 1: User Profile Management

## Coverage Summary

| Priority | Fully covered | Total | Coverage |
| -------- | ------------- | ----- | -------- |
| P0       | 4             | 5     | 80%      |
| P1       | 5             | 6     | 83%      |
| P2       | 2             | 3     | 67%      |
| P3       | 0             | 1     | 0%       |

Overall full coverage: 11/15 (73%).
Three requirements have partial coverage; one has none.

## Requirement 2: Edit profile (P0)

Coverage: PARTIAL.
`tests/e2e/profile-edit.spec.ts` covers name, email, persistence, and the success message.
`tests/api/profile.spec.ts` covers name and email updates.
Bio changes and avatar uploads need API and E2E tests before this P0 requirement is fully covered.

## Requirement 15: Export profile as PDF (P2)

Coverage: NONE.
Record an owner and target release for the missing test.
```

Add a test for each missing behavior:

```typescript
// tests/e2e/profile-edit.spec.ts
test('should edit bio field', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Bio').fill('New bio text');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('New bio text')).toBeVisible();
});

// tests/api/profile.spec.ts
test('should update bio via API', async ({ request }) => {
  const response = await request.patch('/api/profile', {
    data: { bio: 'Updated bio' },
  });
  expect(response.ok()).toBeTruthy();
  const { bio } = await response.json();
  expect(bio).toBe('Updated bio');
});
```

**With Playwright Utils:**

```typescript
// tests/e2e/profile-edit.spec.ts
import { test } from '../support/fixtures'; // Composed with authToken

test('should edit bio field', async ({ page, authToken }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Bio').fill('New bio text');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('New bio text')).toBeVisible();
});

// tests/api/profile.spec.ts
import { test as base, expect } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';
import { mergeTests } from '@playwright/test';

// Merge API request + auth fixtures
const authFixtureTest = base.extend(createAuthFixtures());
const test = mergeTests(apiRequestFixture, authFixtureTest);

test('should update bio via API', async ({ apiRequest, authToken }) => {
  const { status, body } = await apiRequest({
    method: 'PATCH',
    path: '/api/profile',
    body: { bio: 'Updated bio' },
    headers: { Authorization: `Bearer ${authToken}` },
  });

  expect(status).toBe(200);
  expect(body.bio).toBe('Updated bio');
});
```

`authToken` requires auth-session fixture setup.
See [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md#auth-session).

### 2. Add Avatar Upload Tests

**Tests Needed:**

```typescript
// tests/e2e/profile-edit.spec.ts
test('should upload avatar image', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit' }).click();

  // Upload file
  await page.setInputFiles('[type="file"]', 'fixtures/avatar.png');
  await page.getByRole('button', { name: 'Save' }).click();

  // Verify uploaded image displays
  await expect(page.locator('img[alt="Profile avatar"]')).toBeVisible();
});

// tests/api/profile.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs/promises';

test('should accept valid image upload', async ({ request }) => {
  const response = await request.post('/api/profile/avatar', {
    multipart: {
      file: {
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: await fs.readFile('fixtures/avatar.png'),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
});
```

---

## Next Steps

After reviewing traceability:

1. **Fix critical gaps**: Add tests for P0/P1 requirements
2. **Run `test-review`**: Check new tests meet quality standards
3. **Run Phase 2**: Make gate decision after gaps addressed

---

## Phase 2: Quality Gate Decision

After Phase 1 coverage analysis is complete, run Phase 2 for the gate decision.

**Prerequisites:**

- Phase 1 traceability matrix complete
- Test execution results available (must have test results)

Phase 2 will skip if test execution results aren't provided.
The workflow requires actual test run results to make gate decisions.

### 7. Run Phase 2

Invoke the workflow again with the same command as step 1:

```text
/bmad-testarch-trace
```

Select "Phase 2: Quality Gate Decision"

### 8. Provide Additional Context

TEA will ask for:

**Gate Type:**

- Story gate (small release)
- Epic gate (larger release)
- Release gate (production deployment)
- Hotfix gate (emergency fix)

TEA derives the decision from coverage thresholds, oracle confidence, live evidence, and the execution results.
It validates any filed waiver and reports its validity alongside the derived decision.

**Example:**

```text
Gate type: Epic gate
Decision mode: Deterministic
```

### 9. Provide Supporting Evidence

TEA loads these inputs itself when they exist.
Name a different file when yours lives elsewhere.

**Phase 1 Results:**

```text
trace/traceability-matrix-epic-1.md (from Phase 1)
```

**Test Design (Optional):**

```text
test-design/test-design-epic-1.md (from test-design)
```

A story-level run uses its epic's plan, and a system-level run uses `test-design/test-design-architecture.md` and `test-design/test-design-qa.md`.

**NFR Evidence Audit (Optional):**

```text
nfr/nfr-assessment-epic-1.md (from nfr-assess)
```

TEA takes the first NFR audit it finds, in this order:

1. `nfr/nfr-assessment-{run_key}.md`, the audit for this run's own scope.
2. For a story, its epic's `nfr/nfr-assessment-epic-{epic_num}.md`.
3. `nfr/nfr-assessment-system.md`.
4. `nfr-assessment.md` at the root of `{test_artifacts}`, written by TEA versions before the `nfr/` folder.

Test-review reports are a separate quality record, and trace does not read them.

### 10. Review Gate Decision

TEA makes an evidence-based gate decision and writes it into the Phase 2 section of the same report, `trace/traceability-matrix-epic-1.md`.
When the collection is gate-eligible, it also writes the machine-readable gate signal to `trace/gate-decision-epic-1.json` for CI, next to the full summary in `trace/e2e-trace-summary-epic-1.json`.

#### Gate Decision (Phase 2 section of `trace/traceability-matrix-epic-1.md`):

```markdown
# Phase 2: Quality Gate Decision

**Scope:** Epic 1
**Decision:** PASS
**Date:** 2026-01-13

| Priority | Covered | Total | Coverage |
| -------- | ------- | ----- | -------- |
| P0       | 5       | 5     | 100%     |
| P1       | 6       | 6     | 100%     |
| P2       | 2       | 3     | 67%      |
| P3       | 0       | 1     | 0%       |

Overall coverage: 13/15 (87%).
The test execution results pass, and the NFR audit is PASS.
The profile-export gap is P2 and scheduled for v1.3.

Approval record: Product Manager, Tech Lead, QA Lead; 2026-01-13.
```

### Gate Decision Rules

For a gate-eligible collection, TEA applies these coverage thresholds:

| P0 Coverage | P1 Coverage | Overall Coverage | Decision        |
| ----------- | ----------- | ---------------- | --------------- |
| 100%        | ≥90%        | ≥80%             | **PASS** ✅     |
| 100%        | 80-89%      | ≥80%             | **CONCERNS** ⚠️ |
| <100%       | Any         | Any              | **FAIL** ❌     |
| Any         | <80%        | Any              | **FAIL** ❌     |
| Any         | Any         | <80%             | **FAIL** ❌     |

**Detailed Rules:**

- **PASS:** P0=100%, P1≥90%, Overall≥80%
- **CONCERNS:** P0=100%, P1 80-89%, Overall≥80% (below threshold but not critical)
- **FAIL:** P0<100% OR P1<80% OR Overall<80% (critical gaps)

**PASS** ✅: All criteria met, ready to release

For a CONCERNS decision, document:

- Mitigation plan exists
- Risk is acceptable
- Team approves proceeding
- Monitoring in place

**FAIL** ❌: Critical criteria not met:

- P0 requirements not tested
- Critical security vulnerabilities
- System is broken
- Cannot deploy

A human can approve a waiver of FAIL under the team's release policy.
Trace checks the filed waiver and records its validity; the reported coverage and derived decision remain unchanged.

### Example CONCERNS Decision

```markdown
## Decision Summary

**Verdict:** CONCERNS: release approval requires the documented mitigation

**Evidence:**

- P0 coverage: 100%
- P1 coverage: 85% (below 90% target)
- Overall coverage: 85%

**Gaps:**

- 1 P1 requirement not tested (avatar upload)
- P1 coverage is below the 90% PASS threshold

**Mitigation:**

- Avatar upload not critical for v1.2 launch
- The avatar-upload gap has an owner and target release
- Monitoring alerts configured

**Approvals:**

- Product Manager: APPROVED (business priority to launch)
- Tech Lead: APPROVED (technical risk acceptable)
```

### Example FAIL Decision

```markdown
## Decision Summary

**Verdict:** FAIL: release is blocked

**Evidence:**

- P0 coverage: 60% (below required 100%)
- Critical SQL injection finding in the NFR audit
- Overall coverage: 65%

**Blockers:**

1. **Login flow not tested** (P0 requirement)
   - Critical path completely untested
   - Must add E2E and API tests

2. **SQL injection vulnerability**
   - Critical security issue
   - Must fix before deployment

**Actions Required:**

1. Add login tests (QA team, 2 days)
2. Fix SQL injection (backend team, 1 day)
3. Re-run security scan (DevOps, 1 hour)
4. Re-run trace after fixes

**Cannot proceed until all blockers resolved.**
```

## What You Get

### Phase 1: Traceability Matrix

- Requirement-to-test mapping
- Coverage classification (FULL/PARTIAL/NONE)
- Gap identification with priorities
- Actionable recommendations

### Phase 2: Gate Decision

- Derived gate decision (PASS, CONCERNS, or FAIL)
- Evidence summary
- Approval signatures
- Next steps and monitoring plan

## Usage Patterns

### Greenfield Projects

**Phase 3:**

```text
After architecture complete:
1. Run test-design (system-level)
2. Run trace Phase 1 (baseline)
3. Use for implementation-readiness gate
```

**Phase 4:**

```text
After each epic/story:
1. Run trace Phase 1 (refresh coverage)
2. Identify gaps
3. Add missing tests
```

**Release Gate:**

```text
Before deployment:
1. Run trace Phase 1 (final coverage check)
2. Run trace Phase 2 (make gate decision)
3. Get approvals
4. Deploy (if PASS or WAIVED)
```

### Brownfield Projects

**Phase 2:**

```text
Before planning new work:
1. Run trace Phase 1 (establish baseline)
2. Understand existing coverage
3. Plan testing strategy
```

**Phase 4:**

```text
After each epic/story:
1. Run trace Phase 1 (refresh)
2. Compare to baseline
3. Track coverage improvement
```

**Release Gate:**

```text
Before deployment:
1. Run trace Phase 1 (final check)
2. Run trace Phase 2 (gate decision)
3. Compare to baseline
4. Deploy if coverage maintained or improved
```

## Tips

### Run Phase 1 Frequently

Don't wait until release gate:

```text
After Story 1: trace Phase 1 (identify gaps early)
After Story 2: trace Phase 1 (refresh)
After Story 3: trace Phase 1 (refresh)
Before Release: trace Phase 1 + Phase 2 (final gate)
```

### Use Coverage Trends

Track improvement over time:

```markdown
## Coverage Trend

| Date       | Epic     | P0/P1 Coverage | Quality Score | Status         |
| ---------- | -------- | -------------- | ------------- | -------------- |
| 2026-01-01 | Baseline | 45%            | -             | Starting point |
| 2026-01-08 | Epic 1   | 78%            | 72            | Improving      |
| 2026-01-15 | Epic 2   | 92%            | 84            | Near target    |
| 2026-01-20 | Epic 3   | 100%           | 88            | Ready          |
```

### Set Coverage Targets by Priority

Don't aim for 100% across all priorities:

**Recommended Targets:**

- **P0:** 100% (critical path must be tested)
- **P1:** 90% (high-value scenarios)
- **P2:** 50% (nice-to-have features)
- **P3:** 20% (low-value edge cases)

### Use Classification Strategically

**FULL** ✅: Oracle item completely tested

- E2E test covers full user workflow
- API test validates backend behavior
- All expected behaviors for that item covered

**PARTIAL** ⚠️: Some aspects tested

- E2E test exists but missing scenarios
- API test exists but incomplete
- Some expected behaviors not covered

**NONE** ❌: No tests exist

- Requirement identified but not tested
- May be intentional (low priority) or oversight

**Classification helps prioritize:**

- Fix NONE coverage for P0/P1 requirements first
- Enhance PARTIAL coverage for P0 requirements
- Accept PARTIAL or NONE for P2/P3 if time-constrained

### Automate Gate Decisions

Use traceability in CI:

Run trace with execution evidence available, then read its scoped gate artifact.
For an epic 1 run:

```bash
node -e "const gate = require('./_bmad-output/test-artifacts/trace/gate-decision-epic-1.json'); console.log(gate.gate_status); process.exit(gate.gate_status === 'PASS' ? 0 : 1)"
```

Adjust the artifact path to your `test_artifacts` configuration and scope.
This example blocks every decision except PASS.
Define how your pipeline handles CONCERNS and human-approved waivers before using it.

### Document Waivers Clearly

File the approved waiver in the register for this gate.
Include the approver, approval date, reason, expiry, monitoring plan, remediation owner, and fix target.
Trace reports which validation checks each entry passes or fails.

```markdown
## Waiver Documentation

**Waived By:** VP Engineering, Product Lead
**Date:** 2026-01-15
**Gate Type:** Release Gate v1.2

**Justification:**
Business critical to launch by Q1 for investor demo.
Performance concerns acceptable for initial user base.

**Conditions:**

- Set monitoring alerts for P99 > 300ms
- Plan optimization for v1.3 (due February 28)
- Monitor user feedback closely

**Accepted Risks:**

- 1% of users may experience 350ms latency
- Avatar upload feature incomplete
- Profile export deferred to next release

**Quantified Impact:**

- Affects <100 users at current scale
- Workaround exists (manual export)
- Monitoring will catch issues early

**Approvals:**

- VP Engineering: [Signature] Date: 2026-01-15
- Product Lead: [Signature] Date: 2026-01-15
- QA Lead: [Signature] Date: 2026-01-15
```

## Common Issues

### Too Many Gaps to Fix

Phase 1 shows 50 uncovered requirements.

Prioritize ruthlessly:

1. Fix all P0 gaps (critical path)
2. Fix high-risk P1 gaps
3. Accept low-risk P1 gaps with mitigation
4. Defer all P2/P3 gaps

### Can't Find Test Coverage

Tests exist but TEA can't map them to requirements.

Tests don't reference requirements.

Add traceability comments:

```typescript
test('should display profile', async ({ page }) => {
  // Covers: Requirement 1. User can view profile.
  // Acceptance criteria: Navigate to /profile, see name/email
  await page.goto('/profile');
  await expect(page.getByText('Test User')).toBeVisible();
});
```

Or use test IDs:

```typescript
test('[REQ-1] should display profile', async ({ page }) => {
  // Test code...
});
```

### Unclear What "FULL" vs "PARTIAL" Means

**FULL** ✅: All expected behaviors for the item tested

```text
Requirement: User can edit profile
Acceptance criteria:
  - Can modify name ✅ Tested
  - Can modify email ✅ Tested
  - Can upload avatar ✅ Tested
  - Changes persist ✅ Tested
Result: FULL coverage
```

**PARTIAL** ⚠️: Some criteria tested, some not

```text
Requirement: User can edit profile
Acceptance criteria:
  - Can modify name ✅ Tested
  - Can modify email ✅ Tested
  - Can upload avatar ❌ Not tested
  - Changes persist ✅ Tested
Result: PARTIAL coverage (3/4 criteria)
```

### Gate Decision Unclear

Use the [gate decision rules](#gate-decision-rules) and the report's evidence.
Check P0, P1, and overall coverage, then review oracle confidence, live-only coverage, execution failures, and NFR findings.
A missing or unreliable collection leaves the gate unevaluated; obtain the missing evidence before making a release decision.

## Related Guides

- [How to Run Test Design](/docs/how-to/workflows/run-test-design.md): Provides requirements for traceability
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md): Test quality audit, a separate record from the gate
- [How to Run NFR Evidence Audit](/docs/how-to/workflows/run-nfr-assess.md): NFR status feeds gate

## Understanding the Concepts

- [Risk-Based Testing](/docs/explanation/risk-based-testing.md): Why P0 vs P3 matters
- [TEA Overview](/docs/explanation/tea-overview.md): Gate decisions in context

## Reference

- [Command: trace](/docs/reference/commands.md#trace): Full command reference
- [TEA Configuration](/docs/reference/configuration.md): Config options
