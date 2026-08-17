---
stepsCompleted:
  ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04e-aggregate-nfr', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-08-14'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - 'docs/tech-specs/bulk-invoice-export-tech-spec.md'
  - 'docs/prd/invoicing-prd.md'
  - 'docs/stories/LEDGER-482-bulk-invoice-export.md'
  - 'test-artifacts/test-design-bulk-invoice-export.md'
---

# NFR Evidence Audit: Bulk Invoice Export

**Date:** 2026-08-14
**Story:** LEDGER-482
**Overall Status:** FAIL ❌

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows. NFR thresholds and planned evidence came from the tech spec, PRD, and story LEDGER-482.

## Executive Summary

**Assessment:** 9 PASS, 6 CONCERNS, 3 FAIL

**Blockers:** 3 (Vulnerability Management under Security, Resource Usage under Performance, Fault Tolerance under Reliability)

**High Priority Issues:** 2 (Resource Usage under Performance, Authorization Controls under Security)

**Recommendation:** Hold the release. Patch or mitigate the PDF-rendering vulnerability, reduce peak export-worker heap below its threshold, and add the export-worker circuit breaker before shipping. The remaining CONCERNS can proceed as scheduled follow-up work.

---

## Performance Assessment

### Response Time (p95)

- **Status:** PASS ✅
- **Threshold:** p95 < 800ms for a bulk export request under 250 concurrent users
- **Actual:** p95 612ms across three load-test runs
- **Evidence:** k6 load test report: `test-results/perf/k6-bulk-export-2026-08-10.json`
- **Findings:** Consistently under threshold with no regression against the prior baseline run.

### Throughput

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN. No throughput target was found in the tech spec, PRD, or story LEDGER-482 during Step 2.
- **Actual:** 340 exports/min sustained for 15 minutes
- **Evidence:** k6 load test report: `test-results/perf/k6-bulk-export-2026-08-10.json`
- **Findings:** The measured rate would have supported a PASS, but the finding is downgraded to CONCERNS: the threshold was UNKNOWN at Step 2, and an unmeasured target cannot pass.
- **Recommendation:** Product to define an explicit throughput SLO for the export API so future runs can score this against a real target.

### Resource Usage

- **CPU Usage**
  - **Status:** PASS ✅
  - **Threshold:** < 70% average CPU during the export batch window
  - **Actual:** 54% average
  - **Evidence:** APM host metrics: `metrics/cpu-export-window-2026-08-10.png`

- **Memory Usage**
  - **Status:** FAIL ❌
  - **Threshold:** < 75% peak heap during the export batch window
  - **Actual:** Peaked at 81% on the largest tenant's 50k-row export; garbage collection reclaimed it before any failure
  - **Evidence:** APM memory dashboard: `metrics/memory-export-window-2026-08-10.png`
  - **Findings:** Peak heap breached the stated threshold. The absence of an out-of-memory event does not turn a threshold breach into CONCERNS.
  - **Recommendation:** Stream the CSV/PDF row-mapping step instead of buffering the full result set in memory for exports over 25k rows.

---

## Security Assessment

### Authentication Strength

- **Status:** PASS ✅
- **Threshold:** OAuth 2.1/OIDC with access tokens no longer lived than 15 minutes
- **Actual:** OAuth 2.1 with 15-minute access tokens and rotating refresh tokens confirmed
- **Evidence:** Auth integration test suite and `src/auth/oauth-client.ts`
- **Findings:** Meets threshold with no gaps.

### Authorization Controls

- **Status:** CONCERNS ⚠️
- **Threshold:** Tenant-scoped RBAC enforced on every export endpoint
- **Actual:** RBAC enforced and verified by test on the primary export endpoint; the newer bulk-schedule endpoint inherits the same middleware in code review but has no automated authorization test
- **Evidence:** `test-results/security/rbac-coverage-2026-08-09.md` (partial coverage)
- **Findings:** Tenant isolation on the bulk-schedule endpoint cannot be confirmed by test evidence, only by code inspection.
- **Recommendation:** Extend the existing RBAC test harness to cover the bulk-schedule endpoint before the next release.

### Data Protection

- **Status:** PASS ✅
- **Threshold:** Exported files encrypted at rest (AES-256) and TLS 1.2+ in transit
- **Actual:** Both confirmed
- **Evidence:** S3 bucket encryption configuration and TLS scan report: `security/tls-scan-2026-08-11.txt`
- **Findings:** Meets threshold with no gaps.

### Vulnerability Management

- **Status:** FAIL ❌
- **Threshold:** 0 critical, fewer than 3 high vulnerabilities in the dependency scan
- **Actual:** 0 critical, 4 high. One of the four is a known remote-code-execution CVE in a transitive PDF-rendering library used by the export worker; the other three have available fixes.
- **Evidence:** Snyk scan: `security/snyk-scan-2026-08-11.json`
- **Findings:** The RCE finding has no vendor patch yet and sits directly in the export code path.
- **Recommendation:** Pin the PDF-rendering library to the patched pre-release, or disable PDF export and fall back to CSV-only until a fix ships.

### Compliance

- **Status:** CONCERNS ⚠️
- **Standards:** GDPR (exported invoices contain customer PII)
- **Actual:** Data minimization and right-to-erasure are implemented for stored invoices, but erasure requests do not purge previously generated export files sitting in the download cache.
- **Evidence:** `docs/compliance/gdpr-dsr-mapping.md`
- **Findings:** An erasure request today leaves a stale, exported copy of the customer's invoices reachable from the download cache.
- **Recommendation:** Add an export-file purge step to the existing GDPR erasure job.

---

## Reliability Assessment

### Availability (Uptime)

- **Status:** PASS ✅
- **Threshold:** 99.9% uptime over a rolling 30 days
- **Actual:** 99.94%
- **Evidence:** Uptime monitor report: `monitoring/uptime-export-api-2026-07.csv`
- **Findings:** Meets threshold with margin.

### Error Rate

- **Status:** PASS ✅
- **Threshold:** < 0.5% request error rate
- **Actual:** 0.21%
- **Evidence:** `logs/errors-export-api-2026-08.log`
- **Findings:** Meets threshold with margin.

### MTTR (Mean Time To Recovery)

- **Status:** CONCERNS ⚠️
- **Threshold:** < 30 minutes
- **Actual:** The two most recent incidents averaged 52 minutes
- **Evidence:** `incidents/INC-2026-0714.md`, `incidents/INC-2026-0803.md`
- **Findings:** Both incidents required a manual export-worker queue restart; there is no automated recovery.
- **Recommendation:** Build a runbook automation (or a health-check-triggered restart) for the export-worker queue.

### Fault Tolerance

- **Status:** FAIL ❌
- **Threshold:** The export worker fails fast and retries with backoff when the PDF-rendering dependency is unavailable, without blocking other tenants' exports
- **Actual:** No circuit breaker exists. One tenant's failing PDF render call has been observed holding a connection-pool slot until timeout, degrading the shared queue for every tenant.
- **Evidence:** `incidents/INC-2026-0803.md`; worker code review of `src/workers/export-worker.ts`
- **Findings:** A single slow or unavailable dependency call currently degrades the whole worker pool, not just the affected tenant.
- **Recommendation:** Add a circuit breaker around the PDF-rendering dependency call, opening after 3 consecutive failures with a 30-second half-open retry.

### CI Burn-In (Stability)

- **Status:** PASS ✅
- **Threshold:** 100 consecutive successful runs
- **Actual:** 214 consecutive successful runs
- **Evidence:** `ci/burn-in-export-suite-2026-08-12.log`
- **Findings:** Meets threshold with margin.

### Disaster Recovery

- **RTO (Recovery Time Objective)**
  - **Status:** N/A
  - **Threshold:** Not applicable
  - **Actual:** Not applicable
  - **Evidence:** N/A

- **RPO (Recovery Point Objective)**
  - **Status:** N/A
  - **Threshold:** Not applicable
  - **Actual:** Not applicable
  - **Evidence:** N/A

Both are marked N/A because bulk export is a stateless read-and-regenerate path over already-durable invoice records. Export files are disposable and regenerable on demand; the platform's existing DR plan already covers the source invoice data.

---

## Maintainability Assessment

### Test Coverage

- **Status:** PASS ✅
- **Threshold:** ≥ 80% coverage for the export module
- **Actual:** 87% line coverage
- **Evidence:** `coverage/lcov-report/index.html`
- **Findings:** Meets threshold with margin.

### Code Duplication

- **Status:** CONCERNS ⚠️
- **Threshold:** < 5% duplication
- **Actual:** 6.2% duplication, concentrated in the CSV and PDF formatters
- **Evidence:** `reports/jscpd/jscpd-report.json`
- **Findings:** The CSV and PDF formatters duplicate the same row-mapping logic.
- **Recommendation:** Extract a shared row-mapping formatter used by both the CSV and PDF export paths.

### Vulnerability Scan

- **Status:** PASS ✅
- **Threshold:** 0 critical, 0 high vulnerabilities in `npm audit` for direct dependencies
- **Actual:** 0 critical, 0 high
- **Evidence:** `ci/npm-audit-2026-08-12.log`
- **Findings:** Meets threshold. This is a direct-dependency gate distinct from the Security domain's full-tree Snyk scan above, which did surface a transitive finding.

### Observability

- **Status:** CONCERNS ⚠️
- **Threshold:** Structured logging and error tracking configured for the export worker
- **Actual:** Structured JSON logging is in place, but the export worker is not wired into the team's error-tracking tool. Worker exceptions are only visible in raw logs.
- **Evidence:** `src/workers/export-worker.ts` logging configuration; error-tracker dashboard shows zero export-worker events over the audit window
- **Findings:** The Fault Tolerance gap above would not have paged anyone automatically, because worker exceptions never reach the error tracker.
- **Recommendation:** Wire the export worker into the existing error-tracking integration used by the rest of the API.

---

## Custom NFR Evidence Audits

No custom NFR categories were requested for this run. The four standard domains above cover this feature's operational and compliance requirements.

---

## Quick Wins

3 quick wins identified for immediate implementation:

1. **Wire the export worker into error tracking** (Maintainability, MEDIUM, 1 day)
   - Reuse the existing Sentry-equivalent integration already used elsewhere in the API.
   - Minimal code changes: add the existing error-tracker client to the worker's exception handler.

2. **Add an export-file purge step to the GDPR erasure job** (Security, MEDIUM, half a day)
   - The erasure job already exists; this adds one step that deletes cached export files for the erased customer.
   - Minimal code changes.

3. **Extend the RBAC test suite to the bulk-schedule endpoint** (Security, MEDIUM, 1 day)
   - Reuse the existing RBAC test harness and fixtures used for the primary export endpoint.
   - No code changes needed; test-only addition.

---

## Recommended Actions

### Immediate Before Release: CRITICAL/HIGH Priority

1. **Patch or mitigate the PDF-rendering RCE** (CRITICAL, 1-2 days, Security team)
   - Pin the PDF-rendering library to its patched pre-release, or disable PDF export and fall back to CSV-only.
   - Steps: confirm the patched version compiles against the worker's Node runtime, update the lockfile, re-run the Snyk scan to confirm the finding clears.
   - Validation: Snyk scan shows 0 high findings tied to the PDF-rendering path.

2. **Add a circuit breaker around the PDF-rendering dependency call** (CRITICAL, 2-3 days, Backend team)
   - Prevent one tenant's failing dependency call from degrading the shared export-worker pool.
   - Steps: wrap the PDF render call, open the breaker after 3 consecutive failures, half-open retry after 30 seconds, fall back to a "PDF unavailable, retry later" response.
   - Validation: chaos test that forces the PDF dependency to fail confirms other tenants' exports continue unaffected.

3. **Stream row mapping for large exports** (HIGH, 2 days, Backend team)
   - Keep peak heap below the 75% threshold for the largest supported tenant export.
   - Validation: repeat the 50k-row load test and confirm peak heap remains below 75%.

4. **Extend RBAC tests to the bulk-schedule endpoint** (HIGH, 1 day, Backend team)
   - Replace code-inspection-only confidence with direct tenant-isolation evidence.
   - Validation: automated tests prove cross-tenant schedule reads and writes return 403.

### Short-term Next Milestone: MEDIUM Priority

1. **Automate export-worker queue recovery** (MEDIUM, 3 days, Platform/SRE team)
   - Replace the manual queue restart with a health-check-triggered automated restart to bring MTTR under the 30-minute threshold.

2. **Extract a shared row-mapping formatter** (MEDIUM, 2 days, Backend team)
   - Remove the duplicated row-mapping logic between the CSV and PDF formatters to bring duplication under 5%.

3. **Purge cached export files during GDPR erasure** (MEDIUM, half a day, Backend team)
   - Extend the existing erasure job to delete generated exports for the affected customer.

4. **Wire the export worker into error tracking** (MEDIUM, 1 day, Backend team)
   - Forward worker exceptions through the integration already used by the API.

### Long-term Backlog: LOW Priority

1. **Define an explicit throughput SLO for the export API** (LOW, 1 day, Product and Backend teams)
   - Record a real throughput target in the tech spec so this dimension stops defaulting to CONCERNS on every future audit.

---

## Monitoring Hooks

4 monitoring hooks recommended to detect issues before failures:

### Performance Monitoring

- [ ] Throughput dashboard panel and alert, once the SLO above is defined
  - **Owner:** Backend team
  - **Deadline:** 2026-09-15

- [ ] Alert when export-worker heap exceeds 75% for 5 minutes sustained
  - **Owner:** Platform team
  - **Deadline:** 2026-09-01

### Security Monitoring

- [ ] CI gate that blocks merges on new critical or high Snyk findings
  - **Owner:** Security team
  - **Deadline:** 2026-08-25

### Reliability Monitoring

- [ ] Export-worker exceptions forwarded to the error tracker
  - **Owner:** Backend team
  - **Deadline:** 2026-08-24

### Alerting Thresholds

- [ ] MTTR trend alert. Notify when two incidents within 30 days both exceed the 30-minute MTTR threshold.
  - **Owner:** Platform/SRE team
  - **Deadline:** 2026-09-01

---

## Fail-Fast Mechanisms

4 fail-fast mechanisms recommended to prevent failures:

### Circuit Breakers (Reliability)

- [ ] Circuit breaker around the PDF-rendering dependency call, opening after 3 consecutive failures with a 30-second half-open retry
  - **Owner:** Backend team
  - **Estimated Effort:** 2-3 days

### Rate Limiting (Performance)

- [ ] Per-tenant concurrency cap on bulk export requests, to protect the shared worker pool from a single large tenant
  - **Owner:** Backend team
  - **Estimated Effort:** 1 day

### Validation Gates (Security)

- [ ] CI gate blocking merge when Snyk reports a new critical or high vulnerability
  - **Owner:** Security team
  - **Estimated Effort:** Half a day

### Coverage/Duplication Gates (Maintainability)

- [ ] CI gate failing the build when export-module coverage drops below 80% or duplication exceeds 5%
  - **Owner:** Backend team
  - **Estimated Effort:** Half a day

---

## Evidence Gaps

2 evidence gaps identified. Action required:

- [ ] **Authorization Controls** (Security)
  - **Owner:** Backend team
  - **Deadline:** 2026-08-22
  - **Suggested Evidence:** Automated authorization test suite covering the bulk-schedule endpoint
  - **Impact:** Tenant isolation on the newest export path cannot currently be confirmed by test evidence.

- [ ] **Throughput** (Performance)
  - **Owner:** Product team
  - **Deadline:** 2026-09-15
  - **Suggested Evidence:** An explicit throughput SLO recorded in the tech spec
  - **Impact:** The measured 340 exports/min figure has no defined target to be judged against, so this dimension will keep defaulting to CONCERNS.

---

## Four-Domain Findings Summary

**Based on the four audited NFR domains: Security, Performance, Reliability, Maintainability**

| Domain          | Findings Assessed | PASS  | CONCERNS | FAIL  | N/A   | Overall Status |
| --------------- | ----------------- | ----- | -------- | ----- | ----- | -------------- |
| Performance     | 4                 | 2     | 1        | 1     | 0     | FAIL ❌        |
| Security        | 5                 | 2     | 2        | 1     | 0     | FAIL ❌        |
| Reliability     | 7                 | 3     | 1        | 1     | 2     | FAIL ❌        |
| Maintainability | 4                 | 2     | 2        | 0     | 0     | CONCERNS ⚠️    |
| **Total**       | **20**            | **9** | **6**    | **3** | **2** | **FAIL ❌**    |

**Cross-Domain Risks:**

- Security + Reliability: the unresolved PDF-rendering vulnerability sits in the same code path as the fault-tolerance gap; a crafted payload that triggers the vulnerability could also be the trigger that exhausts the worker pool.
- Reliability + Maintainability: the missing error-tracker wiring means the fault-tolerance gap would not have paged anyone; low observability is hiding a reliability regression that already caused two incidents.

---

## ADR Quality Readiness Summary

This separate scorecard preserves the eight-category ADR threshold-elicitation taxonomy. It does not replace the four executed audit domains above.

| ADR Category                                        | Criteria Met |   PASS | CONCERNS |  FAIL | Overall Status |
| --------------------------------------------------- | -----------: | -----: | -------: | ----: | -------------- |
| 1. Testability and Automation                       |          3/4 |      3 |        1 |     0 | CONCERNS       |
| 2. Test Data Strategy                               |          2/3 |      2 |        1 |     0 | CONCERNS       |
| 3. Scalability and Availability                     |          3/4 |      3 |        1 |     0 | CONCERNS       |
| 4. Disaster Recovery                                |          3/3 |      3 |        0 |     0 | PASS           |
| 5. Security                                         |          2/4 |      2 |        1 |     1 | FAIL           |
| 6. Monitorability, Debuggability, and Manageability |          2/4 |      2 |        2 |     0 | CONCERNS       |
| 7. QoS and QoE                                      |          3/4 |      3 |        1 |     0 | CONCERNS       |
| 8. Deployability                                    |          3/3 |      3 |        0 |     0 | PASS           |
| **Total**                                           |    **21/29** | **21** |    **7** | **1** | **FAIL**       |

**Criteria Met Scoring:** 21 of 29 is room for improvement. The Security FAIL keeps the overall ADR scorecard status at FAIL regardless of the aggregate percentage.

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-08-14'
  story_id: 'LEDGER-482'
  feature_name: 'Bulk Invoice Export'
  adr_checklist_score: '21/29'
  categories:
    testability_automation: 'CONCERNS'
    test_data_strategy: 'CONCERNS'
    scalability_availability: 'CONCERNS'
    disaster_recovery: 'PASS'
    security: 'FAIL'
    monitorability: 'CONCERNS'
    qos_qoe: 'CONCERNS'
    deployability: 'PASS'
  audited_domains:
    security: 'FAIL'
    performance: 'FAIL'
    reliability: 'FAIL'
    maintainability: 'CONCERNS'
  overall_status: 'FAIL'
  critical_issues: 2
  high_priority_issues: 2
  medium_priority_issues: 4
  concerns: 6
  blockers: true
  quick_wins: 3
  evidence_gaps: 2
  recommendations:
    - 'Patch or mitigate the PDF-rendering RCE before release (CRITICAL)'
    - 'Add a circuit breaker around the PDF-rendering dependency in the export worker (CRITICAL)'
    - 'Extend authorization test coverage to the bulk-schedule endpoint before the next release'
```

---

## Related Artifacts

- **Story File:** `docs/stories/LEDGER-482-bulk-invoice-export.md`
- **Tech Spec:** `docs/tech-specs/bulk-invoice-export-tech-spec.md`
- **PRD:** `docs/prd/invoicing-prd.md`
- **Test Design:** `test-artifacts/test-design-bulk-invoice-export.md`
- **Evidence Sources:**
  - Test Results: `test-results/`
  - Metrics: `metrics/`
  - Logs: `logs/`
  - CI Results: `ci/burn-in-export-suite-2026-08-12.log`

---

## Recommendations Summary

**Release Blocker:** Vulnerability Management (Security, FAIL), Resource Usage (Performance, FAIL), and Fault Tolerance (Reliability, FAIL) block release. The security and reliability failures trace to the same unguarded PDF-rendering dependency call; the performance failure is a separate heap-threshold breach on large exports.

**High Priority:** Resource Usage (Performance, FAIL) and Authorization Controls (Security, CONCERNS) need owners and deadlines before release. Resource Usage is also one of the three release blockers.

**Medium Priority:** MTTR, Compliance, Code Duplication, and Observability are CONCERNS with assigned recommendations above; none are release blockers.

**Low Priority:** Throughput remains CONCERNS until Product defines an explicit SLO.

**Next Steps:** Resolve the three FAIL findings, then re-run `/bmad-testarch-nfr` to confirm the gate clears before release.

---

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: FAIL ❌
- Critical Issues: 2
- High Priority Issues: 2
- Concerns: 6
- Evidence Gaps: 2

**Gate Status:** FAIL ❌

**Next Actions:**

- If PASS ✅: Run `/bmad-testarch-trace` Phase 2 for the release gate decision, or release
- If CONCERNS ⚠️: Address HIGH/CRITICAL issues, re-run `/bmad-testarch-nfr`
- If FAIL ❌: Resolve FAIL status NFRs, re-run `/bmad-testarch-nfr`

**Generated:** 2026-08-14
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
