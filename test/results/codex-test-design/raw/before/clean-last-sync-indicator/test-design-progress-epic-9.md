---
runScope: 'epic'
runKey: 'epic-9'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T20:24:09-0500'
inputDocuments:
  - 'field-sync-indicator/_bmad/config.toml'
  - 'field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Step 1: Mode and Prerequisites

- Mode: epic-level
- Run scope: epic
- Epic number: 9
- Run key: epic-9
- Requirements source: `docs/epics/epic-9-last-sync-indicator.md`
- Prerequisite status: satisfied

# Step 2: Context and Knowledge

- TEA flags `tea_use_playwright_utils`, `tea_use_pactjs_utils`, `tea_pact_mcp`, and `tea_browser_automation`: unset
- Test stack type: auto; undetermined because the supplied project contains no implementation manifests or source tree
- Test artifacts: `field-sync-indicator/test-artifacts`
- Loaded requirement: Epic 9 with Stories 9.1 and 9.2 and four acceptance criteria
- Integration points: local settings key `lastSuccessfulSyncAt`, sync completion event, home screen rendering, and feature flag `home_last_sync_row`
- Existing automated coverage, fixtures, and test patterns: none present in the supplied repository
- Prior system-level test design: none present
- Browser exploration: skipped because no automation mode or target URL is configured
- Contract testing: irrelevant because the epic adds no network call and the repository contains no Pact evidence
- Known coverage gap: all Epic 9 behavior requires new coverage

# Step 3: Risk and Testability Assessment

## Risk Register

| Risk ID | Category | Risk and source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | BUS | The home screen could show an incorrect relative time through timestamp parsing, time-zone conversion, rounding, or future timestamp handling. The epic requires the existing `lastSuccessfulSyncAt` value to render as a relative time such as "synced 4 minutes ago." | 2 | 2 | 4 | Use a deterministic clock and table-driven tests across recent, old, boundary, future, and invalid timestamps. Verify the displayed value against the stored timestamp. | Mobile engineering | Before merge |
| R-002 | TECH | The displayed value could remain stale after a sync completes while the home screen stays open. Story 9.2 requires re-rendering from the existing sync completion event. | 2 | 3 | 6 | Add an integration test that mounts the open screen, changes the stored timestamp, publishes one completion event, and verifies a single immediate update without navigation, polling, or a timer. | Mobile engineering and QA | Before merge |
| R-003 | BUS | A device with no `lastSuccessfulSyncAt` value could show a placeholder, empty row, or layout residue. Story 9.1 requires the row to be absent and the rest of the screen unchanged. | 2 | 2 | 4 | Cover missing, null, and unreadable values at component level. Add a home-screen regression assertion for row absence and unchanged neighboring content. | Mobile engineering and QA | Before merge |
| R-004 | OPS | Disabling `home_last_sync_row` could leave markup, spacing, subscriptions, or store reads behind. The acceptance criteria require the previous home screen exactly when the flag is off. | 2 | 2 | 4 | Test the disabled flag before mount and after configuration refresh if runtime changes are supported. Compare structure and visual output with the pre-feature baseline. | Mobile engineering and release QA | Before release |
| R-005 | DATA | The feature could mutate settings or sync state even though the epic requires a read-only lookup and says no order, queue entry, or setting can be altered or lost. | 1 | 3 | 3 | Spy on store write methods and capture relevant state before and after initial render and event handling. Assert zero writes and unchanged state. | Mobile engineering | Before merge |
| R-006 | PERF | The implementation could add a network request, storage operation, polling loop, timer, repeated subscription, duplicate lookup, or measurable render regression. The epic defines each read as one local key lookup and states that the existing render budget remains unchanged. The numeric render budget is UNKNOWN. | 2 | 2 | 4 | Record the current home-screen render baseline, set an agreed regression tolerance, and assert one read at mount, one re-read per completion event, zero network calls, zero writes, zero polling timers, and one active event subscription. | Mobile engineering and performance owner | Baseline before implementation; verify before release |
| R-007 | DATA | The event handler could display an event payload or stale cached value instead of the most recent timestamp from the local settings store. The epic says the screen reads `lastSuccessfulSyncAt` and re-renders when the completion event arrives. | 2 | 2 | 4 | Publish completion events after advancing the authoritative store value. Include consecutive completions and assert that the newest stored timestamp wins. | Mobile engineering and QA | Before merge |
| R-008 | SEC | The row could expose another settings value or additional device data through incorrect binding. The epic limits the display to the device-written timestamp and states that no personal data is added. | 1 | 2 | 2 | Assert the row binds only `lastSuccessfulSyncAt` and inspect the enabled versus disabled UI content for added data fields. | Mobile engineering and QA | Before merge |

High risk R-002 requires mitigation evidence before release. The next priorities are correct relative-time semantics, exact absent and flag-off rendering, authoritative-store refresh behavior, and preservation of read-only local execution.

## NFR Planning

| NFR category | Requirement or threshold | Status | Planned evidence |
| --- | --- | --- | --- |
| Security and privacy | Expose no new personal data. Show the device-written timestamp only to the device holder. | Defined | Content inspection and enabled versus disabled screen comparison |
| Performance | Add zero network calls, zero writes, zero polling, and zero timers. Use one local key lookup at mount and one re-read per completion event. Keep the existing render budget unchanged. Numeric render tolerance is UNKNOWN. | Partially defined | Network and store spies, fake-timer inspection, subscription count, and before and after render profiling against an agreed tolerance |
| Reliability | Update the visible value when the existing completion event fires while the screen remains open. | Defined | Component integration test with a controlled store and event publisher |
| Data integrity | Open the field read-only and leave orders, queue entries, and settings unchanged. | Defined | State snapshot plus write-method spies around render and event handling |
| Operational recoverability | Disabling `home_last_sync_row` restores the previous home screen exactly without a new build. | Defined | Feature-flag E2E regression and visual comparison |
| Scalability | No network, storage growth, or aggregate workload is introduced. | Outside this epic's active risk surface | Static design review plus zero-network and zero-write assertions |
| Maintainability | Reuse the existing store and completion event. Add no timer or polling path. | Defined | Component interaction tests and implementation review |
| Compliance | The epic names no regulatory requirement. | Outside scope | None planned |

Clarification for implementation planning: define the home-screen render baseline and acceptable regression tolerance before performance evidence is collected. Risk R-006 tracks this missing threshold.

# Step 4: Coverage Plan and Execution Strategy

## Coverage Matrix

| Test ID | Requirement or scenario | Test Level | Priority | Risk Link | Coverage notes |
| --- | --- | --- | --- | --- | --- |
| 9.1-UNIT-001 | Convert controlled timestamps into correct relative labels across rounding boundaries, time zones, future values, and invalid values. | Unit | P1 | R-001 | A unit test isolates date logic and uses a fixed clock for deterministic coverage. |
| 9.1-COMP-001 | Read a valid `lastSuccessfulSyncAt` value during home-screen mount and render the matching sync row. | Component | P1 | R-001 | Component coverage proves store-to-view wiring while the unit row covers formatting branches. |
| 9.1-COMP-002 | Omit the entire row for missing, null, or unreadable values while preserving neighboring home content and spacing. | Component | P1 | R-003 | Component assertions cover conditional rendering and local layout without a full application environment. |
| 9.2-COMP-001 | While the screen remains mounted, update the store and publish a completion event. Verify the row refreshes immediately without navigation. | Component | P1 | R-002, R-007 | A component integration harness is the narrowest level that exercises the store, event publisher, subscription, and rendered outcome together. |
| 9.2-COMP-002 | Publish consecutive completion events with increasing stored timestamps. Verify the newest stored value wins and each event causes at most one render update. | Component | P1 | R-002, R-007 | This covers stale-cache and duplicate-subscription behavior at the interacting-component boundary. |
| 9.1-E2E-001 | Launch the technician home screen with `home_last_sync_row` disabled and compare structure and visual output with the approved pre-feature baseline. | E2E | P1 | R-004 | Full-screen coverage is required because the acceptance criterion applies to the complete prior home screen. |
| 9.1-INT-001 | Snapshot orders, queue entries, and settings; render the feature and process a completion event; assert zero store writes and identical state afterward. | Integration | P0 | R-005 | Integration coverage is suitable because the risk concerns persistence boundaries and data integrity. |
| 9.NFR-COMP-001 | Instrument feature execution and assert one local lookup at mount, one re-read per completion event, zero network calls, zero writes, zero polling timers, and one active subscription that is removed on unmount. | Component | P1 | R-006 | Component instrumentation gives deterministic call and lifecycle evidence without network or device variability. |
| 9.NFR-E2E-001 | Profile home-screen render with the flag disabled and enabled against the agreed baseline and regression tolerance. | E2E | P2 | R-006 | Device-level profiling supplies evidence for the user-visible render budget. This remains blocked until the tolerance is defined. |
| 9.NFR-COMP-002 | Verify that the new row reads and renders only `lastSuccessfulSyncAt` and adds no other settings or personal data to the view tree. | Component | P2 | R-008 | Component inspection directly validates data binding and displayed content. |

All four acceptance criteria have direct planned coverage. Every material risk has at least one suitable automated coverage row.

## NFR Coverage and Evidence Plan

| NFR category | Planned validation | Expected evidence | Planning status |
| --- | --- | --- | --- |
| Security and privacy | Run 9.NFR-COMP-002 and inspect the enabled versus disabled view content. | Component test report and serialized view-tree diff | Ready |
| Performance | Run 9.NFR-COMP-001 for prohibited work and 9.NFR-E2E-001 for render profiling. | Spy report, timer and subscription assertions, and device render profile | Blocked on numeric regression tolerance tracked by R-006 |
| Reliability | Run 9.2-COMP-001 and 9.2-COMP-002 with a controlled store and event publisher. | Component integration results showing immediate and latest-value updates | Ready |
| Data integrity | Run 9.1-INT-001 around initial render and event handling. | Before and after state snapshots plus zero-write spy results | Ready |
| Operational recoverability | Run 9.1-E2E-001 with the feature flag disabled. | E2E result and approved visual or structural baseline comparison | Ready once the pre-feature baseline is captured |
| Maintainability | Inspect 9.NFR-COMP-001 evidence for one subscription, cleanup on unmount, and absence of timers or polling. | Component test report and static implementation review record | Ready |

## Execution Strategy

- PR: Run all unit, component, integration, and functional E2E scenarios. The planned functional suite should remain below 15 minutes.
- Nightly: Run device render profiling and visual baseline comparison across supported device profiles.
- Weekly: No separate suite is planned for this small local-only feature. Reuse the nightly checks in the broader mobile regression when available.

## Resource Estimate

| Priority | Estimate |
| --- | --- |
| P0 | About 3 to 6 hours |
| P1 | About 12 to 20 hours |
| P2 | About 8 to 14 hours |
| P3 | 0 hours |
| Total | About 23 to 40 hours, or roughly 3 to 5 engineer-days |

## Quality Gates

- P0 pass rate is 100%.
- P1 pass rate is at least 95%, with every Epic 9 acceptance criterion covered.
- High-risk R-002 mitigation evidence is complete before release.
- At least 80% of planned automated scenarios pass, with 100% required for the P0 data-integrity scenario.
- Every in-scope NFR category has an identified evidence artifact.
- The render regression tolerance and pre-feature home-screen baseline are defined before release evidence collection.
- Final NFR status is deferred to `nfr-assess` after implementation evidence exists.

# Step 5: Output and Validation

- Mode: epic-level create
- Execution mode: sequential
- Output: `field-sync-indicator/test-artifacts/test-design/test-design-epic-9.md`
- High risk: R-002, score 6; mitigation evidence is required before release
- Gate thresholds: P0 100%, P1 at least 95%, P2 at least 90%, acceptance-criteria coverage 100%, and planned automated coverage at least 80%
- Open planning item: define the home-screen render metric, device profiles, baseline, and acceptable regression tolerance
- Validation: template sections populated, all eight risks scored and traced, all four acceptance criteria covered, NFR evidence planned, interval estimates used, and no implementation tests generated
