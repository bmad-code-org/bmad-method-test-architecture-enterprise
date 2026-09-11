---
stepsCompleted:
  ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04e-aggregate-nfr', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-09-03'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - 'docs/tech-spec.md'
  - 'evidence/security-review-2026-08-29.md'
  - 'evidence/dependency-scan-2026-08-30.json'
  - 'evidence/load-test-2026-08-28.json'
  - 'evidence/reliability-2026-08.json'
  - 'config/logging.json'
---

# NFR Evidence Audit - Harbor Billing Ledger

**Date:** 2026-09-03
**Story:** (not applicable)
**Overall Status:** FAIL

---

Note: This audit summarizes existing implementation evidence; it does not run tests or CI workflows.

## Executive Summary

**Assessment:** 8 PASS, 6 CONCERNS, 1 FAIL

**Blockers:** 1 (Error Rate under Reliability)

**High Priority Issues:** 1 (Error Rate under Reliability)

**Recommendation:** Hold the release. The monthly 5xx rate breaches the stated ceiling, and neither the
performance dimensions nor the coverage dimension can be judged from what the bundle carries.

---

## Reference Example Consulted

The worked example the workflow ships in `skill/resources/nfr-assessment.example.md`, quoted here for the
report shape. It audits a different service: none of its statuses, thresholds or evidence citations are
this bundle's.

````markdown
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
````

---

## Performance Assessment

### Response Time (p95)

- **Status:** CONCERNS
- **Threshold:** UNKNOWN. No response-time target is recorded in the tech spec, and section 2.2 says so.
- **Actual:** p95 214 ms over 412,800 requests in the close-window profile
- **Evidence:** `evidence/load-test-2026-08-28.json`
- **Findings:** The measurement is real and recent. With no target to judge it against the finding is
  CONCERNS, because an unmeasured target cannot pass.

### Throughput

- **Status:** CONCERNS
- **Threshold:** UNKNOWN. No throughput target is recorded in any source.
- **Actual:** 344 requests per second sustained
- **Evidence:** `evidence/load-test-2026-08-28.json`
- **Findings:** Same reading as Response Time.

### Resource Usage

- **CPU Usage**
  - **Status:** CONCERNS
  - **Threshold:** UNKNOWN. No CPU ceiling is recorded.
  - **Actual:** peak 58%
  - **Evidence:** `evidence/load-test-2026-08-28.json`

- **Memory Usage**
  - **Status:** CONCERNS
  - **Threshold:** UNKNOWN. No heap ceiling is recorded.
  - **Actual:** peak 61%
  - **Evidence:** `evidence/load-test-2026-08-28.json`

---

## Security Assessment

### Authentication Strength

- **Status:** PASS
- **Threshold:** OAuth 2.1 access tokens with a lifetime of 15 minutes or less
- **Actual:** 900-second access tokens, ES256 signed, refresh tokens rotating on use
- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Findings:** Verified by test and by a manual replay of an expired token.

### Authorization Controls

- **Status:** PASS
- **Threshold:** Tenant-scoped RBAC enforced on every statement endpoint
- **Actual:** 5 of 5 cross-tenant reads refused with an audit record
- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Findings:** Meets the requirement on every route the spec names.

### Data Protection

- **Status:** PASS
- **Threshold:** AES-256 at rest and TLS 1.3 in transit
- **Actual:** AES-256 volume encryption with 90-day key rotation; TLS 1.3 only since 2026-06-14
- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Findings:** No downgrade path remains.

### Vulnerability Management

- **Status:** PASS
- **Threshold:** 0 critical and 0 high severity dependency findings
- **Actual:** 0 critical, 0 high, 3 moderate, 7 low
- **Evidence:** `evidence/dependency-scan-2026-08-30.json`
- **Findings:** Moderate and low findings are tracked and do not block under the spec.

### Compliance

- **Status:** N/A
- **Threshold:** No external compliance regime applies to this service
- **Actual:** Confirmed with the compliance team on 2026-08-26; no cardholder or health data is processed
- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Findings:** Out of scope by a written confirmation rather than by silence.

---

## Reliability Assessment

### Availability (Uptime)

- **Status:** PASS
- **Threshold:** Monthly uptime at or above 99.5%
- **Actual:** 99.71%
- **Evidence:** `evidence/reliability-2026-08.json`
- **Findings:** Meets the threshold with 128 minutes of downtime in the window.

### Error Rate

- **Status:** FAIL
- **Threshold:** Monthly 5xx rate below 0.5% of ledger API requests
- **Actual:** 1.94% across 18.42 million requests
- **Evidence:** `evidence/reliability-2026-08.json`
- **Findings:** Evidence exists and does not meet the threshold, which is a breach rather than a caveat.
- **Recommendation:** Fix the statement-generation 500s in the close window before the release.

### MTTR

- **Status:** PASS
- **Threshold:** Incidents restored within 15 minutes
- **Actual:** 11 minutes across two incidents
- **Evidence:** `evidence/reliability-2026-08.json`

### Fault Tolerance

- **Status:** PASS
- **Threshold:** Three retries with exponential backoff and a quarterly failover drill
- **Actual:** Failover drill passed on 2026-08-12 in 38 seconds with no data loss
- **Evidence:** `evidence/reliability-2026-08.json`

### CI Burn-In (Stability)

- **Status:** PASS
- **Threshold:** 100 consecutive green runs before a release
- **Actual:** 214 consecutive green runs
- **Evidence:** `evidence/reliability-2026-08.json`

### Disaster Recovery

- **Status:** PASS
- **Threshold:** RTO 4 hours, RPO 15 minutes
- **Actual:** Drill on 2026-08-19 observed RTO 2.5 hours and RPO 8 minutes
- **Evidence:** `evidence/reliability-2026-08.json`

---

## Maintainability Assessment

### Test Coverage

- **Status:** CONCERNS
- **Threshold:** Statement coverage at or above 80%
- **Actual:** No coverage report is in the bundle. Section 3 of the tech spec asserts the service is well
  covered, which is a claim rather than a measurement.
- **Evidence:** `docs/tech-spec.md`
- **Findings:** The threshold is stated and the evidence for it is missing, so the category is CONCERNS.
- **Recommendation:** Publish the CI coverage report beside the other release evidence.

### Code Duplication

- **Status:** CONCERNS
- **Threshold:** No duplication ceiling is recorded, and no duplication report is in the bundle.
- **Actual:** Not measured
- **Evidence:** `docs/tech-spec.md`
- **Findings:** Section 2.4 says duplication is reviewed by hand and not measured in CI.

### Vulnerability Scan

- **Status:** PASS
- **Threshold:** 0 critical and 0 high severity findings
- **Actual:** 0 critical, 0 high
- **Evidence:** `evidence/dependency-scan-2026-08-30.json`

### Observability

- **Status:** PASS
- **Threshold:** Structured logging with the required fields, and error tracking configured
- **Actual:** JSON log schema with an automated format assertion; Sentry captures unhandled rejections,
  uncaught exceptions, and 5xx responses
- **Evidence:** `config/logging.json`

---

## Evidence Gaps

1 evidence gap identified. Action required:

- [ ] **Test Coverage** (Maintainability)
  - **Owner:** Ledger team
  - **Deadline:** 2026-09-17
  - **Suggested Evidence:** The CI coverage report for the ledger service
  - **Impact:** The stated 80% threshold cannot be judged, so the category defaults to CONCERNS.

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-09-03'
  feature_name: 'Harbor Billing Ledger'
  adr_checklist_score: '21/29'
  overall_status: 'FAIL'
  critical_issues: 1
  high_priority_issues: 1
  concerns: 6
  blockers: true
  evidence_gaps: 1
  recommendations:
    - 'Fix the close-window 500s so the monthly error rate returns below 0.5%.'
    - 'Publish the CI coverage report with the release evidence.'
    - 'Agree a response-time and throughput target so performance can be judged.'
```

---

**Generated:** 2026-09-03
**Workflow:** testarch-nfr v5.0
