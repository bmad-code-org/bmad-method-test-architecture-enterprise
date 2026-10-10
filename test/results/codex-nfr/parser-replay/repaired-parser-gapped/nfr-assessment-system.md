---
runScope: 'system'
runKey: 'system'
workflowStatus: 'completed'
stepsCompleted: ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04e-aggregate-nfr', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-10-10T03:47:11Z'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - 'docs/tech-spec.md'
  - 'config/logging.json'
  - 'evidence/dependency-scan-2026-08-30.json'
  - 'evidence/load-test-2026-08-28.json'
  - 'evidence/reliability-2026-08.json'
  - 'evidence/security-review-2026-08-29.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/adr-quality-readiness-checklist.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/ci-burn-in.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/test-quality.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/playwright-config.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/error-handling.md'
---

# NFR Evidence Audit: Harbor Billing Ledger

**Date:** 2026-10-09
**Scope:** System
**Story:** N/A
**Overall Status:** FAIL ❌

Note: This audit summarizes supplied implementation evidence. It did not run tests, builds, deployments, CI jobs, or browser exploration.

## Executive Summary

**Assessment:** 10 PASS, 6 CONCERNS, 1 FAIL

**Blockers:** 1. The monthly 5xx rate is 1.94%, which breaches the required rate below 0.5%.

**High Priority Issues:** 2. Fault-tolerance retry behavior lacks direct evidence. Statement coverage lacks supplied evidence.

**Recommendation:** Block release until the error-rate criterion passes. Resolve the high-priority evidence gaps and approve the missing performance and duplication thresholds before the next gate.

---

## Performance Assessment

**Domain Status:** CONCERNS

### Response time

- **Status:** CONCERNS
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "response_time_ms": { "p50": 96, "p95": 214, "p99": 388 },
  ```

- **Evidence:** `evidence/load-test-2026-08-28.json`
- **Supports:**

  ```text
  "response_time_ms": { "p50": 96, "p95": 214, "p99": 388 },
  ```

- **Findings:** The load test supplies measured response times. The declared threshold is UNKNOWN.
- **Recommendation:** Approve a measurable response-time threshold and compare this load-test result against it.

### Throughput

- **Status:** CONCERNS
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "throughput_rps": 344,
  ```

- **Evidence:** `evidence/load-test-2026-08-28.json`
- **Supports:**

  ```text
  "throughput_rps": 344,
  ```

- **Findings:** The load test supplies measured throughput. The declared threshold is UNKNOWN.
- **Recommendation:** Approve a measurable throughput threshold and compare this load-test result against it.

### Resource usage

- **Status:** CONCERNS
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "resource_usage": { "peak_cpu_pct": 58, "peak_heap_pct": 61, "db_connection_pool_peak": 34, "db_connection_pool_size": 60 }
  ```

- **Evidence:** `evidence/load-test-2026-08-28.json`
- **Supports:**

  ```text
  "resource_usage": { "peak_cpu_pct": 58, "peak_heap_pct": 61, "db_connection_pool_peak": 34, "db_connection_pool_size": 60 }
  ```

- **Findings:** The load test supplies measured resource usage. The declared threshold is UNKNOWN.
- **Recommendation:** Approve measurable CPU, heap, and database connection-pool thresholds and compare this load-test result against them.

---

## Security Assessment

**Domain Status:** PASS

### Authentication

- **Status:** PASS
- **Threshold:** Every ledger API call presents an OAuth 2.1 access token whose lifetime is 15 minutes or less. Refresh tokens rotate on use.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  OAuth 2.1 authorization-code flow with PKCE. Access tokens are signed ES256 and issued with a
  900-second (15-minute) lifetime; refresh tokens rotate on every use and the previous token is
  revoked. Verified by `ledger/test/auth/token-lifetime.spec.ts`, which asserts the issued `exp`
  claim, and by a manual replay of an expired token against every statement route.
  ```

- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Supports:**

  ```text
  OAuth 2.1 authorization-code flow with PKCE. Access tokens are signed ES256 and issued with a
  900-second (15-minute) lifetime; refresh tokens rotate on every use and the previous token is
  revoked. Verified by `ledger/test/auth/token-lifetime.spec.ts`, which asserts the issued `exp`
  claim, and by a manual replay of an expired token against every statement route.
  ```

- **Findings:** The supplied observation meets the authentication requirement.
- **Recommendation:** None.

### Authorization

- **Status:** PASS
- **Threshold:** Tenant-scoped RBAC is enforced on every statement endpoint. A token issued for one tenant must never read another tenant's statements.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  Tenant-scoped RBAC is enforced in `ledger/src/http/tenant-guard.ts`, which runs ahead of every
  route in the statements router. The authorization suite exercises all five statement routes with a
  token issued for a different tenant; each returns 403 and writes an audit record. Cross-tenant read
  attempts: 5 of 5 refused.
  ```

- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Supports:**

  ```text
  Tenant-scoped RBAC is enforced in `ledger/src/http/tenant-guard.ts`, which runs ahead of every
  route in the statements router. The authorization suite exercises all five statement routes with a
  token issued for a different tenant; each returns 403 and writes an audit record. Cross-tenant read
  attempts: 5 of 5 refused.
  ```

- **Findings:** The supplied observation meets the tenant-scoped authorization requirement.
- **Recommendation:** None.

### Data protection

- **Status:** PASS
- **Threshold:** Statements are encrypted at rest with AES-256 and in transit with TLS 1.3.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  At rest: the statements table and its backups use AES-256 volume encryption; keys rotate every 90
    days through the platform key service.
  ```

  ```text
  In transit: the ledger's ingress terminates TLS 1.3 only. TLS 1.2 and below were disabled on
    2026-06-14 and the scan below confirms no downgrade path.
  ```

- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Supports:**

  ```text
  At rest: the statements table and its backups use AES-256 volume encryption; keys rotate every 90
    days through the platform key service.
  ```

  ```text
  In transit: the ledger's ingress terminates TLS 1.3 only. TLS 1.2 and below were disabled on
    2026-06-14 and the scan below confirms no downgrade path.
  ```

- **Findings:** The supplied observations meet the AES-256 at-rest and TLS 1.3 in-transit requirements.
- **Recommendation:** None.

### Vulnerability management

- **Status:** PASS
- **Threshold:** A release ships with 0 critical and 0 high severity dependency findings. Moderate and low findings are tracked but do not block.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "note": "Moderate and low findings are tracked in the dependency backlog and do not block a release under the tech spec."
  ```

  ```text
  "summary": { "critical": 0, "high": 0, "moderate": 3, "low": 7, "info": 0, "total": 10 },
  ```

- **Evidence:** `evidence/dependency-scan-2026-08-30.json`
- **Supports:**

  ```text
  "note": "Moderate and low findings are tracked in the dependency backlog and do not block a release under the tech spec."
  ```

  ```text
  "summary": { "critical": 0, "high": 0, "moderate": 3, "low": 7, "info": 0, "total": 10 },
  ```

- **Findings:** The supplied scan reports zero critical and zero high findings. Moderate and low findings remain allowed by the declared threshold.
- **Recommendation:** Continue tracking the moderate and low findings under the existing policy.

### Compliance

- **Status:** PASS
- **Threshold:** The ledger processes no cardholder data and no personal health data, so PCI-DSS and HIPAA are out of scope for this service. No external compliance regime applies to it.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  Confirmed with the compliance team on 2026-08-26: the ledger stores no cardholder data and no
  personal health data, so PCI-DSS and HIPAA do not apply to this service. No other external regime
  covers it. This section exists so a reader does not have to infer the scope from silence.
  ```

- **Evidence:** `evidence/security-review-2026-08-29.md`
- **Supports:**

  ```text
  Confirmed with the compliance team on 2026-08-26: the ledger stores no cardholder data and no
  personal health data, so PCI-DSS and HIPAA do not apply to this service. No other external regime
  covers it. This section exists so a reader does not have to infer the scope from silence.
  ```

- **Findings:** The supplied review confirms the declared compliance scope.
- **Recommendation:** None.

---

## Reliability Assessment

**Domain Status:** FAIL

### Availability

- **Status:** PASS
- **Threshold:** Monthly uptime at or above 99.5%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "availability": { "uptime_pct": 99.71, "downtime_minutes": 128 },
  ```

- **Evidence:** `evidence/reliability-2026-08.json`
- **Supports:**

  ```text
  "availability": { "uptime_pct": 99.71, "downtime_minutes": 128 },
  ```

- **Findings:** The observed 99.71% uptime meets the threshold of at least 99.5%.
- **Recommendation:** None.

### Error rate

- **Status:** FAIL
- **Threshold:** The monthly 5xx rate stays below 0.5% of ledger API requests.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "error_rate_pct": 1.94,
  ```

- **Evidence:** `evidence/reliability-2026-08.json`
- **Supports:**

  ```text
  "error_rate_pct": 1.94,
  ```

- **Findings:** The observed 1.94% monthly 5xx rate breaches the threshold below 0.5%.
- **Recommendation:** Reduce the monthly 5xx rate below 0.5% and supply a new monthly measurement before release.

### MTTR

- **Status:** PASS
- **Threshold:** A ledger incident is restored within 15 minutes.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "mttr_minutes": 11,
  ```

- **Evidence:** `evidence/reliability-2026-08.json`
- **Supports:**

  ```text
  "mttr_minutes": 11,
  ```

- **Findings:** The observed 11-minute MTTR meets the 15-minute threshold.
- **Recommendation:** None.

### Fault tolerance

- **Status:** CONCERNS
- **Threshold:** The statement worker retries a failed ledger write three times with exponential backoff, and the region failover drill runs once a quarter.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "failover_drill": { "date": "2026-08-12", "result": "passed", "observed_failover_seconds": 38, "data_loss": "none" },
  ```

- **Evidence:** `evidence/reliability-2026-08.json`
- **Supports:**

  ```text
  "failover_drill": { "date": "2026-08-12", "result": "passed", "observed_failover_seconds": 38, "data_loss": "none" },
  ```

- **Findings:** The supplied failover observation supports the regional drill portion of the compound requirement. No bound observation demonstrates three failed-write retries with exponential backoff.
- **Recommendation:** Supply a retry test or trace that demonstrates exactly three ledger-write retries with exponential backoff.

### CI burn-in

- **Status:** PASS
- **Threshold:** 100 consecutive green runs of the ledger suite precede a release.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "ci_burn_in": { "suite": "ledger", "consecutive_green_runs": 214, "last_failure": "2026-06-30" },
  ```

- **Evidence:** `evidence/reliability-2026-08.json`
- **Supports:**

  ```text
  "ci_burn_in": { "suite": "ledger", "consecutive_green_runs": 214, "last_failure": "2026-06-30" },
  ```

- **Findings:** The observed 214 consecutive green runs exceed the required 100 runs.
- **Recommendation:** None.

---

## Maintainability Assessment

**Domain Status:** CONCERNS

### Test coverage

- **Status:** CONCERNS
- **Threshold:** Statement coverage of the ledger service stays at or above 80%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** UNKNOWN
- **Evidence:** None
- **Supports:** None
- **Findings:** The 80% threshold has no supplied implementation evidence.
- **Recommendation:** Supply a statement coverage report showing at least 80%.

### Structured logging

- **Status:** PASS
- **Threshold:** Every ledger log line is JSON and carries `tenant_id`, `trace_id`, and `event_type`.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "assertion": "ledger/test/observability/log-format.spec.ts asserts every required field on a sampled line",
  ```

  ```text
  "format": "json",
  ```

  ```text
  "required_fields": ["timestamp", "level", "message", "tenant_id", "trace_id", "event_type"],
  ```

  ```text
  "schema": "config/logging.json is the schema of record; every ledger log line is validated against it in the logging middleware test",
  ```

- **Evidence:** `config/logging.json`
- **Supports:**

  ```text
  "assertion": "ledger/test/observability/log-format.spec.ts asserts every required field on a sampled line",
  ```

  ```text
  "format": "json",
  ```

  ```text
  "required_fields": ["timestamp", "level", "message", "tenant_id", "trace_id", "event_type"],
  ```

  ```text
  "schema": "config/logging.json is the schema of record; every ledger log line is validated against it in the logging middleware test",
  ```

- **Findings:** The supplied configuration meets the JSON format and required-field criteria.
- **Recommendation:** None.

### Error tracking

- **Status:** PASS
- **Threshold:** Unhandled rejections and 5xx responses reach the error tracker.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:**

  ```text
  "captures": ["unhandled_rejection", "uncaught_exception", "http_5xx"],
  ```

  ```text
  "enabled": true,
  ```

- **Evidence:** `config/logging.json`
- **Supports:**

  ```text
  "captures": ["unhandled_rejection", "uncaught_exception", "http_5xx"],
  ```

  ```text
  "enabled": true,
  ```

- **Findings:** The supplied configuration enables error tracking for unhandled rejections and HTTP 5xx responses.
- **Recommendation:** None.

### Code duplication

- **Status:** CONCERNS
- **Threshold:** UNKNOWN
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** UNKNOWN
- **Evidence:** None
- **Supports:** None
- **Findings:** The threshold is UNKNOWN, and no supplied implementation evidence exists.
- **Recommendation:** Approve a measurable duplication ceiling and supply a duplication report.

---

## Recorded-Only NFR Criteria

These criteria are preserved from the requirements without automated assessment. They have no finding, status, evidence gap, risk, action, compliance result, or gate impact.

| ID | Category | Label | Declared Threshold | Threshold Source | Assessment Mode |
| --- | --- | --- | --- | --- | --- |
| `disaster-recovery-disaster-recovery` | Disaster Recovery | Disaster recovery | RTO 4 hours, RPO 15 minutes. | `docs/tech-spec.md` | RECORDED ONLY |

---

## Custom NFR Evidence Audits

N/A. The supplied requirements declare no custom NFR categories.

---

## Quick Wins

4 quick wins identified:

1. **Approve performance thresholds** (Performance). Priority: MEDIUM. Effort: product and engineering decision.
   Use the supplied p50, p95, p99, throughput, CPU, heap, and connection-pool observations as the baseline.
2. **Publish a coverage result** (Maintainability). Priority: HIGH. Effort: CI artifact configuration.
   Attach the statement coverage report to the release evidence.
3. **Publish duplication evidence** (Maintainability). Priority: MEDIUM. Effort: CI report configuration.
   Approve a ceiling, run a duplication report, and retain the artifact.
4. **Retain retry evidence** (Reliability). Priority: HIGH. Effort: test or trace capture.
   Demonstrate exactly three retries with exponential backoff.

---

## Recommended Actions

### Immediate: Critical and High Priority

1. **Reduce the monthly 5xx rate below 0.5%**
   - Priority: CRITICAL
   - Owner: Ledger service team
   - Effort: TBD after root-cause analysis
   - Validation: A new monthly observability export reports a 5xx rate below 0.5%.
2. **Supply direct retry evidence**
   - Priority: HIGH
   - Owner: Ledger service team
   - Effort: Test or trace capture
   - Validation: Evidence demonstrates three failed-write retries with exponential backoff.
3. **Supply statement coverage evidence**
   - Priority: HIGH
   - Owner: Ledger service team
   - Effort: CI artifact publication
   - Validation: The report shows statement coverage at or above 80%.

### Short-term: Medium Priority

1. **Approve performance acceptance thresholds**
   - Owner: Product and platform engineering
   - Deadline: Before the next release gate
2. **Approve a duplication ceiling and retain a report**
   - Owner: Ledger service team
   - Deadline: Before the next release gate

### Long-term: Low Priority

1. **Automate evidence retention for every release**
   - Owner: Platform engineering
   - Scope: Coverage, duplication, dependency scan, load test, reliability export, and retry evidence.

---

## Monitoring Hooks

5 monitoring hooks recommended:

### Performance Monitoring

- [ ] Alerting remains pending until response-time, throughput, and resource thresholds are approved.
  - **Owner:** Product and platform engineering
  - **Deadline:** Before the next release gate

### Security Monitoring

- [ ] Block a release when dependency scans report any critical or high finding.
  - **Owner:** Security engineering
  - **Deadline:** Every release

### Reliability Monitoring

- [ ] Alert when monthly availability falls below 99.5%.
  - **Owner:** Platform operations
  - **Deadline:** Continuous
- [ ] Alert when monthly 5xx rate reaches 0.5%.
  - **Owner:** Platform operations
  - **Deadline:** Continuous
- [ ] Alert when incident restoration exceeds 15 minutes.
  - **Owner:** Platform operations
  - **Deadline:** Continuous

---

## Fail-Fast Mechanisms

### Circuit Breakers: Reliability

- [ ] Add a release evidence check for the required retry count and exponential backoff behavior.
  - **Owner:** Ledger service team
  - **Estimated Effort:** Test or trace capture

### Rate Limiting: Performance

N/A. The supplied requirements declare no rate-limiting criterion.

### Validation Gates: Security

- [ ] Enforce zero critical and zero high dependency findings at release.
  - **Owner:** Security engineering
  - **Estimated Effort:** CI gate configuration

### Coverage and Duplication Gates: Maintainability

- [ ] Enforce statement coverage at or above 80%.
  - **Owner:** Ledger service team
  - **Estimated Effort:** CI gate configuration
- [ ] Add a duplication gate after the team approves its ceiling.
  - **Owner:** Ledger service team
  - **Estimated Effort:** Threshold decision and CI gate configuration

---

## Evidence Gaps

- **performance-response-time:** Response time: UNKNOWN threshold gap
- **performance-throughput:** Throughput: UNKNOWN threshold gap
- **performance-resource-usage:** Resource usage: UNKNOWN threshold gap
- **maintainability-test-coverage:** Test coverage: no supplied implementation evidence
- **maintainability-code-duplication:** Code duplication: no supplied implementation evidence

---

## Findings Summary

| Domain | Criteria | PASS | CONCERNS | FAIL | Domain Status |
| --- | ---: | ---: | ---: | ---: | --- |
| Security | 5 | 5 | 0 | 0 | PASS |
| Performance | 3 | 0 | 3 | 0 | CONCERNS |
| Reliability | 5 | 3 | 1 | 1 | FAIL |
| Maintainability | 4 | 2 | 2 | 0 | CONCERNS |
| **Total** | **17** | **10** | **6** | **1** | **FAIL** |

**Overall Risk:** HIGH

---

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-10-09'
  story_id: 'system'
  feature_name: 'Harbor Billing Ledger'
  adr_checklist_score: 'N/A'
  categories:
    testability_automation: 'N/A'
    test_data_strategy: 'N/A'
    scalability_availability: 'FAIL'
    disaster_recovery: 'N/A'
    security: 'PASS'
    monitorability: 'PASS'
    qos_qoe: 'CONCERNS'
    deployability: 'N/A'
  audited_domains:
    security: 'PASS'
    performance: 'CONCERNS'
    reliability: 'FAIL'
    maintainability: 'CONCERNS'
  overall_status: 'FAIL'
  critical_issues: 1
  high_priority_issues: 2
  medium_priority_issues: 4
  concerns: 6
  blockers: true
  quick_wins: 4
  evidence_gaps: 5
  recommendations:
    - 'Reduce the monthly 5xx rate below 0.5% and supply a new monthly measurement.'
    - 'Supply direct retry evidence and a statement coverage report.'
    - 'Approve performance and code-duplication thresholds.'
```

---

## Related Artifacts

- **Story File:** N/A
- **Tech Spec:** `docs/tech-spec.md`
- **PRD:** N/A
- **Test Design:** N/A
- **Canonical Context:** `.tea-runs/tea-nfr-zjPTgJ/attempt-1/artifacts/nfr/nfr-context-system.json`
- **Evidence Sources:**
  - `config/logging.json`
  - `evidence/dependency-scan-2026-08-30.json`
  - `evidence/load-test-2026-08-28.json`
  - `evidence/reliability-2026-08.json`
  - `evidence/security-review-2026-08-29.md`

---

## Recommendations Summary

**Release Blocker:** The monthly 5xx rate must fall below 0.5%.

**High Priority:** Supply direct retry behavior evidence and statement coverage evidence.

**Medium Priority:** Approve performance and code-duplication thresholds. Publish the corresponding evidence.

**Next Steps:** Resolve the FAIL criterion, close the five evidence gaps, and rerun this NFR evidence audit before the release gate.

---

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: FAIL ❌
- Critical Issues: 1
- High Priority Issues: 2
- Concerns: 6
- Evidence Gaps: 5

**Gate Status:** FAIL ❌

**Next Actions:**

- Resolve the error-rate FAIL criterion.
- Supply the missing retry and coverage evidence.
- Approve the UNKNOWN performance and code-duplication thresholds.
- Rerun `/bmad-testarch-nfr` before the release gate.

**Generated:** 2026-10-09
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
