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
  - 'evidence/coverage-summary-2026-09-01.json'
  - 'evidence/dependency-scan-2026-09-01.json'
  - 'evidence/duplication-report-2026-09-01.json'
  - 'evidence/load-test-2026-09-02.json'
  - 'evidence/reliability-2026-09.json'
  - 'evidence/security-review-2026-09-01.md'
  - '../bmod-tea/knowledge/adr-quality-readiness-checklist.md'
  - '../bmod-tea/knowledge/ci-burn-in.md'
  - '../bmod-tea/knowledge/test-quality.md'
  - '../bmod-tea/knowledge/playwright-config.md'
  - '../bmod-tea/knowledge/error-handling.md'
---

# NFR Evidence Audit: Atlas Notification Relay

**Date:** 2026-10-09
**Story:** N/A
**Run:** system
**Overall Status:** FAIL ❌

## Executive Summary

**Assessment:** 18 PASS, 0 CONCERNS, 1 FAIL

**Blockers:** 1. Outbound webhooks permit TLS 1.2 or better, while the declared in-transit requirement is TLS 1.3.

**High Priority Issues:** 0.

**Recommendation:** Block release until the data-protection finding passes.

## Performance Assessment

**Domain Status:** PASS ✅

### Response time

- **Status:** PASS ✅
- **Threshold:** Enqueue API p95 under 300 ms at the release load profile.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 168 ms p95.
- **Evidence:** `evidence/load-test-2026-09-02.json`. The release load profile records 168 ms p95 response time.

### Throughput

- **Status:** PASS ✅
- **Threshold:** At least 250 requests per second.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 402 requests per second.
- **Evidence:** `evidence/load-test-2026-09-02.json`. The release load profile records 402 requests per second.

### CPU usage

- **Status:** PASS ✅
- **Threshold:** Peak CPU below 70% during the load profile.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 51% peak CPU.
- **Evidence:** `evidence/load-test-2026-09-02.json`. The release load profile records 51% peak CPU.

### Memory usage

- **Status:** PASS ✅
- **Threshold:** Peak heap below 75% during the load profile.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 62% peak heap usage.
- **Evidence:** `evidence/load-test-2026-09-02.json`. The release load profile records 62% peak heap usage.

## Security Assessment

**Domain Status:** FAIL ❌

### Authentication

- **Status:** PASS ✅
- **Threshold:** OAuth 2.1 access tokens with a lifetime of at most 15 minutes; refresh tokens rotate on use.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** OAuth 2.1 with PKCE; ES256 access tokens have a 900-second lifetime; refresh tokens rotate on every use.
- **Evidence:** `evidence/security-review-2026-09-01.md`. The security review verifies OAuth 2.1 with PKCE, 900-second ES256 access tokens, and refresh-token rotation on every use.

### Authorization

- **Status:** PASS ✅
- **Threshold:** Service-scoped RBAC on every relay endpoint; no cross-service delivery receipt access.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** RBAC covers all seven routes; 7 of 7 cross-service read attempts were refused with HTTP 403.
- **Evidence:** `evidence/security-review-2026-09-01.md`. The security review records service-scoped RBAC on all seven routes and 7 of 7 cross-service read attempts refused with HTTP 403.

### Data protection

- **Status:** FAIL ❌
- **Threshold:** AES-256 at rest; TLS 1.3 in transit; message bodies deleted within 24 hours after delivery.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** AES-256 at rest and TLS 1.3 ingress are recorded. Outbound webhooks use TLS 1.2 or better. No message body older than 24 hours was found across 1.2 million delivered messages.
- **Evidence:**
  - `evidence/security-review-2026-09-01.md`: The security review records AES-256 at rest, TLS 1.3 ingress, and no message body older than 24 hours across 1.2 million delivered messages.
  - `evidence/security-review-2026-09-01.md`: The security review states that outbound webhooks use TLS 1.2 or better with certificate verification.
- **Remediation:** Require TLS 1.3 for every outbound webhook connection and rerun the security review.

### Vulnerability management

- **Status:** PASS ✅
- **Threshold:** 0 critical and 0 high severity dependency findings.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 0 critical and 0 high severity findings.
- **Evidence:** `evidence/dependency-scan-2026-09-01.json`. The relay@2.3.0 npm audit report records 0 critical and 0 high severity findings.

### Compliance

- **Status:** PASS ✅
- **Threshold:** GDPR data-processing record and evidence of the 24-hour retention control.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The data-processing record is current; the retention control was reviewed; compliance signed off.
- **Evidence:** `evidence/security-review-2026-09-01.md`. The security review records a current GDPR data-processing record, a reviewed 24-hour retention control, and compliance sign-off.

## Reliability Assessment

**Domain Status:** PASS ✅

### Availability

- **Status:** PASS ✅
- **Threshold:** Monthly uptime at or above 99.9%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 99.96% uptime for August 2026.
- **Evidence:** `evidence/reliability-2026-09.json`. The August 2026 observability export records 99.96% uptime.

### Error rate

- **Status:** PASS ✅
- **Threshold:** Monthly 5xx rate below 0.5% of relay API requests.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 0.07% server error rate for August 2026.
- **Evidence:** `evidence/reliability-2026-09.json`. The August 2026 observability export records a 0.07% server error rate.

### MTTR

- **Status:** PASS ✅
- **Threshold:** Restore a relay incident within 15 minutes.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 6-minute MTTR.
- **Evidence:** `evidence/reliability-2026-09.json`. The August 2026 observability export records a 6-minute MTTR.

### Fault tolerance

- **Status:** PASS ✅
- **Threshold:** Circuit breaker opens after five consecutive transport failures; regional failover drill runs quarterly.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Circuit breaker opens after five consecutive failures; the 2026-08-21 regional failover drill passed in 22 seconds with no data loss.
- **Evidence:**
  - `evidence/reliability-2026-09.json`: The 2026-08-21 regional failover drill passed with a 22-second observed failover and no data loss.
  - `evidence/reliability-2026-09.json`: The circuit breaker opens after five consecutive failures and exercised automatic opening and closing during the August incident.

### CI burn-in

- **Status:** PASS ✅
- **Threshold:** 100 consecutive green relay suite runs before release.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 312 consecutive green runs.
- **Evidence:** `evidence/reliability-2026-09.json`. The relay suite records 312 consecutive green runs.

## Maintainability Assessment

**Domain Status:** PASS ✅

### Test coverage

- **Status:** PASS ✅
- **Threshold:** Statement coverage at or above 80%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 88.4% statement coverage.
- **Evidence:** `evidence/coverage-summary-2026-09-01.json`. The relay@2.3.0 c8 report records 88.4% statement coverage.

### Code duplication

- **Status:** PASS ✅
- **Threshold:** Duplicated blocks below 5% of relay source.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 2.1% duplicated lines.
- **Evidence:** `evidence/duplication-report-2026-09-01.json`. The relay@2.3.0 jscpd report records 2.1% duplicated lines.

### Dependency vulnerabilities

- **Status:** PASS ✅
- **Threshold:** 0 critical and 0 high severity findings.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** 0 critical and 0 high severity findings.
- **Evidence:** `evidence/dependency-scan-2026-09-01.json`. The relay@2.3.0 npm audit report records 0 critical and 0 high severity findings.

### Structured logging

- **Status:** PASS ✅
- **Threshold:** Every log line is JSON with `service_id`, `trace_id`, and `transport`.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The logging schema requires JSON with `service_id`, `trace_id`, and `transport` on every validated relay log line.
- **Evidence:** `config/logging.json`. The logging schema requires JSON output with service_id, trace_id, and transport on every validated relay log line.

### Error tracking

- **Status:** PASS ✅
- **Threshold:** Unhandled rejections and 5xx responses reach the error tracker.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Sentry is enabled to capture unhandled rejections, uncaught exceptions, and HTTP 5xx responses.
- **Evidence:** `config/logging.json`. Sentry is enabled and configured to capture unhandled rejections, uncaught exceptions, and HTTP 5xx responses.

## Recorded-Only NFR Criteria

These criteria were preserved without automated assessment.

| ID | Category | Label | Declared threshold | Threshold source | Assessment mode |
| --- | --- | --- | --- | --- | --- |
| `disaster-recovery-rto` | Disaster Recovery | RTO | 4 hours | `docs/tech-spec.md` | RECORDED ONLY |
| `disaster-recovery-rpo` | Disaster Recovery | RPO | 15 minutes | `docs/tech-spec.md` | RECORDED ONLY |

## Quick Wins

N/A. The blocking remediation requires a transport policy change and new security evidence.

## Recommended Actions

### Immediate

1. **Enforce outbound TLS 1.3.** Priority: CRITICAL. Owner: Relay Engineering with Platform Security.
   - Set the outbound transport minimum protocol to TLS 1.3 and validate negotiation against representative webhook endpoints.
   - Produce a new security review, then repeat this NFR audit with that supplied evidence.

### Short-term

N/A.

### Long-term

N/A.

## Monitoring Hooks

N/A. No additional monitoring requirement was declared for automated assessment.

## Fail-Fast Mechanisms

Add a release validation gate that fails when an outbound webhook connection negotiates a protocol below TLS 1.3.

## Evidence Gaps

None.

## Related Artifacts

- **Tech Spec:** `docs/tech-spec.md`
- **Evidence Sources:** `config/` and `evidence/`

## Sign-Off

- **Overall Status:** FAIL ❌
- **Critical Issues:** 1
- **High Priority Issues:** 0
- **Concerns:** 0
- **Evidence Gaps:** 0
- **Gate Status:** FAIL ❌

**Generated:** 2026-10-09
**Workflow:** testarch-nfr v5.0

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-10-09'
  story_id: 'system'
  feature_name: 'Atlas Notification Relay'
  adr_checklist_score: 'N/A'
  compliance:
    GDPR: 'PASS'
  audited_domains:
    security: 'FAIL'
    performance: 'PASS'
    reliability: 'PASS'
    maintainability: 'PASS'
  overall_status: 'FAIL'
  critical_issues: 1
  high_priority_issues: 0
  medium_priority_issues: 0
  concerns: 0
  blockers: true
  quick_wins: 0
  evidence_gaps: 0
  recommendations:
    - 'Require TLS 1.3 for every outbound webhook connection and rerun the security review.'
```
