---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-14'
runScope: 'epic'
runKey: 'epic-9'
epic_num: 9
mode: 'epic-level'
design_level: 'full'
tea_execution_mode: 'sequential'
tea_capability_probe: false
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
**Status:** Draft; design workflow completed, team approval and test execution pending.

## Executive Summary

**Scope:** Full epic-level test design for Epic 9 in field-service-platform. Story 9.1 reads the existing `lastSuccessfulSyncAt` setting and displays relative time. Story 9.2 refreshes that display on the existing sync completion event. The existing `home_last_sync_row` flag controls rollout.

The epic is the sole requirements source. It explicitly states that local-only access, read-only access, privacy, the existing render budget, and reversible rollout are already satisfied. No unresolved control gap is stated. The register therefore contains one residual risk per story. These controls receive scoped regression assertions.

**Risk Summary:**

- Total risks identified: 2; both residual and low priority.
- High-priority risks (score ≥6): 0. Medium-priority risks (score 3-4): 0.
- Categories represented: BUS and TECH. No critical category exposure is evidenced.
- Highest residual score: R-002, score 2, for missed completion-driven refresh.

**Coverage Summary:**

- P0 scenarios: 0; effort 0 to 0 hours, N/A.
- P1 scenarios: 0; effort 0 to 0 hours, N/A.
- P2 scenarios: 9; effort approximately 4 to 8 hours.
- P3 scenarios: 0; effort 0 to 0 hours, N/A.
- Levels: 6 Integration, 2 E2E, 1 Component.
- **Total effort:** approximately 4 to 8 hours across 1 to 2 working days, approximately 0.2 to 0.4 working weeks, assuming an existing application test harness.

All coverage is planned. The supplied project contains the epic and config, with no implementation, tests, fixtures, runnable application, or prior test designs. Existing coverage and flakiness cannot be measured. Platform and runner are UNKNOWN; device wording alone does not identify a native stack.

## Not in Scope

| Item | Reasoning | Mitigation |
| ---------- | -------------- | --------------------- |
| Sync engine correctness, remote APIs, conflict resolution, order and queue processing | Epic 9 consumes an existing local timestamp and event; it changes neither sync processing nor remote services. | Keep existing sync engine regressions green when available; verify the completion event still drives the progress spinner. |
| New persistence, migrations, authentication, authorization, or personal data flows | The epic states that this change writes nothing, stores no new field, and shows the device's own timestamp to its holder. | Observe read-only/local-only invariants in the scoped integration case; reassess scope if implementation introduces an exposure. |
| Platform-wide load, chaos, penetration, and contract testing | This epic adds one local key lookup and one display row. No HTTP contract or load requirement is introduced. | Preserve established platform checks where available; use scoped operation observations and existing render-budget evidence. |
| Polling, timer-driven ageing, new telemetry, and new feature flag infrastructure | The epic explicitly reuses the completion event and existing organization flag; it adds no polling or timer. | Verify absence of indicator polling/timers and exact flag-off restoration. |
| Test generation, application implementation, and edits to requirements | This run produces a planning artifact. | Any implementation or automation requires its own subsequent task. Requirements remain the original input. |

## Risk Assessment

Probability: 1 = unlikely with standard implementation and low uncertainty; 2 = possible boundary or edge error; 3 = likely with known issues or substantial ambiguity. Impact: 1 = minor informational or visual defect with an easy workaround; 2 = material degradation or partial feature loss; 3 = critical blocked operation, data loss, or security/compliance exposure. Score = Probability × Impact.

Scores 1-3 require documentation, 4-5 monitoring, 6-8 mitigation, and 9 blocking action. The template's bands are preserved below. Risk score informs remediation; test priority follows business consequence and recoverability.

### High-Priority Risks (Score ≥6)

No high-priority risks are evidenced by the supplied epic.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ------------- | ----------- | ------ | ----- | ------------ | ------- | -------- |

### Medium-Priority Risks (Score 3-4)

No medium-priority risks are evidenced by the supplied epic.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ------------- | ----------- | ------ | ----- | ------------ | ------- |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ------------- | ----------- | ------ | ----- | -------- |
| R-001 | BUS | **Render the last successful sync time:** Story 9.1 reads `lastSuccessfulSyncAt` and renders relative time. An incorrect or omitted displayed value leaves the technician asking dispatch whether the device is current. Source: epic, Story 9.1 and Context. | 1 | 1 | 1 | Document; UI developer verifies stored-value rendering and absent-key behavior before Story 9.1 completion. |
| R-002 | TECH | **Keep the value current while the screen is open:** Story 9.2 re-renders on the existing completion event. A missed refresh leaves an old value visible, preserving the need to ask dispatch. Source: epic, Story 9.2 and Context. | 2 | 1 | 2 | Document; UI developer verifies existing, first, and successive successful completions before Story 9.2 completion. |

R-001 has low probability because the story specifies a single existing key lookup and a simple display. R-002 has possible failure at the subscription/update boundary. Both consequences are confined to an informational row. The Context supplies the existing radio/dispatch workaround, and the feature flag supplies rollback. The epic establishes no blocked technician task, critical deadline, data loss, new privacy exposure, or irreversible deployment. The implementation has no observed failure history in the supplied repository.

### Risk Category Legend

- **TECH:** Technical and integration flaws.
- **SEC:** Access controls, authentication, and data exposure.
- **PERF:** Performance degradation and resource limits.
- **DATA:** Data loss, corruption, and integrity failures.
- **BUS:** Business logic and user experience consequences.
- **OPS:** Deployment, configuration, and operational controls.

## NFR Planning

**Purpose:** Plan epic-specific validation and evidence for later `nfr-assess`. Implementation evidence and final NFR verdicts remain pending.

Coverage references C1-C5 below identify the five coverage rows. They are planning labels; individual case IDs appear in those rows.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| --------------- | ----------------------- | --------- | ------------------------------------------ | -------------------------------- |
| Security/privacy | Show only this device's existing timestamp to its holder; add zero personal data and zero indicator network calls. | - | Integration C4 observes the key read and indicator network activity; Component C5 inspects rendered content. | Local read/call trace and rendered-content report. |
| Performance | Existing render budget unchanged; one local key lookup per required read, zero added polling or timers, zero new network/storage operations. | - | Integration C4 observes indicator operations during mount, event update, and teardown. Retain the existing screen budget check if available. | Operation-count trace; existing screen render-budget baseline/report when available. |
| Reliability | Display the latest stored successful completion and update on the existing completion event while home is open. | R-002 | Integration C2 uses controlled event delivery and asserts visible before/after states; C4 preserves spinner behavior. | Event sequence, fixed-clock values, and integration result report. |
| Data safety | Indicator writes zero settings, orders, queue entries, or new keys. Existing store access remains read-only for this field. | - | Integration C4 observes indicator writes and compares local state before/after indicator rendering. Separate engine-owned updates from indicator activity. | Indicator write trace and settings/state comparison. |
| Operations | Turning `home_last_sync_row` off restores the previous home screen exactly using the existing organization flag. | - | E2E C3 compares the whole screen with the pre-change baseline in both timestamp states. | Fixed-geometry screen images, visual comparison, and accessibility/layout comparison. |
| Maintainability | Reuse the existing settings store, completion event, and flag; preserve existing home interactions. | - | C1/C2/C4 exercise owned boundaries; C5 checks row presentation. Review dependency reuse in implementation. | Scoped test results, targeted regression report, and dependency review record. |

**Unknown thresholds:** The existing numeric render budget, relative-time formatter convention, supported screen sizes/text scales, and runner are UNKNOWN in this input. Record them from the implementation and existing screen baseline before execution. The epic supplies measurable zero-added-operation constraints. Generic knowledge-fragment examples such as API latency SLOs create no project requirement. Scalability and compliance thresholds are N/A for this epic. No additional scored NFR gap is supported by the source.

## Entry Criteria

- [ ] UI developer and test owner accept this draft's scoped requirements and execution assumptions.
- [ ] Implementation and an accessible test build/harness are available. Platform, runner, timestamp representation, and existing formatter are identified.
- [ ] Isolated local settings can represent an absent key and successive known successful timestamps; clock and completion events are controllable.
- [ ] The existing organization flag can be set deterministically for the test organization.
- [ ] A pre-change home-screen baseline is available with matching geometry, text scale, clock, and unrelated screen state.
- [ ] Existing render budget and applicable regression checks are identified, or their unavailable evidence is recorded explicitly.

## Exit Criteria

- [ ] All four acceptance criteria and both residual risks have executed coverage.
- [ ] All nine scoped scenarios pass, including exact flag-off restoration and zero-added-operation assertions.
- [ ] No unresolved high-severity defect or newly evidenced unmitigated high risk remains.
- [ ] Applicable existing home-screen, store, sync event/spinner, and flag regressions pass.
- [ ] Planned NFR evidence is collected; unresolved evidence limitations have an owner and disposition before sign-off.

## Test Coverage Plan

P0/P1/P2/P3 specify priority. The Execution Strategy specifies scheduling. Each scored risk has one primary coverage row at the boundary where its failure first becomes observable. Additional constraint and presentation rows use `-` for Risk Link.

### P0 (Critical)

**Criteria:** Critical business, security, data-integrity, or compliance impact with no safe workaround. Risk score is supporting evidence and is not a required condition.

No planned scenario has this documented consequence. The epic confirms read-only/local-only access and reversible rollout.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |

**Total P0:** 0 tests; effort 0 to 0 hours, N/A.

### P1 (High)

**Criteria:** Core, frequent, or complex behavior with material user reach and a limited workaround. Risk score is supporting evidence and is not a required condition.

The source establishes an informational secondary row with a dispatch workaround. Material reach, complex logic, or a limited recovery path is not evidenced.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |

**Total P1:** 0 tests; effort 0 to 0 hours, N/A.

### P2 (Medium)

**Criteria:** Secondary behavior with narrower user reach and an acceptable workaround. Risk score is supporting evidence and is not a required condition.

Both story risks affect the informational sync row and retain the source-supported radio/dispatch workaround. The accompanying controls and presentation checks preserve this feature's bounded scope. Usage and organization rollout metrics are unknown; no numeric reach is assumed.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |
| C1: Story 9.1; AC1 and AC2, stored relative time and absent-field suppression | Integration | R-001 | 2 | UI developer | Mechanism: wrong key/value or presence handling crosses the existing local settings-store-to-screen boundary; first observable level is Integration. Cases: **9.1-INT-001**, flag on and latest stored successful timestamp renders its relative time at fixed now; **9.1-INT-002**, absent key renders no row and preserves unrelated screen structure/content. Consequence: missing or wrong information; Context's dispatch/radio check remains available. |
| C2: Story 9.2; AC3, completion-driven update while home stays open | Integration | R-002 | 3 | UI developer | Mechanism: missed subscription/refresh crosses the existing completion-event-to-screen boundary; first observable level is Integration. Cases: **9.2-INT-001**, an old displayed timestamp changes after successful completion; **9.2-INT-002**, first successful completion makes an initially absent row appear; **9.2-INT-003**, successive successful completions leave the latest stored timestamp displayed. Seed the engine-owned value before each event, prove the old/absent precondition, and assert the new state without navigation. Consequence: stale information; Context's dispatch/radio check remains available. |
| C3: AC4, exact previous home screen when organization flag is off | E2E | - | 2 | Test owner | User journey: apply the existing organization's `home_last_sync_row` flag off and open home under matched baseline conditions. Cases: **9.1-E2E-001**, timestamp present; **9.1-E2E-002**, timestamp absent. Whole-screen image, layout, accessibility structure, and existing home interactions match the pre-change baseline, with no row or reserved gap. This row checks full-screen rollback; C1 checks local read/presence semantics. |
| C4: Already-satisfied constraints and existing spinner interworking | Integration | - | 1 | UI developer | Case **9.2-INT-004** observes indicator mount, completion refresh, and teardown through existing store/event boundaries. Assert one local lookup per required read, zero indicator writes/new fields/network calls/polling/timers, unchanged unrelated local state, and existing spinner completion behavior. Keep engine writes/network activity separately attributed. These assertions verify controls stated in the epic. |
| C5: Readable enabled row and preserved home content | Component | - | 1 | UI developer | Case **9.1-COMP-001** renders the enabled row within the existing home UI at an existing supported compact geometry and text scale. Confirm legible relative-time text, accessible reading order, intact existing controls, and no clipping/overlap. One rendered interface boundary; supported geometry comes from the implementation. Visual presentation is distinct from C1's store lookup and C3's full-screen disabled baseline. |

**Total P2:** 9 tests; approximately 4 to 8 hours.

### P3 (Low)

**Criteria:** Rare, cosmetic, or experimental behavior with minimal impact and an easy workaround. Risk score is supporting evidence and is not a required condition.

No separate rare or experimental behavior is stated. Basic row readability belongs to the scoped P2 presentation check.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ------------- | ---------- | --------- | ---------- | ----- | ------- |

**Total P3:** 0 tests; effort 0 to 0 hours, N/A.

**Acceptance traceability:** AC1 → C1; AC2 → C1; AC3 → C2; AC4 → C3. R-001 → C1 and R-002 → C2, each with exactly one risk-linked coverage row. No separate API or formatter unit suite is planned: the feature consumes existing local behavior. Add a formatter unit case only if implementation introduces new formatting logic and the plan is updated to avoid redundant assertions.

## Execution Strategy

**Philosophy:** Run every functional scenario in pull requests while the scoped suite stays below 15 minutes. Defer expensive or long-running work when measured duration or infrastructure warrants it.

- **Pull request:** Run all scoped integration, component, and baseline E2E checks, plus applicable existing regressions. Use isolated settings/event/flag fixtures and runner-supported parallelism where safe. Runner selection is pending; Playwright parallelism applies only if the actual stack uses it.
- **Nightly:** No new dedicated suite is justified. Retain existing project regression scheduling when the implementation repository is available.
- **Weekly:** No additional load, chaos, or device-lab suite is required by this epic.

Within the PR checks, run fast boundary checks before full-screen comparisons. Any future P0/P1 cases execute before lower-priority work. Freeze the clock and wait for observable state/event completion; avoid sleeps and real sync dependencies.

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| --------- | ----- | ---------- | ----------- | ----- |
| P0 | 0 | N/A | 0 to 0 | Empty band. |
| P1 | 0 | N/A | 0 to 0 | Empty band. |
| P2 | 9 | Approximately 0.25 to 1 | Approximately 4 to 8 | Includes shared deterministic fixtures, baseline capture, implementation, and result triage in an existing harness. |
| P3 | 0 | N/A | 0 to 0 | Empty band. |
| **Total** | **9** | **N/A** | **Approximately 4 to 8** | **1 to 2 working days; approximately 0.2 to 0.4 working weeks.** |

These are planning ranges with shared setup costs. Creation of a new app-wide test framework is outside this estimate. Its need and effort are UNKNOWN until the actual implementation is available.

### Prerequisites

**Test Data:** Isolated existing settings store with absent and known latest timestamps; controlled clock; ordered completion events; deterministic existing organization flag. Example values: fixed now `2026-10-14T12:00:00Z`, latest success `2026-10-14T11:56:00Z`; the expected relative-time text follows the existing formatter. Reset settings, subscriptions, flags, and clock after each case.

**Tooling:** Existing integration/component runner with store and event observation; existing E2E screen runner with whole-screen image and accessible-structure comparison. Both are Pending identification. No vendor, new package, API endpoint, selector, or test command is assumed.

**Environment:** Isolated build and test organization; matched pre-change home-screen baseline; known supported layout/text settings; no dependency on live dispatch or remote sync services for the boundary cases.

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate:** 100% when applicable; current band N/A.
- **P1 pass rate:** ≥95% with approved disposition of failures when applicable; current band N/A.
- **P2/P3 pass rate:** Template default ≥90%; this small epic requires all 9 planned cases to pass, so its scoped threshold is 100%.
- **High-risk mitigations:** 100% complete or explicitly approved waiver if newly evidenced high risks are added; currently none.

### Coverage Targets

- **Overall scoped coverage:** 100% of four acceptance criteria, both risks, and nine planned scenarios; this exceeds the generic ≥80% minimum.
- **Critical paths:** N/A; no critical path is introduced by the epic.
- **Security/privacy and read-only constraints:** All scoped invariants verified; no separate SEC risk is evidenced.
- **Business logic and edge cases:** All listed stored-value, absent-value, first-completion, and successive-completion cases verified. Existing formatter internals remain outside this plan.

### Non-Negotiable Requirements

- [ ] All applicable P0/P1 gates satisfied; no new high risk left without mitigation or approved waiver.
- [ ] All AC and already-satisfied constraint assertions pass.
- [ ] Exact flag-off baseline restoration demonstrated.
- [ ] In-scope NFR evidence collected and unresolved limitations dispositioned.

This plan records release criteria. Final gate and NFR decisions require executed evidence and remain unevaluated; use `nfr-assess` after that evidence exists.

## Mitigation Plans

### R-001: Stored timestamp rendering (Score: 1)

**Mitigation Strategy:** Implement C1 with controlled local state and clock, asserting both displayed latest relative time and complete row absence for a never-synced device.  
**Owner:** UI developer, role assignment pending.  
**Timeline:** Before Story 9.1 completion and release.  
**Status:** Planned.  
**Verification:** Both C1 cases pass; low informational residual remains subject to the existing flag rollback and dispatch workaround.

### R-002: Completion-driven refresh (Score: 2)

**Mitigation Strategy:** Implement C2 at the existing event boundary. Assert a visible transition from old or absent state to the latest timestamp on each successful completion while home remains open.  
**Owner:** UI developer, role assignment pending.  
**Timeline:** Before Story 9.2 completion and release.  
**Status:** Planned.  
**Verification:** All three C2 cases pass with deterministic event ordering. Event refresh remains the highest residual risk until execution evidence exists.

## Assumptions and Dependencies

### Assumptions

1. The already-satisfied constraints remain valid in implementation. Any evidenced new write, network path, privacy exposure, or rollback limitation requires reassessment.
2. Completion tests use the existing engine ordering: successful timestamp available when the completion event is handled. Exact event interface and ordering must be inspected in code before automation.
3. Relative-time wording/rounding follows the existing formatter. The epic's example illustrates the display; arbitrary new rounding, future-time, or corrupt-data policies are not inferred.
4. Supported platform, geometry, and accessibility settings will come from the implementation repository. Repeated formatter boundaries and unrelated platform failure modes add no current scored risk.

### Dependencies

1. Testable implementation and existing harness: UI developer/test owner identifies these before test development.
2. Controllable existing settings, completion event, flag, and clock: UI developer supplies or exposes existing seams before boundary execution.
3. Pre-change screen baseline and existing render-budget evidence: test owner supplies before rollback/performance validation.
4. Named owners and approval roles: project lead assigns before sign-off. No individuals are identified in the source.

### Risks to Plan

The provided repository has no runnable code or baseline, so executed results, existing regression names, and runtime estimates are unavailable. This is an execution dependency outside the product risk register. The test owner must locate the implementation/harness, then revise estimates if framework work is required. No missing PRD, architecture, or sprint file blocks this run; those inputs are absent by design.

## Follow-on Workflows (Manual)

Automation is a separate explicitly invoked workflow after implementation and runner context are available. This plan contains no P0 cases for a P0-only red-mode pass. Broader automation can consume C1-C5. Collect NFR evidence before invoking `nfr-assess` or a release gate workflow.

## Approval

**Test Design Approved By:** Pending team review. Named product, technical, and testing approvers are unknown. No approval or test pass is claimed by workflow completion.

**Comments:** Proposed role ownership and execution assumptions require disposition before the exit criteria can be signed off.

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | -------------- | ------------------------------- |
| Home screen | One optional row and refresh wiring. | Existing home rendering/navigation/control checks; C1 absence semantics, C3 exact disabled baseline, C5 readability. |
| Local settings store | Existing field consumed read-only. | Existing unrelated-field read checks and C4 local state/read-only observations. |
| Sync completion event and progress spinner | Existing event reused by an additional UI consumer. | Existing spinner start/completion behavior and event subscription checks; C2 successive completion transitions and C4 interworking. |
| Existing organization feature flag | Existing rollout controls row visibility. | Existing flag targeting checks when available; C3 disabled screen restoration for the test organization. |

Existing test files and passing history are UNKNOWN because none are supplied. Coordinate baseline/flag fixtures with the home UI and sync owners through the project's existing process; no new cross-team service dependency is required by the epic.

## Appendix

### Knowledge Base References

- `bmod-tea/knowledge/risk-governance.md`: Categories, ownership, and mitigation governance.
- `bmod-tea/knowledge/probability-impact.md`: Probability/impact scale and remediation thresholds.
- `bmod-tea/knowledge/test-levels-framework.md`: Boundary-based level selection and duplicate-coverage guard.
- `bmod-tea/knowledge/test-priorities-matrix.md`: Business consequence, workaround, and independent priority selection.
- `bmod-tea/knowledge/nfr-criteria.md`: Planned measurable evidence and deferred NFR assessment.

The NFR branch matches the epic's performance, privacy, read-only, reliability, and operational constraints. Browser and library flags are unset. No platform manifests or Pact artifacts exist; optional browser/contract knowledge branches were closed. No browser session or capability probe was started.

### Related Documents

- Epic: [Epic 9](../../docs/epics/epic-9-last-sync-indicator.md), the sole requirements source.
- Config: [TEA config](../../_bmad/config.toml).
- PRD, architecture, tech spec, sprint status, and prior system test designs: N/A for this run.
- Template: `skill/test-design-template.md`; validation: `skill/checklist.md`.

### Workflow Validation Record

Create steps 1 through 5 were read and executed sequentially. Template sections, canonical table columns, score arithmetic, one risk-linked coverage row per risk, all four AC mappings, counts, effort ranges, NFR evidence, and draft approval state were checked. Optional team table and system-level documents/handoff are N/A. No external status file, requirement change, generated test, browser artifact, or test execution is part of this run. Checkpoint state was temporary; this document retains completion metadata as the single final deliverable.

**Generated by:** BMad TEA Test Architect Module  
**Workflow:** `bmad-tea-test-design`  
**Template version:** 4.0 (BMad v6); step workflow version 5.0.
