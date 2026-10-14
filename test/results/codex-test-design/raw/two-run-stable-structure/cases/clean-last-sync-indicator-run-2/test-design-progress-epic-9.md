---
runScope: 'epic'
runKey: 'epic-9'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-14'
---

## Step 1: Mode and prerequisites

Create mode; epic-level; epic 9; full design; sequential execution; capability probe disabled.
Project: field-sync-indicator. Config: field-sync-indicator/_bmad/config.toml.
User: tea-eval-harness. Communication and document language: English.
Requirements source: docs/epics/epic-9-last-sync-indicator.md, including stories 9.1 and 9.2 and four acceptance criteria.
Architecture, PRD and sprint status are outside the supplied input set; prerequisites are satisfied by the epic.
Run identity: run_scope=epic, run_key=epic-9, epic_num=9. No existing checkpoint found in either scoped location.
Deliverable: test-artifacts/test-design/test-design-epic-9.md.

## Step 2: Context and knowledge

Config utility flags tea_use_playwright_utils, tea_use_pactjs_utils, tea_pact_mcp and tea_browser_automation are unset. test_stack_type defaults to auto. No manifests, application source, runner configuration, tests, fixtures or target URL are supplied; detected stack remains undetermined. Device terminology alone does not establish a mobile framework. Browser exploration is inapplicable; capability probing is disabled. Contract relevance conditions are absent.

Requirements: AC1 shows relative time of most recent successful sync; AC2 hides the entire row for absent timestamp; AC3 updates on existing completion event; AC4 flag off restores exact prior screen. Stories constrain the read to the existing local store, a single key lookup, read-only access, no added network/storage/polling/timer and the existing organization flag.

Integration points: local settings store lastSuccessfulSyncAt, home-screen rendering/formatter, sync completion event shared with progress spinner, home_last_sync_row flag. Existing coverage and flakiness cannot be established from this requirements-only fixture. No prior system-level plans exist. PRD, architecture and sprint status are outside the run input set.

Knowledge selected in deterministic order: risk-governance.md, probability-impact.md, test-levels-framework.md, test-priorities-matrix.md, nfr-criteria.md. The final fragment is required by the epic's explicit security, read-only data integrity, render-budget and rollback constraints. Knowledge examples supply methods, not additional project requirements.

inputDocuments to carry into final frontmatter:
- field-sync-indicator/_bmad/config.toml
- field-sync-indicator/docs/epics/epic-9-last-sync-indicator.md
- bmod-tea/knowledge/risk-governance.md
- bmod-tea/knowledge/probability-impact.md
- bmod-tea/knowledge/test-levels-framework.md
- bmod-tea/knowledge/test-priorities-matrix.md
- bmod-tea/knowledge/nfr-criteria.md

All supplied prerequisites are loaded. No clarification is required.

## Step 3: Risk and NFR assessment

System-level architectural review is inapplicable. Gap inventory: empty. Context describes the intended addition; stories and acceptance criteria define expected behavior. The source explicitly satisfies privacy, read-only data integrity, local lookup/render cost and feature-flag rollback controls. These are regression constraints. No new exposure is evidenced.

Residual register, exactly one row per story:

### High-Priority Risks (Score ≥6)

No identified risks.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |

### Medium-Priority Risks (Score 3-4)

No identified risks.

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-001 | BUS | Render the last successful sync time (story 9.1): an incorrect or missing relative label leaves the technician asking dispatch for freshness. Source: epic story 9.1 and Context. | 2 | 1 | 2 | Document residual display risk; Dev owns store-to-screen checks before Epic 9 acceptance. |
| R-002 | TECH | Keep the value current while the screen is open (story 9.2): completion-event wiring may leave the label stale until the screen reopens. Source: epic story 9.2 and AC3. | 2 | 1 | 2 | Document residual event-integration risk; Dev owns completion-to-render checks before Epic 9 acceptance. |

Probability 2 reflects possible timestamp/absence handling and event subscription mistakes in new display wiring. Impact 1 reflects an informational row with the existing dispatch workaround and reversible flag, while sync and stored data remain unchanged. No evidence establishes likelihood 3 or critical impact. Highest score is 2; total 2 risks; high 0; medium 0; low 2. No scored SEC, PERF, DATA or OPS exposure.

NFR planning: security preserves the device-local timestamp with no added personal data or exposure; data integrity requires zero row-originated writes and new fields; performance requires a single local key lookup on the existing store, zero added network/storage/polling/timers and the unchanged existing screen render budget; reliability requires the existing completion event and spinner remain functional (R-002); operations preserves home_last_sync_row rollback and organization targeting. Evidence planned: integration call traces, formatter/unit assertions and component/screen baseline comparisons. Absolute render milliseconds and event-to-render deadline are UNKNOWN and absent from source; record as implementation validation assumptions outside the risk register. No new SLA, security scan, load test or compliance target is inferred. Maintainability and scalability add no epic-specific targets. Planning establishes no execution PASS/FAIL or measured implementation evidence.

## Step 4: Coverage and execution plan

Priority decision tree for both residual risks: the epic describes a secondary informational addition; dispatch remains the supported freshness workaround; existing flag restores the prior screen; no revenue, security, compliance, data mutation, core-operation blocker, usage metric or material reach is established. Both are P2. Flag exact restoration and bounded side-effect regressions are P2 acceptance coverage; formatter boundary checks are P2. P0/P1/P3 are empty.

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Story 9.1; AC1 and AC2 | Integration | R-001 | 3 | Dev | Store-to-screen mechanism crosses the owned local settings boundary, first observable at Integration. Scenarios 9.1-INT-001: fixed now and latest persisted timestamp display synced 4 minutes ago; 9.1-INT-002: absent key omits entire row and preserves remaining layout; 9.1-INT-003: reopen after newer stored successful timestamp and show that value. Failure is missing/incorrect freshness information; dispatch remains the workaround (Context). |
| Story 9.2; AC3 | Integration | R-002 | 3 | Dev | Subscription-to-render mechanism crosses the existing owned completion-event boundary, first observable at Integration. Scenarios 9.2-INT-001: visible old value transitions after each of two successful completions to the latest stored value, with spinner working; 9.2-INT-002: absent row appears after first successful completion; 9.2-INT-003: failed attempt preserves prior successful value. Failure is stale informational label; existing timestamp can be read on screen reopen and dispatch remains available (stories 9.1/9.2, Context). |
| Relative-time formatting boundary regression, AC1 | Unit | - | 2 | Dev | Pure timestamp-to-label formatting crosses no external boundary. 9.1-UNIT-001: recent elapsed times around the existing formatter's minute boundary; 9.1-UNIT-002: older elapsed times around its hour boundary. Use frozen clock and established formatter wording, which the supplied epic leaves unspecified beyond its four-minute example. |
| home_last_sync_row off, AC4 | Component | - | 2 | Dev | One rendered home-screen interface with deterministic flag state. 9.1-COMP-001: stored timestamp plus flag off matches prior home-screen baseline exactly; 9.1-COMP-002: absent timestamp plus flag off matches the same baseline. Compare visible structure, spacing, semantics and controls with identical screen fixtures. |
| Satisfied local/read-only/event constraints | Integration | - | 1 | Dev | 9.2-INT-004: trace mounting, completion and unmounting with flag on/off against baseline: one existing key lookup per required read, zero added writes/new fields/store openings/network calls/polling/timers; repeated mount leaves no added listener after cleanup, spinner remains functional. Controls are source-defined regression assertions with no scored exposure. |

Total: 11 P2 scenarios; P0=0, P1=0, P3=0. Level distribution: Integration 7, Unit 2, Component 2. No API or E2E boundary is established for the primary risks. Coverage spans all four ACs and both residual risks; each risk has exactly one linked row. Guard rows cover satisfied constraints with '-' links.

NFR evidence: privacy and read-only/local cost from integration traces in 9.2-INT-004; event reliability from R-002 row and spinner assertions; rollback from component baseline comparison. Absolute render-budget threshold and quantitative refresh deadline are UNKNOWN, with source-level zero-extra-work constraints as the planned oracle. No new load/chaos/security infrastructure is required. Stack, runner and artifact filenames remain implementation assumptions.

Execution: PR runs all functional unit/component/integration scenarios, targeting under 15 minutes; actual time is unmeasured. Nightly and weekly add no epic-specific expensive suite. Priority ordering remains P0, P1, P2, P3 when such bands exist. Workflow execution itself is sequential.

Effort intervals: P0/P1/P3 each 0 hours; P2 and total approximately 4 to 8 hours (0.5 to 1 working day at 8 hours/day), conditional on the product's existing harness. 7 Integration scenarios: 3 to 6 hours; 2 Unit: 0.5 to 1 hour; 2 Component: 0.5 to 1 hour. Estimates include local fixtures/baseline and checks; application-wide harness setup is excluded because no implementation is supplied.

Quality gates: P0=100% and P1≥95% if such tests enter scope; currently both N/A. Generic P2/P3 ≥90% informational, plus all four Epic 9 acceptance criteria must pass. Planned requirement coverage 100% (4/4), exceeds the default ≥80% target; risk traceability 100% (2/2). Any later high-risk mitigation must complete before release or have an approved owner/reason/expiry waiver. Evidence required for every in-scope NFR; final NFR assessment deferred until implementation evidence exists. No test execution or release decision claimed.

## Step 5: Output, validation and completion

Execution mode resolved from user: sequential. Capability probe false; no capability probe or workers launched. Epic-level template selected: skill/test-design-template.md. Single deliverable written: field-sync-indicator/test-artifacts/test-design/test-design-epic-9.md. No system-level handoff applies.

Checklist validation completed by tea-eval-harness on 2026-10-14 for Epic 9:
- Epic-mode prerequisites and all five ordered steps complete. PRD, architecture, sprint status, system-level documents and system-level handoff are N/A by run scope.
- All applicable template sections populated, optional roles represented as draft responsibility placeholders; approval remains pending. Team scheduling is future manual work.
- Gap inventory empty; residual rule produces exactly two story-owned risks, BUS and TECH, each probability 2, impact 1, score 2. High and medium tables have no body rows; canonical headings and schemas preserved.
- Each risk has exactly one integration coverage row; all other rows use '-'. Five coverage rows contain eleven unique scenario IDs with counts 3+3+2+2+1. All four acceptance criteria mapped; planned coverage 100%.
- NFR constraints, UNKNOWN quantitative thresholds and planned evidence are recorded without final evidence status. Satisfied controls remain regression assertions. No new scored exposure inferred.
- Priorities and execution timing are separate; PR/Nightly/Weekly strategy is concise. P0/P1/P3 empty bands justified; no P0 red-mode work applies. Existing runner, CLI and Playwright-specific execution checks are N/A because no stack or target is supplied.
- Resource and timeline intervals provided; inactive bands have zero scope. Quality gates P0 100%, P1 at least 95%, acceptance coverage 100%, high-risk completion if future risks arise, and NFR evidence collection defined.
- Existing coverage scan found no implementation, tests or flakiness evidence. Dependencies and interworking describe the product evidence required for later execution.
- Programmatic validation passed: section completeness, table cell counts, unique risk IDs, bare numeric cells, score multiplication, exact risk-to-coverage mapping, scenario counts/IDs, resolved local links and absence of unresolved placeholders.
- Read the complete output for consistency and formatting. No browser session opened, no temporary exploration artifacts created, no test code generated. The sole requirements document was verified byte-for-byte equal to the input read at step 1; docs inventory remains the same.

Completion report: epic-level/full/sequential; output is the Epic 9 plan named above; highest residual risk score 2; all four acceptance criteria must pass; stack, formatter convention, numeric render budget and execution timing remain documented implementation assumptions. Design workflow complete; no release approval claimed.
