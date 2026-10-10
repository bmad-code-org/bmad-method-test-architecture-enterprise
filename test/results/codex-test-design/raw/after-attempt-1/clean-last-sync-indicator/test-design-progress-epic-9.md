---
runScope: 'epic'
runKey: 'epic-9'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T20:50:19-0500'
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

- Mode: Epic-level
- Reason: The invocation explicitly identifies Epic 9 as the sole requirements source.
- Required input: `docs/epics/epic-9-last-sync-indicator.md`
- Run scope: `epic`
- Run key: `epic-9`
- Prerequisite result: Passed

# Step 2: Loaded Context

- TEA options `tea_use_playwright_utils`, `tea_use_pactjs_utils`, `tea_pact_mcp`, `tea_browser_automation`, and `test_stack_type` are unconfigured. Stack detection remains `auto` because the fixture contains no implementation manifests.
- Requirements loaded: Epic 9 and both stories, including all four acceptance criteria.
- Integration points: local settings store lookup, sync completion event, home screen rendering, and `home_last_sync_row` feature flag.
- Existing coverage: no test files, fixtures, framework configuration, source manifests, or prior test design outputs are present in the project fixture.
- Knowledge loaded: required epic-level risk, probability and impact, test-level, and priority guidance. NFR guidance was also loaded because the epic specifies security, data integrity, performance, reliability, and operational rollout constraints.
- Missing inputs: none for this configured run.

# Step 3: Risk and NFR Planning

## Risk Assessment

| Risk ID | Category | Description | Source evidence | Probability | Impact | Score | Mitigation | Owner | Timeline |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| R-001 | BUS | The home screen can show an incorrect or stale latest-sync value, causing a technician to make decisions from an inaccurate freshness signal. | Stories 9.1 and 9.2 require the most recent `lastSuccessfulSyncAt` value and an update on the existing completion event. | 2 | 2 | 4 | Cover initial store hydration, relative-time conversion boundaries, selection of the most recent timestamp, and event-driven refresh at component and integration levels. Confirm the user-visible result in an end-to-end flow. | Feature developer and QA | Before Epic 9 acceptance |
| R-002 | BUS | Conditional visibility can expose a sync row before any successful sync or while `home_last_sync_row` is disabled, changing the previous home screen and confusing technicians. | Acceptance criteria require no row for a never-synced device and an exact restoration of the previous home screen when the flag is off. | 2 | 2 | 4 | Exercise the shared visibility guard across absent-value and disabled-flag states. Add a home-screen visual or structural regression assertion for the flag-off state. | Feature developer and QA | Before rollout enablement |
| R-003 | PERF | The requirement that the existing render budget remain unchanged has no numeric baseline, so a render regression could escape an objective gate. | The constraints state one local lookup, zero new network calls, zero new storage, and an unchanged existing render budget. The existing render budget value is absent. | 2 | 1 | 2 | Prove zero network calls, zero writes, zero polling or timers, and one local-key read. Capture the current home-screen render metric before implementation and use that value as the comparison threshold. | Mobile performance owner | Before performance sign-off |

No risk scores 6 or higher. The two score-4 risks need focused coverage and monitoring. The score-2 performance evidence gap needs a baseline before objective sign-off.

## NFR Planning

| NFR category | In-scope threshold | Missing threshold | Planned evidence |
| --- | --- | --- | --- |
| Security and privacy | The UI exposes only the device-authored sync timestamp to the current device holder. It adds no personal data. | None stated for this bounded change. | End-to-end inspection of the rendered row plus a code-level assertion that the UI reads only `lastSuccessfulSyncAt`. |
| Data integrity | Zero writes to orders, queue entries, or settings. The field access is read-only. | None. | Store spy or integration test proving zero write calls while rendering and after a completion event. |
| Performance | Zero new network calls, zero new storage, one local key lookup, and unchanged home-screen render budget. | Numeric render-budget baseline is UNKNOWN. | Network and storage spies, lookup call-count assertion, and before/after render profiling against the captured baseline. |
| Reliability | An open screen updates from the existing completion event. It uses zero polling loops and zero timers. | Maximum event-to-render latency is UNKNOWN. | Integration test that publishes the completion event and observes the new relative time. Fake-clock coverage proves no timer-driven refresh. |
| Operations | Disabling `home_last_sync_row` restores the previous screen exactly. | None. | End-to-end flag-off structural or visual regression comparison and staged rollout smoke coverage. |
| Maintainability | Reuse the existing settings store and completion-event path. | No quantitative maintainability target is supplied. | Component and integration tests kept at the lowest sufficient levels, with one end-to-end user journey. |

Scalability and broader compliance validation are outside this epic because it adds no server, network, storage, personal-data, or regulatory flow. The highest mitigation priority is accurate freshness behavior, followed by conditional visibility. The render-budget baseline is the sole clarification item.

# Step 4: Coverage and Execution Plan

## Coverage Matrix

| Test ID | Requirement or scenario | Test Level | Priority | Risk Link | Notes |
| --- | --- | --- | --- | --- | --- |
| 9.1-UNIT-001 | Convert stored timestamps into relative text across just-now, minute, hour, day, and future-clock boundary cases. | Unit | P1 | R-001 | Isolated time conversion belongs at unit level. Incorrect text gives technicians a false freshness signal. Dispatch can confirm freshness by radio, with added delay and workload. |
| 9.1-COMP-001 | With a completed sync in the local store, render the latest value as the sync row and expose only the timestamp-derived label. | Component | P1 | R-001 | Covers store-to-UI mapping and the primary acceptance criterion. A wrong or stale row misleads every technician using the screen. Dispatch confirmation remains the manual workaround. |
| 9.2-INT-001 | While the screen is open, publish the existing completion event and verify the row updates to the new latest value without polling or a timer. | Integration | P1 | R-001 | Integration level is required because the risk sits at the event, store, and rendered-component boundary. A missed update leaves the open screen stale until it is reopened. Dispatch confirmation remains available. |
| 9.1-COMP-002 | With `lastSuccessfulSyncAt` absent, omit the entire row and preserve the rest of the home-screen structure. | Component | P1 | R-002 | Covers the never-synced visibility branch at the component boundary. A false row communicates a sync that never occurred. Technicians can ask dispatch, though the UI remains misleading until disabled or fixed. |
| 9.FF-E2E-001 | Disable `home_last_sync_row` and verify the technician sees the previous home screen exactly, including absence of the row. | E2E | P1 | R-002 | The release recovery path is user-facing and needs full-screen validation. Failure removes the documented rollback control for every enabled organization. A new build would be the remaining workaround. |
| 9.NFR-INT-001 | Render the row and process a completion event while instrumentation proves one local-key lookup per read, zero writes, zero new network calls, zero new storage, zero polling, and zero timers. | Integration | P2 | R-003 | The boundary assertions directly verify the epic's local-only and read-only controls. A regression can add latency or mutate state. Disabling the feature flag provides an acceptable recovery path. |
| 9.NFR-COMP-001 | Compare home-screen render performance with the row enabled against the captured pre-change render baseline. | Component | P2 | R-003 | Component profiling isolates the added row from unrelated system load. A measurable slowdown affects a frequently opened screen. The feature flag supplies a safe operational workaround. |

Priority criteria used in this plan:

- P0 covers critical business, security, data-integrity, or compliance impact with no safe workaround.
- P1 covers core, frequent, or complex behavior with material user reach and a limited workaround.
- P2 covers secondary behavior with narrower user reach and an acceptable workaround.
- P3 covers rare, cosmetic, or experimental behavior with minimal impact and an easy workaround.

P0 is empty because the indicator is informational, radio confirmation remains available, and the existing flag provides rollback. P1 holds the core display, refresh, conditional-visibility, and rollback behavior because each affects the home-screen experience across enabled users. P2 holds bounded implementation-control and profiling checks with flag-based recovery. P3 is empty because every planned scenario verifies an acceptance criterion, a scored risk, or an explicit constraint.

## NFR Coverage and Evidence

| NFR category | Planned scenario | Validation level or tool | Expected evidence | Gap handling |
| --- | --- | --- | --- | --- |
| Security and privacy | 9.1-COMP-001 | Component assertion and code review | Test result plus review evidence that only timestamp-derived text is added | No missing threshold |
| Data integrity | 9.NFR-INT-001 | Instrumented integration test | Call trace showing zero store writes and no order or queue mutations | No missing threshold |
| Performance | 9.NFR-INT-001 and 9.NFR-COMP-001 | Integration instrumentation and component profiler | Network, storage, timer, lookup counts plus before-and-after render profile | Capture the existing render baseline before implementation; tracked by R-003 |
| Reliability | 9.2-INT-001 | Event/store/component integration test | Deterministic completion-event trace and updated rendered value | Event-to-render latency threshold remains UNKNOWN; functional event delivery is the current criterion |
| Operations | 9.FF-E2E-001 | End-to-end structural or visual comparison | Flag-off run artifact showing the previous screen exactly | No missing threshold |
| Maintainability | Whole matrix | Unit, component, and integration suites at the lowest sufficient levels | CI results with requirement and risk IDs | No quantitative epic-specific target supplied |

## Execution Strategy

- PR: Run all unit, component, integration, and end-to-end functional scenarios when the combined runtime stays below 15 minutes.
- Nightly: Run render profiling across the supported device or runtime matrix and archive comparison artifacts.
- Weekly: No separate suite is planned because this epic adds no load, chaos, network, or large-dataset path.

## Resource Estimates

- P0: 0 hours because no P0 scenarios are planned.
- P1: approximately 12 to 20 hours.
- P2: approximately 6 to 12 hours.
- P3: 0 hours because no P3 scenarios are planned.
- Total: approximately 18 to 32 hours, with an elapsed timeline of roughly 2 to 4 working days after the test environment and render baseline are available.

## Quality Gates

- P0 pass rate: 100%. No P0 scenarios are currently planned.
- P1 pass rate: at least 95%, with all four acceptance criteria represented by passing evidence.
- High-risk mitigation: all score-6-or-higher risks complete before release. No such risks are currently identified.
- Requirements and risk coverage: at least 80%, with a target of 100% for Epic 9 acceptance criteria and identified risks.
- Constraint regressions: zero new network calls, writes, storage, polling loops, or timers in the Epic 9 path.
- NFR readiness: later assessment has an identified evidence artifact for every in-scope NFR category. Full NFR status remains deferred to `nfr-assess` after implementation evidence exists.

# Step 5: Completion

- Mode: Epic-level, sequential execution
- Output: `field-sync-indicator/test-artifacts/test-design/test-design-epic-9.md`
- Risks: Two score-4 business risks and one score-2 performance evidence risk. No score-6-or-higher risks were identified.
- Gates: P0 at 100%, P1 at 95% or higher, risk and acceptance-criterion coverage at 80% or higher, and complete NFR evidence identification.
- Open assumptions: The existing sync field and event semantics are correct. The implementation test framework and render baseline will be available before test development and performance sign-off.
- Validation: The epic-level checklist passed against the available project inputs. No browser sessions or temporary exploration artifacts were created.
