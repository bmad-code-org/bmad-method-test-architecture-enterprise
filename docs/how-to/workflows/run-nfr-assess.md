---
title: 'How to Run NFR Evidence Audit with TEA'
description: Audit non-functional requirement evidence for security, performance, reliability, and maintainability using TEA
---

# How to Run NFR Evidence Audit with TEA

Use TEA's `nfr-assess` skill to audit non-functional requirement (NFR) evidence across security, performance, reliability, and maintainability.

Use `test-design` before implementation to define NFR thresholds, planned validation, and expected evidence.
Use `nfr-assess` after evidence exists to decide PASS/CONCERNS/FAIL, or N/A for findings that do not apply.

## When to Use This

- Enterprise projects with compliance requirements
- Projects with strict NFR thresholds
- Before production release
- After tests, scans, metrics, logs, monitoring data, or CI reports exist

## Prerequisites

- NFRs defined in PRD, requirements doc, architecture, or `test-design`
- Evidence sources available or explicitly missing (test results, security scans, performance metrics, logs, dashboards, CI reports)

You can run the audit without complete evidence.
TEA will mark categories as CONCERNS where evidence is missing and document what's needed.

## Steps

<a id="1-run-the-nfr-evidence-audit-workflow"></a>

### 1. Run the NFR Evidence Audit Skill

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-nfr`
- **Codex:** `$bmad-testarch-nfr`
- **Inside a `/bmad-tea` chat:** `NR`

Full invocation rules: [Invoking a TEA Skill](/docs/reference/commands.md#invoking-a-tea-skill).

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

```text
Assess:
- Security (critical for user data)
- Performance (API must be fast)
- Reliability (99.9% uptime requirement)

Skip maintainability for now
```

### 3. Provide NFR Thresholds

TEA will use specific thresholds for each category, preferably from PRD, architecture, or `test-design`.

Use agreed thresholds for every judgment.

If you don't know the exact requirement, tell TEA to mark it as UNKNOWN/CONCERNS and request clarification from stakeholders.

#### Security Thresholds

**Example:**

```text
Requirements:
- All endpoints require authentication: YES
- Data encrypted at rest: YES (PostgreSQL TDE)
- Zero critical vulnerabilities: YES (npm audit)
- Input validation on all endpoints: YES (Zod schemas)
- Security headers configured: YES (helmet.js)
```

#### Performance Thresholds

**Example:**

```text
Requirements:
- API response time P99: < 200ms
- API response time P95: < 150ms
- Throughput: > 1000 requests/second
- Frontend initial load: < 2 seconds
- Database query time P99: < 50ms
```

#### Reliability Thresholds

**Example:**

```text
Requirements:
- Error handling: All endpoints return structured errors
- Availability: 99.9% uptime
- Recovery time: < 5 minutes (RTO)
- Data backup: Daily automated backups
- Failover: Automatic with < 30s downtime
```

#### Maintainability Thresholds

**Example:**

```text
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

```text
Evidence:
- Security: npm audit results (clean), auth tests 15/15 passing
- Performance: k6 load test at /reports/k6-results.json
- Reliability: Error rate 0.01% in staging (logs in Datadog)

Don't have:
- Uptime data (new system, no baseline)
- Mark as CONCERNS and request monitoring setup
```

### 5. Review NFR Evidence Audit Report

TEA writes the evidence audit report to `{test_artifacts}/nfr/nfr-assessment-{run_key}.md`.
The `run_key` is `epic-{epic_num}` or `story-{story_key}` for the epic or story you audited, and `system` for a project-wide audit, so an audit of one epic never overwrites another's.

#### Evidence Audit Report (`nfr/nfr-assessment-{run_key}.md`):

```markdown
# NFR Evidence Audit

**Date:** 2026-01-13
**Scope:** User Profile Management
**Overall decision:** FAIL

| Category        | Status   | Evidence                                                  |
| --------------- | -------- | --------------------------------------------------------- |
| Security        | PASS     | Dependency scan, auth tests, penetration-test report      |
| Performance     | FAIL     | k6 results and database query timings                     |
| Reliability     | CONCERNS | Recovery and error-rate evidence; uptime baseline missing |
| Maintainability | PASS     | Coverage and code-quality reports                         |

## Security Assessment

Auth tests: 15/15 pass, including unauthorized access and token validation.
The security scan reports zero critical vulnerabilities.
The penetration-test report is `reports/pentest-2026-01.pdf`; its two low findings are resolved.

## Performance Assessment

| Metric        | Target    | Actual  | Status         |
| ------------- | --------- | ------- | -------------- |
| API P99       | <200ms    | 350ms   | Exceeds target |
| API P95       | <150ms    | 180ms   | Exceeds target |
| Throughput    | >1000 rps | 850 rps | Below target   |
| Frontend load | <2s       | 1.8s    | Met            |
| DB query P99  | <50ms     | 85ms    | Exceeds target |

The query trace shows missing indexes and an N+1 query in the profile endpoint.
The backend lead owns the fix: add the index and batch the queries by January 20.
QA will rerun the same load test before the next audit.
The four breached thresholds make Performance and the overall decision FAIL.
Record any release approval separately; mitigations leave the audit status unchanged.

## Reliability Assessment

Recovery test: 4 minutes against a 5-minute RTO.
Staging error rate: 0.01% during the recorded load test.
The uptime baseline is missing, so Reliability is CONCERNS.
Link the recovery report and measurement window in the evidence record.

## Maintainability Assessment

Coverage: 85% against the project's 80% threshold.
Code quality: SonarQube grade A.
Link both reports at the revision being audited.

## Monitoring Plan

Alert on P99 above 400ms, throughput below 700 rps, or error rate above 1%.
The backend lead checks dashboards daily until the next load test and NFR audit.
```

## What You Get

### NFR Evidence Audit Report

- Category-by-category analysis (Security, Performance, Reliability, Maintainability)
- Requirements with targets and measured results
- Evidence for each requirement
- Issues identified with root cause analysis
- A Gate YAML snippet carrying the overall status, the eight ADR checklist categories, and an `audited_domains` block with one status per domain

The `audited_domains` block is what a pipeline reads.
It carries the same status the domain's `## <Domain> Assessment` section states, because the two are one judgment written twice: one for a machine, one for a person.

```yaml
nfr_assessment:
  audited_domains:
    security: 'PASS'
    performance: 'FAIL'
    reliability: 'CONCERNS'
    maintainability: 'PASS'
  overall_status: 'FAIL'
```

A domain is PASS, CONCERNS or FAIL, and N/A only when nothing in it carried a judgment.

### Gate Decision

- **PASS** ✅: Applicable NFR thresholds met, backed by evidence
- **CONCERNS** ⚠️: Thresholds met with caveats, trending toward a limit, or supporting evidence missing
- **FAIL** ❌: A threshold breached, or a vulnerability or defect blocks confidence
- **N/A**: No applicable findings in the domain

A business-approved waiver belongs in a separate release record with its accepted risk and conditions.
It leaves the audit status unchanged.

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

When a threshold is unknown, record UNKNOWN/CONCERNS and ask the responsible stakeholder for the target.
For example, ask for the API's acceptable P99 response time.

### Collect Evidence Beforehand

Gather evidence before you run `nfr-assess`.
Use your project's scanners, load tests, and coverage tools to produce the reports below.

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

Give TEA the path to each artifact.
TEA records missing evidence as CONCERNS and names what is needed.

### Use Real Data, Not Assumptions

Name the measurement and its source: "k6 report: P99 350ms" or "dependency scan: zero critical findings." Record the test environment and measurement period so reviewers can assess what the evidence proves.

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

```text
1. Fix performance issues
2. Run load tests again
3. Run nfr-assess with new evidence
4. Verify PASS status
```

Resolve findings or obtain release approval under your team's policy before deployment.
Record any accepted risk separately from the audit verdict.

### Integrate with Release Checklist

```markdown
## Release Checklist

### Pre-Release

- [ ] All tests passing
- [ ] Test coverage > 80%
- [ ] Run nfr-assess
- [ ] NFR audit status recorded: PASS, CONCERNS, FAIL, or N/A
- [ ] Release approval recorded, with any accepted risk and waiver conditions

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

Don't have performance data, security scans, etc.

```text
Mark as CONCERNS for categories without evidence
Document what evidence is needed
Set up tests/scans before re-audit
```

Complete the audit with missing evidence recorded as CONCERNS.
Resolve the gap or obtain approval under your release policy before shipping.

### Thresholds Too Strict

Bring measured results to the stakeholder who owns the requirement.
Agree on any revised target and document why it changed before rerunning the audit.

### Audit Takes Too Long

Gathering evidence for all categories is time-consuming.

Focus on critical categories first:

**For most projects:**

```text
Priority 1: Security (always critical)
Priority 2: Performance (if high-traffic)
Priority 3: Reliability (if uptime critical)
Priority 4: Maintainability (nice to have)
```

Audit the highest-risk categories first, then complete the remaining evidence.

### CONCERNS vs FAIL: When to Block?

Use the requirement's agreed threshold and evidence to decide the status.
A breached threshold is FAIL.
CONCERNS applies when a threshold is met with caveats, trends toward a limit, or supporting evidence is missing.
An unknown threshold or missing measurement is CONCERNS.
Record mitigations and release approval separately; they leave the audit verdict unchanged.

## Related Guides

- [How to Run Trace](/docs/how-to/workflows/run-trace.md): Gate decision complements NFR
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md): Quality complements NFR
- [Run TEA for Enterprise](/docs/how-to/brownfield/use-tea-for-enterprise.md): Enterprise skill

## Understanding the Concepts

- [Risk-Based Testing](/docs/explanation/risk-based-testing.md): Risk assessment principles
- [TEA Overview](/docs/explanation/tea-overview.md): NFR in release gates

## Reference

- [Command: nfr-assess](/docs/reference/commands.md#nfr-assess): Full command reference
- [TEA Configuration](/docs/reference/configuration.md): Enterprise config options
