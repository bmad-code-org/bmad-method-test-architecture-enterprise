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
  - field-sync-indicator/_bmad/config.toml
  - field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md
  - bmod-tea/knowledge/tea-index.csv
  - bmod-tea/knowledge/risk-governance.md
  - bmod-tea/knowledge/probability-impact.md
  - bmod-tea/knowledge/test-levels-framework.md
  - bmod-tea/knowledge/test-priorities-matrix.md
  - bmod-tea/knowledge/nfr-criteria.md
---

# Test Design: Epic 9: Show the last successful sync time on the technician home screen

**Date:** 2026-10-14
**Author:** tea-eval-harness
**Status:** Draft; test execution and approval pending

## Executive Summary

**Scope:** Full epic-level test design for Epic 9 of field-service-platform. The sole requirements source is [Epic 9](../../docs/epics/epic-9-last-sync-indicator.md), including stories 9.1 and 9.2. This plan covers reading the existing `lastSuccessfulSyncAt` field, displaying relative time, omitting the row for a never-synced device, updating on the existing completion event, and restoring the previous home screen through `home_last_sync_row`.

**Risk Summary:**

- Total risks identified: 2 residual story risks.
- High-priority risks (score ≥6): 0.
- Categories represented: BUS and TECH. Both risks score 2; no critical category exposure is established.

**Coverage Summary:**

- P0 scenarios: 0; 0 to 0 hours.
- P1 scenarios: 0; 0 to 0 hours.
- P2 scenarios: 11; approximately 6 to 10 hours.
- P3 scenarios: 0; 0 to 0 hours.
- **Total effort:** Approximately 6 to 10 hours, or 1 to 2 working days, assuming existing test seams and a runner are available.
- Planned acceptance-criteria coverage: 4/4. Planned risk coverage: 2/2. These are design mappings; execution evidence is pending.

Repository inspection found the epic and TEA configuration, with no application code, manifests, test runner, fixtures, existing tests, or prior system test plans. Stack detection remains undetermined. Optional library and browser settings are unset; no conditional integration branch is enabled. The requested execution mode is sequential and capability probing is disabled. No browser exploration target is supplied. PRD, architecture, and sprint status are outside this run's inputs.

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| Sync engine algorithms, remote services, dispatch systems | Epic consumes a timestamp and event the engine already produces. It adds no remote interaction. | Preserve existing engine/spinner regressions when available; verify the consumer's local store and event boundaries. |
| New persistence, migrations, queue/order mutation | Story 9.1 states a read-only local key lookup and no new stored field. | Assert zero feature writes/new fields and unchanged unrelated local state in integration coverage. |
| New privacy/authentication/compliance controls | Constraints state a device-owned timestamp shown to its holder with no added personal data or audience. | Verify row content stays limited to relative sync time; retain the product's existing access controls. |
| Load, stress, chaos, and platform scalability programs | One local lookup on an already-rendered screen adds no network or storage workload. No such program is requested. | Check the stated lookup/resource constraints and existing render budget; expand only if evidence establishes a changed exposure. |
| Automatic relative-time ticking, polling, new timers | Story 9.2 explicitly updates on completion events and adds no polling or timer. | Verify event-driven refresh and zero added schedulers. Idle elapsed-time refresh has no acceptance criterion. |
| New test generation or implementation changes | This run produces a test design. | Hand the planned scenarios to a later implementation/testing workflow. |

## Risk Assessment

The supplied epic states no missing control, known unsafe/destructive behavior, unmet target, unprotected exposure, or irreversible release. Its context describes the requested display benefit. The explicitly satisfied privacy, read-only, local-only, performance, and flag controls define regression constraints. Following the workflow's no-gap procedure, this register has exactly one residual risk per story.

Probability: 1 = unlikely under standard implementation; 2 = possible with edge cases or partial unknowns; 3 = likely with known defects or high ambiguity. Impact: 1 = minor; 2 = degraded feature with a manual workaround; 3 = critical blocker or data/security/regulatory exposure. Score = Probability × Impact. Scores 1 to 3 are documented, 4 is monitored, 6 to 8 require mitigation, and 9 blocks release until resolved. The template bands below retain their specified ranges.

### High-Priority Risks (Score ≥6)

No identified risks in this band.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |

### Medium-Priority Risks (Score 3-4)

No identified risks in this band.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-001 | BUS | Render the last successful sync time: story 9.1 reads existing `lastSuccessfulSyncAt` and renders relative time. An incorrect or omitted value leaves technicians asking dispatch about freshness. Source: Epic 9, story 9.1, AC1/AC2, Context. | 1 | 2 | 2 | Document and verify store-to-screen rendering and missing-field omission. Owner: story 9.1 developer. Timeline: before Epic 9 release. |
| R-002 | TECH | Keep the value current while the screen is open: story 9.2 re-renders on the existing completion event. A missed refresh leaves an old success time visible until the screen is reopened. Source: Epic 9, story 9.2 and AC3. | 1 | 2 | 2 | Document and verify event-to-screen refresh. Owner: story 9.2 developer. Timeline: before Epic 9 release. |

Both probabilities are 1 because the feature reuses a local settings store/key and a completion event already used by the spinner. Both impacts are 2 because a failure loses the information benefit while technicians retain the dispatch workaround described in Context. The source establishes no critical deadline, essential-operation blockage, permanent loss, or new privacy exposure. Unknown implementation details are execution assumptions. Store-cache and refresh trigger cases stay within their story's coverage row.

### Risk Category Legend

- **TECH:** Technical/architecture integration and correctness.
- **SEC:** Security, access, and data exposure.
- **PERF:** Performance budgets and resource use.
- **DATA:** Data integrity, loss, and corruption.
- **BUS:** User experience and business logic.
- **OPS:** Deployment, configuration, and rollback.

## NFR Planning

**Purpose:** Plan epic-specific validation and evidence for later `nfr-assess`. All evidence below is expected from subsequent execution.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Security/privacy | Only device-owned relative sync time is displayed to the device holder; zero added personal data or recipients, per satisfied constraints. | - | Inspect content during store-to-screen cases; observe zero added feature network traffic during constraint checks. | Integration assertion report and side-effect trace. |
| Data integrity | Zero writes from this feature, zero new fields/storage; existing orders, queues, and settings unchanged. | - | Integration side-effect instrumentation on mount and event render. Attribute the existing sync engine's legitimate timestamp write separately. | Store write trace and before/after state comparison. |
| Performance | A single local key lookup using the already-open store; zero added network calls, polling, or timers; existing render budget unchanged. | - | Integration instrumentation for lookup and resource counts; use the existing render-budget check on matched screen states. | Resource trace and existing budget/baseline comparison. Numeric budget is UNKNOWN in supplied source. |
| Reliability | Completion event refreshes the visible value during the open-screen lifecycle. No refresh deadline is specified. | R-002 | Integration before/after assertions for existing success and first success; retain progress-spinner behavior. | Event/store/render trace and test report. |
| Operations | Existing organization-scoped `home_last_sync_row` off restores previous home screen exactly; no new build required. | - | Component flag-off scenarios using the existing evaluation lifecycle and pre-feature screen baseline. | Render-tree and visual comparison report. |
| Maintainability | Reuse existing key/store/event/flag and project test conventions. No new numeric quality target is supplied. | - | Reuse formatter coverage if present; run existing project lint and quality checks once implementation is available. | Applicable project quality output and scenario traceability. |

**Unknown thresholds:** The numeric existing render budget and its baseline are UNKNOWN here. Obtain the product's existing budget before performance sign-off. Formatter rounding, supported locales, timestamp encoding, and feature-flag propagation timing are unspecified implementation contracts. Use the existing product contracts at execution; this plan adds no numerical latency, locale, or live-toggle deadline. Scalability and compliance have no separate epic-specific target. No supplied source states an NFR gap warranting another scored risk.

## Entry Criteria

- [ ] Dev and QA confirm the four acceptance criteria and existing formatter/flag/store contracts.
- [ ] Implemented home screen and an accessible project test runner are available.
- [ ] Isolated timestamp-present and key-absent fixtures are available with cleanup.
- [ ] Tests can freeze the clock and drive the existing successful-sync event after the engine's store update.
- [ ] Both `home_last_sync_row` states can be selected using the existing organization flag mechanism.
- [ ] A pre-feature home-screen baseline and the existing render-budget threshold/check are available.

These are execution prerequisites. The supplied requirements are sufficient to complete this design.

## Exit Criteria

- [ ] All 11 planned P2 scenarios pass; all four acceptance criteria have recorded evidence.
- [ ] Both scored risks have verified coverage at their owned boundaries.
- [ ] Exact flag-off and missing-field screen restoration, spinner behavior, and side-effect constraints are verified.
- [ ] No unresolved high-severity defect or newly identified high-risk item remains.
- [ ] Existing render-budget evidence is recorded; outstanding NFR evidence is assessed through the later NFR workflow.
- [ ] Any approved deviation includes a reason, accountable owner, approver, and expiry. No waiver is granted by this plan.

## Project Team

Role ownership is needed for the handoff. Named approvers are unknown.

| Name | Role | Testing Responsibilities |
| ---- | ---- | ------------------------ |
| Unassigned | Story 9.1 developer | Store/display, formatter, omission, and flag-restoration coverage. |
| Unassigned | Story 9.2 developer | Completion-event refresh and spinner regression coverage. |
| Unassigned | QA Lead / reviewer | Shared side-effect fixtures, baseline evidence, and release acceptance review. |
| Unassigned | Dev Lead / Tech Lead | Store/event/flag integration contracts and existing regression ownership. |
| Unassigned | Product Manager | Acceptance criteria, exclusions, and approval of intended behavior. |
| N/A | Architect | No architecture change is specified; existing boundaries are reused. |

## Test Coverage Plan

P0 through P3 describe priority. Execution timing is defined in Execution Strategy. Priority follows business impact, reach, and workaround availability. The epic adds secondary information to a working screen. Dispatch remains available to answer freshness questions. The existing flag supports release reversal. Usage percentages, incident history, and complex implementation are unspecified. Each residual risk therefore has P2 coverage: R-001 affects displaying freshness; R-002 affects refreshing freshness. The constraint assertions support the same bounded feature. The flag's ability to hide the row addresses rollback; dispatch addresses the underlying freshness question.

Each risk appears in exactly one row at its first observable boundary. Rows with `-` in Risk Link verify requirements or already-satisfied constraints with no additional scored risk.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score supplies supporting evidence.

No P0 scenarios are justified by the supplied epic's consequences and satisfied controls.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P0:** 0 tests; 0 to 0 hours.

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score supplies supporting evidence.

No P1 scenarios are established. The added informational row has the source-supported dispatch workaround; the epic supplies no evidence of material reach or essential-operation degradation.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P1:** 0 tests; 0 to 0 hours.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score supplies supporting evidence. This plan's scope is the technician information row; actual population reach is unspecified.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Story 9.1; AC1 most recent successful sync relative time; AC2 never-synced row omitted | Integration | R-001 | 2 | Story 9.1 developer | Mechanism: home reads `lastSuccessfulSyncAt` from the existing settings store; one owned store-to-screen boundary makes Integration the first observable level. Scenarios: **9.1-INT-001**, seed latest timestamp at fixed now, assert correct visible relative value; **9.1-INT-002**, omit key, assert entire row and its space absent, other screen content/layout unchanged. Consequence: wrong or missing freshness information. Workaround: technician asks dispatch, as described in Context. |
| Story 9.2; AC3 update while home screen stays open | Integration | R-002 | 2 | Story 9.2 developer | Mechanism: existing engine completion event triggers render after timestamp persistence; one owned event boundary requires Integration. Scenarios: **9.2-INT-001**, establish an older visible value, record latest success and publish existing event, assert value changes without navigation; **9.2-INT-002**, start without key/row, complete first successful sync, assert row appears with the new value. Assert outcomes after established before states and preserve existing spinner completion behavior. Consequence: old freshness information. Workaround: dispatch answers freshness per Context. |
| Story 9.1 relative-time formatter contract | Unit | - | 3 | Story 9.1 developer | Mechanism: pure timestamp-to-relative-string computation, no boundary, Unit. Scenarios: **9.1-UNIT-001**, exact four-minute example; **9.1-UNIT-002**, singular-minute case; **9.1-UNIT-003**, hours-scale elapsed value. Freeze now and use the product's existing formatter contract. These isolate formatting cases; Integration checks store wiring. Reuse verified existing formatter tests when they cover these cases. |
| AC4 flag off restores previous home screen exactly | Component | - | 2 | Story 9.1 developer | Mechanism: flag gates one rendered home-screen interface unit, Component. Scenarios: **9.1-COMP-001**, flag off with stored timestamp; **9.1-COMP-002**, flag off with absent timestamp. Compare pre-feature render tree and visual baseline, including spacing and existing controls. Exercise the existing organization flag evaluation lifecycle; live toggle propagation timing is unspecified. Existing release toggling supplies rollback. |
| Satisfied read-only/local-only/performance constraints | Integration | - | 2 | Epic 9 developer | Mechanism: home/store/event wiring observed with side-effect instrumentation, Integration. Scenarios: **9.1-INT-003**, initial render uses one local key lookup on the already-open store, zero feature writes/new fields/network/polling/timers, unrelated settings/order/queue state unchanged; **9.2-INT-003**, event render retains read-only local behavior with zero added schedulers/network and baseline listener/resource lifecycle, spinner unaffected. Separate engine timestamp writes from feature writes. Apply the existing render-budget check to matched states. Numeric threshold remains UNKNOWN until execution setup. |

**Total P2:** 11 tests; approximately 6 to 10 hours.

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score supplies supporting evidence.

No standalone P3 scenario is required. Screen fidelity assertions are part of the explicit omission and restoration acceptance criteria.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |

**Total P3:** 0 tests; 0 to 0 hours.

Integration covers a single owned local store/event boundary. No API contract or multi-deployable E2E boundary is added. Formatter tests cover pure calculations; Component cases cover flag gating and screen fidelity. Each scenario has a distinct purpose.

## Execution Strategy

**Philosophy:** Run every functional scenario on pull requests while the suite stays below 15 minutes. Priorities describe consequences; this section sets execution timing.

- **Pull request:** All planned unit, component, and local integration classes. Use isolated fixtures and a fixed clock. Wait on event/render completion with bounded assertions, with zero arbitrary sleeps. Target less than 15 minutes; duration is unmeasured until a runner exists.
- **Nightly:** No additional epic suite is justified. Existing broader product regressions retain their current schedule. Add extended repetition only if execution reveals flakiness or resource leakage.
- **Weekly:** No additional expensive suite is scoped. Revisit when measured behavior or requirements introduce a broader workload.

Within each pull request, run the lower-cost isolated checks before the local boundary checks. This plan contains only P2 cases. Use the project's established runner once identified. Planning runs sequentially. No Playwright, mobile runner, package, or vendor requirement is inferred from the epic.

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 0 | N/A | 0 to 0 | No scoped scenarios. |
| P1 | 0 | N/A | 0 to 0 | No scoped scenarios. |
| P2 | 11 | Approximately 0.5 to 1 | Approximately 6 to 10 | Includes shared fixtures, baseline comparisons, and review; shared setup prevents simple per-case multiplication. |
| P3 | 0 | N/A | 0 to 0 | No separate cosmetic suite. |
| **Total** | **11** | N/A | **Approximately 6 to 10** | **Approximately 1 to 2 working days.** |

These are planning intervals. Tooling and implementation availability determine elapsed delivery time.

### Prerequisites

**Test Data:** Isolated local settings containing a valid recent timestamp, an older timestamp, and an absent key; deterministic clock; timestamp encoding from the existing store contract. Cleanup restores settings, flag state, clock, event subscriptions, and test instrumentation.

**Tooling:** Existing unit/component/integration runner, local-store/event instrumentation, screen tree/visual comparisons, and existing render-budget measurement. Exact tools are unconfirmed because the supplied repository contains no implementation manifests.

**Environment:** An implemented home screen with existing settings store, event publisher, progress spinner, and flag provider available in the established test environment. A pre-feature baseline and existing supported screen profiles are needed for exact restoration assertions.

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100% if future evidence adds P0 scenarios; currently N/A.
- **P1 pass rate:** ≥95%, with approved waivers for failures if P1 scenarios are added; currently N/A.
- **P2/P3 generic threshold:** ≥90% informational. For this small epic, all 11 listed P2 scenarios must pass to satisfy the four explicit acceptance criteria and constraints.
- **High-risk mitigations:** 100% complete or formally approved waivers if subsequent evidence creates high risks; currently 0 high risks.

### Coverage Targets

- **Overall scoped requirements:** ≥80%; this plan maps 100% of its four acceptance criteria and stated constraints.
- **Scored risks:** 2/2 mapped to exactly one primary row each.
- **Security/privacy and read-only constraint assertions:** 100% of the scoped checks.
- **Business logic and listed edge cases:** All listed formatter, missing-key, and first-success cases. Code coverage percentages are unmeasured until implementation exists.

### Non-Negotiable Requirements

- [ ] All scoped acceptance and constraint scenarios pass with recorded assertions.
- [ ] Any added P0 scenario passes; any newly identified score ≥6 risk has completed mitigation or a formal waiver.
- [ ] Exact missing-field and flag-off screen restoration is demonstrated.
- [ ] Read-only/local-only and no-new-scheduler constraints hold during initial and event renders.
- [ ] Existing render-budget evidence is obtained and its target met.
- [ ] Planned NFR evidence is recorded or later `nfr-assess` documents remaining concerns and approved exceptions.

This document plans gates. Final NFR status and release approval require implementation evidence.

## Mitigation Plans

### R-001: Render the last successful sync time (Score: 2)

**Mitigation Strategy:** Document residual display risk. Verify actual settings-key consumption, latest recorded timestamp selection, relative text at fixed now, and whole-row omission for absent key. Keep formatter details in pure unit coverage.

**Owner:** Story 9.1 developer.
**Timeline:** Before Epic 9 release.
**Status:** Planned.
**Verification:** `9.1-INT-001` and `9.1-INT-002` pass with store-to-screen evidence. The recorded value remains the engine-owned input.

### R-002: Keep the value current while the screen is open (Score: 2)

**Mitigation Strategy:** Document residual refresh risk. Drive the existing completion event after the engine records success. Establish older/absent before states and assert the resulting updated/visible row while the screen stays open.

**Owner:** Story 9.2 developer.
**Timeline:** Before Epic 9 release.
**Status:** Planned.
**Verification:** `9.2-INT-001` and `9.2-INT-002` pass with completion-event/render evidence and existing spinner behavior retained.

## Assumptions and Dependencies

### Assumptions

1. The epic's existing store, timestamp field, completion event, spinner, and organization flag remain available with their existing contracts.
2. Timestamp persistence precedes the observable success completion. Verify the established engine ordering during fixture setup.
3. Formatter rounding, timestamp encoding, supported screen profiles/locales, and flag reevaluation lifecycle follow existing product contracts. Additional malformed/future-time or localization behavior is unspecified and outside the scored register.
4. Test fixtures can isolate local state and inject time/events without feature changes. Exact test seams and tools are unconfirmed.

### Dependencies

1. Home-screen implementation and established runner: required before test execution.
2. Read-only settings fixtures, fixed clock, event driver, and flag controls: required before coverage implementation.
3. Pre-feature screen baseline and existing render budget/check: required before restoration and performance acceptance.
4. Existing formatter, spinner, local settings, and organization-flag regressions, if available in the implementation repository: required before release.

### Risks to Plan

The supplied repository has no runnable code or test evidence. Fixture availability and execution duration remain unverified. If an existing seam is unavailable, select a deterministic equivalent at the same owned boundary and update estimates. The existing numeric render budget is UNKNOWN; obtain it from the product's established check before declaring budget compliance. These are plan dependencies; they establish no new scored product exposure.

## Implementation Planning Handoff

- Story 9.1 developer: implement or reuse store/clock/flag fixtures and obtain the pre-feature screen baseline.
- Story 9.2 developer: reuse the actual completion publisher contract and preserve spinner assertions.
- Epic developer / QA reviewer: obtain the existing render-budget check and attach execution evidence before release acceptance.

## Follow-on Workflows (Manual)

- Run `/bmad-tea-automate` later for the planned P2 coverage once implementation exists.
- Red-mode P0 generation is N/A because this plan has zero P0 scenarios.
- Use `nfr-assess` when the planned implementation evidence is available.

## Approval

**Test Design Approved By:**

- [ ] Product Manager: unassigned; date pending.
- [ ] Tech Lead: unassigned; date pending.
- [ ] QA reviewer: unassigned; date pending.

**Comments:** Draft plan completed. Approvals and execution remain pending; this workflow grants no release approval.

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| Technician home screen | Adds conditional informational row. | Existing screen controls/navigation/content pass; missing-key and flag-off trees/layout match pre-feature baseline exactly. |
| Local settings store | Reads existing timestamp on the already-open store. | Other settings reads retain behavior; no feature writes, new fields, order changes, or queue changes. |
| Sync completion publisher / spinner | Shares the existing completion event. | Existing spinner starts/completes correctly; row uses latest recorded success; baseline event lifecycle/resources remain intact. |
| Relative-time formatter | Converts stored timestamp into visible relative age. | Existing formatter contracts pass; use fixed time for minute/hour cases. |
| Organization feature flag | Enables row and restores previous screen when off. | Existing organization evaluation/targeting remains intact; flag-off screen comparison passes through the existing lifecycle. |

No cross-team service change is established. Coordinate baseline/fixture access with the owning developer and QA reviewer when execution begins. Existing regression suite names and current results are unverified in this fixture.

## Appendix

### Knowledge Base References

- `bmod-tea/knowledge/risk-governance.md`: Risk categories and ownership.
- `bmod-tea/knowledge/probability-impact.md`: Probability/impact definitions and remediation actions.
- `bmod-tea/knowledge/test-levels-framework.md`: Lowest suitable observable level and duplicate coverage guard.
- `bmod-tea/knowledge/test-priorities-matrix.md`: Independent business-impact priority decisions.
- `bmod-tea/knowledge/nfr-criteria.md`: Planned NFR thresholds and evidence.

### Related Documents

- Epic: [Epic 9 requirements](../../docs/epics/epic-9-last-sync-indicator.md).
- Configuration: `field-sync-indicator/_bmad/config.toml`.
- Template: `skill/test-design-template.md`.
- PRD, architecture, tech spec, sprint status: N/A for this run.

**Generated by:** BMad TEA Test Architect Module.
**Workflow:** `bmad-tea-test-design`, mode C, epic-level, full, sequential.
**Version:** Workflow instructions 5.0; supplied epic template footer version 4.0.
