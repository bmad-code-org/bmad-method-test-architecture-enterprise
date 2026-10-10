---
runScope: 'system'
runKey: 'system'
workflowStatus: 'completed'
stepsCompleted: ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04e-aggregate-nfr', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-10-09'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - '_bmad/config.toml'
  - 'docs/tech-spec.md'
  - 'config/logging.json'
  - 'evidence/dependency-scan-2026-08-30.json'
  - 'evidence/load-test-2026-08-28.json'
  - 'evidence/reliability-2026-08.json'
  - 'evidence/security-review-2026-08-29.md'
---

# NFR Evidence Audit: Harbor Billing Ledger

**Date:** 2026-10-09  
**Scope:** Whole service  
**Overall Status:** FAIL ❌

This audit summarizes supplied implementation evidence. It did not run tests, CI workflows, or live browser collection.

## Executive Summary

**Assessment:** 9 PASS, 6 CONCERNS, 1 FAIL, 1 N/A

**Release Blocker:** The August 5xx rate was 1.94%. The requirement is below 0.5%.

**Recommendation:** Hold the release until the 5xx rate meets its threshold and a new full-month observability export verifies the result. Track the six CONCERNS findings through their listed actions.

| Domain | Status | PASS | CONCERNS | FAIL | N/A |
| --- | --- | ---: | ---: | ---: | ---: |
| Performance | CONCERNS | 0 | 3 | 0 | 0 |
| Security | PASS | 4 | 0 | 0 | 1 |
| Reliability | FAIL | 3 | 1 | 1 | 0 |
| Maintainability | CONCERNS | 2 | 2 | 0 | 0 |

## Performance Assessment

**Domain Status:** CONCERNS

### Response time

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN. Product has not agreed a response-time target.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** p95 response time was 214 ms during the month-end workload.
- **Evidence:** `evidence/load-test-2026-08-28.json`: The month-end workload recorded response-time p95 of 214 ms.
- **Finding:** A measured result exists, while the missing threshold prevents PASS.

### Throughput

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN. Product has not agreed a throughput target.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 344 requests per second across 412,800 requests.
- **Evidence:** `evidence/load-test-2026-08-28.json`: The month-end workload recorded 344 requests per second over 412,800 requests.
- **Finding:** A measured result exists, while the missing threshold prevents PASS.

### Resource usage

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN. Product has not agreed resource-usage targets.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Peak CPU was 58%, peak heap was 61%, and database connections peaked at 34 of 60.
- **Evidence:** `evidence/load-test-2026-08-28.json`: Peak CPU was 58%, peak heap was 61%, and database connections peaked at 34 of 60.
- **Finding:** Measured results exist, while missing limits prevent PASS.

## Security Assessment

**Domain Status:** PASS

### Authentication

- **Status:** PASS ✅
- **Threshold:** OAuth 2.1 access tokens with a lifetime of 15 minutes or less; refresh tokens rotate on use.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** OAuth 2.1 with PKCE uses ES256 tokens with a 900-second lifetime; refresh tokens rotate on each use.
- **Evidence:** `evidence/security-review-2026-08-29.md`: OAuth 2.1 with PKCE uses ES256 access tokens with a 900-second lifetime, and refresh tokens rotate on each use.
- **Finding:** The supplied evidence meets the authentication threshold.

### Authorization

- **Status:** PASS ✅
- **Threshold:** Tenant-scoped RBAC on every statement endpoint; cross-tenant reads are prohibited.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** All five cross-tenant statement-route attempts returned HTTP 403.
- **Evidence:** `evidence/security-review-2026-08-29.md`: Cross-tenant access was refused for all five statement routes and returned HTTP 403.
- **Finding:** The supplied evidence meets the authorization threshold.

### Data protection

- **Status:** PASS ✅
- **Threshold:** AES-256 encryption at rest and TLS 1.3 in transit.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Statements and backups use AES-256; ingress permits TLS 1.3 only.
- **Evidence:** `evidence/security-review-2026-08-29.md`: Statements and backups use AES-256 at rest, and ingress permits TLS 1.3 only.
- **Finding:** The supplied evidence meets the data-protection threshold.

### Vulnerability management

- **Status:** PASS ✅
- **Threshold:** 0 critical and 0 high severity dependency findings at release.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 0 critical, 0 high, 3 moderate, and 7 low findings.
- **Evidence:** `evidence/dependency-scan-2026-08-30.json`: The release scan reports 0 critical and 0 high dependency findings.
- **Finding:** The release scan meets the stated blocking threshold.

### Compliance

- **Status:** N/A
- **Threshold:** No external compliance regime applies to this service.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The compliance review confirms that PCI-DSS, HIPAA, and other external regimes do not apply.
- **Evidence:** `evidence/security-review-2026-08-29.md`: The compliance review confirms that no external compliance regime applies.
- **Finding:** The declared compliance dimension is not applicable.

## Reliability Assessment

**Domain Status:** FAIL

### Availability

- **Status:** PASS ✅
- **Threshold:** Monthly uptime at or above 99.5%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** August uptime was 99.71%.
- **Evidence:** `evidence/reliability-2026-08.json`: August availability was 99.71%.
- **Finding:** Availability exceeds the monthly threshold by 0.21 percentage points.

### Error rate

- **Status:** FAIL ❌
- **Threshold:** Monthly 5xx rate below 0.5% of ledger API requests.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** August 5xx rate was 1.94% across 18,420,000 requests.
- **Evidence:** `evidence/reliability-2026-08.json`: The August 5xx rate was 1.94% over 18,420,000 requests.
- **Finding:** The error rate exceeds the threshold by 1.44 percentage points and is 3.88 times the allowed ceiling.

### MTTR

- **Status:** PASS ✅
- **Threshold:** Restore a ledger incident within 15 minutes.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** August MTTR was 11 minutes across two incidents.
- **Evidence:** `evidence/reliability-2026-08.json`: August MTTR was 11 minutes across two recorded incidents.
- **Finding:** MTTR meets the restoration threshold with four minutes of margin.

### Fault tolerance

- **Status:** CONCERNS ⚠️
- **Threshold:** Three failed-write retries with exponential backoff; one regional failover drill per quarter.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The regional failover drill passed in 38 seconds with no data loss. No supplied observation demonstrates the retry count or exponential-backoff behavior.
- **Evidence:** `evidence/reliability-2026-08.json`: The 2026-08-12 failover drill passed with a 38-second failover and no data loss.
- **Finding:** The failover portion is evidenced. The retry portion remains unverified.

### CI burn-in

- **Status:** PASS ✅
- **Threshold:** 100 consecutive green ledger-suite runs before release.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 214 consecutive green runs.
- **Evidence:** `evidence/reliability-2026-08.json`: The ledger suite completed 214 consecutive green runs.
- **Finding:** Burn-in exceeds the threshold by 114 runs.

## Maintainability Assessment

**Domain Status:** CONCERNS

### Test coverage

- **Status:** CONCERNS ⚠️
- **Threshold:** Statement coverage at or above 80%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** No supplied implementation evidence reports statement coverage.
- **Evidence:** None supplied.
- **Finding:** The 80% threshold cannot be verified.

### Structured logging

- **Status:** PASS ✅
- **Threshold:** Every log line is JSON and contains `tenant_id`, `trace_id`, and `event_type`.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The schema requires JSON output and all three required context fields on every validated log line.
- **Evidence:** `config/logging.json`: JSON logging requires `tenant_id`, `trace_id`, and `event_type` on every validated log line.
- **Finding:** The supplied configuration evidence meets the structured-logging requirement.

### Error tracking

- **Status:** PASS ✅
- **Threshold:** Unhandled rejections and HTTP 5xx responses reach the error tracker.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Sentry is enabled for unhandled rejections, uncaught exceptions, and HTTP 5xx responses.
- **Evidence:** `config/logging.json`: Sentry is enabled and configured to capture unhandled rejections, uncaught exceptions, and HTTP 5xx responses.
- **Finding:** The supplied configuration evidence meets the error-tracking requirement.

### Code duplication

- **Status:** CONCERNS ⚠️
- **Threshold:** UNKNOWN. The team has not agreed a duplication ceiling.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** No supplied implementation evidence measures duplication.
- **Evidence:** None supplied.
- **Finding:** The missing threshold and measurement prevent PASS.

## Recorded-Only NFR Criteria

These requirements are preserved without automated assessment. They do not affect findings, domain statuses, evidence gaps, risks, actions, compliance results, or the gate.

| ID | Category | Label | Declared threshold | Threshold source | Assessment mode |
| --- | --- | --- | --- | --- | --- |
| `disaster-recovery-rto` | Disaster Recovery | RTO | 4 hours | `docs/tech-spec.md` | RECORDED ONLY |
| `disaster-recovery-rpo` | Disaster Recovery | RPO | 15 minutes | `docs/tech-spec.md` | RECORDED ONLY |

## Quick Wins

Three immediate improvements can close five formal evidence gaps:

1. Product and platform owners approve numeric response-time, throughput, CPU, heap, and database-connection thresholds. Estimated effort: one workshop.
2. QA publishes the audited build's statement-coverage report. Estimated effort: hours.
3. Engineering sets a duplication ceiling and adds an automated duplication report to CI. Estimated effort: one day.

## Recommended Actions

| Priority | Domain | Action | Owner | Estimated effort | Validation |
| --- | --- | --- | --- | --- | --- |
| CRITICAL | Reliability | Reduce the monthly 5xx rate below 0.5% and publish a new full-month observability export. | Service engineering and SRE | Investigation dependent | Export shows a 5xx rate below 0.5%. |
| MEDIUM | Reliability | Supply a test result that verifies exactly three ledger-write retries with exponential backoff. | Service engineering and QA | 1 day | Automated result proves retry count and backoff intervals. |
| MEDIUM | Performance | Approve response-time, throughput, and resource-usage limits for the month-end workload. | Product and platform engineering | 1 workshop | `docs/tech-spec.md` contains numeric targets. |
| MEDIUM | Maintainability | Supply statement-coverage evidence for the audited build. | QA | Hours | Coverage report shows whether statement coverage is at least 80%. |
| MEDIUM | Maintainability | Define a duplication ceiling and automate measurement. | Engineering enablement | 1 day | CI report compares duplication against the approved ceiling. |

## Monitoring Hooks

- Alert when the rolling monthly 5xx rate approaches 0.5%. Owner: SRE.
- Track month-end p95 response time, throughput, CPU, heap, and database pool usage after thresholds are approved. Owner: Platform engineering.
- Publish coverage and duplication reports as release artifacts. Owner: QA and engineering enablement.

## Fail-Fast Mechanisms

- Block release when the monthly 5xx rate is at or above 0.5%.
- Block release when critical or high dependency findings exceed zero.
- Block CI when statement coverage falls below 80% after coverage evidence is wired into the pipeline.
- Block CI when duplication exceeds the approved ceiling after that ceiling exists.

## Evidence Gaps

- **performance-response-time:** Response time: declared threshold is UNKNOWN
- **performance-throughput:** Throughput: declared threshold is UNKNOWN
- **performance-resource-usage:** Resource usage: declared threshold is UNKNOWN
- **maintainability-test-coverage:** Test coverage: no supplied implementation evidence
- **maintainability-code-duplication:** Code duplication: declared threshold is UNKNOWN

## Findings Summary

| Domain | Status | Main result | Next action |
| --- | --- | --- | --- |
| Performance | CONCERNS | Three measurements exist; their thresholds are UNKNOWN. | Approve numeric thresholds. |
| Security | PASS | Four applicable controls meet their thresholds; compliance is N/A. | Continue current release scanning and control verification. |
| Reliability | FAIL | The 1.94% 5xx rate breaches the below-0.5% requirement. | Remediate the error rate and verify a new monthly window. |
| Maintainability | CONCERNS | Logging and error tracking pass; coverage and duplication remain undecidable. | Publish coverage and duplication evidence. |

## Related Artifacts

- **Tech Spec:** `docs/tech-spec.md`
- **Logging Configuration:** `config/logging.json`
- **Dependency Scan:** `evidence/dependency-scan-2026-08-30.json`
- **Load Test:** `evidence/load-test-2026-08-28.json`
- **Reliability Export:** `evidence/reliability-2026-08.json`
- **Security Review:** `evidence/security-review-2026-08-29.md`

## Sign-Off

- **Overall Status:** FAIL ❌
- **Critical Issues:** 1
- **High Priority Issues:** 0
- **Medium Priority Issues:** 6
- **Concerns:** 6
- **Evidence Gaps:** 5
- **Release Blocker:** Yes
- **Next Workflow:** Resolve the FAIL finding, then rerun `/bmad-testarch-nfr` before the release gate.

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-10-09'
  story_id: 'system'
  feature_name: 'Harbor Billing Ledger'
  audited_domains:
    security: 'PASS'
    performance: 'CONCERNS'
    reliability: 'FAIL'
    maintainability: 'CONCERNS'
  overall_status: 'FAIL'
  critical_issues: 1
  high_priority_issues: 0
  medium_priority_issues: 6
  concerns: 6
  blockers: true
  quick_wins: 3
  evidence_gaps: 5
  recommendations:
    - 'Reduce the monthly 5xx rate below 0.5% and verify a new full-month window.'
    - 'Approve numeric performance thresholds for the month-end workload.'
    - 'Publish coverage, duplication, and retry-behavior evidence.'
```
