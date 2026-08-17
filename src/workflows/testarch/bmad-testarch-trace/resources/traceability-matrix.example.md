---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-08-17'
workflowType: 'testarch-trace'
inputDocuments:
  - 'docs/epics/epic-6-scheduled-report-delivery.md'
  - 'test-artifacts/test-design-epic-6.md'
  - 'test-results/junit-scheduled-reports.xml'
  - 'test-artifacts/nfr-assessment-scheduled-reports.md'
coverageBasis: 'acceptance_criteria'
oracleConfidence: 'high'
oracleResolutionMode: 'formal_requirements'
oracleSources: ['docs/epics/epic-6-scheduled-report-delivery.md']
externalPointerStatus: 'not_used'
---

# Traceability Matrix and Gate Decision: Epic 6, Scheduled Report Delivery

**Target:** Epic 6, Scheduled Report Delivery
**Date:** 2026-08-17
**Evaluator:** TEA Agent
**Coverage Oracle:** acceptance criteria
**Oracle Confidence:** high
**Oracle Sources:** `docs/epics/epic-6-scheduled-report-delivery.md`

This workflow audits coverage and applies its deterministic gate. It does not generate tests. The example uses no recorded live verification; every counted test is a re-runnable repository artifact.

## Phase 1: Requirements Traceability

### Coverage Summary

| Priority  | Total Criteria | Full Coverage |  Coverage | Status       |
| --------- | -------------: | ------------: | --------: | ------------ |
| P0        |              2 |             2 |      100% | PASS         |
| P1        |              5 |             4 |       80% | CONCERNS     |
| P2        |              1 |             1 |      100% | PASS         |
| P3        |              0 |             0 |       N/A | N/A          |
| **Total** |          **8** |         **7** | **87.5%** | **CONCERNS** |

Coverage status uses FULL, PARTIAL, NONE, UNIT-ONLY, and INTEGRATION-ONLY. The gate counts only FULL criteria in its percentages.

### Detailed Mapping

#### AC-1: Administrator schedules a weekly report for their tenant, P0

- **Coverage:** FULL
- **Tests:**
  - `6-E2E-001`, `tests/e2e/scheduled-reports.spec.ts:18`: creates a schedule and confirms the next delivery date in the UI
  - `6-API-001`, `tests/api/report-schedules.spec.ts:24`: persists cadence, recipients, timezone, and report type
- **Recommendation:** None

#### AC-2: Cross-tenant schedule access is denied, P0

- **Coverage:** FULL
- **Tests:**
  - `6-API-002`, `tests/api/report-schedule-authorization.spec.ts:31`: rejects reading and updating another tenant's schedule with 403
  - `6-E2E-002`, `tests/e2e/scheduled-report-permissions.spec.ts:20`: hides the schedule editor from a tenant Viewer
- **Recommendation:** None

#### AC-3: Administrator pauses and resumes a schedule, P1

- **Coverage:** FULL
- **Tests:**
  - `6-API-003`, `tests/api/report-schedules.spec.ts:79`: transitions ACTIVE to PAUSED and back without changing recipients
- **Recommendation:** None

#### AC-4: Invalid or duplicate recipients receive field-level guidance, P1

- **Coverage:** FULL
- **Tests:**
  - `6-COMP-001`, `tests/component/report-recipient-editor.spec.tsx:42`: validates malformed and duplicate addresses through user-level interaction
- **Recommendation:** None

#### AC-5: Delivery retries after provider failure and surfaces final failure, P1

- **Coverage:** PARTIAL
- **Tests:**
  - `6-API-004`, `tests/api/report-delivery-retry.spec.ts:27`: confirms two transient failures back off and the third attempt succeeds
- **Gap:** No test exhausts the retry budget and proves the schedule history shows a final failed delivery with an actionable reason.
- **Recommendation:** Add `6-E2E-003` for the exhausted-retry history state and `6-API-006` for the terminal provider response.

#### AC-6: Next delivery respects the selected timezone across daylight-saving changes, P1

- **Coverage:** FULL
- **Tests:**
  - `6-UNIT-001`, `tests/unit/next-report-run.test.ts:15`: checks both spring-forward and fall-back boundaries with a fixed clock
- **Recommendation:** None

#### AC-7: Schedule changes emit a complete audit event, P1

- **Coverage:** FULL
- **Tests:**
  - `6-INT-001`, `tests/integration/report-schedule-audit.test.ts:33`: asserts actor, tenant, prior state, new state, and schedule ID
- **Recommendation:** None

#### AC-8: Administrator can set an optional safe filename prefix, P2

- **Coverage:** FULL
- **Tests:**
  - `6-API-005`, `tests/api/report-schedules.spec.ts:118`: accepts safe characters and rejects traversal sequences
- **Recommendation:** None

### Gap Analysis

#### Critical Gaps

No P0 gaps.

#### High Priority Gaps

1. **AC-5: Terminal delivery failure**, P1
   - Current coverage: PARTIAL
   - Missing tests: exhausted retry at API level and the user-visible failed-delivery history state
   - Recommended IDs: `6-API-006`, `6-E2E-003`
   - Impact: Operators cannot tell whether a permanently failed delivery is visible and actionable.

#### Medium and Low Priority Gaps

No P2 or P3 gaps.

### Coverage Heuristics Findings

- **Endpoint coverage gaps:** 1. `POST /api/report-deliveries/{id}/retry-exhausted` terminal branch has no direct API test.
- **Auth and authorization negative paths:** Present. Cross-tenant and Viewer denial paths are covered.
- **Error paths:** Partial. Validation and transient provider errors are covered; permanent provider failure is missing.
- **UI journeys:** Partial. Create, pause, resume, and permission-denied journeys are covered; failed-delivery history is missing.
- **UI states:** Loading, validation, empty, and permission-denied are covered. Terminal error state is missing.

### Quality Assessment

No blocker or warning issue was found in the 10 mapped tests. All mapped tests contain explicit assertions, use deterministic waits, clean their data, remain below 1,000 lines, and complete below 90 seconds.

**10 of 10 mapped tests meet the trace workflow's quality checks.** Coverage quality scoring remains the responsibility of `test-review`.

### Duplicate Coverage Analysis

- **Acceptable overlap:** AC-1 and AC-2 use API tests for policy and persistence plus one E2E test for the user journey.
- **Unacceptable duplication:** None.

### Coverage by Test Level

| Test Level  | Unique Tests |      Criteria Covered |
| ----------- | -----------: | --------------------: |
| E2E         |            2 |                     2 |
| API         |            5 |                     5 |
| Component   |            1 |                     1 |
| Unit        |            1 |                     1 |
| Integration |            1 |                     1 |
| Live        |            0 |                     0 |
| **Total**   |       **10** | **8 unique criteria** |

### Traceability Recommendations

**Immediate:** Add `6-API-006` and `6-E2E-003` before promoting the gate from CONCERNS.

**Short term:** Add the terminal failure pair to the nightly provider-fault burn-in.

**Long term:** None.

## Phase 2: Quality Gate Decision

**Gate Type:** epic
**Decision Mode:** deterministic
**Collection Mode:** contract_static
**Collection Status:** COLLECTED
**Gate Eligible:** true

### Evidence Summary

#### Test Execution Results

- **Total Tests:** 42
- **Passed:** 42, 100%
- **Failed:** 0, 0%
- **Skipped:** 0, 0%
- **Duration:** 6 minutes 14 seconds
- **P0:** 12 of 12 passed, 100%
- **P1:** 20 of 20 passed, 100%
- **P2:** 10 of 10 passed, 100%
- **P3:** No tests
- **Source:** `test-results/junit-scheduled-reports.xml`, CI run `reports-1842`

#### Coverage Summary from Phase 1

- **P0 acceptance criteria:** 2 of 2 FULL, 100%
- **P1 acceptance criteria:** 4 of 5 FULL, 80%
- **P2 acceptance criteria:** 1 of 1 FULL, 100%
- **Overall:** 7 of 8 FULL, 87.5%

**Code coverage:** 86% line, 81% branch, 89% function from `coverage/scheduled-reports/coverage-summary.json`.

#### Non-Functional Requirements

- **Security:** PASS. Tenant authorization suite and SAST evidence are current.
- **Performance:** CONCERNS. Delivery throughput meets the provisional target, but the target is still awaiting Product approval.
- **Reliability:** PASS. Ten-iteration provider retry burn-in is stable.
- **Maintainability:** PASS. Coverage exceeds 80%, duplication is 2.1%, and worker errors reach the error tracker.
- **Source:** `test-artifacts/nfr-assessment-scheduled-reports.md`

#### Flakiness Validation

- **Burn-in iterations:** 10
- **Flaky tests:** 0
- **Stability:** 100%
- **Source:** CI run `reports-burn-in-318`

#### Live Evidence

- **Present:** false
- **Results file:** none
- **Freshness:** not_present
- **Requirements covered only by live verification:** 0

The JSON companion still populates the complete `live_evidence` object with zero counts, following the same schema convention as [live-verification-results.example.json](./live-verification-results.example.json).

### Decision Criteria Evaluation

#### P0 Criteria

| Criterion          | Threshold | Actual | Status |
| ------------------ | --------: | -----: | ------ |
| P0 oracle coverage |      100% |   100% | PASS   |

**P0 Evaluation:** All pass.

#### P1 and Overall Criteria

| Criterion                       | Threshold | Actual | Status   |
| ------------------------------- | --------: | -----: | -------- |
| P1 oracle coverage target       |       90% |    80% | CONCERNS |
| P1 oracle coverage minimum      |       80% |    80% | MET      |
| Overall oracle coverage minimum |       80% |  87.5% | MET      |

**P1 Evaluation:** CONCERNS. P1 meets the minimum and misses the PASS target.

### Gate Decision: CONCERNS

### Rationale

P0 coverage is 100% and overall coverage is 87.5%, above the 80% minimum. P1 coverage is exactly 80%, which meets the minimum and remains below the 90% PASS target. Rules 1 through 5 therefore produce CONCERNS.

No human waiver was requested or applied. `WAIVED` cannot be derived from these coverage numbers or from any workflow input. A human override would require approver, approval date, reason, explicit expiry, monitoring plan, remediation owner, and fix target. Without that complete contract, the automated CONCERNS decision remains unchanged.

### Residual Risk

1. **Permanent provider failure is not visible end to end**
   - **Priority:** P1, assigned from operational impact and the absence of a reliable user workaround
   - **Probability:** Medium, 2
   - **Impact:** Medium, 2
   - **Risk Score:** 4
   - **Mitigation:** Alert on terminal provider responses and expose raw delivery status in the operator dashboard
   - **Remediation:** Add `6-API-006` and `6-E2E-003` before the next gate run

**Overall Residual Risk:** Medium

### Open Issues

| Priority | Issue                         | Description                                | Owner          | Due Date   | Status |
| -------- | ----------------------------- | ------------------------------------------ | -------------- | ---------- | ------ |
| P1       | Terminal delivery failure gap | Exhausted retry lacks API and E2E coverage | Reporting team | 2026-08-21 | OPEN   |

**Blocking Issues Count:** 0 P0 blockers, 1 P1 issue.

### Gate Recommendations

1. Keep the epic in CONCERNS and do not represent it as PASS.
2. Add the two AC-5 tests, run the complete suite, and regenerate trace outputs.
3. Keep enhanced alerting on terminal provider responses until the gap closes.
4. Obtain Product approval for the throughput target before the next NFR audit.

### Next Steps

**Immediate:** Implement `6-API-006` and `6-E2E-003`; re-run `/bmad-testarch-trace`.

**Follow-up:** Add permanent provider failure to nightly burn-in and confirm the throughput SLO.

## Integrated YAML Snippet

```yaml
traceability_and_gate:
  traceability:
    epic_id: '6'
    date: '2026-08-17'
    coverage:
      overall: 87.5
      p0: 100
      p1: 80
      p2: 100
      p3: null
    gaps:
      critical: 0
      high: 1
      medium: 0
      low: 0
    live_evidence:
      present: false
      requirements_live_only: 0
  gate_decision:
    decision: 'CONCERNS'
    gate_type: 'epic'
    decision_mode: 'deterministic'
    gate_basis: 'priority_thresholds'
    criteria:
      p0_coverage: 100
      p1_coverage: 80
      overall_coverage: 87.5
    thresholds:
      min_p0_coverage: 100
      target_p1_coverage: 90
      min_p1_coverage: 80
      min_coverage: 80
    evidence:
      test_results: 'test-results/junit-scheduled-reports.xml'
      traceability: 'test-artifacts/traceability-matrix.md'
      nfr_assessment: 'test-artifacts/nfr-assessment-scheduled-reports.md'
      code_coverage: 'coverage/scheduled-reports/coverage-summary.json'
    next_steps: 'Cover terminal provider failure and re-run trace'
```

## Machine-Readable Outputs

- `test-artifacts/e2e-trace-summary.json`: schema version 0.2.0, gate status CONCERNS, complete oracle, inventory, coverage, heuristic, live-evidence, blocker, and link fields
- `test-artifacts/gate-decision.json`: schema version 0.1.0, evaluated timestamp, priority-threshold gate basis, CONCERNS status, rationale, and per-criterion status

## Related Artifacts

- **Epic:** `docs/epics/epic-6-scheduled-report-delivery.md`
- **Test Design:** `test-artifacts/test-design-epic-6.md`
- **Test Results:** `test-results/junit-scheduled-reports.xml`
- **NFR Evidence Audit:** `test-artifacts/nfr-assessment-scheduled-reports.md`
- **Code Coverage:** `coverage/scheduled-reports/coverage-summary.json`
- **Test Directory:** `tests/`

## Sign-Off

- **Overall Coverage:** 87.5%
- **P0 Coverage:** 100%, PASS
- **P1 Coverage:** 80%, CONCERNS
- **Critical Gaps:** 0
- **High Gaps:** 1
- **Gate Decision:** CONCERNS
- **Next Step:** Cover AC-5 terminal failure and re-run the deterministic gate

**Generated:** 2026-08-17
**Workflow:** testarch-trace v4.0
