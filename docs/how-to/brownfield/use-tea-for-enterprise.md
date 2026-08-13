---
title: 'Running TEA for Enterprise Projects'
description: Use TEA with compliance, security, and regulatory requirements in enterprise environments
---

# Running TEA for Enterprise Projects

Use TEA on enterprise projects with compliance, security, audit, and regulatory requirements. This guide covers NFR planning, NFR Evidence Audit, audit trails, and evidence collection.

## When to Use This

- Enterprise track projects (not Quick Flow or simple BMad Method)
- Compliance requirements (SOC 2, HIPAA, GDPR, etc.)
- Security-critical applications (finance, healthcare, government)
- Audit trail requirements
- Strict NFR thresholds (performance, security, reliability)

## Prerequisites

- BMad installed with the Enterprise track selected
- Compliance requirements documented
- Stakeholders identified (who approves gates)

Every command below is a TEA workflow. On Codex, swap the leading `/` for `$`. Full invocation rules: [Invoking a TEA Workflow](/docs/reference/commands.md#invoking-a-tea-workflow).

## Enterprise-Specific TEA Workflows

### NFR Evidence Audit (`/bmad-testarch-nfr`)

**Purpose:** Audit implemented non-functional requirement evidence against defined thresholds. Compliance mandates the thresholds, certification needs the audit trail, and performance SLAs are contractual, so this workflow carries more weight on enterprise projects than elsewhere.

**When:** Release Gate, or earlier only when implementation evidence already exists. Use `test-design` in Phase 3 to plan NFR thresholds and evidence.

**What you give it:**

```text
Categories: Security, Performance, Reliability, Maintainability

Security thresholds:
- Zero critical vulnerabilities (required by SOC 2)
- All endpoints require authentication
- Data encrypted at rest (FIPS 140-2)
- Audit logging on all data access

Evidence:
- Security scan: reports/nessus-scan.pdf
- Penetration test: reports/pentest-2026-01.pdf
- Compliance audit: reports/soc2-evidence.zip
```

**Output:** NFR evidence audit with PASS/CONCERNS/FAIL for each category.

### Trace with Audit Evidence (`/bmad-testarch-trace`)

**Purpose:** Requirements traceability with an audit trail. Auditors, certification bodies, and regulators all ask for requirements-to-test mapping in a form they can read.

**When:** Phase 2 (baseline), Phase 4 (refresh), Release Gate

**What you give Phase 1:**

```text
Requirements: PRD.md (with compliance requirements)
Test location: tests/
```

Phase 1 produces `traceability-matrix.md` with the requirement-to-test mapping, compliance requirement coverage, gap prioritization, and recommendations.

Phase 2 produces `gate-decision-{gate_type}-{story_id}.md` with evidence references, approver signatures, a compliance checklist, and the decision rationale.

### Test Design with Compliance Focus (`/bmad-testarch-test-design`)

**Purpose:** Risk assessment with compliance and security focus. Security architecture has to line up, compliance requirements have to be testable, and performance requirements are contractual.

**When:** Phase 3 (system-level), Phase 4 (epic-level)

**What you give it:**

```text
Mode: System-level

Focus areas:
- Security architecture (authentication, authorization, encryption)
- Performance requirements (SLA: P99 <200ms)
- Compliance (HIPAA PHI handling, audit logging)
```

System-level mode produces two documents: `test-design-architecture.md` (security gaps, compliance requirements, performance SLOs, audit logging validation) for the Architecture team, and `test-design-qa.md` (security testing strategy, compliance test mapping, performance testing plan) for QA.

## Enterprise TEA Lifecycle

`research`, `prd`, and `architecture` are BMM workflows that ship with the BMad Method module, not with TEA. The `/bmad-testarch-*` commands are TEA.

### Phase 1: Discovery (Optional but Recommended)

Run the BMM `research` workflow on industry compliance (SOC 2, HIPAA, GDPR), security standards (OWASP Top 10), and performance benchmarks (industry P99).

### Phase 2: Planning (Required)

**1. Define NFRs early.** Run the BMM `prd` workflow and include security requirements (authentication, encryption), performance SLAs (response time, throughput), reliability targets (uptime, RTO, RPO), and compliance mandates (data retention, audit logs).

**2. Plan NFR evidence.** Run `/bmad-testarch-test-design` at system-level scope, focused on NFR thresholds, planned validation, and required evidence. It produces `test-design-architecture.md` and `test-design-qa.md` with thresholds and unknowns documented, planned evidence sources defined, and NFR coverage planned.

**3. Baseline (brownfield only).** Run `/bmad-testarch-trace` Phase 1 to establish baseline coverage before new work.

### Phase 3: Solutioning (Required)

**1. Architecture with testability review.** Run the BMM `architecture` workflow, then `/bmad-testarch-test-design` at system-level scope, focused on security architecture testability, performance testing strategy, and compliance requirement mapping.

**2. Test infrastructure.** Run `/bmad-testarch-framework`. Tell it you need separate test environments (dev, staging, prod-mirror), secure test data handling for PHI and PII, and audit logging in tests.

**3. CI/CD with compliance.** Run `/bmad-testarch-ci`. Tell it you need secrets management (Vault, AWS Secrets Manager), test isolation, artifact retention for the compliance audit trail, and access controls over who can run production tests.

### Phase 4: Implementation (Required)

Per epic:

1. `/bmad-testarch-test-design` at epic level, focused on compliance, security, and performance for this epic
2. `/bmad-testarch-atdd` (optional) to generate tests including security and compliance scenarios
3. A developer implements the story
4. `/bmad-testarch-automate` to expand coverage, including compliance edge cases
5. `/bmad-testarch-test-review` to audit quality (target above 80 per epic, rising to above 85 at release)
6. `/bmad-testarch-trace` Phase 1 to refresh coverage and verify compliance requirements are tested

### Release Gate (Required)

**1. Final NFR evidence audit.** Run `/bmad-testarch-nfr` across all categories that have evidence, using the latest performance tests and security scans.

**2. Final quality audit.** Run `/bmad-testarch-test-review` over the full suite, answering `tests/` for scope. Enterprise quality target: above 85.

**3. Gate decision.** Run `/bmad-testarch-trace` Phase 2. It needs `traceability-matrix.md` from Phase 1, `test-review.md` from the quality audit, `nfr-assessment.md` from the NFR evidence audit, and actual test execution results. Without execution results, Phase 2 is skipped. The decision is PASS, CONCERNS, FAIL, or WAIVED.

**4. Archive for audit.** Keep all test results, coverage reports, NFR evidence audits, gate decisions, and approver signatures for as long as your compliance regime requires (7 years for HIPAA).

## Enterprise-Specific Requirements

### Evidence Collection

**Required artifacts:**

- Requirements traceability matrix
- Test execution results (with timestamps)
- NFR evidence audit reports
- Security scan results
- Performance test results
- Gate decision records
- Approver signatures

**Storage:**

```text
compliance/
├── 2026-Q1/
│   ├── release-1.2.0/
│   │   ├── traceability-matrix.md
│   │   ├── test-review.md
│   │   ├── nfr-assessment.md
│   │   ├── gate-decision-release-v1.2.0.md
│   │   ├── test-results/
│   │   ├── security-scans/
│   │   └── approvals.pdf
```

**Retention:** 7 years (HIPAA), 3 years (SOC 2), per your compliance needs

### Approver Workflows

**Multi-level approval required:**

```markdown
## Gate Approvals Required

### Technical Approval

- [ ] QA Lead - Test coverage adequate
- [ ] Tech Lead - Technical quality acceptable
- [ ] Security Lead - Security requirements met

### Business Approval

- [ ] Product Manager - Business requirements met
- [ ] Compliance Officer - Regulatory requirements met

### Executive Approval (for major releases)

- [ ] VP Engineering - Overall quality acceptable
- [ ] CTO - Architecture approved for production
```

### Compliance Checklists

**SOC 2 Example:**

```markdown
## SOC 2 Compliance Checklist

### Access Controls

- [ ] All API endpoints require authentication
- [ ] Authorization tested for all protected resources
- [ ] Session management secure (token expiration tested)

### Audit Logging

- [ ] All data access logged
- [ ] Logs immutable (append-only)
- [ ] Log retention policy enforced

### Data Protection

- [ ] Data encrypted at rest (tested)
- [ ] Data encrypted in transit (HTTPS enforced)
- [ ] PII handling compliant (masking tested)

### Testing Evidence

- [ ] Test coverage >80% (verified)
- [ ] Security tests passing (100%)
- [ ] Traceability matrix complete
```

**HIPAA Example:**

```markdown
## HIPAA Compliance Checklist

### PHI Protection

- [ ] PHI encrypted at rest (AES-256)
- [ ] PHI encrypted in transit (TLS 1.3)
- [ ] PHI access logged (audit trail)

### Access Controls

- [ ] Role-based access control (RBAC tested)
- [ ] Minimum necessary access (tested)
- [ ] Authentication strong (MFA tested)

### Breach Notification

- [ ] Breach detection tested
- [ ] Notification workflow tested
- [ ] Incident response plan tested
```

## Enterprise Tips

### Start with Security

Security failures block everything else in enterprise, so make security requirements Priority 1:

1. Document all security requirements
2. Generate security tests with `/bmad-testarch-atdd`
3. Run the security test suite
4. Pass the security audit before moving forward

**Example: RBAC Testing**

**Vanilla Playwright:**

```typescript
test('should enforce role-based access', async ({ request }) => {
  // Login as regular user
  const userResp = await request.post('/api/auth/login', {
    data: { email: 'user@example.com', password: 'pass' },
  });
  const { token: userToken } = await userResp.json();

  // Try to access admin endpoint
  const adminResp = await request.get('/api/admin/users', {
    headers: { Authorization: `Bearer ${userToken}` },
  });

  expect(adminResp.status()).toBe(403); // Forbidden
});
```

**With Playwright Utils (Cleaner, Reusable):**

```typescript
import { test as base, expect } from '@playwright/test';
import { test as apiRequestFixture } from '@seontechnologies/playwright-utils/api-request/fixtures';
import { createAuthFixtures } from '@seontechnologies/playwright-utils/auth-session';
import { mergeTests } from '@playwright/test';

const authFixtureTest = base.extend(createAuthFixtures());
export const testWithAuth = mergeTests(apiRequestFixture, authFixtureTest);

testWithAuth('should enforce role-based access', async ({ apiRequest, authToken }) => {
  // Auth token from fixture (configured for 'user' role)
  const { status } = await apiRequest({
    method: 'GET',
    path: '/api/admin/users', // Admin endpoint
    headers: { Authorization: `Bearer ${authToken}` },
  });

  expect(status).toBe(403); // Regular user denied
});

testWithAuth('admin can access admin endpoint', async ({ apiRequest, authToken, authOptions }) => {
  // Override to admin role
  authOptions.userIdentifier = 'admin';

  const { status, body } = await apiRequest({
    method: 'GET',
    path: '/api/admin/users',
    headers: { Authorization: `Bearer ${authToken}` },
  });

  expect(status).toBe(200); // Admin allowed
  expect(body).toBeInstanceOf(Array);
});
```

**Note:** Auth-session requires provider setup in global-setup.ts. See [auth-session configuration](https://seontechnologies.github.io/playwright-utils/auth-session.html).

**Playwright Utils Benefits for Compliance:**

- Multi-user auth testing (regular, admin, etc.)
- Token persistence (faster test execution)
- Consistent auth patterns (audit trail)
- Automatic cleanup

### Set Higher Quality Thresholds

**Enterprise quality targets:**

- Test coverage: >85% (vs 80% for non-enterprise)
- Quality score: >85 (vs 75 for non-enterprise)
- P0 coverage: 100% (non-negotiable)
- P1 coverage: >95% (vs 90% for non-enterprise)

**Rationale:** Enterprise systems affect more users, higher stakes.

### Document Everything

**Auditors need:**

- Why decisions were made (rationale)
- Who approved (signatures)
- When (timestamps)
- What evidence (test results, scan reports)

**Use TEA's structured outputs:**

- Reports have timestamps
- Decisions have rationale
- Evidence is referenced
- Audit trail is automatic

### Schedule Compliance Testing Early

Penetration testing, security audits, and certification all have lead times measured in months (3 or more for SOC 2). Book them at the start of the project, not at the release gate.

### Use External Validators

**Don't self-certify:**

- Penetration testing: Hire external firm
- Security audits: Independent auditor
- Compliance: Certification body
- Performance: Load testing service

**TEA's role:** Prepare for external validation, don't replace it.

## Related Guides

**Workflow Guides:**

- [How to Run NFR Evidence Audit](/docs/how-to/workflows/run-nfr-assess.md) - Deep dive on evidence auditing
- [How to Run Trace](/docs/how-to/workflows/run-trace.md) - Gate decisions with evidence
- [How to Run Test Review](/docs/how-to/workflows/run-test-review.md) - Quality audits
- [How to Run Test Design](/docs/how-to/workflows/run-test-design.md) - Compliance-focused planning

**Use-Case Guides:**

- [Using TEA with Existing Tests](/docs/how-to/brownfield/use-tea-with-existing-tests.md) - Brownfield patterns

**Customization:**

- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md) - Production-ready utilities

## Understanding the Concepts

- [Engagement Models](/docs/explanation/engagement-models.md) - Enterprise model explained
- [Risk-Based Testing](/docs/explanation/risk-based-testing.md) - Probability × impact scoring
- [Test Quality Standards](/docs/explanation/test-quality-standards.md) - Enterprise quality thresholds
- [TEA Overview](/docs/explanation/tea-overview.md) - Complete TEA lifecycle

## Reference

- [TEA Command Reference](/docs/reference/commands.md) - All 9 workflows
- [TEA Configuration](/docs/reference/configuration.md) - Enterprise config options
- [Knowledge Base Index](/docs/reference/knowledge-base.md) - Testing patterns
- [Glossary](/docs/glossary/index.md#test-architect-tea-concepts) - TEA terminology
