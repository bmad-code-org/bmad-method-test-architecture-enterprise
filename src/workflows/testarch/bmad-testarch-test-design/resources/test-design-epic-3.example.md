---
runScope: 'epic-level'
runKey: 'epic-3-team-invitations'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted:
  ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-08-17'
---

# Test Design: Epic 3: Team Invitations and Role Changes

**Date:** 2026-08-17
**Author:** Priya Nair
**Status:** Draft for approval

## Executive Summary

**Scope:** Epic-level test design for inviting members, accepting invitations, changing roles, and recording the resulting audit events.

**Risk Summary:**

- Total risks identified: 7
- High risks with score 6 or greater: 3
- Critical categories: Security, Data Integrity, Business Impact

**Coverage Summary:**

- P0: 4 scenarios
- P1: 6 scenarios
- P2: 5 scenarios
- P3: 2 scenarios
- Total: 17 scenarios, estimated at 41 to 63 hours across 1.5 to 2.5 weeks

Risk score determines the required governance action. Test priority is assigned separately from business criticality, user impact, workaround availability, and execution value. For example, R-005 scores 3 while its audit-event scenario is P1 because missing actor and role history has compliance impact; the score does not hold it at P2 or P3 automatically.

## Not in Scope

| Item                          | Reasoning                                                                            | Mitigation                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| SCIM provisioning             | Owned by Epic 7 and uses a separate identity-provider contract                       | Keep existing SCIM regression suite required on release branches                     |
| Billing seat reconciliation   | The invitation flow emits a membership event; billing consumption is owned by Epic 4 | Contract-test the event schema here and trace billing behavior in Epic 4             |
| Email provider deliverability | Provider-level inbox placement is outside application control                        | Validate accepted request, template payload, retry behavior, and provider receipt ID |

## Risk Assessment

### High Risks: Score 6 or Greater

| Risk ID | Category | Description                                                                                | Probability | Impact | Score | Mitigation                                                                                  | Owner           | Timeline                       |
| ------- | -------- | ------------------------------------------------------------------------------------------ | ----------: | -----: | ----: | ------------------------------------------------------------------------------------------- | --------------- | ------------------------------ |
| R-001   | SEC      | A project administrator can grant Owner privileges or change a member outside their tenant |           3 |      3 |     9 | Enforce tenant-scoped authorization and an immutable Owner policy at the API boundary       | Identity team   | Before implementation complete |
| R-002   | DATA     | Retrying an invitation acceptance creates two memberships or consumes two seats            |           2 |      3 |     6 | Use invitation-token idempotency and a unique tenant-user membership constraint             | Membership team | Before API tests activate      |
| R-003   | BUS      | An expired or revoked invitation remains usable                                            |           2 |      3 |     6 | Validate status and expiry in the acceptance transaction, then consume the token atomically | Membership team | Before implementation complete |

### Medium Risks: Score 3 to 4

| Risk ID | Category | Description                                                             | Probability | Impact | Score | Mitigation                                                      | Owner           |
| ------- | -------- | ----------------------------------------------------------------------- | ----------: | -----: | ----: | --------------------------------------------------------------- | --------------- |
| R-004   | OPS      | Email-provider retries send duplicate invitation messages               |           2 |      2 |     4 | Persist the provider receipt and deduplicate by invitation ID   | Platform team   |
| R-005   | DATA     | Audit records omit the actor, old role, or new role                     |           1 |      3 |     3 | Emit the audit event in the same transaction as the role update | Membership team |
| R-007   | PERF     | Bulk invitation creation exceeds the accepted latency or throughput SLO |           2 |      2 |     4 | Define the SLO, then validate it at the approved concurrency    | Platform team   |

### Low Risks: Score 1 to 2

| Risk ID | Category | Description                                                       | Probability | Impact | Score | Action                                       |
| ------- | -------- | ----------------------------------------------------------------- | ----------: | -----: | ----: | -------------------------------------------- |
| R-006   | BUS      | A long display name wraps poorly in the pending-invitations table |           1 |      2 |     2 | Monitor and cover with a component edge case |

### Risk Category Legend

- **TECH**: Technical or architecture risk
- **SEC**: Security and authorization risk
- **PERF**: Performance and resource risk
- **DATA**: Data integrity and consistency risk
- **BUS**: Business and user-impact risk
- **OPS**: Deployment, configuration, and operational risk

## NFR Planning

This plan names future evidence. Final PASS, CONCERNS, and FAIL decisions belong to `nfr-assess` after implementation evidence exists.

| NFR Domain      | Requirement or Threshold                                                                                    | Risk Link    | Planned Validation                                         | Evidence Needed                    |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- | ---------------------------------- |
| Security        | Tenant isolation on every invitation and role endpoint; Owner privilege cannot be granted through this epic | R-001        | API authorization matrix plus denied cross-tenant E2E path | API report, E2E trace, SAST report |
| Performance     | UNKNOWN: no accepted latency or throughput threshold exists for bulk invitation creation                    | R-007        | Clarify SLO, then run k6 at the approved concurrency       | Approved SLO and k6 report         |
| Reliability     | Provider retry must create one logical invitation and at most one membership                                | R-002, R-004 | API idempotency tests and 10-iteration burn-in             | JUnit results and burn-in report   |
| Maintainability | Membership module line coverage at least 80%; no duplicated role-policy implementation                      | R-001, R-005 | Coverage report and static duplication analysis            | LCOV and duplication report        |

**Unknown thresholds:** Bulk invitation latency and throughput. Product and Platform must agree on the SLO before performance evidence can be scored.

## Entry Criteria

- [ ] Acceptance criteria and role matrix approved by Product, Identity, and Membership owners
- [ ] Tenant and membership factories support automatic cleanup
- [ ] Email provider stub exposes deterministic success and retry outcomes
- [ ] Test environment has two isolated tenants and seeded Owner accounts
- [ ] R-001 authorization policy implemented before its P0 tests are activated

## Exit Criteria

- [ ] All P0 tests pass
- [ ] P1 pass rate is at least 95%, with failures triaged
- [ ] No open critical or high-severity defect
- [ ] Every score-6-or-greater mitigation is complete or has a stakeholder-approved waiver
- [ ] Evidence source identified for each of the four NFR domains

## Test Coverage Plan

P0, P1, P2, and P3 describe priority. Execution timing is defined separately below. Risk score is a supporting signal and never assigns priority by itself.

### P0: Critical

**Criteria:** The scenario protects a core authorization or membership-integrity path, has no safe workaround, and a failure would block release.

| Test ID   | Requirement                                                | Test Level | Risk Link    | Notes                            |
| --------- | ---------------------------------------------------------- | ---------- | ------------ | -------------------------------- |
| 3-API-001 | Reject a role change for a member in another tenant        | API        | R-001        | Direct tenant-boundary proof     |
| 3-API-002 | Reject granting Owner through the role-change endpoint     | API        | R-001        | Immutable Owner policy           |
| 3-API-003 | Accepting the same invitation twice creates one membership | API        | R-002        | Concurrent duplicate submissions |
| 3-E2E-001 | Invited member accepts once and enters the correct tenant  | E2E        | R-002, R-003 | Core user journey                |

**Total P0:** 4 scenarios, about 14 to 20 hours

### P1: High

**Criteria:** Important common workflows, integration boundaries, and high-impact error handling with a workable recovery path.

| Test ID    | Requirement                                                  | Test Level  | Risk Link | Notes                          |
| ---------- | ------------------------------------------------------------ | ----------- | --------- | ------------------------------ |
| 3-E2E-002  | Administrator invites a new Member and sees Pending status   | E2E         | R-004     | One browser happy path         |
| 3-API-004  | Reject an expired invitation token                           | API         | R-003     | Boundary time fixed by fixture |
| 3-API-005  | Reject a revoked invitation token                            | API         | R-003     | No membership created          |
| 3-API-006  | Retry after provider timeout returns the original invitation | API         | R-004     | Idempotency by invitation ID   |
| 3-INT-001  | Role update emits actor, tenant, old role, and new role      | Integration | R-005     | Audit event contract           |
| 3-COMP-001 | Role selector hides Owner and disables the current Owner     | Component   | R-001     | User-level interaction API     |

**Total P1:** 6 scenarios, about 16 to 24 hours

### P2: Medium

**Criteria:** Secondary workflows and bounded edge cases whose failure has a practical workaround.

| Test ID    | Requirement                                                | Test Level | Risk Link | Notes                              |
| ---------- | ---------------------------------------------------------- | ---------- | --------- | ---------------------------------- |
| 3-API-007  | Cancel a pending invitation                                | API        | R-003     | Subsequent acceptance rejected     |
| 3-API-008  | Resend reuses the logical invitation and rotates the token | API        | R-004     | Old token becomes invalid          |
| 3-COMP-002 | Invalid email displays field-level guidance                | Component  | None      | Atomic validation behavior         |
| 3-COMP-003 | Pending invitation table handles long names                | Component  | R-006     | Layout at supported small viewport |
| 3-UNIT-001 | Invitation expiry comparison handles the exact boundary    | Unit       | R-003     | Fake clock, no wall-clock wait     |

**Total P2:** 5 scenarios, about 8 to 14 hours

### P3: Low

**Criteria:** Exploratory checks and benchmarks that inform future optimization.

| Test ID    | Requirement                                   | Test Level  | Risk Link | Notes                                   |
| ---------- | --------------------------------------------- | ----------- | --------- | --------------------------------------- |
| 3-EXP-001  | Keyboard-only review of the invitation dialog | Exploratory | None      | Record accessibility observations       |
| 3-PERF-001 | Establish a provisional bulk-invite baseline  | Performance | R-007     | Informational until the SLO is approved |

**Total P3:** 2 scenarios, about 3 to 5 hours

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests when the suite remains below 15 minutes. Defer only work with material infrastructure or duration cost.

- **Pull request:** All API, E2E, integration, component, and unit scenarios. Playwright runs in parallel with a target duration below 15 minutes.
- **Nightly:** Ten-iteration idempotency burn-in and email-provider retry suite.
- **Weekly:** Provisional k6 baseline and keyboard-only exploratory session.

## Resource Estimates

| Priority  | Scenarios | Estimate           | Complexity Drivers                               |
| --------- | --------: | ------------------ | ------------------------------------------------ |
| P0        |         4 | 14 to 20 hours     | Two-tenant setup, concurrency, authorization     |
| P1        |         6 | 16 to 24 hours     | Provider stub, audit event capture, browser path |
| P2        |         5 | 8 to 14 hours      | Boundary fixtures and component states           |
| P3        |         2 | 3 to 5 hours       | Benchmark setup and exploratory recording        |
| **Total** |    **17** | **41 to 63 hours** | **About 1.5 to 2.5 weeks**                       |

### Prerequisites

**Test data:**

- Tenant, user, invitation, and membership factories with override support and automatic cleanup
- Fixed-time fixture for expiry boundaries

**Tooling:**

- Playwright for API, E2E, and component coverage
- Vitest for membership-policy unit coverage
- k6 for the provisional performance baseline

**Environment:**

- Two isolated tenants
- Server-side email provider stub with retry controls
- Audit event sink readable by the integration suite

## Quality Gate Criteria

- P0 pass rate: 100%
- P1 pass rate: at least 95%
- Overall oracle coverage: at least 80%
- High-risk mitigations: complete before release or covered by an approved human waiver
- Security scenarios: 100% passing
- NFR evidence: source identified for Security, Performance, Reliability, and Maintainability
- Final NFR status: deferred to `nfr-assess`

## Mitigation Plans

### R-001: Cross-Tenant or Owner Privilege Escalation, Score 9

**Strategy:** Centralize the role policy, enforce tenant scope from the authenticated subject, reject Owner mutation, and log denied attempts.
**Owner:** Identity team
**Timeline:** Before implementation complete
**Status:** In progress
**Verification:** `3-API-001`, `3-API-002`, and `3-COMP-001`

### R-002: Duplicate Membership on Retried Acceptance, Score 6

**Strategy:** Consume the token and insert membership in one transaction with a unique constraint; return the existing membership on an identical retry.
**Owner:** Membership team
**Timeline:** Before API tests activate
**Status:** Planned
**Verification:** `3-API-003` under concurrent submission and `3-E2E-001`

### R-003: Expired or Revoked Token Accepted, Score 6

**Strategy:** Lock the invitation row, validate status and expiry, then consume it atomically.
**Owner:** Membership team
**Timeline:** Before implementation complete
**Status:** Planned
**Verification:** `3-API-004`, `3-API-005`, and `3-UNIT-001`

## Assumptions and Dependencies

### Assumptions

1. The role matrix in `docs/security/team-role-matrix.md` is the approved authority.
2. Invitation email content is localized by the provider adapter after receiving structured template data.
3. Audit event delivery is synchronous with the membership transaction.

### Dependencies

1. Identity team publishes the tenant-scope middleware contract before P0 automation starts.
2. Platform team provides deterministic provider retry controls before nightly automation starts.
3. Product and Platform approve a bulk-invite SLO before performance can receive a final status.

### Risk to the Plan

- **Risk:** The provider stub cannot reproduce a timeout after accepting a request.
  - **Impact:** R-004 retry behavior cannot be proved deterministically.
  - **Contingency:** Add a controllable fault mode to the adapter test server before implementing `3-API-006`.

## Follow-on Workflows

- Run `/bmad-testarch-atdd` explicitly for the four P0 scenarios.
- Run `/bmad-testarch-automate` for the remaining functional coverage after implementation exists.
- Run `/bmad-testarch-nfr` when evidence exists for all four NFR domains.
- Run `/bmad-testarch-trace` to map the approved oracle and apply the release gate.

## Approval

- [ ] Product Manager: Elena Ruiz, Date pending
- [ ] Tech Lead: Marcus Chen, Date pending
- [ ] QA Lead: Priya Nair, Date pending

## Interworking and Regression

| Service or Component | Impact                                               | Regression Scope                            |
| -------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Identity middleware  | Supplies tenant and actor claims                     | Existing tenant-isolation API suite         |
| Membership service   | Creates memberships and changes roles                | Membership CRUD and unique-constraint tests |
| Email adapter        | Sends, retries, and deduplicates invitation messages | Provider adapter contract suite             |
| Audit service        | Records invitations and role changes                 | Audit schema and event-consumer regression  |

## Appendix

### Knowledge Base References

- [risk-governance.md](./knowledge/risk-governance.md)
- [probability-impact.md](./knowledge/probability-impact.md)
- [test-levels-framework.md](./knowledge/test-levels-framework.md)
- [test-priorities-matrix.md](./knowledge/test-priorities-matrix.md)
- [nfr-criteria.md](./knowledge/nfr-criteria.md)

### Related Documents

- PRD: `docs/prd/collaboration.md`
- Epic: `docs/epics/epic-3-team-invitations.md`
- Architecture: `docs/architecture/membership-service.md`
- Role matrix: `docs/security/team-role-matrix.md`

**Generated by:** BMad TEA Agent, Test Architect Module
**Workflow:** `bmad-testarch-test-design`
**Version:** 4.0
