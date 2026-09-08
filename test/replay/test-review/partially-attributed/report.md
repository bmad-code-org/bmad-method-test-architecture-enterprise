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

**Quality Score**: 43/100 (F)
**Review Date**: 2026-09-08
**Review Scope**: directory

## Executive Summary

**Overall Assessment**: Critical Issues

**Recommendation**: Block

**Context Basis**: none

**Context Waivers Applied**: 0

### Summary

Seven findings carry a registry row. An eighth violation, a medium-severity one, is counted in the total below and described in the naming notes rather than written as its own finding block, which the report contract permits for Medium and Low.

**Total Violations**: 4 Critical, 3 High, 1 Medium, 0 Low

## Quality Score Breakdown

```text
Starting Score:          100
Critical Violations:     -4 × 10 = -40
High Violations:         -3 × 5 = -15
Medium Violations:       -1 × 2 = -2
Low Violations:          -0 × 1 = -0

Total Bonus:             +0

Final Score:             43/100
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

### Naming notes

Two of the order tests assert against the cart banner and the order history in the same body, which is the counted medium-severity concern. This block carries no Location and no Row, so it is prose under a findings heading rather than a finding, and nothing here attributes that violation to a registry row.

## Decision

**Recommendation**: Block

## Reviewed Files

- test/fixtures/test-review-eval/seeded/checkout.spec.ts
- test/fixtures/test-review-eval/seeded/orders.service.spec.ts
- test/fixtures/test-review-eval/clean/profile.spec.ts
