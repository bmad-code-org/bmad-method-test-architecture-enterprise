---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted:
  - 'step-01-detect-mode'
  - 'step-02-load-context'
  - 'step-03-risk-and-testability'
  - 'step-04-coverage-plan'
  - 'step-05-generate-output'
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T21:35:04-05:00'
runScope: 'epic'
runKey: 'epic-9'
inputDocuments:
  - 'docs/epics/epic-9-last-sync-indicator.md'
  - '_bmad/config.toml'
  - '../bmod-tea/knowledge/tea-index.csv'
  - '../bmod-tea/knowledge/risk-governance.md'
  - '../bmod-tea/knowledge/probability-impact.md'
  - '../bmod-tea/knowledge/test-levels-framework.md'
  - '../bmod-tea/knowledge/test-priorities-matrix.md'
  - '../bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 9: Show the last successful sync time on the technician home screen

**Date:** 2026-10-09
**Author:** tea-eval-harness
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 9. The plan covers initial rendering, conditional visibility, event-driven refresh, feature-flag rollback, and the stated local and read-only constraints.

**Risk Summary:**

- Total risks identified: 3
- High-priority risks with score 6 or greater: 0
- Critical categories: BUS and TECH
- Highest score: 4

**Coverage Summary:**

- P0 scenarios: 0
- P1 scenarios: 8, with about 24 to 40 hours of effort
- P2 scenarios: 0
- P3 scenarios: 0
- **Total effort:** About 24 to 40 hours, or about 0.75 to 1.25 engineer-weeks

The three risks are medium priority. Each can break the epic's central freshness signal or its rollout control. The epic documents asking dispatch over the radio as a limited manual workaround for freshness uncertainty.

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Sync-engine correctness before it writes `lastSuccessfulSyncAt` | Epic 9 consumes an existing field and does not change sync execution or persistence. | Run the sync engine's existing regression suite. Use seeded successful-sync timestamps for Epic 9 tests. |
| Backend services and remote sync APIs | The epic adds no network call and changes no remote contract. | Integration coverage must prove zero new network calls from the home-screen feature. Existing service tests remain authoritative. |
| Home-screen functions unrelated to the new row | The epic adds one row to an established screen. | Run the existing home-screen regression suite and compare guarded states with the approved prior-screen baseline. |
| Test implementation | This workflow produces test design only. | Generate or implement tests through a separately authorized follow-on workflow after the application and test harness are available. |

---

## Risk Assessment

### High-Priority Risks (Score 6 or Greater)

No high-priority risks were identified from the supplied epic.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |

### Medium-Priority Risks (Score 3 to 4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| R-001 | BUS | The relative-time calculation can show an incorrect age for the latest successful sync. Technicians could receive a misleading freshness signal. Story 9.1 and acceptance criterion 1 require the most recent successful sync to appear as relative time. | 2 | 2 | 4 | Use deterministic clock-based unit coverage for the formatter, verify the store boundary, and confirm the visible result through one end-to-end journey. | Development and QA |
| R-002 | BUS | The visibility guard can render a row for a never-synced device or leave changed home-screen output when the feature flag is disabled. Story 9.1 and acceptance criteria 2 and 4 require no row for an absent value and the exact previous screen when `home_last_sync_row` is off. | 2 | 2 | 4 | Exercise present, absent, flag-enabled, and flag-disabled states. Compare guarded states with the approved prior-screen baseline. | Development and QA |
| R-003 | TECH | The open home screen can miss or mishandle the existing completion event and continue showing stale data after a successful sync. Story 9.2 and acceptance criterion 3 require an update when sync completes while the screen is open. | 2 | 2 | 4 | Seed an older value, store a newer successful value, publish one completion event, and verify one refresh without reload, polling, or timers. | Development and QA |

### Low-Priority Risks (Score 1 to 2)

No low-priority risks were identified from the supplied epic.

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| --- | --- | --- | ---: | ---: | ---: | --- |

### Residual Risk

The plan cannot quantify an unchanged render budget because the epic supplies no numeric budget or baseline. Relative-time boundary and localization rules are also unstated. These gaps remain clarification items until the existing formatter contract or product rules are identified.

### Risk Category Legend

- **TECH**: Technical or architecture flaws, integration failures, and scalability concerns
- **SEC**: Security controls, authorization, authentication, and data exposure
- **PERF**: Performance degradation, resource limits, and service-level violations
- **DATA**: Data loss, corruption, and inconsistency
- **BUS**: User experience, business logic, and revenue impact
- **OPS**: Deployment, configuration, rollout, and monitoring

---

## NFR Planning

**Purpose:** This section defines epic-specific thresholds, planned validation, and the evidence expected by a later NFR assessment. Final evidence status belongs to that later workflow.

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security and privacy | The row adds no personal data and displays only the device's own relative sync time to the device holder. | Constraint regression | Inspect rendered content and verify its sole data source is `lastSuccessfulSyncAt`. | Component and E2E reports plus rendered-screen artifact |
| Performance | Exactly one local key lookup; zero network calls; zero new stored fields; zero writes; zero timers; zero polling; unchanged existing render budget. | Constraint regression | Use store, network, and timer spies. Compare rendering with the established baseline. | Spy output and before-and-after render metrics |
| Reliability | One successful-sync completion event refreshes the open screen to the newest stored value. | R-003 | Publish the existing completion event under deterministic state and observe one refresh. | Integration report, E2E report, and event/store trace |
| Data integrity | Initial render and event refresh leave settings, orders, and queue data unchanged. | Constraint regression | Record state before and after the feature path and fail on any write call. | Store write-spy output and state comparison |
| Operations | Disabling `home_last_sync_row` restores the previous home screen exactly. | R-002 | Exercise enabled and disabled states with a stored timestamp present. | Flag matrix and zero-difference structural or visual comparison |
| Scalability | The change remains local and adds no remote or persistent workload. | Constraint regression | Verify zero network and storage additions through instrumentation and code review. | Network/store spy output and review record |
| Maintainability | Changed formatter, visibility, store-read, and event-refresh code reaches at least 80% coverage until a stronger project rule is supplied. | R-001, R-002, R-003 | Collect changed-code coverage in CI. | Coverage report |
| Compliance | No compliance requirement is stated for this epic. | N/A | N/A | N/A |

**Unknown thresholds:** The numeric home-screen render budget and its baseline are unknown. Project-specific coverage rules are unavailable. The exact relative-time boundaries and localization rules need either an existing shared formatter contract or product clarification.

---

## Entry Criteria

- [ ] Epic 9 implementation is deployed in a testable environment.
- [ ] The existing unit, component, integration, and E2E harnesses are available, or equivalent levels are mapped to the established project stack.
- [ ] Tests can seed and inspect `lastSuccessfulSyncAt` without altering production data.
- [ ] Tests can enable and disable `home_last_sync_row` deterministically.
- [ ] The successful-sync completion event can be published deterministically in integration and E2E environments.
- [ ] A fixed clock or equivalent time-control seam is available.
- [ ] The existing relative-time formatter contract is identified, or product rules for boundaries and localization are approved.
- [ ] The prior home-screen structural or visual baseline is approved.
- [ ] The current render baseline or budget is recorded for quantitative performance comparison.

## Exit Criteria

- [ ] Every mapped acceptance-criteria scenario passes.
- [ ] P0 pass rate is 100%. This plan contains no P0 scenarios.
- [ ] P1 pass rate is at least 95%. With eight scenarios, all eight must pass to meet the threshold.
- [ ] No open severity 1 or severity 2 defect affects Epic 9.
- [ ] Every risk has passing planned coverage or an approved waiver with owner and expiry.
- [ ] Changed-code coverage is at least 80%, subject to any stronger project rule.
- [ ] Structural evidence confirms zero unexpected writes, network calls, timers, polling loops, and stored fields.
- [ ] Disabled-flag and never-synced screens have zero unintended differences from their approved baselines.
- [ ] Evidence is retained for every in-scope NFR category. Final NFR status is deferred to the NFR assessment workflow.

---

## Test Coverage Plan

P0, P1, P2, and P3 describe priority. Execution timing is defined separately in the Execution Strategy.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

No P0 scenarios are justified by the supplied epic. The feature is read-only, local, feature-flagged, and supported by the documented radio workflow when freshness is uncertain.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |

**Total P0:** 0 tests, no effort allocated

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 9.1-UNIT-001: Calculate relative time from a successful-sync timestamp using a fixed current time and the approved unit boundaries. | Unit | R-001 | 1 | Development | Unit level isolates the formatter and makes time boundaries deterministic. Failure misleads technicians. Radio contact with dispatch is the source-supported limited workaround. |
| 9.1-INT-001: Read the present `lastSuccessfulSyncAt` key once and expose the newest stored successful timestamp to the home-screen row. | Integration | R-001 | 1 | Development | Integration level verifies the settings-store boundary. Assert zero writes, zero new fields, and zero network calls. Failure produces an incorrect or absent signal. Radio confirmation is the limited workaround. |
| 9-E2E-001: Open the technician home screen with a successful sync recorded and observe the relative-time row from the latest stored completion. | E2E | R-001 | 1 | QA | E2E level verifies user-visible wiring and presentation. Lower-level tests own formatter branches. Failure breaks the epic's central outcome. Radio confirmation is the limited workaround. |
| 9.1-COMP-001: Render the established home screen with no sync row when the flag is enabled and `lastSuccessfulSyncAt` is absent. | Component | R-002 | 1 | Development | Component level isolates the absence guard and verifies the rest of the screen structure. Failure confuses never-synced users. Asking dispatch is the limited workaround. |
| 9.1-COMP-002: Render the exact established home screen with no sync row when a timestamp exists and `home_last_sync_row` is disabled. | Component | R-002 | 1 | Development | Component level isolates the flag guard. Use the approved structural or visual baseline. Failure breaks the documented rollback control. The source provides no alternate rollback path. |
| 9-E2E-002: Disable `home_last_sync_row` with a stored timestamp present and compare the home screen with the approved prior-screen baseline. | E2E | R-002 | 1 | QA | E2E level verifies organization-level rollout control and final appearance. Component coverage owns the visibility branches. Failure removes the documented rollback mechanism. The source gives no alternate flag rollback path. |
| 9.2-INT-001: While the screen remains mounted, store a newer successful timestamp, publish the existing completion event once, and refresh the displayed value once. | Integration | R-003 | 1 | Development | Integration level verifies the event, store, and view-model boundary. Assert zero reloads, timers, and polling loops. Failure leaves stale status. Radio confirmation is the limited workaround. |
| 9-E2E-003: Keep the technician home screen open, complete a successful sync, and observe the row change to the new relative time without reload. | E2E | R-003 | 1 | QA | E2E level validates the full technician-visible refresh path. Integration coverage owns event mechanics. Failure leaves the visible signal stale. Radio confirmation is the limited workaround. |

**Total P1:** 8 tests, about 24 to 40 hours

All three primary risks are P1. Each can break the epic's central user signal or its rollout control. The documented radio fallback preserves essential operations with material friction, which supports P1 classification.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

No independent P2 behavior is supported by the supplied requirements.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |

**Total P2:** 0 tests, no effort allocated

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

No independent P3 behavior is supported by the supplied requirements.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |

**Total P3:** 0 tests, no effort allocated

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer work only when infrastructure or duration makes pull-request execution impractical.

- **Pull request:** Run all Unit, Component, Integration, and E2E scenarios, plus store, network, timer, and write-spy assertions. If Playwright is the established E2E runner, use parallel execution with a target duration of 10 to 15 minutes. Use equivalent parallelism for another established runner.
- **Nightly:** Run the complete feature-flag and stored-state matrix, the approved visual comparison, and the render-performance comparison after a baseline exists.
- **Weekly:** No additional long-running suite is justified by the supplied local-only scope. Revisit this when broader implementation context supplies a relevant performance, burn-in, or device-lab suite.

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours per Test | Total Hours | Notes |
| --- | ---: | --- | --- | --- |
| P0 | 0 | N/A | N/A | No qualifying scenarios |
| P1 | 8 | About 3 to 5 hours | About 24 to 40 hours | Includes harness discovery, deterministic clock and state setup, visual baseline integration, implementation, and stabilization |
| P2 | 0 | N/A | N/A | No qualifying scenarios |
| P3 | 0 | N/A | N/A | No qualifying scenarios |
| **Total** | **8** | **N/A** | **About 24 to 40 hours** | **About 0.75 to 1.25 engineer-weeks** |

The range assumes access to the existing home-screen harness, local settings-store seam, sync event contract, feature-flag fixture, and prior-screen baseline. Missing seams or baseline approval may extend the timeline.

### Prerequisites

**Test Data:**

- Device-state fixture with present and absent `lastSuccessfulSyncAt` values
- Deterministic timestamps for initial and newer successful syncs
- Feature-flag fixture for organization-level enabled and disabled states
- Approved prior home-screen structural or visual baseline

**Tooling:**

- Existing project unit and component runner with fixed-clock support
- Existing integration harness with observable store reads, writes, events, network calls, timers, and polling
- Existing E2E runner for technician-visible flows and screen artifacts
- Existing coverage collector for changed-code reporting

**Environment:**

- Testable technician home screen with deterministic local settings state
- Deterministic successful-sync completion event publication
- Organization-scoped feature-flag control
- Stable environment for render-baseline comparison

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100%. This plan contains no P0 scenarios.
- **P1 pass rate:** At least 95%. Eight planned scenarios make every failure release-significant and require triage or an approved waiver.
- **P2/P3 pass rate:** At least 90%. This plan contains no P2 or P3 scenarios.
- **High-risk mitigations:** 100% complete or covered by approved waivers. No score 6 or greater risk is currently identified.

### Coverage Targets

- **Acceptance criteria:** 100% mapped to automated scenarios
- **Canonical risks:** 100% mapped to a suitable lower-level test and a user-visible test
- **Changed code:** At least 80%, subject to a stronger project rule
- **Security and privacy constraint:** 100% of added row content verified
- **Structural constraints:** 100% of stated zero-addition and read-only assertions verified

### Non-Negotiable Requirements

- [ ] Every acceptance-criteria scenario passes or has an approved waiver with owner, rationale, and expiry.
- [ ] No high-risk item remains unmitigated.
- [ ] `home_last_sync_row` disabled produces zero unintended structural or visual differences from the approved prior screen.
- [ ] The feature performs zero unexpected writes, network calls, timer registrations, polling loops, and stored-field additions.
- [ ] Planned NFR evidence exists for every in-scope category. Final NFR disposition is recorded through the NFR assessment workflow.

---

## Mitigation Plans

### R-001: Incorrect Relative-Time Value (Score: 4)

**Mitigation Strategy:** Use a fixed clock, cover approved relative-time boundaries in a unit test, verify the existing store key through integration, and confirm one technician-visible path through E2E.

**Owner:** Development and QA

**Timeline:** Before merge for Unit and Integration coverage; before the release candidate for E2E coverage

**Status:** Planned

**Verification:** `9.1-UNIT-001`, `9.1-INT-001`, and `9-E2E-001` pass with retained reports.

### R-002: Incorrect Conditional Visibility or Rollback (Score: 4)

**Mitigation Strategy:** Cover the absence and feature-flag guards at Component level. Verify never-synced and disabled-flag device states through E2E. Compare the disabled state with the approved prior-screen baseline.

**Owner:** Development and QA

**Timeline:** Before the release candidate

**Status:** Planned

**Verification:** `9.1-COMP-001`, `9.1-COMP-002`, and `9-E2E-002` pass with zero unintended baseline differences.

### R-003: Stale Value After In-Session Sync (Score: 4)

**Mitigation Strategy:** Exercise the existing completion event against seeded old and new values. Verify one refresh while mounted. Reject reload, timer, and polling behavior through spies.

**Owner:** Development and QA

**Timeline:** Before the release candidate

**Status:** Planned

**Verification:** `9.2-INT-001` and `9-E2E-003` pass with event and store traces retained.

---

## Assumptions and Dependencies

### Assumptions

1. The implementation uses the existing `lastSuccessfulSyncAt` key and the existing sync-completion event named by the epic.
2. The established application stack provides test seams for local state, feature flags, time, and event publication.
3. Existing home-screen tests or artifacts can establish the prior-screen baseline.

### Dependencies

1. Existing application source and test harness access is required before test implementation begins.
2. A deterministic settings-store fixture and completion-event seam are required before Integration and E2E automation begins.
3. The shared relative-time formatter contract or approved product rules are required before boundary assertions are finalized.
4. The approved prior-screen baseline is required before exact rollback comparison is finalized.
5. A render baseline or numeric budget is required before quantitative performance sign-off.

### Risks to Plan

- **Risk:** The supplied project fixture contains requirements and configuration only.
  - **Impact:** Framework-specific commands, fixture APIs, selectors, and current coverage cannot be confirmed.
  - **Contingency:** Preserve these framework-neutral scenarios and map them to the established project harness when implementation context becomes available.
- **Risk:** Relative-time boundaries and localization rules are unstated.
  - **Impact:** Exact expected strings near unit transitions remain unresolved.
  - **Contingency:** Use an existing shared formatter contract. Escalate for product clarification when no contract exists.
- **Risk:** The render budget has no numeric threshold.
  - **Impact:** Structural performance constraints can be enforced now. Quantitative regression status remains unresolved.
  - **Contingency:** Capture and approve the current home-screen baseline before release sign-off.

---

## Follow-on Workflows (Manual)

- Run `/bmad-testarch-atdd` if failing acceptance scaffolds are explicitly requested.
- Run `/bmad-testarch-automate` to implement broader coverage after the application and test harness are available.
- Run the NFR assessment workflow after implementation evidence exists.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned. Date: Pending
- [ ] Tech Lead: Unassigned. Date: Pending
- [ ] QA Lead: Unassigned. Date: Pending

**Comments:** Pending team review.

---

## Interworking & Regression

| Service or Component | Impact | Regression Scope |
| --- | --- | --- |
| Technician home screen | Adds one conditionally rendered relative-time row. | Existing layout, navigation, other fields, accessibility, and approved visual baseline remain unchanged in never-synced and flag-disabled states. |
| Local settings store | Reads the existing `lastSuccessfulSyncAt` key. | Existing read behavior passes. No write, schema change, new key, order mutation, queue mutation, or settings mutation occurs. |
| Sync engine completion event | Reuses the event already consumed by the progress spinner. | Existing spinner behavior passes. One successful completion refreshes the row once while the screen remains open. |
| `home_last_sync_row` feature flag | Controls organization-level rollout and rollback. | Enabled and disabled targeting works. Disabled state matches the prior home screen exactly. |

Cross-team coordination is limited to confirming the sync event fixture, feature-flag fixture, relative-time formatter contract, and prior-screen baseline with their current owners.

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk classification and governance
- `probability-impact.md`: Probability, impact, and score definitions
- `test-levels-framework.md`: Test-level selection
- `test-priorities-matrix.md`: P0 through P3 prioritization
- `nfr-criteria.md`: NFR planning and evidence criteria

### Related Documents

- PRD: N/A by run configuration
- Epic: `docs/epics/epic-9-last-sync-indicator.md`
- Architecture: N/A by run configuration
- Tech Spec: N/A by run configuration

---

**Generated by:** BMad TEA Agent: Test Architect Module
**Workflow:** `bmad-testarch-test-design`
**Version:** 5.0
