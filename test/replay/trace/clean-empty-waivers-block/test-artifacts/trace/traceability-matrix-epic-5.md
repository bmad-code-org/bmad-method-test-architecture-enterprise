---
workflowType: 'testarch-trace'
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
coverageBasis: 'acceptance_criteria'
oracleResolutionMode: 'formal_requirements'
oracleSources: ['docs/epics/epic-5-api-token-lifecycle.md']
---

# Traceability Matrix and Gate Decision: Epic 5, API Token Lifecycle

**Target:** Epic 5, API Token Lifecycle
**Evaluator:** tea-eval-harness
**Coverage Oracle:** acceptance criteria
**Oracle Sources:** `docs/epics/epic-5-api-token-lifecycle.md`

## Phase 1: Requirements Traceability

### Coverage Summary

| Priority  | Total Criteria | Full Coverage | Coverage | Status   |
| --------- | -------------: | ------------: | -------: | -------- |
| P0        |              2 |             2 |     100% | PASS     |
| P1        |              2 |             2 |     100% | PASS     |
| P2        |              1 |             1 |     100% | PASS     |
| P3        |              0 |             0 |      N/A | N/A      |
| **Total** |          **5** |         **5** | **100%** | **PASS** |

### Detailed Mapping

#### AC-1: A revoked token stops working immediately (P0)

- **Coverage:** FULL
- **Tests:**
  - `5-API-001` - `tests/api/token-revocation.api.spec.ts:14`: the request after a revocation is rejected with 401
- **Recommendation:** None

#### AC-2: A token secret is returned once and never again (P0)

- **Coverage:** FULL
- **Tests:**
  - `5-API-002` - `tests/api/token-revocation.api.spec.ts:32`: the secret is present at creation and absent from every later read
- **Recommendation:** None

#### AC-3: An admin creates a token with a name and an expiry (P1)

- **Coverage:** FULL
- **Tests:**
  - `5-E2E-001` - `tests/e2e/token-management.spec.ts:10`: an admin creates a named token with an expiry and sees it listed with a masked prefix
- **Recommendation:** None

#### AC-4: A token past its expiry stops working and is marked expired (P1)

- **Coverage:** FULL
- **Tests:**
  - `5-API-003` - `tests/api/credential-lifetime.api.spec.ts:15`: a request made after the credential lifetime has run out is rejected with 401
  - `5-API-004` - `tests/api/credential-lifetime.api.spec.ts:29`: the console listing reports a lapsed credential in the expired state
- **Recommendation:** None

#### AC-5: The token list shows when each token was last used (P2)

- **Coverage:** FULL
- **Tests:**
  - `5-COMP-001` - `tests/component/token-list.spec.tsx:10`: shows the last use time for a used token and "Never used" for an unused one
- **Recommendation:** None

### Gap Analysis

No gaps. Every criterion is FULL.

## Phase 2: Quality Gate Decision

**Gate Type:** epic
**Decision Mode:** deterministic
**Collection Status:** COLLECTED

### Live Evidence

- **Present:** false
- **Freshness:** not_present

### Gate Decision: PASS
