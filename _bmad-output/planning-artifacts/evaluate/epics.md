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

This document breaks the Evaluate capability (`SPEC.md`, CAP-1 to CAP-12) into two epics and twenty-one stories, bound by the twenty architecture decisions in `ARCHITECTURE-SPINE.md` (cited as AD-n). `SPEC.md` stands in for the PRD: its capabilities are the functional requirements and its constraints are the non-functional requirements.

Every story lands as its own pull request against `main`, in the order written. A fresh coordinator session runs each story: a worker builds it, an independent reviewer session gives the final review, the coordinator merges it and hands the next story to a new coordinator. Story H.1 names the release, baseline and replay steps that close the plan; the coordinator of the story they follow runs them.

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

## Requirements Inventory

### Functional Requirements

FR1 (CAP-1): Identify the target kind (agent, skill, workflow, tool-use system, AI feature) and map it to the interface kind (`cli`, `api`, `mcp`) and adapter shape; ask when the description is ambiguous; a web application maps to `api`; no generated contract declares `web`.

FR2 (CAP-2): Capture the behavioral requirements and constraints inspection cannot infer, as a written statement the adopter confirms before corpus design.

FR3 (CAP-3): Design the probe corpus: at least one clean control (`zero-action`, `expectedClean: true`), one seeded-defect probe per behavior or that probe recorded as refused with its reason, a `zero-action` defect probe per mandatory-action behavior, a gameability probe per rubric- or judgment-governed behavior, plus the corpus layout and digest.

FR4 (CAP-4): Author the Behavioral Evaluation Contract and stamp its identity and lineage fields; `eval-quality compile` exits 0 and every behavior carries a non-null `observableSuccessCriterion`.

FR5 (CAP-5): One designated oracle per discharged behavior, and a compiling rubric wherever judgment needs an anchored scale.

FR6 (CAP-6): Scaffold the runner command, MCP wiring or HTTP port, registered in an execution-target registry; `preflight` reduces a real observation with no `interface-not-authorized` or `executable-not-authorized` denial.

FR7 (CAP-7): Apply and roll back each controlled mutation with baseline-pass and mutated-fail evidence, `rollbackVerified: true` backed by a performed rollback, `historical` probes with fail-before and pass-after evidence, refused probes with a reason, and every admitted manifestation witness resolving at preflight.

FR8 (CAP-8): Generate the scoring policy, evaluator configuration and isolation manifest, valid against eval-quality's schemas, with every threshold set by the adopter.

FR9 (CAP-9): Run clean and mutated arms, seal the run records and drive compile, seal, preflight and score end to end: clean arm `passed-clean-control`, seeded probe `caught`.

FR10 (CAP-10): For a CONCERNS, FAIL or Invalid result, name the unsatisfied rule, failed preflight check or missing evidence and propose the probe, control or oracle that closes it.

FR11 (CAP-11): Wire continuous proof into the adopter's CI with tiers and a per-check enforcement class, keeping target failure, evaluation weakness, repository-policy violation and infrastructure failure apart; deterministic checks run on every pull request.

FR12 (CAP-12): A completed CI run leaves a retrievable evidence bundle and a recorded baseline for comparison.

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

### Additional Requirements

- One skill, `bmad-testarch-evaluate`, menu code `EV`, with its full registration set (AD-2), in the lean builder shape (AD-3).
- A shipped runtime bin, `tea-evaluate`, over `cli/lib/evaluate/`, with seven subcommands, generalized from TeA's test harness, which is re-pointed at it (AD-5).
- The eval-quality CLI decides every enforced verdict; the library only plans and drives preflight legs (AD-6).
- One run-record shape with `invocationId`, `runId`, `trialIndex`, `conditionArm`, infrastructure exit codes and a per-trial-set isolation manifest (AD-7).
- Mutation only in a disposable copy with proved rollback (AD-8); corpus layout, `corpus-index.json` digest and authored-versus-runtime fields (AD-9).
- CI tiers `pr`, `merge`, `scheduled`, `release` and the AD-10 enforcement table; one pipeline owner, `bmad-testarch-ci` (AD-11); evidence bundle and baseline (AD-12).
- TeA's generators coexist with Evaluate-authored evaluations (AD-14).
- Proof target: Evaluate authors the suite for `bmad-testarch-evaluate` itself, plus `api` and `mcp` loopback fixtures (AD-15); operational envelope (AD-20).
- Cross-repository: eval-quality exports its HTTP target-policy evaluation before the `api` story (AD-4).

### UX Design Requirements

None. Evaluate has no graphical interface.

### FR Coverage Map

| Requirement | Stories |
| --- | --- |
| FR1 (CAP-1) | 1.3, 1.12, 1.13 |
| FR2 (CAP-2) | 1.12 |
| FR3 (CAP-3) | 1.4, 1.12, 1.16 |
| FR4 (CAP-4) | 1.4, 1.13, 1.16 |
| FR5 (CAP-5) | 1.9, 1.13 |
| FR6 (CAP-6) | 1.1, 1.5, 1.6, 1.10, 1.11, 1.13 |
| FR7 (CAP-7) | 1.7, 1.9, 1.14, 1.16 |
| FR8 (CAP-8) | 1.8, 1.14 |
| FR9 (CAP-9) | 1.6, 1.8, 1.14, 1.16 |
| FR10 (CAP-10) | 1.14, 1.16 |
| FR11 (CAP-11) | 2.2, 2.3, 2.4, 2.5, H.1 |
| FR12 (CAP-12) | 1.8, 2.1, 2.5, H.1 |

## Epic List

### Epic 1: The Evaluate authoring loop

An adopter describes a target, answers Evaluate's questions and gets a compiling, preflighted, scored Behavioral Evaluation Contract whose clean arm passes and whose mutated arm catches the seeded defect, with the gaps named. The epic closes by running Evaluate on `bmad-testarch-evaluate` itself.

**FRs covered:** FR1 to FR10.

### Epic 2: Continuous proof in CI

The evaluation Epic 1 produces runs in the adopter's CI on every pull request, with tiers, enforcement classes and a published evidence bundle. The epic closes by running the `pr` tier for TeA's own Evaluate-authored suite and both fixture adopters.

**FRs covered:** FR11, FR12.

## Epic Dependencies

Story 1.1 runs first, in the eval-quality repository. Story 1.2 raises TeA's `eval-quality` devDependency to the published release carrying it, and every later TeA story runs on that release. Epic 1's stories run in order. Epic 2 depends on Epic 1's runtime and on the evaluation Story 1.16 authors. Story H.1 is the owner's and runs after the owner commits the staged work and eval-quality releases.

| Story | Depends on |
| --- | --- |
| 1.1 | none |
| 1.2 | 1.1 |
| 1.3 | 1.2 |
| 1.4 | 1.3 |
| 1.5 | 1.4 |
| 1.6 | 1.5 |
| 1.7 | 1.6 |
| 1.8 | 1.7 |
| 1.9 | 1.8 |
| 1.10 | 1.8 |
| 1.11 | 1.1, 1.8 |
| 1.12 | 1.4 |
| 1.13 | 1.10, 1.11, 1.12 |
| 1.14 | 1.9, 1.13 |
| 1.15 | 1.14 |
| 1.16 | 1.15 |
| 2.1 | 1.16 |
| 2.2 | 2.1 |
| 2.3 | 2.2 |
| 2.4 | 2.3 |
| 2.5 | 2.4 |
| H.1 | 2.5, an eval-quality release carrying Story 1.1 and #143 |

## Epic 1: The Evaluate authoring loop

An adopter gets a running, scored evaluation of their own target without hand-building the runner, the adapter or the corpus.

**FRs covered:** FR1 to FR10.

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
**And** `git diff -- package.json package-lock.json` shows only the version bump, with no `file:` or `.tgz` spec

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

**Given** no skill exists at `src/workflows/testarch/bmad-testarch-evaluate/`
**When** `/bmad-workflow-builder` Build runs headless on that path
**Then** the skill has `SKILL.md`, `customize.toml`, `references/` and `assets/`, and no `workflow.yaml`, `steps-c/`, `steps-e/`, `steps-v/`, `instructions.md`, `checklist.md` or `scripts/` (AD-3)
**And** the skill keeps TEA's activation contract: `SKILL.md` holds the `resolve_customization.py` call, `{workflow.persistent_facts}` and `_bmad/tea/config.yaml`; `customize.toml` holds `persistent_facts = []` and `on_complete`
**And** a new `test/test-evaluate-guidance.js`, chained into `npm test` as `test:evaluate-guidance` with its own `quality.yaml` step, parses the stage list in `SKILL.md` and asserts eleven stages, each naming an existing `references/<stage>.md` (placeholder files until later stories fill them); Stories 1.12 to 1.14 and 2.4 extend it
**And** `SKILL.md` lists the stages the later stories fill (inspection, intake, corpus, contract, oracles, adapters, mutation, harness, run, gaps, ci), each pointing at its `references/` file

**Given** the registration set in AD-2
**When** it lands in this story
**Then** `src/module-help.csv` has an `Evaluate` row with menu code `EV`, phase `4-implementation`, followed-by `bmad-testarch-ci` and output-location `test_artifacts`
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
**Then** `package.json` registers the `tea-evaluate` bin, declares `peerDependencies: {"eval-quality": ">=3.4.0"}` with `peerDependenciesMeta` marking it optional (npm 7 and later install required peers automatically, which would pull the engine into every project that installs TeA for other workflows), an npm-valid floor Story H.1 raises to `>=<EQ_RELEASE>` (a literal placeholder breaks `npm install`), and `test:release-metadata` and `test:guard-publish` cover both
**And** `cli/lib/evaluate` is CommonJS and reaches eval-quality through one async loader generalized from `loadEvalQuality`, and the `dependency-direction` section of `eval-quality.config.json` gives the `cli` layer an `allow` externals list naming every external `cli/` uses (`eval-quality`, `commander`, `js-yaml`, `ajv` and each `node:` builtin), so removing one listed module while `cli/` imports it fails `test:direction` (AD-5)
**And** every module the shipped runtime needs is reachable from TeA's published `dependencies`: `ajv` moves from `devDependencies` to `dependencies`, and a packed-install case in `test:evaluate-check` runs `npm pack`, installs the tarball into a temp folder with `--omit=dev` beside the local engine, and runs `tea-evaluate check --evaluation <fixture>` to exit 0; moving `ajv` back to `devDependencies` fails it
**And** every subcommand takes `--evaluation <path>` and exits 64 when none resolves; the runtime reads no `_bmad/` config

**Given** the runtime owns the JSON schema of `evaluation.json` (`targetKind`, interface kind, registry, launch, workspace (`git` or `copy`, AD-8), arms, trials, tiers, strength floor per probe class, `schemaVersion`)
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
**And** it writes one `IsolationManifest` per trial set from what it actually granted, one `EvaluatorConfiguration` per run carrying the seal's `sealedBriefDigest`, and `run.json` with TeA and eval-quality versions, contract and corpus digests, runner and model identity, trial count, duration, commit and `dirty`
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

**Engine consumption.** This story needs the export from Story 1.1, which no published eval-quality carries. It uses the `--no-save` install from Story 1.2: first the engine check, and when Story 1.1's worktree changed after packing, a re-pack and re-install. At the end `package.json` and `package-lock.json` carry no tarball reference (`git diff`), and the TeA devDependency spec is unchanged. Story H.1 restores the registry install once the release ships.

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

### Story 1.12: Inspect the target, capture requirements and design the corpus

As an adopter,
I want Evaluate to classify my target, ask what it cannot infer and design the corpus,
So that I confirm what is measured before any contract is written (CAP-1, CAP-2, CAP-3).

**Acceptance Criteria:**

**Given** the skill stages from Story 1.3
**When** `/bmad-workflow-builder` Edit writes `references/inspection.md`, `references/intake.md`, `references/corpus.md` and the `assets/evaluation.json` template
**Then** inspection maps the five target kinds to interface kind and adapter exactly as AD-4's table does, maps any web application to `api`, asks a clarifying question when the kind is ambiguous, and records target kind only in `evaluation.json`
**And** intake writes a requirements statement to `{test_artifacts}/evaluate/<evaluationId>/` and halts for the adopter's confirmation before corpus design
**And** corpus design produces the probe set CAP-3 requires, lays it out as AD-9 states, and runs `tea-evaluate digest`

**Given** the guidance test `test/test-evaluate-guidance.js` from Story 1.3
**When** it runs
**Then** it asserts inspection names all five target kinds and never emits `web`, intake contains the confirmation halt, corpus names each CAP-3 probe rule, and the `evaluation.json` template validates against the runtime schema
**And** deleting any of those passages fails the test

**Dependencies:** 1.4.
**Gate:** skill gates (no registration change), `npm test`.

### Story 1.13: Author the contract, oracles, rubrics and adapter wiring

As an adopter,
I want Evaluate to write a contract that compiles and wire the adapter my target needs,
So that `eval-quality compile` exits 0 and preflight reaches the target (CAP-4, CAP-5, CAP-6).

**Acceptance Criteria:**

**Given** the corpus from Story 1.12
**When** `/bmad-workflow-builder` Edit writes `references/contract.md`, `references/oracles.md`, `references/adapters.md` and the contract skeleton asset
**Then** the contract guide covers the sixteen authored fields and the five identity and lineage fields, all seven `forbiddenInputs` floor members, and a non-null `observableSuccessCriterion` per behavior
**And** the oracle guide requires one oracle per discharged behavior and a rubric only where judgment needs an anchored scale
**And** the adapter guide covers the skill runner, an agent's own command, MCP and the HTTP port template
**And** the skill stage runs `tea-evaluate check` then `eval-quality compile` and halts on a non-zero exit with the failure code

**Given** the guidance test
**When** it runs
**Then** it substitutes every placeholder in the contract skeleton with the value of the same key in `test/fixtures/evaluate/contract-fill.json`, asserts the result compiles with exit 0, fails when a skeleton placeholder has no fill value, and asserts that the guides name each item above
**And** removing `forbiddenInputs` from the skeleton fails it

**Dependencies:** 1.10, 1.11, 1.12.
**Gate:** skill gates (no registration change), `npm test`.

### Story 1.14: Drive the run and interpret the gaps

As an adopter,
I want Evaluate to plan mutations, set the policy, run the arms and tell me what is weak,
So that a CONCERNS, FAIL or Invalid result ends in a named missing piece (CAP-7 to CAP-10).

**Acceptance Criteria:**

**Given** a compiling contract
**When** `/bmad-workflow-builder` Edit writes `references/mutation.md`, `references/harness.md`, `references/run.md` and `references/gaps.md`
**Then** mutation planning writes `mutations/M-NNN.mutation.json` files and plans signatures per AD-19
**And** harness asks the adopter for `severityFloor`, `minimumTrialCount` and `catchThreshold` and fills no default
**And** run invokes `tea-evaluate preflight`, `run` and `score` through `npm exec --prefix {tea_evaluations_folder}` after writing the AD-20 private `package.json` with `eval-quality` and TeA's package at the `latest` spec and running `npm install --prefix {tea_evaluations_folder}`; when `{project-root}` is TeA's own package it invokes `node cli/evaluate.js`
**And** gaps reads the evidence artifact, or for a `score` exit 3 with no artifact the persisted `score` diagnostics, and maps every outcome state, every AD-10 exit and class, every preflight check and every coverage rule to the probe, control, oracle or evidence that closes it

**Given** the guidance test
**When** it runs
**Then** it asserts `gaps.md` names every outcome state and discipline rule from the installed package's `OUTCOME_STATES` and `DISCIPLINE_RULES` exports, every preflight check from `eval-quality/schemas/preflight-verdict.schema.json`, and each AD-10 exit, and that it names the persisted `score` diagnostics as the source for a `score` exit 3
**And** removing one mapping fails it

**Dependencies:** 1.9, 1.13.
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
**And** after the lockfile update the tarball is re-installed, the engine check exits 0 and `git diff -- package.json package-lock.json` shows no tarball reference

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

**Given** the skill as Stories 1.3 to 1.14 left it, and a gitignored `_bmad/tea/config.yaml` the worker writes (TEA is not installed into its own repository) with `tea_evaluations_folder: test/evaluations` and `test_artifacts`, the skill invoked by path from `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md`, and the runner-driven arms getting TEA config the way the existing runners do (`cli/lib/resolve-tea-config.js`), all recorded in `epic-1-proof.md`
**When** a maintainer session runs `EV` on `bmad-testarch-evaluate`, answering intake from `SPEC.md`, with live legs through the local Claude Code CLI
**Then** `.prettierignore` lists `test/evaluations/**`, so canonical JSON bytes that `corpus-index.json` digests are never reformatted
**And** `test/evaluations/bmad-testarch-evaluate/` holds `evaluation.json`, `contract.json`, probes, at least one mutation of a file under the skill root, `corpus-index.json` and `policy/`
**And** the behavior the seeded probe discharges is observable on the skill runner's stdout or exit code (AD-19), and its mutation edits the single place in `references/` that defines that output (a behavior restated in several guides can survive a one-file mutation); a behavior visible only in a file the skill writes cannot carry a defect signature
**And** before the recorded run the worker confirms once, on the disposable copy, that the mutation manifests
**And** `tea-evaluate check` exits 0 and `eval-quality compile` exits 0
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

## Epic 2: Continuous proof in CI

The evaluation Epic 1 produced is proven on every pull request, with the evidence to audit it.

**FRs covered:** FR11, FR12.

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

**Dependencies:** 1.16.
**Gate:** `npm test`.

### Story 2.2: Plan CI tiers and run them with `tea-evaluate ci`

As an adopter,
I want one platform-neutral plan that says what runs when and what blocks,
So that the pipeline enforces eval-quality's verdicts without a second taxonomy (CAP-11, AD-10).

**Acceptance Criteria:**

**Given** the runtime owns the schema of `ci/evaluation-ci-plan.json` (per check: tier, trigger, kind `evaluate` with a `tea-evaluate` command or kind `gate` with an `eval-quality-gates` command, enforcement class, evidence paths)
**When** `tea-evaluate ci --tier <tier>` runs
**Then** it runs exactly the plan's checks for that tier: `pr` runs `check`, `compile`, `seal`, API port conformance and the replay of committed baseline observations and records through `preflight` and `score`, which must reproduce the committed evidence; `merge`, `scheduled` and `release` follow AD-10
**And** it passes stage exits through verbatim, never passes `--strict`, and reads CONCERNS from the evidence artifact as warn
**And** it applies the strength floor per probe class (warn on `scheduled`, block on `release`) and the stale-baseline rule (warn on `pr`, block on `release`)
**And** it claims none of `evidence-over-truncated`, `evidence-unavailable` or `evidence-internally-inconsistent`
**And** it persists each check's exit code, stdout and stderr under `runs/<invocationId>/`, so a `gate` check the adopter's plan adopts leaves its output in the evidence bundle (AD-12); a `test:evaluate-ci` case runs a stub `gate` check that prints distinct known bytes to each stream and exits 1, asserts byte equality per stream and the recorded code, and fails when the capture is dropped

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
So that no evaluation ends locally working and unenforced (CAP-11).

**Acceptance Criteria:**

**Given** the Evaluate skill
**When** `/bmad-workflow-builder` Edit writes `references/ci.md` and the `ci/evaluation-ci-plan.json` template
**Then** the stage writes the plan, sets live tiers for skill and agent targets to `scheduled`, `release` and manual dispatch only, declares the runner's credential keys as `permittedEnvironmentKeys`, and invokes `bmad-testarch-ci` in edit mode
**And** `eval-quality-gates` is offered as opt-in, adds only sections for gates the adopter adopts, never rewrites an existing section, and adds each adopted gate to the plan as a `gate` check
**And** the guidance test asserts each of these, and the plan template validates against the runtime schema

**Dependencies:** 2.3.
**Gate:** skill gates (no registration change), `npm test`.

### Story 2.5: TeA runs its `pr` tier and documents Evaluate

As a TEA maintainer,
I want TeA's own pull requests to run the `pr` tier for the Evaluate-authored suite and both fixture adopters,
So that Evaluate is continuously proven where it is built, and users can read how to use it.

**Acceptance Criteria:**

**Given** the evaluations from Stories 1.10, 1.11 and 1.16
**When** the worker wires TeA directly (AD-11: TeA's checks are `npm test` chain scripts with `validate` steps, and the CI-skill rendering is proved on the fixture adopters in Story 2.3)
**Then** each fixture evaluation's `pr` checks, and the `check`, `compile` and `seal` checks of `bmad-testarch-evaluate`, join the `npm test` chain as scripts, each with its own step in the `validate` job of `.github/workflows/quality.yaml`, and `npm run test:ci-coverage` passes
**And** the `validate` job uploads each `runs/<invocationId>/` as a build artifact with `if: always()`, and a `test:evaluate-ci` case parses `quality.yaml` and fails when that upload step or its path is missing
**And** the eight `eval-quality-gates` stay in their current `quality.yaml` jobs, unchanged, which the same test asserts

**Given** no committed baseline exists overnight for `bmad-testarch-evaluate`
**When** the overnight evidence is recorded
**Then** `tea-evaluate ci --tier pr` exits 0 for both fixture adopters, whose baselines were accepted through `compare --accept` from clean copy-target runs (AD-8: a fixture target's `evaluation.json` declares a copy workspace, so its run records `dirty: false`)
**And** for `bmad-testarch-evaluate` the non-replay `pr` checks (`check`, `compile`, `seal`) exit 0, and the replay step is recorded as pending Story H.1 with the dirty proof run's evidence artifact, verdicts and rollback proof cited from `epic-1-proof.md`
**And** the result is recorded at `_bmad-output/implementation-artifacts/evaluate/epic-2-proof.md`

**Given** `docs/explanation/how-tea-is-tested.md` names Evaluate as proposed future work
**When** the documentation lands
**Then** a how-to page for Evaluate is added and linked from the TEA overview and the site navigation, `how-tea-is-tested.md` and `eval-quality-adoption-guide.md` describe Evaluate as shipped, and the page documents TeA's 0/1/2 harness convention as an optional pattern
**And** `npm run docs:validate-links`, `npm run docs:build`, `test:doc-counts` and `test:doc-claims` pass

**Dependencies:** 2.4.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, `npm run test:release-metadata`.

## Owner Hand-off

### Story H.1: Release the engine, accept the baseline, turn the `pr` replay green

Run by the coordinator of Story 2.5 once it merges. The eval-quality release in step 1 happens earlier, right after Story 1.1 merges; the remaining steps still apply. No `/bmad-build` worker runs this story.

As the owner,
I want the dirty overnight proof replaced by a committed, released one,
So that the `pr` replay has a baseline to reproduce and TeA runs on a published engine.

**Checks red until eval-quality releases:** derived mechanically at the end of Story 2.5: the worker runs `npm ci` (published 3.4.0), then `npm test`, records every failing script in `epic-2-proof.md`, and re-installs the tarball. Expected members include the engine check, `test:trial-set-scoring`, `test:evaluate-guidance`, `test:evaluate-run`, `test:evaluate-arms`, `test:evaluate-mcp`, `test:evaluate-api`, `test:evaluate-compare`, `test:evaluate-ci` and the Evaluate `pr` steps. The next eval-quality release is the minor after 3.4.0 or a major if the owner treats #143's `EvidenceArtifact` version 4 as a major change; call it `<EQ_RELEASE>`.

**Steps, each with what it proves:**

1. In the eval-quality worktree, review and commit Story 1.1, merge it, then `npm run release:minor` (or `release:major`). Proves the export and trial-set scoring are published and `npm view eval-quality version` shows `<EQ_RELEASE>`.
2. In TeA, raise the `peerDependencies` floor from `>=3.4.0` to `>=<EQ_RELEASE>`, the released version, then `npm update eval-quality` (keeps the `latest` spec; `npm install eval-quality@latest` would rewrite it to a caret range) and `npm ci`. Proves the registry install replaces the tarball; the engine check exits 0 on the published package.
3. `npm test`. Proves every check listed above is green on the published engine.
4. Commit the staged TeA work. Then `node cli/evaluate.js run --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json` and `score` on the committed tree, with live legs through the local Claude Code CLI. Proves a clean (`dirty: false`) run: preflight passed, `passed-clean-control`, `caught` at `minimumTrialCount`, rollback proved.
5. `node cli/evaluate.js compare --accept --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json` in a branch, and open the pull request. Add the `bmad-testarch-evaluate` replay as an `npm test` script with its own `validate` step in `quality.yaml` in the same pull request. Proves the baseline enters `baseline/` only through a reviewed pull request (AD-12).
6. `node cli/evaluate.js ci --tier pr --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json`, locally and in the pull request's `quality.yaml` run. Proves the `pr` replay reproduces the committed evidence, closing AD-15's last condition.

**Dependencies:** 2.5 and the eval-quality release.

## Traceability

| Capability | Stories | Proven by |
| --- | --- | --- |
| CAP-1 | 1.3, 1.12, 1.13 | guidance test; 1.10, 1.11 and 1.16 contracts declare `mcp`, `api`, `cli` |
| CAP-2 | 1.12 | guidance test (confirmation halt); 1.16 intake statement |
| CAP-3 | 1.4, 1.12, 1.16 | `test:evaluate-check`; 1.16 corpus |
| CAP-4 | 1.4, 1.13, 1.16 | skeleton compile test; 1.16 compile exit 0 |
| CAP-5 | 1.9, 1.13 | `test:evaluate-arms`; guidance test |
| CAP-6 | 1.1, 1.5, 1.6, 1.10, 1.11, 1.13 | `test:evaluate-preflight`, `-mcp`, `-api` |
| CAP-7 | 1.7, 1.9, 1.14, 1.16 | `test:evaluate-mutation`; 1.16 rollback evidence |
| CAP-8 | 1.8, 1.14 | template schema validation; guidance test |
| CAP-9 | 1.6, 1.8, 1.14, 1.16 | `test:evaluate-run`; 1.16 live verdicts |
| CAP-10 | 1.14, 1.16 | guidance test over exported vocabularies; 1.16 gap report |
| CAP-11 | 2.2, 2.3, 2.4, 2.5, H.1 | `test:evaluate-ci`; rendering test; `quality.yaml` steps; H.1 step 6 |
| CAP-12 | 1.8, 2.1, 2.5, H.1 | `run.json`; `test:evaluate-compare`; H.1 step 5 |

## Epic Sizing

| Epic | Size | What drives it |
| --- | --- | --- |
| Epic 1 | Large | One upstream export, a runtime generalized from existing harness code in six moves, two fixture targets, three skill-content stories and a live proof. |
| Epic 2 | Medium | Compare and CI subcommands, one step in `bmad-testarch-ci`, the skill's CI stage, TeA's own wiring and documentation. |

The runtime is split by the AD-5 module table so each story moves or builds one concern and keeps `npm test` green at its end.
