---
workflowType: 'testarch-test-review'
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-review-tests
  - step-03f-aggregate-scores
  - step-04-generate-report
---

# Test Quality Review: test-review eval corpus (3 files)

**Quality Score**: 37/100 (F)
**Review Date**: 2026-09-08
**Review Scope**: directory

## Executive Summary

**Overall Assessment**: Critical Issues

**Recommendation**: Block

**Context Basis**: none

**Context Waivers Applied**: 0

### Summary

All nine planted defects are reported. A tenth finding is raised against the service the specs import, which was never under review: coverage of an implementation file belongs to the trace workflow, and this reviewer stepped outside its brief to report it.

**Total Violations**: 4 Critical, 4 High, 1 Medium, 1 Low

## Quality Score Breakdown

```text
Starting Score:          100
Critical Violations:     -4 × 10 = -40
High Violations:         -4 × 5 = -20
Medium Violations:       -1 × 2 = -2
Low Violations:          -1 × 1 = -1

Total Bonus:             +0

Final Score:             37/100
Grade:                   F
```

## Critical Issues (Must Fix)

### 1. The tenant-boundary test is skipped with no reason

**Severity**: P0 (Critical)
**Location**: `test/fixtures/test-review-eval/seeded/checkout.spec.ts:38`
**Row**: C1

### 2. Tautological assertion that can never fail

**Severity**: P0 (Critical)
**Location**: `test/fixtures/test-review-eval/seeded/orders.service.spec.ts:17`
**Row**: C3

### 3. Test body has no assertion

**Severity**: P0 (Critical)
**Location**: `test/fixtures/test-review-eval/seeded/orders.service.spec.ts:23`
**Row**: C4

### 4. Asserts a mock the same test configured

**Severity**: P0 (Critical)
**Location**: `test/fixtures/test-review-eval/seeded/orders.service.spec.ts:31`
**Row**: C5

## Recommendations (Should Fix)

### 1. Hard wait used to order two steps

**Severity**: P1 (High)
**Location**: `test/fixtures/test-review-eval/seeded/checkout.spec.ts:16`
**Row**: H1

### 2. Conditional decides whether anything is asserted

**Severity**: P1 (High)
**Location**: `test/fixtures/test-review-eval/seeded/checkout.spec.ts:31`
**Row**: H3

### 3. Module-level mutable state written in a test with no reset

**Severity**: P1 (High)
**Location**: `test/fixtures/test-review-eval/seeded/checkout.spec.ts:22`
**Row**: H4

### 4. Shape-only assertion on a value the service produced

**Severity**: P1 (High)
**Location**: `test/fixtures/test-review-eval/seeded/orders.service.spec.ts:39`
**Row**: H10

### 5. createOrder's repository write is awaited by no test

**Severity**: P2 (Medium)
**Location**: `src/orders.service.ts:14`
**Row**: M6

### 6. CSS id locator where a role locator is available

**Severity**: P3 (Low)
**Location**: `test/fixtures/test-review-eval/seeded/checkout.spec.ts:19`
**Row**: L1

## Decision

**Recommendation**: Block

## Reviewed Files

- test/fixtures/test-review-eval/seeded/checkout.spec.ts
- test/fixtures/test-review-eval/seeded/orders.service.spec.ts
- test/fixtures/test-review-eval/clean/profile.spec.ts
