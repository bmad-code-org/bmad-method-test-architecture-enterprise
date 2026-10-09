---
title: 'TEA Command Reference'
description: Inputs, outputs, and invocation rules for the eight TEA workflows
---

# TEA Command Reference

## Invoking a TEA Workflow

Everything below assumes TEA is installed with `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise` and set up with `bmad setup tea`.

The same workflow skill can be invoked in three ways:

| Surface                         | Form                           | Example                   |
| ------------------------------- | ------------------------------ | ------------------------- |
| Claude Code / Cursor / Windsurf | `/bmad-testarch-<workflow>`    | `/bmad-testarch-automate` |
| Codex                           | `$bmad-testarch-<workflow>`    | `$bmad-testarch-automate` |
| Inside a `bmad-tea` chat        | the workflow's two-letter code | `TA`                      |

Load the TEA agent with `/bmad-tea` or `$bmad-tea` to use its menu codes and `GATE` router.
Each workflow also runs directly.

Framework and CI setup share one implementation in `bmad-testarch-framework`.
Both `bmad-testarch-framework` and `bmad-testarch-ci` commands remain available, along with the `TF` and `CI` menu codes. The CI command starts CI setup with your existing customizations.

Automation also shares one skill, `bmad-testarch-automate`, with `red` and `expand` modes. Your prompt selects the mode. `/bmad-testarch-atdd`, `$bmad-testarch-atdd`, and `AT` default to red; `/bmad-testarch-automate`, `$bmad-testarch-automate`, and `TA` default to expand. An unattended request with unclear mode uses its command default and states it in the summary.

This page uses short workflow names.
Two do not map to a command by adding a prefix: `teach-me-testing` carries no `testarch` segment, and `nfr-assess` is `-nfr`.

| Workflow name      | Command                                                     | Menu code |
| ------------------ | ----------------------------------------------------------- | --------- |
| `teach-me-testing` | `/bmad-teach-me-testing` · `$bmad-teach-me-testing`         | `TMT`     |
| `test-design`      | `/bmad-testarch-test-design` · `$bmad-testarch-test-design` | `TD`      |
| `framework`        | `/bmad-testarch-framework` · `$bmad-testarch-framework`     | `TF`      |
| `ci`               | `/bmad-testarch-ci` · `$bmad-testarch-ci`                   | `CI`      |
| `atdd`             | `/bmad-testarch-atdd` · `$bmad-testarch-atdd`               | `AT`      |
| `automate`         | `/bmad-testarch-automate` · `$bmad-testarch-automate`       | `TA`      |
| `evaluate`         | `/bmad-testarch-evaluate` · `$bmad-testarch-evaluate`       | `EV`      |
| `test-review`      | `/bmad-testarch-test-review` · `$bmad-testarch-test-review` | `RV`      |
| `nfr-assess`       | `/bmad-testarch-nfr` · `$bmad-testarch-nfr`                 | `NR`      |
| `trace`            | `/bmad-testarch-trace` · `$bmad-testarch-trace`             | `TR`      |

Workflow outputs use fixed folders under `{test_artifacts}`. Framework and CI setup save progress so you can resume an interrupted run. A file produced once per story, epic, or release carries that scope's `run_key` in its name, such as `epic-16`, `story-1-2-user-authentication`, `release-v1-2-0`, or `system`.
The folders, the run key rules, and what happens to files from earlier TEA versions are in [Output Layout](/docs/reference/configuration.md#output-layout).

To ship your own workflow, package it as custom content and attach it to `bmad-tea` via customization.
See [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md).

## Quick Index

- [`teach-me-testing`](#teach-me-testing): Learn testing (TEA Academy)
- [`test-design`](#test-design): Risk-based test planning
- [`framework`](#framework): Set up a test framework, CI, or both
- [`ci`](#ci): Compatibility entry for CI setup
- [`atdd`](#atdd): Acceptance TDD
- [`automate`](#automate): Test automation
- [`evaluate`](#evaluate): Scored behavioral evaluation
- [`test-review`](#test-review): Quality audit
- [`nfr-assess`](#nfr-assess): NFR Evidence Audit
- [`trace`](#trace): Coverage traceability
- [`GATE`](#gate-agent-menu-shortcut): Release gate routing helper (agent menu only)

---

## teach-me-testing

Learn testing through seven sessions with quizzes and saved progress.

**Phase:** Learning / Onboarding (before all other phases)

**Frequency:** Once per learner (can revisit sessions anytime)

**Key Inputs:**

- Role (QA, Dev, Lead, VP)
- Experience level (beginner, intermediate, experienced)
- Learning goals

**Key Outputs:**

- `{test_artifacts}/teaching-progress/{user_name}-tea-progress.yaml` (progress tracking, resumable)
- `{test_artifacts}/tea-academy/{user_name}/session-{N}-notes.md` (one per completed session)
- `{test_artifacts}/tea-academy/{user_name}/tea-completion-summary.md` (after all 7 sessions)

**7 Sessions:**

1. Quick Start (30 min): TEA Lite intro, engagement models
2. Core Concepts (45 min): Risk-based testing, P0-P3, DoD
3. Architecture (60 min): Fixtures, network-first, data factories
4. Test Design (60 min): Risk assessment, coverage planning
5. ATDD & Automate (60 min): TDD red-green, test generation
6. Quality & Trace (45 min): Test review, traceability, metrics
7. Advanced Patterns (ongoing): 59 knowledge fragments exploration

**Features:**

- Multi-session with state persistence (pause/resume anytime)
- Non-linear (jump to any session based on experience)
- Quiz validation (≥70% to pass)
- Role-adapted examples (QA/Dev/Lead/VP)
- Automatic progress tracking

**How-To Guide:** [Learn Testing with TEA Academy](/docs/how-to/workflows/teach-me-testing.md)

**Tutorial:** [Learn Testing with TEA Academy](/docs/tutorials/learn-testing-tea-academy.md)

---

## framework

Set up a test framework for the detected stack and selected runner, configure CI, or do both in one run.
Your prompt selects the setup scope: framework only, CI only, or both.
TEA infers scope when it can and asks "Do you want CI too?" once when CI scope is unclear in an interactive session. An unattended request with unclear scope runs framework setup only and states that CI was excluded.
For both, TEA agrees the stack, framework, and test commands first, then can generate the scaffold and pipeline in parallel and validate them together. A CI request without a framework offers framework setup first.

Setup scope and operation are independent. Create starts setup, Resume picks up an interrupted run where it stopped, Validate reports checks without repairing outputs, and Edit revises the selected outputs and checks those changes.
`TF` starts framework setup; `CI` and `bmad-testarch-ci` start the same skill's CI setup.

See [Execution Targets](/docs/reference/execution-targets.md) for supported frameworks.

**Phase:** Phase 3 (Solutioning)

**Frequency:** Once per project

**Key Inputs:**

- Setup scope (framework only, CI only, or both), tech stack, test framework choice, testing scope
- For CI scope: platform, sharding, burn-in preferences, and existing evaluation CI plans

**Key Outputs:**

- `tests/README.md` (declared `default_output_file`: setup, running tests, architecture, CI integration)
- `tests/` directory with `support/fixtures/` and `support/helpers/`
- `playwright.config.ts` or `cypress.config.ts`
- `.env.example`, `.nvmrc`
- Sample tests with best practices
- When CI is included: the pipeline, quality gates, evaluation jobs, and CI documentation listed under [`ci`](#ci)

**How-To Guide:** [Setup Test Framework](/docs/how-to/workflows/setup-test-framework.md)

---

## ci

Start the CI phase of `bmad-testarch-framework`, with selective testing and burn-in.
The `/bmad-testarch-ci`, `$bmad-testarch-ci`, and `CI` invocations select CI scope and preserve CI-specific customizations.
Request CI through the framework skill to get the same phase. If the project has no test framework, TEA offers to create it first.

**Phase:** Phase 3 (Solutioning)

**Frequency:** Once per project

**Key Inputs:**

- CI platform (GitHub Actions, GitLab CI, etc.)
- Sharding strategy, burn-in preferences
- Any `ci/evaluation-ci-plan.json` an evaluation holds, which the workflow detects and renders

**Key Outputs:**

- Platform-specific CI workflow (`.github/workflows/test.yml` by default, resolved per platform)
- Parallel execution configuration
- Burn-in loops for flakiness detection
- An `evaluation-<tier>` job per tier an evaluation plan places a check on, with an `if: always()` upload of the evaluation folder's `runs/`
- `docs/ci.md` (pipeline guide) and `docs/ci-secrets-checklist.md` (required secrets)

**How-To Guide:** [Setup CI Pipeline](/docs/how-to/workflows/setup-ci.md)

---

## test-design

Risk-based test planning with coverage strategy and NFR planning

**Phase:** Phase 3 (system-level), Phase 4 (epic-level)

**Frequency:** Once (system), per epic (epic-level)

**Modes:**

- **System-level:** Architecture testability review and NFR planning (TWO documents)
- **Epic-level:** Per-epic risk and NFR planning (ONE document)

**Key Inputs:**

- System-level: Architecture, PRD, ADRs
- Epic-level: Epic, stories, acceptance criteria

**Key Outputs:**

**System-Level (TWO Documents plus a handoff):**

- `{test_artifacts}/test-design/test-design-architecture.md`: For Architecture/Dev teams
  - Quick Guide (🚨 BLOCKERS / ⚠️ HIGH PRIORITY / 📋 INFO ONLY)
  - Risk assessment with scoring
  - Testability concerns and gaps
  - NFR thresholds, unknowns, and planned evidence
  - Mitigation plans
- `{test_artifacts}/test-design/test-design-qa.md`: For QA team
  - Test execution recipe
  - Coverage plan (P0/P1/P2/P3 with checkboxes)
  - Sprint 0 setup requirements
  - NFR test coverage and evidence plan
- `{test_artifacts}/test-design/{project_name}-handoff.md`: System-level only.
  Bridges the test design outputs into epic/story decomposition, for BMAD's `create-epics-and-stories` workflow

**Epic-Level (ONE Document):**

- `{test_artifacts}/test-design/test-design-epic-N.md`
  - Risk assessment (probability × impact scores)
  - Test priorities (P0-P3)
  - Coverage strategy
  - NFR planning when NFRs are in scope
  - Mitigation plans

Why the system-level split exists: [TEA Overview](/docs/explanation/tea-overview.md) and [Run Test Design](/docs/how-to/workflows/run-test-design.md).

**Browser Automation (CLI/MCP):** Exploratory mode (live browser UI discovery)

**How-To Guide:** [Run Test Design](/docs/how-to/workflows/run-test-design.md)

---

## atdd

Start the automation skill in red mode to generate acceptance test scaffolds before implementation. The existing ATDD command and `AT` menu code select this default mode. Your prompt can explicitly select either mode.

Create verifies an isolated, activated copy with `tea-atdd-red-check` when the verifier is available and compatible with the project. When it is unavailable or incompatible, Create uses the project's native runner with its original configuration and environment. Verification confirms failures match the missing acceptance behavior and repairs test setup or generation errors for up to three rounds. The saved red scaffolds retain their deliberate skips for the implementation handoff. Validate reports findings; Edit checks its changes. Neither operation runs repair.

**Phase:** Phase 4 (Implementation)

**Frequency:** Per story (optional)

**Key Inputs:**

- Story with acceptance criteria, test design, test levels

**Key Outputs:**

- Red-phase test scaffolds (`tests/api/`, `tests/e2e/`) marked with `test.skip()`
- Implementation checklist keyed to `story_key`: `{test_artifacts}/atdd/atdd-checklist-{story_key}.md`
- Story metadata / handoff paths for downstream `dev-story` consumption

**Browser Automation (CLI/MCP):** Recording mode (for skeleton UI only; rare)

**How-To Guide:** [Run ATDD](/docs/how-to/workflows/run-atdd.md)

---

## automate

Generate tests through the automation skill. `expand` mode adds coverage after implementation; `red` mode writes acceptance scaffolds before implementation. `/bmad-testarch-automate` and `TA` default to expand.

Create executes the generated tests and repairs selector, timing, data, network, hard-wait, or setup issues for up to three rounds. Expand aims for passing tests. Real product defects remain findings with their assertions intact. Red verifies that each test fails for its intended missing behavior. The summary lists repairs and remaining failures. Validate reports findings and Edit checks the requested changes; these operations never repair tests.

**Phase:** Phase 4 (Implementation)

**Frequency:** Per story/feature

**Key Inputs:**

- Feature description, test design, existing tests to avoid duplication

**Key Outputs:**

- Tests for the selected scenarios (`tests/e2e/`, `tests/api/`, or the stack-appropriate folders)
- Updated fixtures, README
- `{test_artifacts}/automate/automation-summary-{run_key}.md` (declared `default_output_file`, carries the Definition of Done checklist)

**Browser Automation (CLI/MCP):** Healing + Recording modes (fix tests, verify selectors)

**How-To Guide:** [Run Automate](/docs/how-to/workflows/run-automate.md)

---

## evaluate

Build and score an evaluation of a skill, agent, workflow, tool-use system, AI feature, or test-review mechanism.
Identify gaps and produce a CI plan.

**Phase:** Phase 4 (Implementation), after `automate` and before framework CI setup

**Frequency:** Once per evaluated target, then again when the target's behavior changes

**Key Inputs:**

- The target to evaluate, which the workflow inspects
- Behavioral requirements you confirm
- The `evaluations_folder` setting in `_bmad/custom/bmad-testarch-evaluate.toml` (default `evals`)

**Key Outputs:**

- `<evaluations_folder>/<evaluationId>/`: `evaluation.json`, `requirements.md`, `contract.json`, probes, corpus, scored runs under `runs/`, and the committed `baseline/`
- `<evaluations_folder>/<evaluationId>/ci/evaluation-ci-plan.json`, which `framework` renders into a pipeline with CI scope
- `{test_artifacts}/evaluate/<evaluationId>/inspection-record.md`

**Runtime:** [`tea-evaluate`](/docs/reference/tea-evaluate-cli.md) validates, digests, preflights, runs, scores and compares the folder and runs its CI tiers.

**Tutorial:** [Evaluate Your First Skill](/docs/tutorials/evaluate-your-first-skill.md)

**How-To Guides:** [Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md), and the other Evaluate guides under See Also

---

## test-review

Audit test quality with 0-100 scoring

**Phase:** Phase 4 (optional per story), Release Gate

**Frequency:** Per epic or before release

**Key Inputs:**

- Test scope (file, directory, or entire suite)

**Key Outputs:**

- `{test_artifacts}/test-review/test-review-{run_key}.md` with quality score (0-100) and grade (A-F)
- Critical issues with fixes, and recommendations
- A `## Quality Criteria Assessment` table with the criteria that apply to the repository, each `PASS` / `WARN` / `FAIL`, and Test Duration as `Not measured`
- Coverage guidance is informational only; coverage scoring and gates are handled by `trace`

The review uses a deduction ledger.
Four review workers cover determinism, isolation, maintainability, and performance; `tea_execution_mode` controls their dispatch.
Each violation cites a `criteria-registry.md` row that fixes its severity.
After deduplication by `file:line:row`:

```text
raw score = 100 - (Critical × 10 + High × 5 + Medium × 2 + Low × 1) + bonus
```

The raw score is clamped to 0-100.
The effective score is the lower of the raw score and the cap for the highest finding severity: CRITICAL 69, HIGH 79, MEDIUM 89, or LOW 99.
With no findings, the effective score equals the raw score.
Five bonus categories each award `0` or `5`: Comprehensive Fixtures, Data Factories, Network-First, Perfect Isolation, and All Test IDs.
A bonus requires the criterion to hold across every reviewed file.

The recommendation follows these rules: `Block` when Critical > 0, `Request Changes` when High > 0 or score < 70, `Approve with Comments` when any Medium or Low remain, otherwise `Approve`.

**How-To Guide:** [Run Test Review](/docs/how-to/workflows/run-test-review.md)

---

## nfr-assess

Audit implemented NFR evidence against defined thresholds

**Phase:** Release Gate; optional earlier evidence audit when implementation evidence exists

**Frequency:** Per release (enterprise projects)

**Key Inputs:**

- NFR categories (Security, Performance, Reliability, Maintainability), plus any `custom_nfr_categories`
- Thresholds from PRD, architecture, or `test-design`
- Evidence locations (test reports, scans, metrics, logs, monitoring, CI results)

**Key Outputs:**

- `{test_artifacts}/nfr/nfr-assessment-{run_key}.md`
- Category assessments (PASS/CONCERNS/FAIL)
- A Gate YAML snippet whose `audited_domains` block declares one status per domain (PASS, CONCERNS, FAIL or N/A), so reading a domain status does not mean parsing the report's prose
- Mitigation plans
- Gate decision inputs

**Boundary:** Use `test-design` to plan NFR thresholds and evidence before implementation.
Use `nfr-assess` after evidence exists to audit the evidence.

**How-To Guide:** [Run NFR Evidence Audit](/docs/how-to/workflows/run-nfr-assess.md)

---

## trace

Coverage traceability + quality gate decision

**Phase:** Phase 2/4 (traceability), Release Gate (decision)

**Frequency:** Baseline, per epic refresh, release gate

**Two-Phase Workflow:**

### Phase 1: Coverage Traceability

- Coverage oracle items → test mapping
- Coverage classification (FULL/PARTIAL/NONE)
- Gap prioritization
- Output: `{test_artifacts}/trace/traceability-matrix-{run_key}.md`

### Phase 2: Gate Decision

- PASS/CONCERNS/FAIL decision, with filed human waivers validated and reported separately
- Coverage thresholds, oracle confidence, and recorded live verification determine the decision
- Outputs: `{test_artifacts}/trace/e2e-trace-summary-{run_key}.json` (machine-readable summary for CI), and `{test_artifacts}/trace/gate-decision-{run_key}.json` when `allow_gate` is true and collection is gate-eligible

**Gate Rules:**

- P0 coverage: 100% required
- P1 coverage: ≥90% for PASS, ≥80% and <90% for CONCERNS, <80% FAIL
- Overall coverage: ≥80% required
- With no P1 requirements, P1 coverage counts as 100% for the gate
- An inferred oracle with less than high confidence caps a passing decision at CONCERNS; with no active test cases, high confidence becomes medium
- Requirements covered only by recorded live verification cap a passing decision at CONCERNS

The decision runs only when `allow_gate` is true and collection status is COLLECTED.

**How-To Guide:** [Run Trace](/docs/how-to/workflows/run-trace.md)

---

## GATE (Agent Menu Shortcut)

Release gate routing helper.
It is not a standalone workflow and produces no artifact of its own.

**Trigger:** Type `GATE` in chat after loading the TEA agent (`bmad-tea`).

**What it does:** Determines which release gate evidence exists and guides you through the correct sequence:

1. (Optional) `test-review` for a final test quality audit
2. (Optional) `nfr-assess` for an NFR Evidence Audit
3. `trace` Phase 2 for the derived PASS/CONCERNS/FAIL gate decision

The agent asks which evidence is available and invokes each needed workflow in sequence.

Use `GATE` as a starting point when preparing a release.

---

## See Also

**How-To Guides (Detailed Instructions):**

- [Learn Testing with TEA Academy](/docs/how-to/workflows/teach-me-testing.md)
- [Setup Test Framework](/docs/how-to/workflows/setup-test-framework.md)
- [Setup CI Pipeline](/docs/how-to/workflows/setup-ci.md)
- [Run Test Design](/docs/how-to/workflows/run-test-design.md)
- [Run ATDD](/docs/how-to/workflows/run-atdd.md)
- [Run Automate](/docs/how-to/workflows/run-automate.md)
- [Run Test Review](/docs/how-to/workflows/run-test-review.md)
- [Run NFR Evidence Audit](/docs/how-to/workflows/run-nfr-assess.md)
- [Run Trace](/docs/how-to/workflows/run-trace.md)

**Evaluate:**

- [Evaluate Your First Skill](/docs/tutorials/evaluate-your-first-skill.md): tutorial
- [Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md)
- [Evaluate an MCP Tool Server](/docs/how-to/evaluate/evaluate-an-mcp-tool-server.md)
- [Evaluate an HTTP API](/docs/how-to/evaluate/evaluate-an-http-api.md)
- [Choose an Evaluator and Calibrate a Judge](/docs/how-to/evaluate/choose-an-evaluator-and-calibrate-a-judge.md)
- [Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md)
- [Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md)
- [Put an Evaluation in CI](/docs/how-to/evaluate/put-an-evaluation-in-ci.md)
- [Bring an Existing Suite](/docs/how-to/evaluate/bring-an-existing-suite.md)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md): explanation
- [Why Evaluate Confines the Target](/docs/explanation/why-evaluate-confines-the-target.md): explanation

**Explanation:**

- [TEA Overview](/docs/explanation/tea-overview.md): Complete TEA lifecycle
- [Engagement Models](/docs/explanation/engagement-models.md): When to use which workflows

**Reference:**

- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md): Evaluate runtime
- [TEA Configuration](/docs/reference/configuration.md): Config options
- [Knowledge Base Index](/docs/reference/knowledge-base.md): Pattern fragments
