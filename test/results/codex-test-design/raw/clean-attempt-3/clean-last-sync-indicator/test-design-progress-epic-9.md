---
runScope: 'epic'
runKey: 'epic-9'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T21:35:04-05:00'
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

# Step 1: Mode and Prerequisites

- Mode: epic-level
- Reason: The invocation explicitly identifies Epic 9 and requests epic-level test design.
- Requirements source: `docs/epics/epic-9-last-sync-indicator.md`
- Prerequisite status: Satisfied. The epic contains the requirements and acceptance criteria for this run.
- Architecture context: Unavailable by declaration and treated as optional for epic-level mode.
- Run scope: `epic`
- Run key: `epic-9`
- Epic number: `9`

# Step 2: Context and Knowledge

## Configuration

- `test_artifacts`: `test-artifacts`
- `test_stack_type`: `auto`
- Detected stack: unknown. The supplied project fixture contains requirements and configuration only.
- `tea_use_playwright_utils`: not configured
- `tea_use_pactjs_utils`: not configured
- `tea_pact_mcp`: not configured
- `tea_browser_automation`: not configured, so browser exploration was skipped.

## Loaded Inputs

- Epic 9 with two stories and four acceptance criteria.
- TEA core and module configuration.
- Risk governance, probability and impact, test-level selection, test-priority, and NFR criteria knowledge fragments.
- NFR guidance was loaded because the epic defines privacy, data integrity, render-budget, event-driven update, and feature-flag requirements.

## Extracted Test Context

- The home screen reads `lastSuccessfulSyncAt` from the existing local settings store.
- A present value is rendered as relative time.
- An absent value suppresses the row and preserves the rest of the home screen.
- An existing sync-completion event refreshes the displayed value while the screen remains open.
- The implementation must add no polling, timer, network request, storage field, or write operation.
- The `home_last_sync_row` feature flag must restore the prior home screen exactly when disabled.

## Existing Coverage

- No source files, test files, fixtures, test configuration, or prior system-level test-design outputs are present in the supplied project fixture.
- Existing coverage and flaky areas cannot be established from repository evidence.
- Coverage planning must stay framework-neutral until the implementation stack and current test harness are available.

# Step 3: Risk and NFR Planning

## Risk Assessment

### High Risks, Score 6 or Greater

No high risks were identified from the supplied epic.

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score |
| --- | --- | --- | --- | ---: | ---: | ---: |

### Medium Risks, Score 3 to 4

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score |
| --- | --- | --- | --- | ---: | ---: | ---: |
| R-001 | BUS | The relative-time calculation can show an incorrect age for the latest successful sync, which would mislead technicians about device freshness. | Story 9.1 and acceptance criterion 1 require the most recent successful sync to appear as relative time. | 2 | 2 | 4 |
| R-002 | BUS | The visibility guard can render a sync row for a never-synced device or leave changed home-screen output when the flag is disabled, breaking the required conditional experience and rollback behavior. | Story 9.1 and acceptance criteria 2 and 4 require no row for an absent value and the exact previous screen when `home_last_sync_row` is off. | 2 | 2 | 4 |
| R-003 | TECH | The open home screen can miss or mishandle the existing sync-completion event and continue showing stale data after a successful sync. | Story 9.2 and acceptance criterion 3 require the value to update when sync completes while the screen is open. | 2 | 2 | 4 |

### Low Risks, Score 1 to 2

No low risks were identified from the supplied epic.

| Risk ID | Category | Description | Source Evidence | Probability | Impact | Score |
| --- | --- | --- | --- | ---: | ---: | ---: |

## Mitigations

| Risk ID | Mitigation | Owner | Timeline |
| --- | --- | --- | --- |
| R-001 | Cover the relative-time formatter with deterministic clock-based unit tests, including recent values and unit boundaries. Confirm one UI path presents the formatter output for the stored timestamp. | Development | Before merge |
| R-002 | Exercise the visibility guard with a present timestamp, absent timestamp, flag enabled, and flag disabled. Add a visual or structural comparison proving the disabled state matches the established home screen. | Development and QA | Before release candidate |
| R-003 | Integrate against the existing completion event, seed an older stored value, publish one successful completion with a newer value, and assert the open screen refreshes once without reload, polling, or timers. | Development and QA | Before release candidate |

## Constraint Regression Assertions

The epic marks several controls as already satisfied. They remain release assertions outside the scored risk register:

- The feature performs exactly one local lookup of `lastSuccessfulSyncAt`.
- The feature adds zero network calls, zero writes, and zero new stored fields.
- The update path adds no polling and no timer.
- The row exposes no additional personal data and remains visible only on the technician's device screen.
- Disabling `home_last_sync_row` restores the prior home-screen structure and appearance.

## NFR Planning Assessment

| NFR Category | In-Scope Requirement or Threshold | Status | Planned Evidence |
| --- | --- | --- | --- |
| Security and privacy | No personal data is added and the timestamp is shown only to the device holder. | Defined as a regression constraint | UI content assertion and review of the rendered row's data source |
| Performance | One local key lookup; zero network calls; zero new storage; no timer or polling; existing render budget unchanged. | Structural thresholds defined. Numeric render-time threshold is UNKNOWN. | Store spy, network spy, timer spy, and render-performance comparison against the existing home-screen baseline |
| Reliability | The open screen refreshes after the existing successful-sync completion event. | Functional threshold defined | Integration test with deterministic event publication and stored timestamp update |
| Data integrity | The feature is read-only and cannot alter orders, queue entries, or settings. | Defined as a regression constraint | Store write spy and before/after local-state comparison |
| Operations | Existing `home_last_sync_row` flag disables the row without a build and restores the previous screen exactly. | Defined | Flag-on and flag-off UI tests plus visual or structural comparison |
| Scalability | Local-only display change with no new network or storage load. | No separate scalability threshold applies | Structural verification of the local-only design |
| Maintainability | No explicit quantitative threshold is supplied. | UNKNOWN | Code review plus unit and integration coverage reports |
| Compliance | No compliance requirement is stated. | Out of scope | None |

## Clarification Items

- Record the current home-screen render budget or baseline measurement so the phrase "unchanged" can be evaluated quantitatively.
- Confirm the product's approved relative-time boundary and localization rules during implementation. Until then, tests should follow the existing shared formatter contract if one exists.

## Risk Summary

All three identified risks score 4. The first mitigation priority is accurate initial rendering, followed by exact conditional visibility and reliable event-driven refresh. The feature's local, read-only, flag-protected constraints reduce security, data-integrity, performance, and rollback exposure. Those constraints still require explicit regression evidence.

# Step 4: Coverage and Execution Plan

## Priority Criteria

- P0: Critical business, security, data-integrity, or compliance impact with no safe workaround.
- P1: Core, frequent, or complex behavior with material user reach and a limited workaround.
- P2: Secondary behavior with narrower user reach and an acceptable workaround.
- P3: Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

## Coverage Matrix

| Test ID | Story | Scenario | Test Level | Priority | Risk Link | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 9.1-UNIT-001 | 9.1 | Given a fixed current time and a successful-sync timestamp, calculate the expected relative-time text across the approved unit boundaries. | Unit | P1 | R-001 | Fast deterministic coverage isolates the formatter. Failure misleads technicians about freshness. The epic documents radio contact with dispatch as a limited manual workaround. Boundary expectations must follow the existing formatter contract or a clarified product rule. |
| 9.1-INT-001 | 9.1 | With the flag enabled and `lastSuccessfulSyncAt` present, read the existing key once and provide the newest stored successful timestamp to the home-screen row. | Integration | P1 | R-001 | This level verifies the settings-store boundary. Assert zero writes, zero new fields, and zero network calls. Failure produces an incorrect or absent freshness signal. The documented radio workflow is a limited workaround. |
| 9.1-COMP-001 | 9.1 | With the flag enabled and `lastSuccessfulSyncAt` absent, render the established home screen with no sync row. | Component | P1 | R-002 | Component coverage isolates conditional rendering and proves the rest of the screen structure is unchanged. Failure confuses never-synced users. Asking dispatch is the only source-supported workaround. |
| 9.1-COMP-002 | 9.1 | With a stored timestamp present and `home_last_sync_row` disabled, render the exact established home screen with no sync row. | Component | P1 | R-002 | Use a structural snapshot or approved visual baseline. Failure breaks the documented rollback control. The source provides no alternate rollback mechanism. |
| 9.2-INT-001 | 9.2 | While the screen remains mounted, store a newer successful timestamp, publish the existing completion event once, and refresh the displayed value once without navigation. | Integration | P1 | R-003 | This level verifies the event, store, and view-model boundary. Assert the path uses no polling or timer. Failure leaves the visible freshness signal stale. Radio confirmation is the documented limited workaround. |
| 9-E2E-001 | 9.1 | Launch the technician home screen on a device state containing a successful sync and observe the relative-time row sourced from the latest stored completion. | E2E | P1 | R-001 | This validates the user-visible wiring and presentation. Lower-level tests own formatter branches. Failure affects the epic's central user outcome, with radio confirmation as a limited workaround. |
| 9-E2E-002 | 9.1 | Disable `home_last_sync_row` with a stored timestamp present and compare the home screen with the approved prior-screen baseline. | E2E | P1 | R-002 | This validates the exact rollout-control appearance. Component tests own the visibility branches. Failure removes the documented rollback mechanism, and the source gives no alternate flag rollback path. |
| 9-E2E-003 | 9.2 | Keep the technician home screen open, complete a successful sync, and observe the row change to the new relative time without reload. | E2E | P1 | R-003 | This validates the complete technician-visible refresh path. Integration coverage owns event mechanics. Failure leaves stale status, with radio confirmation as a limited workaround. |

All primary risks are P1 because each can break the epic's central user signal or its rollout control. The epic documents asking dispatch over the radio as a manual workaround for freshness uncertainty. That workaround preserves operations with material friction. No supplied consequence reaches the P0 threshold for critical business, security, data-integrity, or compliance impact.

## NFR Coverage and Evidence Plan

| NFR Category | Planned Validation | Validation Level or Method | Expected Evidence | Gap or Assumption |
| --- | --- | --- | --- | --- |
| Security and privacy | Confirm the row contains only the relative sync time and introduces no personal data. | Component and E2E | Assertion output and rendered-screen artifact | The epic states the privacy control is already satisfied. |
| Performance | Verify one local lookup, zero network calls, zero writes, zero new storage, zero timers, and zero polling. Compare render timing with the established home-screen baseline. | Integration plus performance instrumentation | Spy output and before/after render metrics | The numeric render budget is UNKNOWN and must be recorded before quantitative sign-off. |
| Reliability | Publish the existing successful-sync completion event while the screen is open and assert one deterministic refresh. | Integration and E2E | Test report plus event/store trace | The event contract must be available to the test harness. |
| Data integrity | Prove the settings store and operational data remain unchanged after initial render and event-driven refresh. | Integration | Store write-spy output and state comparison | The implementation boundary must expose a test seam for write observation. |
| Operations | Exercise flag enabled and disabled states and compare the disabled UI with the prior home-screen baseline. | Component and E2E | Flag matrix results plus structural or visual baseline diff | An approved prior-screen baseline is required. |
| Scalability | Confirm the change stays local and adds no remote or persistent workload. | Integration and code review | Network/store spy output and review record | No separate load threshold applies to the stated local-only change. |
| Maintainability | Measure coverage of changed formatter, visibility, store-read, and event-refresh code. | CI coverage report | Changed-code coverage artifact | Existing repository coverage rules are unavailable. Use the workflow gate of at least 80% until project rules are supplied. |

## Execution Strategy

- PR: Run Unit, Component, Integration, and E2E scenarios when the complete set remains under 15 minutes. Fail fast on P1 coverage and structural side-effect assertions.
- Nightly: Run the complete flag and device-state matrix, visual comparison, and render-performance comparison after a baseline exists.
- Weekly: No additional long-running suite is justified by the supplied local-only scope. Revisit this when broader implementation context supplies a relevant suite.

## Resource Estimate

| Priority | Scenario Count | Estimated Effort |
| --- | ---: | --- |
| P0 | 0 | 0 hours |
| P1 | 8 | About 24 to 40 hours |
| P2 | 0 | 0 hours |
| P3 | 0 | 0 hours |
| Total | 8 | About 24 to 40 hours |

Expected elapsed implementation and stabilization time is about 0.75 to 1.25 engineer-weeks with access to the existing test harness, event contract, feature-flag fixture, and approved home-screen baseline.

## Quality Gates

- P0 pass rate: 100%. No P0 scenarios are planned for this scope.
- P1 pass rate: at least 95%. With eight discrete scenarios, every mapped acceptance-criteria scenario must pass for release.
- Acceptance-criteria coverage: 100% mapped to automated scenarios.
- Risk coverage: every canonical risk has suitable lower-level and user-visible coverage.
- High-risk mitigation: complete before release. No score 6 or greater risk is currently identified.
- Changed-code coverage: at least 80%, subject to a stronger project rule when available.
- Structural constraints: zero unexpected writes, network calls, timers, polling loops, or added stored fields.
- Rollback evidence: disabled-flag screen comparison has zero unintended structural or visual differences.
- NFR evidence: identify and retain evidence for every in-scope NFR category. Defer final NFR status to the NFR assessment workflow after implementation evidence exists.

# Step 5: Output and Validation

- Resolved execution mode: sequential, from the explicit run configuration. Capability probing was disabled.
- Mode: epic-level.
- Output: `test-artifacts/test-design/test-design-epic-9.md`.
- Validation: Completed against `skill/checklist.md`.
- Risks: Three medium risks with score 4. No risks score 6 or greater.
- Gate thresholds: P0 pass rate 100%, P1 pass rate at least 95%, all acceptance criteria mapped, changed-code coverage at least 80%, and every stated local, read-only, event-driven, and flag-rollback constraint verified.
- Open items: Numeric render budget, relative-time boundary and localization rules, existing harness details, and the approved prior-screen baseline.
