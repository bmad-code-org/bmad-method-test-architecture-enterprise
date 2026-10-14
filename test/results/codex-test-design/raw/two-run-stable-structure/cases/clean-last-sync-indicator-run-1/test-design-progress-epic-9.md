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
  - 'field-sync-indicator/_bmad/config.toml'
  - 'field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md'
  - 'bmod-tea/knowledge/tea-index.csv'
  - 'bmod-tea/knowledge/risk-governance.md'
  - 'bmod-tea/knowledge/probability-impact.md'
  - 'bmod-tea/knowledge/test-levels-framework.md'
  - 'bmod-tea/knowledge/test-priorities-matrix.md'
  - 'bmod-tea/knowledge/nfr-criteria.md'
---

# Epic 9 Test Design Progress

## Step 1: Mode and prerequisites

Create mode; epic-level; full design; sequential execution; capability probe disabled.
Run scope: epic. Epic number: 9. Run key: epic-9.
Project: field-sync-indicator. Configuration: _bmad/config.toml.
Requirements: docs/epics/epic-9-last-sync-indicator.md, the sole requirements source.
The epic provides stories and acceptance criteria. Architecture context is optional and unavailable.
No PRD, architecture document, or sprint status is required for this run.
No existing current or legacy scoped checkpoint exists. This is a fresh run.
Outputs use English. User: tea-eval-harness. Project name: field-service-platform.


## Step 2: Context and knowledge

Config flags tea_use_playwright_utils, tea_use_pactjs_utils, tea_pact_mcp and tea_browser_automation are unset. No enabled integration branch is inferred. test_stack_type defaults to auto; detected_stack is undetermined because no application manifests or runner configuration exist. Capability probing is disabled.

Repository scan found only the epic, config and this checkpoint. No source code, tests, fixtures, runner, executable app, browser target URL, prior system-level design, or flakiness evidence is available. All four acceptance criteria need planned coverage; implementation coverage is unverified. Inputs are complete for this documentation-only run.

Requirements: render relative time from existing lastSuccessfulSyncAt; omit the row for an absent field; update on existing completion events while open; restore the exact prior home screen when home_last_sync_row is disabled.
Integration points: home screen, existing local settings store, existing sync completion publisher/progress spinner, existing per-organization feature flag.
Constraints: read-only single local lookup; no new network, writes, stored fields, polling or timers; no added personal data; existing render budget unchanged; rollback through the existing flag.

Deterministic fragment list, in load order: risk-governance.md, probability-impact.md, test-levels-framework.md, test-priorities-matrix.md, nfr-criteria.md. NFR fragment is included because security, data safety, performance and operational rollback constraints are explicit. CLI, Pact, MCP and utils branches are closed. Browser exploration is inapplicable without a configured branch or executable target.


## Step 3: Risk and NFR planning

System-level architecture review and ASRs are inapplicable to epic-level mode.
Gap inventory: none. The context describes the feature motivation; the stories state intended behavior. The four controls are explicitly already satisfied. No new exposure is evidenced. Exactly one residual risk per story follows the no-gap procedure.

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
| R-001 | BUS | Render the last successful sync time (story 9.1): a wrong or missing relative value leaves technicians asking dispatch about freshness. Source: docs/epics/epic-9-last-sync-indicator.md, story 9.1, existing lastSuccessfulSyncAt local lookup and absent-field behavior. | 2 | 1 | 2 | Document; Dev owns story 9.1. Verify local-store-to-screen rendering and omission before story acceptance. QA confirms the expected label and unchanged surrounding screen. |
| R-002 | TECH | Keep the value current while the screen is open (story 9.2): a missed completion refresh leaves the previous successful sync visible until the screen is opened again. Source: docs/epics/epic-9-last-sync-indicator.md, story 9.2, existing completion event shared with progress spinner. | 2 | 1 | 2 | Document; Dev owns story 9.2. Verify the completion-publisher-to-screen boundary before story acceptance and preserve spinner behavior. |

Probability 2 reflects possible new UI and event-wiring mistakes. Impact 1 reflects an informational row, existing dispatch workaround and existing organization flag rollback. There is no evidence supporting critical data, privacy or performance exposure. Both risks remain planned; tests have not run.

NFR planning: privacy adds zero personal-data fields; storage adds zero writes or stored fields; network adds zero feature calls; runtime adds zero polling or timers and a single local lookup; reliability updates on the existing success event; operations reuses home_last_sync_row and restores the previous screen. Planned evidence: formatter reports, store/event integration assertions, side-effect instrumentation, component baselines for hidden row and flag off. No generic service load/security suite is required. Numeric render budget is UNKNOWN in supplied requirements; preserve the stated unchanged budget through structural regression and compare against the application's existing budget when implementation is available. This clarification adds no scored gap because the epic explicitly states the budget is already satisfied. Formatting rules, runners and test seams remain implementation assumptions. No final NFR audit or release gate has run.

Highest score: 2. Priority will follow secondary customer-facing behavior, accepted radio workaround and existing rollback independently of score.


## Step 4: Coverage and execution plan

Priority decision for every scenario: informational secondary home-screen behavior; no source-supported revenue, security, destructive-data or regulatory consequence; radio/dispatch is the explicit existing freshness workaround; the organization flag provides rollback; no usage metrics or broad-impact complexity is stated. All scenarios are P2. P0, P1 and P3 bands are empty. Score and priority are separate decisions.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Story 9.1 local value and absent state; AC1 and AC2 | Integration | R-001 | 3 | Dev | Wrong mapping or omission first becomes observable across the owned local-settings-to-home boundary. INT-001: seed lastSuccessfulSyncAt four minutes before a fixed now; render the correct relative value. INT-002: key absent; row absent and existing screen content preserved. INT-003: reopen home after a later successful value is stored; render the latest value. Failure loses an informational convenience; dispatch/radio remains the source-supported workaround. |
| Story 9.2 completion-driven refresh; AC3 | Integration | R-002 | 3 | Dev | Missed refresh first becomes observable across the owned completion-publisher-to-home boundary. INT-001: verify old label, then complete sync and verify the new stored success value without navigation. INT-002: start absent, complete first sync, verify row appears. INT-003: consecutive successful completions show the latest value and preserve existing spinner behavior. Failure leaves a stale convenience label; dispatch/radio remains available. |
| Relative-time formatting branches | Unit | - | 3 | Dev | Pure formatter, no boundary: UNIT-001 four-minute example; UNIT-002 just below minute boundary; UNIT-003 at minute boundary. Clock fixed; expected rounding and wording use the existing formatter policy when available. Distinct arithmetic coverage supplements store integration. |
| Hidden row and flag rollback layout; AC2 and AC4 | Component | - | 3 | Dev; QA reviews baselines | One rendered home interface unit: COMP-001 flag enabled and absent timestamp matches prior home baseline; COMP-002 flag disabled with stored timestamp matches prior home exactly; COMP-003 flag disabled with absent timestamp matches prior home exactly. Assert layout, existing controls and accessible content, including zero blank row space. Existing flag evaluation timing governs rollback setup. |
| Already satisfied local-only and event-only constraints | Integration | - | 2 | Dev | INT-004 for story 9.1: instrument home/store boundary; one local key read, read-only use, zero feature writes/new fields/network calls/personal-data additions. INT-004 for story 9.2: instrument completion subscription while open; zero feature polling/timers/periodic reads, preserve existing spinner interaction. Compare incremental work with flag-off baseline, isolating existing unrelated work. These are regression assertions on satisfied controls. |

IDs in final output use 9.1-INT-001 through 004, 9.2-INT-001 through 004, 9.1-UNIT-001 through 003, and 9.1-COMP-001 through 003. Total: 14 scenarios; Integration 8, Unit 3, Component 3. API and E2E are unnecessary for one existing owned local store/event path; stack and runner remain unspecified. Every scored risk has exactly one primary linked row.

NFR evidence: store/side-effect reports for local-only/no-writes/no-personal-data; event reports for no-polling/no-timers and refresh; baseline artifacts for prior home and flag off; formatter results for simple presentation logic. Existing render budget in milliseconds is UNKNOWN; structural incremental-work checks enforce stated constraints and implementation owner supplies any existing quantitative budget before profiling against it. No service load test is justified by this epic. Evidence is planned and unavailable at present.

Execution: all functional and scoped structural regressions run in PRs with target below 15 minutes once the repository runner exists. No dedicated nightly or weekly suite is needed. Run formatter then component then integration checks; priorities do not defer functional coverage.
Estimates are planning ranges: P0 0 hours, P1 0 hours, P2 approximately 6 to 10 hours, P3 0 hours; total approximately 6 to 10 hours (roughly 1 to 2 working days). Includes test fixture wiring, baselines and evidence triage; creating an entire app or runner is outside the estimate.

Quality gates: P0 100% and P1 at least 95% apply if those bands later gain cases. General P2/P3 informational threshold at least 90%; for this small plan require all 14 scenarios and all four acceptance criteria to pass before epic acceptance. Planned acceptance-criterion coverage 100% exceeds the general 80% target. No unresolved high-severity defects or unmitigated high risks; both risk primary rows pass. Each applicable NFR has recorded implementation evidence; final NFR audit deferred to nfr-assess. Current gate is not evaluated.


## Step 5: Outputs, validation and completion report

Explicit requested mode sequential resolves to sequential. Capability probe false disables runtime probing. Single-worker epic output uses skill/test-design-template.md and the already resolved epic_num 9.

Deliverable: field-sync-indicator/test-artifacts/test-design/test-design-epic-9.md.
Mode: epic-level; run scope epic; run key epic-9; full design.
Key risks: R-001 BUS and R-002 TECH; probability 2, impact 1, score 2 each. No high or medium risk. Each risk has exactly one primary Integration coverage row. Total 14 P2 scenarios; four acceptance criteria covered; planned effort approximately 6 to 10 hours.
Gate thresholds: all 14 scoped cases and four acceptance criteria must pass; general future P0 100%, P1 at least 95%, high-risk mitigations complete, general coverage at least 80%, this epic acceptance coverage 100%. Final release and NFR gates await implementation evidence.
Open assumptions: existing formatter rounding and timestamp representation, runner/platform, store/event/flag seams, prior-home baseline and any numerical render budget.

### Quality & Testing Progress

All five Create steps executed sequentially and saved in order. Deliverable template sections populated; no unresolved placeholders. Requirements inputs were read-only; no test generation occurred. System-level architecture/QA/handoff documents are N/A. No browser or CLI session was started, so cleanup is N/A; no temporary exploration artifacts exist.

Checklist application:
- Epic prerequisites and context: complete. The supplied epic contains stories and acceptance criteria; optional PRD/architecture/prior designs and sprint status are N/A per run configuration. No test suite exists in supplied project; absence of execution history is disclosed.
- Risk assessment: complete. No source gap; exact two story residual risks, unique IDs, categories, bare integer scoring, product equality, source statements, owners/timelines and planned verification recorded. Satisfied controls stay outside scored register.
- NFR planning: complete. Relevant categories, source constraints, UNKNOWN thresholds, clarification assumptions and planned evidence are documented. No final evidence audit is claimed.
- Coverage: complete. Single primary row per risk, canonical levels, atomic scenario IDs, independent P2 consequence/workaround rationale, explicit empty bands and distinct arithmetic/wiring/layout assertions. All four acceptance criteria are traceable.
- Execution and logistics: complete. PR/Nightly/Weekly policy, conditional existing-runner parallelism, range estimates including setup, entry/exit criteria, role ownership, exclusions and component regression scope recorded. No unrequested test infrastructure or external communication is initiated.
- Deliverable validation: complete. Mechanical table-width, risk category/score, count, unique 14 scenario IDs, risk-link cardinality, required section, placeholder and relative-link checks passed. Full output read for polish and consistency.
- Human approval, exclusion acceptance, any team review and implementation execution: pending manual follow-up, explicitly disclosed. No P0 red-mode generation is applicable; automation is a separate workflow.
- Status integration: completion recorded here under this run's checkpoint; no sprint status is required or altered.

Source SHA-256 unchanged: docs/epics/epic-9-last-sync-indicator.md = 11f1b9129a72b521a2bd6a07ce392df841db290094cfab8c3872708415c2e6f7. The documentation tree retains its sole original input file. No file under docs was added, edited or removed.

Base customization has no prepend steps, append steps, persistent facts or completion hook. Project has no customization directory or resolver scripts. Per terminal instructions, attempt workflow.on_complete resolution and skip on resolver failure; no completion action is configured in the base fallback.
