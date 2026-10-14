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
  - bmod-tea/knowledge/tea-index.csv
  - bmod-tea/knowledge/risk-governance.md
  - bmod-tea/knowledge/probability-impact.md
  - bmod-tea/knowledge/test-levels-framework.md
  - bmod-tea/knowledge/test-priorities-matrix.md
  - bmod-tea/knowledge/nfr-criteria.md
---

## Step 1: Mode and prerequisites

Epic-level Create mode, full design, sequential execution, capability probe disabled. Scope: Epic 9. Run key: epic-9.

Requirements source: field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md. Stories 9.1 and 9.2 and four acceptance criteria are available. Architecture is optional and absent by design. PRD and sprint status are outside this run's inputs. No previous checkpoint exists.

Configuration: field-sync-indicator/_bmad/config.toml. User: tea-eval-harness. Project: field-service-platform. Communication and output language: English. Artifacts: field-sync-indicator/test-artifacts.


## Step 2: Loaded context

TEA optional integration flags and browser automation are unset. No integration branch is enabled. test_stack_type defaults to auto; detected stack is undetermined because the repository contains only the epic and configuration. Capability probing is disabled. No runnable target is supplied for exploration.

Testable requirements: AC1 most recent successful sync relative time; AC2 absent field hides the entire row and preserves the screen; AC3 completion events update the open screen; AC4 home_last_sync_row off restores the previous screen exactly. Constraints: reuse local settings lookup, read-only, no new field/storage/network/polling/timer, preserve render budget, reuse existing flag and completion event.

Integration points: home screen, local settings store, relative-time formatter, sync completion event, existing progress spinner, organization-scoped feature flag. No existing tests, fixtures, runner, flakiness evidence, application implementation, or prior system plans are present. All coverage is planned; existing coverage is unverified. Requirements are sufficient for this design. PRD, architecture, and sprint status are absent by explicit scope.

Knowledge selection in prescribed order: risk-governance, probability-impact, test-levels-framework, test-priorities-matrix, nfr-criteria. NFR fragment selected because security, read-only integrity, performance, and rollout constraints are explicit. CLI, Pact, and other branches have no matching repository/config facts.


## Step 3: Risk and NFR assessment

System-level testability and ASR review is inapplicable to epic-level scope. Gap extraction yields zero missing-control, unsafe/destructive, unmet-target, unprotected-exposure, or irreversible-release statements. The context's unsurfaced timestamp describes the requested display feature. Explicitly satisfied local-only, read-only, privacy, budget, and rollout controls remain regression constraints. Exactly one residual risk is registered for each story.

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
| R-001 | BUS | Render the last successful sync time: story 9.1 reads existing lastSuccessfulSyncAt and renders relative time. A wrong or omitted value leaves the technician asking dispatch about freshness. Source: epic story 9.1 and Context. | 1 | 2 | 2 | Document; verify store-to-screen value and absent-field behavior. Owner: story 9.1 developer. Timeline: before Epic 9 release. |
| R-002 | TECH | Keep the value current while the screen is open: story 9.2 re-renders on the existing completion event. A missed event leaves an old success time visible until the screen is reopened. Source: epic story 9.2 and AC3. | 1 | 2 | 2 | Document; verify event-to-screen update. Owner: story 9.2 developer. Timeline: before Epic 9 release. |

Probability 1 reflects reuse of the existing local key/store and spinner event with no new infrastructure. Impact 2 reflects loss of the intended display/update benefit and the existing dispatch workaround. No evidence supports critical financial, privacy, data-integrity, or availability consequences. Total risks: 2, both low, zero high. Categories BUS and TECH.

NFR plan: security/privacy displays only device-owned timestamp to its holder; integrity requires zero feature writes and zero new fields; performance requires one local lookup, zero added network calls, polling, or timers, and unchanged existing render budget; reliability uses completion event updates (R-002); operations uses existing organization flag rollback. Numeric render-budget threshold is UNKNOWN in supplied source; obtain the existing budget/baseline at execution without inventing one. No explicit NFR gap becomes an additional scored risk. Evidence will comprise isolated store/event reports, screen comparisons, side-effect instrumentation, and existing render-budget results. Scalability and compliance introduce no separate epic requirements. Final NFR/gate assessment is pending implementation evidence.


## Step 4: Coverage, execution, and gates

Priority assessment: this is a secondary informational home-screen row. The epic supplies dispatch as an acceptable freshness workaround and an existing organization flag restoring the previous screen. No revenue deadline, critical exposure, blocked essential task, complex behavior, usage percentage, or prior failures are stated. Each primary risk is P2: R-001 loses the freshness display; R-002 loses freshness updates; dispatch can still answer the underlying question. All constraint checks are P2 within the same bounded feature. P0/P1/P3 have zero scenarios. Feature restoration validates the flag control; it does not itself resolve a wrong freshness answer. Dispatch provides that source-supported workaround.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Story 9.1 / AC1 and AC2: stored success time and absent field | Integration | R-001 | 2 | Story 9.1 developer | Mechanism: home reads settings key and displays or hides row; one owned store-to-screen boundary, Integration. Scenarios: stored timestamp at fixed time shows expected relative value (9.1-INT-001); missing key omits entire row, retains screen baseline (9.1-INT-002). Consequence: freshness information unavailable or wrong; dispatch workaround supported by Context. |
| Story 9.2 / AC3: open-screen completion refresh | Integration | R-002 | 2 | Story 9.2 developer | Mechanism: existing completion event updates screen after engine records timestamp; one owned event boundary, Integration. Scenarios: visible old timestamp changes to latest successful value without navigation (9.2-INT-001); first success while open creates previously absent row (9.2-INT-002). Establish before/after values and assert rendered outcome; existing spinner remains correct. Consequence: old freshness information; dispatch workaround supported by Context. |
| Story 9.1: relative-time formatting | Unit | - | 3 | Story 9.1 developer | Mechanism: pure timestamp-to-relative-string calculation, no boundary, Unit. Scenarios: 4 minutes ago, singular minute, hours-scale elapsed time; fixed clock and existing formatter contract. Reuse verified existing formatter coverage when available. These isolate formatting details beyond store wiring. |
| AC4: home_last_sync_row off restores previous screen | Component | - | 2 | Story 9.1 developer | Mechanism: flag controls one rendered home screen, Component. Scenarios: flag off with stored timestamp; flag off with missing key. Compare exact pre-feature screen tree and visual baseline, including row space and other controls. Use existing flag evaluation lifecycle; live toggle timing is unspecified. |
| Already-satisfied read-only/local-only/event-driven constraints | Integration | - | 2 | Epic 9 developer | Mechanism: home/store/event wiring observed with side-effect spies, Integration. Scenarios: initial home render performs single existing-key lookup with zero feature writes/new fields/network/polling/timers; success-triggered render retains read-only local behavior, baseline resources and spinner behavior. Attribute engine writes separately. Check same existing render budget using its baseline; numeric threshold UNKNOWN. |

Total: 11 P2 scenarios in 5 coverage rows. Every scored risk has exactly one Integration row; no API or E2E boundary is introduced. Risk-free regression/format rows use '-'. All four acceptance criteria and stated constraints are covered. No duplicate risk row or multi-level test cell.

Evidence: unit reports for formatter; integration reports and store/event traces for correctness/reliability/integrity; component screen/visual comparisons for flag restoration and privacy content; side-effect/resource traces and existing render-budget measurement for performance; existing lint/quality output when implementation is available. Unknown baseline and framework availability are execution prerequisites, with no invented thresholds or tools.

Execution: all functional classes on each PR, target under 15 minutes. Sequential workflow planning; runner concurrency stays a later implementation choice. Nightly and weekly have no additional epic suites because no long-running scope is supported. Broaden only on new runtime failures or changed scope.

Effort ranges: P0/P1/P3 each 0 to 0 hours; P2 approximately 6 to 10 hours; total approximately 6 to 10 hours (1 to 2 working days), including fixture wiring and baseline comparisons. Assumes existing store/event/flag seams and a project runner become available. No test generation in this run.

Gate plan: P0 100% and P1 at least 95% apply if such scenarios are later added; currently both N/A. Require all 11 bounded P2 scenarios and all four ACs before acceptance (stricter than general P2 informational pass rate). Risk coverage planned 2/2; AC coverage planned 4/4. Overall coverage target at least 80%; this bounded plan targets 100% of listed requirements. Zero unmitigated high risks if new evidence creates any. All in-scope NFR evidence must be recorded; existing render budget must be obtained before claiming performance compliance. Final NFR assessment deferred until evidence exists. Entry: implemented feature and runner, isolated local-state/event/flag fixtures, fixed clock, pre-feature home baseline and existing render budget. Exit: required cases pass, constraints/baseline/spinner regressions verified, no unresolved high-severity defects, deviations recorded with owner and expiry.


## Step 5: Output, checklist validation, and completion report

Execution resolution: explicit sequential mode; capability probe false. Single worker; no runtime probe, fallback, or delegation. Selected skill/test-design-template.md and generated field-sync-indicator/test-artifacts/test-design/test-design-epic-9.md for the unchanged epic-9 identity. No system handoff applies.

Checklist validation completed against skill/checklist.md. Applicable epic prerequisites and all ordered process steps completed. Risk/coverage/NFR matrices, entry/exit criteria, exclusions, ownership, estimates, gates, regression, manual follow-ons, and draft approval section are populated. Risk schemas and band ranges preserved. Each unique canonical risk appears in exactly one primary Integration coverage row. Bare numeric cells and P×I arithmetic verified. Five coverage rows total eleven uniquely named planned scenarios. All four acceptance criteria are mapped. No test implementation code generated.

Validation applicability: PRD/architecture/sprint-status and system-level outputs are N/A by supplied scope. No prior tests, historical evidence, or runner exists in the staged project; absence is documented without claiming runtime success. Pact and browser branches are inapplicable; no CLI session was opened and none requires cleanup. Playwright-specific parallelization is N/A for an undetermined stack. Effort uses ranges and a short working-day interval suited to this small epic. Stakeholder review, exclusions acceptance, approval, release gates, and actual NFR evidence are later execution actions with pending checkboxes. Clarification items are recorded as assumptions/dependencies because this run's inputs are sufficient and questions are disallowed. Status integration is recorded here; input docs remain unchanged.

Polish: complete document read back; no unpopulated placeholders, schema mismatches, duplicate risk coverage rows, invented scored exposures, final NFR verdicts, or inconsistent totals. Documentation validation passed. No generated tests or application changes.

Completion report: mode C, epic-level full design, scope epic 9. Output: field-sync-indicator/test-artifacts/test-design/test-design-epic-9.md. Key risks R-001 and R-002 each score 2; zero high risks. Gates: P0 100% and P1 ≥95% if introduced, all scoped P2 cases required, at least 80% scoped coverage with 100% planned AC mapping, and in-scope NFR evidence before final assessment. Open execution assumptions: runner/fixtures, existing formatter/flag contracts, pre-feature screen baseline, and UNKNOWN existing numeric render budget. Draft design complete; implementation/testing and approvals pending.

## Quality & Testing Progress

Epic 9 test design completed 2026-10-14. All five steps executed in order. Sole deliverable is the epic plan; this file is the workflow checkpoint. Completion hook resolver will be invoked as required. A failed, absent, or empty customization hook is skipped per step 5.
