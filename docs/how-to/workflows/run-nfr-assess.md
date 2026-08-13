---
title: 'How to Run NFR Evidence Audit with TEA'
description: Audit non-functional requirement evidence for security, performance, reliability, and maintainability using TEA
---

# How to Run NFR Evidence Audit with TEA

Use TEA's `nfr-assess` workflow to audit non-functional requirement (NFR) evidence across security, performance, reliability, and maintainability. The command remains `nfr-assess` for compatibility; the workflow role is an evidence audit.

Use `test-design` before implementation to define NFR thresholds, planned validation, and expected evidence. Use `nfr-assess` after evidence exists to decide PASS/CONCERNS/FAIL.

## When to Use This

- Enterprise projects with compliance requirements
- Projects with strict NFR thresholds
- Before production release
- After tests, scans, metrics, logs, monitoring data, or CI reports exist
- When NFRs are critical to project success
- Security or performance is mission-critical

**Best for:**

- Enterprise track projects
- Compliance-heavy industries (finance, healthcare, government)
- High-traffic applications
- Security-critical systems

## Prerequisites

- NFRs defined in PRD, requirements doc, architecture, or `test-design`
- Evidence sources available or explicitly missing (test results, security scans, performance metrics, logs, dashboards, CI reports)

**Note:** You can run the audit without complete evidence. TEA will mark categories as CONCERNS where evidence is missing and document what's needed.

## Steps

### 1. Run the NFR Evidence Audit Workflow

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-nfr`
- **Codex:** `$bmad-testarch-nfr`
- **Inside a `/bmad-tea` chat:** `NR`

Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

### 2. Specify NFR Categories

TEA will ask which NFR categories to audit.

**Available Categories:**

| Category            | Focus Areas                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| **Security**        | Authentication, authorization, encryption, vulnerabilities, security headers, input validation |
| **Performance**     | Response time, throughput, resource usage, database queries, frontend load time                |
| **Reliability**     | Error handling, recovery mechanisms, availability, failover, data backup                       |
| **Maintainability** | Code quality, test coverage, technical debt, documentation, dependency health                  |

**Example Response:**

```
Assess:
- Security (critical for user data)
- Performance (API must be fast)
- Reliability (99.9% uptime requirement)

Skip maintainability for now
```

### 3. Provide NFR Thresholds

TEA will use specific thresholds for each category, preferably from PRD, architecture, or `test-design`.

**Critical Principle: Never guess thresholds.**

If you don't know the exact requirement, tell TEA to mark it as UNKNOWN/CONCERNS and request clarification from stakeholders.

#### Security Thresholds

**Example:**

```
Requirements:
- All endpoints require authentication: YES
- Data encrypted at rest: YES (PostgreSQL TDE)
- Zero critical vulnerabilities: YES (npm audit)
- Input validation on all endpoints: YES (Zod schemas)
- Security headers configured: YES (helmet.js)
```

#### Performance Thresholds

**Example:**

```
Requirements:
- API response time P99: < 200ms
- API response time P95: < 150ms
- Throughput: > 1000 requests/second
- Frontend initial load: < 2 seconds
- Database query time P99: < 50ms
```

#### Reliability Thresholds

**Example:**

```
Requirements:
- Error handling: All endpoints return structured errors
- Availability: 99.9% uptime
- Recovery time: < 5 minutes (RTO)
- Data backup: Daily automated backups
- Failover: Automatic with < 30s downtime
```

#### Maintainability Thresholds

**Example:**

```
Requirements:
- Test coverage: > 80%
- Code quality: SonarQube grade A
- Documentation: All APIs documented
- Dependency age: < 6 months outdated
- Technical debt: < 10% of codebase
```

### 4. Provide Evidence

TEA will ask where to find evidence for each requirement.

**Evidence Sources:**

| Category        | Evidence Type         | Location                                     |
| --------------- | --------------------- | -------------------------------------------- |
| Security        | Security scan reports | `/reports/security-scan.pdf`                 |
| Security        | Vulnerability scan    | `npm audit` output, or your scanner's report |
| Security        | Auth test results     | Test reports showing auth coverage           |
| Performance     | Load test results     | `/reports/k6-load-test.json`                 |
| Performance     | APM data              | Datadog, New Relic dashboards                |
| Performance     | Lighthouse scores     | `/reports/lighthouse.json`                   |
| Reliability     | Error rate metrics    | Production monitoring dashboards             |
| Reliability     | Uptime data           | StatusPage, PagerDuty logs                   |
| Maintainability | Coverage reports      | `/reports/coverage/index.html`               |
| Maintainability | Code quality          | SonarQube dashboard                          |

**Example Response:**

```
Evidence:
- Security: npm audit results (clean), auth tests 15/15 passing
- Performance: k6 load test at /reports/k6-results.json
- Reliability: Error rate 0.01% in staging (logs in Datadog)

Don't have:
- Uptime data (new system, no baseline)
- Mark as CONCERNS and request monitoring setup
```

### 5. Review NFR Evidence Audit Report

TEA generates a comprehensive evidence audit report.

#### Evidence Audit Report (`nfr-assessment.md`):

````markdown
# NFR Evidence Audit

**Date:** 2026-01-13
**Epic:** User Profile Management
**Release:** v1.2.0
**Overall Decision:** CONCERNS ⚠️

## Executive Summary

| Category        | Status      | Critical Issues |
| --------------- | ----------- | --------------- |
| Security        | PASS ✅     | 0               |
| Performance     | CONCERNS ⚠️ | 2               |
| Reliability     | PASS ✅     | 0               |
| Maintainability | PASS ✅     | 0               |

**Decision Rationale:**
Performance metrics below target (P99 latency, throughput). Mitigation plan in place. Security and reliability meet all requirements.

---

## Security Assessment

**Status:** PASS ✅

### Requirements Met

| Requirement              | Target         | Actual              | Status |
| ------------------------ | -------------- | ------------------- | ------ |
| Authentication required  | All endpoints  | 100% enforced       | ✅     |
| Data encryption at rest  | PostgreSQL TDE | Enabled             | ✅     |
| Critical vulnerabilities | 0              | 0                   | ✅     |
| Input validation         | All endpoints  | Zod schemas on 100% | ✅     |
| Security headers         | Configured     | helmet.js enabled   | ✅     |

### Evidence

**Security Scan:**

```bash
$ npm audit
found 0 vulnerabilities
```

**Authentication Tests:**

- 15/15 auth tests passing
- Tested unauthorized access (401 responses)
- Token validation working

**Penetration Testing:**

- Report: `/reports/pentest-2026-01.pdf`
- Findings: 0 critical, 2 low (addressed)

**Conclusion:** All security requirements met. No blockers.

---

## Performance Assessment

**Status:** CONCERNS ⚠️

### Requirements Status

| Metric           | Target     | Actual  | Status     |
| ---------------- | ---------- | ------- | ---------- |
| API response P99 | < 200ms    | 350ms   | ❌ Exceeds |
| API response P95 | < 150ms    | 180ms   | ⚠️ Exceeds |
| Throughput       | > 1000 rps | 850 rps | ⚠️ Below   |
| Frontend load    | < 2s       | 1.8s    | ✅ Met     |
| DB query P99     | < 50ms     | 85ms    | ❌ Exceeds |

### Issues Identified

#### Issue 1: P99 Latency Exceeds Target

**Measured:** 350ms P99 (target: <200ms)
**Root Cause:** Database queries not optimized

- Missing indexes on profile queries
- N+1 query problem in profile endpoint

**Impact:** User experience degraded for 1% of requests

**Mitigation Plan:**

- Add composite index on `(user_id, profile_id)` - backend team, 2 days
- Refactor profile endpoint to use joins instead of multiple queries - backend team, 3 days
- Re-run load tests after optimization - QA team, 1 day

**Owner:** Backend team lead
**Deadline:** Before release (January 20, 2026)

#### Issue 2: Throughput Below Target

**Measured:** 850 rps (target: >1000 rps)
**Root Cause:** Connection pool size too small

- PostgreSQL max_connections = 100 (too low)
- No connection pooling in application

**Impact:** System cannot handle expected traffic

**Mitigation Plan:**

- Increase PostgreSQL max_connections to 500 - DevOps, 1 day
- Implement connection pooling with pg-pool - backend team, 2 days
- Re-run load tests - QA team, 1 day

**Owner:** DevOps + Backend team
**Deadline:** Before release (January 20, 2026)

### Evidence

**Load Testing:**

```
Tool: k6
Duration: 10 minutes
Virtual Users: 500 concurrent
Report: /reports/k6-load-test.json
```

**Results:**

```
scenarios: (100.00%) 1 scenario, 500 max VUs, 10m30s max duration
     ✓ http_req_duration..............: avg=250ms min=45ms med=180ms max=2.1s p(90)=280ms p(95)=350ms
     http_reqs......................: 85000 (850/s)
     http_req_failed................: 0.1%
```

**APM Data:**

- Tool: Datadog
- Dashboard: <https://app.datadoghq.com/dashboard/abc123>

**Conclusion:** Performance issues identified with mitigation plan. Re-assess after optimization.

---

## Reliability Assessment

**Status:** PASS ✅

### Requirements Met

| Requirement    | Target            | Actual           | Status |
| -------------- | ----------------- | ---------------- | ------ |
| Error handling | Structured errors | 100% endpoints   | ✅     |
| Availability   | 99.9% uptime      | 99.95% (staging) | ✅     |
| Recovery time  | < 5 min (RTO)     | 3 min (tested)   | ✅     |
| Data backup    | Daily             | Automated daily  | ✅     |
| Failover       | < 30s downtime    | 15s (tested)     | ✅     |

### Evidence

**Error Handling Tests:**

- All endpoints return structured JSON errors
- Error codes standardized (400, 401, 403, 404, 500)
- Error messages user-friendly (no stack traces)

**Chaos Engineering:**

- Tested database failover: 15s downtime ✅
- Tested service crash recovery: 3 min ✅
- Tested network partition: Graceful degradation ✅

**Monitoring:**

- Staging uptime (30 days): 99.95%
- Error rate: 0.01% (target: <0.1%)
- P50 availability: 100%

**Conclusion:** All reliability requirements exceeded. No issues.

---

## Maintainability Assessment

**Status:** PASS ✅

### Requirements Met

| Requirement           | Target     | Actual          | Status |
| --------------------- | ---------- | --------------- | ------ |
| Test coverage         | > 80%      | 85%             | ✅     |
| Code quality          | Grade A    | Grade A         | ✅     |
| Documentation         | All APIs   | 100% documented | ✅     |
| Outdated dependencies | < 6 months | 3 months avg    | ✅     |
| Technical debt        | < 10%      | 7%              | ✅     |

### Evidence

**Test Coverage:**

```
Statements   : 85.2% ( 1205/1414 )
Branches     : 82.1% ( 412/502 )
Functions    : 88.5% ( 201/227 )
Lines        : 85.2% ( 1205/1414 )
```

**Code Quality:**

- SonarQube: Grade A
- Maintainability rating: A
- Technical debt ratio: 7%
- Code smells: 12 (all minor)

**Documentation:**

- API docs: 100% coverage (OpenAPI spec)
- README: Complete and up-to-date
- Architecture docs: ADRs for all major decisions

**Conclusion:** All maintainability requirements met. Codebase is healthy.

---

## Overall Gate Decision

### Decision: CONCERNS ⚠️

**Rationale:**

- **Blockers:** None
- **Concerns:** Performance metrics below target (P99 latency, throughput)
- **Mitigation:** Plan in place with clear owners and deadlines (5 days total)
- **Passing:** Security, reliability, maintainability all green

### Actions Required Before Release

1. **Optimize database queries** (backend team, 3 days)
   - Add indexes
   - Fix N+1 queries
   - Implement connection pooling

2. **Re-run performance tests** (QA team, 1 day)
   - Validate P99 < 200ms
   - Validate throughput > 1000 rps

3. **Update this audit** (TEA, 1 hour)
   - Re-run `nfr-assess` with new evidence
   - Confirm PASS status

### Waiver Option (If Business Approves)

If business decides to deploy with current performance:

**Waiver Justification:**

```markdown
## Performance Waiver

**Waived By:** VP Engineering, Product Manager
**Date:** 2026-01-15
**Reason:** Business priority to launch by Q1
**Conditions:**

- Set monitoring alerts for P99 > 300ms
- Plan optimization for v1.3 (February release)
- Document known performance limitations in release notes

**Accepted Risk:**

- 1% of users experience slower response (350ms vs 200ms)
- System can handle current traffic (850 rps sufficient for launch)
- Optimization planned for next release
```

### Approvals

- [ ] Product Manager - Review business impact
- [ ] Tech Lead - Review mitigation plan
- [ ] QA Lead - Validate test evidence
- [ ] DevOps - Confirm infrastructure ready

---

## Monitoring Plan Post-Release

**Performance Alerts:**

- P99 latency > 400ms (critical)
- Throughput < 700 rps (warning)
- Error rate > 1% (critical)

**Review Cadence:**

- Daily: Check performance dashboards
- Weekly: Review alert trends
- Monthly: Re-audit NFR evidence
````

## What You Get

### NFR Evidence Audit Report

- Category-by-category analysis (Security, Performance, Reliability, Maintainability)
- Requirements status (target vs actual)
- Evidence for each requirement
- Issues identified with root cause analysis

### Gate Decision

- **PASS** ✅ - All NFRs met, ready to release
- **CONCERNS** ⚠️ - Some NFRs not met, mitigation plan exists
- **FAIL** ❌ - Critical NFRs not met, blocks release
- **WAIVED** ⏭️ - Business-approved waiver with documented risk

### Mitigation Plans

- Specific actions to address concerns
- Owners and deadlines
- Re-audit criteria

### Monitoring Plan

- Post-release monitoring strategy
- Alert thresholds
- Review cadence

## Tips

### Plan NFRs Early, Audit Evidence Later

**Phase 2 (Enterprise):**
Define NFR requirements in the PRD so `test-design` can:

- Identify NFR requirements early
- Plan for performance testing
- Budget for security audits
- Set up monitoring infrastructure

**Phase 3:**
Run `test-design` to turn NFRs into thresholds, planned validation, and expected evidence.

**Phase 4 or Gate:**
Run `nfr-assess` before release to audit the evidence.

### Never Guess Thresholds

If you don't know the NFR target:

**Don't:**

```text
API response time should probably be under 500ms
```

**Do:**

```text
Mark as CONCERNS - Request threshold from stakeholders
"What is the acceptable API response time?"
```

### Collect Evidence Beforehand

Gather evidence before you run `nfr-assess`. TEA's `framework` workflow generates no security, load, or coverage scripts, so the list below describes evidence shapes to locate rather than commands to paste.

Two commands need no setup in an npm project:

```bash
npm audit      # dependency vulnerabilities
npm outdated   # dependency freshness
```

Everything else depends on your stack:

| Category        | Evidence shape                      | Typical source                                        |
| --------------- | ----------------------------------- | ----------------------------------------------------- |
| Security        | Vulnerability scan output           | `npm audit`, or the scanner your org already runs     |
| Security        | Auth and authorization test results | Your existing suite, filtered to auth specs           |
| Performance     | Load test report                    | k6, Artillery, or JMeter run against a staging deploy |
| Performance     | Frontend performance scores         | A Lighthouse run, manual or in CI                     |
| Performance     | Database query timings              | Slow-query log, `EXPLAIN ANALYZE`, or APM traces      |
| Reliability     | Error rate, uptime, incident MTTR   | Production monitoring over the last 30 days           |
| Maintainability | Coverage report                     | Your test runner's coverage flag                      |
| Maintainability | Lint or code-quality report         | Your linter, or SonarQube                             |

Give TEA the path to each artifact. For anything you cannot produce, say so: TEA marks that category CONCERNS and records what is missing rather than guessing a value.

### Use Real Data, Not Assumptions

**Don't:**

```
System is probably fast enough
Security seems fine
```

**Do:**

```
Load test results show P99 = 350ms
npm audit shows 0 vulnerabilities
Test coverage report shows 85%
```

Evidence-based decisions prevent surprises in production.

### Document Waivers Thoroughly

If business approves waiver:

**Required:**

- Who approved (name, role, date)
- Why (business justification)
- Conditions (monitoring, future plans)
- Accepted risk (quantified impact)

**Example:**

```markdown
Waived by: CTO, VP Product (2026-01-15)
Reason: Q1 launch critical for investor demo
Conditions: Optimize in v1.3, monitor closely
Risk: 1% of users experience 350ms latency (acceptable for launch)
```

### Re-Assess After Fixes

After implementing mitigations:

```
1. Fix performance issues
2. Run load tests again
3. Run nfr-assess with new evidence
4. Verify PASS status
```

Don't deploy with CONCERNS without mitigation or waiver.

### Integrate with Release Checklist

```markdown
## Release Checklist

### Pre-Release

- [ ] All tests passing
- [ ] Test coverage > 80%
- [ ] Run nfr-assess
- [ ] NFR status: PASS or WAIVED

### Performance

- [ ] Load tests completed
- [ ] P99 latency meets threshold
- [ ] Throughput meets threshold

### Security

- [ ] Security scan clean
- [ ] Auth tests passing
- [ ] Penetration test complete

### Post-Release

- [ ] Monitoring alerts configured
- [ ] Dashboards updated
- [ ] Incident response plan ready
```

## Common Issues

### No Evidence Available

**Problem:** Don't have performance data, security scans, etc.

**Solution:**

```
Mark as CONCERNS for categories without evidence
Document what evidence is needed
Set up tests/scans before re-audit
```

**Don't block on missing evidence** - document what's needed and proceed.

### Thresholds Too Strict

**Problem:** Can't meet unrealistic thresholds.

**Symptoms:**

- P99 < 50ms (impossible for complex queries)
- 100% test coverage (impractical)
- Zero technical debt (unrealistic)

**Solution:**

```
Negotiate thresholds with stakeholders:
- "P99 < 50ms is unrealistic for our DB queries"
- "Propose P99 < 200ms based on industry standards"
- "Show evidence from load tests"
```

Use data to negotiate realistic requirements.

### Audit Takes Too Long

**Problem:** Gathering evidence for all categories is time-consuming.

**Solution:** Focus on critical categories first:

**For most projects:**

```
Priority 1: Security (always critical)
Priority 2: Performance (if high-traffic)
Priority 3: Reliability (if uptime critical)
Priority 4: Maintainability (nice to have)
```

Assess categories incrementally, not all at once.

### CONCERNS vs FAIL - When to Block?

**CONCERNS** ⚠️:

- Issues exist but not critical
- Mitigation plan in place
- Business accepts risk (with waiver)
- Can deploy with monitoring

**FAIL** ❌:

- Critical security vulnerability (CVE critical)
- System unusable (error rate >10%)
- Data loss risk (no backups)
- Zero mitigation possible

**Rule of thumb:** If you can mitigate or monitor, use CONCERNS. Reserve FAIL for absolute blockers.

## Related Guides

- [How to Run Trace](/docs/how-to/workflows/run-trace.md) - Gate decision complements NFR
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md) - Quality complements NFR
- [Run TEA for Enterprise](/docs/how-to/brownfield/use-tea-for-enterprise.md) - Enterprise workflow

## Understanding the Concepts

- [Risk-Based Testing](/docs/explanation/risk-based-testing.md) - Risk assessment principles
- [TEA Overview](/docs/explanation/tea-overview.md) - NFR in release gates

## Reference

- [Command: nfr-assess](/docs/reference/commands.md#nfr-assess) - Full command reference
- [TEA Configuration](/docs/reference/configuration.md) - Enterprise config options
