---
stepsCompleted:
  ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - '_bmad-output/planning-artifacts/evaluate/SPEC.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-vocabulary.md'
  - '_bmad-output/planning-artifacts/evaluate/target-kind-adapter-mapping.md'
  - '_bmad-output/planning-artifacts/evaluate/ci-enforcement-policy.md'
  - '_bmad-output/planning-artifacts/evaluate/input-notes.md'
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/planning-artifacts/live-eval-remediation-story.md'
  - 'AGENTS.md'
  - 'package.json'
  - 'test/evals/suite-manifest.json'
  - 'eval-quality@467e3a3: package.json'
  - 'eval-quality@467e3a3: src/core/probe/target-policy.ts'
  - 'eval-quality@467e3a3: src/adapters/command-target-policy.ts'
  - 'eval-quality@467e3a3: CHANGELOG.md'
---

# TEA Evaluate: Epic Breakdown

## Overview

This document breaks the Evaluate capability (`SPEC.md`, CAP-1 to CAP-14) into two epics and thirty-one stories, bound by the twenty-three architecture decisions in `ARCHITECTURE-SPINE.md` (cited as AD-n). `SPEC.md` stands in for the PRD: its capabilities are the functional requirements and its constraints are the non-functional requirements.

Evaluate is fully stacked. The stack runs system under test, then the evaluation (the mechanism that runs the system, collects evidence and makes judgments), then the Behavioral Evaluation Contract (what behavior matters, what evidence counts, how success and failure resolve), then eval-quality (contract sanity, evidence support, and whether the evaluation catches defects). TeA owns every layer above eval-quality, including each concern eval-quality states it leaves to the caller, so an adopter can evaluate any target end to end. The 2026-09-23 amendment added Stories 1.17 to 1.26 and extended Stories 1.3 onward, Epic 2 and H.1 to close the plan gap audit; the Traceability section maps each audit item to the story that closes it.

Every story lands as its own pull request against `main`, in the order written. Stories keep their numbers: the ten stories added by the amendment carry the next free numbers and sit in this document at their execution position, which the Epic Dependencies table also gives. A fresh coordinator session runs each story: a worker builds it, an independent reviewer session gives the final review, the coordinator merges it and hands the next story to a new coordinator. Story H.1 names the release, baseline and replay steps that close the plan; the coordinator of the story they follow runs them.

## Build Rules For Every Story

These apply to every story and are not repeated in each one.

- **Worktree.** TeA stories run in the TeA build worktree the coordinator assigns. Paths are repository-relative. Story 1.1 runs in the eval-quality worktree it names.
- **One pull request per story.** A story branches from `main` (`feat/evaluate-<story-id>`), opens a pull request with a conventional title, and is done when CI is green, every CodeRabbit finding is fixed or answered with a reason and its thread resolved, and the final reviewer has passed it. The coordinator merges it.
- **Engine.** Story 1.1 is merged and released in eval-quality before any TeA story merges, so TeA runs on the published release that carries the target-policy export and trial-set scoring (eval-quality #143). Story 1.2 raises TeA's `eval-quality` devDependency to that release; no story installs a local tarball once the release exists. The engine check, run at the start and end of every TeA story, is:

  ```sh
  node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"
  ```

  `package.json` and `package-lock.json` never reference the tarball; `git diff -- package.json package-lock.json` shows no `file:` or `.tgz` spec at the end of any story.

- **Skill gates (AD-16, AD-17, AD-18).** A story that authors or edits `src/workflows/testarch/bmad-testarch-evaluate/` does it through `/bmad-workflow-builder` Build or Edit, run headless on that explicit path. The builder never commits and never edits outside the skill directory. After implement and before review, in order: builder Analyze with zero critical and zero high findings (a finding that contradicts a repository test is skipped, with the reason recorded in the story's completion notes); `/bmad-module-builder` Validate Module on the AD-17 staged layout with zero new critical or high findings against the same staged run on main, when `src/module.yaml`, `src/module-help.csv`, `src/agents/bmad-tea/customize.toml` or `.claude-plugin/marketplace.json` changed; then `npm test`.
- **`bmad-testarch-ci` edits (AD-11).** Authored directly, in the house shape. Gated by its house tests, `node tools/generate-contracts.js --check` for `ci.contract.json`, and its existing suite's replay. Builder Analyze does not apply.
- **Gate commands (AGENTS.md).** Every TeA story ends with `npm test` green, which chains `lint`, `lint:md` and `format:check`. A story that changes `package.json`, a workflow or release behavior also runs `npm run test:release-metadata`. A story that changes `docs/` also runs `npm run docs:validate-links` and `npm run docs:build`. Every new npm script gets its own `.github/workflows/quality.yaml` step in the same story, which `npm run test:ci-coverage` enforces.
- **Changelog.** Every story adds its entry under `## [Unreleased]` in `CHANGELOG.md`.
- **Live runs.** Live evaluation runs execute through the local Claude Code CLI on the owner's subscription. They need no API key and no spending approval.
- **Reverting a story.** Each acceptance criterion names a check that fails when the story's work is reverted. A check that would still pass after a revert is not an acceptance check. The worker exercises each revert check once (undo the change locally, observe the named failure, restore) and records the observation in the story's completion notes.
- **Test plan.** `test-design-epic-1.md` and `test-design-epic-2.md` in this folder give each story's test levels, test files and per-criterion revert checks. A story's tests follow them.
- **Craft is a deliverable.** A story that writes a stage guide under `references/` teaches the craft of its stage with worked examples, and its guidance test asserts each named section by an exact heading and fails when one is removed. Worked examples that are contract, oracle, rubric, mutation or plan fragments are fenced JSON blocks tagged with an HTML comment (`<!-- example:<kind> -->`); the guidance test extracts every tagged block and validates or compiles it through the same engine or runtime schema a real artifact meets, so an example that drifts from the engine fails the gate. Term presence alone never closes a craft criterion; Stories 1.24 to 1.26 prove the guidance behaviorally.
- **Framework neutrality.** `cli/` imports only the externals the `cli` layer's `allow` list in the `dependency-direction` section of `eval-quality.config.json` names (Story 1.4), so an import of any evaluation framework fails `test:direction` whatever the framework is called (AD-21, NFR10). Framework-specific code lives only in an adopter's `evaluator/` folder, rendered from a skill template or written by the adopter. A secondary name scan in `test:evaluate-boundaries` also catches a framework named in a string or a dynamic path.
- **Vendor models.** The system under test is always the adopter's use of a vendor model or dependency. In a run that uses a model (a live target, a sealed-brief agent, a model judge or a model-graded framework evaluator), the model is a fixed condition recorded in `EvaluatorConfiguration.modelSnapshot` (NFR8). A run that uses no model (the deterministic evaluator, or a `command` evaluator that calls none) still fills the schema's required fields: `modelSnapshot` is the literal `none` and `systemPromptDigest` is `digestBytes` over the empty byte string (Stories 1.8 and 1.17).

## Requirements Inventory

### Functional Requirements

FR1 (CAP-1): Inspect the target (entry points, behaviors, surfaces, existing tests, failure history), identify the target kind (agent, skill, workflow, tool-use system, AI feature, test-review mechanism) and map it to the interface kind (`cli`, `api`, `mcp`) and adapter shape; ask when the description is ambiguous; a web application maps to `api`; no generated contract declares `web`; a request to evaluate a vendor model itself is redirected to the adopter's use of it.

FR2 (CAP-2): Capture the behavioral requirements and constraints inspection cannot infer (what must be proven, admissible evidence, interfaces and resources in scope, boundary conditions, operational constraints, failure modes), as a written statement the adopter confirms before corpus design.

FR3 (CAP-3): Design the probe corpus per target kind: representative inputs, negative and malformed inputs, held-out probes, at least one clean control (`zero-action`, `expectedClean: true`), one seeded-defect probe per behavior or that probe recorded as refused with its reason, a `zero-action` defect probe per mandatory-action behavior, a gameability probe per rubric- or judgment-governed behavior, plus the corpus layout and digest.

FR4 (CAP-4): Author the Behavioral Evaluation Contract under eval-quality's authoring discipline and stamp its identity and lineage fields; `eval-quality compile` and `seal` exit 0 and every behavior carries a non-null `observableSuccessCriterion`.

FR5 (CAP-5): One designated oracle per discharged behavior with a chosen relation and resolvable evidence pointers, and a compiling, anchored rubric wherever judgment needs a scale, judged by a calibrated judge.

FR6 (CAP-6): Scaffold the runner command, MCP wiring or HTTP port, registered in an execution-target registry; `preflight` reduces a real observation with no `interface-not-authorized` or `executable-not-authorized` denial.

FR7 (CAP-7): Apply and roll back each controlled mutation with baseline-pass and mutated-fail evidence, `rollbackVerified: true` backed by a performed rollback, `historical` probes with fail-before and pass-after evidence, refused probes with a reason, and every admitted manifestation witness resolving at preflight.

FR8 (CAP-8): Generate the scoring policy, evaluator configuration and isolation manifest, valid against eval-quality's schemas, with every threshold set by the adopter.

FR9 (CAP-9): Run clean and mutated arms through the chosen evaluation layer, seal the run records and drive compile, seal, preflight and score end to end: clean arm `passed-clean-control`, seeded probe `caught`.

FR10 (CAP-10): For a CONCERNS, FAIL or Invalid result, or a weak strength vector, name the unsatisfied rule, failed preflight check, missing evidence or loose oracle, separate process findings from outcome findings, name the first material error, propose the probe, control or oracle that closes the gap, author it, rerun and rescore.

FR11 (CAP-11): Wire continuous proof into the adopter's CI with tiers placed from an inspection of the adopter's repository, CI, release flow and risk profile (AD-10's table as the default) and a per-check enforcement class, keeping target failure, evaluation weakness, repository-policy violation and infrastructure failure apart; deterministic checks, including the gameability arm, contract-source freshness and oracle-versus-scorer agreement, run on every pull request.

FR12 (CAP-12): A completed CI run leaves a retrievable evidence bundle and a recorded baseline for comparison.

FR13 (CAP-13): Build or choose the evaluation layer (TeA's deterministic evaluator, a sealed-brief agent evaluator, an adopter harness that seals its own records, a skill-specific evaluator, custom code, or any external evaluation framework, including one absent from Evaluate's guides and learned from its primary sources at run time), and bring its results into eval-quality evidence through one framework-neutral import contract.

FR14 (CAP-14): Hold out probes from the authoring loop and report their results as a separate partition, and calibrate every rubric judge against adopter-labelled examples before its scores count.

### NonFunctional Requirements

NFR1: eval-quality is the fixed measurement engine; TeA keeps no copy of compile, seal, preflight reduction, scoring or strength logic (AD-1).

NFR2: eval-quality performs no mutation and executes no target; TeA's runtime does both (AD-5, AD-8).

NFR3: Only `cli`, `api` and `mcp` are emitted; `web` never is (AD-4).

NFR4: A defect signature addresses an exit code or the descriptor-nominated stream or response body, or the probe is refused with its reason (AD-19).

NFR5: A behavior discharged by a probe declares exactly one oracle (AD-19).

NFR6: Versions float; nothing pins eval-quality (AD-13).

NFR7: Behavioral verdicts are enforced through eval-quality's exit codes only; `eval-quality-gates` enforces repository policy only (AD-10).

NFR8: The system under test is the adopter's own use of a vendor dependency; the model is a fixed condition of every run.

NFR9: Public repository: no third-party individuals and no employer-internal systems are named.

NFR10: The runtime is framework-neutral: adding an evaluation framework needs no change to `cli/` or to eval-quality, and the `cli` layer's dependency-direction `allow` list, which names no framework, fails any framework import from `cli/` (AD-21).

### Additional Requirements

- One skill, `bmad-testarch-evaluate`, menu code `EV`, with its full registration set (AD-2), in the lean builder shape (AD-3).
- A shipped runtime bin, `tea-evaluate`, over `cli/lib/evaluate/`, with seven subcommands, generalized from TeA's test harness, which is re-pointed at it (AD-5).
- The eval-quality CLI decides every enforced verdict; the library only plans and drives preflight legs (AD-6).
- One run-record shape with `invocationId`, `runId`, `trialIndex`, `conditionArm`, infrastructure exit codes and a per-trial-set isolation manifest (AD-7).
- Mutation only in a disposable copy with proved rollback (AD-8); corpus layout, `corpus-index.json` digest and authored-versus-runtime fields (AD-9).
- CI tiers `pr`, `merge`, `scheduled`, `release` and the AD-10 enforcement table; one pipeline owner, `bmad-testarch-ci` (AD-11); evidence bundle and baseline (AD-12).
- TeA's generators coexist with Evaluate-authored evaluations (AD-14).
- Proof target: Evaluate authors the suite for `bmad-testarch-evaluate` itself, plus `api` and `mcp` loopback fixtures (AD-15); operational envelope (AD-20).
- Proof of guidance: Evaluate authors strong suites for two more target kinds from their descriptions alone, closes seeded weaknesses through the gap loop, and succeeds with an evaluation framework absent from its guides (AD-3, AD-15).
- Evaluation layer: evaluator kinds and one framework-neutral import contract (AD-21); held-out probes and judge calibration (AD-22); interpretation evidence and the stated boundary with eval-quality's engine (AD-23).
- Cross-repository: eval-quality exports its HTTP target-policy evaluation before the `api` story (AD-4).

### UX Design Requirements

None. Evaluate has no graphical interface.

### FR Coverage Map

| Requirement | Stories |
| --- | --- |
| FR1 (CAP-1) | 1.3, 1.12, 1.13, 1.24 |
| FR2 (CAP-2) | 1.12, 1.24 |
| FR3 (CAP-3) | 1.4, 1.12, 1.16, 1.21, 1.24 |
| FR4 (CAP-4) | 1.4, 1.13, 1.16, 1.24 |
| FR5 (CAP-5) | 1.9, 1.13, 1.21, 1.24 |
| FR6 (CAP-6) | 1.1, 1.5, 1.6, 1.10, 1.11, 1.13, 1.18, 1.19 |
| FR7 (CAP-7) | 1.7, 1.9, 1.14, 1.16 |
| FR8 (CAP-8) | 1.8, 1.14 |
| FR9 (CAP-9) | 1.6, 1.8, 1.14, 1.16, 1.17 |
| FR10 (CAP-10) | 1.14, 1.16, 1.22, 1.25 |
| FR11 (CAP-11) | 2.2, 2.3, 2.4, 2.5, H.1 |
| FR12 (CAP-12) | 1.8, 2.1, 2.5, H.1 |
| FR13 (CAP-13) | 1.17, 1.19, 1.20, 1.23, 1.26 |
| FR14 (CAP-14) | 1.21, 2.2 |

## Epic List

### Epic 1: The Evaluate authoring loop

An adopter describes a target, answers Evaluate's questions, chooses or builds the evaluation layer and gets a compiling, sealed, preflighted, scored Behavioral Evaluation Contract whose clean arm passes and whose mutated arm catches the seeded defect, with the gaps named and closed. The epic closes by running Evaluate on `bmad-testarch-evaluate` itself, then proving the guidance on two more target kinds, on seeded weaknesses and on an evaluation framework its guides never name.

**FRs covered:** FR1 to FR10, FR13, FR14.

### Epic 2: Continuous proof in CI

The evaluation Epic 1 produces runs in the adopter's CI on every pull request, with tiers, enforcement classes and a published evidence bundle. The epic closes by running the `pr` tier for TeA's own Evaluate-authored suite and every fixture evaluation.

**FRs covered:** FR11, FR12, and the tier placement of FR14.

## Epic Dependencies

Story 1.1 runs first, in the eval-quality repository. Story 1.2 raises TeA's `eval-quality` devDependency to the published release carrying it, and every later TeA story runs on that release. Epic 1's stories run in the order this table lists them, which is the order they are written in. Epic 2 depends on Epic 1's runtime and on the evaluation Story 1.16 authors. Story H.1 is the owner's and runs after Story 2.5 merges; eval-quality 4.0.0, the release it once waited for, shipped during Story 1.2.

| Order | Story | Depends on |
| --- | --- | --- |
| 1 | 1.1 | none |
| 2 | 1.2 | 1.1 |
| 3 | 1.3 | 1.2 |
| 4 | 1.4 | 1.3 |
| 5 | 1.5 | 1.4 |
| 6 | 1.6 | 1.5 |
| 7 | 1.7 | 1.6 |
| 8 | 1.8 | 1.7 |
| 9 | 1.9 | 1.8 |
| 10 | 1.17 | 1.9 |
| 11 | 1.10 | 1.8 |
| 12 | 1.11 | 1.1, 1.8 |
| 13 | 1.18 | 1.8 |
| 14 | 1.19 | 1.17 |
| 15 | 1.20 | 1.17 |
| 16 | 1.21 | 1.17 |
| 17 | 1.22 | 1.17 |
| 18 | 1.12 | 1.4, 1.21 |
| 19 | 1.13 | 1.10, 1.11, 1.12, 1.18, 1.19 |
| 20 | 1.23 | 1.13, 1.19, 1.20, 1.21 |
| 21 | 1.14 | 1.9, 1.13, 1.22, 1.23 |
| 22 | 1.15 | 1.14 |
| 23 | 1.16 | 1.15 |
| 24 | 1.24 | 1.16 |
| 25 | 1.25 | 1.24 |
| 26 | 1.26 | 1.23, 1.25 |
| 27 | 2.1 | 1.16, 1.26 |
| 28 | 2.2 | 2.1 |
| 29 | 2.3 | 2.2 |
| 30 | 2.4 | 2.3 |
| 31 | 2.5 | 2.4 |
| 32 | H.1 | 2.5 |

## Epic 1: The Evaluate authoring loop

An adopter gets a running, scored evaluation of their own target without hand-building the runner, the adapter, the corpus or the evaluation layer.

**FRs covered:** FR1 to FR10, FR13, FR14.

### Story 1.1: Export eval-quality's HTTP target-policy evaluation and pack the engine locally

**Repository:** `eval-quality` at `467e3a3` or later. Set `EVAL_QUALITY_ROOT`, `EVAL_QUALITY_WORKTREE`, and `PACK_DIR` for the assigned checkouts. Create `EVAL_QUALITY_WORKTREE` on branch `feat/export-target-policy` from `origin/main`. Touch no other eval-quality worktree.

As an adopter writing an HTTP `EnvironmentProbePort`,
I want eval-quality to export the allow-or-deny decision it already defines for HTTP targets,
So that my port delegates every address decision to the engine and carries no copy of address classification (AD-4).

**Acceptance Criteria:**

**Given** `src/core/probe/target-policy.ts` defines `evaluateTarget`, `classifyAddress`, `parseAddress`, `isSafeMethod`, `ADDRESS_CLASSES` and `DENIAL_REASONS` and no published entry point exports them
**When** `src/application/index.ts` re-exports them with the `ResolvedTarget`, `PolicyDecision`, `AddressClass` and `DenialReason` types, and the root barrel takes `ProbeTargetAuthorization` and `ProbeTargetPolicy` from `core/schemas/probe-policy.ts` as type-only exports (`export type`, since both are Zod schemas and `package-exports.test.ts` fails a live schema reachable from the barrel; the root layer may import only `application` and `core-schemas`)
**Then** after `npm run build`, `node --input-type=module -e "const m = await import('./dist/index.js'); for (const k of ['evaluateTarget','classifyAddress','parseAddress','isSafeMethod']) if (typeof m[k] !== 'function') process.exit(1)"` exits 0
**And** a new vitest case imports them from the package root and asserts that a loopback `ProbeTargetAuthorization` allows `127.0.0.1`, denies `10.0.0.1` on the same interface, scheme, host and port with `address-not-authorized`, and denies an interface no authorization names with `interface-not-authorized`
**And** `qualifyProbe`, and the outcome-state and discipline-rule vocabularies as `OUTCOME_STATES` and `DISCIPLINE_RULES`, are exported the same way, since Stories 1.9 and 1.14 read them
**And** `tests/architecture/package-exports.test.ts` lists every new export, and `npm run check:layers` passes

**Given** `docs/reference/cli-commands.md` lists the programmatic API
**When** the export lands
**Then** the page names the new exports and says an HTTP port delegates to `evaluateTarget`
**And** `npm run check:docs`, `npm run check:doc-invocations`, `npm run check:doc-counts`, `npm run check:doc-claims` and `npm run docs:validate-links` pass

**Given** `CHANGELOG.md` has no `[3.4.0]` section although v3.4.0 shipped #142 (the `asOf` content pin for dated claims)
**When** the history is repaired
**Then** a `## [3.4.0] - <tag date>` section records #142, taken from the v3.4.0 tag's commit, and the new export is recorded under `## [Unreleased]` beside #143's existing entry

**Given** the branch is complete
**When** `npm run validate` runs
**Then** it exits 0
**And** `mkdir -p "$PACK_DIR"` then `npm pack --pack-destination "$PACK_DIR"` runs, and the produced tarball is renamed to `eval-quality-local.tgz` in that folder
**And** the changes are staged in the eval-quality worktree, uncommitted

**Dependencies:** none.
**Gate:** `npm run validate` and `npm run docs:validate-links` in the eval-quality worktree.

### Story 1.2: Run TeA's gate on the engine Evaluate needs

As a TEA maintainer,
I want TeA's existing gate green on the published engine release,
So that every later failure is attributable to Evaluate.

**Acceptance Criteria:**

**Given** eval-quality 4.0.0 is published, carrying Story 1.1's target-policy export and trial-set scoring (eval-quality #143)
**When** TeA's `eval-quality` devDependency is raised to it and `npm install` runs
**Then** the engine check exits 0
**And** `git diff -- package.json package-lock.json` shows the `eval-quality` version bump and no `file:` or `.tgz` spec

**Given** eval-quality 4.0.0 carries `EvidenceArtifact` schema version 4 and repeatable `--record` (eval-quality #143)
**When** `npm test` runs
**Then** it exits 0, with every TeA harness, replay and schema-version test that the engine change broke repaired to read version 4
**And** before repairing, the story runs `npm test` on eval-quality 4.0.0 with no repair and records every failing script in its completion notes; those scripts are the repair's revert checks, and reverting the repair re-fails each of them
**And** a new `test/test-trial-set-scoring.js`, chained into `npm test` as `test:trial-set-scoring` with its own `quality.yaml` step and built with the `test/lib/eval-quality-inputs.js` builders (`test/test-eval-quality-corpus.js` feeds the package nothing of TeA's by design), seals a contract, scores a three-trial set through `eval-quality score` with a repeated `--record`, and asserts `reducedProbeOutcomes` is present and the strength vector is comparable; with `node_modules/eval-quality` downgraded to published 3.4.0 (`npm install eval-quality@3.4.0 --no-save`, since `npm ci` now restores the committed 4.0.0 devDependency) that case fails, which proves TeA's gate now depends on trial-set scoring (`test/test-schema-versions.js` reads every version from the installed package, so it cannot prove this)

**Dependencies:** 1.1.
**Gate:** `npm test`, engine check.

### Story 1.3: Register Evaluate as a TEA skill

As a TEA user,
I want Evaluate on Murat's menu as `EV`,
So that I can start an evaluation the way I start every other TEA workflow.

**Acceptance Criteria:**

**Given** no skill exists at `src/workflows/testarch/bmad-testarch-evaluate/`, and `/bmad-workflow-builder` Build's generic scaffolder targets `{bmad_builder_output_folder}` with a template that does not carry TEA's house activation contract
**When** the skill is authored by hand at the correct path, in the exact activation-contract shape `bmad-teach-me-testing` establishes, then validated with `/bmad-workflow-builder` Analyze (deterministic pre-pass plus the five lenses: leanness, architecture, determinism, customization, enhancement) and `/bmad-module-builder` Validate Module on the AD-17 staged layout
**Then** the skill has `SKILL.md`, `customize.toml`, `references/` and `assets/`, and no `workflow.yaml`, `steps-c/`, `steps-e/`, `steps-v/`, `instructions.md`, `checklist.md` or `scripts/` (AD-3), and Analyze and Validate Module both report zero new critical or high findings against the same staged run on main
**And** the skill keeps TEA's activation contract: `SKILL.md` holds the `resolve_customization.py` call, `{workflow.persistent_facts}` and `_bmad/tea/config.yaml`; `customize.toml` holds `persistent_facts = []` and `on_complete`
**And** a new `test/test-evaluate-guidance.js`, chained into `npm test` as `test:evaluate-guidance` with its own `quality.yaml` step, parses the stage list in `SKILL.md` and asserts twelve stages, each naming an existing `references/<stage>.md` (placeholder files until later stories fill them); Stories 1.12 to 1.14, 1.23 and 2.4 extend it
**And** `SKILL.md` lists the stages the later stories fill (inspection, intake, corpus, contract, oracles, adapters, evaluator, mutation, harness, run, gaps, ci), each pointing at its `references/` file

**Given** the registration set in AD-2
**When** it lands in this story
**Then** `src/module-help.csv` has an `Evaluate` row with menu code `EV`, phase `4-implementation`, followed-by `bmad-testarch-ci` and output-location `tea_evaluations_folder` (AD-2, amended: Evaluate writes evaluation folders there, not under `test_artifacts`)
**And** `src/agents/bmad-tea/customize.toml` has a `[[agent.menu]]` entry with `code = "EV"` and `skill = "bmad-testarch-evaluate"`
**And** `.claude-plugin/marketplace.json` lists the skill path, `src/module.yaml` declares `tea_evaluations_folder` with default `evals` resolved as `{project-root}/{value}`, and `test/test-installation-components.js` lists the workflow and has EV in `expectedMenu`
**And** `test/fixtures/tea-routing-eval/intents.json` carries an EV intent with its ground truth, the routing contracts and probes are regenerated with `node tools/generate-contracts.js` and `node tools/generate-probes.js`, and the intents contract stays within its `probeStepBound`
**And** since `test/test-routing-evidence.js` holds Story 1.3's committed live routing evidence to the live corpus case ids and fixture digest, which the new intent changes, that evidence is re-anchored: each recorded case's intent and ground-truth entry is snapshotted under `test/results/live-eval-remediation/story-1-3/cases/`, extracted while the fixtures' whole-file digest still equals the contract's `fixtureDigest`, with a new per-case sha256 recorded beside each snapshot (the contract records only whole-file digests), and the test holds every recorded case in the live corpus byte-identical to its snapshot while admitting added cases; editing one recorded intent fails it
**And** a live `npm run eval:routing` through the local Claude Code CLI routes the EV intent to `EV` in both repetitions, recorded in the story's completion notes
**And** `test/evals/suite-manifest.json` carries a `deferred` entry for `bmad-testarch-evaluate`
**And** `test/test-installation-components.js` gains assertions for the `tea_evaluations_folder` variable with default `evals` and for the marketplace skill path
**And** reverting any one of these makes `npm test` fail, through `test:evaluate-guidance`, `test:install`, `test:suite-manifest`, `test:contract-sources`, `test:probe-sources` or `test:eval-schemas`

**Given** `test/test-installation-components.js` asserts the house shape and `tools/validate-tea-workflow-descriptions.js` hard-codes `bmad-teach-me-testing` as its one `SKILL.md`-only skill
**When** the lean shape is admitted
**Then** the install test gains a lean-shape assertion set that fails when a lean skill gains `workflow.yaml` or loses `customize.toml`
**And** a skill is lean when it has neither `workflow.yaml` nor `steps-c/`; the house-shape and lean-shape assertion sets are disjoint, `bmad-teach-me-testing` (no `workflow.yaml`, has `steps-c/`) stays on the house set, and a temp skill with `steps-c/` and no `workflow.yaml` is classified house by a negative case
**And** the description validator reads `SKILL.md` frontmatter for every skill with no `workflow.yaml`, with a negative case for a temp lean skill missing its description

**Given** the builder writes `.memlog.md` and `.analysis/` inside the skill
**When** `npm pack --dry-run` runs
**Then** neither appears, and both are gitignored
**And** documentation counts that name the number of TEA workflows are updated through their count sources so `test:doc-counts` and `test:doc-claims` pass

**Dependencies:** 1.2.
**Gate:** skill gates with Validate Module (registration changed), `npm test`, `npm run test:release-metadata`.

### Story 1.4: Ship `tea-evaluate` with `check` and `digest`

As an adopter,
I want one command that validates my evaluation folder and digests its corpus,
So that a stale index or a malformed artifact fails before anything runs.

**Acceptance Criteria:**

**Given** no runtime exists
**When** `cli/evaluate.js` and `cli/lib/evaluate/` land
**Then** `package.json` registers the `tea-evaluate` bin, declares `peerDependencies: {"eval-quality": ">=4.0.0"}`, the first published release carrying trial-set scoring and the target-policy export Evaluate needs, with `peerDependenciesMeta` marking it optional (npm 7 and later install required peers automatically, which would pull the engine into every project that installs TeA for other workflows), and `test:release-metadata` and `test:guard-publish` cover both
**And** `cli/lib/evaluate` is CommonJS and reaches eval-quality through one async loader generalized from `loadEvalQuality`, and the `dependency-direction` section of `eval-quality.config.json` gives the `cli` layer an `allow` externals list naming every external `cli/` uses (`eval-quality`, `commander`, `js-yaml`, `ajv` and each `node:` builtin), so removing one listed module while `cli/` imports it fails `test:direction` (AD-5)
**And** every module the shipped runtime needs is reachable from TeA's published `dependencies`: `ajv` moves from `devDependencies` to `dependencies`, and a packed-install case in `test:evaluate-check` runs `npm pack`, installs the tarball into a temp folder with `--omit=dev` beside the local engine, and runs `tea-evaluate check --evaluation <fixture>` to exit 0; moving `ajv` back to `devDependencies` fails it
**And** every subcommand takes `--evaluation <path>` and exits 64 when none resolves; the runtime reads no `_bmad/` config

**Given** the runtime owns the JSON schema of `evaluation.json` (`targetKind` from AD-4's six kinds, interface kind, registry, launch, workspace (`git` or `copy`, AD-8), arms, trials, tiers, strength floor per probe class, `schemaVersion`; Stories 1.12, 1.17, 1.21 and 1.22 add the `requirements`, `evaluator`, `heldOutProbes`, `judgeCalibration` and `operationPhases` fields, each as an additive schema change with its own `check` cases)
**When** `tea-evaluate check --evaluation <path>` runs on a folder shaped as the Structural Seed
**Then** it exits 0 on a valid fixture folder under `test/fixtures/evaluate/`
**And** it exits 10 on each of these eleven: a stale `corpus-index.json`, an unknown `evaluation.json` `schemaVersion` (naming the TeA version that knows it), a committed probe carrying a runtime-owned field, a mutation file whose operator is not `replace-exact`, a `targetArtifact` inside a provisioned directory, a contract declaring kind `web`, a defect signature addressing a written file, a behavior discharged by a defect or gameability probe whose `oracles` count is not exactly 1, a probe, behavior, oracle or mutation ID off eval-quality's patterns, a `baseline/qualification/` reference whose digest does not match, and a clean control that is not `zero-action` with `expectedClean: true` (AD-9, AD-19). AD-14's one-authoring-path rule is TeA repository policy and is enforced by Story 1.15 in `tools/validate-eval-schemas.js`
**And** `tea-evaluate digest` writes `corpus-index.json` as sorted `{path, sha256}` over `corpus/`, `probes/` and `mutations/`, and prints `corpusDigest` computed by eval-quality's `digestArtifact` over that index
**And** a new `test/test-evaluate-check.js`, chained into `npm test` as `test:evaluate-check` with its own `quality.yaml` step, holds each case above
**And** a new `test/test-evaluate-boundaries.js`, chained as `test:evaluate-boundaries` with its own `quality.yaml` step, scans `cli/` and fails when: any file other than `cli/lib/evaluate/engine.js` names `eval-quality` in an `import(` or `require(` call, subpaths and synchronous requires included; any binding obtained from that module reaches the engine's `runScore`, `preflightFromObservations`, `compile` or `seal` (AD-1, AD-6: those stages run through the CLI); the string `_bmad` appears under `cli/lib/evaluate/`. `engine.js` resolves the CLI path and honours `TEA_EVALUATE_ENGINE_CLI` so tests can substitute a shim. Later stories extend the test

**Dependencies:** 1.3.
**Gate:** `npm test`, `npm run test:release-metadata`.

### Story 1.5: Move the registry, records and provenance into the runtime

As a TEA maintainer,
I want one implementation of the registry, run-record builders and provenance,
So that TeA's harness and every adopter run the same code (AD-5).

**Acceptance Criteria:**

**Given** `test/lib/probe-targets.js`, `test/lib/eval-quality-inputs.js` and `test/lib/eval-record.js` hold the logic AD-5 names
**When** it moves to `cli/lib/evaluate/registry.js`, `records.js` and `digest.js`
**Then** the registry reads one `RegistryEntry` schema from `evaluation.json`, and TeA's `EXECUTION_TARGETS` becomes data in that schema
**And** the `test/lib/` files keep only TeA data and import the runtime modules
**And** no file under `cli/` imports from `test/`, which `eval-quality-gates package-boundary` (`test:boundary`) and `test:direction` enforce
**And** `test:probe-targets`, `test:probe-conformance`, `test:eval-replay`, `test:compare-eval-runs` and the rest of `npm test` pass unchanged in their assertions
**And** `test:evaluate-boundaries` asserts each of the three `test/lib/` files requires its `cli/lib/evaluate/` module and that the moved definitions (`function sealedRunRecord`, `function repositoryState`, the command-target-policy builder) exist only in their `cli/lib/evaluate/` modules, checked in the named files, so moving the code back fails it; `test/lib/eval-quality-schema-versions.js` moves into `engine.js` and the purity layer in `eval-quality.config.json` is re-pointed

**Given** each registry entry declares `infrastructureExitCodes`
**When** `check` reads a defect signature that one of those codes could satisfy
**Then** it exits 10, held by a new case in `test/test-evaluate-check.js`

**Dependencies:** 1.4.
**Gate:** `npm test`.

### Story 1.6: Probe a skill through the generic runner and `tea-evaluate preflight`

As an adopter evaluating a skill or agent,
I want a vendor-neutral runner and a preflight that drives it,
So that a real observation reaches `eval-quality preflight` with no authorization denial (CAP-6).

**Acceptance Criteria:**

**Given** `cli/*-runner.js` and `cli/lib/run-agent.js` each wrap one skill
**When** `cli/skill-runner.js` generalizes them
**Then** it takes an explicit `--skill-root`, reads the prompt on stdin, keeps vendor knowledge only in `cli/lib/agent-adapters.js`, never probes install locations, and exits 3 to 6 for infrastructure failures and 2 for a usage error, as `cli/lib/runner-exit-codes.js` defines; its registry entry declares `infrastructureExitCodes` 3 to 6, so a usage error reaches CI as a wiring defect
**And** `check` asserts every mutation's `targetArtifact` sits under that skill root, held by a new case in `test/test-evaluate-check.js`

**Given** an evaluation folder with a `cli` interface
**When** `tea-evaluate preflight --evaluation <path>` runs
**Then** it runs `eval-quality compile` and `seal`, drives legs through `runPreflight` with a recording port over `createCommandLineAdapter` authorized from the registry, persists every observation under `runs/<invocationId>/`, and takes the verdict from `eval-quality preflight --observations --run-id` (AD-6)
**And** it passes eval-quality's exit code through verbatim
**And** with `TEA_EVALUATE_ENGINE_CLI` pointed at a shim that logs its argv, exits 0 for `compile` and `seal`, and exits 5 for `preflight --observations ... --run-id`, `tea-evaluate preflight` exits 5 and the log shows that preflight argv, which proves the verdict comes from the CLI (the library verdict from `runPreflight` would be byte-identical, so a byte comparison alone cannot prove the source)
**And** a deterministic test, `test/test-evaluate-preflight.js`, chained into `npm test` as `test:evaluate-preflight` with its own `quality.yaml` step, runs it against a stub agent command under `test/fixtures/evaluate/` and asserts a passed `PreflightVerdict` with no `interface-not-authorized` or `executable-not-authorized` denial
**And** removing the stub's registry entry makes that test observe a denial and fail

**Dependencies:** 1.5.
**Gate:** `npm test`, `npm run test:release-metadata`.

### Story 1.7: Mutate only in a disposable copy and prove the rollback

As an adopter,
I want every seeded defect planted and removed in a scratch copy with the rollback proved,
So that `rollbackVerified: true` is a measured fact and my working tree is never touched (CAP-7, AD-8).

**Acceptance Criteria:**

**Given** `test/test-automate-eval-fixture.js` holds the one live mutate, measure, restore cycle
**When** `cli/lib/evaluate/workspace.js` and `mutation.js` generalize it, with `cachingPort` and `stagedWorkspaceFor` from `test/eval-contract-strength.js`
**Then** a git target is copied with `git worktree add --detach` at the evaluated commit, provisioned with read-only links to the directories `evaluation.json` lists, a declared `copy` workspace or a non-git target uses a temp copy identified by its tree digest and records `dirty: false` in `run.json`, and `--from-working-tree` uses a temp copy and records `dirty: true`; a `test:evaluate-mutation` case asserts `dirty: false` for a `copy` fixture and `dirty: true` under `--from-working-tree`, and hard-coding either value fails it
**And** the story builds the single-trial arm executor and the deterministic `resolveCheck` evaluator that AD-8 steps 1, 3 and 6 need; Story 1.8 adds trial sets, sealing and scoring
**And** each mutation runs the six AD-8 steps in order, sets `rollbackVerified` only after the restored digest matches and the baseline leg re-passes within `reExecutionCap`, and writes digested evidence files
**And** `git status --porcelain` of the adopter tree is identical before and after, and scratch is removed in `finally`

**Given** the failure cases
**When** each is exercised in `test/test-evaluate-mutation.js`, chained into `npm test` as `test:evaluate-mutation` with its own `quality.yaml` step
**Then** an occurrence count other than 1 exits 10, a baseline that does not pass or a mutated arm that does not fail exits 11, and a workspace, launch or restore failure exits 12, each emitting no probe
**And** preflight routes a leg named by a defect's `manifestationWitness.legId` to the mutated copy and every other leg to the pristine copy, with `cwd` per leg (AD-6)
**And** each mutation's evidence carries `preDigest`, `mutatedDigest` and `restoredDigest` of the `targetArtifact`, the test asserts `mutatedDigest` differs from `preDigest` and `restoredDigest` equals it, and replacing the restore with a no-op makes that assertion fail with no probe emitted; the stub target prints the sha256 of the `targetArtifact` in its own working directory, and the test asserts the baseline re-pass leg's stdout equals `preDigest` and the mutated leg's equals `mutatedDigest`, evidence the runtime does not compute itself
**And** `test:evaluate-boundaries` fails on any `rollbackVerified: true` literal under `cli/`
**And** `test/eval-contract-strength.js` and `test/test-automate-eval-fixture.js` import the runtime modules and keep only TeA data, which `test:evaluate-boundaries` holds, and `npm run eval:preflight` still runs

**Dependencies:** 1.6.
**Gate:** `npm test`.

### Story 1.8: Run the clean and mutated arms and score them

As an adopter,
I want `tea-evaluate run` and `score` to produce and score sealed trial sets,
So that the clean arm resolves `passed-clean-control` and the seeded probe resolves `caught` (CAP-8, CAP-9).

**Acceptance Criteria:**

**Given** an evaluation with a scoring policy whose thresholds the adopter set
**When** `tea-evaluate run --evaluation <path>` runs
**Then** it keys `runs/<invocationId>/`, derives one `runId` per trial set, numbers `trialIndex` 1..N with N at least `minimumTrialCount`, sets `mode: contract-scoring` and labels `conditionArm` `clean` or `mutated:<mutationId>` (AD-7)
**And** trial requests come only from the contract's `interactionPlan` bound from the probe's `testData`, and findings and oracle dispositions come from a deterministic evaluator over `resolveCheck`
**And** it writes one `IsolationManifest` per trial set from what it actually granted, one `EvaluatorConfiguration` per run carrying the seal's `sealedBriefDigest` (for a run that uses no model, `modelSnapshot` is the literal `none` and `systemPromptDigest` is `digestBytes` over the empty byte string, since the published schema requires both non-empty; a `test:evaluate-run` case validates that configuration against the schema and fails when either is left empty), and `run.json` with TeA and eval-quality versions, contract and corpus digests, runner and model identity, trial count, duration, commit and `dirty`
**And** a trial observation carrying a registry `infrastructureExitCodes` value yields no record and the invocation exits 12

**Given** the sealed records
**When** `tea-evaluate score` runs
**Then** it calls `eval-quality score` once per probe with every trial's `--record`, `--isolation-manifest` and `--evaluator-configuration`, and passes the exit code through
**And** with `TEA_EVALUATE_ENGINE_CLI` pointed at a logging shim, the argv log shows one `score` call per probe carrying every trial's `--record`; with the real engine, `eval-quality score` run directly on the persisted inputs gives the same exit code and byte-identical evidence, on a passing fixture and on a FAIL fixture
**And** every artifact is validated against eval-quality's published schemas before it reaches the CLI
**And** each `score` call's exit code, stdout and stderr are persisted under `runs/<invocationId>/`, keyed by probe ID whether or not an evidence artifact was emitted, since AD-10 classifies a `score` exit 3 from those diagnostics and AD-12 lists them in the bundle; with `TEA_EVALUATE_ENGINE_CLI` pointed at a shim that prints distinct known bytes to each stream and exits with a distinct code, the test asserts byte equality per stream and the recorded code, so an empty, swapped or dropped capture fails it
**And** probe digests follow AD-7: `commitDigest` is the evaluated commit, `artifactDigest` the `targetArtifact` bytes, `implementationDigest` the tracked tree of the target root, each asserted by the test below
**And** `runs/` is gitignored by the evaluation-folder `.gitignore` template and by TeA's root `.gitignore` for `test/evaluations/*/runs/` and `test/fixtures/evaluate*/runs/`
**And** `test/test-evaluate-run.js`, chained into `npm test` as `test:evaluate-run` with its own `quality.yaml` step, runs a stub target end to end and asserts `passed-clean-control` on the clean arm and `caught` on the mutated arm at `minimumTrialCount`, with a comparable strength vector
**And** omitting the isolation manifest makes the test observe an Invalid result and fail, and in that case the probe's persisted `score` stderr is non-empty and no evidence artifact exists

**Given** the policy templates in the skill's `assets/`
**When** `npm test` validates them against the runtime and eval-quality schemas
**Then** the `ScoringPolicy` template carries no values for `severityFloor`, `minimumTrialCount` and `catchThreshold`, and a filled copy validates

**Dependencies:** 1.7.
**Gate:** `npm test`.

### Story 1.9: Qualify gameability and historical probes, and judge rubrics

As an adopter,
I want gameability and historical probes to carry the evidence eval-quality qualifies,
So that shortcut answers and remote targets are measured (CAP-5, CAP-7).

**Acceptance Criteria:**

**Given** a gameability probe
**When** `run` evaluates its arm `gameability:<probeId>`
**Then** no target launches; the degenerate response is resolved as a synthetic observation with `resolveCheck`, producing `naiveOracleSatisfiedEvidence` and `disciplinedOracleRejectedEvidence`

**Given** a target with two addressable revisions and no launchable mutation
**When** `run` evaluates the arm `historical:<revision>`
**Then** it captures fail-before and pass-after evidence and the preflight seeded-fault leg routes to the pre-fix revision; with fewer than two revisions the probe is recorded as refused with its reason

**Given** a contract that declares a rubric
**When** `run` judges it
**Then** the judge runs through `cli/lib/agent-adapters.js` and `judgeConfiguration` records it as a fixed condition; with no rubric, no model judge runs
**And** `test/test-evaluate-arms.js`, chained into `npm test` as `test:evaluate-arms` with its own `quality.yaml` step, asserts all three, and each qualifies through `qualifyProbe` (exported by Story 1.1) with no failure code

**Dependencies:** 1.8.
**Gate:** `npm test`.

### Story 1.17: Drive any evaluation layer through one import contract

As an adopter whose evaluation is an agent reading a sealed brief, my own harness, a skill-specific evaluator, custom code or an external framework,
I want `tea-evaluate run` and `score` to take any of them behind one framework-neutral contract,
So that every evaluation layer reaches `eval-quality score` as sealed run records, and adding a framework changes neither TeA's runtime nor the engine (CAP-9, CAP-13, AD-21).

**Acceptance Criteria:**

**Given** `evaluation.json`'s new `evaluator` field, whose `kind` is `deterministic` (Story 1.8's `resolveCheck` evaluator, the default), `sealed-brief-agent`, `command` or `records`
**When** `tea-evaluate check` reads it
**Then** it exits 10 for an unknown kind, a `command` evaluator with no `evaluator/mapping.json`, a mapping key bound to an oracle, behavior or rubric criterion the contract does not declare, a rubric binding whose `levels` differ from that criterion's anchored scale levels, and a `records` evaluator whose record directory is absent, each a case in `test:evaluate-check`

**Given** the runtime-owned `judgment-rows` schema, the import contract of AD-21: per trial, rows of `key`, `outcome` (`pass`, `fail` or `score`), `score` for a scored row, `observationIds` (at least one), `quote` (verbatim text from a cited observation), `quoteChannel` (one of eval-quality's quotation channels: `response-body`, `response-headers`, `response-status`, `call-inputs`, `stdout`, `stderr`, `exit-code` or `artifact`), `artifactId` (required when `quoteChannel` is `artifact`, absent otherwise), `confidence` and `comment` (required on a `fail` row), plus an optional `recommendation`
**When** a `command` evaluator runs
**Then** `evaluation.json` declares `evaluator.timeoutMs` for it (`check` exits 10 when a `command` evaluator has none), and the runtime starts the adopter's evaluator executable named in `evaluation.json` once per trial after collecting the trial's baseline observations, writes `{ sealedBrief, observations }` to its stdin with each observation carrying its runtime-assigned `observationId`, and reads judgment rows from its stdout
**And** it converts rows into `SealedRunRecord` fields through `evaluator/mapping.json` alone: a `fail` row bound to an oracle becomes a finding that validates against eval-quality's `Finding` schema: `findingType: defect`, a `findingId` the runtime mints (`F-NNN`, unique per record), the mapped `oracleId`, the probe under trial, the mapped behavior and its declared severity, the row's `comment` as `summary`, the row's `confidence`, the cited `observationIds`, `evidenceArtifacts: []`, and one `quotedEvidence` entry `{ quote, channel, artifactId }` built from `quote`, `quoteChannel` and `artifactId` (`null` off the `artifact` channel); and a `violated` disposition; a `pass` row becomes a `held` disposition; a `score` row bound to a rubric criterion becomes a `judgeResults` entry; an oracle with no row becomes `not-attempted`; the recommendation is the rows' own or, when absent, FAIL on any `fail` row and PASS otherwise
**And** the runtime re-checks nothing the engine checks: quotes, citations and signature matches reach `score` exactly as the evaluator stated them, and a stub evaluator whose `quote` is absent from the cited observation yields the Invalid result eval-quality's own unwitnessed-quotation condition produces, which proves the runtime holds no copy of that ingest rule (AD-1)
**And** an evaluator that crashes, exits non-zero or prints output failing the `judgment-rows` schema yields no record, the invocation exits 12 as an evaluation-layer invocation failure (AD-10), and the evaluator's stdout and stderr are persisted under `runs/<invocationId>/evaluator/`; a `fail` row with no `quoteChannel`, and one with `quoteChannel: artifact` and no `artifactId`, are each a case that fails the row schema and exits 12
**And** row cardinality is fixed: each row's `key` must be a key `mapping.json` declares and appears at most once per trial, so an unmapped key or two rows for one key fails the `judgment-rows` schema and exits 12; zero rows for a trial with at least one mapped oracle exits 12 as an evaluation-layer failure; each is a `test:evaluate-evaluators` case
**And** an evaluator still running at `evaluator.timeoutMs` has its process group killed, its stdout and stderr up to that point persisted under `runs/<invocationId>/evaluator/`, no record written, and the invocation exits 12; a stub evaluator that hangs is the `test:evaluate-evaluators` case
**And** every record the conversion produces validates against eval-quality's published `sealed-run-record` schema before `score`, which the test asserts per row shape
**And** stub evaluators under `test/fixtures/evaluate/evaluators/` cover each row shape end to end: the clean arm resolves `passed-clean-control` and the mutated arm `caught` through `score`

**Given** a `sealed-brief-agent` evaluator
**When** `run` evaluates an arm
**Then** the evaluator agent runs through `cli/lib/agent-adapters.js` and receives the sealed brief from `seal`, the judgment-rows instructions and nothing else from the evaluation: no contract, oracle `check`, interaction plan, `testData`, probe, mutation or evaluator reference file
**And** it acts on the target only through `cli/lib/evaluate/bridge.js`, a vendor-neutral stdio MCP server exposing one tool per interface the brief carries (the brief names interfaces as `{ logicalId, kind }` only and withholds the operation list), each with a kind-generic call shape: `cli` takes arguments and stdin, `api` takes method, path and body, `mcp` takes tool name and arguments
**And** the bridge routes each call through the registry adapter for the arm's copy, whose authorization denies any executable, subcommand, address, method or tool it does not grant; the runtime maps an authorized call to the contract `operationId` it matches for the observation it records with `provenance: evaluator-chosen`, and a call that matches no declared operation is recorded as unmatched and never reaches a finding; interaction-plan steps the runtime drives are recorded `baseline`
**And** a stub agent adapter that captures its whole prompt and tool configuration shows the sealed brief present and none of the contract's oracle `check` strings, `testData` literals, interaction-plan step IDs, operation IDs or path templates; adding the contract to the prompt fails the case
**And** an MCP client driving the bridge in the test records one observation per authorized call with the routed `cwd` and `provenance: evaluator-chosen`, and a call the registry authorization does not grant (an unlisted executable for `cli`, an unlisted address for `api`, an unlisted tool for `mcp`) is denied with eval-quality's denial reason and recorded, with no target launch
**And** `EvaluatorConfiguration`, whose published schema is strict, carries the evaluator identity in `evaluatorIdentity` and the model in `modelSnapshot`, and carries TeA's own conditions under caller-owned keys in `decodingParameters`, the one field the schema opens to caller keys: `tea.evaluatorKind`, and for a `command` evaluator `tea.evaluatorExecutableDigest` and `tea.evaluatorTreeDigest`; every generated configuration validates against the published schema
**And** editing one byte under a fixture's `evaluator/` changes the `EvaluatorConfiguration` digest and so the records' `evaluatorConfigurationDigest` and the evidence's scoring version, which the test asserts

**Given** a `records` evaluator (an adopter harness that runs the system and seals its own records)
**When** `tea-evaluate score` runs
**Then** it validates each supplied `SealedRunRecord` and isolation manifest against eval-quality's published schemas and passes them to `eval-quality score` unchanged, exit code passed through; a record failing the schema exits 10 before any engine call

**Given** the rule that the runtime is framework-neutral
**When** `test:evaluate-boundaries` scans `cli/`
**Then** the binding rule is the `cli` layer's dependency-direction `allow` list from Story 1.4, which names no framework, so an import of any framework from `cli/` fails `test:direction`; a case adds a temporary import of an unlisted package under `cli/` and observes the failure
**And** as a secondary check it fails on a framework or library name from a list held in the test (at least `agentevals`, `openevals`, `promptfoo`, `deepeval`, `inspect_ai` and `langsmith`), which catches a name in a string or a dynamic path
**And** `test/test-evaluate-evaluators.js`, chained into `npm test` as `test:evaluate-evaluators` with its own `quality.yaml` step, holds every case above

**Dependencies:** 1.9.
**Gate:** `npm test`.

### Story 1.10: Evaluate a stdio MCP tool server

As an adopter with an MCP tool server,
I want Evaluate to register it with `createMcpAdapter`,
So that the server's own behavior is measured over `mcp` (CAP-6).

**Acceptance Criteria:**

**Given** a loopback stdio MCP server fixture at `test/fixtures/evaluate-mcp/`, whose `evaluation.json` declares a `copy` workspace (AD-8)
**When** its evaluation folder runs `check`, `preflight`, `run` and `score`
**Then** the registry builds an `McpTargetAuthorization` and preflight passes with no `interface-not-authorized` or `tool-not-authorized` denial
**And** the clean arm resolves `passed-clean-control` and the mutated arm `caught`, asserted by `test/test-evaluate-mcp.js`, chained into `npm test` with its own `quality.yaml` step
**And** removing the tool from the authorization makes the test observe `tool-not-authorized` and fail

**Dependencies:** 1.8.
**Gate:** `npm test`.

### Story 1.11: Scaffold the HTTP probe port for `api` targets

As an adopter with an AI feature or web application,
I want a scaffolded HTTP port that delegates every address decision to eval-quality,
So that my HTTP surface is evaluated as `api` with no copied network policy (CAP-6, AD-4).

**Engine consumption.** This story needs the export from Story 1.1, published as eval-quality 4.0.0 by the time this story runs. It runs on the devDependency Story 1.2 already raised to that release, with the engine check at start and end; no re-pack or `--no-save` install remains.

**Acceptance Criteria:**

**Given** the skill's `assets/`
**When** `/bmad-workflow-builder` Edit adds `http-probe-port.mjs` and `http-probe-port.conformance.mjs` templates
**Then** the port is a default-export factory that holds only address, auth and transport configuration and calls eval-quality's `evaluateTarget` for every allow or deny decision, once per request and once per redirect hop; the evaluator is an injected option defaulting to the imported `evaluateTarget`, so the test injects a counting wrapper, and the grep test holds that the default is the import
**And** the conformance template calls `runEnvironmentProbePortConformance` against a loopback stub server it starts and closes itself (the suite's redirect, slow-response and oversize-response scenarios need endpoints no deployed target offers), so conformance runs in the `pr` tier with no deployed target and no secret
**And** a grep test in `test/test-evaluate-api.js` fails when the template contains its own address classification (any private-range literal or CIDR arithmetic)

**Given** a loopback HTTP fixture target at `test/fixtures/evaluate-api/` with an adapter rendered from the template, whose `evaluation.json` declares a `copy` workspace (AD-8)
**When** its evaluation runs conformance, `check`, `preflight`, `run` and `score`
**Then** conformance passes, preflight passes, the clean arm resolves `passed-clean-control` and the mutated arm `caught`
**And** the contract declares kind `api`, and an unlisted address is denied with eval-quality's denial reason
**And** the test is chained into `npm test` with its own `quality.yaml` step

**Dependencies:** 1.1, 1.8.
**Gate:** skill gates (no registration change, so no Validate Module), `npm test`, engine check.

### Story 1.18: Evaluate a workflow target through `after` and `captured` bindings

As an adopter with a multi-step workflow,
I want the runtime to run the interaction plan in dependency order and bind a later step to a value an earlier step produced,
So that a workflow is evaluated over its own interface kind, as AD-4's workflow row states (CAP-6).

**Acceptance Criteria:**

**Given** a loopback workflow fixture at `test/fixtures/evaluate-workflow/`: a `cli` target whose `create` operation mints a fresh identifier on every run and whose `read-back` operation takes it, a contract whose `read-back` step declares `after: "create"` and a `{ captured }` binding to that identifier, and a `copy` workspace (AD-8)
**When** its evaluation runs `check`, `preflight`, `run` and `score`
**Then** the runtime issues steps in `after` order, resolves each `captured` binding from the named earlier observation of the same trial, and records `sequence` values that increase in issue order
**And** the `read-back` observation's `callInputs` carries the identifier the `create` observation returned in that trial, which the test asserts; a runtime that binds from `testData` fails it, since the fixture mints a new identifier per run
**And** preflight passes, the clean arm resolves `passed-clean-control`, and the mutated arm, whose mutation makes `create` persist the record under a different identifier than the one it returns, resolves `caught`
**And** when the earlier observation lacks the captured value the dependent step is not issued, no observation exists for it, and the probe's outcome read from the evidence artifact is something other than `caught`, which the test asserts
**And** a contract whose capture and `after` edges form a cycle is refused by `eval-quality compile` with `binding-cycle`, exit 4, passed through verbatim
**And** `test/test-evaluate-workflow.js`, chained into `npm test` as `test:evaluate-workflow` with its own `quality.yaml` step, holds each case

**Dependencies:** 1.8.
**Gate:** `npm test`.

### Story 1.19: Evaluate a tool-use calling agent through its own command, judged by AgentEvals

As an adopter whose agent calls tools,
I want the agent's tool selection and arguments evaluated through its own non-interactive command, with an external trajectory evaluator as the evaluation layer,
So that tool selection, which eval-quality states it does not evaluate, is measured, and the import contract is proven on a first real framework (CAP-6, CAP-13, AD-4, AD-21).

**Acceptance Criteria:**

**Given** a fixture at `test/fixtures/evaluate-tool-use-agent/`: a deterministic stub calling agent with its own non-interactive command, registered as the adopter's own command (AD-4 agent row, no skill runner), which picks a tool and arguments from a rules file and prints its trajectory as OpenAI-style messages on stdout; a `copy` workspace; and a mutation of the rules file that makes the agent call the wrong tool for one request
**When** its evaluation runs with a `command` evaluator under the fixture's `evaluator/` folder
**Then** the evaluator reads the trajectory from the cited observation's stdout, runs AgentEvals' `createTrajectoryMatchEvaluator` in `strict` mode against the reference trajectory in `evaluator/reference/` (deterministic, no model call), and prints judgment rows only
**And** the clean arm resolves `passed-clean-control` and the mutated arm `caught`, with the contract's own oracle over stdout naming the first tool called, so the catch rests on the observation the finding cites (AD-19)
**And** replacing the evaluator with one that always prints `pass` makes the mutated arm resolve an outcome other than `caught`, which the test observes
**And** the preflight authorization names the agent's own command as its executable, which the test asserts
**And** a unit case maps a scored AgentEvals result (`{ key, score, comment }` with a numeric score) to a `judgeResults` entry when `mapping.json` binds the key to a rubric criterion whose anchored levels contain the score, and a score outside those levels exits 12 with no record
**And** `agentevals` and `@langchain/core` join TeA's devDependencies at the `latest` spec (AD-13); `test:licences`, `test:lockfile-age` and `test:supply-chain` pass; `test:evaluate-boundaries` still finds no framework name under `cli/`
**And** the completion notes record the installed AgentEvals version and re-verify every AgentEvals fact in `evaluation-framework-facts.md` against it, correcting the file where a fact drifted
**And** `test/test-evaluate-tool-use.js`, chained into `npm test` as `test:evaluate-tool-use` with its own `quality.yaml` step, holds each case

**Dependencies:** 1.17.
**Gate:** `npm test`, `npm run test:release-metadata`.

### Story 1.20: Import a second framework's results: promptfoo

As an adopter whose evaluation already runs in a different framework,
I want a second, unrelated framework's results imported through the same contract,
So that the import contract is proven framework-neutral with no runtime change (CAP-13, AD-21, NFR10).

**Acceptance Criteria:**

**Given** a fixture at `test/fixtures/evaluate-promptfoo/`: a deterministic `cli` stub summarizer whose summary must name every required item and no forbidden one, a `copy` workspace, a mutation that drops one required item, and a `command` evaluator under `evaluator/` using promptfoo's deterministic assertions only
**When** `run` evaluates both arms
**Then** the evaluator writes the cited observations' stdout to a temporary `outputs.json`, runs `promptfoo eval --assertions <asserts.yaml> --model-outputs <outputs.json> --output <results.jsonl> --no-cache` from TeA's devDependency with `PROMPTFOO_DISABLE_TELEMETRY=1` and `PROMPTFOO_DISABLE_UPDATE=1`, reads the JSONL rows the installed version actually wrote, and prints one judgment row per assertion from each row's `gradingResult.componentResults`, falling back to the row's `gradingResult` itself when `componentResults` is absent (a single top-level assertion) and printing a `fail` row citing the observation when `gradingResult` is absent (an error row)
**And** the test covers a multi-assertion row, a single-assertion row with no `componentResults`, and an error row with no `gradingResult`
**And** the clean arm resolves `passed-clean-control` and the mutated arm `caught`
**And** `git diff --stat -- cli/` between the story's first and last commit is empty, recorded in the completion notes, which shows a framework joined with no runtime change; `test:evaluate-boundaries` holds the rule afterwards
**And** `promptfoo` joins TeA's devDependencies at the `latest` spec; its `engines.node` floor is met by the Node major in `.nvmrc`, which the test asserts before spawning promptfoo and reports by name when unmet; `test:licences`, `test:lockfile-age` and `test:supply-chain` pass
**And** the completion notes record the installed promptfoo version and the output shape it produced, and `evaluation-framework-facts.md` is corrected where the documented shape differed
**And** `test/test-evaluate-promptfoo.js`, chained into `npm test` as `test:evaluate-promptfoo` with its own `quality.yaml` step, holds each case

**Dependencies:** 1.17.
**Gate:** `npm test`, `npm run test:release-metadata`.

### Story 1.21: Hold out probes and calibrate rubric judges

As an adopter,
I want probes the authoring loop never sees, and judges proven against my own labels before their scores count,
So that a strong result is not an evaluation tuned to its own probes, and a rubric score means what its anchors say (CAP-14, AD-22).

**Acceptance Criteria:**

**Given** `evaluation.json`'s new `heldOutProbes` list
**When** `tea-evaluate check` runs
**Then** it exits 10 when a listed ID names no committed probe, names a clean control, or leaves its behavior with no development probe, each a case in `test:evaluate-check`
**And** `run --partition development` runs only development probes, `--partition held-out` only held-out probes, and the default runs both
**And** `score` writes `runs/<invocationId>/partitions.json`, each probe's reduced outcome copied from its evidence artifact and grouped by partition, and `runs/<invocationId>/gap-view.json`, which carries development probes in full and held-out probes as ID, class and outcome only
**And** the test asserts that no held-out probe's `rationale`, defect `summary`, `testData` binding or mutation `find` or `replace` text appears in `gap-view.json`, and writing a full held-out probe into it fails the assertion
**And** every outcome in both files equals the evidence artifact's field, compared byte for byte, so the runtime computes no outcome or rate (AD-1)

**Given** a contract that declares a rubric, `policy/judge-calibration.json` holding labelled calibration items per rubric criterion (a response and the adopter's `expectedLevel`), and `evaluation.json`'s `judgeCalibration.minimumAgreement`, which the adopter sets and no template fills
**When** `tea-evaluate check` runs
**Then** it exits 10 when a rubric criterion has no calibration item, when an anchored level of a criterion has no item labelled with it, or when `minimumAgreement` is absent
**When** `run` evaluates an arm whose evaluator produces rubric scores (the judge from Story 1.9, a `sealed-brief-agent`, or a `command` evaluator bound to rubric criteria)
**Then** before the first trial it runs the same judge path over every calibration item, presenting the item's response as the observation and withholding its label, and writes `runs/<invocationId>/judge-calibration.json` with, per criterion, the exact-agreement rate and the largest level distance
**And** an agreement below `minimumAgreement` exits 11 as evaluation weakness (an uncalibrated judge) with no trial record
**And** the digest of `policy/judge-calibration.json` is recorded as `decodingParameters["tea.judgeCalibrationDigest"]` in `EvaluatorConfiguration` (its `judgeConfiguration` is strict and holds only `modelSnapshot` and `systemPromptDigest`), and editing one calibration item changes the `EvaluatorConfiguration` digest and the scoring version, which the test asserts
**And** a stub judge that captures its input shows no `expectedLevel` value reaching it, and a stub that disagrees on one of two items drops agreement to 0.5 and, with `minimumAgreement` 0.9, exits 11
**And** `test/test-evaluate-partitions.js` and `test/test-evaluate-calibration.js`, chained into `npm test` as `test:evaluate-partitions` and `test:evaluate-calibration`, each with its own `quality.yaml` step, hold these cases

**Dependencies:** 1.17.
**Gate:** `npm test`.

### Story 1.22: Attribute findings for interpretation

As an adopter reading a scored run,
I want each finding traced to the observations and oracle evidence pointers it rests on, split into process and outcome, with the first material error named,
So that I can see where the evaluated behavior first went wrong and whether the process or only the outcome failed, which eval-quality leaves to the caller (CAP-10, AD-23).

**Acceptance Criteria:**

**Given** `evaluation.json`'s new `operationPhases`, which classifies every operation the contract permits as `process` (an intermediate step such as a tool call or plan step) or `outcome` (the result a behavior is judged on)
**When** `tea-evaluate check` runs
**Then** an operation the contract permits with no phase, or a phase for an operation the contract does not declare, exits 10
**When** `tea-evaluate score` finishes a probe
**Then** it writes `runs/<invocationId>/interpretation.json` holding per trial: every finding with its cited observations (`observationId`, `sequence`, `operationId`, `provenance`, phase), its quotes, the oracle it answers and that oracle's evidence pointers read from the compiled contract; the findings partitioned into `process` and `outcome`; and the first material error, the cited observation with the lowest `sequence` among findings of severity `material` or `critical`, or `null` when none exists
**And** the outcomes, verdict and strength vector in the file are copied from the evidence artifact and compared byte for byte by the test; the file adds no outcome, verdict, rate, claim-support judgment or checkpoint score (AD-23)
**And** a fixture record with material findings citing observations at `sequence` 7, 3 and 12 names the observation at 3, and a `low` finding at `sequence` 1 leaves it unchanged
**And** `test/test-evaluate-interpret.js`, chained into `npm test` as `test:evaluate-interpret` with its own `quality.yaml` step, holds each case

**Dependencies:** 1.17.
**Gate:** `npm test`.

### Story 1.12: Inspect the target, capture requirements and design the corpus

As an adopter,
I want Evaluate to read my target in depth, ask what it cannot infer and design a corpus fit for my target's kind,
So that I confirm what is measured before any contract is written (CAP-1, CAP-2, CAP-3).

**Acceptance Criteria:**

**Given** the skill stages from Story 1.3
**When** `/bmad-workflow-builder` Edit writes `references/inspection.md`, `references/intake.md`, `references/corpus.md`, and the `assets/evaluation.json`, `assets/inspection-record.md` and `assets/requirements-statement.md` templates
**Then** inspection maps the six target kinds to interface kind and adapter exactly as AD-4's table does, maps any web application to `api`, asks a clarifying question when the kind is ambiguous, and records target kind only in `evaluation.json`
**And** inspection teaches, each under its own heading with a worked example on one target, how to read the target's entry points (commands, endpoints, tools, skill activation), its behaviors (documented promises, prompts, step files, configuration), its surfaces (every channel a behavior shows on: exit code, streams, response body, tool result, written files, and which of them a defect signature may address under AD-19), its existing tests (what they already prove, and what they assert only by keyword or snapshot) and its failure history (issues, reverted commits, incident notes, earlier evaluation results), and writes the inspection record from its template
**And** inspection carries a vendor-model passage with a worked redirect: a request to evaluate a model or vendor dependency itself (which model is better, whether a provider's model can do a task) is redirected to the adopter's use of it (their prompt, skill, agent configuration, tool wiring or feature), the model is recorded as a fixed condition in `policy/evaluator-conditions.json`, and a mutation of model weights or a switch of provider is refused because a probe cannot declare it (NFR8)
**And** intake asks six question families, each under its own heading with example questions and a worked answer: what must be proven, what evidence is admissible, which interfaces and resources are in scope, boundary conditions, operational constraints (budgets, secrets, rate limits, environments, time) and the failure modes the adopter fears or has seen
**And** intake writes the requirements statement from its template, whose six sections match the six families, to `{test_artifacts}/evaluate/<evaluationId>/`, copies it into the committed evaluation folder as `requirements.md`, records that path and its digest (eval-quality's `digestBytes` over the committed file bytes; `digestArtifact` canonicalizes a JSON value and does not apply to a Markdown file) in the new `evaluation.json` `requirements` field (an additive runtime schema change with a `check` case) for Story 2.2's contract-source freshness check, and halts for the adopter's confirmation before corpus design
**And** corpus design produces the probe set CAP-3 requires, lays it out as AD-9 states, and runs `tea-evaluate digest`
**And** corpus design teaches, per target kind (agent, skill, workflow, tool-use system, AI feature, test-review mechanism), each under its own heading with four sub-headings: representative inputs drawn from the inspection record; negative and malformed inputs matched to the `malformed-input` discipline rule; gameability design for that kind (the degenerate response a weak oracle would accept, such as returning every item for a selecting skill, flagging every test for a test-review mechanism, calling every tool for a tool-use agent, or echoing the request for an AI feature); and held-out probe selection (chosen before oracles are written, at least one per behavior the adopter ranks `material` or `critical`, listed in `heldOutProbes`, never read during the gap loop, AD-22)
**And** each kind carries a worked corpus whose probe files validate against eval-quality's probe schema through the tagged-example rule, and every probe `rationale` in a worked corpus opens with its section tag (`[representative]`, `[negative]`, `[malformed]`, `[gameability]` or `[held-out]`)

**Given** the guidance test `test/test-evaluate-guidance.js` from Story 1.3
**When** it runs
**Then** it asserts inspection names all six target kinds and never emits `web`, the five inspection headings, the vendor-model passage and its worked redirect, the six intake headings and the matching statement template sections, the confirmation halt, each CAP-3 probe rule, the six per-kind corpus headings each with its four sub-headings, and that the `evaluation.json` template validates against the runtime schema
**And** every tagged example validates, and deleting any passage above or corrupting one example fails the test

**Dependencies:** 1.4, 1.21.
**Gate:** skill gates (no registration change), `npm test`.

### Story 1.13: Author the contract, oracles, rubrics and adapter wiring

As an adopter,
I want Evaluate to write a contract that meets eval-quality's authoring discipline, seals, and wires the adapter my target needs,
So that `eval-quality compile` and `seal` exit 0, the contract proves what it claims, and preflight reaches the target (CAP-4, CAP-5, CAP-6).

**Acceptance Criteria:**

**Given** the corpus from Story 1.12
**When** `/bmad-workflow-builder` Edit writes `references/contract.md`, `references/oracles.md`, `references/adapters.md` and the contract skeleton asset
**Then** the contract guide covers the sixteen authored fields and the five identity and lineage fields, all seven `forbiddenInputs` floor members, and a non-null `observableSuccessCriterion` per behavior
**And** the contract guide teaches eval-quality's seven authoring-discipline rules (`success-indicator-separation`, `whole-body`, `malformed-input`, `per-record`, `sibling-cross-check`, `omission-and-completeness`, `state-change-read-back`), each under its own heading with a worked contract fragment that satisfies it and the coverage gap its absence produces
**And** it teaches, each with a worked example: interaction-plan design (`after`, `captured`, `cardinality`, principals, the `probeStepBound`); sensitivity-witness design (two legs differing in one input, the relation that must change, and when a no-input operation takes `null`); and waiver discipline (the rule name, a rationale, a machine-checkable condition and the approval, and a waiver only for a decision the adopter has made)
**And** it teaches what `seal` withholds from the evaluator and why: the brief keeps the behaviors, the interfaces by name and kind, the bounds, one prose direction per oracle and the contract digest, and drops the oracle checks, the interaction plan and the test data, because an evaluator that could read the checks could satisfy them without exercising the behavior, and the brief digest is what proves both arms ran one contract
**And** a worked end-to-end contract in the guide compiles and seals with exit 0 through the tagged-example rule
**And** the contract stage stamps `sourceSpecDigest` as eval-quality's `digestBytes` over the committed `requirements.md` bytes, the same function and bytes Story 1.12 records in `evaluation.json` `requirements`, so Story 2.2's freshness check compares like with like
**And** the oracle guide requires one oracle per discharged behavior and a rubric only where judgment needs an anchored scale, and teaches oracle relation choice (polarity `expects-hold` or `expects-violation`, direction prose written for a sealed evaluator, relational checks where output resamples), exact checks with evidence pointers (the channel and path a check reads, and `unreachable-check-evidence` for a pointer that can never resolve), semantic rubrics (an anchored scale with a concrete anchor for every level, criteria that each state one question, evidence pointers per criterion, failure-mode penalties, a bounded length) and judge calibration design (a labelled item for every anchored level of every criterion, labels withheld from the judge, the adopter's agreement threshold, AD-22)
**And** the oracle guide shows a deliberately loose oracle next to the degenerate response it accepts and the tightened oracle that rejects it, and every worked check and rubric compiles through the tagged-example rule
**And** the adapter guide covers every AD-4 row with a worked registry entry: the skill runner, an agent's own non-interactive command, a tool-use calling agent whose trajectory is its stdout, a tool server over `mcp`, an AI feature over the HTTP port template, and a workflow over its target's kind with `after` and `captured` bindings, citing the Story 1.10, 1.11, 1.18 and 1.19 fixtures as working examples
**And** the skill stage runs `tea-evaluate check`, `eval-quality compile` and `eval-quality seal` in that order, and halts on a non-zero exit with the failure code

**Given** the guidance test
**When** it runs
**Then** it substitutes every placeholder in the contract skeleton with the value of the same key in `test/fixtures/evaluate/contract-fill.json`, asserts the result compiles and seals with exit 0, fails when a skeleton placeholder has no fill value, asserts that the filled contract's `sourceSpecDigest` equals `digestBytes` over the fixture's `requirements.md` bytes, and asserts that the guides name each item above under its heading
**And** removing `forbiddenInputs` from the skeleton fails it, removing `seal` from the stage fails it, and corrupting one tagged example fails it

**Dependencies:** 1.10, 1.11, 1.12, 1.18, 1.19.
**Gate:** skill gates (no registration change), `npm test`.

### Story 1.23: Teach choosing and building the evaluation layer

As an adopter,
I want Evaluate to know what my evaluation layer has to do, choose or build it with me, and learn any framework I already use,
So that the mechanism that runs my system and judges it is as deliberate as the contract, whatever library it uses (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** the evaluator kinds and import contract from Story 1.17 and the framework fixtures from Stories 1.19 and 1.20
**When** `/bmad-workflow-builder` Edit writes `references/evaluator.md` and the `assets/evaluators/` templates
**Then** the guide teaches, each under its own heading, what an evaluation layer must provide (run the system, capture observations on every channel an oracle reads, judge, emit evidence as judgment rows or sealed records) and which TeA evaluator kind carries each duty
**And** it holds a selection rubric as a table keyed by option (TeA's deterministic evaluator, a sealed-brief agent evaluator, an adopter harness that seals its own records, a skill-specific evaluator, custom evaluation code, an external framework) and scored on named criteria: determinism, need for a model and its credentials, visibility of process and trajectory, need for reference outputs, rubric and calibration needs, language and runtime fit with the adopter, licence, maintenance and version drift, cost per trial, and CI tier fit; each row names the `evaluator.kind` it produces
**And** a landscape section describes established frameworks as worked examples (AgentEvals and promptfoo from `evaluation-framework-facts.md`, each with its fixture) and states that the list is illustrative: any framework is admissible through the import contract
**And** a learn-on-the-go procedure, under its own heading, covers a framework the guide does not describe: read its primary sources (documentation, repository, API reference, examples, changelog) and no secondary summary; find how it takes inputs, how it judges, what it returns and whether it needs a model; install the version the adopter uses and execute a minimal example against a known pass and a known fail before relying on any documented API; write `evaluator/LEARNED.md` in the adopter's evaluation folder from its template (framework, installed version, each fact used with its source, the executed example and its output, any documented claim the execution contradicted); then map its results to judgment rows through `evaluator/mapping.json`
**And** the guide states the vendor rule for the layer: the framework and any judge model are fixed conditions of the run, and the system under test is the adopter's use of them
**And** the templates `assets/evaluators/command-evaluator.mjs` (a framework-free skeleton), `agentevals-trajectory.mjs`, `promptfoo-assertions.mjs`, `mapping.json` and `LEARNED.md` exist, the two framework templates generalized from the Story 1.19 and 1.20 fixture evaluators

**Given** the guidance test
**When** it runs
**Then** it renders the two framework templates into temporary copies of the Story 1.19 and 1.20 fixtures, runs each evaluation, and asserts `passed-clean-control` and `caught`, so a template that drifts from its fixture fails
**And** it asserts every heading, every rubric row with an `evaluator.kind` valid against the runtime schema, each learn-on-the-go step, the `LEARNED.md` template sections and the vendor rule, and deleting any of them fails it

**Dependencies:** 1.13, 1.19, 1.20, 1.21.
**Gate:** skill gates (no registration change), `npm test`.

### Story 1.14: Drive the run and interpret the gaps

As an adopter,
I want Evaluate to plan realistic mutations, set the policy for my risk, run the arms, tell me what is weak and build what is missing,
So that a CONCERNS, FAIL or Invalid result, or a weak strength vector, ends in a closed gap (CAP-7 to CAP-10).

**Acceptance Criteria:**

**Given** a compiling, sealed contract and a chosen evaluation layer
**When** `/bmad-workflow-builder` Edit writes `references/mutation.md`, `references/harness.md`, `references/run.md` and `references/gaps.md`
**Then** mutation planning writes `mutations/M-NNN.mutation.json` files and plans signatures per AD-19
**And** mutation planning teaches realistic mutation choice per behavior, each under its own heading with a worked mutation file that validates through the tagged-example rule: weaken or remove a prompt instruction, remove required context, drop a validation step, alter a tool's result, change the agent's configuration, break a state write or its read-back, and for a test-review mechanism remove one smell rule; each names the behavior it fits, the observable failure it should produce and the channel its signature addresses, restates the single-source rule (a behavior restated in several files can survive a one-file mutation) and refuses a model-weight or provider change under the vendor rule
**And** harness asks the adopter for `severityFloor`, `minimumTrialCount` and `catchThreshold` and fills no default
**And** harness teaches choosing those values for a stated risk with a worked table covering a deterministic target and a sampled-model target at `low`, `material` and `critical` risk, the reason for each value, eval-quality's strict `caughtCount / validCount > catchThreshold` rule, and why fewer trials than `minimumTrialCount` leave the strength vector non-comparable
**And** run invokes `tea-evaluate preflight`, `run` and `score` through `npm exec --prefix {tea_evaluations_folder}` after writing the AD-20 private `package.json` with `eval-quality` and TeA's package at the `latest` spec and running `npm install --prefix {tea_evaluations_folder}`; when `{project-root}` is TeA's own package it invokes `node cli/evaluate.js`
**And** gaps reads the evidence artifact, or for a `score` exit 3 with no artifact the persisted `score` diagnostics, and maps every outcome state, every AD-10 exit and class, every preflight check and every coverage rule to the probe, control, oracle or evidence that closes it
**And** gaps teaches, each under its own heading with a worked reading: the strength vector (a catch rate per probe class, what a low rate says about that class, a `null` rate as an unexercised class, why clean controls and canaries never enter it, and why one caught defect does not make a contract strong); a loose oracle that passes a degenerate response, recognised from a gameability probe that fails qualification or does not resolve `caught`; process versus outcome separation and first material error attribution read from `interpretation.json` (Story 1.22); and held-out results read from `gap-view.json` only (Story 1.21)
**And** gaps runs the author, rerun and rescore loop: for each named gap it authors the missing probe, control, oracle, rubric criterion or evidence pointer, reruns `tea-evaluate check`, `eval-quality compile` and `seal`, reruns `run --partition development` and `score`, records the before and after outcome of the gap in the gap report, and stops when the gap is closed or the adopter declines it; the held-out partition runs only once the development partition is strong

**Given** the guidance test
**When** it runs
**Then** it asserts `gaps.md` names every outcome state and discipline rule from the installed package's `OUTCOME_STATES` and `DISCIPLINE_RULES` exports, every preflight check from `eval-quality/schemas/preflight-verdict.schema.json`, and each AD-10 exit, and that it names the persisted `score` diagnostics as the source for a `score` exit 3
**And** it asserts each mutation heading, the harness risk table rows and the strict-threshold rule, each gaps reading heading, and each loop step, and every tagged mutation example validates against the runtime schema
**And** removing one mapping, heading or loop step fails it

**Dependencies:** 1.9, 1.13, 1.22, 1.23.
**Gate:** skill gates (no registration change), `npm test`.

### Story 1.15: Float the engine pin and admit Evaluate-authored suites

As a TEA maintainer,
I want TeA's engine spec floating and its suite manifest ready for an Evaluate-authored suite,
So that the proof run registers its suite in one step (AD-13, AD-15).

**Acceptance Criteria:**

**Given** AD-13
**When** the pin floats
**Then** the devDependency spec for `eval-quality` in `package.json` is `latest` and `test/test-eval-quality-corpus.js` no longer demands an exact version
**And** the `.npmrc` and `lockfile-age` exclusions stay, with their rationale rewritten
**And** after the pin floats to `latest`, `npm install` resolves `eval-quality` from the registry, the engine check exits 0 and `git diff -- package.json package-lock.json` shows no `file:` or `.tgz` spec

**Given** `test/lib/suite-manifest.js` and `tools/validate-eval-schemas.js` count only `evalType: "behavioral"`
**When** the new `evalType` `evaluate-authored` is admitted
**Then** an entry of that type points at an `evaluation.json`, and its thresholds are cross-checked against that file and its scoring policy
**And** `test/schema/suite-manifest.js` gains an `evaluate-authored` branch in `EVAL_TYPES` carrying the `evaluation` path and none of the harness fields, `test/eval-all.js` routes or skips the type, and `evaluate-authored` discharges the coverage obligation in `test/lib/suite-manifest.js` and both counters in `tools/validate-eval-schemas.js`; a fixture manifest whose only entry for a temp skill is `evaluate-authored` passes `test:suite-manifest`, and fails it when the counter change is reverted
**And** a fixture entry over `test/fixtures/evaluate/` passes, and changing one of its thresholds fails `test:eval-schemas`
**And** a skill carrying both a `behavioral` and an `evaluate-authored` entry fails `test:eval-schemas` (AD-14: no suite has both authoring paths)

**Dependencies:** 1.14.
**Gate:** `npm test`, `npm run test:release-metadata`.

### Story 1.16: Evaluate authors its own suite, run live and recorded

As a TEA maintainer,
I want Evaluate to author and run the behavioral suite for `bmad-testarch-evaluate` itself,
So that the authoring loop is proven on a real target and nobody hand-builds the runner, adapter or corpus (AD-15).

**Acceptance Criteria:**

**Given** the skill as Stories 1.3 to 1.14 and 1.17 to 1.23 left it, and a gitignored `_bmad/tea/config.yaml` the worker writes (TEA is not installed into its own repository) with `tea_evaluations_folder: test/evaluations` and `test_artifacts`, the skill invoked by path from `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md`, and the runner-driven arms getting TEA config the way the existing runners do (`cli/lib/resolve-tea-config.js`), all recorded in `epic-1-proof.md`
**When** a maintainer session runs `EV` on `bmad-testarch-evaluate`, answering intake from `SPEC.md`, with live legs through the local Claude Code CLI
**Then** `.prettierignore` lists `test/evaluations/**`, so canonical JSON bytes that `corpus-index.json` digests are never reformatted
**And** `test/evaluations/bmad-testarch-evaluate/` holds `evaluation.json`, `contract.json`, probes, at least one mutation of a file under the skill root, `corpus-index.json` and `policy/`
**And** the behavior the seeded probe discharges is observable on the skill runner's stdout or exit code (AD-19), and its mutation edits the single place in `references/` that defines that output (a behavior restated in several guides can survive a one-file mutation); a behavior visible only in a file the skill writes cannot carry a defect signature
**And** before the recorded run the worker confirms once, on the disposable copy, that the mutation manifests
**And** `tea-evaluate check`, `eval-quality compile` and `eval-quality seal` exit 0, run in that order as the skill's compile-and-validate stage runs them
**And** the run uses `--from-working-tree`, since the work is uncommitted, and `run.json` records `dirty: true`

**Given** the live run
**When** it completes
**Then** preflight passed, the clean arm resolved `passed-clean-control` and the mutated arm resolved `caught` at `minimumTrialCount`, all read from the evidence artifacts
**And** the mutation's rollback evidence shows the mutated digest unequal to the pre-mutation digest, the restored digest equal to it, and the re-passed baseline leg; the adopter tree is untouched: `shasum -a 256` of the file in the worktree equals the pre-mutation digest and `git status --porcelain` is identical before and after
**And** `eval-quality score`, run directly from `node_modules/.bin` outside `tea-evaluate` over the persisted records, isolation manifests and evaluator configuration, reproduces each evidence artifact byte for byte
**And** a verdict other than PASS or a probe other than `caught` is recorded as found, with the gaps Evaluate named, and the run is recorded once
**And** the result is recorded at `_bmad-output/implementation-artifacts/evaluate/epic-1-proof.md` with verdicts, exit codes, contract and corpus digests, `run.json`, the rollback evidence digests and the gaps Evaluate named, and `runs/<invocationId>/` stays in the worktree for Epic 2

**Given** `test/evals/suite-manifest.json` and the `evaluate-authored` type from Story 1.15
**When** the suite is registered
**Then** the `deferred` entry is replaced by an `evaluate-authored` entry pointing at the evaluation's `evaluation.json`, and `test:eval-schemas` passes its threshold cross-check

**Dependencies:** 1.15.
**Gate:** skill gates (no registration change), `npm test`.

### Story 1.24: Evaluate authors strong suites for two more target kinds

As a TEA maintainer,
I want Evaluate to author suites for target kinds other than a skill, from a description and intake answers alone,
So that the guidance is proven to produce corpora and contracts that compile, preflight and score strong, beyond the dogfood target (AD-3, AD-15).

**Acceptance Criteria:**

**Given** two fixture targets with no evaluation folder: an AI feature over HTTP at `test/fixtures/evaluate-authoring/ai-feature/target/` (a loopback stub that answers from a rules file) and a test-review mechanism at `test/fixtures/evaluate-authoring/test-review/target/` (a `cli` stub that reviews a test file and reports smells), each with a `DESCRIPTION.md` and an `intake-answers.md`, and neither naming the defects the worker will seed
**When** a maintainer session runs `EV` on each through the local Claude Code CLI, in a temporary folder holding only the installed skill, the target and its two files, answering intake from `intake-answers.md`
**Then** each session writes `evaluation.json`, `contract.json`, probes (held-out probes among them), mutations, `corpus-index.json`, `policy/` and its evaluator choice with the selection-rubric reason, committed under `test/fixtures/evaluate-authoring/<kind>/evaluation/`, with the inspection record, the requirements statement and the session transcript committed beside it
**And** `tea-evaluate check`, `eval-quality compile` and `eval-quality seal` exit 0, and preflight passes
**And** each suite scores strong at `minimumTrialCount`, defined for this plan as: the clean control resolves `passed-clean-control`; every defect, zero-action and gameability probe, development and held-out, resolves `caught`; every exercised probe class has rate 1.0; the verdict is PASS with no coverage gap at or above `severityFloor`
**And** every probe `rationale` opens with its corpus section tag, and each suite covers all four corpus sections for its kind, which the test asserts
**And** one of the two sessions also receives the request to evaluate whether the stub's underlying model is good at the task; its transcript shows the redirect to the adopter's use of the model with the model recorded as a fixed condition, and no committed mutation targets a model
**And** a result short of strong is recorded as found and closed through the gap loop inside the story, each iteration in the transcript; the story ends only when both suites are strong
**And** each evaluation commits the replay inputs of its strong run under `evaluation/replay/`: observations, the preflight verdict, sealed records, isolation manifests, the evaluator configuration, the scoring policy and the evidence artifacts, whichever evaluator kind the rubric chose (a sealed-brief agent or a model judge included)
**And** `test/test-evaluate-authoring.js`, chained into `npm test` as `test:evaluate-authoring` with its own `quality.yaml` step, runs `tea-evaluate check`, `eval-quality compile` and `seal` on both committed evaluations, then replays the committed observations and records through `eval-quality preflight --observations` and `eval-quality score` called directly (Story 2.2's `tea-evaluate ci` replay does not exist yet), with no target launch and no model call; the produced evidence must equal the committed evidence byte for byte and show the strong state, and the test asserts the section coverage; editing the committed contract or one committed observation fails it

**Dependencies:** 1.16.
**Gate:** `npm test`.

### Story 1.25: Close seeded weaknesses through the gap loop

As a TEA maintainer,
I want Evaluate's gaps stage to find weaknesses it was not told about, author the missing pieces, rerun and rescore,
So that "TeA names what is weak and builds the missing piece" is a tested fact (CAP-10).

**Acceptance Criteria:**

**Given** a copy of the Story 1.24 test-review evaluation at `test/fixtures/evaluate-gap-loop/before/` into which the worker seeds two weaknesses, recorded only in `test/fixtures/evaluate-gap-loop/SEEDED.md`, which the session is not given: W1, the oracle over the review verdict loosened so the degenerate response that flags every test satisfies it; W2, the malformed-input probe and the oracle clause that reads it removed
**When** the before evaluation runs, and a maintainer session runs Evaluate's gaps stage on its evidence through the local Claude Code CLI
**Then** the before evidence shows both weaknesses: the gameability probe fails qualification or resolves an outcome other than `caught` (W1), and a `malformed-input` coverage gap is recorded (W2)
**And** the session's gap report names the loose oracle and the `malformed-input` rule, authors the tightened oracle and a malformed-input probe with its oracle, reruns and rescores, and the resulting evaluation, committed at `test/fixtures/evaluate-gap-loop/after/`, scores strong as Story 1.24 defines it
**And** the session never read `SEEDED.md` or a held-out probe file, which the transcript's file reads show and the completion notes cite
**And** both evaluations commit their replay inputs under `replay/` as Story 1.24 defines them, and `test/test-evaluate-gap-loop.js`, chained into `npm test` as `test:evaluate-gap-loop` with its own `quality.yaml` step, replays each through `eval-quality preflight --observations` and `score` with no target launch and no model call, reproduces the committed evidence byte for byte, asserts both before weaknesses and the after strength, and asserts that every file differing between before and after is one the committed gap report names

**Dependencies:** 1.24.
**Gate:** `npm test`.

### Story 1.26: Learn an unfamiliar evaluation framework on the go

As an adopter who uses an evaluation framework Evaluate's guides never mention,
I want Evaluate to learn it from its primary sources, verify what it learned by running it, and import its results,
So that TeA's support for evaluation frameworks has no fixed list (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** a framework the worker chooses that installs from npm, offers an evaluator that runs with no model call, and whose name appears nowhere under `src/workflows/testarch/bmad-testarch-evaluate/`, and a fixture target at `test/fixtures/evaluate-learn/target/` whose behavior that evaluator can judge, with a `copy` workspace and one mutation
**When** a maintainer session runs `EV` with the adopter's instruction to use that framework as the evaluation layer
**Then** the transcript shows the learn-on-the-go procedure from Story 1.23: the primary sources read, the installed version, and a minimal example executed against a known pass and a known fail before any mapping was written
**And** the committed evaluation at `test/fixtures/evaluate-learn/evaluation/` holds `evaluator/LEARNED.md` recording the framework, the version, each fact used with its source, the executed example and its output, and any contradiction found
**And** its evaluator prints judgment rows through `evaluator/mapping.json`, the clean arm resolves `passed-clean-control`, the mutated arm resolves `caught`, and `git diff --stat -- cli/` across the story is empty
**And** the framework joins TeA's devDependencies at the `latest` spec, and `test:licences`, `test:lockfile-age` and `test:supply-chain` pass
**And** the learned facts are added to `evaluation-framework-facts.md` as a further example, and the skill's guides stay free of the framework's name so the criterion can be repeated with another framework
**And** `test/test-evaluate-learned-framework.js`, chained into `npm test` as `test:evaluate-learned-framework` with its own `quality.yaml` step, asserts the framework's name is absent from the skill directory and re-runs the committed evaluation to `passed-clean-control` and `caught`; the evaluator the framework provides runs with no model call (the story's selection condition), so the full run, the framework's evaluator included, stays deterministic in `npm test`

**Dependencies:** 1.23, 1.25.
**Gate:** `npm test`, `npm run test:release-metadata`.

## Epic 2: Continuous proof in CI

The evaluation Epic 1 produced is proven on every pull request, with the evidence to audit it.

**FRs covered:** FR11, FR12, and the tier placement of FR14.

### Story 2.1: Compare runs and accept a baseline

As an adopter,
I want each run compared with a recorded baseline,
So that drift in strength or evidence is visible and a baseline changes only by review (CAP-12, AD-12).

**Acceptance Criteria:**

**Given** `test/lib/compare-dominance.js` and `test/lib/compare-eval-runs.js`
**When** `cli/lib/evaluate/compare.js` generalizes them and `tea-evaluate compare` ships
**Then** it compares a run with `baseline/` through `compareDominance` and reports `refused` when `comparabilityKey` differs, including across `evalQualityVersion`
**And** `compare --accept` writes `baseline/` (contract snapshot, sealed brief, qualified probes, observations, preflight verdict, sealed records, per-trial-set isolation manifests, evaluator configuration, scoring policy, evidence) and `baseline/qualification/`, and refuses a run whose `run.json` says `dirty: true`; a replay through `score` needs every one of these, so omitting the isolation manifests makes Story 2.2's replay exit 3
**And** since `compareDominance` already reports `incomparable` for differing `comparabilityKey`, the named revert check for TeA's own refusal is the case whose only difference is `evalQualityVersion` in `run.json`
**And** `test/lib/compare-dominance.js` and `test/lib/compare-eval-runs.js` import the runtime module and keep only TeA data
**And** `test/test-evaluate-compare.js`, chained into `npm test` as `test:evaluate-compare` with its own `quality.yaml` step, asserts each case, and it fails when the dirty refusal is removed

**Given** the dirty run from Story 1.16
**When** `compare --accept` is tried on it
**Then** it is refused with exit 10, and the refusal is recorded in `epic-1-proof.md` as the expected overnight state

**Dependencies:** 1.16, 1.26.
**Gate:** `npm test`.

### Story 2.2: Plan CI tiers and run them with `tea-evaluate ci`

As an adopter,
I want one platform-neutral plan that says what runs when and what blocks,
So that the pipeline enforces eval-quality's verdicts without a second taxonomy (CAP-11, CAP-14, AD-10).

**Acceptance Criteria:**

**Given** the runtime owns the schema of `ci/evaluation-ci-plan.json` (per check: tier, trigger, kind `evaluate` with a `tea-evaluate` command or kind `gate` with an `eval-quality-gates` command, enforcement class, evidence paths, and `placement`: the chosen `tier`, the `defaultTier` from AD-10's table and a `reason` naming what the repository inspection found)
**When** `tea-evaluate ci --tier <tier>` runs
**Then** it runs exactly the plan's checks for that tier: `pr` runs `check`, `compile`, `seal`, API port conformance and the replay of committed baseline observations and records through `preflight` and `score`, which must reproduce the committed evidence; `merge`, `scheduled` and `release` follow AD-10
**And** it passes stage exits through verbatim, never passes `--strict`, and reads CONCERNS from the evidence artifact as warn
**And** it applies the strength floor per probe class (warn on `scheduled`, block on `release`) and the stale-baseline rule (warn on `pr`, block on `release`)
**And** it claims none of `evidence-over-truncated`, `evidence-unavailable` or `evidence-internally-inconsistent`
**And** it persists each check's exit code, stdout and stderr under `runs/<invocationId>/`, so a `gate` check the adopter's plan adopts leaves its output in the evidence bundle (AD-12); a `test:evaluate-ci` case runs a stub `gate` check that prints distinct known bytes to each stream and exits 1, asserts byte equality per stream and the recorded code, and fails when the capture is dropped

**Given** a plan whose placements differ from AD-10's defaults
**When** `tea-evaluate ci` validates it
**Then** a check whose `tier` differs from its `defaultTier` with no `reason` fails validation, and a deterministic check that needs no secret placed off `pr` fails validation, since CAP-11 requires every such check on every pull request; each is a `test:evaluate-ci` case

**Given** the deterministic checks the audit found in no tier
**When** the `pr` tier runs
**Then** it also runs the gameability arm for every gameability probe (Story 1.9: no target launches) through `score`, and a launch marker the stub target would write stays absent
**And** it runs contract-source freshness: `check` compares the contract's `sourceSpecDigest` (stamped by the contract stage, Story 1.13) with `digestBytes` over the committed `requirements.md` bytes that `evaluation.json` `requirements` names (Story 1.12), and exits 10 on a mismatch or on a missing statement, so a requirements change the contract never absorbed blocks the pull request; editing one byte of a fixture statement makes the case exit 10
**And** this story adds a `requirements.md`, its `requirements` entry and the matching `sourceSpecDigest` to every fixture evaluation `check` runs over that was built before Story 1.12: the base fixture `test/fixtures/evaluate/` (Story 1.4, which `test:evaluate-check`, `-preflight`, `-run`, `-mutation`, `-arms`, `-evaluators`, `-partitions`, `-calibration`, `-interpret` and `-ci` all run `check` over), `test/fixtures/evaluate-mcp/` (1.10), `test/fixtures/evaluate-api/` (1.11), `test/fixtures/evaluate-workflow/` (1.18), `test/fixtures/evaluate-tool-use-agent/` (1.19) and `test/fixtures/evaluate-promptfoo/` (1.20); evaluations authored from Story 1.12 on (1.16, 1.24 to 1.26 and the copies 1.25 and 2.4 make of them) carry one already
**And** a `test:evaluate-check` case walks every `evaluation.json` under `test/fixtures/` and `test/evaluations/` and asserts each names a `requirements.md` whose digest matches its contract, and deleting one fixture's `requirements.md` makes `check` exit 10, which the case observes; negative `check` cases (Story 1.4's failure fixtures and any later ones) are built in temporary folders at test time and never committed as folders holding an `evaluation.json`, so the walk sees only evaluations meant to pass
**And** it runs oracle-versus-scorer agreement over the committed baseline by reading the `corroboration` eval-quality recorded on each oracle outcome in the baseline evidence (`agrees`, `disagrees` or `not-evaluable`, the engine's own comparison of the evaluator's disposition with the evidence); any `disagrees`, or a required oracle whose corroboration is `not-evaluable` or whose outcome is `unreached`, exits 11 as evaluation weakness; TeA holds no table of its own; flipping one disposition in a fixture baseline record and re-scoring makes eval-quality report `disagrees`, and the case exits 11
**And** the `scheduled` and `release` tiers run the held-out partition (Story 1.21) with the strength floor applied to it separately (warn on `scheduled`, block on `release`), and judge calibration whenever the contract declares a rubric, whose exit 11 blocks on both tiers

**Given** `test/test-evaluate-ci.js`, chained into `npm test` as `test:evaluate-ci` with its own `quality.yaml` step
**When** it runs over fixture plans and a fixture evaluation with a committed test baseline under `test/fixtures/evaluate/`
**Then** it asserts the AD-10 enforcement table row by row, the outcome-state mapping, the tier membership and a replay that reproduces the fixture evidence
**And** replay reads produced evidence only from a fresh `runs/<invocationId>/replay/` directory and baseline bytes only from `baseline/`; produced evidence that differs from the baseline exits 13, class evaluation evidence drift, action block (an AD-10 row)
**And** mutating one committed baseline evidence byte exits 13, which catches a replay that compares a file with itself
**And** mutating the clean-control leg's `exitCode` in one committed baseline observation exits 13 while eval-quality's own exits stay as recorded, and with `TEA_EVALUATE_ENGINE_CLI` pointed at a logging shim the argv log shows `preflight` and `score` invoked, which together catch a replay that copies baseline evidence forward without re-scoring
**And** a baseline tree whose `policy/` digest differs from the baseline's recorded policy is a stale baseline under AD-10
**And** `test/fixtures/evaluate-mcp/` and `test/fixtures/evaluate-api/` each gain a `ci/evaluation-ci-plan.json` and a fixture baseline, validated against the runtime schema

**Dependencies:** 2.1.
**Gate:** `npm test`.

### Story 2.3: Render evaluation plans in `bmad-testarch-ci`

As an adopter,
I want the CI skill I already use to render my evaluation plan,
So that one skill owns the pipeline files (AD-11).

**Acceptance Criteria:**

**Given** `src/workflows/testarch/bmad-testarch-ci/` in the house shape
**When** a step is added, authored directly, that detects `ci/evaluation-ci-plan.json` files and renders them with the existing platform templates
**Then** a standalone CI run and an edit-mode invocation both pick up existing plans
**And** each `pr` check renders as its own pipeline step
**And** the GitHub Actions template gains an evaluation block with a per-check step pattern and an upload of `runs/<invocationId>/` with `if: always()` (AD-12); a deterministic test, chained into `npm test` as `test:evaluate-ci-render` with its own `quality.yaml` step, asserts the detection step is reached from both the create and edit entry points and parses the template block as YAML asserting both patterns
**And** because the CI skill's templates are rendered by the agent, the rendering itself is proved behaviorally: `test/eval-ci.js` gains an `evaluation-plan` case over the fixture adopter from Story 1.10, whose ground truth lists each `pr` command as a standalone `run:` step and the `runs/` upload path; the case's fixture set lives under `test/fixtures/ci-eval/evaluation-plan/` (the harness requires set roots there) as a copy of that plan; a live `npm run eval:ci` through the local Claude Code CLI produces the workflow, which the worker captures by hand into `test/replay/ci/evaluation-plan-<case>/expected.json` with `storedOutput` marked a real capture; `node tools/generate-contracts.js` and `node tools/generate-probes.js` are re-run (the CI contract's `probeStepBound` grows with the set count) and the `ci` suite's `caseCount` and `fixtures` in `suite-manifest.json` are updated; `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:eval-replay` and `test:eval-ci-data` then hold it
**And** the house tests, `node tools/generate-contracts.js --check` for `ci.contract.json` and the CI suite's replay pass, and removing the new step fails the rendering test

**Dependencies:** 2.2.
**Gate:** `bmad-testarch-ci` edit gates, `npm test`.

### Story 2.4: Finish the evaluation with its CI stage

As an adopter,
I want Evaluate's last stage to write my CI plan and hand it to the CI skill,
So that no evaluation ends locally working and unenforced, and each check runs where the adopter's repository needs it (CAP-11).

**Acceptance Criteria:**

**Given** the Evaluate skill
**When** `/bmad-workflow-builder` Edit writes `references/ci.md` and the `ci/evaluation-ci-plan.json` template
**Then** before writing the plan the stage inspects the adopter's repository, each under its own heading with a worked example: existing CI (platform, workflows, required checks, which events receive which secrets), merge flow (branch protection, merge queue, review requirement), release flow (tags, publish or deploy workflows, cadence) and risk profile (the severities the contract declares, cost per live trial, the reach of a missed defect)
**And** it derives each check's tier from that inspection with AD-10's table as the default, records `placement.reason` naming the file or answer each placement came from, and records every deviation from the default
**And** it places the gameability arm, contract-source freshness and oracle-versus-scorer agreement on `pr`, the held-out partition and judge calibration on `scheduled` and `release`, sets live tiers for skill and agent targets to `scheduled`, `release` and manual dispatch only, declares the runner's credential keys as `permittedEnvironmentKeys`, and invokes `bmad-testarch-ci` in edit mode
**And** `eval-quality-gates` is offered as opt-in, adds only sections for gates the adopter adopts, never rewrites an existing section, and adds each adopted gate to the plan as a `gate` check
**And** the guidance test asserts each heading and placement rule, and the plan template validates against the runtime schema

**Given** two fixture repositories under `test/fixtures/evaluate-ci-repos/`, one releasing on tags with no model secret in CI and one deploying nightly with a model secret on scheduled runs, each carrying the Story 1.24 AI-feature evaluation
**When** a maintainer session runs the ci stage on each through the local Claude Code CLI
**Then** both produced plans validate against the runtime schema and are committed, they differ in the placement of at least one live check, and each differing placement's `reason` cites a file from its repository
**And** `test:evaluate-ci` validates both committed plans and asserts that difference, so a stage that ignores the inspection and writes the default table fails it

**Dependencies:** 2.3.
**Gate:** skill gates (no registration change), `npm test`.

### Story 2.5: TeA runs its `pr` tier and documents Evaluate

As a TEA maintainer,
I want TeA's own pull requests to run the `pr` tier for the Evaluate-authored suite and both fixture adopters,
So that Evaluate is continuously proven where it is built, and users can read how to use it.

**Acceptance Criteria:**

**Given** the evaluations from Stories 1.10, 1.11, 1.16, 1.18, 1.19, 1.20, 1.24, 1.25 (its `after` evaluation) and 1.26
**When** the worker wires TeA directly (AD-11: TeA's checks are `npm test` chain scripts with `validate` steps, and the CI-skill rendering is proved on the fixture adopters in Story 2.3)
**Then** each fixture evaluation's `pr` checks, and the `check`, `compile` and `seal` checks of `bmad-testarch-evaluate`, join the `npm test` chain as scripts, each with its own step in the `validate` job of `.github/workflows/quality.yaml`, and `npm run test:ci-coverage` passes
**And** the `validate` job uploads each `runs/<invocationId>/` as a build artifact with `if: always()`, and a `test:evaluate-ci` case parses `quality.yaml` and fails when that upload step or its path is missing
**And** the eight `eval-quality-gates` stay in their current `quality.yaml` jobs, unchanged, which the same test asserts

**Given** no committed baseline exists overnight for `bmad-testarch-evaluate`
**When** the overnight evidence is recorded
**Then** `tea-evaluate ci --tier pr` exits 0 for every fixture evaluation, each with a baseline accepted through `compare --accept` from a clean copy-target run (AD-8: a fixture target's `evaluation.json` declares a copy workspace, so its run records `dirty: false`), the gameability arm, contract-source freshness and oracle agreement included
**And** for `bmad-testarch-evaluate` the non-replay `pr` checks (`check`, `compile`, `seal`) exit 0, and the replay step is recorded as pending Story H.1 with the dirty proof run's evidence artifact, verdicts and rollback proof cited from `epic-1-proof.md`
**And** the result is recorded at `_bmad-output/implementation-artifacts/evaluate/epic-2-proof.md`

**Given** `docs/explanation/how-tea-is-tested.md` names Evaluate as proposed future work
**When** the documentation lands
**Then** a how-to page for Evaluate is added and linked from the TEA overview and the site navigation, `how-tea-is-tested.md` and `eval-quality-adoption-guide.md` describe Evaluate as shipped, and the page documents TeA's 0/1/2 harness convention as an optional pattern
**And** the page explains the stack (system under test, the evaluation, the Behavioral Evaluation Contract, eval-quality) and what TeA owns above eval-quality, the evaluator kinds and how to choose one, the import contract with the AgentEvals and promptfoo fixtures as examples, the learn-on-the-go procedure for any other framework, held-out probes and judge calibration, and how CI placement is derived
**And** `npm run docs:validate-links`, `npm run docs:build`, `test:doc-counts` and `test:doc-claims` pass

**Dependencies:** 2.4.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, `npm run test:release-metadata`.

## Owner Hand-off

### Story H.1: Accept the dogfood baseline and turn its `pr` replay green

Run by the coordinator of Story 2.5 once it merges. No `/bmad-build` worker runs this story.

**Engine status (verified 2026-09-23):** eval-quality 4.0.0 is published and is npm `latest`, carrying the target-policy export (#158) and trial-set scoring with `EvidenceArtifact` version 4 (#143). Story 1.2 put TeA on it and Story 1.4 floors the peer range at `>=4.0.0`, so every Epic 1 and Epic 2 check, the `test:evaluate-*` scripts the 2026-09-23 amendment adds included, runs on the published engine from the story that adds it. No engine release or floor raise remains for this story.

As the owner,
I want the dirty proof run replaced by a clean one on the merged tree,
So that the `pr` replay of `bmad-testarch-evaluate` has an accepted baseline to reproduce.

**Steps, each with what it proves:**

1. On `main` after Story 2.5 merges, `npm ci` then `npm test`. Proves every check is green on the merged tree and the published engine.
2. `node cli/evaluate.js run --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json` and `score` on that committed tree, with live legs through the local Claude Code CLI. Proves a clean (`dirty: false`) run: preflight passed, `passed-clean-control`, `caught` at `minimumTrialCount`, rollback proved.
3. `node cli/evaluate.js compare --accept --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json` in a branch, and open the pull request. Add the `bmad-testarch-evaluate` replay as an `npm test` script with its own `validate` step in `quality.yaml` in the same pull request. Proves the baseline enters `baseline/` only through a reviewed pull request (AD-12).
4. `node cli/evaluate.js ci --tier pr --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json`, locally and in the pull request's `quality.yaml` run. Proves the `pr` replay reproduces the committed evidence, closing AD-15's last condition.

**Dependencies:** 2.5.

## Traceability

| Capability | Stories | Proven by |
| --- | --- | --- |
| CAP-1 | 1.3, 1.12, 1.13, 1.24 | guidance test; 1.10, 1.11 and 1.16 contracts declare `mcp`, `api`, `cli`; 1.24 inspection records and vendor redirect |
| CAP-2 | 1.12, 1.24 | guidance test (six families, confirmation halt); 1.16 and 1.24 requirements statements |
| CAP-3 | 1.4, 1.12, 1.16, 1.21, 1.24 | `test:evaluate-check`; tagged corpus examples; `test:evaluate-authoring` section coverage |
| CAP-4 | 1.4, 1.13, 1.16, 1.24 | skeleton compile and seal test; tagged contract examples; 1.16 and 1.24 compile and seal exit 0 |
| CAP-5 | 1.9, 1.13, 1.21, 1.24 | `test:evaluate-arms`; `test:evaluate-calibration`; tagged oracle and rubric examples |
| CAP-6 | 1.1, 1.5, 1.6, 1.10, 1.11, 1.13, 1.18, 1.19 | `test:evaluate-preflight`, `-mcp`, `-api`, `-workflow`, `-tool-use` |
| CAP-7 | 1.7, 1.9, 1.14, 1.16 | `test:evaluate-mutation`; tagged mutation examples; 1.16 rollback evidence |
| CAP-8 | 1.8, 1.14 | template schema validation; guidance test (risk table) |
| CAP-9 | 1.6, 1.8, 1.14, 1.16, 1.17 | `test:evaluate-run`; `test:evaluate-evaluators`; 1.16 live verdicts |
| CAP-10 | 1.14, 1.16, 1.22, 1.25 | guidance test over exported vocabularies; `test:evaluate-interpret`; `test:evaluate-gap-loop` |
| CAP-11 | 2.2, 2.3, 2.4, 2.5, H.1 | `test:evaluate-ci` (placement, gameability, freshness, agreement); rendering test; `quality.yaml` steps; H.1 step 4 |
| CAP-12 | 1.8, 2.1, 2.5, H.1 | `run.json`; `test:evaluate-compare`; H.1 step 3 |
| CAP-13 | 1.17, 1.19, 1.20, 1.23, 1.26 | `test:evaluate-evaluators`, `-tool-use`, `-promptfoo`, `-learned-framework`; template rendering in the guidance test |
| CAP-14 | 1.21, 2.2 | `test:evaluate-partitions`, `test:evaluate-calibration`; `scheduled` and `release` tier cases |

### Plan gap audit closure

The 2026-09-23 audit of this plan found eleven partial and two missing items, seven eval-quality non-goals no story covered, and an addendum of further gaps. Each is closed here.

| Audit item | Closed by |
| --- | --- |
| 1 Inspect target: entry points, behaviors, surfaces, existing tests, failure history | Story 1.12 (inspection headings, inspection record); proven in Story 1.24 |
| 2 Test-review mechanism kind | AD-4 sixth row; Story 1.12 corpus section; Story 1.24 test-review suite |
| 3 Intake questions | Story 1.12 (six question families, statement template) |
| 4 Corpus design per kind, representative, negative and malformed inputs, held-out probes | Story 1.12 (per-kind corpus); Story 1.21 (held-out runtime); Story 1.24 (section coverage) |
| 5 BEC authoring discipline, interaction plan, sensitivity witness, waivers, worked examples | Story 1.13 |
| 8 Gameability design per kind | Story 1.12 (per-kind gameability); Story 1.13 (loose and tightened oracle) |
| 9 Oracle relation choice, evidence pointers, anchored scales, judge calibration | Story 1.13 (guide); Story 1.21 (calibration runtime) |
| 10 Workflow adapter, tool-use calling agent, agent's own command | Stories 1.18 and 1.19 (fixtures); Story 1.13 (adapter guide rows) |
| 11 Realistic mutation choice per behavior | Story 1.14 (mutation guide) |
| 18 Author, rerun, rescore loop | Story 1.14 (loop); Story 1.25 (seeded weaknesses closed) |
| 19 CI placement from the adopter's repository, CI, release flow and risk profile | AD-10 amended; Story 2.4 (inspection, placement reasons, two fixture repositories); Story 2.2 (placement schema) |
| 20 Gameability arm, contract-source freshness, oracle-versus-scorer agreement in tiers | Story 2.2 (`pr` tier); Story 2.4 (placement) |
| 26 TeA decides what runs when | Story 2.4; AD-10 |
| 27 Evaluation-layer knowledge, third-party frameworks, sealed-brief evaluator | AD-21; Stories 1.17 (evaluator kinds, import contract, sealed-brief agent, records), 1.19 (AgentEvals), 1.20 (promptfoo), 1.23 (guide, rubric, learn-on-the-go), 1.26 (unfamiliar framework) |
| Non-goal: claim-to-evidence lineage | AD-23 boundary; Story 1.22 (citation and pointer trace); Story 1.17 (quotes reach the engine unaltered) |
| Non-goal: process and outcome separation, first material error attribution | Story 1.22 (runtime); Story 1.14 (reading them) |
| Non-goal: semantic checkpoint scoring | AD-23 boundary: a judgment checkpoint is a rubric criterion judged by a calibrated judge (Stories 1.13, 1.21) and scored by eval-quality |
| Non-goal: held-out probe sets | AD-22; Story 1.21; Story 2.2 (tiers) |
| Non-goal: judge calibration | AD-22; Story 1.21; Story 1.13 (design) |
| Non-goal: tool-selection evaluation | Story 1.19 |
| Know-how placement: guidance proven only by term presence | Build Rules (craft and tagged examples); Stories 1.24, 1.25, 1.26 |
| Addendum A: `seal` in the skill's compile-and-validate stage | Story 1.13 (stage and guide); Story 1.16 (proof runs `seal`) |
| Addendum B: vendor-model requests redirected | Story 1.12 (passage and test); Story 1.24 (recorded redirect); AD-4 |
| Addendum: repetition count and thresholds for a risk | Story 1.14 (harness risk table) |
| Addendum: low catch rate, strength-vector reading, loose oracle | Story 1.14 (gaps readings) |
| Addendum: exact checks and semantic rubrics | Story 1.13 (tagged examples compile) |
| Addendum: adopter-owned harness or custom evaluator into `score` | Story 1.17 (`command` and `records` kinds) |

## Epic Sizing

| Epic | Size | What drives it |
| --- | --- | --- |
| Epic 1 | Extra large | One upstream export; a runtime generalized from existing harness code in six moves plus the evaluation layer (evaluator kinds, the MCP bridge, the import contract), held-out partitions, judge calibration and interpretation; eight fixture targets (MCP, API, workflow, tool-use agent, promptfoo summarizer, AI feature, test-review mechanism, learn-on-the-go target) and three framework devDependencies (AgentEvals, promptfoo, the framework Story 1.26 learns); four skill-content stories carrying craft and worked examples; and four live proofs (the dogfood suite, two more target kinds, the gap loop, an unfamiliar framework). |
| Epic 2 | Large | Compare and CI subcommands with placement validation and three added deterministic checks, one step in `bmad-testarch-ci`, the skill's CI stage with repository inspection and two recorded fixture repositories, TeA's own wiring for every fixture evaluation, and documentation. |

The runtime is split by the AD-5 module table so each story moves or builds one concern and keeps `npm test` green at its end.
