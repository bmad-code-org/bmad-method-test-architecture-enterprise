---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03f-aggregate-scores', 'step-04-generate-report']
lastStep: 'step-04-generate-report'
lastSaved: '2026-08-17'
workflowType: 'testarch-test-review'
inputDocuments:
  - 'tests/e2e/profile-notifications.spec.ts'
  - 'docs/stories/5-2-notification-preferences.md'
  - 'test-artifacts/test-design-epic-5.md'
  - 'playwright.config.ts'
  - 'src/workflows/testarch/bmad-testarch-test-review/steps-c/criteria-registry.md'
---

# Test Quality Review: profile-notifications.spec.ts

**Quality Score**: 97/100 (A)
**Review Date**: 2026-08-17
**Review Scope**: single
**Reviewer**: TEA Agent

---

Note: This review audits existing tests. It does not generate tests or score requirement coverage. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Needs Improvement

**Recommendation**: Request Changes

**Context Basis**: pr_diff

**Context Waivers Applied**: 0

The score remains high because the file is small, readable, and mostly deterministic. One HIGH finding still forces `Request Changes`: a fixed timer can pass or fail according to runner speed. The recommendation is computed from the deduplicated registry findings and is unchanged by the strong numeric score.

### Key Strengths

- Behavior-focused Given-When-Then naming across all three tests
- Tenant and user setup is isolated through project fixtures
- Stable test IDs and explicit assertions make failures diagnosable

### Key Weaknesses

- One fixed `waitForTimeout` introduces timing-dependent behavior
- One network observer is registered after navigation
- One test omits the repository's established priority marker

## Quality Criteria Assessment

| Criterion                            | Status        | Violations | Basis                                                                   | Notes                                                    |
| ------------------------------------ | ------------- | ---------: | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| BDD Format (Given-When-Then)         | ✅ PASS       |          0 | Convention: bddNaming (18 of 24 sampled)                                | All names state user-visible behavior                    |
| Test IDs                             | ✅ PASS       |          0 | Convention: testIds (20 of 24 sampled)                                  | All DOM lookups use stable test IDs                      |
| Priority Markers (P0/P1/P2/P3)       | ⚠️ WARN       |          1 | Convention: priorityMarkers (22 of 24 sampled)                          | Test at line 81 has no marker                            |
| Disabled or Focused Tests            | ✅ PASS       |          0 | Absolute                                                                | No skip, fixme, only, or focus marker                    |
| Hard Waits (sleep, waitForTimeout)   | ❌ FAIL       |          1 | Absolute                                                                | Fixed 2-second timer at line 37                          |
| Determinism (no conditionals)        | ✅ PASS       |          0 | Absolute                                                                | No branching, catches, or wall-clock fixtures            |
| Isolation (cleanup, no shared state) | ✅ PASS       |          0 | Absolute                                                                | Fixtures create and remove each preference record        |
| Fixture Patterns                     | ✅ PASS       |          0 | Applicability: the file needs authenticated setup                       | Existing merged fixtures are reused                      |
| Data Factories                       | ✅ PASS (n/a) |          0 | Applicability: the file does not construct domain payloads              | No payload shape to extract                              |
| Network-First Pattern                | ❌ FAIL       |          1 | Applicability: the file navigates and then reads data-dependent content | Observer at line 58 is declared after navigation         |
| Playwright Utils Adoption            | ✅ PASS       |          0 | Convention: playwrightUtils (16 of 24 sampled)                          | Imports merged fixtures and uses utility interception    |
| Pact.js Utils Adoption               | ✅ PASS (n/a) |          0 | Applicability: the reviewed file is not a Pact artifact                 | Gate closed                                              |
| Explicit Assertions                  | ✅ PASS       |          0 | Absolute                                                                | Every test has a falsifiable assertion                   |
| Test Length (≤1000 lines)            | ✅ PASS       |          0 | Absolute                                                                | File is 146 lines                                        |
| Test Duration (≤1.5 min)             | ⚠️ WARN       |          1 | Absolute                                                                | Measured at 18 seconds, but H1 still makes timing unsafe |
| Flakiness Patterns                   | ❌ FAIL       |          1 | Absolute                                                                | Same H1 timer, counted once in the ledger                |

**Total Violations**: 0 Critical, 1 High, 1 Medium, 1 Low

**Convention Baseline**: 24 test files sampled outside the review set

## Quality Score Breakdown

```
Starting Score:          100
Critical Violations:     -0 × 10 = -0
High Violations:         -1 × 5 = -5
Medium Violations:       -1 × 2 = -2
Low Violations:          -1 × 1 = -1

Bonus Points:
  Excellent BDD:         +5
  Comprehensive Fixtures: +0
  Data Factories:        +0
  Network-First:         +0
  Perfect Isolation:     +0
  All Test IDs:          +0
                         --------
Total Bonus:             +5

Final Score:             97/100
Grade:                   A
```

The hard-wait finding appears in three assessment rows because H1 affects timing, duration, and flakiness. The ledger deduplicates the same row, file, and line into one HIGH violation.

## Critical Issues (Must Fix)

No critical issues detected.

## Recommendations (Should Fix)

### 1. Replace the Fixed Notification Delay

**Severity**: P1 (High)
**Location**: `tests/e2e/profile-notifications.spec.ts:37`
**Row**: H1
**Criterion**: Hard Waits
**Knowledge Base**: [test-quality.md](./knowledge/test-quality.md)

**Issue Description:** The test sleeps for two seconds after saving notification preferences. It can pass before persistence finishes on a fast response and fail after two seconds on a slow runner.

**Current Code:**

```typescript
await saveButton.click();
await page.waitForTimeout(2000);
await expect(savedBanner).toBeVisible();
```

**Recommended Improvement:**

```typescript
const savePreference = interceptNetworkCall({
  url: '/api/profile/notification-preferences',
  method: 'PUT',
});

await saveButton.click();
await savePreference;
await expect(savedBanner).toBeVisible();
```

**Why This Matters:** The response is the state transition the assertion depends on. Waiting for that response is deterministic across runner speeds.

### 2. Register the Preference Load Observer Before Navigation

**Severity**: P2 (Medium)
**Location**: `tests/e2e/profile-notifications.spec.ts:58`
**Row**: M1
**Criterion**: Network-First Pattern
**Knowledge Base**: [network-first.md](./knowledge/network-first.md)

**Issue Description:** The test opens `/profile/notifications` before creating the observer for the initial preference request. A fast response can finish before the observer exists.

**Current Code:**

```typescript
await page.goto('/profile/notifications');
const preferencesLoaded = interceptNetworkCall({ url: '/api/profile/notification-preferences' });
await preferencesLoaded;
```

**Recommended Improvement:**

```typescript
const preferencesLoaded = interceptNetworkCall({ url: '/api/profile/notification-preferences' });
await page.goto('/profile/notifications');
await preferencesLoaded;
```

**Benefits:** The test observes the request regardless of response speed and keeps the existing playwright-utils convention.

### 3. Add the Missing Priority Marker

**Severity**: P3 (Low)
**Location**: `tests/e2e/profile-notifications.spec.ts:81`
**Row**: L2
**Criterion**: Priority Markers
**Knowledge Base**: [test-priorities-matrix.md](./knowledge/test-priorities-matrix.md)

**Issue Description:** The repository uses priority markers in 22 of 24 sampled files. This test has none, so selective execution cannot classify it.

**Recommended Improvement:** Prefix the behavioral name with `[P2]` after confirming the priority through the decision tree. Do not infer the marker from a risk score.

## Best Practices Found

### 1. Composed Authentication Fixture

**Location**: `tests/e2e/profile-notifications.spec.ts:6`
**Pattern**: Merged fixture entry point
**Knowledge Base**: [fixture-architecture.md](./knowledge/fixture-architecture.md)

The file imports `test` from `tests/support/merged-fixtures` and receives `authToken` and `profilePreference` from isolated fixtures. It does not repeat login through the UI.

### 2. Stable State Assertions

**Location**: `tests/e2e/profile-notifications.spec.ts:25`
**Pattern**: Test-ID selectors with explicit assertions
**Knowledge Base**: [test-quality.md](./knowledge/test-quality.md)

The assertions target the saved banner, digest checkbox, and frequency value directly. They can fail when the user-visible state is wrong.

## Test File Analysis

### File Metadata

- **File Path**: `tests/e2e/profile-notifications.spec.ts`
- **File Size**: 146 lines, 5.8 KB
- **Test Framework**: Playwright
- **Language**: TypeScript

### Test Structure

- **Describe Blocks**: 1
- **Test Cases**: 3
- **Average Test Length**: 31 lines
- **Fixtures Used**: 3 (`authToken`, `profilePreference`, `interceptNetworkCall`)
- **Data Factories Used**: 0

### Test Scope

- **Test IDs**: `5.2-E2E-001`, `5.2-E2E-002`, `5.2-E2E-003`
- **Priority Distribution**:
  - P0: 0
  - P1: 1
  - P2: 1
  - P3: 0
  - Unknown: 1

### Assertions Analysis

- **Total Assertions**: 5
- **Assertions per Test**: 1.7 average
- **Assertion Types**: visibility, checked state, input value

## Context and Integration

### What the Context Said

Story 5.2 requires saving email and push preferences, preserving the saved state across a reload, and rejecting an unsupported digest frequency. The reviewed tests cover those behaviors. The PR diff also changes the preference API from a synchronous response to a queued write, which raises the impact of the hard wait and late observer; context does not waive either registry row.

### Related Artifacts

- **Story File**: `docs/stories/5-2-notification-preferences.md`
- **Test Design**: `test-artifacts/test-design-epic-5.md`
- **Risk Assessment**: Medium
- **Priority Framework**: P0 through P3 applied independently from risk score

## Knowledge Base References

- [test-quality.md](./knowledge/test-quality.md)
- [fixture-architecture.md](./knowledge/fixture-architecture.md)
- [network-first.md](./knowledge/network-first.md)
- [data-factories.md](./knowledge/data-factories.md)
- [test-levels-framework.md](./knowledge/test-levels-framework.md)
- [selective-testing.md](./knowledge/selective-testing.md)
- [ci-burn-in.md](./knowledge/ci-burn-in.md)
- [test-priorities-matrix.md](./knowledge/test-priorities-matrix.md)

## Next Steps

### Immediate Actions Before Merge

1. Replace the hard wait with the response-bound observer. Owner: PR author.
2. Move the initial preference observer before navigation. Owner: PR author.
3. Add the reviewed P2 priority marker. Owner: PR author.

### Follow-up Actions

1. Add this file to the changed-test burn-in set after the fixes land.

### Re-Review Needed?

Re-review after the HIGH finding is fixed. The computed recommendation remains `Request Changes` until H1 is absent.

## Decision

**Recommendation**: Request Changes

**Rationale:** One HIGH hard-wait violation requires changes even though the deterministic score is 97. The two remaining findings are cheaper to fix in the same change and protect the queued-write transition introduced by this pull request.

## Appendix

### Violation Summary by Location

| Line | Severity | Criterion             | Row | Issue                                | Fix                                 |
| ---: | -------- | --------------------- | --- | ------------------------------------ | ----------------------------------- |
|   37 | P1       | Hard Waits            | H1  | Fixed two-second timer               | Await the application response      |
|   58 | P2       | Network-First Pattern | M1  | Observer registered after navigation | Register before `page.goto`         |
|   81 | P3       | Priority Markers      | L2  | Established marker missing           | Add decision-tree-derived P2 marker |

### Quality Trends

No earlier review exists for this file.

## Reviewed Files

- tests/e2e/profile-notifications.spec.ts

## Review Context

- docs/stories/5-2-notification-preferences.md
- test-artifacts/test-design-epic-5.md
- src/profile/notification-preferences.ts
