---
workflowType: 'testarch-test-review'
stepsCompleted:
  - step-01-load-context
  - step-02-discover-tests
  - step-03-review-tests
---

# Test Quality Review: conflicting.spec.ts

**Quality Score**: 70/100 (C - Acceptable)
**Review Date**: 2026-07-29
**Review Scope**: single

## Executive Summary

**Overall Assessment**: Acceptable

**Recommendation**: Approve

### Summary

This fixture intentionally contradicts itself: the summary and the decision
disagree, so the CLI must treat parsing as a failure, never trust the first.

**Total Violations**: 0 Critical, 0 High, 1 Medium, 0 Low

## Decision

**Recommendation**: Block

## Reviewed Files

tests/conflicting.spec.ts
