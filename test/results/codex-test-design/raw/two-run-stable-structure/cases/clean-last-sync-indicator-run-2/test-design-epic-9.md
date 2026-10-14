---
runScope: 'epic'
runKey: 'epic-9'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-14'
inputDocuments:
  - field-sync-indicator/_bmad/config.toml
  - field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md
  - bmod-tea/knowledge/risk-governance.md
  - bmod-tea/knowledge/probability-impact.md
  - bmod-tea/knowledge/test-levels-framework.md
  - bmod-tea/knowledge/test-priorities-matrix.md
  - bmod-tea/knowledge/nfr-criteria.md
---

# Test Design: Epic 9: Show the last successful sync time on the technician home screen

**Date:** 2026-10-14  
**Author:** tea-eval-harness  
**Status:** Draft; design complete, approval pending  
**Project:** field-service-platform  
**Run:** Create, epic-level, full design, sequential execution; capability probe disabled

## Executive Summary

**Scope:** Full test design for Epic 9, stories 9.1 and 9.2. The sole requirements source is [Epic 9](../../docs/epics/epic-9-last-sync-indicator.md). The change displays an existing device-local timestamp and refreshes through the existing sync completion event.

**Risk Summary:**

- Total risks identified: 2 residual story risks.
- High-priority risks (≥6): 0. Medium risks: 0. Low risks: 2.
- Categories represented: BUS and TECH. Highest score: 2.
- The epic states that privacy, read-only access, local lookup cost and feature-flag rollback constraints are already satisfied. Coverage verifies those constraints.

**Coverage Summary:**

- P0 scenarios: 0; 0 hours.
- P1 scenarios: 0; 0 hours.
- P2 scenarios: 11; approximately 4 to 8 hours. P3 scenarios: 0; 0 hours.
- **Total effort:** Approximately 4 to 8 hours, or 0.5 to 1 working day (approximately 0.1 to 0.2 working weeks at 5 days/week) at 8 hours/day, assuming an existing product test harness.
- Levels: 7 Integration, 2 Unit, 2 Component. All four acceptance criteria and both risks have planned coverage.

This is a plan. Tests and execution evidence have yet to be produced. No release or NFR evidence decision is made here.

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Sync engine algorithm, server synchronization and conflict resolution | Stories consume an existing timestamp and completion event. Engine behavior is unchanged. | Preserve existing engine and progress-spinner regressions; exercise the consumer boundary in this plan. |
| Order, queue and settings mutations; storage migrations | The epic explicitly permits only a read from an existing field and adds no storage. | Assert zero row-originated writes, new fields or migrations in the integration guard scenario. |
| New network services, HTTP contracts, Pact and backend load testing | The epic adds no network call; the supplied repository contains no relevant contract artifacts or service implementation. | Trace zero added row-originated network calls. Existing service suites remain outside this epic. |
| New authentication, personal-data exposure and organization flag infrastructure | The timestamp concerns the device itself and the existing organization flag already controls rollout. | Verify display content and flag-off baseline. Retain existing access-control and flag-targeting regressions where the product already has them. |
| New polling, timers and continuous aging between completion events | Story 9.2 explicitly uses the existing completion event and adds no polling or timer. | Check event-driven refresh and zero added scheduled work. Freeze time in tests. |
| New platform, browser or device-lab matrix | No stack manifests, application source, runner, target URL or supported-device matrix are supplied. | Select the product's existing harness when implementing this plan. No platform or vendor is assumed. |

## Risk Assessment

The gap inventory is empty. The epic's context describes an informational feature addition. It supplies no unsafe behavior, unmet target, missing control, new exposure or irreversible release. Its satisfied constraints bound this register. Following the workflow's residual rule, each story owns exactly one risk. Trigger and boundary cases remain in the coverage plan.

Probability uses 1 = unlikely, 2 = possible, 3 = likely. Impact uses 1 = minor with an easy workaround, 2 = degraded operation, 3 = critical blocking, data, security or regulatory consequence. Score = Probability × Impact. Scores 1 to 3 require documentation; 4 requires monitoring; ≥6 requires mitigation; 9 blocks release until resolved or formally waived. Template bands below are retained.

### High-Priority Risks (Score ≥6)

No high-priority risks identified.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |

### Medium-Priority Risks (Score 3-4)

No medium-priority risks identified.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-001 | BUS | Render the last successful sync time: an incorrect or missing relative label leaves the technician asking dispatch whether the device is up to date. Source: Epic 9, story 9.1 and Context. | 2 | 1 | 2 | Document residual display risk. Dev owns the story 9.1 store-to-screen checks before Epic 9 acceptance; verification is the single R-001 coverage row. |
| R-002 | TECH | Keep the value current while the screen is open: completion-event wiring may leave the displayed timestamp stale until the screen reopens. Source: Epic 9, story 9.2 and AC3. | 2 | 1 | 2 | Document residual event-integration risk. Dev owns the story 9.2 completion-to-render checks before Epic 9 acceptance; verification is the single R-002 coverage row. |

For R-001, probability 2 reflects possible timestamp selection, absence handling or formatting mistakes in the added display. For R-002, probability 2 reflects possible completion subscription mistakes. Impact 1 reflects an informational row, the existing dispatch workaround described in Context, and the existing flag that restores the previous screen. The source establishes continued sync and data behavior. It supplies no evidence for probability 3, critical impact, or scored SEC, PERF, DATA or OPS exposure.

### Risk Category Legend

- **TECH:** Technical integration, architecture and scalability.
- **SEC:** Security, access controls and data exposure.
- **PERF:** Performance budgets and resource limits.
- **DATA:** Data loss, corruption and inconsistency.
- **BUS:** Business behavior and user experience.
- **OPS:** Deployment, configuration and monitoring.

## NFR Planning

**Purpose:** Plan epic-specific validation and the evidence a later `nfr-assess` can consume.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Security / privacy | Show only the existing device-written timestamp to its holder; add no personal data or new exposure. Epic: Constraints already satisfied. | - | Check rendered content in story 9.1 integration scenarios and zero new outbound activity in 9.2-INT-004. | Render assertions and integration call trace. |
| Data integrity | Read the existing field read-only; zero added writes or stored fields, with orders, queue entries and settings preserved. | - | 9.2-INT-004 observes row-originated store operations and compares untouched state with baseline. Engine-owned timestamp updates remain allowed. | Read/write trace, field inventory and before/after state assertions. |
| Performance | Single local key lookup on the store already open for the screen; zero added network calls, storage, polling or timers. Existing render budget is unchanged. | - | 9.2-INT-004 compares flag-on/off operations and scheduled work; use the product's existing render-budget check when available. | Operation counts and existing baseline render report. |
| Reliability | Refresh through the existing completion event while open; preserve the existing progress spinner. | R-002 | The story 9.2 integration row verifies visible state transitions after successful completions, including first success. | Event-to-render assertions and spinner regression results. |
| Operations / rollback | Turning home_last_sync_row off restores the previous home screen exactly; retain existing per-organization flag targeting. | - | 9.1-COMP-001/002 compare the entire interface with the prior baseline; retain existing targeting regression. | Deterministic flag fixture, screen comparison and existing targeting results where available. |
| Maintainability | Reuse the existing store, field and completion event. No extra epic-specific quantitative code-quality target is stated. | - | Review the consumer wiring and run the product's existing lint and related regressions when implementation exists. | Change review and existing CI results. |

**Unknown thresholds:** Absolute render-budget milliseconds and a numeric event-to-render deadline are UNKNOWN; the epic specifies neither. Preserve the existing render-budget threshold when available. Event tests await the observable render transition through the harness's normal bounded assertion. That timeout is a test synchronization limit. No new product latency SLA is inferred. Relative-time rounding and wording beyond “synced 4 minutes ago” are UNKNOWN and should follow the existing formatter contract. These implementation assumptions create no additional scored exposure.

Scalability and compliance have no additional epic-specific requirements. Broad security scans, load tests, chaos tests and organization-wide NFR audits are outside this local display change. Evidence availability is unmeasured in this fixture.

## Entry Criteria

- [ ] Dev and the acceptance owner confirm the four epic criteria and the existing relative-time formatter convention.
- [ ] The home-screen implementation and the product's existing unit/component/integration harness are available.
- [ ] Tests can seed the existing local field as present or absent and control the clock and feature flag deterministically.
- [ ] The existing completion event can be exercised through its real consumer boundary; failed-attempt state can be represented without replacing the display logic.
- [ ] A prior home-screen baseline and relevant spinner, store and organization-flag regressions are available.
- [ ] Test instrumentation distinguishes engine-owned work from row-originated work and can observe store, network, timer and listener behavior.

These are execution dependencies. The requirements-only input set satisfies this design workflow's prerequisites.

## Exit Criteria

- [ ] All four acceptance criteria have passing evidence; every acceptance-bearing P2 scenario passes.
- [ ] Both risk-linked integration rows pass, with all their scenarios recorded.
- [ ] All specified local-only, read-only, event-driven and feature-flag constraints are preserved.
- [ ] Relevant existing home-screen, spinner, store and flag regressions pass.
- [ ] No open high-priority or high-severity defect remains; any later waiver records owner, approval, reason and expiry.
- [ ] Planned evidence for each in-scope NFR exists; any unresolved quantitative baseline is recorded for later NFR assessment.
- [ ] P0 and P1 gates apply if those priorities enter scope. Both are currently N/A.

## Project Team

Names are unspecified. Dev owns the implementation-facing tests and fixture wiring. The product acceptance owner confirms displayed semantics and exact flag-off restoration. The release owner retains the existing organization flag procedure. These are responsibility placeholders; no staffing assignment or approval is claimed.

## Test Coverage Plan

P0/P1/P2/P3 express priority. Execution timing is defined in Execution Strategy. Each scored risk appears in exactly one risk-linked row at the first observable boundary. Rows with `-` cover acceptance or regression constraints without a scored risk. Test counts count named scenarios; variants within one scenario remain one scenario.

Both residual risks are P2: the feature is a secondary informational addition, the source describes dispatch as the freshness workaround, and the flag restores the prior screen. The source establishes no revenue-critical consequence, blocked core operation, usage frequency, reach percentage or complex integration. The workaround preserves existing technician operation. Both risks have minor display consequences. Priorities are assigned independently of scores.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

No scenarios meet P0 criteria in the supplied epic.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P0:** 0 tests; 0 hours.

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

No scenarios establish those consequences or reach in this epic.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P1:** 0 tests; 0 hours.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Story 9.1: latest successful sync displayed; AC1 and AC2 | Integration | R-001 | 3 | Dev | Mechanism: read lastSuccessfulSyncAt and render its relative value. Boundary: the owned local settings store, first observable at Integration. 9.1-INT-001: flag on, clock fixed, most recent stored success four minutes earlier displays “synced 4 minutes ago.” 9.1-INT-002: absent key omits the entire row, including reserved space, while the remaining screen matches baseline. 9.1-INT-003: reopen after a newer stored successful timestamp and display that value. Failure leaves freshness information missing or incorrect; dispatch remains the supported workaround (Context). |
| Story 9.2: completion refresh while open; AC3 | Integration | R-002 | 3 | Dev | Mechanism: existing completion subscription drives read and re-render. Boundary: the owned completion-event source, first observable at Integration. 9.2-INT-001: establish an old visible value, then complete two successive successful syncs with distinct timestamps; after each event assert the newest value and existing spinner completion. 9.2-INT-002: establish absence, then first successful completion makes the row appear. 9.2-INT-003: a failed attempt preserves the prior successful value. Failure leaves an informational label stale; reopening re-reads the field under story 9.1, and dispatch remains available (Context). |
| Relative-time formatting used by AC1 | Unit | - | 2 | Dev | Mechanism: pure timestamp-to-relative-label transformation; no external boundary. 9.1-UNIT-001: values around the existing formatter's minute transition. 9.1-UNIT-002: older values around its hour transition. Freeze the clock and assert the established formatter convention; this row covers rounding, while the R-001 row covers store selection and rendering. Reuse existing formatter tests if they already cover these cases. |
| Existing feature flag disabled; AC4 | Component | - | 2 | Dev | Mechanism: flag-controlled composition of one rendered home-screen interface; Component is sufficient for exact screen comparison. 9.1-COMP-001: stored timestamp plus flag off matches the previous home-screen baseline exactly. 9.1-COMP-002: absent timestamp plus flag off matches that baseline. Compare visible structure, spacing, accessible semantics and existing controls with identical fixtures; assert the row is entirely absent. The existing flag is the source-supported recovery control. |
| Satisfied read-only, local-only, event and render-cost constraints | Integration | - | 1 | Dev | 9.2-INT-004: instrument mounting, completion, unmounting and remounting with the flag on/off. Boundary: home-screen consumer with existing store and event adapters. Assert one existing key lookup per required read; zero added writes, fields, store openings, network calls, polling or timers; untouched order/queue/settings state; no added listener survives unmount; existing spinner behavior preserved. Attribute sync-engine timestamp writes to the engine. Compare existing render-budget evidence where available. These verify explicit satisfied controls and imply no additional scored risk. |

**Total P2:** 11 tests; approximately 4 to 8 hours.

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

No separate P3 scenarios are added. Exact layout restoration is explicit acceptance coverage in P2.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P3:** 0 tests; 0 hours.

### Acceptance Traceability

| Criterion | Planned Scenarios | Risk |
| --------- | ----------------- | ---- |
| AC1: relative time of most recent successful sync | 9.1-INT-001, 9.1-INT-003; formatter regression 9.1-UNIT-001/002 | R-001 |
| AC2: never-synced device has no row | 9.1-INT-002 | R-001 |
| AC3: displayed value updates on completion while open | 9.2-INT-001/002; failed-attempt regression 9.2-INT-003 | R-002 |
| AC4: flag off restores previous screen exactly | 9.1-COMP-001/002 | - |

Planned requirement coverage: 4/4 (100%). Planned risk coverage: 2/2 (100%). Existing test coverage and flakiness are unverified because the fixture supplies no tests, source or runner. No E2E or API test is needed to observe either primary risk's owned local boundary. A later product smoke run may reuse existing home-screen checks.

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the suite stays under 15 minutes. Priority expresses consequence; execution timing is decided here.

- **Pull request:** Run all planned unit, component and integration coverage with isolated local fixtures and a frozen clock. Target total duration below 15 minutes; actual duration is unmeasured. When multiple priorities exist, order feedback P0, P1, P2, then P3. Use the product's runner and supported concurrency once known. This workflow executes sequentially.
- **Nightly:** No additional epic-specific long-running suite is justified. Retain the product's existing regression schedule.
- **Weekly:** No additional expensive performance or infrastructure work is justified by this local display epic.

Await completion and rendered-state assertions through deterministic harness synchronization. Avoid fixed sleeps, live organization flag evaluation and timer-driven refresh. Reset store fixtures, clock, flag state and event subscriptions after each scenario. No browser session was opened; exploration and capability probing were inapplicable.

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 0 | N/A | 0 | No critical-impact scenario identified. |
| P1 | 0 | N/A | 0 | No material core-operation scenario established. |
| P2 | 11 | Approximately 0.25 to 1, depending on level | Approximately 4 to 8 | Integration: 3 to 6 hours; Unit: 0.5 to 1; Component: 0.5 to 1. Includes fixtures, baseline and local validation. |
| P3 | 0 | N/A | 0 | No additional scenario required. |
| **Total** | **11** | **Varies** | **Approximately 4 to 8** | **Approximately 0.5 to 1 working day, or 0.1 to 0.2 working weeks.** |

Intervals assume the existing product harness is usable. Application-wide runner setup and provisioning are unestimated execution dependencies. Existing qualifying tests should be reused; the count describes planned coverage, including reusable scenarios.

### Prerequisites

**Test Data:** Fixed clock; device-local settings fixtures with absent, old and newest successful timestamps; existing completion-event fixtures; deterministic home_last_sync_row on/off states. Keep all fixture state isolated and reset after use. No new production field is required.

**Tooling:** The product's existing unit, component and integration runner; existing relative-time formatter assertions; screen baseline comparison; spies or traces at existing store/event/network/timer adapters. Stack and runner are undetermined. TEA utility, browser and Pact settings are unset in the supplied config; no additional integration dependency is assumed.

**Environment:** Existing home-screen render environment with deterministic organization flag control, local store access and completion-event triggering. A live sync server is unnecessary for consumer-boundary validation. No staging URL or supported device profile is supplied.

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100%, if P0 tests enter scope; currently N/A.
- **P1 pass rate:** ≥95%, with approved waivers for failures, if P1 tests enter scope; currently N/A.
- **P2/P3 pass rate:** ≥90% as the general informational threshold. All four acceptance criteria and their acceptance-bearing scenarios must pass for Epic 9 release.
- **High-risk mitigations:** 100% complete or explicitly waived before release if any arise; currently no score ≥6 item exists.

### Coverage Targets

- **Requirements:** 100% of the four acceptance criteria planned, exceeding the default ≥80% target.
- **Risk traceability:** 100% of the two risks have exactly one linked coverage row.
- **Security/privacy and local/read-only constraints:** All stated regression assertions must pass.
- **Business logic and edge cases:** Cover the specified display, absence, success update, failure preservation and formatter transitions. Code-coverage percentages remain unmeasured until code exists; no source-derived line-coverage target is stated.

### Non-Negotiable Requirements

- [ ] All acceptance criteria pass with recorded evidence.
- [ ] No high-risk (≥6) item remains unmitigated without an approved waiver.
- [ ] Privacy, read-only access and zero-added-work constraints are preserved.
- [ ] Flag-off restoration matches the prior screen exactly.
- [ ] Existing completion-event and spinner regressions pass.
- [ ] NFR evidence is collected for each in-scope category; final PASS/CONCERNS/FAIL evaluation is deferred to `nfr-assess` after implementation evidence exists.

## Mitigation Plans

### R-001: Render the last successful sync time (Score: 2)

**Mitigation Strategy:** Document the residual risk and verify the existing store-to-screen path, absence behavior and newest stored timestamp through the R-001 integration row. Reuse the product's relative-time formatter.  
**Owner:** Dev, story 9.1.  
**Timeline:** Before Epic 9 acceptance.  
**Status:** Planned; no execution evidence collected.  
**Verification:** 9.1-INT-001/002/003 pass with fixed-clock rendered-state evidence. Formatter and flag regression rows provide separate constraint evidence.

### R-002: Keep the value current while the screen is open (Score: 2)

**Mitigation Strategy:** Document the residual risk and exercise the existing completion-event consumer, including successive successes, first success and failure preservation. Retain spinner behavior and subscription cleanup.  
**Owner:** Dev, story 9.2.  
**Timeline:** Before Epic 9 acceptance.  
**Status:** Planned; no execution evidence collected.  
**Verification:** 9.2-INT-001/002/003 pass with evidence of the old-to-new visible transition. The separate constraint guard records cleanup and zero-added-work evidence.

## Assumptions and Dependencies

### Assumptions

1. The product has an existing settings-store adapter, completion-event source, flag mechanism and home-screen harness as described by the epic. The fixture cannot verify their implementation.
2. Relative-time wording and rounding follow the existing formatter. The epic gives a four-minute example and supplies no complete formatting specification.
3. Existing render-budget milliseconds, supported platform and assertion timeout will come from the product harness. They are UNKNOWN in this input set. No new latency deadline is introduced.
4. Role placeholders reflect proposed responsibilities. Names, approval dates, observed usage and organization reach are unspecified.

### Dependencies

1. Home-screen source and test harness: required before implementing or executing planned tests.
2. Deterministic clock, local store, flag and completion-event seams: required before integration setup.
3. Prior home-screen baseline and existing relevant regression suites: required before validating exact restoration and interworking.
4. Existing render-budget evidence: required for quantitative comparison if the product already measures it. Zero-added-work assertions remain mandatory.

### Risks to Plan

- **Harness unavailable in this fixture:** Execution effort is conditional. Reuse the actual product harness when available and revise only the execution estimate if setup work is required.
- **Formatting convention or render baseline unavailable:** Record the unknown in the later evidence assessment. Use the source's four-minute example and qualitative zero-added-work constraint; avoid inventing a product threshold.

These are planning assumptions outside the scored register. No requirements question is pending for this run.

## Follow-on Workflows (Manual)

Implementation and test generation are separate future work. `/bmad-tea-automate` can implement the planned coverage once source and harness are available. No P0 scenario is identified for a P0-specific red-mode run. `nfr-assess` can evaluate the collected NFR evidence later. No follow-on workflow is invoked here.

## Approval

**Test Design Approved By:**

- [ ] Product acceptance owner: name and date pending.
- [ ] Tech lead: name and date pending.
- [ ] QA owner, if assigned: name and date pending.

**Comments:** Workflow completion records that the design is written and checked. Human approval and release evidence remain pending.

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| Home-screen renderer | Adds an optional informational row. | Existing screen controls, layout and navigation remain functional; absent timestamp and flag-off baseline comparisons pass. |
| Local settings store | Adds a read of lastSuccessfulSyncAt through the already-open store. | Existing settings reads still pass; row-originated writes and new fields remain zero; unrelated order, queue and settings state is preserved. |
| Sync completion event and progress spinner | Shares the existing completion event with a second consumer. | Existing spinner start/completion behavior passes; successive successful events refresh the row; failed attempts preserve successful time; repeated mount/unmount leaves subscriptions clean. |
| Relative-time formatter | Converts the existing timestamp for display. | Existing formatter convention passes at minute/hour transitions with fixed time. Reuse qualifying tests. |
| Existing organization feature flag | Controls row composition and release recovery. | Existing targeting regression remains green when available; flag-off home screen matches its prior baseline exactly. |

No existing test names, failures or flakes can be established from this requirements-only fixture. The scopes above name the relevant product regressions to locate before execution. Cross-team coordination is required only if the existing harness or organization flag fixtures are shared; no additional team or service is identified in the epic.

## Appendix

### Knowledge Base References

- `bmod-tea/knowledge/risk-governance.md`: Category ownership and mitigation governance.
- `bmod-tea/knowledge/probability-impact.md`: Probability/impact definitions and scores.
- `bmod-tea/knowledge/test-levels-framework.md`: Lowest observable test boundary and coverage overlap.
- `bmod-tea/knowledge/test-priorities-matrix.md`: Business-impact priority decision tree.
- `bmod-tea/knowledge/nfr-criteria.md`: Measurable planned validation and later evidence assessment.

The deterministic fragment selection includes the four required epic fragments and NFR criteria for the explicit privacy, data, performance and operational constraints. CLI and contract fragments have no applicable selection condition. Knowledge examples supply assessment methods; the epic supplies all project requirements.

### Related Documents

- Epic and stories: [Epic 9](../../docs/epics/epic-9-last-sync-indicator.md), stories 9.1 and 9.2, four acceptance criteria and Constraints already satisfied.
- Config: [TEA/core configuration](../../_bmad/config.toml).
- Template: `skill/test-design-template.md`.
- PRD, architecture, tech spec, sprint status and prior system-level test designs: N/A for this run's input set.

**Generated by:** BMad TEA Test Architect Module  
**Workflow:** `bmad-tea-test-design`  
**Template version:** 4.0 (BMad v6); supplied workflow instructions version 5.0
