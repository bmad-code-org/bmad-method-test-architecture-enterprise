---
runScope: 'system'
runKey: 'system'
workflowStatus: 'completed'
stepsCompleted: ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04e-aggregate-nfr', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-10-09'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - 'harbor-billing-ledger/_bmad/config.toml'
  - 'harbor-billing-ledger/docs/tech-spec.md'
  - 'bmod-tea/knowledge/tea-index.csv'
  - 'bmod-tea/knowledge/adr-quality-readiness-checklist.md'
  - 'bmod-tea/knowledge/ci-burn-in.md'
  - 'bmod-tea/knowledge/test-quality.md'
  - 'bmod-tea/knowledge/playwright-config.md'
  - 'bmod-tea/knowledge/error-handling.md'
---

# NFR Evidence Audit: Harbor Billing Ledger

**Date:** 2026-10-09
**Scope:** System
**Overall Status:** FAIL ❌

Evidence paths in this report are relative to `harbor-billing-ledger/`.

## Executive Summary

**Assessment:** 9 PASS, 6 CONCERNS, 1 FAIL across 16 declared criteria.

**Blockers:** The August 2026 5xx rate was 1.94%. The release threshold is below 0.5%.

**High Priority Issues:** Performance targets remain undefined. Test coverage evidence is absent. The fault-tolerance evidence covers regional failover without demonstrating the required retry count and exponential backoff.

**Recommendation:** Hold the release until the 5xx rate is below 0.5% and fresh evidence confirms it. Approve performance thresholds and close the remaining evidence gaps before the next gate review.

## Performance Assessment

**Domain Status:** CONCERNS ⚠️

### Response time

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** p50 96 ms; p95 214 ms; p99 388 ms during a 250-virtual-user, 20-minute month-end workload.
- **Evidence:** `evidence/load-test-2026-08-28.json`. The month-end load test observed response-time p50 96 ms, p95 214 ms, and p99 388 ms.
- **Finding:** The measurement is available. An approved response-time target is required to determine compliance.

### Throughput

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 344 requests per second across 412800 requests.
- **Evidence:** `evidence/load-test-2026-08-28.json`. The month-end load test completed 412800 requests at 344 requests per second.
- **Finding:** The measurement is available. An approved minimum-throughput target is required to determine compliance.

### Resource usage

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Peak CPU 58%; peak heap 61%; database connections 34 of 60.
- **Evidence:** `evidence/load-test-2026-08-28.json`. At 250 virtual users for 20 minutes, peak CPU was 58%, peak heap was 61%, and database connections peaked at 34 of 60.
- **Finding:** The measurements are available. Approved utilization limits are required to determine compliance.

## Security Assessment

**Domain Status:** PASS ✅

### Authentication

- **Status:** PASS ✅
- **Threshold:** OAuth 2.1 access tokens expire within 15 minutes; refresh tokens rotate on use.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** OAuth 2.1 authorization-code flow with PKCE; ES256 access tokens expire after 900 seconds; refresh tokens rotate and prior tokens are revoked.
- **Evidence:** `evidence/security-review-2026-08-29.md`. The review verified OAuth 2.1 authorization-code flow with PKCE, ES256 access tokens with a 900-second lifetime, and refresh-token rotation with previous-token revocation.
- **Finding:** The supplied authentication evidence meets the declared threshold.

### Authorization

- **Status:** PASS ✅
- **Threshold:** Tenant-scoped RBAC protects every statement endpoint; cross-tenant statement reads are refused.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The tenant guard covers every statement route; 5 of 5 cross-tenant read attempts returned 403 and produced audit records.
- **Evidence:** `evidence/security-review-2026-08-29.md`. Tenant-scoped RBAC guards every statement route; all 5 cross-tenant read attempts returned 403 and produced audit records.
- **Finding:** The supplied authorization evidence meets the declared threshold.

### Data protection

- **Status:** PASS ✅
- **Threshold:** AES-256 encryption at rest and TLS 1.3 in transit.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Statements and backups use AES-256 volume encryption; ingress accepts TLS 1.3 only.
- **Evidence:** `evidence/security-review-2026-08-29.md`. Statements and backups use AES-256 volume encryption, and ingress accepts TLS 1.3 only with older protocol versions disabled.
- **Finding:** The supplied data-protection evidence meets the declared threshold.

### Vulnerability management

- **Status:** PASS ✅
- **Threshold:** 0 critical and 0 high dependency findings at release.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 0 critical, 0 high, 3 moderate, and 7 low findings for `ledger@4.8.2`.
- **Evidence:** `evidence/dependency-scan-2026-08-30.json`. The ledger@4.8.2 npm audit reports 0 critical and 0 high findings, with 3 moderate and 7 low findings.
- **Finding:** The release scan meets the declared blocking threshold.

## Reliability Assessment

**Domain Status:** FAIL ❌

### Availability

- **Status:** PASS ✅
- **Threshold:** Monthly uptime at or above 99.5%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 99.71% uptime during August 2026.
- **Evidence:** `evidence/reliability-2026-08.json`. The August 2026 observability export reports 99.71% uptime.
- **Finding:** Availability meets the declared monthly threshold.

### Error rate

- **Status:** FAIL ❌
- **Threshold:** Monthly 5xx rate below 0.5% of ledger API requests.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 357348 server errors in 18420000 requests; 1.94% 5xx rate during August 2026.
- **Evidence:** `evidence/reliability-2026-08.json`. The August 2026 observability export reports 357348 server errors in 18420000 requests, a 1.94% 5xx rate.
- **Finding:** The observed 5xx rate breaches the threshold by 1.44 percentage points.

### MTTR

- **Status:** PASS ✅
- **Threshold:** Restore a ledger incident within 15 minutes.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 11-minute MTTR; the two reported incidents were restored in 9 and 13 minutes.
- **Evidence:** `evidence/reliability-2026-08.json`. The August 2026 observability export reports 11-minute MTTR, with incidents restored in 9 and 13 minutes.
- **Finding:** MTTR meets the declared threshold.

### Fault tolerance

- **Status:** CONCERNS ⚠️
- **Threshold:** Retry a failed ledger write three times with exponential backoff; run a regional failover drill once per quarter.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** A regional failover drill passed on 2026-08-12 with 38-second failover and no data loss. A retry-count and backoff observation was not supplied.
- **Evidence:** `evidence/reliability-2026-08.json`. A region failover drill passed on 2026-08-12 with 38-second failover and no data loss.
- **Finding:** The failover portion is supported. The retry and exponential-backoff portion remains unverified.

### CI burn-in

- **Status:** PASS ✅
- **Threshold:** 100 consecutive green runs of the ledger suite before release.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 214 consecutive green ledger-suite runs.
- **Evidence:** `evidence/reliability-2026-08.json`. The ledger suite recorded 214 consecutive green runs.
- **Finding:** CI burn-in exceeds the declared threshold.

## Maintainability Assessment

**Domain Status:** CONCERNS ⚠️

### Test coverage

- **Status:** CONCERNS ⚠️
- **Threshold:** Statement coverage at or above 80%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** No supplied statement-coverage measurement.
- **Evidence:** No supplied implementation evidence.
- **Finding:** Coverage compliance cannot be verified.

### Structured logging

- **Status:** PASS ✅
- **Threshold:** Every ledger log line is JSON and carries `tenant_id`, `trace_id`, and `event_type`.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The schema of record requires JSON output and all three declared fields; it states that middleware tests validate a sampled line.
- **Evidence:** `config/logging.json`. The schema of record requires JSON log lines with tenant_id, trace_id, and event_type, and states that middleware tests validate sampled lines.
- **Finding:** The supplied logging configuration meets the declared threshold.

### Error tracking

- **Status:** PASS ✅
- **Threshold:** Unhandled rejections and HTTP 5xx responses reach the error tracker.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Sentry is enabled with release tagging and captures unhandled rejections, uncaught exceptions, and HTTP 5xx responses.
- **Evidence:** `config/logging.json`. Sentry is enabled with release tagging and captures unhandled rejections, uncaught exceptions, and HTTP 5xx responses.
- **Finding:** The supplied error-tracking configuration meets the declared threshold.

### Code duplication

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** No supplied duplication measurement.
- **Evidence:** No supplied implementation evidence.
- **Finding:** Duplication compliance cannot be verified until the team defines a ceiling and supplies a reproducible report.

## Recorded-Only NFR Criteria

The workflow preserved these criteria without automated assessment.

| ID | Category | Label | Declared Threshold | Threshold Source | Assessment Mode |
| --- | --- | --- | --- | --- | --- |
| `disaster-recovery-rto` | Disaster Recovery | RTO | 4 hours | `docs/tech-spec.md` | RECORDED ONLY |
| `disaster-recovery-rpo` | Disaster Recovery | RPO | 15 minutes | `docs/tech-spec.md` | RECORDED ONLY |

## Quick Wins

N/A. Each open item requires an approved requirement, new implementation evidence, or reliability remediation.

## Recommended Actions

### Immediate: Before Release

1. **Reduce the statement-generation 5xx rate below 0.5%.** Priority: CRITICAL. Owner: Ledger engineering. Effort: project-specific.
   - Supply a fresh monthly reliability export after remediation.
2. **Investigate the close-window failures identified in the reliability export.** Priority: CRITICAL. Owner: Ledger engineering and platform operations. Effort: project-specific.
   - Demonstrate the corrective result under production-shaped load.

### Short-term: Next Milestone

1. **Approve performance thresholds.** Priority: HIGH. Owner: Product and ledger engineering. Effort: one working session plus approval.
   - Define p95, p99, throughput, CPU, heap, and database-pool limits for the month-end workload.
2. **Supply the current CI statement-coverage report.** Priority: HIGH. Owner: Ledger engineering. Effort: less than one day when the report already exists.
3. **Supply retry and backoff evidence.** Priority: HIGH. Owner: Ledger engineering. Effort: one to two days.
   - Demonstrate exactly three ledger-write retries with exponential backoff.

### Long-term: Backlog

1. **Define a code-duplication ceiling and add a reproducible report to CI.** Priority: MEDIUM. Owner: Ledger engineering. Effort: one to two days.

## Monitoring Hooks

- Alert when the rolling monthly 5xx rate reaches 0.5%.
- Continue tracking monthly uptime and MTTR against their declared thresholds.
- Add approved performance thresholds to the month-end load-test result and dashboard.

## Fail-Fast Mechanisms

- Block release when the monthly 5xx rate is at or above 0.5%.
- Block performance gate approval while response-time, throughput, or resource-usage thresholds remain UNKNOWN.
- Require the statement-coverage report to show at least 80% before release approval.

## Evidence Gaps

- **performance-response-time:** Response time: declared threshold is UNKNOWN
- **performance-throughput:** Throughput: declared threshold is UNKNOWN
- **performance-resource-usage:** Resource usage: declared threshold is UNKNOWN
- **maintainability-test-coverage:** Test coverage: no supplied implementation evidence
- **maintainability-code-duplication:** Code duplication: declared threshold is UNKNOWN

## Findings Summary

| Domain | Criteria | PASS | CONCERNS | FAIL | Domain Status |
| --- | ---: | ---: | ---: | ---: | --- |
| Performance | 3 | 0 | 3 | 0 | CONCERNS ⚠️ |
| Security | 4 | 4 | 0 | 0 | PASS ✅ |
| Reliability | 5 | 3 | 1 | 1 | FAIL ❌ |
| Maintainability | 4 | 2 | 2 | 0 | CONCERNS ⚠️ |
| **Total** | **16** | **9** | **6** | **1** | **FAIL ❌** |

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-10-09'
  run_key: 'system'
  feature_name: 'Harbor Billing Ledger'
  assessed_criteria: 16
  passed_criteria: 9
  concerns: 6
  failed_criteria: 1
  audited_domains:
    security: 'PASS'
    performance: 'CONCERNS'
    reliability: 'FAIL'
    maintainability: 'CONCERNS'
  overall_status: 'FAIL'
  critical_issues: 1
  high_priority_issues: 3
  medium_priority_issues: 1
  blockers: true
  quick_wins: 0
  evidence_gaps: 5
  recommendations:
    - 'Reduce and remeasure the monthly 5xx rate below 0.5% before release.'
    - 'Approve measurable performance thresholds for the month-end workload.'
    - 'Supply coverage, retry/backoff, and duplication evidence.'
```

## Related Artifacts

- **Tech Spec:** `docs/tech-spec.md`
- **PRD:** N/A
- **Test Design:** N/A
- **Evidence Sources:**
  - `config/logging.json`
  - `evidence/dependency-scan-2026-08-30.json`
  - `evidence/load-test-2026-08-28.json`
  - `evidence/reliability-2026-08.json`
  - `evidence/security-review-2026-08-29.md`

## Recommendations Summary

**Release Blocker:** The monthly 5xx rate is 1.94% against a threshold below 0.5%.

**High Priority:** Establish measurable performance thresholds and supply coverage plus retry/backoff evidence.

**Medium Priority:** Define and automate a code-duplication ceiling.

**Next Steps:** Resolve the FAIL finding, close the evidence gaps, rerun this NFR audit, then run `bmad-testarch-trace` for the release gate decision.

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: FAIL ❌
- Critical Issues: 1
- High Priority Issues: 3
- Concerns: 6
- Evidence Gaps: 5

**Gate Status:** FAIL ❌

**Generated:** 2026-10-09
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
