---
workflowType: 'testarch-test-review'
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-review-tests
---

# Test Quality Review: shared-state.spec.ts

**Quality Score**: 55/100 (F)
**Review Date**: 2026-07-29
**Review Scope**: single

## Executive Summary

**Overall Assessment**: Needs Work

**Recommendation**: Request Changes

### Summary

One critical violation (shared mutable state across tests) plus follow-ups;
requesting changes is the consistent verdict for critical findings.

**Total Violations**: 1 Critical, 7 High, 0 Medium, 0 Low

## Quality Score Breakdown

```
Starting Score:          100
Critical Violations:     -1 × 10 = -10
High Violations:         -7 × 5 = -35
Medium Violations:       -0 × 2 = -0
Low Violations:          -0 × 1 = -0

Total Bonus:             +0

Final Score:             55/100
Grade:                   F
```

## Decision

**Recommendation**: Request Changes

## Reviewed Files

tests/shared-state.spec.ts
