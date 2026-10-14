---
runScope: 'epic'
runKey: 'epic-9'
mode: 'epic-level'
designLevel: 'full'
executionMode: 'sequential'
capabilityProbe: false
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-14'
inputDocuments:
  - 'field-sync-indicator/_bmad/config.toml'
  - 'field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md'
  - 'bmod-tea/knowledge/tea-index.csv'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Test Design: Epic 9: Show the last successful sync time on the technician home screen

**Date:** 2026-10-14  
**Author:** tea-eval-harness  
**Status:** Draft. Design workflow complete; implementation validation and approval pending.

## Executive Summary

**Scope:** Full epic-level test design for stories 9.1 and 9.2. The sole requirements source is [Epic 9](../../docs/epics/epic-9-last-sync-indicator.md). The home screen reads the existing `lastSuccessfulSyncAt`, omits the row when the field is absent, refreshes on existing successful-completion events, and restores its prior appearance when `home_last_sync_row` is disabled.

**Risk Summary:**

- Total risks identified: 2 residual story risks.
- High-priority risks (≥6): 0. Medium risks (3-4): 0. Low risks (1-2): 2.
- Categories represented: BUS and TECH. No critical category is evidenced.
- The epic states that privacy, read-only access, local-only execution, render budget, and organization flag rollback are already satisfied. These controls receive regression assertions.

**Coverage Summary:**

- P0 scenarios: 0; effort N/A.
- P1 scenarios: 0; effort N/A.
- P2 scenarios: 14; approximately 6 to 10 hours.
- P3 scenarios: 0; effort N/A.
- Levels: 8 Integration, 3 Component, 3 Unit.
- **Total effort:** approximately 6 to 10 hours; roughly 1 to 2 working days, or 0.2 to 0.4 working weeks.

All coverage is planned. The supplied project contains the epic and configuration, with no application code, test suite, fixtures, runner configuration, or runnable target. Existing coverage and flakiness cannot be assessed from execution. No PRD, architecture document, or sprint status is required for this run. No tests were generated or executed.

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Sync engine correctness, transport, retries and queue processing | The epic consumes the engine's existing timestamp and completion event. It adds no sync behavior. | Preserve existing engine regression coverage when available; verify the existing completion/spinner interaction at the home boundary. |
| Settings migrations, new storage and order or queue mutations | The epic specifies a single existing local key lookup with read-only access and no new stored field. | Assert zero feature writes or added fields and preserve existing unrelated local data. |
| New network services, API contracts, service load and broad security audits | No endpoint, network call, additional personal data or external exposure is introduced. | Assert local-only execution and unchanged displayed data scope; existing platform suites remain applicable when available. |
| Feature flag infrastructure and organization targeting implementation | `home_last_sync_row` and organization release toggles already exist. | Exercise its existing enabled/disabled evaluation path and verify exact home-screen rollback. |
| Periodic aging, polling and timer refresh | Story 9.2 specifies refresh on completion events and explicitly adds no polling or timer. | Verify event-driven refresh and zero feature-owned polling/timers. Passage of time alone carries no refresh acceptance criterion. |
| Broad device matrix, clock corruption and new localization policies | The source states no target platforms, malformed timestamp behavior, locale matrix or new formatting policy. | Use the application's existing supported environment and formatting contract when implementation is available. Record any extra requirements separately before widening this plan. |

## Risk Assessment

**Derivation:** The epic describes no absent control, destructive behavior, unprotected exposure, unmet target or irreversible release. Its context explains the need for the new display. Under the workflow's no-gap procedure, each story has exactly one residual risk. Boundary and trigger cases remain in the coverage plan.

Probability: 1 unlikely, 2 possible, 3 likely. Impact: 1 minor with an easy workaround, 2 material degradation, 3 critical business, data, security or regulatory harm. Score equals probability multiplied by impact. Actions: 1-3 DOCUMENT, 4-5 MONITOR, 6-8 MITIGATE, 9 BLOCK. The template's risk bands below retain their declared score ranges.

### High-Priority Risks (Score ≥6)

None identified.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |

### Medium-Priority Risks (Score 3-4)

None identified.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-001 | BUS | Render the last successful sync time: a wrong value or incorrect omission leaves technicians asking dispatch about device freshness. Source: Epic 9, story 9.1, which reads existing `lastSuccessfulSyncAt` as relative time and hides the row when absent. | 2 | 1 | 2 | DOCUMENT. Dev owns story 9.1; validate the local-store-to-home mapping before story acceptance. QA reviews hidden-row baseline preservation. |
| R-002 | TECH | Keep the value current while the screen is open: a missed completion refresh leaves the previous successful sync visible. Source: Epic 9, story 9.2, which re-renders on the existing completion event also used by the progress spinner. | 2 | 1 | 2 | DOCUMENT. Dev owns story 9.2; validate the completion-publisher-to-home boundary and spinner regression before story acceptance. |

Both probabilities are 2 because the new rendering and subscription paths can contain implementation mistakes. The source provides no known defect supporting probability 3. Both impacts are 1: this informational addition has the explicit radio/dispatch workaround from the epic's context, and the existing flag restores the previous screen. Essential sync and work execution continue under the stated scope constraints. All actions and evidence remain planned.

### Risk Category Legend

- **TECH:** Technical integration, architecture or scalability failure.
- **SEC:** Security or data exposure.
- **PERF:** Performance budget or resource degradation.
- **DATA:** Data loss, corruption or inconsistency.
- **BUS:** Business logic or user-experience harm.
- **OPS:** Release, configuration or operational failure.

## NFR Planning

This section plans evidence for later validation. Final NFR assessment is deferred to `nfr-assess` after implementation evidence exists. Satisfied controls have no additional scored risk link.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Security / privacy | Zero added personal-data fields; device's own timestamp shown to its holder, as stated in the constraints. | - | Inspect row content and incremental side effects in 9.1-INT-004. | Integration assertion report and rendered content capture. |
| Data safety | Zero feature writes, zero new stored fields, read-only access to the existing settings store. | - | Store instrumentation in 9.1-INT-004 distinguishes test seeding from feature behavior. | Store call trace and before/after local-data comparison. |
| Performance | Single local key lookup using the already-open store; zero feature network calls, polling or timers; existing render budget unchanged. | - | 9.1-INT-004 and 9.2-INT-004 compare incremental work with the flag-off baseline. Use the application's existing render-budget check when available. | Key-read, write, request and timer/subscription traces; existing render-budget report if defined. |
| Reliability | Latest stored success value on render; refresh when sync completes while home remains open. | R-001, R-002 | Owned store/event Integration scenarios in the two primary coverage rows. | Timestamp seed, event trace, before/after label assertions and spinner results. |
| Operations | Existing organization flag disables the row and restores the prior home screen exactly without a new build. | - | Component baselines with the existing flag evaluated off, for populated and absent timestamps. | Prior-home baseline and component layout/content comparison artifacts. |
| Maintainability | Reuse the existing store, event and flag paths. No new quantitative code-quality requirement is supplied. | - | Scoped side-effect checks plus existing lint/type checks when the application's runner is available. | Integration reports and existing CI quality-check results; no invented percentage threshold. |

**Unknown thresholds:** The numerical home render budget is **UNKNOWN** in the epic. Its unchanged-budget constraint remains authoritative. Dev must locate any existing budget and baseline in the application before making quantitative performance claims. Exact relative-time rounding, singular/plural wording and sub-minute labels are **UNKNOWN**; formatter boundary expectations use the existing application policy. No new load, throughput, security-audit or compliance threshold is supplied. Scalability and compliance add no epic-specific requirement. These implementation clarifications sit outside the scored register.

## Entry Criteria

- [ ] Dev and QA have accepted the four epic criteria and documented the existing relative-time policy used by boundary assertions.
- [ ] An implementation build, its existing runner and a representative supported environment are available.
- [ ] Fixtures can seed or omit the existing key, freeze the test clock and clean up per test.
- [ ] Tests can observe the existing successful-completion event, home rendering and spinner without adding production APIs.
- [ ] Existing `home_last_sync_row` evaluation can be set on/off through the application's supported test seam.
- [ ] A prior-home baseline and scoped store/network/timer instrumentation are available.
- [ ] Any existing quantitative render budget is located before quantitative profiling; structural constraint checks can proceed independently.

## Exit Criteria

- [ ] All 14 planned scenarios pass, including all four acceptance criteria and each primary risk row.
- [ ] Flag-off and absent-value baselines preserve prior layout, content and existing controls exactly.
- [ ] Scoped evidence shows read-only/local-only/event-only behavior and unchanged spinner interaction.
- [ ] No unresolved high-severity defect or unmitigated high-risk item remains.
- [ ] Each in-scope NFR has its planned evidence, and any unresolved numeric budget is recorded explicitly for later assessment.
- [ ] Dev and QA accept coverage as sufficient; design approval is recorded separately below.

## Project Team

Role ownership supports the handoff. Personal names are unavailable.

| Name | Role | Testing Responsibilities |
| ---- | ---- | ------------------------ |
| Unassigned | Dev / Tech Lead | Own store/event/unit/component coverage, fixtures, existing runner and render-budget clarification. |
| Unassigned | QA Lead | Review baseline artifacts, acceptance traceability and evidence completeness. |
| Unassigned | Product Manager | Confirm formatting expectations and acceptance of secondary-feature scope. |

An architect role is N/A for this scoped display addition; no architecture review is requested.

## Test Coverage Plan

P0/P1/P2/P3 express priority. Execution timing is defined in Execution Strategy. Each scored risk has one primary linked row at its first observable owned boundary. Rows with `-` cover acceptance details or already satisfied controls. Unit arithmetic, Integration wiring and Component layout assert separate aspects.

**Priority rationale:** For R-001, incorrect display loses a secondary convenience and technicians can ask dispatch over the radio. For R-002, delayed display refresh has the same informational consequence and workaround. The epic preserves existing sync operations and supplies flag rollback. It states no critical loss, usage metric, complex implementation or limited-workaround core journey. Both primary rows and their supporting regressions meet P2. The flag supports release recovery; the radio/dispatch path resolves the original freshness question.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

No scenarios meet these criteria in the supplied scope.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P0:** 0 tests; effort N/A.

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

No scenarios meet these criteria in the supplied scope.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P1:** 0 tests; effort N/A.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Story 9.1: most recent local timestamp and absent state; AC1 and AC2 | Integration | R-001 | 3 | Dev | Mechanism: incorrect key-to-view mapping or omission. Boundary: owned local settings store to home view, yielding Integration. **9.1-INT-001:** seed `lastSuccessfulSyncAt` at fixed now minus four minutes; home shows that value as relative time. **9.1-INT-002:** omit the key; row is absent and existing home content remains. **9.1-INT-003:** seed a later completed-sync value before reopening home; home reads the latest value. Consequence: inaccurate freshness convenience. Workaround: dispatch/radio, documented in the epic context. |
| Story 9.2: update while home stays open; AC3 | Integration | R-002 | 3 | Dev | Mechanism: missed completion subscription or refresh. Boundary: existing owned completion publisher to home view, yielding Integration. **9.2-INT-001:** assert old label, complete sync through the existing success path, then assert the newly stored success value without navigation. **9.2-INT-002:** begin with absent key, complete first successful sync, then assert the row appears. **9.2-INT-003:** complete successive successful syncs; assert the latest stored value after each and preserve the existing spinner completion behavior. Consequence: stale informational label. Workaround: dispatch/radio, documented in the epic context. |
| Story 9.1: relative-time formatting boundaries | Unit | - | 3 | Dev | Mechanism: formatter arithmetic and rounding with a fixed clock; no boundary, yielding Unit. **9.1-UNIT-001:** four-minute example. **9.1-UNIT-002:** immediately below a minute boundary. **9.1-UNIT-003:** at the minute boundary. Expected words and rounding follow the existing formatter policy. These validate pure formatting; the primary Integration row validates key selection and view wiring. Reuse any equivalent existing formatter tests when available. |
| Story 9.1 and flag constraint: exact hidden-row layout; AC2 and AC4 | Component | - | 3 | Dev; QA reviews baselines | Mechanism: conditional home layout within one rendered interface unit, yielding Component. **9.1-COMP-001:** flag on, timestamp absent; compare the full home with its prior baseline. **9.1-COMP-002:** flag off, timestamp present; compare with prior home exactly. **9.1-COMP-003:** flag off, timestamp absent; compare with prior home exactly. Assert no blank row space, displacement, control change or added accessible content. Flag evaluation follows the existing application lifecycle. These check layout restoration separately from store-driven omission. |
| Already satisfied local-only, read-only and event-only constraints | Integration | - | 2 | Dev | Mechanism: incremental side effects across existing owned store/event boundaries, yielding Integration. **9.1-INT-004:** instrument home rendering; assert one local key lookup using the already-open store, read-only access, zero feature writes/new fields/network calls and unchanged personal-data scope. **9.2-INT-004:** observe the open screen and completion subscription; assert zero feature polling, timers or periodic reads and preserve the existing spinner subscriber. Compare with flag-off baseline to isolate existing unrelated work. Test setup seeding and the sync engine's legitimate timestamp write are recorded separately. |

**Total P2:** 14 tests; approximately 6 to 10 hours. Each listed ID represents one scenario; Integration 8, Component 3, Unit 3.

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

No additional rare or experimental behavior is stated. Layout preservation implements explicit acceptance and remains P2.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P3:** 0 tests; effort N/A.

**Acceptance traceability:** AC1 maps to 9.1-INT-001 and 003; AC2 maps to 9.1-INT-002 and the distinct layout assertion in 9.1-COMP-001; AC3 maps to 9.2-INT-001 through 003; AC4 maps to 9.1-COMP-002 and 003. These AC labels follow the order of the epic's four acceptance bullets.

API coverage is N/A because no service HTTP contract changes. E2E coverage is N/A for the primary risks: they first become observable across the single owned store or event boundary. No multi-deployable journey or real-device deadline is required by this epic.

## Execution Strategy

**Philosophy:** Run all functional scenarios in pull requests while the suite stays under 15 minutes; defer work with material infrastructure or duration cost.

- **Pull request:** Run the scoped Unit, Component and Integration suite with isolated seeds, controlled flags and a fixed clock. Collect assertion reports and baseline comparisons. Use the existing runner; if it is Playwright, use parallel isolated workers. Current runtime is unmeasured because no runner is supplied.
- **Nightly:** No dedicated nightly work is justified by this epic. Existing broader regressions retain their current schedule.
- **Weekly:** No dedicated weekly load, chaos or device-matrix work is justified by this epic.

Within the PR job, run fast formatter checks, Component checks, then Integration checks. Use event-driven assertions and observable state transitions; avoid arbitrary sleeps. Do not add production polling or timers for test synchronization.

## Resource Estimates

### Test Development Effort

Ranges include fixture wiring, scoped instrumentation, baseline setup and result triage. They assume an existing application and runner become available.

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 0 | N/A | N/A | Empty priority band. |
| P1 | 0 | N/A | N/A | Empty priority band. |
| P2 | 14 | Shared setup; no per-test precision | Approximately 6 to 10 | Simple local state, controlled events and home baselines. |
| P3 | 0 | N/A | N/A | Empty priority band. |
| **Total** | **14** | **N/A** | **Approximately 6 to 10** | **About 1 to 2 working days, or 0.2 to 0.4 working weeks.** |

### Prerequisites

**Test Data:** Deterministic timestamp fixtures: absent key, fixed now minus four minutes, formatter boundary values and successive successful completion values. Fixtures isolate the existing store per test and restore seed state. Flag fixtures set the existing organization evaluation on/off.

**Tooling:** Application's existing Unit/Component/Integration runner, controllable test clock, existing flag seam, store and completion-event instrumentation, and layout/baseline comparison. Runner and platform are **UNKNOWN** until application code is supplied. No vendor or test package is mandated by the configuration.

**Environment:** Representative supported home-screen build; prior-home baseline with identical clock, dimensions, fonts and surrounding data; reachable existing sync success path or supported owned test seam. No new service deployment or storage migration is required by the epic.

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100% if P0 scenarios are introduced; current band is empty.
- **P1 pass rate:** ≥95%, with approved waivers for failures if P1 scenarios are introduced; current band is empty.
- **P2/P3 pass rate:** General informational threshold ≥90%. Epic 9 acceptance requires all 14 planned cases and all four acceptance criteria to pass because its suite is small and explicit.
- **High-risk mitigations:** 100% complete or formally approved waivers before release if high risks emerge. No high risk is currently registered.
- **Defects:** No unresolved high-severity regression. Any deferred lower-severity defect records an owner, reason and review date.

### Coverage Targets

- **Acceptance criteria:** 100% planned and verified coverage of all four criteria, exceeding the general ≥80% target.
- **Scored risks:** 100% primary coverage, with exactly one primary row per risk.
- **Business logic and edges:** All listed formatter boundary and missing/first/successive-value scenarios have executable assertions. Global code-coverage percentages are N/A because no source or existing policy is supplied.
- **Security constraints:** 100% of the stated unchanged-data-scope assertions. Broad new security scenarios are N/A.

### Non-Negotiable Requirements

- [ ] All scoped acceptance and regression cases pass.
- [ ] Any newly identified high risk is mitigated before release.
- [ ] Local-only, read-only, no-new-data, no-polling and no-timer constraints hold.
- [ ] Prior home-screen restoration and spinner behavior are preserved.
- [ ] Planned NFR evidence is recorded; any existing quantitative render budget is checked when available.
- [ ] Final NFR evidence assessment occurs through `nfr-assess` after implementation evidence exists. Current release gate is **not evaluated**.

## Mitigation Plans

High-risk mitigation plans are N/A. The low-risk story actions below keep ownership and verification explicit.

### R-001: Incorrect initial relative display or omission (Score: 2)

**Mitigation Strategy:** Read the existing timestamp through the existing store path, apply the existing relative formatter and conditionally render on field presence. Validate the owned mapping using the story 9.1 primary Integration row; supporting Unit and Component cases cover arithmetic and layout.  
**Owner:** Dev for story 9.1; QA reviews baseline artifacts.  
**Timeline:** Before story 9.1 acceptance.  
**Status:** Planned.  
**Verification:** 9.1-INT-001 through 003 pass with fixed seeds and recorded outputs.

### R-002: Missed completion-driven refresh (Score: 2)

**Mitigation Strategy:** Reuse the existing completion publisher and refresh the displayed stored success value while home stays open. Preserve the spinner subscriber.  
**Owner:** Dev for story 9.2.  
**Timeline:** Before story 9.2 acceptance.  
**Status:** Planned.  
**Verification:** 9.2-INT-001 through 003 pass with an observed pre-event value, successful completion and the expected changed value.

## Assumptions and Dependencies

### Assumptions

1. Timestamp representation and relative formatting follow the existing application contract. The epic's four-minute example is usable directly; boundary rounding expectations await that existing policy.
2. The existing store, event and flag can be controlled and observed by the repository's own testing tools. Their APIs and platforms are unverified from this fixture.
3. Flag rollback is tested at the application's existing evaluation point. The epic supplies no separate immediate live-toggle deadline.
4. Current-time aging without a completion event is outside the stated behavior. No polling or timer refresh is introduced.
5. Constraint statements are the design's supplied facts. Later implementation evidence may require risk reassessment if it exposes a new gap.

### Dependencies

1. Implementation build and existing runner: Dev, required before test execution.
2. Relative-time policy, timestamp fixture representation and supported flag seam: Dev with Product, required before encoding expected strings.
3. Isolated local-store fixtures, event observation and side-effect instrumentation: Dev, required before Integration execution.
4. Prior-home baseline: Dev and QA, required before Component layout verification.
5. Existing numerical render budget, if the application defines one: Dev, required before quantitative render-budget claims.

### Risks to Plan

The supplied workspace supports document planning only. Unavailable test seams or formatter policy may delay later test execution. Contingency: locate the existing application facilities and policy before implementation assertions are encoded; revise estimates if substantial runner setup is required. This execution dependency adds no product risk to the source-bounded register.

## Follow-on Workflows (Manual)

`/bmad-tea-automate` may consume this plan once the implementation context is available. A P0 red-mode handoff is N/A because this plan has zero P0 scenarios. Test generation, framework setup, CI changes and `nfr-assess` are separate, explicitly invoked work. This run performs none of them.

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Unassigned; date pending.
- [ ] Tech Lead: Unassigned; date pending.
- [ ] QA Lead: Unassigned; date pending.

**Comments:** Approval and stakeholder acceptance of exclusions are pending. No meeting or team review was scheduled by this run.

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| Home screen | Adds one conditional informational row. | Preserve surrounding content and controls; absent-value and flag-off states match the prior home baseline exactly. |
| Local settings store | Reads existing `lastSuccessfulSyncAt` through the already-open store. | Correct key selection; one local lookup; zero feature writes/new fields and unchanged unrelated settings, queue entries and orders. |
| Existing completion publisher and spinner | Home subscribes to the existing completion signal. | Refresh from successful completion; preserve spinner completion behavior and existing subscriber effects; zero feature polling/timers. |
| Existing organization flag | Controls visibility and rollback. | Existing enabled/disabled evaluation semantics; disabled state restores prior home for populated and absent timestamp values. |

No cross-team dependency is stated. Dev and QA coordinate existing home, store, spinner and flag regression selection when application code is available. Existing suite names and results are unavailable, so no existing regression is claimed as passed.

## Appendix

### Knowledge Base References

- `risk-governance.md`: Categories, ownership and traceability.
- `probability-impact.md`: Probability/impact scales and remediation actions.
- `test-levels-framework.md`: Unit, Component and owned-boundary Integration selection.
- `test-priorities-matrix.md`: Priority decision criteria and recoverability.
- `nfr-criteria.md`: Planned measurable validation and later evidence assessment.

These are methodology sources. Product requirements come solely from the epic.

### Related Documents

- Epic: [epic-9-last-sync-indicator.md](../../docs/epics/epic-9-last-sync-indicator.md).
- TEA configuration: [_bmad/config.toml](../../_bmad/config.toml).
- PRD, Architecture, Tech Spec and sprint status: N/A for this run.
- Prior system-level designs and existing test artifacts: unavailable.

**Validation:** Applicable items in `skill/checklist.md` checked for epic-level scope. Risk scores, source evidence, single primary coverage links, scenario totals, priority criteria, NFR evidence planning, estimates and template sections validated. Implementation outcomes and human approvals remain pending. No CLI session was opened; no exploration artifact or test code was created. Source documentation remains unchanged.

**Generated by:** BMad TEA Test Architect Module  
**Workflow:** `bmad-tea-test-design`  
**Template version:** 4.0 (BMad v6)
