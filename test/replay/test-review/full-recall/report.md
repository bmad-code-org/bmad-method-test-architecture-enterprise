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

**Quality Score**: 39/100 (F)
**Review Date**: 2026-09-08
**Review Scope**: directory

## Executive Summary

**Overall Assessment**: Critical Issues

**Recommendation**: Block

**Context Basis**: none

**Context Waivers Applied**: 0

### Summary

Every one of the nine planted defects is reported at the line the registry rule fires on, and the clean control is reported clean. This is the ceiling the corpus can reach.

**Total Violations**: 4 Critical, 4 High, 0 Medium, 1 Low

## Quality Score Breakdown

```text
Starting Score:          100
Critical Violations:     -4 × 10 = -40
High Violations:         -4 × 5 = -20
Medium Violations:       -0 × 2 = -0
Low Violations:          -1 × 1 = -1

Total Bonus:             +0

Final Score:             39/100
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

### 5. CSS id locator where a role locator is available

**Severity**: P3 (Low)
**Location**: `test/fixtures/test-review-eval/seeded/checkout.spec.ts:19`
**Row**: L1

## Decision

**Recommendation**: Block

## Reviewed Files

- test/fixtures/test-review-eval/seeded/checkout.spec.ts
- test/fixtures/test-review-eval/seeded/orders.service.spec.ts
- test/fixtures/test-review-eval/clean/profile.spec.ts
