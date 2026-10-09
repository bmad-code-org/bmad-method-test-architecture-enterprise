---
workflowType: 'testarch-test-review'
runScope: 'story'
runKey: 'story-5-2-notification-preferences'
---

# Test Quality Review: profile-notifications.spec.ts

> **Pull request gate**: Request Changes, 79/100. Reviewed commit `89abcdef`.

**Quality Score**: 79/100 (C - Needs Improvement)
**Raw Deduction Score**: 97/100
**Score Cap**: 79/100
**Score Override Rule**: Highest severity High caps effective score at 79: min(raw deduction score 97, 79) = 79.
**Review Date**: 2026-08-17
**Review Mode**: pr
**Reviewer**: claude / claude-sonnet-5-5

---

Note: This review audits existing tests. It does not generate tests or score requirement coverage. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Needs Improvement

**Recommendation**: Request Changes
**Verdict Rule**: Critical = 0 and High > 0 => Request Changes (1 High).

**Context Basis**: pr_diff

**Context Waivers Applied**: 0

**Execution Mode**: subagent

### Key Strengths

✅ Stable test IDs and explicit assertions make failures diagnosable

### Summary

The three tests are small, readable and mostly deterministic. One timing dependency in the save test is why the recommendation is Request Changes.

---

## Quality Criteria Assessment

| Criterion                            | Status          | Violations | Basis                                                                   | Notes                                                 |
| ------------------------------------ | --------------- | ---------: | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Test IDs                             | ✅ PASS         |          0 | Convention: testIds (7 of 8 sampled)                                    | All DOM lookups use stable test IDs                   |
| Priority Markers (P0/P1/P2/P3)       | ⚠️ WARN         |          1 | Convention: priorityMarkers (7 of 8 sampled)                            | See finding 3                                         |
| Disabled or Focused Tests            | ✅ PASS         |          0 | Absolute                                                                | No skip, fixme, only, or focus marker                 |
| Hard Waits (sleep, waitForTimeout)   | ❌ FAIL         |          1 | Absolute                                                                | See finding 1                                         |
| Determinism (assertions always run)  | ✅ PASS         |          0 | Absolute                                                                | No branching, catches, or wall-clock fixtures         |
| Isolation (cleanup, no shared state) | ✅ PASS         |          0 | Absolute                                                                | Fixtures create and remove each preference record     |
| Fixture Patterns                     | ✅ PASS         |          0 | Applicability: the file needs authenticated setup                       | Existing merged fixtures are reused                   |
| Network-First Pattern                | ❌ FAIL         |          1 | Applicability: the file navigates and then reads data-dependent content | See finding 2                                         |
| Playwright Utils Adoption            | ✅ PASS         |          0 | Convention: playwrightUtils (5 of 8 sampled)                            | Imports merged fixtures and uses utility interception |
| Explicit Assertions                  | ✅ PASS         |          0 | Absolute                                                                | Every test has a falsifiable assertion                |
| Test Length (≤1000 lines)            | ✅ PASS         |          0 | Absolute                                                                | File is 146 lines                                     |
| Test Duration (≤1.5 min)             | ➖ Not measured |          - | Not measured                                                            | A static read cannot time a run                       |
| Flakiness Patterns                   | ❌ FAIL         |          1 | Absolute                                                                | Finding 1, counted once in the ledger                 |

**Total Violations**: 0 Critical, 1 High, 1 Medium, 1 Low

**Convention Baseline**: 8 test files sampled outside the review set

## Quality Score Breakdown

```text
Starting Score:          100
Critical Violations:     -0 × 10 = -0
High Violations:         -1 × 5 = -5
Medium Violations:       -1 × 2 = -2
Low Violations:          -1 × 1 = -1

Bonus Points:
  Comprehensive Fixtures: +0
  Data Factories:        +0
  Network-First:         +0
  Perfect Isolation:     +0
  All Test IDs:          +5
                         --------
Total Bonus:             +5

Raw Deduction Score:     97/100
Score Cap:               79/100 (High)
Effective Score:         79/100
Grade:                   C
```

## Critical Issues (Must Fix)

No critical issues detected. ✅

## Recommendations (Should Fix)

### 1. Replace the Fixed Notification Delay

**Severity**: P1 (High)
**Location**: `tests/e2e/profile-notifications.spec.ts:37`
**Row**: H1
**Provenance**: introduced

**Issue**: The test sleeps for two seconds after saving notification preferences. It can pass before persistence finishes on a fast response and fail on a slow runner.

**Fix**: Wait for the save response, which is the state change the assertion depends on:

```typescript
const savePreference = interceptNetworkCall({ url: '/api/profile/notification-preferences', method: 'PUT' });
await saveButton.click();
await savePreference;
await expect(savedBanner).toBeVisible();
```

### 2. Register the Preference Load Observer Before Navigation

**Severity**: P2 (Medium)
**Location**: `tests/e2e/profile-notifications.spec.ts:58`
**Row**: M1
**Provenance**: introduced

**Issue**: The test opens `/profile/notifications` before creating the observer for the initial preference request, so a fast response can finish before anything is listening.

**Fix**: Create the observer first, then navigate, then await it.

### 3. Add the Missing Priority Marker

**Severity**: P3 (Low)
**Location**: `tests/e2e/profile-notifications.spec.ts:81`
**Row**: L2
**Provenance**: introduced

**Issue**: The repository uses priority markers in 7 of 8 sampled files. This test has none, so selective execution cannot classify it.

**Fix**: Prefix the behavioral name with `[P2]` after confirming the priority through the decision tree.

---

## Decision

**Recommendation**: Request Changes

---

## Reviewed Files

- tests/e2e/profile-notifications.spec.ts

## Review Context

- docs/stories/5-2-notification-preferences.md
- test-artifacts/test-design/test-design-epic-5.md
- src/profile/notification-preferences.ts
