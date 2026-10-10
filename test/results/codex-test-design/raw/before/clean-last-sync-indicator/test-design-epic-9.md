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
lastSaved: '2026-10-09'
inputDocuments:
  - 'field-sync-indicator/_bmad/config.toml'
  - 'field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 9: Show the last successful sync time on the technician home screen

**Date:** 2026-10-09  
**Author:** tea-eval-harness  
**Status:** Draft

---

## Executive Summary

**Scope:** Full epic-level test design for Epic 9. The plan covers reading `lastSuccessfulSyncAt`, relative-time rendering, the never-synced state, live refresh after a completion event, feature-flag rollback, and the epic's local-only constraints.

**Risk Summary:**

- Total risks identified: 8
- High-priority risks with score 6 or greater: 1
- Critical categories: TECH, DATA, and BUS
- Highest risk: R-002, stale display after a sync completes while the home screen remains open

**Coverage Summary:**

- P0 scenarios: 1, with about 3 to 6 hours of effort
- P1 scenarios: 7 coverage rows, with about 12 to 20 hours of effort
- P2 scenarios: 2 coverage rows, with about 8 to 14 hours of effort
- P3 scenarios: 0
- Total effort: about 23 to 40 hours, or about 0.5 to 1 engineer-week

The supplied repository contains requirements and TEA configuration only. It contains no implementation source, test harness, existing tests, or prior test-design artifacts. This plan therefore specifies runner-neutral coverage and records tooling selection as an implementation dependency.

---

## Not in Scope

| Item | Reasoning | Mitigation |
| --- | --- | --- |
| Sync engine correctness before it records a successful completion | Epic 9 consumes the existing timestamp and existing completion event. It does not change sync execution. | Existing sync-engine regression must prove that only successful syncs update `lastSuccessfulSyncAt` and publish the completion event. Epic 9 integration tests use a controlled store and publisher. |
| Network services and server APIs | The epic explicitly adds no network call. | Instrument feature tests to assert zero network activity. Retain the platform's existing API regression suite. |
| Feature-flag platform administration | `home_last_sync_row` already exists and the release process already controls it. | Test flag consumption on the home screen and require the established release process to validate organization targeting. |
| Broad home-screen behavior outside the new row | The epic adds one conditional row to an existing screen. | Run focused home-screen regression for neighboring content, layout, navigation, and the existing sync progress spinner. |
| Automated test implementation | This workflow produces the risk and coverage plan only. | Generate acceptance scaffolds through the separate ATDD workflow after the implementation test stack is available. |

---

## Risk Assessment

Probability and impact use a 1 to 3 scale. Score equals probability multiplied by impact. Scores of 6 or greater require mitigation evidence before release.

### High-Priority Risks, Score 6 or Greater

| Risk ID | Category | Description and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-002 | TECH | The displayed value could remain stale after a sync completes while the home screen stays open. Story 9.2 requires re-rendering from the existing sync completion event. | 2 | 3 | 6 | Mount the open screen with a controlled store and event publisher. Change the stored timestamp, publish one completion event, and verify one immediate update with no navigation, polling, or timer. | Mobile engineering and QA | Before merge |

### Medium-Priority Risks, Score 3 to 4

| Risk ID | Category | Description and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | BUS | Relative-time output could be wrong because of timestamp parsing, time-zone conversion, rounding, or future timestamp handling. Story 9.1 requires the stored value to render as a relative time such as "synced 4 minutes ago." | 2 | 2 | 4 | Use a fixed clock and table-driven formatter coverage across recent, old, boundary, future, and invalid timestamps. Verify the UI value against the stored timestamp. | Mobile engineering | Before merge |
| R-003 | BUS | A device with no stored value could show a placeholder, empty row, or layout residue. Story 9.1 requires the row to be absent and the rest of the screen unchanged. | 2 | 2 | 4 | Cover missing, null, and unreadable values at component level. Assert row absence and unchanged neighboring content. | Mobile engineering and QA | Before merge |
| R-004 | OPS | Turning `home_last_sync_row` off could leave markup, spacing, subscriptions, or store reads behind. The acceptance criteria require the previous home screen exactly. | 2 | 2 | 4 | Compare the disabled state with an approved pre-feature structural and visual baseline. Assert that feature-specific work is absent. | Mobile engineering and release QA | Before release |
| R-005 | DATA | Feature execution could mutate settings or sync state. The epic requires a read-only lookup and says no order, queue entry, or setting can be altered or lost. | 1 | 3 | 3 | Spy on store writes and compare relevant state before and after initial render and completion-event handling. | Mobile engineering | Before merge |
| R-006 | PERF | The implementation could add a network request, storage operation, polling loop, timer, repeated subscription, duplicate lookup, or measurable render regression. The epic defines each read as one local key lookup and says the existing render budget remains unchanged. The numeric tolerance is UNKNOWN. | 2 | 2 | 4 | Record a baseline, define a regression tolerance, and assert one read at mount, one re-read per completion event, zero network calls, zero writes, zero polling timers, and one active event subscription. | Mobile engineering and performance owner | Baseline before implementation; verify before release |
| R-007 | DATA | The event handler could display an event payload or stale cached value. The epic says the screen reads `lastSuccessfulSyncAt` and re-renders when the completion event arrives. | 2 | 2 | 4 | Publish completion events after advancing the authoritative store value. Include consecutive completions and verify that the newest stored value wins. | Mobile engineering and QA | Before merge |

### Low-Priority Risks, Score 1 to 2

| Risk ID | Category | Description and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-008 | SEC | Incorrect binding could expose another settings value or additional device data. The epic limits the display to the device-written timestamp and adds no personal data. | 1 | 2 | 2 | Assert that the row reads and renders only `lastSuccessfulSyncAt`. Inspect the enabled and disabled view content for added data fields. | Mobile engineering and QA | Before merge |

### Residual Risk

After planned mitigation, the remaining exposure is limited to device-specific rendering variance and relative-time locale behavior outside the supported test matrix. The feature flag provides operational containment. Release QA owns residual device-profile sampling.

### Risk Category Legend

- **TECH**: Technical architecture and integration behavior
- **SEC**: Security, privacy, access, and data exposure
- **PERF**: Performance, resource use, and responsiveness
- **DATA**: Data integrity, loss, corruption, and inconsistency
- **BUS**: User and business behavior
- **OPS**: Deployment, configuration, rollback, and monitoring

---

## NFR Planning

This section plans later validation evidence. Final NFR status belongs in `nfr-assess` after implementation evidence exists.

| NFR Category | Requirement or Threshold | Risk Link | Planned Validation | Evidence Needed |
| --- | --- | --- | --- | --- |
| Security and privacy | Display only the device-written timestamp to the device holder. Add no personal data. | R-008 | Inspect the bound field and compare enabled and disabled view content. | Component test report and serialized view-tree diff |
| Performance | Add zero network calls, zero writes, zero polling, and zero timers. Use one local key lookup at mount and one re-read per completion event. Keep the existing render budget unchanged. | R-006 | Instrument calls and lifecycle behavior. Profile disabled and enabled home-screen renders on supported device profiles. | Spy report, timer and subscription assertions, and device render profile |
| Reliability | Refresh the displayed value when the existing completion event fires while the screen remains open. | R-002, R-007 | Exercise controlled store changes and consecutive completion events on a mounted screen. | Component integration results with render-count and latest-value assertions |
| Data integrity | Open the field read-only and leave orders, queue entries, and settings unchanged. | R-005 | Snapshot relevant state and spy on writes around render and event handling. | Before and after state snapshots plus zero-write results |
| Operational recoverability | Disabling `home_last_sync_row` restores the previous home screen exactly without a new build. | R-004 | Compare the disabled state with an approved pre-feature baseline. | E2E result and structural or visual comparison artifact |
| Maintainability | Reuse the existing store and completion event. Add no timer or polling path. | R-006 | Verify one subscription, cleanup on unmount, and absence of timers and polling. | Component test report and implementation review record |
| Scalability | The local-only feature introduces no network, storage growth, or aggregate workload. | R-006 | Use zero-network and zero-write assertions. | Instrumentation report |
| Compliance | The epic names no regulatory requirement. | N/A | No epic-specific validation planned. | N/A |

**Unknown thresholds:** The numeric home-screen render regression tolerance is UNKNOWN. Define the device profiles, metric, baseline, and allowable variance before performance evidence is collected. R-006 tracks this gap.

---

## Entry Criteria

- [ ] Epic 9 implementation is deployed to a supported test build.
- [ ] A deterministic local-settings fixture can seed a valid timestamp and a never-synced state.
- [ ] The sync completion publisher can be triggered in component and device tests.
- [ ] Tests can set `home_last_sync_row` on and off for the target organization.
- [ ] An approved pre-feature home-screen baseline exists for flag-off comparison.
- [ ] The render metric, device profiles, baseline, and allowable regression tolerance are agreed.
- [ ] The implementation repository's unit, component, integration, and E2E runners are selected and available in CI.

## Exit Criteria

- [ ] P0 pass rate is 100%.
- [ ] P1 pass rate is at least 95%; every failure has triage and an approved waiver when unresolved.
- [ ] P2 pass rate is at least 90%.
- [ ] No open P0 or P1 severity defects remain.
- [ ] R-002 mitigation evidence is complete.
- [ ] All four acceptance criteria have automated coverage.
- [ ] Security coverage passes at 100%.
- [ ] The agreed performance tolerance is met.
- [ ] Every in-scope NFR category has the planned evidence artifact or an approved waiver.

---

## Test Coverage Plan

P0 through P3 express test priority. The Execution Strategy section defines when each suite runs.

### P0: Critical

**Criteria:** Critical data-integrity impact with no safe recovery after a destructive write.

| Test ID | Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| 9.1-INT-001 | Rendering and completion-event handling leave orders, queue entries, and settings unchanged. | Integration | R-005 | 1 | Mobile engineering | Integration coverage exercises the real persistence boundary with state snapshots and write spies. |

**Total P0:** 1 test; about 3 to 6 hours

### P1: High

**Criteria:** Core technician behavior or complex integration with material user reach and a limited radio-dispatch workaround.

| Test ID | Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| 9.1-UNIT-001 | Convert controlled timestamps into correct relative labels across rounding boundaries, time zones, future values, and invalid values. | Unit | R-001 | 6 to 10 | Mobile engineering | Unit coverage isolates date logic and uses a fixed clock. |
| 9.1-COMP-001 | Read a valid `lastSuccessfulSyncAt` value during home-screen mount and render the matching sync row. | Component | R-001 | 1 to 2 | Mobile engineering | Component coverage proves store-to-view wiring. |
| 9.1-COMP-002 | Omit the entire row for missing, null, or unreadable values while preserving neighboring content and spacing. | Component | R-003 | 3 to 4 | Mobile engineering | Component assertions cover conditional rendering and local layout. |
| 9.2-COMP-001 | Change the stored timestamp and publish a completion event while the screen remains mounted. Verify an immediate refresh. | Component | R-002, R-007 | 1 to 2 | Mobile engineering and QA | This is the narrowest level that exercises the store, event publisher, subscription, and view together. |
| 9.2-COMP-002 | Publish consecutive completion events with increasing stored timestamps. Verify the newest stored value wins and each event causes at most one update. | Component | R-002, R-007 | 2 to 3 | Mobile engineering and QA | Covers stale-cache and duplicate-subscription behavior. |
| 9.1-E2E-001 | Launch the home screen with `home_last_sync_row` disabled and match the approved pre-feature structure and visual output. | E2E | R-004 | 1 to 2 | Release QA | Full-screen coverage is required because the criterion applies to the complete prior screen. |
| 9.NFR-COMP-001 | Assert one local lookup at mount, one re-read per completion event, zero network calls, zero writes, zero polling timers, and one subscription that is removed on unmount. | Component | R-006 | 1 to 2 | Mobile engineering | Instrumented component coverage gives deterministic call and lifecycle evidence. |

**Total P1:** 7 coverage rows representing about 15 to 25 assertions or parameterized cases; about 12 to 20 hours

### P2: Medium

**Criteria:** Secondary protection with narrower reach and containment through the feature flag.

| Test ID | Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| 9.NFR-E2E-001 | Profile home-screen rendering with the flag disabled and enabled against the agreed baseline and tolerance. | E2E | R-006 | 2 to 4 device-profile runs | Performance owner and QA | Device-level profiling supplies user-visible render evidence. Execution waits for the tolerance decision. |
| 9.NFR-COMP-002 | Verify that the row reads and renders only `lastSuccessfulSyncAt` and adds no other settings or personal data. | Component | R-008 | 1 to 2 | Mobile engineering and QA | View-tree inspection directly validates binding and displayed content. |

**Total P2:** 2 coverage rows representing about 3 to 6 checks; about 8 to 14 hours

### P3: Low

**Criteria:** Rare or cosmetic behavior with minimal impact and an easy workaround.

No P3 coverage is planned. Every identified scenario supports an acceptance criterion, data-integrity control, operational rollback, or explicit NFR constraint.

**Total P3:** 0 tests; 0 hours

---

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays below 15 minutes. Reserve device profiling and broad visual matrices for scheduled execution because they carry material infrastructure or duration cost.

- **Pull request:** Run all unit, component, integration, and functional E2E coverage. Parallelize with the selected runner to keep feedback below 15 minutes.
- **Nightly:** Run device render profiling and the visual baseline comparison across supported device profiles.
- **Weekly:** Reuse the nightly checks in the broader mobile regression. Epic 9 adds no separate weekly-only workload.

Execution order within a pull request is fast unit and component checks, then the P0 persistence-boundary integration check, then the focused functional E2E check.

---

## Resource Estimates

### Test Development Effort

| Priority | Coverage Rows | Effort Range | Notes |
| --- | ---: | --- | --- |
| P0 | 1 | About 3 to 6 hours | Persistence fixture, state snapshots, and write instrumentation |
| P1 | 7 | About 12 to 20 hours | Fixed clock, store and event harness, flag state, and focused screen baseline |
| P2 | 2 | About 8 to 14 hours | Device profiling, device matrix, and privacy-oriented view inspection |
| P3 | 0 | 0 hours | No scenarios planned |
| **Total** | **10** | **About 23 to 40 hours** | **About 0.5 to 1 engineer-week, including harness setup** |

### Prerequisites

**Test Data:**

- Local-settings factory for a valid, missing, null, unreadable, old, recent, and future `lastSuccessfulSyncAt` value
- Sync completion publisher fixture with deterministic subscription cleanup
- Feature-flag fixture for enabled and disabled organization states
- Approved home-screen baseline with the flag disabled

**Tooling:**

- Implementation repository's unit and component runner for fixed-clock, view, store, and event coverage
- Implementation repository's mobile E2E runner for device-level home-screen validation
- Device profiling tool for render timing and frame evidence
- Network, timer, subscription, and persistence spies for local-only constraint evidence

**Environment:**

- Supported device or emulator profiles with controlled clock, locale, and time zone
- CI access to feature-flag test configuration and a deterministic local settings store
- Test build containing the Epic 9 implementation and existing sync event publisher

---

## Quality Gate Criteria

### Pass and Failure Thresholds

- **P0 pass rate:** 100%
- **P1 pass rate:** At least 95%; unresolved failures require an owner, reason, approver, and expiry date
- **P2 pass rate:** At least 90%
- **High-risk mitigation:** R-002 evidence is 100% complete or has an approved waiver

### Coverage Targets

- **Epic acceptance criteria:** 100%
- **Planned automated scenarios:** At least 80%
- **Security and privacy scenarios:** 100%
- **Business logic branches in relative-time formatting:** At least 70%
- **Documented edge-case set:** At least 50%

### Non-Negotiable Requirements

- [ ] The P0 data-integrity test passes.
- [ ] No score 6 or greater risk remains without mitigation or an approved waiver.
- [ ] The SEC category test passes at 100%.
- [ ] The render tolerance is defined and the PERF evidence meets it.
- [ ] Planned NFR evidence exists for every in-scope category, or `nfr-assess` records an approved concern or waiver.

---

## Mitigation Plans

### R-002: Stale value after an in-screen sync completion, Score 6

**Mitigation Strategy:**

1. Provide a deterministic test adapter for the existing completion publisher.
2. Mount the home screen with a known initial timestamp.
3. Advance the authoritative store value and publish one completion event.
4. Assert an immediate visible update without remounting, polling, or a timer.
5. Publish consecutive completions and confirm that one active subscription reads the newest stored value.
6. Unmount the screen and confirm subscription cleanup.

**Owner:** Mobile engineering and QA  
**Timeline:** Before merge  
**Status:** Planned  
**Verification:** Green results for 9.2-COMP-001, 9.2-COMP-002, and the subscription assertions in 9.NFR-COMP-001  
**Residual risk:** Device scheduling could introduce platform-specific timing variance. A focused device E2E refresh check should join the broader mobile regression when the implementation stack is available.

---

## Assumptions and Dependencies

### Assumptions

1. `lastSuccessfulSyncAt` has a stable timestamp representation already consumed by the application.
2. The existing completion event is available to the home screen and can be controlled in tests.
3. Product-approved relative-time wording follows the application's existing locale conventions.
4. The feature flag is evaluated early enough to suppress the row and feature-specific work when disabled.
5. Supported device profiles, locales, and time zones will be supplied by the implementation project.

### Dependencies

1. Epic 9 implementation source and its selected test runners are required before test development begins.
2. A controllable settings-store fixture and completion-event publisher are required before component integration coverage begins.
3. The pre-feature home-screen baseline is required before flag-off E2E validation.
4. The render metric and acceptable regression tolerance are required before release profiling.

### Risks to Plan

- **Risk:** The supplied planning repository contains no implementation manifest or established test harness.
  - **Impact:** Framework-specific test files, fixture APIs, selectors, and CI commands cannot be specified yet.
  - **Contingency:** Preserve the test IDs, data cases, risk links, and evidence contract in the selected implementation stack. Confirm the mapping before automation starts.

---

## Follow-on Workflows

- Run `/bmad-testarch-atdd` explicitly to generate failing P0 acceptance scaffolds after the implementation test stack is available.
- Run `/bmad-testarch-automate` explicitly for the broader P1 and P2 coverage after implementation exists.
- Run `nfr-assess` after the planned evidence artifacts have been collected.

---

## Approval

**Test Design Approval:**

- [ ] Product Manager: Unassigned; Date: Pending
- [ ] Tech Lead: Unassigned; Date: Pending
- [ ] QA Lead: Unassigned; Date: Pending

**Comments:** The draft is ready for review after the performance tolerance, supported device profiles, and implementation test stack are known.

---

## Interworking and Regression

| Service or Component | Impact | Regression Scope | Coordination |
| --- | --- | --- | --- |
| Technician home screen | Adds one conditional relative-time row. | Existing layout, navigation, accessibility, and neighboring content remain stable in never-synced and flag-off states. | Mobile engineering and QA |
| Local settings store | Adds one read of `lastSuccessfulSyncAt`. | Existing read paths pass; zero writes occur; order, queue, and setting state remains unchanged. | Mobile engineering |
| Sync completion publisher and progress spinner | The home screen adds a listener to the existing event. | Existing spinner behavior passes; subscriber count remains stable; cleanup occurs on unmount; consecutive events update once each. | Sync and mobile owners if separate |
| Feature-flag client | Gates all new row behavior. | Existing organization targeting passes; disabled state matches the approved prior-screen baseline. | Release QA and flag owner |
| Relative-time formatter and localization | Produces the technician-facing label. | Existing locale behavior passes across the supported locale, time-zone, and clock-boundary matrix. | Mobile engineering and localization owner if assigned |

No external service contract or cross-team API change is introduced.

---

## Appendix

### Knowledge Base References

- `risk-governance.md`: Risk categories, mitigation thresholds, ownership, and traceability
- `probability-impact.md`: Probability, impact, score, and action scale
- `test-levels-framework.md`: Unit, component, integration, and E2E selection
- `test-priorities-matrix.md`: Independent P0 through P3 prioritization
- `nfr-criteria.md`: NFR thresholds, evidence planning, and UNKNOWN handling

### Related Documents

- Epic: `field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md`
- PRD: None supplied by run configuration
- Architecture: None supplied by run configuration
- Tech spec: None supplied by run configuration

### Run Record

- Mode: epic-level create
- Run scope: epic
- Run key: epic-9
- Design level: full
- Execution mode: sequential
- Browser exploration: skipped because no automation mode or target URL was configured
- Existing test coverage: none present in the supplied project

---

**Generated by:** BMad TEA Agent, Test Architect Module  
**Workflow:** `bmad-testarch-test-design`
