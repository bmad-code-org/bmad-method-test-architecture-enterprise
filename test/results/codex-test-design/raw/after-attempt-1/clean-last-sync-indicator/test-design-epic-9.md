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
lastSaved: '2026-10-09T20:48:39-0500'
runScope: 'epic'
runKey: 'epic-9'
inputDocuments:
  - 'field-sync-indicator/_bmad/config.toml'
  - 'field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 9, Show the last successful sync time on the technician home screen

**Date:** 2026-10-09
**Author:** tea-eval-harness
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 9.

**Risk Summary:**

- Total risks identified: 3
- High-priority risks with scores of 6 or higher: 0
- Critical categories: Business behavior and performance evidence

**Coverage Summary:**

- P0 scenarios: 0, with 0 hours planned
- P1 scenarios: 17 checks across 5 coverage rows, with approximately 12 to 20 hours planned
- P2 and P3 scenarios: 8 checks across 2 coverage rows, with approximately 6 to 12 hours planned
- **Total effort:** Approximately 18 to 32 hours across 0.5 to 1 working week

The plan covers all four acceptance criteria. It also verifies the epic's local-only, read-only, event-driven, and feature-flag constraints.

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Sync engine correctness before it writes `lastSuccessfulSyncAt` | Epic 9 consumes an existing field and completion event. It does not change sync execution or persistence. | Run the sync engine's existing regression suite and use a controlled store fixture plus completion event in Epic 9 integration coverage. |
| Server, API, and external-service behavior | The epic adds zero network calls and defines a local device flow. | Instrument Epic 9 tests to prove zero new network activity. Existing service regression remains unchanged. |
| New storage schemas or migrations | The epic reads an existing key and stores no new data. | Verify zero storage writes and run existing settings-store regression coverage. |
| Unrelated home-screen features | The only UI change is one conditional row. | Run the existing home-screen regression suite and compare the flag-off screen with the previous structure or approved baseline. |

---

## Risk Assessment

### High-Priority Risks, Score 6 or Higher

No high-priority risks were identified. The feature is informational, dispatch remains a manual freshness-check workaround, and the existing feature flag provides operational recovery.

### Medium-Priority Risks, Scores 3 to 4

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | BUS | The home screen can show an incorrect or stale latest-sync value, causing a technician to act on an inaccurate freshness signal. Stories 9.1 and 9.2 require the latest `lastSuccessfulSyncAt` value and an update from the existing completion event. | 2 | 2 | 4 | Cover store hydration, relative-time boundaries, latest-value selection, and event-driven refresh. | Feature developer and QA | Before Epic 9 acceptance |
| R-002 | BUS | The sync row can appear before any successful sync or while `home_last_sync_row` is disabled. The acceptance criteria require row omission for never-synced devices and exact restoration of the previous screen when the flag is off. | 2 | 2 | 4 | Exercise absent-value and disabled-flag states. Add a structural or visual regression assertion for the flag-off screen. | Feature developer and QA | Before rollout enablement |

### Low-Priority Risks, Scores 1 to 2

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-003 | PERF | The stated unchanged render budget has no numeric baseline. A measurable home-screen regression could escape an objective gate. The epic specifies one local lookup, zero new network calls, zero new storage, and an unchanged existing render budget. | 2 | 1 | 2 | Prove the call-count and side-effect constraints. Capture the current render metric before implementation and use it as the comparison threshold. | Feature developer and QA | Before performance sign-off |

### Residual Risk

Radio confirmation and feature-flag rollback limit operational impact. The UI can still mislead technicians between release and rollback if R-001 or R-002 escapes. Render performance remains an evidence concern until the existing baseline is captured.

### Risk Category Legend

- **TECH:** Technical or architecture flaws, integration issues, and scalability limits
- **SEC:** Security controls, authorization, authentication, and data exposure
- **PERF:** Performance degradation, resource use, and response budgets
- **DATA:** Data loss, corruption, or inconsistency
- **BUS:** Business behavior, user experience, and logic failures
- **OPS:** Deployment, configuration, monitoring, and recovery controls

---

## NFR Planning

**Purpose:** Capture Epic 9 thresholds, planned validation, and evidence for a later `nfr-assess` run. Final NFR status depends on implementation evidence.

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security and privacy | Render only timestamp-derived sync text to the current device holder. Add zero personal data and zero network calls. | None. This is an already-satisfied epic constraint. | Component inspection plus an instrumented integration check of local-only access. | Component report and network call trace |
| Data integrity | Perform zero writes to settings, orders, or queue entries. | R-003 | Instrument store and data-layer calls during initial render and completion-event handling. | Integration call trace showing zero writes |
| Performance | Use one local-key lookup per read, zero new network calls, zero new storage, and preserve the existing home-screen render budget. | R-003 | Count calls and compare component render profiles with the captured baseline. | Call-count report and before-and-after render profile |
| Reliability | Update the open screen from the existing completion event with zero polling loops and zero timers. | R-001 | Publish the completion event in an integration test and observe the latest rendered value. Use a controlled clock to detect timer registration. | Deterministic event trace and integration test result |
| Operations | Turning `home_last_sync_row` off restores the previous home screen exactly. | R-002 | Run an end-to-end structural or visual comparison with the flag disabled. | Flag-off screenshot or structure snapshot plus test result |
| Maintainability | Reuse the existing settings-store and completion-event paths. Keep each behavior at the lowest sufficient test level. | R-001, R-002, R-003 | Review suite layering and CI traceability to requirement and risk IDs. | CI report with test IDs and risk links |

**Unknown thresholds:** The current home-screen render metric and maximum acceptable event-to-render latency are UNKNOWN. Capture the render baseline before performance sign-off. Treat event delivery as a deterministic functional requirement until the product defines a latency threshold.

Scalability and broader compliance validation are outside Epic 9. The epic adds no server load, new storage, personal-data flow, or regulatory workflow.

---

## Entry Criteria

- [ ] Epic 9 acceptance criteria and the documented constraints are accepted by Product, Development, and QA.
- [ ] A test build is available with `home_last_sync_row` configurable in the test organization.
- [ ] Fixtures can seed `lastSuccessfulSyncAt` as absent and as controlled past timestamps.
- [ ] The harness can publish the existing sync completion event while the home screen is open.
- [ ] The clock can be controlled for deterministic relative-time assertions.
- [ ] Store, network, storage, polling, and timer calls can be observed.
- [ ] The pre-change home-screen render baseline has been captured for supported target environments.

## Exit Criteria

- [ ] P0 pass rate is 100%. The current plan contains no P0 checks.
- [ ] P1 pass rate is at least 95%. With the current 17-check plan, all P1 checks must pass to meet this threshold.
- [ ] P2 and P3 pass rate is at least 90%.
- [ ] All four acceptance criteria have passing evidence.
- [ ] There are no open critical or high-severity Epic 9 defects.
- [ ] Zero new network calls, writes, storage, polling loops, or timers are observed in the Epic 9 path.
- [ ] The enabled row meets the captured home-screen render baseline.
- [ ] Evidence exists for every in-scope NFR category, ready for a later `nfr-assess` run.

---

## Test Coverage Plan

P0, P1, P2, and P3 identify test priority. Execution timing is defined separately in the Execution Strategy.

### P0, Critical

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score provides supporting evidence.

No P0 scenarios are planned. The indicator is informational, dispatch can confirm device freshness, and the feature flag provides rollback.

**Total P0:** 0 checks, 0 hours

### P1, High

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score provides supporting evidence.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 9.1-UNIT-001: Convert stored timestamps into relative text across just-now, minute, hour, day, and future-clock boundaries. | Unit | R-001 | 7 | Dev | Unit coverage isolates the time algorithm. Incorrect text gives technicians a false freshness signal. Dispatch confirmation adds delay and workload. |
| 9.1-COMP-001: Render the latest stored sync value as a timestamp-derived row. | Component | R-001 | 3 | Dev and QA | Component coverage establishes store-to-UI mapping, visibility, relative label output, and the privacy constraint. A wrong row misleads every technician using the screen. |
| 9.2-INT-001: Publish the existing completion event while the screen is open and observe the latest value with zero polling or timers. | Integration | R-001 | 3 | Dev and QA | This risk sits at the event, store, and component boundary. A missed update leaves the open screen stale until it is reopened. |
| 9.1-COMP-002: Omit the entire row when `lastSuccessfulSyncAt` is absent and preserve the rest of the screen. | Component | R-002 | 2 | Dev and QA | A false row communicates a sync that never occurred. Dispatch can verify status, though the screen remains misleading until rollback or repair. |
| 9.FF-E2E-001: Disable `home_last_sync_row` and compare the rendered home screen with the previous structure or approved baseline. | E2E | R-002 | 2 | QA | The recovery path is user-facing and needs full-screen validation. Failure leaves a new build as the remaining recovery option. |

**Total P1:** 17 checks, approximately 12 to 20 hours

### P2, Medium

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score provides supporting evidence.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | ---: | --- | --- |
| 9.NFR-INT-001: Instrument render and completion-event handling for one local-key lookup per read, zero writes, zero network calls, zero new storage, zero polling, and zero timers. | Integration | R-003 | 6 | Dev and QA | Boundary instrumentation directly verifies the epic's local-only and read-only controls. The feature flag provides a safe recovery path. |
| 9.NFR-COMP-001: Compare enabled-row render performance with the captured pre-change home-screen baseline. | Component | R-003 | 2 | Dev and QA | Component profiling isolates the added row from unrelated system load. Flag rollback limits user impact. |

**Total P2:** 8 checks, approximately 6 to 12 hours

### P3, Low

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score provides supporting evidence.

No P3 scenarios are planned. Every scenario verifies an acceptance criterion, a scored risk, or an explicit epic constraint.

**Total P3:** 0 checks, 0 hours

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Defer work with material infrastructure or duration cost.

- **Pull request:** Run all unit, component, integration, and functional end-to-end checks. Use the selected runner's worker parallelism. If Playwright is selected, parallelize independent specs and keep the target duration below 15 minutes.
- **Nightly:** Run render profiling across the supported target environment matrix and archive comparison artifacts.
- **Weekly:** No separate Epic 9 suite is planned because the feature adds no load, chaos, network, or large-dataset path.

---

## Resource Estimates

### Test Development Effort

| Priority | Planned checks | Effort range | Notes |
| --- | ---: | --- | --- |
| P0 | 0 | 0 hours | No P0 scenarios |
| P1 | 17 | Approximately 12 to 20 hours | Includes fixtures, controlled clock behavior, component coverage, event integration, and flag-off end-to-end validation |
| P2 | 8 | Approximately 6 to 12 hours | Includes instrumentation and render profiling setup |
| P3 | 0 | 0 hours | No P3 scenarios |
| **Total** | **25** | **Approximately 18 to 32 hours** | **Approximately 0.5 to 1 working week after prerequisites are ready** |

The range includes fixture setup, test implementation, debugging, review, and CI integration. The empty repository fixture increases uncertainty about the project's actual runner and reusable helpers.

### Prerequisites

**Test Data:**

- Local settings fixture with absent, recent, older, and future-skewed `lastSuccessfulSyncAt` values
- Completion-event fixture that updates the stored timestamp and publishes the existing event
- Controlled clock fixture for deterministic relative-time checks

**Tooling:**

- The project's component, integration, and end-to-end runner for UI and event-boundary coverage
- Call spies for settings-store, network, storage, polling, and timer activity
- A render profiler plus structural or visual comparison support

**Environment:**

- A test organization where `home_last_sync_row` can be enabled and disabled
- The supported device or runtime matrix used for home-screen render baselines

---

## Quality Gate Criteria

### Pass and Fail Thresholds

- **P0 pass rate:** 100%
- **P1 pass rate:** At least 95%, with waivers required for any failure
- **P2 and P3 pass rate:** At least 90%
- **High-risk mitigations:** 100% complete or covered by approved waivers. No score-6-or-higher risks are currently identified.

### Coverage Targets

- **Epic 9 acceptance criteria:** 100%
- **Identified risks:** 100%
- **Critical paths:** At least 80%
- **Epic-specific security and privacy constraints:** 100%
- **Business logic:** At least 70%
- **Edge cases:** At least 50%

### Non-Negotiable Requirements

- [ ] All P0 checks pass. The current plan contains no P0 checks.
- [ ] No score-6-or-higher risk remains unmitigated.
- [ ] All Epic 9 security and privacy control checks pass.
- [ ] The enabled row meets the captured home-screen render baseline.
- [ ] Instrumentation records zero new network calls, writes, storage, polling loops, and timers.
- [ ] Planned NFR evidence exists for every in-scope category, or `nfr-assess` records an approved concern or waiver after implementation evidence is available.

---

## Mitigation Plans

### R-001: Incorrect or stale sync freshness signal, Score 4

**Mitigation Strategy:** Cover timestamp conversion at unit level, store-to-row mapping at component level, and completion-event refresh at integration level. Keep the event trace and rendered assertion in the same test run.

**Owner:** Feature developer and QA

**Timeline:** Before Epic 9 acceptance

**Status:** Planned

**Verification:** 9.1-UNIT-001, 9.1-COMP-001, and 9.2-INT-001 pass with deterministic clocks and controlled timestamps.

### R-002: Incorrect conditional visibility or broken flag rollback, Score 4

**Mitigation Strategy:** Exercise the shared visibility guard with an absent timestamp and a disabled feature flag. Compare the flag-off screen with the previous structure or approved visual baseline.

**Owner:** Feature developer and QA

**Timeline:** Before rollout enablement

**Status:** Planned

**Verification:** 9.1-COMP-002 and 9.FF-E2E-001 pass.

### R-003: Unmeasured render-budget regression, Score 2

**Mitigation Strategy:** Capture the current home-screen render metric, verify the local-only and read-only call constraints, and compare the enabled row with that baseline across supported target environments.

**Owner:** Feature developer and QA

**Timeline:** Before performance sign-off

**Status:** Planned

**Verification:** 9.NFR-INT-001 and 9.NFR-COMP-001 pass, with archived call traces and profiler output.

---

## Assumptions and Dependencies

### Assumptions

1. The sync engine's existing `lastSuccessfulSyncAt` field represents only successful sync completion and already selects the latest completion.
2. The existing completion event is available to the home screen through the same path used by the progress spinner.
3. The selected test framework can control time and inspect local store interactions.

### Dependencies

1. Capture the pre-change home-screen render baseline before performance validation begins.
2. Provide a test organization with `home_last_sync_row` control before end-to-end validation begins.
3. Provide deterministic store and completion-event fixtures before component and integration work begins.
4. Preserve the prior home-screen structure or approved visual baseline for the rollback comparison.

### Risks to Plan

- **Risk:** The supplied project fixture contains no implementation, runner configuration, reusable fixtures, or existing tests.
  - **Impact:** Framework-specific setup and reuse cannot be estimated tightly from the available evidence.
  - **Contingency:** Adopt the project's established runner and helpers when implementation context becomes available, then revise the effort range before scheduling.

---

## Follow-on Workflows, Manual

- Run `/bmad-testarch-atdd` explicitly if the team decides to create failing acceptance tests from this plan.
- Run `/bmad-testarch-automate` explicitly after implementation exists to expand automation coverage.
- This workflow generated no tests.

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned. Date: Pending
- [ ] Tech Lead: Unassigned. Date: Pending
- [ ] QA Lead: Unassigned. Date: Pending

**Comments:** Pending team review.

---

## Interworking and Regression

| Service or Component | Impact | Regression Scope |
| --- | --- | --- |
| Home screen | Adds one conditional relative-time row. | Existing home-screen layout, navigation, accessibility, and flag-off structural or visual baseline must pass. |
| Local settings store | Reads the existing `lastSuccessfulSyncAt` key. | Existing read behavior must pass. Instrumentation must show zero writes from Epic 9. |
| Sync engine completion event | Triggers a row refresh while the screen is open. | Existing progress-spinner event behavior and the new row update must pass from the same published event. |
| `home_last_sync_row` feature flag | Controls organization-level exposure and rollback. | Existing flag evaluation plus enabled and disabled home-screen states must pass. |

No cross-team coordination is identified in the supplied epic. Coordinate with the owners of the settings store, sync completion event, and feature-flag release process if those components belong to separate teams.

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk classification and governance
- `probability-impact.md`: Probability, impact, and score definitions
- `test-levels-framework.md`: Test-level selection
- `test-priorities-matrix.md`: P0 through P3 prioritization
- `nfr-criteria.md`: NFR planning and evidence expectations

### Related Documents

- PRD: None supplied or required for this run
- Epic: `field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md`
- Architecture: None supplied or required for this run
- Tech Spec: None supplied or required for this run

---

**Generated by:** BMad TEA Agent, Test Architect Module

**Workflow:** `bmad-testarch-test-design`

**Version:** 5.0
