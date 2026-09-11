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
