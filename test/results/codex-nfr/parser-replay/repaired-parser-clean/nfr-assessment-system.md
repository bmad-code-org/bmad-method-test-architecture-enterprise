---
runScope: 'system'
runKey: 'system'
workflowStatus: 'completed'
stepsCompleted: ['step-01-load-context', 'step-02-define-thresholds', 'step-03-gather-evidence', 'step-04e-aggregate-nfr', 'step-05-generate-report']
lastStep: 'step-05-generate-report'
lastSaved: '2026-10-10T03:30:04Z'
workflowType: 'testarch-nfr-assess'
inputDocuments:
  - 'docs/tech-spec.md'
  - 'config/logging.json'
  - 'evidence/coverage-summary-2026-09-01.json'
  - 'evidence/dependency-scan-2026-09-01.json'
  - 'evidence/duplication-report-2026-09-01.json'
  - 'evidence/load-test-2026-09-02.json'
  - 'evidence/reliability-2026-09.json'
  - 'evidence/security-review-2026-09-01.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/adr-quality-readiness-checklist.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/ci-burn-in.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/test-quality.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/playwright-config.md'
  - '/private/tmp/tea-nfr-public-final/skills/bmod-tea/knowledge/error-handling.md'
---

# NFR Evidence Audit: Atlas Notification Relay

**Date:** 2026-10-09
**Scope:** System
**Story:** N/A
**Overall Status:** PASS ✅

---

This audit summarizes supplied implementation evidence. It did not run tests, build scripts, deploy scripts, CI jobs, or browser exploration. Requirements establish thresholds only. They are never counted as implementation evidence.

## Executive Summary

**Assessment:** 19 PASS, 0 CONCERNS, 0 FAIL

**Blockers:** 0

**High Priority Issues:** 0

**Overall Risk:** LOW

**Recommendation:** The supplied evidence supports release readiness for every audited criterion. Run the release traceability gate or proceed under the project's release process.

| Audited domain | PASS | CONCERNS | FAIL | Domain status |
| --- | ---: | ---: | ---: | --- |
| Security | 5 | 0 | 0 | PASS |
| Performance | 4 | 0 | 0 | PASS |
| Reliability | 5 | 0 | 0 | PASS |
| Maintainability | 5 | 0 | 0 | PASS |
| **Total** | **19** | **0** | **0** | **PASS** |

One disaster recovery declaration is preserved as recorded-only. It has no audited finding, domain status, evidence gap, risk, action, compliance result, or gate impact.

The security and maintainability vulnerability judgments share the supplied dependency scan. Its reported result is zero critical and zero high findings.

---

## Performance Assessment

**Domain Status:** PASS

### Response time

- **Status:** PASS ✅
- **Threshold:** The enqueue API answers in under 300 ms at p95 under the release load profile.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"response_time_ms": { "p50": 74, "p95": 168, "p99": 291 }`
- **Evidence:**
  - `evidence/load-test-2026-09-02.json`
- **Supports:**
  - `"response_time_ms": { "p50": 74, "p95": 168, "p99": 291 }`
  - `"response_time_p95_ms": "168 against a 300 target"`
  - `"scenario": "Release load profile, 400 virtual users, 30 minutes, production-shaped transport mix"`
- **Findings:** The supplied release load profile reports a p95 response time of 168 ms, which meets the under-300-ms threshold.

### Throughput

- **Status:** PASS ✅
- **Threshold:** The relay sustains at least 250 requests per second.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"throughput_rps": 402`
- **Evidence:**
  - `evidence/load-test-2026-09-02.json`
- **Supports:**
  - `"scenario": "Release load profile, 400 virtual users, 30 minutes, production-shaped transport mix"`
  - `"throughput_rps": "402 against a 250 target"`
  - `"throughput_rps": 402`
- **Findings:** The supplied release load profile reports 402 requests per second, which meets the 250 requests-per-second minimum.

### CPU usage

- **Status:** PASS ✅
- **Threshold:** Peak CPU stays below 70% during the load profile.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"peak_cpu_pct": "51 against a 70 target"`
- **Evidence:**
  - `evidence/load-test-2026-09-02.json`
- **Supports:**
  - `"peak_cpu_pct": "51 against a 70 target"`
  - `"resource_usage": { "peak_cpu_pct": 51, "peak_heap_pct": 62, "queue_depth_peak": 1840, "queue_depth_ceiling": 20000 }`
  - `"scenario": "Release load profile, 400 virtual users, 30 minutes, production-shaped transport mix"`
- **Findings:** Peak CPU was 51% during the supplied load profile, which meets the below-70% threshold.

### Memory usage

- **Status:** PASS ✅
- **Threshold:** Peak heap stays below 75% during the load profile.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"peak_heap_pct": "62 against a 75 target"`
- **Evidence:**
  - `evidence/load-test-2026-09-02.json`
- **Supports:**
  - `"peak_heap_pct": "62 against a 75 target"`
  - `"resource_usage": { "peak_cpu_pct": 51, "peak_heap_pct": 62, "queue_depth_peak": 1840, "queue_depth_ceiling": 20000 }`
  - `"scenario": "Release load profile, 400 virtual users, 30 minutes, production-shaped transport mix"`
- **Findings:** Peak heap was 62% during the supplied load profile, which meets the below-75% threshold.

---

## Security Assessment

**Domain Status:** PASS

### Authentication

- **Status:** PASS ✅
- **Threshold:** Every relay API call presents an OAuth 2.1 access token whose lifetime is 15 minutes or less. Refresh tokens rotate on use.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** OAuth 2.1 authorization-code flow with PKCE. Access tokens are signed ES256 and issued with a 900-second (15-minute) lifetime; refresh tokens rotate on every use.
- **Evidence:**
  - `evidence/security-review-2026-09-01.md`
- **Supports:**
  - OAuth 2.1 authorization-code flow with PKCE. Access tokens are signed ES256 and issued with a 900-second (15-minute) lifetime; refresh tokens rotate on every use.
  - Verified by `relay/test/auth/token-lifetime.spec.ts` and by a manual replay of an expired token against every relay route.
- **Findings:** The supplied evidence meets the OAuth version, token lifetime, and refresh-token rotation requirements.

### Authorization

- **Status:** PASS ✅
- **Threshold:** Service-scoped RBAC is enforced on every relay endpoint. A token issued for one product service must never read another service's delivery receipts.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** Service-scoped RBAC is enforced in `relay/src/http/service-guard.ts`, ahead of every route in the relay router. The authorization suite exercises all seven relay routes with a token issued for a different product service; each returns 403 and writes an audit record. Cross-service read attempts: 7 of 7 refused.
- **Evidence:**
  - `evidence/security-review-2026-09-01.md`
- **Supports:**
  - Service-scoped RBAC is enforced in `relay/src/http/service-guard.ts`, ahead of every route in the relay router. The authorization suite exercises all seven relay routes with a token issued for a different product service; each returns 403 and writes an audit record. Cross-service read attempts: 7 of 7 refused.
- **Findings:** The supplied evidence covers every relay route and reports that all seven cross-service read attempts were refused.

### Data protection

- **Status:** PASS ✅
- **Threshold:** Message bodies are encrypted at rest with AES-256 and in transit with TLS 1.3, and are deleted 24 hours after delivery.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** At rest: message bodies and delivery receipts use AES-256 volume encryption; keys rotate every 90 days through the platform key service.
- **Evidence:**
  - `evidence/security-review-2026-09-01.md`
- **Supports:**
  - At rest: message bodies and delivery receipts use AES-256 volume encryption; keys rotate every 90 days through the platform key service.
  - In transit: the relay's ingress terminates TLS 1.3 only, and every outbound webhook is TLS 1.3 only with certificate verification on.
  - Retention: the deletion job runs hourly. The 2026-09-01 audit found no message body older than 24 hours across 1.2 million delivered messages.
- **Findings:** The supplied evidence meets the declared encryption and retention requirements.

### Vulnerability management

- **Status:** PASS ✅
- **Threshold:** A release ships with 0 critical and 0 high severity dependency findings.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"summary": { "critical": 0, "high": 0, "moderate": 1, "low": 4, "info": 0, "total": 5 }`
- **Evidence:**
  - `evidence/dependency-scan-2026-09-01.json`
- **Supports:**
  - `"note": "0 critical and 0 high, which is the tech-spec requirement for both the security and the maintainability threshold."`
  - `"summary": { "critical": 0, "high": 0, "moderate": 1, "low": 4, "info": 0, "total": 5 }`
- **Findings:** The dependency scan reports zero critical and zero high findings. The moderate and low findings do not breach the declared threshold.

### Compliance

- **Status:** PASS ✅
- **Threshold:** GDPR applies: the relay is a processor for the recipient data Atlas product services send it, and the data-processing record and the 24-hour retention control are the evidence for it.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** The relay is a processor for recipient data. The data-processing record was reviewed on 2026-08-28 and is current; the 24-hour retention control above is the technical measure it names; subject erasure requests are served by the deletion job within one hour. The compliance team signed the review on 2026-09-01.
- **Evidence:**
  - `evidence/security-review-2026-09-01.md`
- **Supports:**
  - The relay is a processor for recipient data. The data-processing record was reviewed on 2026-08-28 and is current; the 24-hour retention control above is the technical measure it names; subject erasure requests are served by the deletion job within one hour. The compliance team signed the review on 2026-09-01.
- **Findings:** The supplied evidence identifies the relay as a GDPR processor, confirms the current processing record, and documents compliance sign-off.

---

## Reliability Assessment

**Domain Status:** PASS

### Availability

- **Status:** PASS ✅
- **Threshold:** Monthly uptime at or above 99.9%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"availability": { "uptime_pct": 99.96, "downtime_minutes": 17 }`
- **Evidence:**
  - `evidence/reliability-2026-09.json`
- **Supports:**
  - `"availability": { "uptime_pct": 99.96, "downtime_minutes": 17 }`
- **Findings:** The supplied monthly uptime is 99.96%, which meets the 99.9% minimum.

### Error rate

- **Status:** PASS ✅
- **Threshold:** The monthly 5xx rate stays below 0.5% of relay API requests.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"errors": { "requests": 62140000, "server_errors": 43498, "error_rate_pct": 0.07, "top_error": "502 from a downstream webhook endpoint" }`
- **Evidence:**
  - `evidence/reliability-2026-09.json`
- **Supports:**
  - `"errors": { "requests": 62140000, "server_errors": 43498, "error_rate_pct": 0.07, "top_error": "502 from a downstream webhook endpoint" }`
- **Findings:** The supplied monthly 5xx rate is 0.07%, which meets the below-0.5% threshold.

### MTTR

- **Status:** PASS ✅
- **Threshold:** A relay incident is restored within 15 minutes.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"mttr_minutes": 6`
- **Evidence:**
  - `evidence/reliability-2026-09.json`
- **Supports:**
  - `"incidents": [{ "id": "INC-4482", "opened": "2026-08-09T14:03:00Z", "restored_minutes": 6, "summary": "SMS transport credential rotation lag" }]`
  - `"mttr_minutes": 6`
- **Findings:** The supplied incident restoration time and MTTR are 6 minutes, which meets the 15-minute limit.

### Fault tolerance

- **Status:** PASS ✅
- **Threshold:** The delivery worker opens a circuit breaker after five consecutive transport failures, and the region failover drill runs once a quarter.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"circuit_breaker": { "configured_in": "relay/src/delivery/circuit-breaker.ts", "opens_after_consecutive_failures": 5, "exercised": "2026-08-09 incident, opened and closed automatically" }`
- **Evidence:**
  - `evidence/reliability-2026-09.json`
- **Supports:**
  - `"circuit_breaker": { "configured_in": "relay/src/delivery/circuit-breaker.ts", "opens_after_consecutive_failures": 5, "exercised": "2026-08-09 incident, opened and closed automatically" }`
  - `"failover_drill": { "date": "2026-08-21", "result": "passed", "observed_failover_seconds": 22, "data_loss": "none" }`
- **Findings:** The circuit breaker opens after five failures and the supplied quarterly failover drill passed.

### CI burn-in

- **Status:** PASS ✅
- **Threshold:** 100 consecutive green runs of the relay suite precede a release.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"ci_burn_in": { "suite": "relay", "consecutive_green_runs": 312, "last_failure": "2026-05-11" }`
- **Evidence:**
  - `evidence/reliability-2026-09.json`
- **Supports:**
  - `"ci_burn_in": { "suite": "relay", "consecutive_green_runs": 312, "last_failure": "2026-05-11" }`
- **Findings:** The supplied evidence reports 312 consecutive green relay-suite runs, which meets the 100-run requirement.

---

## Maintainability Assessment

**Domain Status:** PASS

### Test coverage

- **Status:** PASS ✅
- **Threshold:** Statement coverage of the relay service stays at or above 80%.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"totals": { "statements_pct": 88.4, "branches_pct": 84.1, "functions_pct": 90.2, "lines_pct": 88.6 }`
- **Evidence:**
  - `evidence/coverage-summary-2026-09-01.json`
- **Supports:**
  - `"totals": { "statements_pct": 88.4, "branches_pct": 84.1, "functions_pct": 90.2, "lines_pct": 88.6 }`
- **Findings:** Statement coverage is 88.4%, which meets the 80% minimum.

### Code duplication

- **Status:** PASS ✅
- **Threshold:** Duplicated blocks stay below 5% of the relay source.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"statistics": { "total_lines": 24180, "duplicated_lines": 508, "duplicated_pct": 2.1, "clones": 11 }`
- **Evidence:**
  - `evidence/duplication-report-2026-09-01.json`
- **Supports:**
  - `"statistics": { "total_lines": 24180, "duplicated_lines": 508, "duplicated_pct": 2.1, "clones": 11 }`
- **Findings:** Duplicated source is 2.1%, which meets the below-5% threshold.

### Dependency vulnerabilities

- **Status:** PASS ✅
- **Threshold:** 0 critical and 0 high severity findings, matching the security requirement above.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"summary": { "critical": 0, "high": 0, "moderate": 1, "low": 4, "info": 0, "total": 5 }`
- **Evidence:**
  - `evidence/dependency-scan-2026-09-01.json`
- **Supports:**
  - `"note": "0 critical and 0 high, which is the tech-spec requirement for both the security and the maintainability threshold."`
  - `"summary": { "critical": 0, "high": 0, "moderate": 1, "low": 4, "info": 0, "total": 5 }`
- **Findings:** The dependency scan reports zero critical and zero high findings. The moderate and low findings do not breach the declared threshold.

### Structured logging

- **Status:** PASS ✅
- **Threshold:** Every relay log line is JSON and carries `service_id`, `trace_id`, and `transport`.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"format": "json"`
- **Evidence:**
  - `config/logging.json`
- **Supports:**
  - `"assertion": "relay/test/observability/log-format.spec.ts asserts every required field on a sampled line and fails the build when one is missing"`
  - `"format": "json"`
  - `"required_fields": ["timestamp", "level", "message", "service_id", "trace_id", "transport"]`
  - `"schema": "config/logging.json is the schema of record; every relay log line is validated against it in the logging middleware test"`
- **Findings:** The configuration requires JSON and the declared fields. It also records a build-failing middleware assertion for sampled log lines.

### Error tracking

- **Status:** PASS ✅
- **Threshold:** Unhandled rejections and 5xx responses reach the error tracker.
- **Threshold Source:** `docs/tech-spec.md`
- **Actual:** `"captures": ["unhandled_rejection", "uncaught_exception", "http_5xx"]`
- **Evidence:**
  - `config/logging.json`
- **Supports:**
  - `"captures": ["unhandled_rejection", "uncaught_exception", "http_5xx"]`
  - `"enabled": true`
- **Findings:** Error tracking is enabled and covers unhandled rejections and HTTP 5xx responses.

---

## Custom NFR Evidence Audits

N/A. No custom NFR categories were supplied.

## Recorded-Only NFR Criteria

The following criterion was preserved without automated assessment.

| ID | Category | Label | Declared threshold | Threshold source | Assessment mode |
| --- | --- | --- | --- | --- | --- |
| disaster-recovery-disaster-recovery | Disaster recovery | Disaster recovery | RTO 4 hours, RPO 15 minutes. | `docs/tech-spec.md` | RECORDED ONLY |

## Quick Wins

0 quick wins. No CONCERNS or FAIL findings generated remediation work.

## Recommended Actions

### Immediate: Critical or High Priority

None.

### Short-term: Medium Priority

None.

### Long-term: Low Priority

None produced by this audit.

## Monitoring Hooks

No new monitoring hooks were generated. The audit found no criterion concern or evidence gap.

## Fail-Fast Mechanisms

No new fail-fast mechanism was generated. Existing circuit-breaker and build-failing logging assertion evidence appears in the audited findings.

## Evidence Gaps

0 evidence gaps.

## Findings Summary

| Domain | Declared criteria | PASS | CONCERNS | FAIL | Overall status |
| --- | ---: | ---: | ---: | ---: | --- |
| Performance | 4 | 4 | 0 | 0 | PASS |
| Security | 5 | 5 | 0 | 0 | PASS |
| Reliability | 5 | 5 | 0 | 0 | PASS |
| Maintainability | 5 | 5 | 0 | 0 | PASS |
| **Total** | **19** | **19** | **0** | **0** | **PASS** |

## Gate YAML Snippet

```yaml
nfr_assessment:
  date: '2026-10-09'
  story_id: 'N/A'
  feature_name: 'Atlas Notification Relay'
  adr_checklist_score: 'N/A'
  declared_criteria_score: '19/19'
  categories:
    testability_automation: 'N/A'
    test_data_strategy: 'N/A'
    scalability_availability: 'PASS'
    disaster_recovery: 'N/A'
    security: 'PASS'
    monitorability: 'PASS'
    qos_qoe: 'PASS'
    deployability: 'N/A'
  audited_domains:
    security: 'PASS'
    performance: 'PASS'
    reliability: 'PASS'
    maintainability: 'PASS'
  overall_status: 'PASS'
  critical_issues: 0
  high_priority_issues: 0
  medium_priority_issues: 0
  concerns: 0
  blockers: false
  quick_wins: 0
  evidence_gaps: 0
  recommendations: []
```

## Related Artifacts

- **Story File:** N/A
- **Tech Spec:** `docs/tech-spec.md`
- **PRD:** N/A
- **Test Design:** N/A
- **Implementation Evidence:**
  - `config/logging.json`
  - `evidence/coverage-summary-2026-09-01.json`
  - `evidence/dependency-scan-2026-09-01.json`
  - `evidence/duplication-report-2026-09-01.json`
  - `evidence/load-test-2026-09-02.json`
  - `evidence/reliability-2026-09.json`
  - `evidence/security-review-2026-09-01.md`

## Recommendations Summary

**Release Blocker:** None.

**High Priority:** None.

**Medium Priority:** None.

**Next Steps:** Run `/bmad-testarch-trace` Phase 2 for the release gate decision, or proceed with the established release process.

## Sign-Off

**NFR Evidence Audit:**

- Overall Status: PASS ✅
- Critical Issues: 0
- High Priority Issues: 0
- Concerns: 0
- Evidence Gaps: 0

**Gate Status:** PASS ✅

**Next Action:** Run `/bmad-testarch-trace` Phase 2 for the release gate decision, or release.

**Generated:** 2026-10-09
**Workflow:** testarch-nfr v5.0

---

<!-- Powered by BMAD-CORE™ -->
