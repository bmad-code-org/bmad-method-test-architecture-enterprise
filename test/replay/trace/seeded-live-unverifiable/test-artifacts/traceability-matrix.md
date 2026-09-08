---
workflowType: 'testarch-trace'
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
coverageBasis: 'acceptance_criteria'
oracleResolutionMode: 'formal_requirements'
oracleSources: ['docs/epics/epic-4-tenant-data-export-and-erasure.md']
---

# Traceability Matrix and Gate Decision: Epic 4, Tenant Data Export and Erasure

**Target:** Epic 4, Tenant Data Export and Erasure
**Evaluator:** tea-eval-harness
**Coverage Oracle:** acceptance criteria
**Oracle Sources:** `docs/epics/epic-4-tenant-data-export-and-erasure.md`

## Phase 1: Requirements Traceability

### Coverage Summary

| Priority  | Total Criteria | Full Coverage | Coverage | Status   |
| --------- | -------------: | ------------: | -------: | -------- |
| P0        |              2 |             1 |      50% | FAIL     |
| P1        |              5 |             5 |     100% | PASS     |
| P2        |              2 |             1 |      50% | CONCERNS |
| P3        |              1 |             0 |       0% | CONCERNS |
| **Total** |         **10** |         **7** |  **70%** | **FAIL** |

### Detailed Mapping

#### AC-1: An admin export request returns a signed download link (P0)

- **Coverage:** FULL
- **Tests:**
  - `4-API-001` - `tests/api/tenant-export.api.spec.ts:15`: an admin export request produces a ready job with a signed link
  - `4-E2E-001` - `tests/e2e/tenant-export.spec.ts:10`: an admin starts an export and the download link becomes available
- **Recommendation:** None

#### AC-2: Export is denied to a member without the admin role (P0)

- **Coverage:** NONE
- **Tests:** none
- **Considered and rejected:**
  - `4-API-002` - `tests/api/tenant-export.api.spec.ts:30`: the title names AC-2 and the body builds its context from ADMIN_TOKEN, posts the same export request AC-1 already covers, and asserts a 202. Nothing observes a member actor, a 403, or the job queue. MEMBER_TOKEN is declared and never used.
- **Gaps:**
  - Missing: a member without the admin role receives 403 and no export job is created
- **Recommendation:** Run /bmad-testarch-atdd for AC-2

#### AC-3: The export manifest lists contacts, invoices, and audit entries (P1)

- **Coverage:** FULL
- **Tests:**
  - `4-API-003` - `tests/api/tenant-export.api.spec.ts:40`: the export manifest names contacts, invoices, and audit entries
  - `4-UNIT-001` - `tests/unit/export-manifest.spec.ts:10`: emits the contacts, invoices, and audit-entries sections with record counts
- **Recommendation:** None

#### AC-4: Erasure requires the tenant slug to be typed exactly (P1)

- **Coverage:** FULL
- **Tests:**
  - `4-E2E-003` - `tests/e2e/tenant-export.spec.ts:33`: the erasure confirm control stays disabled until the slug matches exactly
- **Recommendation:** None

#### AC-5: A queued export can be cancelled before it starts (P1)

- **Coverage:** FULL
- **Tests:**
  - `4-API-004` - `tests/api/tenant-export.api.spec.ts:52`: a queued export can be cancelled and never exposes a link
- **Recommendation:** None

#### AC-6: A download link expires 24 hours after it is issued (P1)

- **Coverage:** FULL
- **Tests:**
  - `4-API-005` - `tests/api/tenant-export.api.spec.ts:69`: a download link returns 410 once it is more than 24 hours old
- **Recommendation:** None

#### AC-7: Erasure is irreversible (P1)

- **Coverage:** FULL
- **Tests:**
  - `4-API-006` - `tests/api/tenant-export.api.spec.ts:84`: after an erasure completes a new export request returns 404
- **Recommendation:** None

#### AC-8: The audit log records the actor and the time of every export request (P2)

- **Coverage:** PARTIAL
- **Tests:**
  - `4-API-007` - `tests/api/audit-log.api.spec.ts:14`: an export request is written to the audit log against the requesting user
- **Gaps:**
  - Missing: an assertion that the audit entry records when the request was made
- **Recommendation:** Extend the audit-log test to assert the recorded time

#### AC-9: Export progress reaches 100 percent before the download becomes available (P2)

- **Coverage:** FULL
- **Tests:**
  - `4-E2E-002` - `tests/e2e/tenant-export.spec.ts:20`: the progress percentage reaches 100 before the download is offered
- **Recommendation:** None

#### AC-10: The archive filename carries the tenant slug and the request date (P3)

- **Coverage:** NONE
- **Tests:** none
- **Gaps:**
  - Missing: any test that reads the archive filename
- **Recommendation:** Add an API or E2E assertion on the archive filename when P3 work is scheduled

### Gap Analysis

#### Critical Gaps

1. **AC-2: Export is denied to a member without the admin role**, P0
   - Current coverage: NONE
   - Missing tests: a member actor receiving 403 with no job created

#### Medium and Low Priority Gaps

1. **AC-8: The audit log records the actor and the time of every export request**, P2, PARTIAL
2. **AC-10: The archive filename carries the tenant slug and the request date**, P3, NONE

## Phase 2: Quality Gate Decision

**Gate Type:** epic
**Decision Mode:** deterministic
**Collection Status:** COLLECTED

### Live Evidence

- **Present:** true
- **Freshness:** unverifiable
- **Counted:** 0
- **Blockers:** 4-LIVE-001 (high), 4-LIVE-002 (medium)

### Waiver Requests

W-1 is well formed and unapplied. W-2 is invalid: technical justification, approver without authority, no expiry, no remediation due date, security-critical P0 criterion, monitoring plan absent. Neither changes the derived decision.

### Gate Decision: FAIL
