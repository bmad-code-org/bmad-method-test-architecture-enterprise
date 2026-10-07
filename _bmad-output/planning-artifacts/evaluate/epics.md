---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
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

This document breaks the Evaluate capability (`SPEC.md`, CAP-1 to CAP-14) into two epics and 130 stories, including H.1 (97 stories were appended to Epic 1 from findings made while building it: 1.27 to 1.79, 1.80 to 1.89, 1.90 to 1.116, 1.120, 1.121, 1.122, 1.123, 1.130, 1.131, 1.132), bound by the twenty-three architecture decisions in `ARCHITECTURE-SPINE.md` (cited as AD-n). `SPEC.md` stands in for the PRD: its capabilities are the functional requirements and its constraints are the non-functional requirements.

Amended 2026-10-06 in Story 1.95's build: the overview counts every `### Story` section, H.1 included, and had said 129 while the file held 130 (Story 2.6's section was the one left out).
The count, the appended-story list and the five lane lists are now held to the file by `test:doc-counts`, so a story section added or removed, or a lane list that differs between this file and `sprint-status.yaml`, fails the gate.

Evaluate is fully stacked. The stack runs system under test, then the evaluation (the mechanism that runs the system, collects evidence and makes judgments), then the Behavioral Evaluation Contract (what behavior matters, what evidence counts, how success and failure resolve), then eval-quality (contract sanity, evidence support, and whether the evaluation catches defects). TeA owns every layer above eval-quality, including each concern eval-quality states it leaves to the caller, so an adopter can evaluate any target end to end. The 2026-09-23 amendment added Stories 1.17 to 1.26 and extended Stories 1.3 onward, Epic 2 and H.1 to close the plan gap audit; the Traceability section maps each audit item to the story that closes it.

Every story lands as its own pull request against `main`, in the order written. Stories keep their numbers: the ten stories added by the amendment carry the next free numbers and sit in this document at their execution position, which the Epic Dependencies table also gives. A fresh coordinator session runs each story: a worker builds it, an independent reviewer session gives the final review, the coordinator merges it and hands the next story to a new coordinator. Story H.1 names the release, baseline and replay steps that close the plan; the owner coordinator runs them after every lane drains.

## Build Rules For Every Story

These apply to every story and are not repeated in each one.

- **Worktree.** TeA stories run in the TeA build worktree the coordinator assigns. Paths are repository-relative. Story 1.1 runs in the eval-quality worktree it names.
- **One pull request per story.** A story branches from `main` (`feat/evaluate-<story-id>`), opens a pull request with a conventional title, and is done when CI is green, every CodeRabbit finding is fixed or answered with a reason and its thread resolved, and the final reviewer has passed it. The coordinator merges it.
- **Engine.** Story 1.1 is merged and released in eval-quality before any TeA story merges, so TeA runs on the published release that carries the target-policy export and trial-set scoring (eval-quality #143). Story 1.2 raises TeA's `eval-quality` devDependency to that release; no story installs a local tarball once the release exists. The engine check, run at the start and end of every TeA story, is:

  ```sh
  node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"
  ```

  `package.json` and `package-lock.json` never reference the tarball; `git diff -- package.json package-lock.json` shows no `file:` or `.tgz` spec at the end of any story.

- **Skill gates (AD-16, AD-17, AD-18).** A story that authors or edits `src/workflows/testarch/bmad-testarch-evaluate/` does it through `/bmad-workflow-builder` Build or Edit, run headless on that explicit path. The builder never commits and never edits outside the skill directory. In a Codex runtime without a callable builder skill, follow the installed builder's Edit process directly, run its prepasses and scanners plus independent Analyze lenses, and record the exact procedure and exception in the story outcome; do not claim an official builder invocation. After implement and before review, in order: builder Analyze or its documented Codex equivalent with zero critical and zero high findings (a finding that contradicts a repository test is skipped, with the reason recorded in the story's completion notes); `/bmad-module-builder` Validate Module on the AD-17 staged layout with zero new critical or high findings against the same staged run on main, when `src/module.yaml`, `src/module-help.csv`, `src/agents/bmad-tea/customize.toml` or `.claude-plugin/marketplace.json` changed; then `npm test`.
- **`bmad-testarch-ci` edits (AD-11).** Authored directly, in the house shape. Gated by its house tests, `node tools/generate-contracts.js --check` for `ci.contract.json`, and its existing suite's replay. Builder Analyze does not apply.
- **Gate commands (AGENTS.md).** Every TeA story ends with `npm test` green, which chains `lint`, `lint:md` and `format:check`. A story that changes `package.json`, a workflow or release behavior also runs `npm run test:release-metadata`. A story that changes `docs/` also runs `npm run docs:validate-links` and `npm run docs:build`. Every new npm script joins the `npm test` chain in the same story; the `chain` matrix of `.github/workflows/quality.yaml` runs that chain in shards, and `npm run test:ci-coverage` and `npm run test:shards` hold every chained script to it (amended 2026-09-25 in Story 1.9, which replaced the one-step-per-script `validate` job with the sharded `chain` job).
- **Changelog.** Every story adds its entry under `## [Unreleased]` in `CHANGELOG.md`.
- **Live runs.** Live evaluation runs execute through the local Claude Code CLI on the owner's subscription. They need no API key and no spending approval.
- **Reverting a story.** Each acceptance criterion names a check that fails when the story's work is reverted. A check that would still pass after a revert is not an acceptance check. The worker exercises each revert check once (undo the change locally, observe the named failure, restore) and records the observation in the story's completion notes.
- **Test plan.** `test-design-epic-1.md` and `test-design-epic-2.md` in this folder give each story's test levels, test files and per-criterion revert checks. A story's tests follow them.
- **Craft is a deliverable.** A story that writes a stage guide under `references/` teaches the craft of its stage with worked examples, and its guidance test asserts each named section by an exact heading and fails when one is removed. Worked examples that are contract, oracle, rubric, mutation or plan fragments are fenced JSON blocks tagged with an HTML comment (`<!-- example:<kind> -->`); the guidance test extracts every tagged block and validates or compiles it through the same engine or runtime schema a real artifact meets, so an example that drifts from the engine fails the gate. Term presence alone never closes a craft criterion; Stories 1.24 to 1.26 prove the guidance behaviorally.
- **Framework neutrality.** `cli/` imports only the externals its layers' `allow` lists in the `dependency-direction` section of `eval-quality.config.json` name: `cli/lib/evaluate/engine.js` has its own exact `evaluate-engine` layer, the one `cli/` list naming `eval-quality` (amended 2026-09-25 in Story 1.11: the `evaluate-templates` layer over the Evaluate skill's `assets/` also names it, since those templates are adopter code rendered into an evaluation folder, so the rule holds for `cli/` alone), and every other `cli/` file is held to the `cli` layer's list (Stories 1.4 and 1.5), so an import of any evaluation framework fails `test:direction` whatever the framework is called (AD-21, NFR10). Framework-specific code lives only in an adopter's `evaluator/` folder, rendered from a skill template or written by the adopter. A secondary name scan in `test:evaluate-boundaries` also catches a framework named in a string or a dynamic path.
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

| Requirement   | Stories                                                          |
| ------------- | ---------------------------------------------------------------- |
| FR1 (CAP-1)   | 1.3, 1.12, 1.13, 1.24                                            |
| FR2 (CAP-2)   | 1.12, 1.24                                                       |
| FR3 (CAP-3)   | 1.4, 1.12, 1.16, 1.21, 1.24, 1.46, 1.56, 1.114                   |
| FR4 (CAP-4)   | 1.4, 1.13, 1.16, 1.24, 1.115                                     |
| FR5 (CAP-5)   | 1.9, 1.13, 1.21, 1.24                                            |
| FR6 (CAP-6)   | 1.1, 1.5, 1.6, 1.10, 1.11, 1.13, 1.18, 1.19                      |
| FR7 (CAP-7)   | 1.7, 1.9, 1.14, 1.16, 1.56                                       |
| FR8 (CAP-8)   | 1.8, 1.14                                                        |
| FR9 (CAP-9)   | 1.6, 1.8, 1.14, 1.16, 1.17, 1.45, 1.56, 1.112, 1.113, 1.116      |
| FR10 (CAP-10) | 1.14, 1.16, 1.22, 1.25, 1.42, 1.45, 1.46, 1.55, 1.104            |
| FR11 (CAP-11) | 2.2, 2.3, 2.4, 2.5, H.1                                          |
| FR12 (CAP-12) | 1.8, 2.1, 2.5, H.1                                               |
| FR13 (CAP-13) | 1.17, 1.19, 1.20, 1.23, 1.26, 1.43, 1.44                         |
| FR14 (CAP-14) | 1.21, 1.51, 1.105, 1.106, 1.107, 1.108, 1.109, 1.110, 1.111, 2.2 |

## Epic List

### Epic 1: The Evaluate authoring loop

An adopter describes a target, answers Evaluate's questions, chooses or builds the evaluation layer and gets a compiling, sealed, preflighted, scored Behavioral Evaluation Contract whose clean arm passes and whose mutated arm catches the seeded defect, with the gaps named and closed. The epic closes by running Evaluate on `bmad-testarch-evaluate` itself, then proving the guidance on two more target kinds, on seeded weaknesses and on an evaluation framework its guides never name.
Findings made while building it were appended as stories at the end of the epic: Stories 1.27 to 1.79, 1.80 to 1.89, 1.90 to 1.116, 1.120, 1.121, 1.122, 1.123, 1.130, 1.131, 1.132.

**FRs covered:** FR1 to FR10, FR13, FR14.

### Epic 2: Continuous proof in CI

The evaluation Epic 1 produces runs in the adopter's CI on every pull request, with tiers, enforcement classes and a published evidence bundle. The epic closes by running the `pr` tier for TeA's own Evaluate-authored suite and every fixture evaluation.

**FRs covered:** FR11, FR12, and the tier placement of FR14.

## Epic Dependencies

Story 1.1 runs first, in the eval-quality repository. Story 1.2 raises TeA's `eval-quality` devDependency to the published release carrying it, and every later TeA story runs on that release. Epic 1's stories run in the order this table lists them, which is the order they are written in. Epic 2 depends on Epic 1's runtime and on the evaluation Story 1.16 authors. Story H.1 is the owner's and runs after every lane drains, including the engine patch and TeA adoption in Story 1.104 and the partition follow-ups of Stories 1.105 to 1.111.

| Order | Story | Depends on                                                                                                                                                                                                       |
| ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 1.1   | none                                                                                                                                                                                                             |
| 2     | 1.2   | 1.1                                                                                                                                                                                                              |
| 3     | 1.3   | 1.2                                                                                                                                                                                                              |
| 4     | 1.4   | 1.3                                                                                                                                                                                                              |
| 5     | 1.5   | 1.4                                                                                                                                                                                                              |
| 6     | 1.6   | 1.5                                                                                                                                                                                                              |
| 7     | 1.7   | 1.6                                                                                                                                                                                                              |
| 8     | 1.8   | 1.7                                                                                                                                                                                                              |
| 9     | 1.9   | 1.8                                                                                                                                                                                                              |
| 10    | 1.17  | 1.9                                                                                                                                                                                                              |
| 11    | 1.10  | 1.8, 1.17                                                                                                                                                                                                        |
| 12    | 1.11  | 1.1, 1.8, 1.17                                                                                                                                                                                                   |
| 13    | 1.32  | 1.9, 1.11                                                                                                                                                                                                        |
| 14    | 1.18  | 1.8                                                                                                                                                                                                              |
| 15    | 1.19  | 1.17                                                                                                                                                                                                             |
| 16    | 1.20  | 1.17                                                                                                                                                                                                             |
| 17    | 1.21  | 1.17                                                                                                                                                                                                             |
| 18    | 1.22  | 1.17                                                                                                                                                                                                             |
| 19    | 1.12  | 1.4, 1.21                                                                                                                                                                                                        |
| 20    | 1.13  | 1.10, 1.11, 1.12, 1.18, 1.19                                                                                                                                                                                     |
| 21    | 1.23  | 1.13, 1.19, 1.20, 1.21                                                                                                                                                                                           |
| 22    | 1.14  | 1.9, 1.13, 1.22, 1.23                                                                                                                                                                                            |
| 23    | 1.15  | 1.14                                                                                                                                                                                                             |
| 24    | 1.16  | 1.15                                                                                                                                                                                                             |
| 25    | 1.24  | 1.16                                                                                                                                                                                                             |
| 26    | 1.25  | 1.24                                                                                                                                                                                                             |
| 27    | 1.26  | 1.23, 1.25                                                                                                                                                                                                       |
| 28    | 1.27  | 1.7                                                                                                                                                                                                              |
| 29    | 1.28  | 1.7                                                                                                                                                                                                              |
| 30    | 1.29  | 1.8                                                                                                                                                                                                              |
| 31    | 1.30  | 1.8                                                                                                                                                                                                              |
| 32    | 1.31  | 1.8, 1.17                                                                                                                                                                                                        |
| 33    | 1.33  | 1.10, 1.11, 1.17                                                                                                                                                                                                 |
| 34    | 1.34  | 1.17, 1.21                                                                                                                                                                                                       |
| 35    | 1.35  | 1.10                                                                                                                                                                                                             |
| 36    | 1.36  | 1.11                                                                                                                                                                                                             |
| 37    | 1.37  | 1.11                                                                                                                                                                                                             |
| 38    | 1.38  | 1.32                                                                                                                                                                                                             |
| 39    | 1.39  | 1.18                                                                                                                                                                                                             |
| 40    | 1.40  | 1.17, 1.21                                                                                                                                                                                                       |
| 41    | 1.41  | 1.8, 1.21                                                                                                                                                                                                        |
| 42    | 1.42  | 1.22                                                                                                                                                                                                             |
| 43    | 1.43  | 1.20, 1.23                                                                                                                                                                                                       |
| 44    | 1.44  | 1.17, 1.23                                                                                                                                                                                                       |
| 45    | 1.45  | 1.8, 1.14, 1.21                                                                                                                                                                                                  |
| 46    | 1.46  | 1.16                                                                                                                                                                                                             |
| 47    | 1.47  | 1.27                                                                                                                                                                                                             |
| 48    | 1.48  | 1.27                                                                                                                                                                                                             |
| 49    | 1.49  | 1.27                                                                                                                                                                                                             |
| 50    | 1.50  | 1.11, 1.24                                                                                                                                                                                                       |
| 51    | 1.51  | 1.21, 1.24                                                                                                                                                                                                       |
| 52    | 1.52  | 1.28                                                                                                                                                                                                             |
| 53    | 1.53  | 1.28                                                                                                                                                                                                             |
| 54    | 1.54  | 1.28                                                                                                                                                                                                             |
| 55    | 1.55  | 1.26                                                                                                                                                                                                             |
| 56    | 1.56  | 1.26, 1.55                                                                                                                                                                                                       |
| 57    | 1.57  | 1.31                                                                                                                                                                                                             |
| 58    | 1.58  | 1.31                                                                                                                                                                                                             |
| 59    | 1.59  | 1.31                                                                                                                                                                                                             |
| 60    | 1.60  | 1.31                                                                                                                                                                                                             |
| 61    | 1.61  | 1.31                                                                                                                                                                                                             |
| 62    | 1.62  | 1.31                                                                                                                                                                                                             |
| 63    | 1.63  | 1.31, 1.60                                                                                                                                                                                                       |
| 64    | 1.64  | 1.38, 1.65                                                                                                                                                                                                       |
| 65    | 1.65  | 1.38                                                                                                                                                                                                             |
| 66    | 1.66  | 1.11, 1.38                                                                                                                                                                                                       |
| 67    | 1.67  | 1.40                                                                                                                                                                                                             |
| 68    | 1.68  | 1.41                                                                                                                                                                                                             |
| 69    | 1.69  | 1.68                                                                                                                                                                                                             |
| 70    | 1.70  | 1.43                                                                                                                                                                                                             |
| 71    | 1.71  | 1.44                                                                                                                                                                                                             |
| 72    | 1.72  | 1.34, 1.44                                                                                                                                                                                                       |
| 73    | 1.73  | 1.44, 1.71                                                                                                                                                                                                       |
| 74    | 1.74  | 1.66                                                                                                                                                                                                             |
| 75    | 1.75  | 1.65                                                                                                                                                                                                             |
| 76    | 1.80  | 1.57                                                                                                                                                                                                             |
| 77    | 1.81  | 1.60                                                                                                                                                                                                             |
| 78    | 1.82  | 1.63                                                                                                                                                                                                             |
| 79    | 1.83  | 1.63                                                                                                                                                                                                             |
| 80    | 1.84  | 1.61, 1.83                                                                                                                                                                                                       |
| 81    | 1.85  | 1.80                                                                                                                                                                                                             |
| 82    | 1.86  | 1.60, 1.82                                                                                                                                                                                                       |
| 83    | 1.87  | 1.82                                                                                                                                                                                                             |
| 84    | 1.88  | 1.82                                                                                                                                                                                                             |
| 85    | 1.89  | 1.82                                                                                                                                                                                                             |
| 86    | 1.130 | none                                                                                                                                                                                                             |
| 87    | 1.131 | 1.54, 1.83                                                                                                                                                                                                       |
| 88    | 1.132 | 1.57, 1.80                                                                                                                                                                                                       |
| 89    | 1.90  | 2.1                                                                                                                                                                                                              |
| 90    | 1.91  | 2.1                                                                                                                                                                                                              |
| 91    | 1.92  | 2.2                                                                                                                                                                                                              |
| 92    | 1.93  | 2.3                                                                                                                                                                                                              |
| 93    | 1.94  | 2.3                                                                                                                                                                                                              |
| 94    | 1.95  | 2.3                                                                                                                                                                                                              |
| 95    | 1.96  | 2.4                                                                                                                                                                                                              |
| 96    | 1.97  | 2.3, 2.4                                                                                                                                                                                                         |
| 97    | 1.98  | 1.24, 2.4                                                                                                                                                                                                        |
| 98    | 1.99  | 1.49                                                                                                                                                                                                             |
| 99    | 1.100 | 1.48, 1.99                                                                                                                                                                                                       |
| 100   | 1.101 | 1.42                                                                                                                                                                                                             |
| 101   | 1.102 | 1.42                                                                                                                                                                                                             |
| 102   | 1.103 | 1.42                                                                                                                                                                                                             |
| 103   | 1.104 | 1.55                                                                                                                                                                                                             |
| 104   | 1.105 | 1.51, 1.9                                                                                                                                                                                                        |
| 105   | 1.106 | 1.51, 1.105                                                                                                                                                                                                      |
| 106   | 1.107 | 1.51, 1.20                                                                                                                                                                                                       |
| 107   | 1.108 | 1.51, 2.2                                                                                                                                                                                                        |
| 108   | 1.109 | 1.51, 1.14                                                                                                                                                                                                       |
| 109   | 1.110 | 1.51                                                                                                                                                                                                             |
| 110   | 1.111 | 1.51, 1.84                                                                                                                                                                                                       |
| 111   | 1.112 | 1.31                                                                                                                                                                                                             |
| 112   | 1.113 | 1.59, 1.46                                                                                                                                                                                                       |
| 113   | 1.114 | 1.51, 1.111                                                                                                                                                                                                      |
| 114   | 1.115 | 1.12                                                                                                                                                                                                             |
| 115   | 1.116 | 1.46                                                                                                                                                                                                             |
| 116   | 1.76  | 1.72                                                                                                                                                                                                             |
| 117   | 1.77  | 1.75                                                                                                                                                                                                             |
| 118   | 1.78  | 1.76                                                                                                                                                                                                             |
| 119   | 1.79  | 1.78                                                                                                                                                                                                             |
| 120   | 1.120 | 1.80                                                                                                                                                                                                             |
| 121   | 1.121 | 1.99                                                                                                                                                                                                             |
| 122   | 1.122 | 1.94                                                                                                                                                                                                             |
| 123   | 1.123 | 1.94                                                                                                                                                                                                             |
| 124   | 2.1   | 1.16, 1.26, 1.45                                                                                                                                                                                                 |
| 125   | 2.2   | 2.1                                                                                                                                                                                                              |
| 126   | 2.3   | 2.2                                                                                                                                                                                                              |
| 127   | 2.4   | 2.3                                                                                                                                                                                                              |
| 128   | 2.5   | 2.4                                                                                                                                                                                                              |
| 129   | 2.6   | every other Epic 1 and Epic 2 story                                                                                                                                                                              |
| 130   | H.1   | 2.6, 1.76, 1.77, 1.78, 1.79, 1.84, 1.85, 1.86, 1.87, 1.88, 1.89, 1.104, 1.105, 1.106, 1.107, 1.108, 1.109, 1.110, 1.111, 1.112, 1.113, 1.114, 1.115, 1.116, 1.130, 1.120, 1.121, 1.122, 1.123, 1.131, 1.132, 2.5 |

### Parallel lanes (from 2026-10-01)

The table above gives every story's dependencies. Since Story 1.40 merged, the stories not yet built run in five parallel lanes (three until 2026-10-04), each a serial relay: a story's coordinator hands off to the next story in its lane, and the lanes merge into `main` independently. A lane groups stories that share modules or a dependency chain, so two lanes rarely edit the same file. The lists below are the order since the five-lane split recorded under "Five lanes (2026-10-04)". Stories keep their numbers and rows above; the lane gives the order to run them in. `sprint-status.yaml` carries the same lists under `parallel_lanes`.

**Lane 1: run integrity, scoring and evaluators** (main checkout): 1.41, 1.68, 1.43, 1.44, 1.67, 1.66, 1.65, 1.64, 1.69, 1.70, 1.71, 1.72, 1.73, 1.74, 1.75, 1.76, 1.77, 1.78, 1.103, 1.99, 1.94, 1.100, 1.105, 1.106, 1.107, 1.79, 1.109, 1.110, 1.108. Story 1.68 reads the files 1.41 changes, so it follows directly. Story 1.65 turns the single release report into a per-interface report and 1.64 adds call sites that 1.65 would otherwise rewrite, so 1.66, 1.65, 1.64 run in that order. Story 1.44 rewrites the `evaluate-learn` fixture's evaluator, which lane 3's 1.55 and 1.56 own, so those two wait for it. Story 1.69 reuses the module Story 1.68 builds and edits `run.js`, which 1.64 and 1.65 also edit, so it runs after them. Story 1.70 edits the promptfoo starter, fixture evaluator and guide section that Story 1.43 writes and no file the other lane 1 stories edit, so it joins the end. Stories 1.71 to 1.73 were appended from Story 1.44's final review and sit last: 1.71 edits `command-evaluator.js`, `frameworks.js`, the starters and the evaluator guide that Story 1.44 writes, 1.72 edits `agent-adapters.js`, `evaluators.js`, `run.js` and `sealed-brief-agent.js` and so runs after the other `run.js` editors (1.64, 1.65, 1.69), and 1.73 extends the probe and declaration that 1.71 bounds, so it follows 1.71. Story 1.74 was appended from Story 1.66's build; it edits `arm.js`, which no other lane 1 story after 1.66 edits, and joins the end. Story 1.75 was appended from Story 1.65's round 1 review; it extends the report rules that 1.65 writes in `check.js` and `release-report.js`, so it needs only 1.65 and joins the end. Story 1.76 was appended from Story 1.72's review; it tightens the custom adapter's version response contract and follows the initial version binding. Story 1.77 was appended from Story 1.75's round 1 review; it widens the collision rule that 1.75 writes in `check.js`, so it needs only 1.75 and joins the end. Story 1.78 was appended from Story 1.76's round 1 verification review; it extends the custom-agent version tests that 1.76 writes and needs only 1.76, so it joins the end. Story 1.79 was appended from Story 1.78's round 1 review; it extends the case 1.78 writes and needs only 1.78; in the five-lane order it follows 1.107 and precedes 1.109, since all three share the evaluators tests.

**Lane 2: confinement and process lifecycle** (own worktree): 1.62, 1.57, 1.58, 1.59, 1.60, 1.63, 1.61, 1.52, 1.53, 1.54, 1.80, 1.81, 1.82, 1.83, 1.84, 1.85, 1.112, 1.113, 1.86, 1.87, 1.88, 1.89, 1.131. Story 1.62 goes first because it extracts the shared sandbox primitives the confinement stories build on. Story 1.60 may remove 1.63's premise, so 1.63 is re-read after it. Story 1.58 precedes 1.54, since both track the run's private scratch directories. Stories 1.52 to 1.54 touch the preflight and workspace modules the confinement stories also edit, so they run after them. Stories 1.82 and 1.83 follow 1.63, whose vector, bridge and `network` field they build on. Story 1.84 was appended from Story 1.61's build and follows 1.61, whose guides it extends; it joins the end, where its two live sessions can wait for the owner. Story 1.85 was appended from Story 1.80's build and follows 1.80, whose build it changes. Stories 1.112 and 1.113 come from Story 1.46's build and edit the workspace and confinement files lane 2 owns, so they follow 1.85; 1.113 also waits for Story 1.46's merge. Stories 1.86, 1.87, 1.88 and 1.89 were appended from Story 1.82's build and follow 1.82, whose mounts, launcher and reference sentences they extend; they join the end. Story 1.130 was appended from Story 1.82's merge, after a GitHub outage failed a shard in the actionlint install step; it touches the workflow files only, has no dependencies, and moved to lane 5 in the 2026-10-04 evening refill. Story 1.131 was appended from Story 1.83's build, which found that a run killed outright leaves the call's temp, port and bridge directories in the temp directory, and it follows 1.83, whose proxy directory sits beneath the private parent by the mount this story extends; it joins the end.

**Lane 3: engine releases, dogfood and Epic 2** (own worktree): 1.45, 2.1, 2.2, 2.3, 2.4, 1.47, 1.49, 1.48, 1.42, 1.50, 1.55, 1.56, 1.51, 1.46, 1.101, 1.102, 1.104, 1.98, 2.5, 1.90, 1.91, 1.92, 2.6 (starts only once every other story has merged). Story 1.45 starts the longest serial chain (1.45, 2.1 to 2.5), so it runs first, and 2.5 waits for every story that changes committed evidence bytes before it baselines the fixtures (1.42, 1.44, 1.50, 1.51, 1.55, 1.56). Stories 1.47, 1.49 and 1.48 regenerate the test-design probes, so they run together with 1.48 last. Stories 1.42 and 1.50 both change the HTTP probe port and run back to back. Story 1.46 records live runs of the Evaluate skill, so it follows the skill-guide stories in other lanes (1.43, 1.44, 1.61, 1.67, 1.70). Lane 3 owns every eval-quality release, because 1.42, 1.45, 1.50 and 1.55 each need a published engine and one publisher keeps the dependency pin and `package-lock.json` ordered. Stories 1.90 and 1.91 follow 2.5: 1.90 edits the baseline `check` and `compare` read, and 1.91 re-accepts the fixture baselines Stories 2.2 to 2.5 commit, so it waits for every one of them. Story 1.92 (`ci.js`) moved here from lane 1 in the 2026-10-04 evening refill (Lane 3 refill below) and follows 1.91. Stories 1.111, 1.114, 1.115 and 1.116, from Story 1.46's build, run in lane 5 (1.116 moved there in the 2026-10-04 evening refill, after lane 2's 1.113 merged), and 1.112 and 1.113 ran in lane 2.

**Rebalance (2026-10-03).** Lane 3 held about 25 stories against 2 and 4, so its tail moved, and the lists above are the order now. Story 1.103 goes first in lane 1's new tail so the mutants are proven before the partition stories edit `check.js`, `score.js`, `run.js`, `arm.js` and `calibration.js`. Stories 1.99, 1.94 and 1.100 all regenerate `tools/generate-probes.js`, `probe-scoring.js` and `expected-strength.json`, so they stay serial in lane 1 (1.100 after 1.99). Stories 1.105, 1.106 and 1.107 keep that order, and 1.109 and 1.110 follow (the partition cluster shares `test:evaluate-partition-plans`); a 1.110 that needs an engine change splits it and routes the engine part to lane 3. Lane 2 takes the `ci.js` stories 1.92 then 1.108 (1.92 later moved to lane 1, then to lane 3; see the lists above), and the `ci-plan.js` and `ci.md` stories 1.96, 1.93, then 1.97; 1.95 (replay totals, story count, lane lists) runs last and gates all five lane lists. Lane 3 runs the engine releases 1.101, 1.102 and 1.104 before 2.5 so the baselines are not re-accepted after each `evalQualityVersion` bump, then 1.98 (it repairs the AI-feature oracles 2.5 must baseline), 2.5, then 1.90 and 1.91 (they share `compare.js`), then 1.111 (it edits `SKILL.md` after 1.84), then the Story 1.46 follow-ups 1.114 and 1.115 (1.112 and 1.113 run in lane 2).

**Lane 4: CI plans and the ci probe corpus** (own worktree): 1.93, 1.96, 1.97, 1.121, 1.122, 1.123, 1.95. The ci probe corpus (`ground-truth.json`, `ci.contract.json`, `ci.probes.json`, the ci records in `expected-strength.json` and `test-probe-corpus.js`) is regenerated by 1.93, 1.97, 1.121, 1.122 and 1.123, so all five run here one after another. Story 1.97 follows 1.96, since both edit `ci-plan.js`. Story 1.96 starts after lane 3's 1.98 merges when it can, because both write `evals/answer-grade/` in the ci-repos fixtures, which is why the lane opens with 1.93. Story 1.95 gates the replay totals, the story count and the lane lists, so it runs last.

**Lane 5: withheld history, intake and the skill guide** (own worktree): 1.115, 1.132, 1.120, 1.116, 1.130, 1.111, 1.114. Story 1.132 rewrites the `pack` stage in `git-lines.js` whose race 1.120 hunts, so 1.120 follows it. Stories 1.96, 1.97 and 1.111 each force a live recapture of the same two ci-repos `capture-record.json` files, so 1.111 starts only after 1.96 and 1.97 have merged and lane 5 works 1.115, 1.132 and 1.120 first. Story 1.114 follows 1.111. The 2026-10-04 evening refill gave lane 5 two stories to run while 1.111 waits: 1.116 (moved from lane 3; its edge, 1.113, has merged; it edits the dogfood contract and the Evaluate suite's tests) and 1.130 (moved from lane 2; no dependencies), both ahead of 1.111.

**Five lanes (2026-10-04).** The owner allowed more lanes, and lanes 4 and 5 are new, each in its own worktree created detached at `origin/main`. This overrides the 2026-10-03 rebalance for every story not yet merged. Story 1.108 ends lane 1, since it follows 1.92 (`ci.js`) and 1.110's both view, and 1.79 follows 1.107 (shared evaluators tests). Lane 2 keeps the confinement and workflow stories and gives its ci stories to lane 4 and 1.132 to lane 5. Lane 3 keeps the engine releases, 2.5, 1.90, 1.91, 1.92 and 2.6; 1.116 followed lane 2's 1.113 (same dogfood evaluation and live runs) and moved to lane 5 in the evening refill. Plain overlaps that only need a rebase: `ci.js` (1.108 against 1.91 and 1.92), `check.js` (1.90 against 1.96), `test-evaluate-ci.js`, `test-evaluate-partition-plans.js`, `quality.yaml` (1.130 against 2.5), and committed baselines (each story re-accepts its own).

**Lane 3 refill (2026-10-04 evening).** Lane 3 would idle between 1.91 and 2.6, so 1.92 (`ci.js`, a plain rebase overlap with 1.91) moved from lane 1 to follow 1.91 and precede 2.6, which starts only once every other story has merged. Lane 1 keeps 1.109, 1.110 and 1.108, and 1.108 starts only after 1.92 and 1.110 have merged.

Rules the lanes share:

- Rebase only when GitHub reports the PR `DIRTY` or `BEHIND`; a `CLEAN` PR with green CI merges as it stands. In `CHANGELOG.md`, `sprint-status.yaml`, `epics.md`, `test-design-epic-1.md`, `docs/reference/tea-evaluate-cli.md`, the `package.json` test chain and `quality.yaml`, keep both sides, then rerun the suites the story touches.
- Every real defect a review, CodeRabbit or CI finds in or around a story is fixed in that story's pull request before it merges. No story is appended to `epics.md`, `test-design-epic-1.md` or `sprint-status.yaml` (the relay's `LANES.md` rule 15, which replaced the numbered lane ranges).
- A lane that needs an eval-quality change it does not own asks the coordinator, who routes it to lane 3's publisher.
- Story H.1 runs once every lane has drained.

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
**Then** `src/module-help.csv` has an `Evaluate` row with menu code `EV`, phase `4-implementation`, followed-by `bmad-testarch-ci` and output-location `tea_evaluations_folder` (AD-2, amended: the committed evaluation folder lives under `tea_evaluations_folder`; working drafts such as the Story 1.12 requirements statement go under `{test_artifacts}/evaluate/`)
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
**Then** `package.json` registers the `tea-evaluate` bin, declares `peerDependencies: {"eval-quality": ">=4.3.0"}` (4.0.0 is the first published release carrying trial-set scoring and the target-policy export Evaluate needs, 4.1.1 the first whose command-line adapter kills the target's process group at its ceiling, 4.1.2 the first that also kills it when the host dies, 4.1.3 the first whose `score` writes an Invalid result's reasons to stderr, 4.1.4 the first whose record schema defines an observation's `provenance` by its role, 4.2.0 the first whose command-line and MCP adapters carry the policy's `reason` on a denial, and 4.3.0 the first exporting `staysOnHost`, the on-host predicate `check` holds a credential sent over `http` to; amended by Story 1.6 from `>=4.0.0`, 2026-09-24 in Story 1.8 from `>=4.1.2` to `>=4.1.3`, then `>=4.1.4`, 2026-09-25 in Story 1.10 to `>=4.2.0`, and 2026-09-25 in Story 1.11 to `>=4.3.0`), with `peerDependenciesMeta` marking it optional (npm 7 and later install required peers automatically, which would pull the engine into every project that installs TeA for other workflows), and `test:release-metadata` and `test:guard-publish` cover both
**And** `cli/lib/evaluate` is CommonJS and reaches eval-quality through one async loader generalized from `loadEvalQuality`, and the `dependency-direction` section of `eval-quality.config.json` gives the `cli` layer an `allow` externals list naming every external `cli/` uses (`eval-quality`, `commander`, `js-yaml`, `ajv/dist/2020` and each `node:` builtin; the gate matches specifiers exactly and the runtime loads Ajv through its draft 2020-12 entry point, since eval-quality's schemas are draft 2020-12), so removing one listed module while `cli/` imports it fails `test:direction` (AD-5)
**And** every module the shipped runtime needs is reachable from TeA's published `dependencies`: `ajv` moves from `devDependencies` to `dependencies`, and a packed-install case in `test:evaluate-check` runs `npm pack`, installs the tarball into a temp folder with `--omit=dev` beside the local engine, and runs `tea-evaluate check --evaluation <fixture>` to exit 0; moving `ajv` back to `devDependencies` fails it
**And** every subcommand takes `--evaluation <path>` and exits 64 when none resolves; the runtime reads no `_bmad/` config

**Given** the runtime owns the JSON schema of `evaluation.json` (`targetKind` from AD-4's six kinds, interface kind, registry, launch, workspace (`git` or `copy`, AD-8), arms, trials, tiers, strength floor per probe class, `schemaVersion`; Stories 1.12, 1.17, 1.21 and 1.22 add the `requirements`, `evaluator`, `heldOutProbes`, `judgeCalibration` and `operationPhases` fields, each as an additive schema change with its own `check` cases)
**When** `tea-evaluate check --evaluation <path>` runs on a folder shaped as the Structural Seed
**Then** it exits 0 on a valid fixture folder under `test/fixtures/evaluate/`
**And** it exits 10 on each of these eleven: a stale `corpus-index.json`, an unknown `evaluation.json` `schemaVersion` (naming the installed TeA version and the schema versions it knows; amended 2026-09-23 because a runtime cannot name a release newer than itself), a committed probe carrying a runtime-owned field, a mutation file whose operator is not `replace-exact`, a `targetArtifact` inside a provisioned directory, a contract declaring kind `web`, a defect signature addressing a written file, a behavior discharged by a defect or gameability probe whose `oracles` count is not exactly 1, a probe, behavior, oracle or mutation ID off eval-quality's patterns, a `baseline/qualification/` reference whose digest does not match, and a clean control that is not `zero-action` with `expectedClean: true` (AD-9, AD-19). AD-14's one-authoring-path rule is TeA repository policy and is enforced by Story 1.15 in `tools/validate-eval-schemas.js`
**And** `tea-evaluate digest` writes `corpus-index.json` as sorted `{path, sha256}` over `corpus/`, `probes/` and `mutations/`, and prints `corpusDigest` computed by eval-quality's `digestArtifact` over that index
**And** a new `test/test-evaluate-check.js`, chained into `npm test` as `test:evaluate-check` with its own `quality.yaml` step, holds each case above
**And** a new `test/test-evaluate-boundaries.js`, chained as `test:evaluate-boundaries` with its own `quality.yaml` step, scans `cli/` and fails when: any file other than `cli/lib/evaluate/engine.js` names `eval-quality` in an `import(` or `require(` call, subpaths and synchronous requires included; any binding obtained from that module reaches the engine's `runScore`, `preflightFromObservations`, `compile` or `seal` (AD-1, AD-6: those stages run through the CLI); (amended 2026-10-01 in Story 1.68: `cli/lib/evaluate/score-inputs.js` alone may name `runScore`, to compare a staged artifact with an in-process score of the held bytes, and never to decide a verdict); the string `_bmad` appears under `cli/lib/evaluate/`. `engine.js` resolves the CLI path and honours `TEA_EVALUATE_ENGINE_CLI` so tests can substitute a shim. Later stories extend the test

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
**And** the `test/lib/` files keep only TeA data and TeA's own eval-result vocabulary (its commands as `RegistryEntry` data, its scoring-policy path, the mapping from a probe fault to TeA's failure classes, and its suite-result, run-summary and diagnostic records, which no adopter writes) and import the runtime modules (amended 2026-09-23 in Story 1.5: those records and failure classes belong to TeA's `test/schema/eval-result.js`, which the published package does not carry, so moving them would ship TeA's harness format to adopters)
**And** no file under `cli/` imports from `test/`, which `test:direction` (the `cli` layer may not import `test`), `test:evaluate-boundaries` (its `test-import` rule over every `require` and `import` target) and `test:boundary` (the `test-tree-reach` pattern for a relative climb or a self-referencing package path into `test/`) enforce (amended 2026-09-23 in Story 1.5 review: `test:boundary` alone scanned only for `test/` file names with an extension, so it never held this criterion; the pattern was added and the other two gates named)
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
**And** `check` asserts every mutation's `targetArtifact` sits under that skill root, held by a new case in `test/test-evaluate-check.js` (amended 2026-09-24 in Story 1.6: `evaluation.json`'s `launch` declares the skill root as `skillRoot`, required for a skill target, beside `root`, the evaluated project relative to the evaluation folder, since this story is the first to launch a target)

**Given** an evaluation folder with a `cli` interface
**When** `tea-evaluate preflight --evaluation <path>` runs
**Then** it runs `eval-quality compile` and `seal`, drives legs through `runPreflight` with a recording port over `createCommandLineAdapter` authorized from the registry, persists every observation under `runs/<invocationId>/`, and takes the verdict from `eval-quality preflight --observations --run-id` (AD-6)
**And** it passes eval-quality's exit code through verbatim
**And** with `TEA_EVALUATE_ENGINE_CLI` pointed at a shim that logs its argv, exits 0 for `compile` and `seal`, and exits 5 for `preflight --observations ... --run-id`, `tea-evaluate preflight` exits 5 and the log shows that preflight argv, which proves the verdict comes from the CLI (the library verdict from `runPreflight` would be byte-identical, so a byte comparison alone cannot prove the source)
**And** a deterministic test, `test/test-evaluate-preflight.js`, chained into `npm test` as `test:evaluate-preflight` with its own `quality.yaml` step, runs it against a stub agent command under `test/fixtures/evaluate/` and asserts a passed `PreflightVerdict` with no `interface-not-authorized` or `executable-not-authorized` denial (amended 2026-09-24 in Story 1.6: eval-quality's command-line adapter throws either denial as one `forbidden-target` fault whose message does not name the reason, so the runtime records a leg's fault under `runs/<invocationId>/faults/` and exits 10, and the test asserts no fault and none of the three names in the files the runtime writes about legs and the verdict: `observations/`, `faults/`, `observations.json` and `preflight-verdict.json`; amended again 2026-09-24 in Story 1.6 final review: `engine/` holds the engine's own stdout and stderr, which may name its vocabulary, so "anywhere in the run" named more than the test scans)
**And** removing the stub's registry entry makes that test observe a denial and fail (amended 2026-09-24 in Story 1.6: a registry holds at least one entry, so the test replaces the stub's entry with one for another executable)
**And** the probe list `preflight` hands the CLI holds no probe that seeds a defect: a manifestation witness's leg runs against the mutated copy Story 1.7 builds, so an evaluation holding one exits 12 before any leg runs, and the preflight plan reads nothing from a probe that seeds none (amended 2026-09-24 in Story 1.6: a probe cannot be materialized in eval-quality's `Probe` shape before its qualification evidence exists; superseded 2026-09-24 in Story 1.7: a seeded probe on the `controlled-mutation` route is qualified first and reaches the CLI with its witness leg routed to the mutated copy, and one on any other route still exits 12 before any workspace is made)
**And** the legs run in a temp copy of `launch.root` that is removed afterwards, a symbolic link inside the target pointing into the copy and one out of it refused, so a write under the copied tree stays in the copy, while each `workspace.provision` directory is linked in from the target, writable, until Story 1.7's read-only provisioning, and `check` holds every skill-runner leg to `launch.skillRoot` and to a `--timeout-ms` below its entry's `maxElapsedMs` (amended 2026-09-24 in Story 1.6 review: the first build ran legs in `launch.root` itself and never tied the legs' `--skill-root` to `launch.skillRoot`; Story 1.7 replaces the copy with AD-8's pristine and mutated workspaces; amended again 2026-09-24 in Story 1.6 final review: the provisioned links were writable while the criterion said a leg writes nothing into the adopter's tree, and a copied symbolic link could lead a write out of the copy)

**Dependencies:** 1.5.
**Gate:** `npm test`, `npm run test:release-metadata`.

### Story 1.7: Mutate only in a disposable copy and prove the rollback

As an adopter,
I want every seeded defect planted and removed in a scratch copy with the rollback proved,
So that `rollbackVerified: true` is a measured fact and my working tree is never touched (CAP-7, AD-8).

**Acceptance Criteria:**

**Given** `test/test-automate-eval-fixture.js` holds the one live mutate, measure, restore cycle
**When** `cli/lib/evaluate/workspace.js` and `mutation.js` generalize it, with `cachingPort` and `stagedWorkspaceFor` from `test/eval-contract-strength.js`
**Then** a git target is copied with `git worktree add --detach` at the evaluated commit, provisioned with read-only copies of the directories `evaluation.json` lists, a declared `copy` workspace or a non-git target uses a temp copy identified by its tree digest and records `dirty: false` in `run.json`, and `--from-working-tree` uses a temp copy and records `dirty: true`; a `test:evaluate-mutation` case asserts `dirty: false` for a `copy` fixture and `dirty: true` under `--from-working-tree`, and hard-coding either value fails it (amended 2026-09-24 in Story 1.7: no unprivileged process can make a symbolic link read-only, so a link would share the target's own directory with every leg; each provisioned directory is copied into the workspace, as a copy-on-write clone where the file system offers one, and its write bits removed)
**And** the story builds the single-trial arm executor and the deterministic `resolveCheck` evaluator that AD-8 steps 1, 3 and 6 need; Story 1.8 adds trial sets, sealing and scoring
**And** each mutation runs the six AD-8 steps in order, sets `rollbackVerified` only after the restored digest matches and the baseline leg re-passes within `reExecutionCap`, and writes digested evidence files (amended 2026-09-24 in Story 1.7: the cycle runs inside `tea-evaluate preflight`, ahead of its legs, since eval-quality's `preflight` parses its probe list against the full `Probe` schema, whose `controlled-mutation` route requires the cycle's evidence and rollback flag; the qualified probe is written to `runs/<invocationId>/probes/` and handed to the CLI, `reExecutionCap` comes from `policy/scoring-policy.json`, which `check` requires once a probe takes the route, and AD-5's seven subcommands stay seven)
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
**And** trial requests come only from the contract's `interactionPlan` bound from the probe's `testData` (amended 2026-09-24 in Story 1.8: `testData` lives on the contract, and this release sends the plan's literal bindings; a step binding any other kind, `captured`, `principal` or `matcher`, stops the run with exit 12, since the run cannot send the request the contract means; Story 1.18 adds `captured` and Story 1.30 `principal` and `matcher`), and findings and oracle dispositions come from a deterministic evaluator over `resolveCheck` (amended 2026-09-24 in Story 1.8: a scored trial's observations carry `provenance: evaluator-chosen`, since eval-quality's witness match counts no other, and each record's `evaluatorRecommendation` is computed over its whole trial set, since eval-quality holds it equal across a set; AD-7 amended to match)
**And** it writes one `IsolationManifest` per trial set from what it actually granted, one `EvaluatorConfiguration` per run carrying the seal's `sealedBriefDigest` (for a run that uses no model, `modelSnapshot` is the literal `none` and `systemPromptDigest` is `digestBytes` over the empty byte string, since the published schema requires both non-empty; a `test:evaluate-run` case validates that configuration against the schema and fails when either is left empty), and `run.json` with TeA and eval-quality versions, contract and corpus digests, runner and model identity, trial count, duration, commit and `dirty`
**And** a trial observation carrying a registry `infrastructureExitCodes` value yields no record and the invocation exits 12

**Given** the sealed records
**When** `tea-evaluate score` runs
**Then** it calls `eval-quality score` once per probe with every trial's `--record`, `--isolation-manifest` and `--evaluator-configuration`, and passes the exit code through
**And** with `TEA_EVALUATE_ENGINE_CLI` pointed at a logging shim, the argv log shows one `score` call per probe carrying every trial's `--record`; with the real engine, `eval-quality score` run directly on the persisted inputs gives the same exit code and byte-identical evidence, on a passing fixture and on a FAIL fixture
**And** every artifact is validated against eval-quality's published schemas before it reaches the CLI
**And** each `score` call's exit code, stdout and stderr are persisted under `runs/<invocationId>/`, keyed by probe ID whether or not an evidence artifact was emitted, since AD-10 classifies a `score` exit 3 from those diagnostics and AD-12 lists them in the bundle; with `TEA_EVALUATE_ENGINE_CLI` pointed at a shim that prints distinct known bytes to each stream and exits with a distinct code, the test asserts byte equality per stream and the recorded code, so an empty, swapped or dropped capture fails it
**And** probe digests follow AD-7: `commitDigest` is the evaluated commit, `artifactDigest` the `targetArtifact` bytes, `implementationDigest` the tracked tree of the target root, each asserted by the test below (amended 2026-09-24 in Story 1.8: the tracked tree leaves out the evaluation folder's entries, and a clean control's `artifactDigest` is its `implementationDigest`; AD-7 amended to match)
**And** `runs/` is gitignored by the evaluation-folder `.gitignore` template and by TeA's root `.gitignore` for `test/evaluations/*/runs/` and `test/fixtures/evaluate*/runs/` (amended 2026-09-24 in Story 1.8: the fixture rule is `test/fixtures/evaluate*/**/runs/`, since the runtime's own fixtures hold their evaluation folders below the fixture root, as `test/fixtures/evaluate/mutation/evals/verdict/` does)
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
**Then** no target launches; the degenerate response is resolved as a synthetic observation with `resolveCheck`, producing `naiveOracleSatisfiedEvidence` and `disciplinedOracleRejectedEvidence` (amended 2026-09-25 in Story 1.9: the response's bytes are committed at `corpus/gameability/<probeId>.json`, one `{ stdout, stderr, exitCode }` per plan step, held by `degenerate-response.schema.json`; the committed probe names its naive oracle, an oracle of another behavior, as `qualification.naiveOracle`, and the disciplined oracle is the one oracle of its own behavior; the naive oracle must hold and the disciplined one be violated, or `preflight` and `run` exit 11, the shared pipeline qualifying the probe before the verdict; `check` refuses a missing or off-plan response and a naive oracle of the probe's own behavior under the `gameability` rule)

**Given** a target with two addressable revisions and no launchable mutation
**When** `run` evaluates the arm `historical:<revision>`
**Then** it captures fail-before and pass-after evidence and the preflight seeded-fault leg routes to the pre-fix revision; with fewer than two revisions the probe is recorded as refused with its reason (amended 2026-09-25 in Story 1.9: the committed probe names `qualification.fixCommit`, the post-fix revision is that commit and the pre-fix revision its first parent, and the arm is `historical:<preFixSha>`, the parent's full id; the probe records `artifactDigest` as the tracked tree at the pre-fix revision and `fixCommitDigest` as the digest of the fix commit's full id; `fixCommit` is a hexadecimal commit id, and one that names no commit in a full-history repository exits 10 naming the probe; the probe is refused when the pristine workspace is not a git worktree, when a shallow clone lacks the fix commit or its parent, when the fix commit is not an ancestor of HEAD or has no parent, or when the target cannot run at a revision (`launch.root` or the skill root not a directory at either revision, a submodule under `launch.root` or a registry target that is not an executable at the pre-fix revision), and a refusal lands in `run.json`'s `refused` and `runs/<invocationId>/refused/<probeId>.json`, keeps the probe out of `probes.json` and the trial sets, is printed and recorded by `score`, and does not by itself fail the run; the route addresses revisions as git commits whose target launches from a worktree, so a target reachable only as a remote deployment is not measured by it in this story, which Story 1.32 owns; `check` refuses a historical probe whose defects are not all `natural` under the `historical` rule)

**Given** a contract that declares a rubric
**When** `run` judges it
**Then** the judge runs through `cli/lib/agent-adapters.js` and `judgeConfiguration` records it as a fixed condition; with no rubric, no model judge runs (amended 2026-09-25 in Story 1.9: `evaluation.json`'s `judge` wires it (`agent`, optional `agentCommand`, `agentArgs`, `model`, and `timeoutMs`), `policy/evaluator-conditions.json`'s `judge.modelSnapshot` names its model, and `check` exits 10 under the `judge` rule when a rubric is declared with either missing; `judgeConfiguration` is `{ modelSnapshot, systemPromptDigest }`, the digest over the runtime's judge instruction template; the judge runs once per trial, receives the template, each rubric's anchors, penalties and criterion text and the evidence each criterion points at, and never the contract, oracle checks or `testData`; every record of the trial carries its scores as `judgeResults`, an unreadable, missing or off-scale score becoming `score: null` with a note, and a judge that cannot answer yields no record and exit 12)
**And** `test/test-evaluate-arms.js`, chained into `npm test` as `test:evaluate-arms`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), asserts all three, and each qualifies through `qualifyProbe` (exported by Story 1.1) with no failure code

**Dependencies:** 1.8.
**Gate:** `npm test`.

### Story 1.17: Drive any evaluation layer through one import contract

As an adopter whose evaluation is an agent reading a sealed brief, my own harness, a skill-specific evaluator, custom code or an external framework,
I want `tea-evaluate run` and `score` to take any of them behind one framework-neutral contract,
So that every evaluation layer reaches `eval-quality score` as sealed run records, and adding a framework changes neither TeA's runtime nor the engine (CAP-9, CAP-13, AD-21).

**Acceptance Criteria:**

**Given** `evaluation.json`'s new `evaluator` field, whose `kind` is `deterministic` (Story 1.8's `resolveCheck` evaluator, the default), `sealed-brief-agent`, `command` or `records`
**When** `tea-evaluate check` reads it
**Then** it exits 10 for an unknown kind, a `command` evaluator with no `evaluator/mapping.json`, a mapping key bound to an oracle, behavior or rubric criterion the contract does not declare, a rubric binding whose `levels` differ from that criterion's anchored scale levels, and a `records` evaluator whose record directory is absent, each a case in `test:evaluate-check` (amended 2026-09-25 in Story 1.9: Story 1.9's `judge` rule and TeA's per-trial judge call bind every contract that declares a rubric, while Story 1.21 names a `sealed-brief-agent` or a `command` evaluator bound to rubric criteria as the rubric's scorer; so this story narrows both to the `deterministic` kind: under any other kind `check` does not require `evaluation.json`'s `judge` for a rubric and refuses one as unused, and `run` makes no TeA judge call, a `test:evaluate-check` case per kind and a `test:evaluate-evaluators` case counting zero stub-judge calls under a `command` evaluator; keeping the rule for every kind makes the `command` case exit 10, which the case catches) (amended 2026-09-25 in Story 1.17: an unknown kind, and a `command` or `sealed-brief-agent` evaluator with no `timeoutMs`, fail the `evaluation.json` schema under the rule `schema`; every other refusal is the new `evaluator` rule, which also refuses a key binding an oracle to a behavior that does not declare it, an oracle or criterion under two keys, a rubric criterion no key binds under a `command` or `sealed-brief-agent` evaluator (nothing else would score it), a link or special file under `evaluator/`, a `command` executable that is not a regular executable file, a `sealed-brief-agent` on an adapter with no bridged run, with passthrough `agentArgs` that reopen what the bridged run closes, or with no `evaluator.modelSnapshot` in `policy/evaluator-conditions.json`, an `evaluator` block there beside the `deterministic` or `records` kind (a `command` evaluator that calls a model names it there), and a `records` directory reached through a link; `evaluator/mapping.json` binds a key to `{ oracleId, behaviorId }` or `{ rubricId, criterionId, levels }` and is required for `sealed-brief-agent` as for `command`, since both answer in judgment rows)

**Given** the runtime-owned `judgment-rows` schema, the import contract of AD-21: per trial, rows of `key`, `outcome` (`pass`, `fail` or `score`), `score` for a scored row, `observationIds` (at least one), `quote` (verbatim text from a cited observation), `quoteChannel` (one of eval-quality's quotation channels: `response-body`, `response-headers`, `response-status`, `call-inputs`, `stdout`, `stderr`, `exit-code` or `artifact`), `artifactId` (required when `quoteChannel` is `artifact`, absent otherwise), `confidence` and `comment` (required on a `fail` row), plus an optional `recommendation`
**When** a `command` evaluator runs
**Then** (amended 2026-09-24 in Story 1.8: eval-quality's witness match counts only `evaluator-chosen` observations, so the trial observations a `command` evaluator judges are recorded `evaluator-chosen`, as the deterministic evaluator's are, and the recommendation the rows imply is taken over the whole trial set, which eval-quality holds equal across the set) `evaluation.json` declares `evaluator.timeoutMs` for it (`check` exits 10 when a `command` evaluator has none), and the runtime starts the adopter's evaluator executable named in `evaluation.json` once per trial after collecting the trial's baseline observations, writes `{ sealedBrief, observations }` to its stdin with each observation carrying its runtime-assigned `observationId`, and reads judgment rows from its stdout (amended 2026-09-25 in Story 1.17: `evaluator.command` names a regular executable file under `evaluator/`, so the tree digest covers it, run with `evaluator.args` under `cli/lib/agent-supervisor.js` in an empty temporary working directory with the agents' base environment and `evaluator.environmentKeys`; the stdout is one JSON object `{ rows, recommendation? }`)
**And** it converts rows into `SealedRunRecord` fields through `evaluator/mapping.json` alone: a `fail` row bound to an oracle becomes a finding that validates against eval-quality's `Finding` schema: `findingType: defect`, a `findingId` the runtime mints (`F-NNN`, unique per record), the mapped `oracleId`, the probe under trial, the mapped behavior and its declared severity, the row's `comment` as `summary`, the row's `confidence`, the cited `observationIds`, `evidenceArtifacts: []`, and one `quotedEvidence` entry `{ quote, channel, artifactId }` built from `quote`, `quoteChannel` and `artifactId` (`null` off the `artifact` channel); and a `violated` disposition; a `pass` row becomes a `held` disposition; a `score` row bound to a rubric criterion becomes a `judgeResults` entry; an oracle with no row becomes `not-attempted`; the recommendation is the rows' own or, when absent, FAIL on any `fail` row and PASS otherwise (amended 2026-09-25 in Story 1.17: a `fail` row files its finding only in the records of a probe whose behaviors include the bound behavior, as the deterministic evaluator does, since a finding names the probe it arose during and eval-quality scores it against that probe's signature, and the disposition is `violated` in every record; a bound rubric criterion no row scores becomes `score: null` with a note; a probe's recommendation in a trial is the evaluator's own or, when it gives none, FAIL when the trial's rows filed a finding against that probe and PASS otherwise, so a `fail` row on another behavior leaves a clean control at PASS as the deterministic evaluator does, and a trial set records the most severe of its trials'; a `score` row on an oracle key, a `pass` or `fail` row on a rubric key, and a score off its binding's levels are answers outside the contract, exit 12 with no record) (amended 2026-09-25 in Story 1.17's final review round 1: a `fail` row files its finding in the records of a probe one of whose behaviors declares the bound oracle, for the first such behavior of the probe and at that behavior's severity, as `judgeTrial` does, so an oracle two behaviors declare is judged for either through its one key; the binding's `behaviorId` names a behavior that declares the oracle, the one the key is described under, and which probe's records carry the finding follows each probe's own behaviors; a string in the answer that is not well-formed Unicode, a lone surrogate, is an answer outside the contract, exit 12)
**And** the runtime re-checks nothing the engine checks: quotes, citations and signature matches reach `score` exactly as the evaluator stated them, and a stub evaluator whose `quote` is absent from the cited observation yields the Invalid result eval-quality's own unwitnessed-quotation condition produces, which proves the runtime holds no copy of that ingest rule (AD-1)
**And** an evaluator that crashes, exits non-zero or prints output failing the `judgment-rows` schema yields no record, the invocation exits 12 as an evaluation-layer invocation failure (AD-10), and the evaluator's stdout and stderr are persisted under `runs/<invocationId>/evaluator/` (amended 2026-09-25 in Story 1.17: as `evaluator/<arm>/trial-<n>.stdout`, `.stderr` and `.json`, the last holding the fault, and for a sealed-brief agent its prompt and bridge calls, kept for an evaluator that answered as well); a `fail` row with no `quoteChannel`, and one with `quoteChannel: artifact` and no `artifactId`, are each a case that fails the row schema and exits 12 (amended 2026-09-25 in Story 1.17's final review round 1: the streams are kept byte for byte, as the evaluator wrote them, and the answer is read from stdout's UTF-8 text)
**And** row cardinality is fixed: each row's `key` must be a key `mapping.json` declares and appears at most once per trial, so an unmapped key or two rows for one key fails the `judgment-rows` schema and exits 12; zero rows for a trial with at least one mapped oracle exits 12 as an evaluation-layer failure; each is a `test:evaluate-evaluators` case
**And** an evaluator still running at `evaluator.timeoutMs` has its process group killed, its stdout and stderr up to that point persisted under `runs/<invocationId>/evaluator/`, no record written, and the invocation exits 12; a stub evaluator that hangs is the `test:evaluate-evaluators` case
**And** every record the conversion produces validates against eval-quality's published `sealed-run-record` schema before `score`, which the test asserts per row shape
**And** stub evaluators under `test/fixtures/evaluate/evaluators/` cover each row shape end to end: the clean arm resolves `passed-clean-control` and the mutated arm `caught` through `score`

**Given** a `sealed-brief-agent` evaluator
**When** `run` evaluates an arm
**Then** the evaluator agent runs through `cli/lib/agent-adapters.js` and receives the sealed brief from `seal`, the judgment-rows instructions and nothing else from the evaluation: no contract, oracle `check`, interaction plan, `testData`, probe, mutation or evaluator reference file
**And** it acts on the target only through `cli/lib/evaluate/bridge.js`, a vendor-neutral stdio MCP server exposing one tool per interface the brief carries (the brief names interfaces as `{ logicalId, kind }` only and withholds the operation list), each with a kind-generic call shape: `cli` takes arguments and stdin, `api` takes method, path and body, `mcp` takes tool name and arguments
**And** the bridge routes each call through the registry adapter for the arm's copy, whose authorization denies any executable, subcommand, address, method or tool it does not grant; the runtime maps an authorized call to the contract `operationId` it matches for the observation it records with `provenance: evaluator-chosen`, and a call that matches no declared operation is recorded as unmatched and never reaches a finding; interaction-plan steps the runtime drives are recorded `baseline`
**And** a stub agent adapter that captures its whole prompt and tool configuration shows the sealed brief present and none of the contract's oracle `check` strings, `testData` literals, interaction-plan step IDs, operation IDs or path templates; adding the contract to the prompt fails the case (amended 2026-09-25 in Story 1.17: a string the sealed brief itself carries, such as a behavior's observable success criterion that repeats an oracle literal, is the brief's to show and is left out of the scan; the judgment-rows instructions name each mapping key, and for a rubric key its criterion's text and anchored levels, which the agent needs to score it and the sealed brief does not carry; the agent answers inside one `<judge-answer nonce>` block with a fresh nonce, as Story 1.9's judge does; `policy/evaluator-conditions.json` names its model as `evaluator.modelSnapshot`; `claude` carries a bridged run verified live (no built-in tool, the bridge alone, no settings, no saved transcript) and `custom` one whose sealing is the runner's own contract, both in `cli/lib/agent-adapters.js`, and `check` refuses the rest; the bridge's configuration reaches the adapter as a private file and its admission token as its process's environment, and it admits one connection, so no process that arrives after the agent is answered, while a target running as the same user could read the token until Story 1.31 sandboxes it)
**And** an MCP client driving the bridge in the test records one observation per authorized call with the routed `cwd` and `provenance: evaluator-chosen`, and a call the registry authorization does not grant (an unlisted executable for `cli`, an unlisted address for `api`, an unlisted tool for `mcp`) is denied with eval-quality's denial reason and recorded, with no target launch (amended 2026-09-25 in Story 1.17: this release's registry declares command targets only, so an `mcp` call goes through eval-quality's MCP adapter and an `api` call through its `evaluateTarget`, each over no authorization, and both are denied at the interface, `interface-not-authorized`; Story 1.10 adds the unlisted-tool case through the bridge and Story 1.11 the unlisted-address case; eval-quality's command and MCP adapters report a denial as the `forbidden-target` fault with the policy decision's detail and not its reason code, so the bridge records `{ code, detail }` for those and `{ code, reason, detail }` for `api`, and Story 1.33 records the reason code for every kind; the bridge refuses unsent the calls past the contract's `budgets.maxToolCalls` in a trial, and on a gameability arm answers a matched call from the degenerate response with nothing launched) (amended 2026-09-25 in Story 1.17's final review round 1: on a gameability arm a call goes through eval-quality's command-line adapter over the registry's authorizations with a mechanism that launches nothing, so a call the registry does not grant is denied and recorded exactly as on a real arm; the answer nonce is drawn before the router is built, and a call whose input carries it is refused unsent and not counted; a call's `stdin` is sent as the agent wrote it, and the record's `callInputs.stdin` is the JSON object it parses to or the text under the operation's one stdin key)
**And** `EvaluatorConfiguration`, whose published schema is strict, carries the evaluator identity in `evaluatorIdentity` and the model in `modelSnapshot`, and carries TeA's own conditions under caller-owned keys in `decodingParameters`, the one field the schema opens to caller keys: `tea.evaluatorKind`, and for a `command` evaluator `tea.evaluatorExecutableDigest` and `tea.evaluatorTreeDigest`; every generated configuration validates against the published schema (amended 2026-09-25 in Story 1.17: both row-converting kinds also carry `tea.evaluatorWiring`, the `evaluation.json` block that runs the evaluator (arguments, environment keys, timeout, or adapter, command, arguments and model), so a changed argument or model changes the scoring version as a changed file does; a `command` evaluator that calls a model records its snapshot as `tea.evaluatorModelSnapshot`; a `sealed-brief-agent` configuration also carries `tea.evaluatorTreeDigest`, since its mapping lives under `evaluator/`, `tea.evaluatorAgent` and `tea.evaluatorModel`, its `modelSnapshot` is the agent's and its `systemPromptDigest` the digest of the runtime's evaluator template (instructions, answer line, heading, and the tools' descriptions and call shapes), `judgeConfiguration` names the agent when its mapping binds a rubric criterion, and a target model the conditions name is kept as `tea.targetModelSnapshot` and `tea.targetSystemPromptDigest`)
**And** editing one byte under a fixture's `evaluator/` changes the `EvaluatorConfiguration` digest and so the records' `evaluatorConfigurationDigest` and the evidence's scoring version, which the test asserts (amended 2026-09-25 in Story 1.17's final review round 1: in a git repository the tree digest covers the files git tracks under `evaluator/`, and outside one every regular file there, so an untracked or ignored file moves no digest in a repository; `run` copies those files once, before anything runs, into a private snapshot removed however the run ends, takes the digests over the copied bytes, and runs a `command` evaluator from the snapshot, so the executable that runs is the one digested and what it writes beside itself stays out of the evaluation folder; `check` refuses a mapping or command git does not track; amended again 2026-09-25 in Story 1.17's final review round 2: the snapshot cut a wrapper off from the project's `node_modules` and could itself be rewritten between trials, so it is gone and a `command` evaluator runs in place from `evaluator/`, the digests taken over the bytes read before anything runs; the run reads the layer's files again before each launch of the evaluator and after each trial and exits 12 with no record on any file gone, changed or added, a cache the evaluator writes there must be gitignored or the adopter-tree check stops the run, and a swap restored between the re-read and the launch is Story 1.31's to close; `check` names a submodule under `evaluator/` as one)

**Given** a `records` evaluator (an adopter harness that runs the system and seals its own records)
**When** `tea-evaluate score` runs
**Then** it validates each supplied `SealedRunRecord` and isolation manifest against eval-quality's published schemas and passes them to `eval-quality score` unchanged, exit code passed through; a record failing the schema exits 10 before any engine call (amended 2026-09-25 in Story 1.17: `run` qualifies and preflights as for any kind, then validates `<records>/evaluator-configuration.json` and each `<records>/<probeId>/` record and isolation manifest, holds the configuration's and every record's `sealedBriefDigest` to the brief the run sealed and every record of a set to one `runId` and the arm the run qualified the probe on, agreements eval-quality does not check, refuses a records directory reached through a link, and copies them byte for byte into the run directory, so a record off its schema exits 10 from `run` before any `score` call; `score` validates the copies again and leaves the records' run IDs, references and digest agreement to eval-quality)

**Given** the rule that the runtime is framework-neutral
**When** `test:evaluate-boundaries` scans `cli/`
**Then** the binding rule is the `cli` layer's dependency-direction `allow` list from Story 1.4, which names no framework, so an import of any framework from `cli/` fails `test:direction`; a case adds a temporary import of an unlisted package under `cli/` and observes the failure
**And** as a secondary check it fails on a framework or library name from a list held in the test (at least `agentevals`, `openevals`, `promptfoo`, `deepeval`, `inspect_ai` and `langsmith`), which catches a name in a string or a dynamic path
**And** `test/test-evaluate-evaluators.js`, chained into `npm test` as `test:evaluate-evaluators`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), holds every case above

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
**And** the clean arm resolves `passed-clean-control` and the mutated arm `caught`, asserted by `test/test-evaluate-mcp.js`, chained into `npm test`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own)
**And** removing the tool from the authorization makes the test observe `tool-not-authorized` and fail
**And** (added 2026-09-25 in Story 1.17, whose bridge routes an `mcp` call through eval-quality's MCP adapter over no authorization until this story) a `sealed-brief-agent` evaluator's bridge routes an `mcp` call through the registry's `McpTargetAuthorization` for the arm's copy: an authorized call is recorded `evaluator-chosen` with the operation its tool name matches, and a tool the authorization does not list is denied by eval-quality's MCP adapter and recorded with no launch, a case in `test/test-evaluate-mcp.js`; leaving the bridge on an empty authorization list turns the authorized call into a denial, which the case catches
**And** (added 2026-09-25 in Story 1.10, so every arm a probe needs runs over a tool server as it runs over a command) a registry entry with `kind: "mcp"` names the server's `target`, `targetArgs`, `tools` and `environmentKeys`, which the runtime turns into an `McpTargetAuthorization` for the workspace a call runs in, checked by eval-quality's `parseMcpTargetPolicy` at `check` and before any server starts; a record carries a tool call's arguments as `callInputs.arguments`, its structured result as `responseBody` and its error flag as `responseStatus`, the server's environment values scrubbed; a gameability probe's degenerate response answers a tool-call step with `{ isError, structuredResult }`, and the bridge on a gameability arm denies an unlisted tool as a real arm does and answers a listed one from that response with nothing started; `check` refuses under `registry` an interface a command and a tool server share, an entry of another kind than its interface and tool servers `parseMcpTargetPolicy` refuses (two for one interface included, eval-quality's own rule), under `reference` an `evaluation.json` `interface` the contract declares no interface of, under `schema` a `targetArgs` item that is an absolute path, carries one after `=`, names a `file:` URL or holds a `..` segment (each would run the adopter's live tree in place of the workspace), and under `gameability` a degenerate response of the other kind than its step; a server's environment values are scrubbed from object keys and numbers as from strings, as written or under one or two levels of JSON escaping, a fault a server could not run under keeps eval-quality's cause scrubbed, a value the cause cuts short included, and a bridge tool call whose arguments carry a `__proto__` key, which eval-quality's parser drops, is refused unsent; each is a `test/test-evaluate-mcp.js` case, and dropping the rule, the scrub or the projection turns its case red

**Dependencies:** 1.8, 1.17.
**Gate:** `npm test`.

### Story 1.11: Scaffold the HTTP probe port for `api` targets

As an adopter with an AI feature or web application,
I want a scaffolded HTTP port that delegates every address decision to eval-quality,
So that my HTTP surface is evaluated as `api` with no copied network policy (CAP-6, AD-4).

**Engine consumption.** This story needs the export from Story 1.1, published as eval-quality 4.0.0 by the time this story runs. It runs on the devDependency Story 1.2 already raised to that release, with the engine check at start and end; no re-pack or `--no-save` install remains.

**Acceptance Criteria:**

**Given** the skill's `assets/`
**When** `/bmad-workflow-builder` Edit adds `http-probe-port.mjs` and `http-probe-port.conformance.mjs` templates
**Then** the port is a default-export factory that holds only address, auth and transport configuration and calls eval-quality's `evaluateTarget` for every allow or deny decision, once per request and once per redirect hop; the evaluator is an injected option defaulting to the imported `evaluateTarget`, so the test injects a counting wrapper, and the grep test holds that the default is the import (amended 2026-09-25 in Story 1.11: the runtime never imports the adopter's port: for each call it starts `adapter/http-probe-port.mjs` as a Node process of its own, whose last lines hand the factory and the `nodeTransport` it exports to TeA's host, `cli/lib/evaluate/http-port-host.js`, which serves the call over newline-delimited JSON on standard input and output, since eval-quality's `dependency-direction` gate refuses a computed `import()` anywhere under `cli/` and a port in its own process keeps the adopter's code apart from the run's state and ends at its ceiling; `preflight` and `run` ask the port for its protocol before anything starts and exit 10 when it does not start TeA's host) (amended 2026-09-25 in Story 1.11's final review: the host serves the call on file descriptor 3, a channel the runtime opens for the protocol alone, so a `console.log` in the adopter's port no longer breaks every call; the port's standard output and error are captured together, capped and quoted in a failure; and the grep test reads the default from the parsed module, inside the factory's own parameter list, so a comment or a default elsewhere cannot satisfy it)
**And** the conformance template calls `runEnvironmentProbePortConformance` against a loopback stub server it starts and closes itself (the suite's redirect, slow-response and oversize-response scenarios need endpoints no deployed target offers), so conformance runs in the `pr` tier with no deployed target and no secret
**And** a grep test in `test/test-evaluate-api.js` fails when the template contains its own address classification (any private-range literal or CIDR arithmetic) (amended 2026-09-25 in Story 1.11: the port template carries no private-range literal and neither template carries CIDR arithmetic; the conformance file's four denied-class requests need one sample address of each class, which the test holds to exactly those four samples, each of the class eval-quality's own `classifyAddress` gives it) (amended 2026-09-25 in Story 1.11's final review: the grep also catches a bare or regex-escaped prefix such as `192.168`, `172.16` or `/^10\./`, an IPv6 prefix without its colon, an octet radix a division takes an address apart with, and a CIDR suffix read off a string, and the test holds the grep to a list of those spellings, each of which must be caught) (amended 2026-09-25 in Story 1.11's final review round 2: the grep holds a named list of classifier spellings, `RANGE_EVASIONS`, each of which must be caught, which adds an octet compared with 168 or 254 or bounded by 16 and 31, a power of two such as `2 ** 24`, a range base written in decimal such as `3232235520` or `167772160`, an IPv6 prefix as a character class (`f[cd]`, `fe[89ab]`) or a quoted prefix (`'fd'`, `'::ffff:'`), a table of base and prefix-length pairs, and a prefix assembled from quoted pieces; no grep can list every spelling of an address classifier, so the behavioral guard is the counting-wrapper case: a port that decides locally makes zero evaluator calls, and that case fails it)

**Given** a loopback HTTP fixture target at `test/fixtures/evaluate-api/` with an adapter rendered from the template, whose `evaluation.json` declares a `copy` workspace (AD-8)
**When** its evaluation runs conformance, `check`, `preflight`, `run` and `score`
**Then** conformance passes, preflight passes, the clean arm resolves `passed-clean-control` and the mutated arm `caught`
**And** the contract declares kind `api`, and an unlisted address is denied with eval-quality's denial reason
**And** (added 2026-09-25 in Story 1.17, whose bridge denies every `api` call at the interface until this story) a `sealed-brief-agent` evaluator's bridge routes an `api` call through the adopter's port for the arm: an authorized call is recorded `evaluator-chosen` with the operation its method and path match, and an unlisted address is denied with eval-quality's `address-not-authorized` before any request is sent, a case in `test/test-evaluate-api.js`; leaving the bridge on no HTTP authorization turns the authorized call into an `interface-not-authorized` denial, which the case catches
**And** the test is chained into `npm test`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own)
**And** (added 2026-09-25 in Story 1.11, so every arm a probe needs runs over an HTTP target as it runs over a command and a tool server) a registry entry with `kind: "api"` carries eval-quality's HTTP authorization fields and one of `port` (a deployed target) or `server` (`target`, `targetArgs`, `environmentKeys`, `portEnvironmentKey`, `readyTimeoutMs`), and an optional `auth` header holding the host's value for its key; for each call the runtime hands the port the `ProbeTargetPolicy`, the targets and the auth headers, and starts a `server` from the call's workspace through eval-quality's `nodeCommandMechanism`, on a free port, only once the port's policy has allowed the call, ending its process group after it; a record carries an HTTP call's `path`, `query`, `header` and `body` inputs and the answer's status, headers and body; a gameability probe's degenerate response answers an HTTP step with `{ status, headers?, body? }` through the port with nothing sent, and the bridge on a gameability arm denies an unlisted method as a real arm does; `check` refuses under `registry` a second HTTP entry for one interface and an HTTP entry for an interface of another kind, under `schema` an entry naming both or neither of `port` and `server`, under `adapter` a folder whose registry declares an HTTP target and holds no regular `adapter/http-probe-port.mjs`, and under `gameability` a degenerate response of another kind than its step; a service's environment values and the auth value are scrubbed from every answer and cause; a service that cannot start or hangs stops the run with exit 12 and every process it started ended; before it starts a server the runtime asks eval-quality's `evaluateTarget` itself about the target the port names, the request's elapsed cap starts once the server accepts a connection, and an answer that arrives after the server ended other than with exit code 0 is refused; `preflight` and `run` exit 10 when an auth header's key has no host value; a bridge call's body is a JSON object, and a `.` or `..` path value is refused unsent; each is a `test/test-evaluate-api.js` case, and dropping the rule, the scrub or the projection turns its case red
**And** (added 2026-09-25 in Story 1.11's final review) the runtime reads each port answer through eval-quality's own `probeParsers.response`, loaded through `engine.js`, so an answer the parser does not read stops the run with `port-contract-violation` (exit 12) and is never judged as the target's behavior; the protocol channel is decoded as one UTF-8 stream, so a multi-byte character a chunk cuts is read whole; a fault's message is scrubbed of each secret as written and lowercased, since a URL lowercases the host a redirect names; on a gameability arm every host resolves to its interface's entry's first address, so eval-quality's own host check decides every spelling as on a real arm; `check` refuses under `registry` a `host` a URL spells otherwise, naming the URL's spelling, and an `auth` header over `http` to an address eval-quality's `staysOnHost` says leaves the host (amended 2026-09-25 in Story 1.11's final review round 2 from `classifyAddress` classing it other than `loopback`, since that class holds the NAT64 `64:ff9b::7f00:1` and IPv4-compatible `::127.0.0.1` spellings, which leave the host; eval-quality 4.3.0 exports `staysOnHost`); the conformance template closes a stub the suite left open; each is a `test/test-evaluate-api.js` case, and undoing the change turns its case red

**Dependencies:** 1.1, 1.8, 1.17.
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
**And** `test/test-evaluate-workflow.js`, chained into `npm test` as `test:evaluate-workflow`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), holds each case

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
**And** `test/test-evaluate-tool-use.js`, chained into `npm test` as `test:evaluate-tool-use`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), holds each case

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
**And** (superseded 2026-10-01 by Story 1.43) the clauses above that print a `fail` row for a result with no `gradingResult`, and the error-row case, no longer hold: an ungraded framework result is an evaluator infrastructure failure (exit 12, no sealed trial record), and only a graded `pass: false` becomes a cited `fail` row
**And** the clean arm resolves `passed-clean-control` and the mutated arm `caught`
**And** `git diff --stat -- cli/` between the story's first and last commit is empty, recorded in the completion notes, which shows a framework joined with no runtime change; `test:evaluate-boundaries` holds the rule afterwards
**And** `promptfoo` joins TeA's devDependencies at the `latest` spec; its `engines.node` floor is met by the Node major in `.nvmrc`, which the test asserts before spawning promptfoo and reports by name when unmet; `test:licences`, `test:lockfile-age` and `test:supply-chain` pass
**And** the completion notes record the installed promptfoo version and the output shape it produced, and `evaluation-framework-facts.md` is corrected where the documented shape differed
**And** `test/test-evaluate-promptfoo.js`, chained into `npm test` as `test:evaluate-promptfoo`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), holds each case

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
**And** `test/test-evaluate-partitions.js` and `test/test-evaluate-calibration.js`, chained into `npm test` as `test:evaluate-partitions` and `test:evaluate-calibration`, each run by the `chain` matrix (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), hold these cases

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
**And** `test/test-evaluate-interpret.js`, chained into `npm test` as `test:evaluate-interpret`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), holds each case

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
**When** `references/evaluator.md` and the `assets/evaluators/` templates are authored in the skill directory after a bounded headless `/bmad-workflow-builder` Edit attempt that produced no usable artifact
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
**When** the workflow-builder Edit procedure writes `references/mutation.md`, `references/harness.md`, `references/run.md` and `references/gaps.md` under the Build Rules' Codex fallback
**Then** mutation planning writes `mutations/M-NNN.mutation.json` files and plans signatures per AD-19
**And** mutation planning teaches realistic mutation choice per behavior, each under its own heading with a worked mutation file that validates through the tagged-example rule: weaken or remove a prompt instruction, remove required context, drop a validation step, alter a tool's result, change the agent's configuration, break a state write or its read-back, and for a test-review mechanism remove one smell rule; each names the behavior it fits, the observable failure it should produce and the channel its signature addresses, restates the single-source rule (a behavior restated in several files can survive a one-file mutation) and refuses a model-weight or provider change under the vendor rule
**And** harness asks the adopter for `severityFloor`, `minimumTrialCount` and `catchThreshold` and fills no default (amended 2026-09-24 in Story 1.8: harness writes `policy/scoring-policy.json` from `assets/scoring-policy.template.json`, and, when the target or the evaluator uses a model, `policy/evaluator-conditions.json` from `assets/evaluator-conditions.template.json` with `systemPromptDigest` computed as eval-quality's `digestBytes` over the system prompt's bytes, never typed by hand; run installs `assets/evaluation-folder.gitignore` as the evaluation folder's `.gitignore`; the guidance test asserts each of the three)
**And** harness teaches choosing those values for a stated risk with a worked table covering a deterministic target and a sampled-model target at `low`, `material` and `critical` risk, the reason for each value, eval-quality's strict `caughtCount / validCount > catchThreshold` rule, and why fewer trials than `minimumTrialCount` leave the strength vector non-comparable
**And** run invokes `tea-evaluate preflight`, `run` and `score` through `npm exec --prefix {tea_evaluations_folder}` after writing the AD-20 private `package.json` with `eval-quality` and TeA's package at the `latest` spec and running `npm install --prefix {tea_evaluations_folder}`; when `{project-root}` is TeA's own package it invokes `node cli/evaluate.js`
**And** gaps reads the evidence artifact, or for a `score` exit 3 with no artifact the persisted `score` diagnostics, and maps every outcome state, every AD-10 exit and class, every preflight check and every coverage rule to the probe, control, oracle or evidence that closes it
**And** gaps teaches, each under its own heading with a worked reading: the strength vector in each current per-probe evidence artifact (that probe's class component, an unrelated `null` class, a `rate: null` for an unexercised admitted probe, why clean controls and canaries never enter it, and why one caught defect does not make a contract strong); a loose oracle that passes a degenerate response, recognised from a gameability probe that fails qualification or does not resolve `caught`; process versus outcome separation and first material error attribution read from `interpretation.json` (Story 1.22); and held-out results read from `gap-view.json` only (Story 1.21)
**And** gaps runs the author, rerun and rescore loop: for each named gap it authors the missing probe, control, oracle, rubric criterion or evidence pointer, reruns `tea-evaluate digest` and `check`, `eval-quality compile` and `seal`, reruns `run --partition development` and `score` through the installed binaries, records the before and after outcome of the gap in the gap report, and stops when the gap is closed or the adopter declines it; the held-out partition runs only after the adopter reviews the engine-produced per-probe development evidence and confirms readiness, with the unavailable run-wide class gate recorded and no class-wide strength claim

**Given** the guidance test
**When** it runs
**Then** it asserts `gaps.md` names every outcome state and discipline rule from the installed package's `OUTCOME_STATES` and `DISCIPLINE_RULES` exports, every preflight check from `eval-quality/schemas/preflight-verdict.schema.json`, and each AD-10 exit, and that it names the persisted `score` diagnostics as the source for a `score` exit 3
**And** it asserts each mutation heading, the harness risk table rows and the strict-threshold rule, each gaps reading heading, and each loop step, and every tagged mutation example validates against the runtime schema
**And** removing one mapping, heading or loop step fails it

**Dependencies:** 1.9, 1.13, 1.22, 1.23.
**Gate:** skill gates (no registration change), `npm test`.

The 2026-09-28 Codex amendment names the builder procedure used for Story 1.14 because the slash skill is unavailable in this runtime. The outcome record identifies its direct Edit steps, scanner commands and independent Analyze lenses.

The 2026-09-28 final review found that `tea-evaluate score` calls eval-quality once per probe, so no run-wide class rate exists to compare with `evaluation.json.strengthFloor`. Story 1.14 teaches the per-probe evidence and records the adopter's held-out decision without claiming a run-wide gate. Story 1.45 adds engine-owned aggregation and enforcement.

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
**When** a maintainer session runs `EV` on each through an isolated local `gpt-6-sol` high-reasoning agent session, in a temporary folder holding only the installed skill, the target and its two files, answering intake from `intake-answers.md`
**Then** each session writes `evaluation.json`, `contract.json`, probes (held-out probes among them), mutations, `corpus-index.json`, `policy/` and its evaluator choice with the selection-rubric reason, committed under `test/fixtures/evaluate-authoring/<kind>/evaluation/`, with the inspection record, the requirements statement and the session transcript committed beside it
**And** `tea-evaluate check`, `eval-quality compile` and `eval-quality seal` exit 0, and preflight passes
**And** each suite scores strong at `minimumTrialCount`, defined for this plan as: every zero-action clean control resolves `passed-clean-control`; every defect and gameability probe, development and held-out, resolves `caught`; every exercised defect and gameability class has rate 1.0; the verdict is PASS with no coverage gap at or above `severityFloor`
**And** every probe `rationale` opens with its corpus section tag, and each suite covers all four corpus sections for its kind, which the test asserts
**And** one of the two sessions also receives the request to evaluate whether the stub's underlying model is good at the task; its transcript shows the redirect to the adopter's use of the model with the model recorded as a fixed condition, and no committed mutation targets a model
**And** a result short of strong is recorded as found and closed through the gap loop inside the story, each iteration in the transcript; the story ends only when both suites are strong
**And** each evaluation commits the replay inputs of its strong run under `evaluation/replay/`: observations, the preflight verdict, sealed records, isolation manifests, the evaluator configuration, the scoring policy and the evidence artifacts, whichever evaluator kind the rubric chose (a sealed-brief agent or a model judge included)
**And** `test/test-evaluate-authoring.js`, chained into `npm test` as `test:evaluate-authoring`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), runs `tea-evaluate check`, `eval-quality compile` and `seal` on both committed evaluations, then replays the committed observations and records through `eval-quality preflight --observations` and `eval-quality score` called directly (Story 2.2's `tea-evaluate ci` replay does not exist yet), with no target launch and no model call; the produced evidence must equal the committed evidence byte for byte and show the strong state, and the test asserts the section coverage; editing the committed contract or one committed observation fails it

**Dependencies:** 1.16.
**Gate:** `npm test`.

**Amended 2026-09-28:** The first local Claude Code CLI test-review session reached the subscription's weekly limit before completing its handoff. The owner directed that every agent team and peer session use `gpt-6-sol` with high reasoning effort. The final Story 1.24 authoring proof therefore uses fresh isolated sessions on that model. The incomplete Claude transcripts remain recorded as historical attempts; the final target input snapshots and full session transcripts are committed with the suites.

**Clarified 2026-09-28:** A zero-action clean control is expected to pass. The strong definition now states that outcome explicitly; defect and gameability probes are expected to be caught. This resolves contradictory outcomes in the original sentence without changing the required evidence.

**Amended 2026-09-28:** The confirmed AI-feature intake includes malformed raw JSON, but eval-quality 4.3.0 admits only a JSON value or absent HTTP body in `ProbeRequestBody`. This story records the refused raw-body case and proves the remaining malformed JSON-value boundaries. Story 1.50 adds the raw-body route and its scored parser-defect proof. This limitation must appear in the Story 1.24 outcome and cannot be counted as a closed coverage gap.

### Story 1.25: Close seeded weaknesses through the gap loop

As a TEA maintainer,
I want Evaluate's gaps stage to find weaknesses it was not told about, author the missing pieces, rerun and rescore,
So that "TeA names what is weak and builds the missing piece" is a tested fact (CAP-10).

**Acceptance Criteria:**

**Given** a copy of the Story 1.24 test-review evaluation at `test/fixtures/evaluate-gap-loop/before/` into which the worker seeds two weaknesses, recorded only in `test/fixtures/evaluate-gap-loop/SEEDED.md`, which the session is not given: W1, O-003 loosened so the all-flagging response satisfies it; W2, the sole type-violating `typed-file` interaction and its O-004 direction and check pointers removed
**When** the before development and held-out partitions run, and an isolated Codex `gpt-6-sol` high maintainer session reads the development qualification evidence and a redacted W2 rule summary through Evaluate's gaps stage
**Then** the full development run first stops because P-007's mutation satisfies the loose oracle, a focused P-009 qualification records that the all-flagging response also satisfies it, and the scored held-out partition records an unsatisfied `malformed-input` coverage rule
**And** the session's gap report names O-003's loose condition and the `malformed-input` rule, authors the tightened oracle and a distinct type-violating interaction with its O-004 check, reruns and rescores development, and the resulting evaluation, committed at `test/fixtures/evaluate-gap-loop/after/`, scores strong on both development and held-out partitions as Story 1.24 defines it
**And** the session never read `SEEDED.md` or a held-out probe file, which the transcript's file reads show and the completion notes cite
**And** both evaluations commit their available replay inputs under `replay/`; `test/test-evaluate-gap-loop.js`, chained into `npm test` as `test:evaluate-gap-loop`, which the `chain` matrix runs, reproduces the P-009 gameability qualification from its committed response, checks the P-007 first-stop evidence, replays the scored before held-out partition and both after partitions through direct `eval-quality preflight --observations` and `score` with no target launch or model call, compares each scored artifact byte for byte, asserts after strength and source binding, and checks that the gap report names every file differing between before and after

**Dependencies:** 1.24.
**Gate:** `npm test`.

**Clarified 2026-09-28:** W2 removes the `typed-file` interaction, the sole type-violating `review` request in the test-review contract, and its O-004 direction and check pointers. W1 loosens O-003 so the all-flagging response satisfies it. The full before development run first stops when P-007's mutation also passes that loose oracle. A focused P-009 qualification then records the gameability failure. The held-out before partition can run and score W2 without exposing its probe contents to the blind maintainer; its score records the `malformed-input` gap. The deterministic gate replays that scored held-out partition and the two qualification diagnostics. A full scored before development verdict does not exist. The after fixture retains full development and held-out preflight and score replay.

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
**And** `test/test-evaluate-learned-framework.js`, chained into `npm test` as `test:evaluate-learned-framework`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), asserts the framework's name is absent from the skill directory and re-runs the committed evaluation to `passed-clean-control` and `caught`; the evaluator the framework provides runs with no model call (the story's selection condition), so the full run, the framework's evaluator included, stays deterministic in `npm test`

**Dependencies:** 1.23, 1.25.
**Gate:** `npm test`, `npm run test:release-metadata`.

### Story 1.27: Tell a documented guard from an invented risk in the test-design contract

Added 2026-09-24 by the owner from Story 1.7's staged live run.

As a maintainer of TeA's test-design evaluation,
I want the contract to tell a risk the epic rules out and the document records as a guard from a risk the skill invented,
So that the live `eval:preflight` measures the skill's real over-reporting and every test-design probe reduces to its baseline live.

**Acceptance Criteria:**

**Given** Story 1.7's staged live run, in which `bmad-testarch-test-design` registers risks its epic rules out as low-score rows ("Document", score 1 to 3), and oracles O-008 to O-010 and O-012 to O-014 read vocabulary across the whole document, so P-008 to P-010 pass and P-012 to P-014 fail `seeded-faults-scoped` against `test/probes/expected-strength.json` (evidence in `story-1.7.md`, "Coordinator decisions after round 1")
**When** the story decides where the fix belongs, by reading the skill's instructions and the live documents recorded there
**Then** either the oracles read the risk register row by row and count a ruled-out category only when its row carries a score above the guard band, or the skill's instructions keep ruled-out categories out of the register; the story records which, and why, in its outcome record
**And** each probe's witness stays equal to the oracle it negates, as the probe generator requires
**And** `test/contracts/test-design.contract.json`, `test/probes/test-design.probes.json` and the stored replays under `test/replay/test-design/` change together, and `test:contracts`, `test:contract-oracles` and `test:probe-corpus` pass
**And** a `test:contract-oracles` case holds a clean register recording a ruled-out category as a "Document" guard row and asserts O-008 unfired, and a second holds the same category scored as a risk and asserts it fired; reverting the oracle change fails one of them
**And** a live `node test/eval-contract-strength.js --suite test-design --preflight-only` run on the staged harness reduces every test-design probe to the outcome `expected-strength.json` records, and the outcome record holds the run

**Dependencies:** 1.7.
**Gate:** `npm test`.

### Story 1.28: Recover from a killed run

Added 2026-09-24 by the owner from the gaps Stories 1.6 and 1.7 accepted.

As an adopter whose CI job or terminal killed a run,
I want the agent's processes stopped and the run's workspaces reclaimed,
So that a `SIGKILL` leaves no running agent, no temp copy and no worktree registered in my repository.

**Acceptance Criteria:**

**Given** Story 1.6's supervision, where a `SIGKILL` to the group leader and the supervisor together leaves the agent's process group running (`story-1.6.md`, round 4 execution probes)
**When** both are killed together
**Then** the agent's group stops and the runner returns a transport failure within a bounded time the reference names, held by a case in the supervision tests; reverting the guard leaves a group member alive

**Given** a `tea-evaluate preflight` killed by `SIGKILL` while its workspaces exist
**When** the next `preflight` runs against the same project
**Then** it removes every workspace a dead run left, identified by a marker the runtime writes into each workspace naming its run and process, and removes the detached worktree's registration from the adopter's repository, touching nothing it did not create, and reports what it reclaimed
**And** a case in `test/test-evaluate-mutation.js` kills a run during qualification, asserts the temp directory holds its workspace and `git worktree list` shows its worktree, runs `preflight` again, and asserts both are gone and the adopter's `git status --porcelain` and refs are unchanged; reverting the reclaim fails it
**And** a workspace whose marker names a live process is left alone, and a case asserts it; reclaiming every marked workspace fails the case (amended 2026-09-25 in Story 1.9: the revert check was named only in the test design)
**And** `docs/reference/tea-evaluate-cli.md` states what a killed run leaves and when it is reclaimed, which a case in `test/test-evaluate-mutation.js` holds by reading that section under its exact heading and asserting it names the workspace marker and the reclaim; deleting the passage fails the case (amended 2026-09-25 in Story 1.9: the criterion named no revert check)

**Dependencies:** 1.7.
**Gate:** `npm test`.

### Story 1.29: Record what a live run spends

Added 2026-09-24 in Story 1.8 from the gap it accepted.

As an adopter evaluating a skill or agent that calls a model,
I want each trial's token and cost use recorded from what the runner reports,
So that a live run's records and isolation manifests state what the run spent (NFR8, AD-7).

**Acceptance Criteria:**

**Given** Story 1.8's `tea-evaluate run`, which meters no model use and records `inputTokens: 0`, `outputTokens: 0` and `costUsd: "0"` in every Sealed Run Record's `resourceUse` and in each isolation manifest's `actualResourceUse`, and the largest safe integer as the token and cost ceilings
**When** a registry target reports its use (for `tea-skill-runner`, the usage its agent adapter parses from the vendor CLI's own report, held in `cli/lib/agent-adapters.js` so the runtime stays vendor-neutral)
**Then** `run` records each trial's reported tokens and cost in its record and sums them in the set's manifest, and a case in `test/test-evaluate-run.js` whose stub target reports a known use asserts those values; reverting the reading makes the case read zero
**And** a trial whose target reports no use is recorded with its use marked unreported in `run.json`, so a reader can tell a measured zero from an unreported use, and a case asserts it; dropping the mark leaves a zero the case reads as measured, which fails it (amended 2026-09-25 in Story 1.9: the revert check was named only in the test design)
**And** `docs/reference/tea-evaluate-cli.md` states where the use comes from and what an unreported use means, which a case in `test/test-evaluate-run.js` holds by reading that section under its exact heading and asserting it names both; deleting the passage fails the case (amended 2026-09-25 in Story 1.9: the criterion named no revert check)

**Dependencies:** 1.8.
**Gate:** `npm test`.

### Story 1.30: Send `principal` and `matcher` bindings

Added 2026-09-24 in Story 1.8 from the gap its final review found.

As an adopter whose contract exercises more than one user or a type-violating input,
I want `tea-evaluate run` to send an interaction plan step's `principal` and `matcher` bindings,
So that the cross-user behaviors and malformed-input checks Story 1.13 teaches run instead of stopping with exit 12 (AD-4, AD-7).

**Acceptance Criteria:**

**Given** Story 1.8's arm executor, which sends `literal` bindings only and stops a trial with exit 12 on any other kind (`cli/lib/evaluate/arm.js`; amended 2026-09-26 in Story 1.18: it sends `literal` and `captured` bindings, and the reference states the kinds it sends under `## The interaction plan`, `### Binding kinds`, which this story's case reads), and eval-quality's plan schema, which admits `principal` (a kebab-case principal identifier) and `matcher` (`any` or `type-violating`) bindings besides `literal` and `captured`
**When** a step binds `{ principal }`
**Then** the runtime sends the credential or identity the registry entry maps to that principal for the step's channel, from a principal mapping the evaluation declares and `check` validates (an unmapped principal is an authoring defect, exit 10), and records the principal, never the credential, in the observation's call inputs; a case in `test/test-evaluate-run.js` whose stub target prints the identity it received asserts two principals reach it in the plan's order, and reverting the binding makes the case exit 12
**And** when a step binds `{ matcher: "any" }` or `{ matcher: "type-violating" }`, the runtime chooses a value from the operation's declared input schema (a value the schema admits for `any`, one it refuses for `type-violating`) with a seed the run records in `run.json`, so a rerun sends the same value; a case asserts the stub received a schema-admitted value and a schema-refused value, and that two runs with one seed send the same bytes; reverting the choice makes the case exit 12
**And** a binding kind the runtime still cannot send stops the run with exit 12 naming the step and the kind, and a case asserts it; sending nothing for that kind lets the run go on, which the case catches (amended 2026-09-25 in Story 1.9: the revert check was named only in the test design)
**And** `docs/reference/tea-evaluate-cli.md` states each binding kind the runtime sends, where a principal's credential comes from, and how a matcher value is chosen, which a case in `test/test-evaluate-run.js` holds by reading that section under its exact heading and asserting it names each binding kind the runtime sends; deleting a kind from the passage fails the case (amended 2026-09-25 in Story 1.9: the criterion named no revert check)

**Dependencies:** 1.8.
**Gate:** `npm test`.

### Story 1.31: Sandbox the target's file system

Added 2026-09-24 in Story 1.8 from the gap its final review found.

As an adopter whose evaluation holds the contract, the probes and the mutations,
I want each trial's target confined to its workspace,
So that a target cannot read what the evaluation withholds or write where the runtime keeps its evidence, and the isolation manifest records mounts the runtime observed (AD-7, AD-8).

**Acceptance Criteria:**

**Given** Story 1.8's runtime, which leaves the evaluation folder out of every workspace but does not sandbox the target's file system, so a target that follows the worktree's git directory reaches the evaluation folder and its `runs/` (the round 1 review of Story 1.8 planted a link there and rewrote the compiled contract), and whose isolation manifest records no observed mount
**When** a trial runs its interaction plan
**Then** the target runs under a file-system confinement that lets it read and write its workspace, read its provisioned directories and the system paths its registry entry declares, and reach nothing else, through a mechanism each supported platform provides (the reference names each, and a platform without one refuses the run with exit 12 unless the evaluation opts out in `evaluation.json`, which `run.json` records), and a case asserts the refusal and the recorded opt-out; removing the refusal lets an unconfined run proceed silently, which the case catches (amended 2026-09-29 in Story 1.31: the mechanism refuses every read and write of the evaluation folder and every write outside the workspace and the private directories the runtime hands the target (a started server's port-file directory, the audit report's directory, a per-call temp directory that `TMPDIR`, `TMP` and `TEMP` name, and Bubblewrap's status directory); reads elsewhere on the host are allowed and reported by the audit, since Node, git and a target's toolchain read the system and the project's git directory, so "reach nothing else" holds for writes and for the evaluation folder, and an ungranted read is recorded as the I/O matrix's "Ungranted path read" row says; `preflight` confines and refuses as `run` does, since the decision sits in the shared pipeline; a probe of the mechanism with a trivial process, a temp directory inside the evaluation folder, and an evaluation folder or temp directory whose path no profile can carry also refuse with exit 12, each asserted in `test/test-evaluate-run.js`)
**And** the confinement covers every process the target starts, those still running after the target exits included, until they end or the run ends: eval-quality releases its watchdog once the target exits on its own, and a `setsid` child escapes any process-group kill, so Story 1.8's round 2 review had a leftover process rewrite P-002's records and `run.json`'s `artifacts.records` after `run` exited and `score` exited 2 with no integrity finding; a case whose stub leaves a process running that, after `run` exits, rewrites a sealed record and the digest `run.json` recorded for it finds `score` refusing the run (the confinement refused the writes, or `score` holds the record to an anchor the leftover process could not reach); reverting the confinement for leftover processes lets `score` pass the rewritten record through to the engine, which the case catches (added 2026-09-24 in Story 1.8's final review round 2)
**And** a case in `test/test-evaluate-run.js` whose stub target tries to read the evaluation folder's `contract.json` and to write into `runs/` records both attempts refused and the run's artifacts unchanged; reverting the confinement makes the stub read the contract, which the case catches
**And** the isolation manifest's `observedMounts` lists the paths the confinement saw the target open outside its workspace, from the confinement's own report, and a case whose stub reads a path it was not granted asserts that path appears there and eval-quality records the isolation violation; reverting the report leaves `observedMounts` empty, which the case catches (amended 2026-09-29 in Story 1.31: the report comes from an audit preloaded into every Node process of the trial (`confinement-guard.cjs`), which judges and reports a path by its real path and reports anything under the evaluation folder even under a declared system path; for a process that is not Node the mechanism still denies the evaluation folder and every write outside the writable grants, whatever the process, while its other ungranted reads stay allowed and unreported until Story 1.60; command, tool-server and HTTP targets are each asserted, and `check` refuses two registry entries that start one target with different `systemPaths`)
**And** the confinement covers the evaluation layer's processes and every process of the run it starts: none can write under the evaluation folder's `evaluator/`, which closes the window Story 1.17 leaves between its re-read of the layer's files and the evaluator's launch, where a process that swaps a file and restores it goes unseen; a case whose stub target leaves a process that swaps a tracked `evaluator/` file after the re-read and restores it once the evaluator has launched finds the write refused and the records carrying the digests of the bytes that ran; reverting the confinement for `evaluator/` lets the swapped bytes run under the original digests, which the case catches (added 2026-09-25 in Story 1.17's final review round 2; amended 2026-09-29 in Story 1.31: the evaluation layer's processes, the command evaluator, the sealed-brief agent, the rubric judge and the HTTP port, hold the whole evaluation folder read-only, `runs/` included, and each is observed refusing a write there beside an opted-out control where it lands; the leftover and swapping processes report their attempt to a listener the case runs, so neither confined case passes without the attempt having been made)
**And** each forbidden input's note in the manifest states the confinement that withheld it, and `docs/reference/tea-evaluate-cli.md` states what is confined, on which platforms, and what an opted-out run records; a case asserts each forbidden input's note names the confinement and the reference's section, read under its exact heading, names each platform's mechanism, and restoring Story 1.8's note or deleting a platform from the passage fails the case (amended 2026-09-25 in Story 1.9: the criterion named no revert check)

**Dependencies:** 1.8, 1.17.
**Gate:** `npm test`.

### Story 1.32: Qualify a historical probe against two addressable deployments

Added 2026-09-25 in Story 1.9 from the gap its final review found: Story 1.9's historical route addresses revisions as git commits whose target launches from a worktree, so a target reachable only as a remote deployment, which AD-8 routes to the historical route, is probed against the same deployment at both revisions and is not measured.

As an adopter whose target is reachable only as a remote deployment,
I want a historical probe qualified against a pre-fix and a post-fix deployment I name,
So that a defect a release fixed is measured where no worktree can launch the target (AD-6, AD-8).

**Acceptance Criteria:**

**Given** a historical probe whose qualification names a pre-fix and a post-fix deployment, each an address the registry's `api` target policy authorizes (Story 1.11), with the release identifier each deployment reports (amended 2026-09-26 in Story 1.32: declared by the probe)
**When** `tea-evaluate run` qualifies it
**Then** the fail-before arm runs against the pre-fix deployment and must be violated, the pass-after arm against the post-fix deployment and must hold, the defect's manifestation-witness leg routes to the pre-fix deployment, and the probe's trials run on the arm `historical:<pre-fix release identifier>`; a `test:evaluate-arms` case over two loopback fixture servers asserts each routing from the servers' own request logs, and routing the fail-before arm to the post-fix deployment makes it hold and exit 11, which the case catches (amended 2026-09-26 in Story 1.32: the probe names `qualification.deployments`, a `preFix` and a `fix` deployment, each the `release` identifier it runs and the `origins` (`scheme://host[:port]`) each HTTP interface of the registry answers at, in place of `fixCommit`; a registry entry authorizes a deployment's origin in its `deployments` list, and the one authorization eval-quality allows for a deployment's origin is the whole policy of that deployment's arm; the release identifier is declared by the probe, since asking a deployment for it needs a report request the probe names, which Story 1.38 adds (amended 2026-09-30 in Story 1.38: each deployment names `report`, and the runtime asks it which release it runs before either arm); the two loopback fixture servers are the grader of `test/fixtures/evaluate-api/` started by the case itself, each logging its own requests, so the case asserts the fail-before arm, the witness leg and every trial at the pre-fix server in that order and the pass-after arm alone at the post-fix one; two probes naming one arm label at two targets exit 10)
**And** the qualified probe records `fixCommitDigest` as the digest of the post-fix release identifier and `artifactDigest` as the digest of the pre-fix one, each asserted by the case; recording one identifier for both makes the digests equal, which the case catches
**And** a deployment the registry does not authorize refuses the probe with its reason in `run.json`'s `refused` and `refused/<probeId>.json`, the rest of the run going on, a `test:evaluate-arms` case; dropping the refusal sends a request the adapter denies and the run exits 10, which the case catches (amended 2026-09-26 in Story 1.32: the runtime asks eval-quality's `evaluateTarget` which of the entry's authorizations, its `deployments` and its own when it names a deployed `port`, allows each origin, at the first method the entry authorizes; an origin whose scheme, host or port none admits is refused before its host is resolved; otherwise the host is resolved once, to its first address, and one that does not resolve within the entry's `maxElapsedMs` and the port call's start allowance leaves the deployment unreachable, exit 12; the reason names each authorization's denial in eval-quality's words, `port-not-authorized` in the case, for a pre-fix and for a post-fix deployment)
**And** `tea-evaluate check` exits 10 under the `historical` rule when a deployment-routed probe names one deployment but not the other, or names both and a `fixCommit`, each a `test:evaluate-check` case; dropping the rule lets `run` reach qualification and stop with exit 12, which the case catches (amended 2026-09-26 in Story 1.32: the rule also refuses a historical probe naming neither boundary, one release for both deployments, a deployment beside a registry entry that is not an HTTP entry, origins that are not an http or https origin for each HTTP interface of the registry and no other, and a pre-fix origin that reaches a post-fix one, each a `test:evaluate-check` or `test:evaluate-arms` case; `registry` holds each deployment origin's `host` and, under `auth` over `http`, its addresses to the entry's own rules, a `test:evaluate-api` case each)
**And** `docs/reference/tea-evaluate-cli.md` states which historical probes run from worktrees and which against deployments, and AD-8's historical route names both; a `test:evaluate-arms` case reads the reference's historical section under its exact heading and asserts it names both kinds, and deleting the deployment passage fails the case

**Dependencies:** 1.9, 1.11.
**Gate:** `npm test`.

### Story 1.33: Record eval-quality's denial reason for every denied call

Added 2026-09-25 in Story 1.17 from a gap its build found: eval-quality's command and MCP adapters report a denied request as the `forbidden-target` fault carrying the policy decision's detail text and not its reason code (`dist/adapters/command-line-adapter.js` and `dist/adapters/mcp-adapter.js` throw `forbidden(decision.detail)`), and neither `evaluateCommandTarget` nor `evaluateMcpTarget` is exported, so the bridge, the preflight legs and the trials record `executable-not-authorized`, `subcommand-not-authorized` or `tool-not-authorized` only as prose, while an `api` denial through the exported `evaluateTarget` carries its reason.

As an adopter reading why a call was denied,
I want every denial recorded with eval-quality's own reason code,
So that a CI policy or a test can tell an unlisted executable from an unlisted subcommand, tool or address without parsing prose (AD-1, AD-21).

**Engine consumption.** eval-quality ships a release whose `forbidden-target` fault carries the denying policy's `reason` (or exports the command and MCP policy decisions), and TeA's devDependency and peer floor rise to it with the engine check at start and end; the coordinator makes that change in eval-quality, and no TeA file parses the detail text in its place. (Amended 2026-09-25 in Story 1.10: eval-quality 4.2.0 carries `reason` on the `forbidden-target` fault its command and MCP adapters throw, `interface-not-authorized` for a request of another kind included, and Story 1.10 raised TeA's devDependency and peer floor to it.)

**Acceptance Criteria:**

**Given** that release
**When** a bridge call, a preflight leg or a trial step is denied, for `cli`, `mcp` and `api` alike
**Then** the recorded denial carries `{ code, reason, detail }` with the `reason` eval-quality's policy decided, a `test:evaluate-evaluators` case per kind asserting `executable-not-authorized`, `tool-not-authorized` and `address-not-authorized`; recording the detail alone leaves `reason` absent, which each case catches (amended 2026-09-25 in Story 1.10: Story 1.10 records eval-quality's `reason` beside the code wherever a denial is recorded, for every kind, in a bridge call (`{ code, reason, detail }`), a leg's `faults/` file, a qualification's fault and a trial's fault, and names it in the exit-10 message; `test:evaluate-evaluators` asserts a bridge call's `executable-not-authorized` for `cli` and `interface-not-authorized` for `mcp` and `api`, `test:evaluate-preflight` a leg's `interface-not-authorized` for `cli`, and `test:evaluate-mcp` `tool-not-authorized` in a qualification, a leg, a trial and a bridge call and `interface-not-authorized` in a leg; this story still owns the `api` kind through the adopter's HTTP port once Story 1.11 builds it, `address-not-authorized` asserted in a leg, a trial and a bridge call, and the reference section below) (amended 2026-09-25 in Story 1.11: Story 1.11 delivers the `api` kind: the HTTP port passes `evaluateTarget`'s reason as the `forbidden-target` fault's `reason`, and `test:evaluate-api` asserts `address-not-authorized` in a qualification, a leg, a trial and a bridge call and `method-not-authorized` in a bridge call; this story still owns the reference section below)
**And** `docs/reference/tea-evaluate-cli.md` names the reason codes a denial carries, and a `test:evaluate-evaluators` case reads the section under its exact heading and fails when a code is removed (amended 2026-09-30 in Story 1.33: the section is `### Denial reasons` under `## The registry`, a table of the eleven reasons eval-quality's target policies decide, and the case holds the table equal to eval-quality's exported `FORBIDDEN_TARGET_REASONS` and fails on a missing code and on one the policies do not decide, and a denied `cli` trial step's `subcommand-not-authorized` is asserted beside the `mcp` and `api` trial cases; the first criterion's cases were all delivered by Stories 1.10 and 1.11 and are unchanged here)

**Dependencies:** 1.10, 1.11, 1.17.
**Gate:** `npm test`, `npm run test:release-metadata`, engine check.

### Story 1.34: Qualify a sealed-brief agent evaluator before its verdicts count

Added 2026-09-25 in Story 1.17 from its live measurement: two live runs of one sealed-brief agent (`claude`, model `haiku`) over the verdict fixture chose different calls. In the first, every call sent the request on standard input and the mutated arm resolved `caught` in all three trials. In the second, the agent's calls sent no standard input, so the defect signature's selector (the `prompt` stdin key) matched none of the observations its findings cited, and eval-quality read the mutated set as Invalid (unwitnessed detection claim). The brief withholds the operation list by design, so nothing stops an agent from exercising the behavior without the input a signature selects on, and a run's verdict then depends on which calls the agent happened to make.

As an adopter whose evaluator is an agent,
I want the agent evaluator qualified against my own probes before a run's trials count,
So that a sealed-brief evaluation that only sometimes exercises the seeded defect is reported as an evaluation weakness and never read as a verdict about my target (AD-21, AD-22).

**Acceptance Criteria:**

**Given** a `sealed-brief-agent` evaluator and `evaluation.json`'s `evaluatorQualification` (`attempts` and `minimumAgreement`, which the adopter sets and no template fills)
**When** `tea-evaluate run` runs
**Then** before the first trial it runs the agent `attempts` times on the clean arm and on each mutated arm, scores each attempt's record with `eval-quality score` against its probe, and writes `runs/<invocationId>/evaluator-qualification.json` with each attempt's outcome copied from its evidence artifact and the agreement per arm; an agreement below `minimumAgreement` exits 11 as an evaluation weakness with no trial record; a stub agent that omits standard input on one attempt of two drops the mutated arm's agreement to 0.5 and, with `minimumAgreement` 0.9, exits 11, a `test:evaluate-evaluators` case; dropping the qualification lets that run seal records eval-quality reads as Invalid, which the case catches
**And** `tea-evaluate check` exits 10 under the `evaluator` rule when a `sealed-brief-agent` evaluator declares no `evaluatorQualification`, a `test:evaluate-check` case; dropping the rule lets the run reach its trials unqualified, which the case catches
**And** every outcome in `evaluator-qualification.json` equals the evidence artifact's, compared byte for byte, so the runtime computes no outcome (AD-1), and writing an outcome the artifact does not hold fails the case (amended 2026-09-30 in Story 1.34: an attempt eval-quality reads as Invalid exits 3 and emits no artifact, so it is recorded with `exitCode: 3`, `evidence: null` and the engine's `invalid:` stderr lines and counts as disagreeing; a probe's agreement is the fraction of attempts whose reduced state equals the arm's expected state, `passed-clean-control` on the clean arm and `caught` on a mutated arm, and an arm's agreement is the lowest agreement among its probes; historical and gameability arms are not qualified; attempts write nothing under `trials/` and use no `trial-` workspace label; the two numbers join `EvaluatorConfiguration.decodingParameters`; `check` also refuses `evaluatorQualification` beside any other evaluator kind, where it is unused; the reference's exit 11 row, which omitted judge calibration's exit 11, lists it)

**Dependencies:** 1.17, 1.21.
**Gate:** `npm test`.

### Story 1.35: Judge a tool server that crashes mid-call

Added 2026-09-25 in Story 1.10's final review from a gap it found: eval-quality's MCP adapter rejects a `tools/call` whose session ended before it answered (the server exited, a signal ended it, or it wrote a line that is no JSON-RPC message) with `port-failure`, and its `McpProbeObservation` has no field for how the session ended, so `tea-evaluate` stops such an arm with exit 12.
A command step that crashes by a signal of its own is an observation its oracles judge, and a tool server that crashes during a call is not, so a mutation that crashes the server can never be caught on an `mcp` interface.

As an adopter whose tool server can crash,
I want a server that ends its session mid-call recorded as an observation my oracles judge,
So that a crash mutation on an `mcp` interface is caught as a command crash is (AD-4, AD-7).

**Engine consumption.** eval-quality ships a release whose MCP adapter answers a `tools/call` that ended the session after the handshake with an `mcp` observation carrying how it ended (the server's exit code or the signal that ended it), and keeps `port-failure` for a server that cannot start or refuses its handshake; TeA's devDependency and peer floor rise to it with the engine check at start and end, and the coordinator makes that change in eval-quality. (amended 2026-09-30 in Story 1.35: the engine carries one signed `exitCode` on the `mcp` observation, a signal's number made negative, and the record holds it on its `exit-code` channel; eval-quality 4.4.0 delivers the observation; under Bubblewrap the runtime reads the signal from the shim's status file, `128 + n` becoming `-n`, as it does for a command.)

**Acceptance Criteria:**

**Given** that release and a mutation of the MCP fixture's server that makes `grade_answer` exit before it answers
**When** `tea-evaluate preflight` and `run` run over the fixture
**Then** the mutated arm's step is recorded as an observation carrying the ended session on the record's `exit-code` channel (amended 2026-09-30 in Story 1.35: `responseStatus` 1, an absent `responseBody` and the server's signed `exitCode`, `null` on an answered call, and an oracle or defect signature may name `/interactions/<step>/exit-code`), preflight exits 0 and the mutated arm resolves `caught`, a `test:evaluate-mcp` case; projecting the ended session away, so the step stops the arm, makes preflight exit 12, which the case catches
**And** a server that cannot start, refuses its handshake or crosses a ceiling still stops the run with exit 12, and the existing `test:evaluate-mcp` cases for them stay green; recording a refused handshake as an observation turns the handshake case red (amended 2026-09-30 in Story 1.35: a server ended by a signal from outside, `SIGHUP`, `SIGINT`, `SIGQUIT`, `SIGKILL` or `SIGTERM`, also stops the run with exit 12, the rule a command step follows through `stoppedFromOutside`, and a server's own signal such as an abort is recorded; the sealed-brief agent's bridge applies the same rule and its tool result carries `exitCode`)
**And** `docs/reference/tea-evaluate-cli.md` replaces the limit Story 1.10 states (a mutation that crashes the server is never caught on an `mcp` interface) with how an ended session is recorded, and the run section's crash sentence covers a tool server beside a command

**Dependencies:** 1.10.
**Gate:** `npm test`, `npm run test:release-metadata`, engine check.

### Story 1.36: Hold an HTTP entry to eval-quality's own target-policy parser

Added 2026-09-25 in Story 1.11 from a gap its build found: eval-quality 4.2.0 exports `parseCommandTargetPolicy` and `parseMcpTargetPolicy` from `eval-quality/adapters` and no parser for its HTTP `ProbeTargetPolicy` (`dist/core/schemas/probe-policy.js` declares the schema; `dist/adapters/index.d.ts` exports no parser for it), so `tea-evaluate`'s `ApiRegistryEntry` repeats the authorization's field rules (the schemes, the port range, the method list, the non-empty address list, the ceilings' minimums) in the runtime's own `evaluation.json` schema, and a rule eval-quality adds or changes reaches `check` only when someone copies it.

As an adopter with an HTTP target,
I want my registry's HTTP entries held to eval-quality's own reading of an HTTP authorization,
So that `check` refuses exactly what the engine's policy refuses, with no copy of its rules to drift (AD-1).

**Engine consumption.** eval-quality ships a release exporting a `ProbeTargetPolicy` parser, as it exports `parseMcpTargetPolicy`, and TeA's devDependency and peer floor rise to it with the engine check at start and end; the coordinator makes that change in eval-quality. (amended 2026-09-30 in Story 1.36: eval-quality PR #170 adds `parseProbeTargetPolicy` to `eval-quality/adapters`, released as 4.5.0, and TeA's peer floor rises to `>=4.5.0`.)

**Acceptance Criteria:**

**Given** that release
**When** `tea-evaluate check` reads a registry with an HTTP entry
**Then** the entries become the policy the runtime builds, a started server's entry at a placeholder port, and eval-quality's parser reads it; an entry the parser refuses is a `registry` finding naming the parser's reason, a `test:evaluate-api` case; skipping the parser lets the case exit 0, which the case catches
**And** the runtime builds each call's policy through the same parser before any service starts, so a policy the parser refuses stops the call with the parser's fault, a `test:evaluate-api` unit; building the policy by hand lets the refused field reach the port, which the unit catches
**And** `ApiRegistryEntry` keeps the authorization fields at their JSON types and leaves their rules to the parser, and a `test:evaluate-api` case reads the schema and fails when one of those fields carries a rule of its own; restoring a copied rule fails the case

**And** (amended 2026-09-30 in Story 1.36) the policy handed to the parser has the shape `authorizationOf` and `deploymentCandidates` build: each `deployments` origin is an authorization of its own, read and reported alone (`registry[n].deployments[m]`), so a finding names what the parser refused; the placeholder port of a started server's entry is its scheme's default port; the `maxElapsedMs` ceiling of 2147483647 leaves the schema with the other copied rules, since eval-quality's HTTP policy sets none and the runtime's timers already hold a larger value; `uniqueItems` on `addresses`, `methods`, `safeMethods` and `deployments` leaves with them; a `test:evaluate-api` trial unit shows a registry built without `check` over a refused field stopping with exit 12

**Dependencies:** 1.11.
**Gate:** `npm test`, `npm run test:release-metadata`, engine check.

### Story 1.37: Know a started HTTP server by the port it bound itself

Added 2026-09-25 in Story 1.11 from its review: for a registry entry with a `server`, the runtime takes a free port, releases it and hands its number to the server in `portEnvironmentKey`, then waits until that port accepts a connection. Another process can take the port in between: the server then fails to bind and ends, and when that process answers before the server's end is reported, the answer is recorded as the workspace's. Story 1.11 refuses an answer that arrives after the call's server ended other than with exit code 0, which closes the case once the end is reported, and leaves the window before it open.

Amended 2026-09-26: delivered 2026-09-26 in Story 1.11's pull request, PR #243, because the chosen-port window made `test:evaluate-api` flaky under parallel load.
The fixture's registry names `portFileEnvironmentKey`, so no suite case but the chosen-port units reaches a server through the chosen port.
The delivery also has `check` refuse (`registry`) a `portFileEnvironmentKey` equal to `portEnvironmentKey` and either key named in `environmentKeys`, and refuses an answer the port gives before the call's server is ready (exit 12); TeA's host probes the call again at the reported port, so eval-quality's policy decides at the port the server bound.

As an adopter whose HTTP target the runtime starts,
I want the runtime to reach the server it started and nothing else on its port,
So that no answer from another process is ever recorded as my target's (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a registry entry whose `server` names a `portFileEnvironmentKey`
**When** a call starts the server
**Then** the runtime passes `0` in `portEnvironmentKey` and a private file path in `portFileEnvironmentKey`, the server binds a port the system chooses and writes its number to that file, and the runtime sends only once the file names a port that accepts a connection while the server runs; a `test:evaluate-api` case whose fixture server binds port 0 and reports it passes the pipeline, and a case in which another process listens on the port the runtime would have chosen reaches only the fixture server; restoring the chosen-port handoff lets the other process answer, which the case catches
**And** a server that writes no port within `readyTimeoutMs`, or a port that is not a number, is a target that could not run (exit 12), a `test:evaluate-api` case each; reading a missing file as ready sends to no server, which the case catches
**And** the private file's directory is on the run's scratch list, so a signal leaves the temp directory empty, a `test:evaluate-api` case; an unregistered directory survives the signal, which the case catches
**And** `docs/reference/tea-evaluate-cli.md` states both handoffs and the window the chosen-port handoff leaves, and the case reading the passage fails when the window's sentence is removed

**Dependencies:** 1.11.
**Gate:** `npm test`.

### Story 1.38: Hold a deployment to the release it reports

Added 2026-09-26 in Story 1.32 from a gap its build accepted: a deployment-routed historical probe declares the release identifier each deployment runs, and the run records the digests of those identifiers without asking either deployment which release it runs.
A deployment redeployed after the probe was authored is measured under the identifier the probe declares: the qualification arms catch a pre-fix deployment that no longer shows the defect (exit 11), and nothing catches one that still shows it under another release.

As an adopter whose historical probe runs against two deployments,
I want each deployment's reported release held to the one my probe names,
So that the digests a qualified probe records name the releases the run measured (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a deployment-routed historical probe whose deployments each name how the deployment reports its release (an operation of the contract's `api` interface and a JSON pointer into its answer's body)
**When** `tea-evaluate run` qualifies it
**Then** before either arm the runtime sends that request to each deployment through the evaluation's HTTP port, and a reported identifier other than the declared `release` refuses the probe with both identifiers named in `run.json`'s `refused` and `refused/<probeId>.json`, a `test:evaluate-arms` case over two loopback fixture servers that report their release; skipping the comparison lets a deployment reporting another release qualify, which the case catches (amended 2026-09-30 in Story 1.38: the fixture grader answers `GET /release` with the release it was started with, each deployment's `report` is required by the probe schema, the request runs through `runArm` as a one-step plan with no bound inputs so it is built as every `api` step is, the pre-fix deployment is asked first and a refusal there leaves the post-fix one unasked, and `run.json` gains `releases`, each qualified probe's declared and reported identifier for both sides)
**And** eval-quality's policy decides the report request as it decides every call, and a denial, or an answer with no string at the pointer, refuses the probe with its reason, a `test:evaluate-arms` case; recording the declared release unasked lets the case exit 0 with no refusal, which the case catches (amended 2026-09-30 in Story 1.38: a "failed call" is read as an answer that is no 2xx, which has no string at the pointer and refuses the probe with its status named; a call that reaches no answer, or passes a ceiling of the registry entry, is a target that could not run and stops the run with exit 12 as it does for any call, so the "call's fault" a refusal names is eval-quality's denial reason alone; a report identifier in a refusal is quoted as JSON writes it with every character outside printable ASCII escaped, cut at 160 characters)
**And** `check` refuses under `historical` a report request naming an operation the contract does not declare, or a pointer that is not a JSON pointer, a `test:evaluate-check` case each; dropping the rule lets `run` stop with exit 12, which the case catches (amended 2026-09-30 in Story 1.38: `check` also refuses under `historical` a report operation that is declared on two interfaces or on a non-`api` one, one of an interface the registry does not serve over HTTP, one the contract marks as changing state, and one that needs an input, a path parameter or a required key in any channel, since nothing binds one; the runtime's `deploymentPair` holds the same rules with exit 12 and a deployment with no `report`, a `test:evaluate-arms` unit since `run` always runs `check` first; a deployment with no `report` fails the probe schema under `schema`)
**And** the reference's `### Against deployments` states the comparison, and the case reading the section fails when its sentence is removed

**Dependencies:** 1.32.
**Gate:** `npm test`.

### Story 1.39: Tell a captured value too large to launch from a target that cannot run

Added 2026-09-26 in Story 1.18 from a gap its build review accepted: a `captured` binding sends the value a target printed, and a command step the value makes too large for the system's argument and environment limit fails to launch; eval-quality's command-line adapter reports that as `port-failure` with the spawn's `E2BIG` as its cause, the same fault as a target that could not start, so the run stops with exit 12 and reads the target's own output as an unfit harness.
Story 1.18 skips a step whose captured value the request cannot carry for every other reason it can decide before the launch (`captured-value-unsendable`); the size limit is the system's, and only the launch knows it.

As an adopter whose workflow step passes on a value an earlier step printed,
I want a value too large to launch recorded as a step not issued,
So that a target printing an oversized value is judged on that behavior and the run goes on (AD-7, AD-10).

**Engine consumption.** eval-quality ships a release whose command-line adapter reports a launch the system refused for its argument and environment size with a `RuntimeFault` reason of its own, as a policy denial carries `reason`, and TeA's devDependency and peer floor rise to it with the engine check at start and end; the coordinator makes that change in eval-quality.
Amended 2026-10-01 in Story 1.39: the engine carries the value on a field of its own, `portFailureReason` (`launch-too-large`), so `RuntimeFault.reason` keeps its type, and the arm reads `error.portFailureReason` on a `port-failure` fault and records it beside `reason` in the fault record.

**Acceptance Criteria:**

**Given** that release and Story 1.18's workflow fixture, whose `create` prints an identifier larger than the system's argument limit in the workspaces a test names
**When** `tea-evaluate run` runs
**Then** the dependent step is not issued and the trial's evidence lists it as `captured-value-unsendable` naming the binding and eval-quality's reason, the run exits 0, and the probe's outcome read from the evidence artifact is not `caught`, a `test:evaluate-workflow` case; stopping the run on the fault as before makes the case exit 12, which the case catches
**And** a command step with only literal bindings that the system refuses for its size still stops the run with exit 12, since the contract itself cannot be sent, a `test:evaluate-workflow` unit; skipping it as well lets the unit pass a contract defect, which the unit catches
**And** the reference's `### Steps not issued` names the size limit among the values the request cannot carry, and the case reading the section fails when that sentence is removed

**Dependencies:** 1.18.
**Gate:** `npm test`, `npm run test:release-metadata`, engine check.

### Story 1.40: Calibrate rubric scores imported from harness records

Added 2026-09-26 in Story 1.21 from its review: a `records` evaluator imports sealed records and its evaluator configuration from an adopter harness. Story 1.21 gates rubric judgments made by TeA's own scorer, but an imported rubric score has no verifiable calibration path. Story 1.21 makes `check` refuse a rubric with a `records` evaluator until the harness can prove that its scorer passed the same calibration gate.

As an adopter bringing rubric scores from my harness,
I want the imported scorer calibrated against my labelled anchors,
So that its sealed records count only after its rubric judgments meet the agreement threshold (AD-21, AD-22).

**Acceptance Criteria:**

**Given** a `records` evaluator, a rubric, and labelled calibration items covering every criterion and anchored level
**When** `tea-evaluate run` prepares to import trial records
**Then** the harness supplies verifiable calibration judgments produced by the same scorer configuration and path that produced its trial scores, without sending `expectedLevel` to that scorer; the runtime validates the provenance and reports exact agreement and largest level distance per criterion in `runs/<invocationId>/judge-calibration.json`, a `test:evaluate-records` integration case; accepting a report with a different scorer configuration or with labels in scorer input fails the case
**And** agreement below `judgeCalibration.minimumAgreement` exits 11 before any imported trial record is copied or scored, a `test:evaluate-records` case; removing the gate lets the case write a record
**And** the calibration file digest and minimum agreement are bound to the imported `EvaluatorConfiguration` and scoring version, a `test:evaluate-records` case; dropping either binding check admits a configuration without it, and the missing or wrong binding case exits 0
**And** a `records` evaluator without a rubric still imports and scores through its existing path, while `check` refuses rubric records whose calibration provenance is absent or unverifiable, a `test:evaluate-check` case; bypassing the refusal accepts an uncalibrated rubric

**Dependencies:** 1.17, 1.21.
**Gate:** `npm test`, `npm run test:release-metadata`, engine check.

(Amended 2026-10-01 in Story 1.40: the harness writes the judgments as `<records>/calibration-judgments.json`, `{ schemaVersion, scorerConfigurationDigest, items: [{ rubricId, criterionId, scorerInput, answer }] }`, one item per labelled item in the labelled file's order. `scorerInput` is compared whole with the label-free observation the runtime derives from the item, and `scorerConfigurationDigest` is `digestArtifact` over the imported configuration without its two `tea.judgeCalibration*` keys, since the full configuration's digest covers the labelled file's digest. `check` and `run` verify with one function; the verification is exit 10 and the gate is exit 11. A harness that needs proof its scorer ran uses a `command` evaluator.)

(Amended 2026-10-01 in Story 1.40: the records cases run as test:evaluate-records, a group of the same test file, so the shard holding the evaluators script stays under the job timeout.)

### Story 1.41: Confine score output during concurrent run-directory changes

Added 2026-09-26 in Story 1.21 from final review. A planted `scores` link made `tea-evaluate score` write into the adopter repository. Story 1.21 refuses that link before scoring. A process changing a score directory while the engine runs can still redirect an output, because the score path does not use the held directory protections of `run`.

As an adopter scoring a run,
I want every score artifact and diagnostic held inside that run's output directory,
So that a target process cannot redirect a score write into my working tree (AD-7, AD-12).

**Acceptance Criteria:**

**Given** a valid sealed run whose `scores` parent is a real directory
**When** a second `score` invocation runs, or a target process replaces a score invocation or probe directory with a link immediately before an output write
**Then** scoring either writes all evidence and diagnostics under the original held run directory or exits 12 before an external write; an end-to-end fixture races the replacements and compares the adopter's git status and external sentinels before and after; removing the held-directory check makes that fixture change at least one sentinel
**And** a normal repeated score invocation succeeds and preserves both score invocations, while a planted link at `scores`, the invocation directory, or a probe directory is refused without an engine call; a regression fails if any planted link is followed
**And** the stage record preserves the actual eval-quality argv, stdout, stderr and exit code, and a direct CLI re-score reproduces the persisted evidence byte for byte; rewriting the argv to hide a private staging path or copying an unverified artifact fails the provenance and digest checks
**And** the CLI reference describes the score-output integrity refusal, with a static test that fails if that section is removed

**Dependencies:** 1.8, 1.21.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, engine check.

(Amended 2026-10-01 in Story 1.41: the invocation identifier is drawn when `score` starts, so a process cannot plant an entry at its directory before it exists; the end-to-end fixture plants links at the next probe directory and at each path a score file will be written, swaps the scores parent, the invocation directory and the probe directory, and the writer's own unit cases plant a link, a file and a directory at `scores`, an invocation directory, a probe directory and a score file. The refusal of a staged artifact is stated in the third criterion's terms: the staged `--out` artifact is copied in only when it meets eval-quality's published schema, names the run's corpus digest and carries an outcome for the probe, and the copy is read back through the held directory, so a malformed, foreign-corpus, wrong-probe or linked artifact exits 12 with no evidence copied. The check cannot tell the engine's artifact from a well-formed one a process with access to the private staging directory substituted; Story 1.68 closes that. The score views take the parsed evidence the writer read back, so they read nothing from a score directory.)

### Story 1.42: Attribute reused operation IDs to their interfaces

Added 2026-09-26 in Story 1.22. Eval-quality permits the same `operationId` on two interfaces, while a sealed observation records only `operationId`. Story 1.22 refuses that contract during `check` so a scored finding cannot be assigned the wrong phase. Supporting this valid contract shape requires interface identity in the sealed observation and an interface-qualified phase map.

As an adopter whose contract reuses an operation ID on two interfaces,
I want interpretation to identify which interface produced each cited observation,
So that process and outcome findings keep their correct phase (AD-23).

**Acceptance Criteria:**

**Given** two permitted interfaces declaring the same operation ID with distinct phases
**When** the published eval-quality sealed-record schema and TeA's runtime record an observation on either interface
**Then** each observation carries its `interfaceId` beside `operationId`, and the schema rejects an observation missing that identity; a real two-interface fixture fails if either adapter omits the field
**And** `evaluation.json` classifies interface-operation pairs, `check` accepts exact coverage of both and exits 10 for a missing or undeclared pair; reverting the pair check admits one of those bad cases
**When** `tea-evaluate score` writes `interpretation.json`
**Then** every citation includes `interfaceId` and the phase of that exact pair; process and outcome references stay separate even when operation IDs match, and removing interface identity makes an integration assertion fail
**And** a record from the prior schema version is refused with a named compatibility finding, while the runtime's engine floor and lockfile name the published eval-quality version that carries interface identity; accepting a prior record or lowering the floor fails the integration and release-metadata checks

**Dependencies:** 1.22 and a published eval-quality release carrying interface identity in sealed observations (eval-quality 5.0.0, below).
**Gate:** `npm test`, `npm run test:release-metadata`, engine check.

**Decision (2026-10-02, lane 3).** eval-quality 4.7.0 did not carry interface identity, so lane 3 owned an engine change and a major release before this story built. The engine's `Observation` and `InteractionStep` gained a required `interfaceId`, a sibling-group operation member became an `{ interfaceId, operationId }` pair, and every lookup the plan index, selection, the probe witness match, the finding map and coverage make became a pair lookup, which removes the `operation-identifier-collision` ladder row. Qualifying only the observation or only the step was turned down: the first leaves two steps naming one operation ambiguous in selection and the second leaves an evaluator-chosen observation with no derivable interface. The change landed as three engine pull requests and one release: stamps read before parse (eval-quality #173), `PreflightCheck.interfaceId` and preflight verdict 2 (#174), interface identity (#175), and 5.0.0 (#176). Wording amended against the shipped shapes: the "prior schema version" is a sealed run record of version 6, which TeA's `score` reports as `sealed-run-record carries "schemaVersion" 6 where this build reads 7` before any engine call, and the engine names as `schema-version-mismatch` (exit 5); `evaluation.json` moves to `schemaVersion` 2 with `operationPhases` keyed by interface and then operation, and a version 1 file exits 10 on its schema version.

### Story 1.43: Keep ungraded framework errors out of target findings

Added 2026-09-27 in Story 1.23's final review. Story 1.20 explicitly converts a promptfoo result with no `gradingResult` into a failing judgment row. That result says the framework could not grade the output. It does not establish that the target violated an oracle. This story supersedes that one Story 1.20 error-row rule and its matching test-design row.

As an adopter using an external evaluation framework,
I want an ungraded framework result reported as an evaluation failure,
So that an assertion crash cannot appear as a caught target defect (CAP-13, AD-10, AD-21).

**Acceptance Criteria:**

**Given** a promptfoo JSONL row whose `gradingResult` is absent, including one with an `error` string and a target stdout observation to cite
**When** the Story 1.20 fixture evaluator or the Story 1.23 starter template imports that row
**Then** it refuses the row with a diagnostic that names the ungraded framework error; `tea-evaluate run` exits 12 as evaluator infrastructure failure and writes no sealed trial record for it; reverting the refusal lets the same row become a target `fail` judgment and makes the test fail
**And** a graded assertion with `pass: false` still maps to a target `fail` row with its observed quote, while a graded `pass: true` still maps to `pass`; a test that turns either graded result into infrastructure failure fails
**And** the imported result must include every expected assertion grade exactly once. Missing, duplicate or malformed grades are evaluation failures with no trial record, even when another assertion graded successfully
**And** the evaluator guide and promptfoo example explain that an ungraded framework row stops the evaluation, while a graded failing assertion supplies target evidence; a guidance test fails when that distinction is removed
**And** `test:evaluate-promptfoo` and `test:evaluate-guidance`, both in `npm test`, exercise the fixture and rendered starter against an ungraded row, a graded fail and a graded pass, and the completion notes record each revert check.

**Dependencies:** 1.20, 1.23.
**Gate:** skill gates, `npm test`, engine check.

The installed promptfoo grades a thrown assertion as a failing component, so a thrown `javascript` assertion or a crashing code file stays a target `fail` row here; Story 1.70 closes it (added 2026-10-01; closed in Story 1.70's build, 2026-10-02: both evaluators now refuse such an assertion).

### Story 1.44: Record installed framework versions in evaluator provenance

Added 2026-09-27 in Story 1.23's final review. The command evaluator digests tracked `evaluator/` files and wiring, including `LEARNED.md`, but an installed dependency outside that tree can change while those bytes stay fixed. Its new behavior can produce judgments under the same evaluator configuration digest.

As an adopter whose evaluator uses an installed external framework,
I want each run bound to the framework version that actually executed,
So that a package upgrade cannot silently reuse the old scoring configuration (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** a `command` evaluator with one or more external framework dependencies
**When** `tea-evaluate check` and `run` prepare its layer
**Then** the evaluation declares each dependency's package identity, expected version and version-probe command in tracked, machine-readable `evaluator/` metadata; the probe runs with the command evaluator's environment and reports installed package identity and version without importing that framework into `cli/`; a dependency-free `command` evaluator declares an empty list; `check` refuses an absent or malformed declaration and verifies that the versions recorded in `evaluator/LEARNED.md` agree with nonempty declarations
**And** `run` reads the installed versions before any evaluator trial, refuses a missing dependency or an installed version that differs from the declaration with exit 12 and no sealed trial record, and records the observed package identities and versions in `EvaluatorConfiguration.decodingParameters` and an auditable run artifact; reverting that observation lets an installed-package upgrade pass under the old configuration digest and makes the test fail
**And** the run rechecks those installed versions before each evaluator launch and after each trial. A change during the run exits 12 without sealing the affected trial's record; reverting the recheck lets a changed dependency judge a trial under the earlier configuration digest and makes the test fail
**And** a deliberate upgrade updates the tracked declaration and `LEARNED.md`; its next run succeeds and produces a different `EvaluatorConfiguration` digest and scoring version, even when every evaluator source file and `evaluation.json` field is otherwise unchanged; a direct configuration test with the same evaluator tree and wiring also proves that changing only the observed version changes the digest
**And** the AgentEvals and promptfoo starter templates demonstrate the declaration and version observation, and `references/evaluator.md` teaches the same step for an unfamiliar framework without adding a framework import to `cli/`; `test:direction` and `test:evaluate-boundaries` hold framework neutrality
**And** `test:evaluate-evaluators` and `test:evaluate-guidance`, both in `npm test`, use isolated installed-package fixtures to prove stale documentation, missing package, package upgrade and mid-run change behavior, with each named revert check recorded in completion notes.

Amended 2026-10-01 in the Story 1.44 build. No eval-quality change: the observed versions travel in the caller-owned `decodingParameters["tea.evaluatorFrameworks"]`, a list of `{ package, version }` sorted by package, present on every `command` evaluator's configuration (an empty list for a dependency-free one) and absent from every other kind. The declaration is `evaluator/frameworks.json` (`schemaVersion` 1; per framework `package`, the exact `version` expected, and `probe` as `{ command, args }` where `command` is a tracked regular executable under `evaluator/`, so the probe's own bytes are in the tree digest). The probe prints exactly `{ "package", "version" }` and exits non-zero when the package is missing. It is launched through the evaluator's own launch path (`command-evaluator.js`: the base environment and `environmentKeys`, an empty private working directory, the run's confinement, `timeoutMs`), and the skill ships `installed-version.mjs` for Node packages. `check` reads the files, runs no probe, and cross-checks `evaluator/LEARNED.md`: its `## Framework and installed version` section must hold one backticked `package@version` per declared package, no other version of it and no package the declaration omits, and a nonempty declaration needs a `LEARNED.md`. `run` observes before calibration and the first trial, again before each launch of the evaluator and after each trial (calibration launches included), compares every read with the declaration, and exits 12 with no sealed record on a missing, different or changed package; `framework-versions.json` in the run directory keeps the declared and observed versions and a failed probe's output, and `run.json`'s `evaluator.frameworks` repeats the observed list. `score` and replay read the recorded `evaluator-configuration.json`, so a recorded run scores byte for byte after the package moves. Sealed-brief agents and the other kinds declare nothing here.

**Dependencies:** 1.17, 1.23.
**Gate:** skill gates, `npm test`, engine check.

### Story 1.45: Aggregate development strength through eval-quality

Added 2026-09-28 in Story 1.14's final review. The current `tea-evaluate score` invokes eval-quality once per probe and persists one evidence artifact per probe. A class component in that artifact describes only that probe. `evaluation.json.strengthFloor` cannot be applied to all probes in a run from those artifacts without a new aggregation contract; TeA must not invent a strength verdict outside eval-quality (AD-6).

As an adopter,
I want eval-quality to report the run-wide strength of my qualified development probes,
So that the class floors I chose can govern held-out readiness using an engine-owned result (CAP-9, CAP-10, AD-6).

**Acceptance Criteria:**

**Given** a completed development run with several qualified probes in one class
**When** `tea-evaluate score` reads the engine-owned aggregate result
**Then** the result reports the distinct qualified probe denominator, caught count, class rate, comparability, and the decision against each declared `evaluation.json.strengthFloor`; TeA copies that result and its lineage into the run without recomputing a rate or verdict
**And** a fixture with four caught probes among five at a `0.75` floor meets the floor, while the same engine evidence at a `0.9` floor does not; reverting the aggregation or floor comparison makes both fixture assertions fail
**And** a class with no eligible probe remains `null`, an admitted class with no exercised probe reports `rate: null`, and a trial set below `minimumTrialCount` is non-comparable; clean controls and canaries remain outside every class denominator, with each boundary held by a revert check
**And** the aggregate is produced by a published eval-quality release, bound to the run's engine version and evidence digests, and reproduced byte for byte by replay; a mismatched or missing aggregate blocks a class-wide strength claim
**And** `references/run.md` and `references/gaps.md` read that aggregate to enforce the adopter's class floors before held-out execution. Their guidance test fails if the source, floor decision, or null and non-comparable readings are removed.

Amended 2026-10-01 in the Story 1.45 build. eval-quality 4.7.0 (engine PR #172) ships the `aggregate-strength` stage, so the peer floor is `>=4.7.0` everywhere it is recorded. `score` calls it once per invocation through the CLI stage runner, after the probe loop and only when every probe copied an evidence artifact; floors are `evaluation.json.strengthFloor`, read once and copied into the score directory as `strength-floors.json`; the aggregate is copied as `strength-aggregate.json` after a schema, evidence digest, probe set and engine version check, and a disagreement exits 12. The aggregate covers the probes the invocation scored (a `--partition` run aggregates its own partition), and a held-out floor stays out of scope. `canary` leaves `strengthFloor`: the engine admits `defect`, `gameability` and `zero-action`, and TeA's run cannot execute a canary route at all (a probe on a route `run` does not execute exits 12), so the canary boundary rests on the engine's own suite and on the engine's refusal of a canary floor (exit 5), which TeA's end-to-end case exercises.

**Dependencies:** 1.8, 1.14, 1.21.
**Gate:** engine release and export check, skill gates, `npm test`, `npm run test:release-metadata` when the pin changes.

### Story 1.46: Close the dogfood suite's coverage gaps

Added 2026-09-28 by Story 1.16's proof run. Every evidence artifact of that run records `contractVerdict: CONCERNS`: eval-quality found the `success-indicator-separation`, `malformed-input`, `per-record` and `omission-and-completeness` rules unsatisfied at `critical`, and B-002 (Stage 1 maps a web application to `api`) has no seeded or held-out probe because its rule is stated four times across `references/inspection.md` and `references/adapters.md`. The proof also records drift this story corrects: `requirements.md` describes fixed answer lines where the contract reads JSON fields, P-002 and P-003 share the defect ID `D-001`, `corpus/README.md` counts three statements of the rule, and `assets/evaluation-folder.gitignore` leaves the compile and seal outputs Stage 6 writes unignored. Story 1.16 records the run once, as found; closing the gaps changes the contract and needs a new run.

As a TEA maintainer,
I want Evaluate's gap loop to close the gaps it named on its own suite,
So that the baseline Story H.1 accepts is a PASS with no coverage gap at or above the severity floor (CAP-3, CAP-10, AD-15).

**Acceptance Criteria:**

**Given** `test/evaluations/bmad-testarch-evaluate/` and the gaps G-1 to G-5 recorded in `epic-1-proof.md`
**When** a maintainer session runs Evaluate's Stage 11 author, rerun and rescore loop on it through the local Claude Code CLI
**Then** it authors the probe, oracle or evidence pointer each unsatisfied rule names: an oracle that holds the answer to evidence independent of the skill's own claim, a malformed-input probe (an exit the exit table does not list, or a request naming no exit) with an oracle for a refusal to guess a class, the classified exits declared as a collection with per-record pointers, and a completeness probe over every exit the table lists
**And** B-002 either carries a seeded probe whose mutation edits the single place the web-to-`api` rule is stated, after the skill states it in one place through the builder's Edit process, or keeps its refusal with the reason, recorded in the evaluation's `corpus/README.md`
**And** `tea-evaluate check`, `eval-quality compile` and `seal` exit 0, preflight passes, every clean control resolves `passed-clean-control`, every seeded probe, development and held-out, resolves `caught` at `minimumTrialCount`, and every evidence artifact records `contractVerdict: PASS` with no coverage gap at or above `severityFloor`
**And** `requirements.md` states the JSON answer fields as the admissible evidence, with `sourceSpecDigest` and `requirements.digest` restamped, each seeded probe carries its own defect ID, `corpus/README.md` counts the rule's statements correctly, and the skill's `assets/evaluation-folder.gitignore` ignores `compiled-contract.json` and `sealed-brief.json`
**And** the before and after outcome of each gap is recorded in the gap report and in `epic-1-proof.md`, and the suite manifest's thresholds still equal `evaluation.json` and the scoring policy, which `test:eval-schemas` holds
**And** `npm run test:evaluate-dogfood` replays the committed folder offline through the real CLI over real eval-quality, with a deterministic reader of the skill's guides in the model's place, and holds the `PASS` artifacts, the `caught` and `passed-clean-control` outcomes at `minimumTrialCount` and the return of each gap's engine rule when its repair is removed

Amended 2026-10-03 in the Story 1.46 build. The repair closes the four engine rules in the contract and adds two behaviors beside B-001 and B-002. B-003 (material): Stage 11 lists every row of its AD-10 exit table. The operation declares `/exits` as a collection location naming the reference set `exit-table` (the table's thirteen ids), O-003 reconciles the records against it with `covers-by-key` and tests each record's class with `for-all`, and `test:evaluate-dogfood` holds the set equal to the table in `references/gaps.md`. The classified exits G-3 asked for are the thirteen `/exits` records. B-004 (material): a request with no usable exit gets a refusal and no class. The step `refuse-no-exit` binds the `type-violating` matcher on a declared `stdin.exit` key, O-004 reads the refusal, and `references/gaps.md` gained one sentence saying such a request has no class, so the behavior is the skill's own and the seed M-005 edits that sentence. Every oracle reads the reply's `status` claim beside the answer fields, which closes `success-indicator-separation`. B-002 is seeded: the web-application rule is stated once, in the prose sentence of `references/inspection.md` (the table row labels of `inspection.md` and `adapters.md`, an `adapters.md` sentence and a `corpus.md` example no longer restate it, and `test:evaluate-guidance` fails on a second statement), and M-003 edits that sentence. The live evaluation runs unconfined (`"confinement": false`): a confined target's private home holds no Claude login, so every call exits 4, and the relay forbids an API key; Story 1.113 removes the opt-out or records why it stays. Story 1.46 left `SKILL.md` untouched, so no capture record changes. Findings the PR does not close became Stories 1.112 to 1.115. The repairs came from a session-scratch generator, and the preflight, rerun and rescore ran live through the Claude Code CLI.

**Dependencies:** 1.16.
**Gate:** skill gates when a guide changes, `npm run test:evaluate-dogfood`, `npm test`.

### Story 1.47: Distinguish reference risk tables from the scored register

Added in Story 1.27's review. The test-design parser currently accepts any unfenced table with risk ID and score columns as a register, including a separately labeled reference example. The story must establish the document context that identifies a register before changing that reading.

As a maintainer of the test-design evaluation,
I want reference examples distinguished from the design's scored register,
So that an example risk cannot change the design's score or fire an exclusion oracle.

**Acceptance Criteria:**

**Given** a design with a scored register and a separately labeled, unfenced reference table that also has risk ID and score columns
**When** the harness and contract evaluate it
**Then** the reference rows do not affect register counts, unsupported-risk oracles, risk precision, or coverage mapping; the scored register still does, and the parser's context rule is documented against a real test-design document
**And** a fixture with the same excluded category in the reference table and in a scored register row proves the distinction in both the harness and contract; reverting the context rule makes the reference-only fixture fail
**And** `test:contract-oracles`, `test:eval-replay`, `test:probe-targets`, the staged test-design preflight and `npm test` pass with the contract, runner projection, and scorer in agreement; the reference agreement is held by the runner stub case through the real runner and harness (`test:probe-targets`), the projection-versus-harness row count (`test:contract-oracles`) and the stored replay case, and the staged preflight, which sends cached live outputs that carry no labeled table, is a no-regression run.

**Dependencies:** 1.27.
**Gate:** `npm test`, suite-only staged preflight.

### Story 1.48: Report whole-document coverage for a structured design artifact

Added in Story 1.27's review. The test-design contract reads the complete Markdown from the runner's structured stdout, yet eval-quality reports its `whole-body` coverage rule unsatisfied. The rule asks for one oracle whose direction and check both address every required response key of an operation at one step (eval-quality's AD-20 rule 2 and AD-31), and a parent pointer does not address a key. The operation declares four keys (`design`, `riskRowCount`, `scoredRiskDescriptions`, `scoredRiskCount`) and every oracle read a subset.

Amended 2026-10-02 when the story was built: the plan assumed an engine change that treated a nested complete-body field as whole-body coverage. The engine's truth table deliberately reports oracles that each read a different key as unsatisfied, so the gap is in the contract. The repair is TeA-side with no eval-quality change and no release, and the criteria below say what the repair is held by.

As a maintainer interpreting test-design strength,
I want the engine's coverage result to reflect that an oracle reads the complete projection the runner emits, the whole Markdown included,
So that the baseline reports the coverage this contract actually exercises.

**Acceptance Criteria:**

**Given** the test-design contract and its parser-derived stdout
**When** eval-quality scores the contract and reports its coverage
**Then** it reports `whole-body` satisfied because one oracle per plan step names all four key pointers, and the design artifact its `design` must equal, in both its direction and its check; the result remains unsatisfied when the oracle reads only the scored-risk descriptions or omits any one key
**And** the criterion is held by contract fixtures scored through the published engine's coverage function: the real contract (satisfied) and the same contract with the oracle's evidence targets and check reduced to `/scoredRiskDescriptions` (unsatisfied); restoring the contract without the oracle makes the first report unsatisfied and widening the reduced oracle to every key makes the second report satisfied, so the pair cannot both agree
**And** the oracle's check can fail for a real defect (a design that is blank or is not the document the run wrote, a scored count and a description list that disagree about being empty, a scored row the register never counted, a missing, extra or mistyped key), the harness scorer mirrors it, and the existing oracle ids keep their numbers; exact count equality and `riskRowCount >= scoredRiskCount` need an enumeration the vocabulary makes too large, so the harness asserts them on every stored projection instead; the regenerated strength baseline retains every probe verdict and exit code; `npm test` passes.

**Dependencies:** 1.27.
**Gate:** `node tools/generate-contracts.js --check`, `npm test`, suite-only staged preflight. No engine release.

### Story 1.49: Prove test-design mutation rollback before claiming it

Added in Story 1.27's final review. The test-design probe generator inherited a twin-fixture qualification whose `rollbackVerified: true` is hard-coded. AD-8 requires a performed restore, digest equality and a clean rerun before that claim. The stored before and after designs are useful corpus examples, but their existence proves no rollback.

As a maintainer of the test-design evaluation,
I want each controlled mutation qualified in a disposable copy with a verified restore,
So that a test-design probe cannot claim rollback based only on two stored files.

**Acceptance Criteria:**

**Given** the test-design controlled-mutation probes generated from stored clean and seeded designs
**When** the qualification is performed for each probe
**Then** a disposable target copy runs the clean arm, applies one exact mutation, runs the mutated arm, restores the original bytes, verifies the artifact digest, and reruns the clean arm; only that sequence can set `rollbackVerified: true`, and the adopter's worktree remains unchanged
**And** a failed restore, mismatched digest, missing baseline pass or missing mutated failure emits no qualified probe with a true rollback claim; fixtures exercise each failure and reverting the verification makes them fail
**And** the generated probes, corpus checks, replay and staged test-design preflight use the qualified evidence and retain their expected behavioral outcomes; `npm test` passes.

**Dependencies:** 1.27.
**Gate:** `npm test`, suite-only staged preflight.

### Story 1.50: Send malformed raw HTTP bodies through an API probe

Added in Story 1.24's AI-feature proof. The published eval-quality `ProbeRequestBody` schema admits JSON or an absent body. TeA's HTTP port serializes the JSON value, so the malformed raw JSON boundary in the intake cannot be represented as a scored probe.

As an adopter evaluating an HTTP API,
I want to send exact request-body bytes, including malformed JSON,
So that parser and content-type boundaries can be observed and scored.

**Acceptance Criteria:**

**Given** an API probe with a raw byte body and a declared content type
**When** the published engine validates the probe and TeA sends it through the HTTP port
**Then** the target receives exactly those bytes; valid JSON, malformed JSON, an empty body and an absent body remain distinct, and the recorded request digest binds the actual bytes
**And** the AI-feature fixture has a malformed JSON probe whose target reports its documented error and whose scored oracle catches a controlled parser defect at `minimumTrialCount`; changing one raw byte or silently JSON-serializing the body fails the fixture
**And** the engine schema change is released before TeA raises its resolved dependency; `check`, preflight, run, score and `npm test` pass on the published engine.

**Dependencies:** 1.11, 1.24.
**Gate:** published engine release and export check, API fixture replay, `npm test`.

### Story 1.51: Isolate interaction plans by evaluation partition

Added in Story 1.24's held-out integrity review. `run --partition` filters the scored probe set, but the shared contract interaction plan can still execute requests intended only for the other partition. Story 1.24 used shared requests and private mutations, which kept its own held-out inputs outside development records.

As an adopter using held-out probes,
I want each partition to execute only its authorized interactions,
So that development runs cannot reveal held-out-only inputs.

**Acceptance Criteria:**

**Given** a development-only step, a shared step and a held-out plan step with a private canary
**When** preflight and run execute each partition
**Then** each launches only the shared steps and its own partition's steps, and no run artifact, log or replay file of the other partition holds the canary, the other step's ID or its oracle
**And** a fixture runs development first and fails if the canary reaches the target or any development artifact; removing the partition view makes that check fail
**And** the held-out run then scores without exposing its input to the authoring gap loop: the held-out probe is caught, its gap-view row holds only probe ID, class and outcome, rescoring after deleting the development run directories gives equal outcomes, and `compare --accept` and `ci --tier pr` replay with no stale warning
**And** no committed fixture, baseline or replay byte changes when `partitionPlan` is absent, and `npm test` passes.

**Amended 2026-10-03 in Story 1.51:** the criteria now name the shape that was built. Development-only steps stay in `contract.json`, named by `evaluation.json` `partitionPlan.developmentOnlySteps`. Held-out-only steps and their oracles live in a sealed held-out plan file under `corpus/held-out/`. One pure view, `contractView` in `cli/lib/evaluate/partition.js`, derives each partition's contract at the single choke point in the pipeline, so every launch and every artifact downstream carries only that partition's steps (AD-9, AD-22). The first criterion's "request in a contract" became a request in the held-out plan, and the held-out run's scoring independence from development became a checked outcome: caught, ID-class-outcome gap row, equal rescore without the development runs, and a clean `ci` replay.

**Dependencies:** 1.21, 1.24.
**Gate:** partition isolation fixture (`npm run test:evaluate-partition-plans`), replay, `npm test`.

### Story 1.52: Stop agent descendants on Windows

Added in Story 1.28's second review. Windows has no POSIX process groups. The guardian can stop its direct agent after a simultaneous supervisor and leader kill, while a child started by that agent can remain alive.

As an adopter running Evaluate on Windows,
I want the agent and every process it starts owned through the end of its turn,
So that a dual supervisor kill or an agent exit leaves no agent descendant running.

**Acceptance Criteria:**

**Given** a Windows agent with a child that stays alive after the agent exits or ignores a stopping signal
**When** the guardian's lifeline closes after both other supervisors are killed, or the agent exits normally
**Then** an operating-system process-tree owner stops the agent and its descendants, including after the direct agent has exited; a Windows integration case asserts each PID ends within the documented bound, and reverting the ownership leaves a child alive
**And** the Windows runner reference names the ownership mechanism and bound, and its documentation assertion fails when that passage is removed.

**Dependencies:** 1.28.
**Gate:** Windows `test:evaluate-preflight`, `npm test`.

### Story 1.53: Bound an agent whose guardian is stopped

Added in Story 1.28's second review. A guardian suspended with `SIGSTOP` cannot respond when its leader and supervisor are killed together, so its agent group can remain alive.

As an adopter whose process supervisor is stopped by the host,
I want the agent group to end after the other supervisors die,
So that a stopped guardian cannot leave the turn running indefinitely.

**Acceptance Criteria:**

**Given** a guardian and agent group running on a POSIX host
**When** the guardian receives `SIGSTOP` and both the leader and supervisor receive `SIGKILL`
**Then** a kernel-backed owner or equivalent independent mechanism stops the agent group within the runner's documented bound; a process-level case asserts the guardian, agent and child end, and reverting that mechanism leaves the group alive
**And** the runner reference states the mechanism and bound, and the case reading that passage fails when it is removed.

**Dependencies:** 1.28.
**Gate:** POSIX `test:evaluate-preflight`, `npm test`.

### Story 1.54: Reclaim auxiliary scratch after a killed preflight

Added in Story 1.28's second review. Workspace recovery journals `createWorkspace` paths, while `makeScratchDirectory` also creates evaluator command and other auxiliary scratch that a `SIGKILL` can leave behind.

As an adopter whose preflight is killed during qualification,
I want its auxiliary scratch reclaimed with its workspaces,
So that the next preflight leaves no owned temporary directory from the killed run.

**Acceptance Criteria:**

**Given** a preflight with active engine staging, or a `run` with active command evaluator scratch
**When** the CLI receives `SIGKILL` and another preflight starts for the same evaluation
**Then** the next preflight verifies ownership, reports and removes the dead run's private parent with its auxiliary directory, including after `TMPDIR` changes, while preserving live, unrelated and unverifiable parents; integration cases assert each path and its cleanup, and reverting the recovery leaves the owned directory
**And** the adopter's status and refs remain unchanged, and the CLI workspace reference names the auxiliary recovery; deleting that passage fails its documentation assertion.

**Dependencies:** 1.28.
**Gate:** `test:evaluate-mutation`, `test:evaluate-evaluators`, `npm test`.

### Story 1.55: Recognize process and answer separation for scalar CLI output

Added from Story 1.26's live proof. The pantry summary CLI prints one plain-text result and has no success field in stdout. Its oracle checks exit code 0 and the exact whole stdout, yet eval-quality reports `success-indicator-separation` unsatisfied because the response descriptor has no success indicator.

As an adopter evaluating a scalar-output CLI,
I want eval-quality to recognize an oracle that checks the process result and substantive answer independently,
So that coverage evidence reflects the check the contract performs (CAP-10).

**Acceptance Criteria:**

**Given** a CLI operation with plain-text stdout, no success field in its response descriptor, and an oracle whose direction and check both address the same interaction's exit code and exact whole stdout
**When** the published eval-quality release scores the contract
**Then** `success-indicator-separation` is satisfied without inventing a success field or waiver
**And** paired engine fixtures leave the rule unsatisfied when the oracle checks only exit code, only stdout, a token contained in stdout, or one of the two pointers only in its direction; reverting the engine change fails the positive fixture, and weakening any required observation fails a negative fixture
**And** a structured response with a declared success indicator retains the existing rule, proved by a fixture whose separate success and payload checks satisfy it and whose success-only check leaves it unsatisfied
**And** the Story 1.26 fixture truthfully declares `collectionLocations: []` for its scalar response; its re-scored clean and mutated arms still resolve `passed-clean-control` and `caught` at three trials, and every evidence artifact records `contractVerdict: PASS` with no critical coverage gap
**And** the engine change ships in a published release before TeA updates its resolved dependency; `test:evaluate-learned-framework` replays both arms against that release and `npm test` passes.

**Dependencies:** 1.26.
**Gate:** published engine release and export check, `test:evaluate-learned-framework`, `npm test`, `npm run test:release-metadata` when dependency metadata changes.

### Story 1.56: Prove the malformed CLI refusal against a controlled defect

Added from Story 1.26's final review. The pantry fixture's P-004 clean control proves rejection of malformed input, while its one committed mutation targets the separate complete-summary behavior. An exploratory guard-bypass mutation in the live transcript exposed an unwitnessed failure before O-002 was repaired. The committed suite has yet to demonstrate that O-002 catches a defective target.

As an adopter relying on a malformed-request refusal,
I want a controlled guard-bypass defect scored through the authored evaluator,
So that the refusal oracle has measured detection evidence (CAP-3, CAP-7, CAP-9).

**Acceptance Criteria:**

**Given** the Story 1.26 pantry fixture after Story 1.55's published engine update
**When** a second, adopter-owned mutation bypasses the malformed-request guard in a disposable copy and a distinct defect probe runs in development and held-out partitions
**Then** preflight witnesses the guard bypass, restores the original bytes, verifies the digest and reruns the clean baseline; reverting mutation application or rollback fails the corresponding check
**And** the malformed-request oracle checks exit code, exact stderr and empty stdout, cites a permitted observed channel on failure, and resolves `caught` in all three trials of each defect partition; restoring a hard-coded pass or removing a required channel check fails the focused gate
**And** P-004 still resolves `passed-clean-control` in all three trials; both defects retain comparable scored evidence and the contract reaches `PASS` without a waiver on the published engine
**And** `test:evaluate-learned-framework` replays the added defect and verifies the run's evidence through eval-quality; `npm test` passes.

**Dependencies:** 1.26, 1.55.
**Gate:** published engine export check, `test:evaluate-learned-framework`, `npm test`.

### Story 1.57: Withhold the committed evaluation folder from a confined target's git history

Added in Story 1.31. A git workspace is a worktree of the evaluated commit, which shares the adopter's object store, and the evaluation folder is committed there. The confinement withholds the folder's files on disk, while a confined target that runs `git show <commit>:<evaluation folder>/contract.json` in its worktree still reads the committed contract.

As an adopter whose evaluation folder is committed beside the project it evaluates,
I want no object of the evaluation folder reachable from a target's workspace,
So that a target cannot read the contract, the probes or which defect a mutation plants through git (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a confined run over a git workspace
**When** a stub target runs `git show` and `git cat-file` for the evaluation folder's committed files at the evaluated commit and at every ref it can name
**Then** each read finds no object, while the target's own git operations over the evaluated tree (`git status`, `git log`, `git diff` against the commit) work as they do today; a case in `test/test-evaluate-run.js` asserts both, and reverting the change lets the stub print the committed contract
**And** the probe digests AD-7 names (`commitDigest`, `implementationDigest`, a historical probe's revisions) are unchanged, which the existing digest cases hold
**And** `docs/reference/tea-evaluate-cli.md`'s `### File-system confinement` drops the passage saying the git history stays readable; a case reading that section fails while the passage remains.

**Dependencies:** 1.31.
**Gate:** `test:evaluate-confinement` (the confinement cases, split from `test:evaluate-run`), `test:evaluate-run`, `test:evaluate-mutation`, `test:evaluate-arms`, `npm test`.

### Story 1.58: Keep the bridge's admission token and the run's private directories from a confined target

Added in Story 1.31. A sealed-brief agent's bridge configuration, which carries its admission token, and its socket sit in private directories under the temp directory, outside the evaluation folder, so a confined target running as the adopter's user can still read the token before the agent connects (the reference says so).

As an adopter running a sealed-brief agent evaluator,
I want every private directory the run makes for the evaluation layer withheld from the target,
So that no target can take the bridge's one admission or read an evaluator's or judge's working files (AD-21).

**Acceptance Criteria:**

**Given** a confined run with a sealed-brief agent evaluator
**When** a stub target, and a process it leaves running, try to read the bridge's configuration file and token file, list the evaluator's working directory and the run's private directories and connect to the bridge's socket, and a sandbox built for one run is asked for the token file and socket of a run made after it
**Then** each attempt is refused (macOS answers `EPERM` to each; under Bubblewrap the target's own attempts are refused or find an empty file system, and the process it leaves running ends with the target's process-id namespace, so its report is optional there), the agent's own connection is admitted in every trial and each record carries the agent's observations, and reverting the change lets the stub print the token, which the case catches
**And** the token exists only in a file beneath the run's private parent directory (the relay's environment and argument list carry the file's path), and every directory the evaluation layer makes for the run, the judge's and the `command` evaluator's included, sits beneath the same withheld root, which the arms suite's judge case and a source scan over the runtime's temp directories hold
**And** `docs/reference/tea-evaluate-cli.md`'s passage on the bridge token states the withholding; a case reading it under its exact heading fails while the old sentence remains.

**Dependencies:** 1.31.
**Gate:** `test:evaluate-private` (the confined sealed-brief, signal and removal cases, split from `test:evaluate-evaluators`), `test:evaluate-evaluators`, `test:evaluate-confinement`, `test:evaluate-run`, `npm test`.

### Story 1.59: Let a confined agent target keep the state its CLI writes

Added in Story 1.31. A skill or agent target runs an agent CLI (through `tea-skill-runner` or its own command) that writes its session and settings state under the user's home directory; the target confinement refuses every write outside the workspace, so a live skill evaluation must opt out of confinement to run at all.

As an adopter evaluating a skill or an agent live,
I want the agent's own state writable under confinement without widening what the target can reach,
So that the targets Evaluate was built for run confined (CAP-6, AD-4).

**Acceptance Criteria:**

**Given** a confined run whose registry entry runs `tea-skill-runner` over the stub agent that writes its state under `HOME`
**When** the trial runs
**Then** the agent's writes land in a private home the runtime provides beneath the run's private parent and removes (the registry declares no writable path), the run completes, the evaluation folder stays unreadable and unwritable, the project's git directory stays unreadable apart from the worktree's own entry, and the rest of the project stays unwritable; the target reaches no other home, and each independent arm or leg of a sandbox starts with an empty home; reverting the change makes the agent fail its first state write, which the case catches
**And** the reference documents the writable state and the skill's harness guide shows it in a validated tagged example.

**Dependencies:** 1.31.
**Gate:** `test:evaluate-preflight`, `test:evaluate-run`, `npm test`.

### Story 1.60: Observe every confined process's file access, beyond Node

Added in Story 1.31. The trial's audit is an in-process Node preload, so a target written in another language, or a Node process started with a cleared environment, opens paths outside its grants unreported; the mechanism refuses what it refuses (the evaluation folder, every write outside the workspace) whatever the process.

As an adopter whose target is not a Node program,
I want the isolation manifest's `observedMounts` to come from an audit that sees every confined process,
So that an ungranted read by any process of the target becomes the isolation violation eval-quality records (AD-7).

**Acceptance Criteria:**

**Given** a confined run whose target is a shell script that reads a file outside its workspace, not declared in `systemPaths`
**When** the trial completes
**Then** that path appears in the trial set's `observedMounts` and `score` exits 3 with eval-quality's `mount outside allowlist` reason, on macOS and on Linux; the audit is the mechanism's own (Seatbelt's reports read through `log stream`, `strace -f --seccomp-bpf` outside Bubblewrap) and sits where no target can write it, so removing it leaves `observedMounts` empty, which the case catches, and a process started with an empty environment, a write the mechanism refused and a read of a withheld file are listed as well
**And** a clean shell target reports nothing, so its manifest's `observedMounts` is empty, and neither does a read under a declared `systemPaths` entry, a path that does not exist or a metadata probe, while the execution of an ungranted binary is listed as the read it is
**And** a host whose observer cannot confirm itself (a log that never reports a read the sandbox allowed, no `strace`, a refused ptrace) exits 12 naming the cause and the `"confinement": false` opt-out, and an observer that fails during a trial leaves the trial with no record (exit 12), so an empty `observedMounts` is never what a broken observer returns
**And** two audited sandboxes running at once each list their own reads only, and `docs/reference/tea-evaluate-cli.md`'s `### File-system confinement` describes the audit by mechanism and names what it does not see; a case reading that section fails while the passage saying only Node processes write the audit remains.

Amended 2026-10-01 in Story 1.60: the spike measured the mechanism on this host. Seatbelt's `(allow ... (with report))` and `(with message ...)` make the kernel report an allowed read and a refusal under a token of the sandbox, which attributes each report exactly; reports written by a `log stream` child straight to a file lost none in 3,000 at a quiet host's pace, one to five in 1,600 on a host saturated by other work, and 7 to 20 percent of a burst of 40,000 a second. Linux has no equivalent in the kernel without privilege, so the Bubblewrap command runs under `strace -f --seccomp-bpf` started outside the namespace (a new Linux dependency, `strace`, installed beside `bubblewrap`). Both report files sit beneath the withheld private root, so the audit's report file is no longer writable by a target, which removes the premise of Story 1.63's first criterion (the abstract-socket criterion stands). The Node preload and `confinement-guard.cjs` are deleted. The macOS channel is the kernel's log, which loses reports without a trace when the host is saturated (the reference states the measurements); no mechanism without privilege is lossless there, so the criterion holds as stated on Linux and as a measured best effort on macOS, and Story 1.81 records the loss per trial.

**Dependencies:** 1.31.
**Gate:** `test:evaluate-confinement` (the audit's cases), `test:evaluate-run`, `test:isolation-primitives`, `npm test`, and the Linux CI job.

### Story 1.61: Teach file-system confinement in the Evaluate skill

Added in Story 1.31. The skill's harness and run guides name neither `confinement`, `systemPaths` nor the exit-12 refusal of a host with no mechanism, so an authored `evaluation.json` cannot declare what its target legitimately reads outside the workspace, and the gap stage cannot read an isolation violation from an observed mount.

As an adopter authoring an evaluation with the skill,
I want the harness, run and gaps guides to teach confinement,
So that the authored evaluation runs confined on the first try and an observed mount is diagnosed (CAP-8, CAP-10).

**Acceptance Criteria:**

**Given** the skill's `references/harness.md`, `references/run.md` and `references/gaps.md`
**When** `test:evaluate-guidance` reads them
**Then** the harness guide teaches `systemPaths` and the entry's `network` (a Linux skill or agent target, or any target that calls a model or an outside service, declares `"network": "host"` until Story 1.83) with a tagged `evaluation.json` fragment the guidance test validates against the runtime schema, the run guide names each platform's mechanism, the exit-12 refusal, the `"confinement": false` opt-out and the network namespace with what `run.json` records (`confinement` and `hostNetwork`), and the gaps guide maps an isolation violation from `observedMounts` to its repair; deleting any passage fails the test
**And** `references/ci.md` and the AD-10 exit-table rows of `references/gaps.md` stay byte-identical, which `test:evaluate-ci` (the capture records' digest of `ci.md`) and `test:evaluate-guidance` (the occurrence check of the `find` strings the dogfood mutations M-001 and M-002 replace) hold
**And** the change goes through `bmad-workflow-builder` with a clean Analyze gate (AD-16, AD-18).

**Dependencies:** 1.31, 1.63.
**Gate:** builder Analyze, `test:evaluate-guidance`, `npm test`.

(Amended 2026-10-02 in Story 1.63's first review round: Story 1.63 edits `harness.md` and `adapters.md` for the `network` declaration, and `run.md`, `gaps.md` and `ci.md` stay with this story, which teaches the same declaration there (the `ci-registry` example in `ci.md` gains `"network": "host"` and the sentence that a Linux skill or agent target's live checks need it) and reads the new `hostNetwork` field of `run.json` beside `confinement`. Editing `ci.md` invalidates the committed capture records of `test/fixtures/evaluate-ci-repos/`, so this story reruns the two live sessions as Story 2.4's record describes and regenerates `capture-record.json`.)

(Amended 2026-10-02 in Story 1.61's build: the `ci.md` part of the earlier amendment is dropped and becomes Story 1.84.
The `ci-registry` example in `ci.md` is covered by the committed capture records of `test/fixtures/evaluate-ci-repos/`, which pin the SHA-256 of `references/ci.md`, `SKILL.md` and `assets/evaluation-ci-plan.template.json`, so an edit to `ci.md` fails `test:evaluate-ci` until both live `claude -p` sessions rerun and `capture-record.json` is regenerated, and the auto-mode classifier denies those sessions.
This story leaves `ci.md` byte-identical to `main`, which `test:evaluate-ci` holds, and gives the `ci.md` part and the sessions to Story 1.84.
The `gaps.md` exit-table rows that the dogfood mutations M-001 and M-002 replace stay byte-stable, which the occurrence check in `test:evaluate-guidance` holds; the isolation-violation mapping is a section of its own.
This amendment supersedes the `ci.md` clauses of the note above.)

### Story 1.62: Share one sandbox primitive layer across TeA's isolation modules

Added in Story 1.31 from its local review. `cli/lib/evaluate/confinement.js` is the third module that selects and probes a Seatbelt or Bubblewrap mechanism beside `cli/lib/isolate.js` (the review CLI's write isolation) and `cli/lib/atdd-isolation.js` (the atdd red-phase sandbox), and each carries its own copy of the same primitives: the executable lookup on `PATH`, the check that a path can be carried into a profile or an argument vector, the containment test, and the probe of a trivial process. A fix to one copy (a path character a profile cannot carry, a probe that hangs) does not reach the other two.

As a maintainer of TeA's sandboxes,
I want one module to own the mechanism primitives the three isolation modules share,
So that a sandbox defect is fixed once and every caller gets the fix (AD-5, AD-7).

**Acceptance Criteria:**

**Given** `cli/lib/isolate.js`, `cli/lib/atdd-isolation.js` and `cli/lib/evaluate/confinement.js`
**When** the shared primitives move into one module they all import
**Then** each module's own suites pass unchanged (`test:cli`, `test:atdd-isolation`, `test:atdd-net-guard`, `test:framework-scaffold-install-isolation`, `test:evaluate-run`, `test:evaluate-mcp`, `test:evaluate-api`), and the profiles and argument vectors each module generates are byte-identical to today's, which a case comparing each module's output for fixed inputs before and after asserts
**And** a static case, a new `test:isolation-primitives` script in the `npm test` chain, fails when any of the three modules defines its own executable lookup, profile-path check, containment test or mechanism probe again; restoring a local copy in any one of them fails the case
**And** the shared module rejects the same unsafe path characters for all three callers, so a path one module refuses today and another accepts is refused by both, which a case asserts for each character; reverting a caller to its own check lets the path through, which the case catches.

**Dependencies:** 1.31.
**Gate:** `test:isolation-primitives`, `test:cli`, `test:atdd-isolation`, `test:evaluate-run`, `npm test`.

### Story 1.63: Give a Bubblewrap target no route to the host's abstract sockets

Added in Story 1.31 from its local review and amended 2026-10-02 after Story 1.60 merged. Story 1.31's audit report was a file the target's own processes appended to, which a target could rewrite to hide a line. Story 1.60 replaced it with the confining mechanism's own record (a runtime-owned `log stream` on macOS, `strace` outside the namespace on Linux), so no report file exists for a target to rewrite, and this story's first criterion (a channel the target cannot write) is met by that design and is dropped. What stands is the second: under Bubblewrap the target shares the host's network namespace, which an HTTP service needs to be reachable, so a process it starts can connect to an abstract Unix socket such as a desktop session's D-Bus and ask the user's service manager to start a job outside the sandbox; Story 1.31 hides `/run/user`, which closes the path-based socket only. The audit's one remaining channel gap, a target saturating the macOS log to lose its own report, is Story 1.81's.

As an adopter running a Linux target under Bubblewrap,
I want the target to have no route to the host's abstract sockets,
So that a process it starts cannot ask a host service to run a job outside the sandbox (AD-8).

**Acceptance Criteria:**

**Given** a Bubblewrap target whose entry keeps the default network (`"network": "isolated"`) on a Linux runner and a listener on an abstract Unix socket address owned by the runtime
**When** the target attempts to connect to that address
**Then** the connection fails while an HTTP service the target started stays reachable from the runtime; removing the isolation lets the connection through and fails the case, and an entry that declares `"network": "host"` reaches the address, which is the case's control
**And** the reference names what the audit and the sandbox still do not see, with no claim the mechanism cannot back.

**Dependencies:** 1.31, 1.60.
**Gate:** `test:evaluate-run`, `test:evaluate-api`, `test:isolation-primitives`, `test:evaluate-confinement`, `npm test`, and the Linux CI job.

(Amended 2026-10-02 in Story 1.63's build: the mechanism is a network namespace of the target's own (`--unshare-net`) with a bridge the runtime owns, because abstract sockets are per network namespace and no unprivileged mechanism available to a Bubblewrap run on the CI runners hides them while sharing the namespace.
The Linux cases run in the ubuntu CI job alone, and the bridge's protocol, the host forwarder, the readiness semantics and the error paths are tested on every host over Unix sockets.
The finding that path-based sockets stay connectable is Story 1.82.)

(Amended 2026-10-02 in Story 1.63's first review round: the isolation is the default and a registry entry declares what it needs.
Every entry, a command, a tool server or a started HTTP service, takes `network`, `"isolated"` by default or `"host"`; under Bubblewrap a `host` entry runs without `--unshare-net` and without a bridge, and Seatbelt accepts the field and ignores it.
A skill or agent target on Linux calls its model provider and a started service may call a model, so the isolated default would cut them off, and `"confinement": false` would drop their file-system confinement too; the run records each entry that declares `host` as a route to the host's abstract sockets, which Story 1.83 closes by giving an isolated entry a route to the hosts it authorizes.)

(Amended 2026-10-03 in Story 1.83's build: the per-entry `network` field above is removed and the `host` value with it; an entry lists the hosts it may reach in `egress`, and `run.json` records `egress` and `egressRefusals` in place of `hostNetwork`.)

### Story 1.64: Hold the release across the witness legs and the trials

Added 2026-09-30 in Story 1.38 from its review. Story 1.38 asks each deployment which release it runs once, before the qualification arms. The manifestation-witness legs and the trials of the arm `historical:<pre-fix release>` reach the pre-fix deployment afterwards (`deploymentRoute`), so a deployment redeployed between the report and those calls is measured under the identifier the probe declares, and the digests a qualified probe records name a release the trials never ran against.

As an adopter whose historical probe runs against two deployments,
I want the pre-fix deployment asked which release it runs again after the witness legs and after the trials,
So that every trial a verdict counts ran against the release my probe names (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a deployment-routed historical probe whose pre-fix deployment reports its declared release before the arms and another release once the witness legs have run (a loopback fixture grader whose `GET /release` answer changes on a signal the case sends)
**When** `tea-evaluate run` has run the witness legs
**Then** the runtime sends the report request again through `holdToReport`, and a changed identifier refuses the probe with the identifier reported then and the one the probe declares both named in `run.json`'s `refused` and `refused/<probeId>.json`, and no trial of that probe is run, a `test:evaluate-arms` case reading the deployment's request log; dropping the request after the witness legs lets the trials run under the declared identifier, which the case catches
**And** a pre-fix deployment that changes its release while the trials run is asked once more after the last trial and before any trial set is sealed, a changed identifier refuses the probe with both identifiers named and no trial of it reaches a sealed trial set, a `test:evaluate-arms` case; dropping the request after the trials seals trials measured under another release, which the case catches
**And** a deployment that keeps its release is asked three times by the runtime (before the arms, after the witness legs, after the trials), its qualified probe and digests are the ones Story 1.38 records, and the request log shows each request, a `test:evaluate-arms` case; asking only before the arms leaves two requests short in the log, which the case catches
**And** the later requests go through the evaluation's HTTP port and eval-quality's policy as the first does, so a denial or an answer with no string at the pointer refuses the probe with its reason, a `test:evaluate-arms` case; sending them outside the port lets the case exit 0 with no refusal, which the case catches
**And** the reference's `### Against deployments` states the three points at which the release is asked, and the case reading the section fails when its sentence is removed.

**Dependencies:** 1.38, 1.65.
**Gate:** `test:evaluate-arms`, `npm test`.

(Amended 2026-10-01 in Story 1.65's build: each deployment names one report per HTTP interface (`reports`), so the pre-fix deployment is asked at each of the three points once per interface, each request through `holdToReport` to that interface's own origin, in sorted interface-ID order.
The third criterion reads: a deployment that keeps its release is asked three times at each of its HTTP interface origins, and asking only before the arms leaves two requests short in each log.
The first two criteria change the release at the first interface's origin or at a later one; the case puts the change on the second interface's origin as well.)

### Story 1.65: Ask every HTTP interface of a deployment which release it runs

Added 2026-09-30 in Story 1.38 from its review. A deployment names one `report`, and the request goes to the origin the deployment names for the interface its operation belongs to. A deployment answers every HTTP interface of the registry at its own origin (`origins` names one per interface), and the origins of the other interfaces are never asked which release they run, so a deployment whose second origin runs another release is measured under the identifier the first origin reported.

As an adopter whose deployment serves more than one HTTP interface,
I want each interface's origin held to the release my probe names,
So that every call a trial makes reaches the release the digests name (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a registry that serves two HTTP interfaces, a probe whose deployments each name a report for every one of them, and two loopback fixture servers per deployment, the second interface's origin of the pre-fix deployment running another release
**When** `tea-evaluate run` qualifies the probe
**Then** before either arm the runtime sends each deployment one report request per HTTP interface, each to that interface's own origin, and the second origin reporting another release refuses the probe with the interface, the identifier reported and the one declared named in `run.json`'s `refused` and `refused/<probeId>.json`, a `test:evaluate-arms` case reading each server's request log; asking the first interface alone lets the probe qualify, which the case catches
**And** `check` refuses under `historical` a deployment whose reports leave an HTTP interface of the registry without one, or name an interface the registry does not serve over HTTP, a `test:evaluate-check` case each, and `deploymentPair` holds the same rules with exit 12, a `test:evaluate-arms` unit; dropping the rule lets an origin go unasked, which the cases catch
**And** the probe schema carries a report per interface (its shape is the build's call, and the reference documents it), a `test:evaluate-check` `schema` case for a missing report and one with an extra or empty field; a registry with one HTTP interface keeps a probe that names one report valid
**And** the reference's `### Against deployments` states that every HTTP interface's origin is asked, and the case reading the section fails when its sentence is removed
**And** `check` refuses a report keyed by an interface other than the one its operation belongs to, naming the interface the operation belongs to, a `test:evaluate-check` case on the second interface's key; dropping the refusal lets the run ask an interface for an operation it does not serve.

**Dependencies:** 1.38.
**Gate:** `test:evaluate-arms`, `test:evaluate-check`, `npm test`.

(Amended 2026-10-01 in Story 1.65's build: one report does not suffice, since a second origin can run another release than the first, so the closing alternative is replaced by the criterion above.
The probe field is `reports`, an object keyed by registry HTTP interface ID whose values are `{ operationId, pointer }`, one for every HTTP interface of the registry and for no other; the single `report` is gone, with no alias, since nothing is released.
The runtime asks the pre-fix deployment first and each deployment's interfaces in sorted interface-ID order, each through the port to that interface's own origin under the request label `report-<side>-<interfaceId>` (an interface ID is a kebab-case slug, so it is valid in a label).
The first answer that refuses the probe (another identifier, no string at the pointer, a denial) stops the asking, so a refusal needs one finding and a qualified probe has sent each deployment exactly one report request per HTTP interface.
Each refusal names the side, the interface, the identifier reported or what was found, and the one declared.
`run.json`'s `releases[<probeId>][<side>]` stays `{ declared, reported }` and `reported` becomes an object keyed by interface ID.
`check` refuses, as one finding each, an HTTP interface of the registry with no report, a report keyed by an interface the registry does not serve over HTTP, and an operation declared on another interface than its key; `deploymentPair` holds the same rules with exit 12 through the same `reportsProblems`.
Story 1.64 repeats the asking after the witness legs and after the trials, once per interface through the same `holdToReport`, so it now depends on this story.)

(Amended 2026-10-02 in Story 1.65's round 1 review: eval-quality refuses two `api` operations of the contract that share a method and a path template, so the report operations of two interfaces need distinct paths.
The reference states the limit; Story 1.75 makes `check` name the collision.)

### Story 1.66: Scrub an observation in every letter case

Added 2026-09-30 in Story 1.38 from its review. `hostEnvironmentPort` in `cli/lib/evaluate/arm.js` scrubs an observation with `secretForms(values)`, which holds each injected value and its escapings in the case the host knows them, while a fault's message and cause are scrubbed in the value's own case and lowercased. A deployment or target that echoes an auth value in another letter case (a header a server normalizes, a URL a proxy lowercases) leaves it in the observation, which reaches the evidence artifacts and, through `reportedRelease`, a refusal's quoted identifier.

As an adopter whose target echoes what it was sent,
I want an echoed secret scrubbed in whatever letter case it comes back,
So that no evidence artifact holds a value the host injected (AD-4, AD-8).

**Acceptance Criteria:**

**Given** an `api` registry entry whose auth value the host injects and a fixture grader that echoes it in the body and a header of its answer, lowercased in one field and uppercased in another
**When** the call goes through `hostEnvironmentPort`
**Then** the observation holds `[redacted]` in each place, in every case the fault path already covers and in uppercase, a `test:evaluate-api` case beside the existing scrub case; restoring the case-sensitive scrub leaves the lowercased and uppercased echoes in the observation, which the case catches
**And** the same secret echoed in another letter case as the identifier a deployment reports for its release reaches `refused/<probeId>.json` and `run.json` as `[redacted]`, a `test:evaluate-arms` case; restoring the case-sensitive scrub writes the secret into the refusal's quoted identifier, which the case catches
**And** the fault path scrubs the secret in the same set of cases as the observation, a `test:evaluate-api` case whose fault quotes it uppercased; scrubbing the two paths with different sets lets the uppercased echo through the fault, which the case catches
**And** a value shorter than the scrub's minimum length stays unscrubbed in every case, so ordinary text is not redacted, a `test:evaluate-api` case.

**Dependencies:** 1.11, 1.38.
**Gate:** `test:evaluate-api`, `test:evaluate-arms`, `npm test`.

(Amended 2026-10-01 in Story 1.66's build: the scrub matches in every letter case by case folding (lower, upper, capitalized per word and mixed), so a normalizer that capitalizes each word or mixes cases is covered; the observation, a fault's message and cause, a cut text's leading part (`scrubCutText`), a number's text (`numberHoldsSecret`) and an object key all use it.
The secret's forms also hold its lower-case, upper-case and Turkish-rule mappings, taken before each form is escaped, for the mappings case folding does not reach (`ß` to `SS`, `ı` and `I`); the fold reads `İ` and `i` with a combining dot as one `i`.
The first criterion's revert reads as written: the case-sensitive scrub leaves the capitalized and mixed echoes in as well.
The third criterion's revert is reworded.
The fault path has no set of its own any more (`anyCase` is gone), and the matching is case-insensitive by construction, so rebuilding a lowercased set and handing it to the new scrub leaks nothing.
What fails is the fault path scrubbing with the earlier case-sensitive code while the observation uses the new matching; that lets the uppercased echo through the fault's message, its cause or both, which the case catches.
The comparison folds the text and the forms by case (no regular expression is built over the forms, since a pattern holding every form of a large secret exceeds what the engine compiles), the forms are built once per distinct set of values on a port and folded once per `secrets` array, and secrets that overlap in a text are replaced as one span.
A secret holding a letter beyond ASCII that the target changes unevenly (one word capitalized, the rest not) and then writes as `\uXXXX` is not matched (this includes an ASCII secret that a Turkish-locale capitalizer echoes as `Admin-İndex-Token`), since the escape digits of a letter differ with its case; Story 1.74 closes it.)

### Story 1.67: Emit the label-free calibration inputs a records harness feeds its scorer

Added 2026-10-01 in Story 1.40 from its builder Analyze (determinism lens). A `records` harness proves its rubric scores with `<records>/calibration-judgments.json`, whose `scorerInput` must equal, key for key, the observation the runtime derives from each labelled item, and whose `scorerConfigurationDigest` is `digestArtifact` over the configuration without its two calibration bindings. Story 1.40 documents both, but a harness in any language can reproduce them only by hand, and a mismatch shows only as a `check` exit 10.

As an adopter bringing rubric scores from my harness,
I want the runtime to emit the scorer inputs and the digests I must copy,
So that my judgments file verifies the first time (AD-21, AD-22).

**Acceptance Criteria:**

**Given** a `records` evaluation whose contract declares a rubric and a harness configuration
**When** the harness asks the runtime for its calibration inputs (an option of an existing subcommand, or a subcommand if AD-5's count is amended in that story)
**Then** the output lists, in the labelled file's order, each item's rubric, criterion and label-free `scorerInput`, the labelled file's digest and the `scorerConfigurationDigest` of the configuration it names, from the same functions `check` and `run` verify with, a `test:evaluate-evaluators` case in which a harness fixture builds its judgments file from that output alone and `check` and `run` accept it; changing how the runtime derives the observation or the digest changes the output and the verification together, and a hand-built copy of the old derivation fails the case
**And** the output carries no `expectedLevel`, a `test:evaluate-evaluators` case; adding the label to the output fails it
**And** the reference and the skill's evaluator guide tell the harness to copy these values verbatim, with the guidance test asserting that sentence by its exact heading.

**Dependencies:** 1.40.
**Gate:** `test:evaluate-evaluators`, `test:evaluate-guidance`, `npm test`.

(Amended 2026-10-01 in Story 1.67's build: the option is `digest --calibration-inputs`, an option of the existing `digest` subcommand, so AD-5's count of seven stays. It is read-only and prints one JSON document with `calibrationDigest`, `scorerConfigurationDigest` and `items` (`rubricId`, `criterionId`, `scorerInput` in the labelled file's order); it refuses with exit 10 under the `judge-calibration` rule. The configuration it digests is `<records>/evaluator-configuration.json`, which the harness writes first with the two calibration bindings optional, then binds `tea.judgeCalibrationDigest` to `calibrationDigest`. The configuration is also held to eval-quality's `evaluator-configuration` schema, as `run` holds it.)

(Amended 2026-10-01 in Story 1.67's round 1: ask-then-bind exposed a gap in Story 1.40's import. Each sealed record and isolation manifest names `evaluatorConfigurationDigest`, the digest of the full configuration with its bindings, and `score` refused a mismatch with exit 3 after `check` and `run` exited 0. `run` now holds every imported record and isolation manifest to the imported configuration's digest, the one it records in `run.json`: exit 10, nothing copied, the file and both digests named. `check` reads no imported record and does not repeat it. The harness binds both calibration values before it seals any record. `recordsDirectory` refuses `..`, `.` and empty segments, the evaluation schema's rule, for `check` and the ask alike.)

### Story 1.68: Hold a run's score inputs between verification and the engine's read

Added 2026-10-01 in Story 1.41. `score` checks every input of a run (the records, the compiled contract, each probe, the preflight verdict, the policy, the evaluator configuration and the isolation manifests) against the digests `run.json` recorded, then hands the engine their paths. In a run that opted out of file-system confinement, a leftover target process can rewrite one of those files after the check and before or during the engine's read, so the engine would judge bytes the check never saw. The CLI reference states the limit; Story 1.41 held the outputs only and checks a staged artifact against the published schema, the corpus digest and the presence of an outcome for the probe, which a well-formed substitute passes.

As an adopter scoring a run that opted out of confinement,
I want the bytes the engine reads to be the bytes the digest check accepted,
So that a process writing the run directory during scoring cannot change what is scored (AD-7, AD-12).

**Acceptance Criteria:**

**Given** a sealed run that opted out of confinement
**When** a process rewrites a record, the compiled contract, the policy, a probe or an isolation manifest after the input check and before or during an eval-quality call (the Story 1.41 engine shim, over real eval-quality)
**Then** `score` exits 12 naming the changed file and copies no evidence for that call, so no persisted evidence reflects the rewritten bytes; removing the post-call re-read of the inputs leaves the file unnamed (the in-process comparison still refuses it), and removing that and the comparison copies the rewritten bytes' evidence for a record, the policy or a probe while a contract, preflight verdict, configuration or manifest rewrite goes Invalid with nothing copied (amended 2026-10-01 to the behavior observed), a `test:evaluate-partitions` case
**And** the artifact copied in is checked against the engine's own digest or an in-process re-score, so a well-formed staged artifact with altered outcomes substituted by a process that can write the private staging directory fails; substituting altered outcomes in the staged artifact exits 12 with no evidence copied, a `test:evaluate-run` case, and removing the comparison lets the substitute through
**And** a normal score and a repeated score are unchanged, and re-running the recorded argv with a fresh `--out` still reproduces the persisted evidence byte for byte, a `test:evaluate-run` case
**And** the reference replaces its sentence that a process able to write the run directory can rewrite a file and its digest with the check, and a static test fails if that section is removed.

**Dependencies:** 1.41.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, engine check.

Amended 2026-10-01 in Story 1.68's build, where the build departs from the plan text: the check after each call re-reads and re-digests every input (a manifest absent at the check and present afterwards counts), and the in-process re-score of the held bytes, serialized with `serializeArtifact`, must equal the staged artifact byte for byte (an absent artifact must match a result with no artifact), and the call's exit and the `eval-quality:` diagnostic lines that explain an Invalid result must be the ones the held bytes give, so a rewrite restored before the check cannot leave an exit or an artifact the held bytes do not produce; the second criterion's "engine's own digest" alternative is not used. The comparison only refuses: it supplies no verdict, exit code or artifact.
`partitions.json`, `gap-view.json` and `interpretation.json` are built from the held bytes as well, since they read the probe, the records and the contract after the engine's calls; a call that staged nothing is refused whenever the held bytes produce an artifact, whatever it exited, and only a call that could not run, was killed or exited a code the CLI does not document skips the comparison.
`test:evaluate-boundaries` names `score-inputs.js` as the one file that may name `runScore`.
Amended 2026-10-01 in the merge with Story 1.45: the `eval-quality aggregate-strength` call Story 1.45 adds after the probe loop is held to the same inputs. After it `score` re-reads every input, reads the persisted evidence back, aggregates the held bytes in process with `aggregateStrength`, and requires the staged aggregate and the call's exit to be the ones the held bytes give, or copies no aggregate and exits 12; `test:evaluate-boundaries` names `score-inputs.js` as the one file that may name `aggregateStrength` too, once, inside `reproduceAggregate`.

### Story 1.69: Hold the inputs of an evaluator attempt's score call

Added 2026-10-01 in Story 1.68. `run` qualifies a sealed-brief agent evaluator (Story 1.34) by scoring each qualification attempt through `eval-quality score` over files it wrote into the run directory a moment before (`scoreAttempt` in `cli/lib/evaluate/run.js`). In a run that opted out of file-system confinement, a target's leftover process can rewrite one of those files between the runtime's write and the engine's read, so an attempt's votes can come from bytes the runtime never wrote, and the votes decide whether the evaluator qualifies. Story 1.68 holds the inputs of `score` only.

As an adopter running a sealed-brief agent evaluator in a run that opted out of confinement,
I want an attempt's votes to come from the bytes the runtime wrote,
So that a process writing the run directory during qualification cannot move the evaluator's agreement (AD-7, AD-12).

**Acceptance Criteria:**

**Given** a run that opted out of confinement, qualifying a sealed-brief agent evaluator
**When** a process rewrites an attempt's record, the contract, the policy, the probe, the preflight verdict, the manifest or the evaluator configuration after the runtime wrote it and before or during the attempt's `eval-quality score` call (the Story 1.41 engine shim, over real eval-quality)
**Then** `run` exits 12 naming the changed file and records no vote from that call; removing the post-call re-read leaves the file unnamed (the in-process comparison still refuses it), and removing that and the comparison records votes from the rewritten bytes for a record, the policy or a probe while a contract, preflight verdict, configuration or manifest rewrite goes Invalid with no evidence and the run exits 11 (amended 2026-10-02 to the behavior observed), a `test:evaluate-held-attempts` case
**And** a rewrite restored before the check, a well-formed staged artifact with altered votes, and a call whose exit or Invalid reason the held bytes do not give (the staged artifact removed or an earlier one staged), exit 12 the same way; removing the in-process comparison with the held bytes records the altered votes for both, a `test:evaluate-held-attempts` case each
**And** an unchanged qualification scores as before, and its recorded argv with a fresh `--out` still reproduces the attempt's evidence byte for byte, a `test:evaluate-held-attempts` case
**And** `scoreAttempt` reads the bytes it holds through `cli/lib/evaluate/score-inputs.js`, the module Story 1.68 builds, so the enumeration of score inputs stays in one place; a static test in `test:evaluate-held-attempts` fails if `scoreAttempt` names those files without it.

**Dependencies:** 1.68.
**Gate:** `npm test`, engine check.

Amended 2026-10-02 in Story 1.69's build, where the build departs from the plan text: `scoreAttempt` holds the attempt's seven inputs (the contract, the preflight verdict, the evaluator configuration, the policy, the probe, the attempt's record and its isolation manifest) through `holdAttemptInputs` in `cli/lib/evaluate/score-inputs.js`, reading each through the run directory writer (`writer.read`, held to the digest the runtime wrote), so an input that is not what the runtime wrote at the hold stops the run with exit 12 naming the file before any engine call, and the check after the call reads through the writer too.
The comparison Story 1.68 built (`heldRefusal`, `diagnosticLines`, `stagedArtifact`) moved from `score.js` to `cli/lib/evaluate/held-refusal.js`, because `score.js` requires `run.js`; `score` and `scoreAttempt` both call it, and the call's argv comes from `HeldInputs.scoreArguments` for both.
Every outcome of a call that ran is compared, exit 3 included (an Invalid attempt whose held bytes give a verdict, or whose `invalid:` lines differ from the held bytes' lines, exits 12); a call that could not run, was killed or exited a code the CLI does not document stops as before.
The staged bytes the comparison accepted are the bytes copied into `evidence-artifact.json` and read for the vote (the earlier `copyIn` read the staging path a second time).
`test:evaluate-boundaries` follows `heldRefusal` to `held-refusal.js` (the one file that asks for `reproduce`, once) and keeps `score.js`'s `heldAggregateRefusal` as the one that asks for `reproduceAggregate`; it plants a `reproduce` call in `score.js` and in `run.js`.
The cases run as their own script, `test:evaluate-held-attempts` (`--group=held-attempts` of `test/test-evaluate-evaluators.js`), since `test:evaluate-agents` already weighs 323 seconds in CI; it joins the `npm test` chain, which counts 109 steps.
The hold-time refusal has no end-to-end case.
The hold reads each input through `writer.read`, which holds every file to the digest the runtime wrote.
`writer.verify` runs once per attempt, before its probe loop, so for a later probe of an arm the window between that verify and the hold holds the earlier probe's score call.
A rewrite that call makes is named by its own check after the call, or stopped by `writeQualifiedProbe`'s read of the probe file, so only a delayed process that outlives the call could reach the hold, and no test can land one deterministically.
The hold is driven over a real run directory writer in a unit, for the first probe and for a later one, and `scoreAttempt`'s stop is driven through it.

### Story 1.70: Refuse promptfoo assertions that run adopter code or call a model

Added 2026-10-01 in Story 1.43. Story 1.43 refuses a promptfoo result with no `gradingResult`. The installed promptfoo (0.123.1) does not leave a crashed assertion ungraded: a `javascript` assertion that throws, and an allow-listed type such as `contains` whose `value` is a `file://` reference to a Python or Ruby file that raises, yield a graded failing component, with `gradingResult.pass: false`, the crash text as its `reason`, and an `error` field that promptfoo also sets on every ordinary failed assertion (`Expected output to contain ...`), so neither `error` nor the result shape tells a crash from a violated oracle. The result still scores as a caught target defect. Matching promptfoo's reason text would encode vendor wording, so the starter admits only assertions that cannot run adopter code or call a model. Verified live on 0.123.1, 2026-10-01: `type: contains` with `value: file://boom.py` and with `value: file://boom.rb` (each raising) returns a graded `pass: false`; with `value: file://boom.js` (throwing) it returns no grade, which Story 1.43 already stops; a `transform: "output.replace('pears','figs')"` on `contains: pears` returns a graded `pass: false` (`Expected output to contain "pears"`) for an output that holds the value, so the assertion graded text the target never produced.

As an adopter using promptfoo's assertions,
I want an assertion that runs adopter code or calls a model to stop the evaluation,
So that code that throws, or that rewrites the output it grades, cannot appear as a caught target defect (CAP-13, AD-10, AD-21).

**Acceptance Criteria:**

**Given** an `asserts.yaml` entry whose `type` (after any `not-` prefix) is outside the allow-list, such as `javascript`, `python`, `ruby`, `webhook` or a model-graded kind (`llm-rubric`, `g-eval`, `factuality` and the like)
**When** the Story 1.20 fixture evaluator or the Story 1.23 starter template imports a result whose `testCase.assert` holds it
**Then** the wrapper refuses the result with a diagnostic that names the assertion type, `tea-evaluate run` exits 12 as evaluator infrastructure failure and seals no trial record; reverting the allow-list lets a crashing `javascript` assertion (`asserts-error.yaml`) become a target `fail` row, a `test:evaluate-promptfoo` case
**And** the allow-list is the deterministic built-in types that execute no adopter code and call no model, with their `not-` forms: `contains`, `icontains`, `contains-all`, `contains-any`, `icontains-all`, `icontains-any`, `equals`, `starts-with`, `regex` and `is-json`, each verified against the installed version's assertion types before it is listed; a graded `pass: false` or `pass: true` from these types maps to a cited `fail` row and a `pass` row as before in the fixture and the rendered starter, and a test that refuses an allow-listed type fails (amended 2026-10-02 in Story 1.70's build: "in the fixture" holds for the forms its key map carries, `contains:pears` and `not-contains:shellfish`, since it maps by type and value; for every other listed form the unit checks that the fixture does not refuse it, and the starter maps pass and fail rows of every listed form)
**And** the wrapper also refuses an allow-listed assertion whose `value`, or an element of an array `value`, is a `file://` reference to a `.js`, `.mjs`, `.cjs`, `.py` or `.rb` file or a `package:` reference (the installed version's other code-loading forms are verified before the list is final), and one that carries `transform`, with a diagnostic naming the type and the reason (amended 2026-10-02 in round 1: the same refusal for a string `value`, or a string element of an array `value`, that contains `{{`, `{%` or `{#`, since promptfoo renders it as a template that can run code, for a `regex` pattern that does not compile and for `weight: 0`); a live case runs `contains` with `value: file://boom.py` (raising) through promptfoo and the rendered starter, and reverting the value guard makes it a `fail` row, a `test:evaluate-promptfoo` and `test:evaluate-guidance` case
**And** the evaluator guide names the allow-list, the code-running values, `transform` and the reason (an assertion that runs adopter code, or grades text the target did not produce, belongs in a `command` evaluator the adopter owns, where a crash exits non-zero) in its `## Separate ungraded framework errors from graded target failures` section, and `test:evaluate-guidance` fails when the allow-list, a refused type, the value guard, `transform` or the reason is removed
**And** `test:evaluate-promptfoo` and `test:evaluate-guidance`, both in `npm test`, exercise the fixture and rendered starter against an allow-listed pass and fail, a `javascript` crash, a code-file value, a `transform` and a model-graded type, and the completion notes record each revert check.

**Dependencies:** 1.43.
**Gate:** skill gates, `npm test`, engine check.

Amended 2026-10-02 in Story 1.70's build: the installed promptfoo 0.123.1 was read and run before the code-loading list was final (`evaluation-framework-facts.md`, the Story 1.70 check).
The criteria above hold with these changes.
The code-file test takes the resolved path before the first colon of a `file://` reference and refuses `.js`, `.cjs`, `.mjs`, `.ts`, `.cts`, `.mts`, `.py` and `.rb`, case-insensitively; the three TypeScript extensions come from the installed `JAVASCRIPT_EXTENSIONS`, and the match runs on the resolved path because promptfoo resolves it first (`file://boom.py/` and `file://./a/../boom.py` run the file).
The `package:` guard applies to a string `value` only: an element of an array `value` goes to promptfoo's data loader, so a code file there is ungraded (and refused by the wrapper all the same) and a `package:` element is a literal substring that stays admitted.
A `transform` is refused when it holds any value other than `null` or `undefined`; a key left empty in YAML is inert.
`contextTransform`, `provider` and `rubricPrompt` on an allow-listed type are inert, so the guard names only `transform`.
`AssertionTypeSchema` ends in a `custom()` member that accepts any string, so the allow-list is checked against its two enumerating members, `BaseAssertionTypesSchema` and `NotPrefixedAssertionTypesSchema`, and every installed type outside the list is checked to be refused.
A failing `transform`, the one source of an ungraded result among admitted assertions, is refused, so the end-to-end ungraded case rewrites the result after promptfoo returns (an object `value` on `contains` is ungraded in promptfoo, and the real shape is held by a unit).

Amended 2026-10-02 in Story 1.70's round 1 review, from the installed promptfoo 0.123.1 (`evaluation-framework-facts.md`, the round 1 check): three more refusals, each with a unit, a rendered-starter case and a live promptfoo case.
promptfoo renders a string `value` (and a string element of an array `value`) that is not a `file://` or `package:` reference through nunjucks, which reaches the JavaScript `Function` constructor, so an allow-listed type can still run adopter code through its value: a value containing `{{`, `{%` or `{#` is refused naming the type and the reason (the value is a template promptfoo renders, which can run code).
A `weight` of `0` is refused: promptfoo reports a failed assertion as a pass when `assertion.weight === 0`.
A `regex` or `not-regex` assertion with a string `value` that `new RegExp` rejects is refused: promptfoo grades the pattern error as a failure of the target.
Round 2 added a `regex` or `not-regex` string `value` that is a `file://` reference: promptfoo compiles the file's content after the wrapper's check, so it is refused and the pattern is written inline.

### Story 1.71: Bound a framework version probe with its own timeout

Added 2026-10-01 in Story 1.44's final review. Story 1.44's version probe runs through the evaluator's own launch path (`launchExecutable` in `cli/lib/evaluate/command-evaluator.js`), so it inherits `evaluator.timeoutMs`. A probe that hangs costs that whole timeout at every read: one at the start of the run, two per trial (before each launch and after each trial) and two per calibration launch. The probe prints a package identity and a version, so a bound far below an evaluator's timeout is enough for it.

As an adopter whose evaluator declares framework dependencies,
I want the version probe to carry its own short timeout,
So that a hanging probe stops the run within a stated bound (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** an `evaluator/frameworks.json` declaration, or the `evaluation.json` block that wires the evaluator (the build picks the place beside which the probe's other settings sit and records why)
**When** it carries a probe timeout, `probeTimeoutMs`, or leaves it out
**Then** an absent value takes a default of 10 seconds, a value above the hard maximum of 60 seconds, zero or a non-integer is refused by `check` with exit 10 under the `evaluator` rule, and the probe's effective timeout is the smaller of the probe timeout and `evaluator.timeoutMs`; a declaration written under Story 1.44 stays valid; accepting a value above the maximum makes the `test:evaluate-check` case fail
**And** a probe that outlives the effective timeout (a stub probe that sleeps past it) is reported as an unreadable dependency: `run` exits 12 with no sealed trial record within that timeout plus a stated grace, and `framework-versions.json` records the timeout that applied; launching the probe under `evaluator.timeoutMs` again lets the hanging probe run past the bound, so the `test:evaluate-evaluators` case that times the exit fails
**And** the bound holds at every read: a probe that hangs at the first read, at the recheck before a launch, at the recheck after a trial and at a calibration launch each exit 12 within the bound with no sealed record for the affected trial; reverting the dedicated timeout for any one of those reads makes its case exceed the bound
**And** a healthy probe is unchanged: it runs under the same launch path, base environment and confinement as before, and a run with a declaration and no probe timeout records the same configuration digest as under Story 1.44
**And** `references/evaluator.md` states the default, the maximum and the probe's total cost in a run (one read at the start, two per trial, two per calibration launch, so a hang costs one probe timeout because the run stops at the first unreadable read), the AgentEvals and promptfoo starters' declaration templates show the field, and `test:evaluate-guidance` fails when the default, the maximum or the cost statement is removed.

**Dependencies:** 1.44.
**Gate:** skill gates, `npm test`, engine check.

### Story 1.72: Observe the sealed-brief agent evaluator's installed adapter version

Added 2026-10-01 in Story 1.44's final review. Story 1.44 binds a `command` evaluator to the framework versions that executed. A `sealed-brief-agent` evaluator declares no framework, and the installed version of its agent CLI (the adapter in `cli/lib/agent-adapters.js`) appears in no provenance field; `LEARNED.md` may mention it and nothing checks it. An agent CLI upgrade changes the judging model's behavior under the same `EvaluatorConfiguration` digest, the gap Story 1.44 closes for command evaluators. The adapter is already named by `evaluation.json`, so the version needs no tracked declaration.

As an adopter whose evaluator is a sealed-brief agent,
I want each run bound to the agent CLI version that actually judged,
So that an agent CLI upgrade cannot silently reuse the old scoring configuration (CAP-13, AD-21, AD-22).

**Acceptance Criteria:**

**Given** a `sealed-brief-agent` evaluator
**When** `tea-evaluate run` prepares it
**Then** `run` reads the installed adapter version through `cli/lib/agent-adapters.js`, the one file that knows how each agent CLI reports its version, and records it in `EvaluatorConfiguration.decodingParameters["tea.evaluatorAgentVersion"]` and in the run artifact (`run.json`'s `evaluator`); no other file names a vendor flag or output format, and a static `test:evaluate-evaluators` case fails when `run.js`, `evaluators.js` or `sealed-brief-agent.js` does; reverting the read leaves the key absent, so a direct configuration test that changes only the stub agent's reported version finds the digest unchanged and fails
**And** an adapter version `run` cannot read (the CLI absent, a non-zero exit, output that holds no version, or a read that outlives its own bounded timeout, never `evaluator.timeoutMs`) exits 12 as evaluator infrastructure failure before qualification (Story 1.34), with no qualification attempt and no sealed trial record; removing the refusal lets qualification and trials run over an unobserved CLI, which the case catches
**And** the run rechecks the version before each launch of the agent (qualification attempts included) and after each trial; a change exits 12 without sealing the affected trial's record and records no vote for an affected attempt; reverting the pre-launch recheck or the post-trial recheck lets a stub that changes its reported version mid-run judge under the earlier digest, one case each
**And** an upgrade changes the configuration digest and the scoring version: two runs that differ only in the stub agent's reported version record different digests, and a direct configuration test with an unchanged wiring and a changed observed version proves the same; omitting the version from the configuration leaves both equal
**And** `score` and replay read the recorded `evaluator-configuration.json` and launch no agent CLI, so a recorded run scores byte for byte after the CLI moves; reading the version again in `score` makes the case, which removes the stub, fail
**And** the evaluator guide's sealed-brief section states that the run records the installed adapter version, that an upgrade changes the digest and calls for a fresh qualification and a `LEARNED.md` update, and `test:evaluate-guidance` fails when the statement is removed.

**Dependencies:** 1.34, 1.44.
**Gate:** skill gates, `npm test`, engine check.

### Story 1.73: Bind the declared frameworks' install state, not only their versions

Added 2026-10-01 in Story 1.44's final review. Story 1.44's probe observes one package's version. A plugin, a transitive package or a local patch inside an installed package changes behavior under the same observed version, so a run can judge differently under the same `tea.evaluatorFrameworks` list. A digest over the install state reads more of the disk than a version does, which is why the story follows Story 1.71's probe timeout.

As an adopter whose evaluator relies on a framework with plugins, transitive packages or local patches,
I want the run bound to the framework's install state as well as its version,
So that a changed dependency under an unchanged version cannot reuse the old scoring configuration (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** an `evaluator/frameworks.json` entry that names an install-state source, `installState` with a `source` of `lockfile` (the package's entry in the project's lockfile) or `tree` (the package's installed files, digested in sorted path order)
**When** `check` reads the declaration and `run` observes the packages
**Then** `check` refuses an unknown source or a malformed `installState` with exit 10 under the `evaluator` rule, and an entry without `installState` keeps Story 1.44's shape and records the same configuration digest as before; the probe reports an `installDigest` beside the package and version, and `run` exits 12 with no sealed trial record when a declared digest is missing or malformed in the probe's output; the declaration pins no digest, since the run records what it observed and a changed digest shows as a changed configuration digest; accepting an entry whose probe omits the digest makes the case fail
**And** `run` records the observed `installDigest` beside the version in `decodingParameters["tea.evaluatorFrameworks"]`, in `framework-versions.json` and in `run.json`'s `evaluator.frameworks`; a direct configuration test that holds the evaluator tree and the version fixed and changes only the observed digest finds a different configuration digest and scoring version; omitting the digest from the configuration leaves them equal
**And** a changed digest with an unchanged version is a changed dependency: between runs (a file patched inside the isolated fixture package, or its lockfile entry edited) the next run records a different configuration digest and scoring version, and mid-run (before a launch and after a trial) it exits 12 without sealing the affected trial's record; comparing versions alone at either recheck lets the patched package judge under the earlier digest, one case each
**And** the shipped `installed-version.mjs` computes both sources for a Node package, and a `test:evaluate-evaluators` case that patches one file inside the fixture package leaves its version fixed and finds a different `tree` digest; a probe that reports the version alone fails that case
**And** `references/evaluator.md` teaches when to declare `installState` (a framework with plugins or transitive packages that change judgments, a locally patched package, a dependency range that can resolve to different trees under one top-level version) and when the version alone suffices, and `test:evaluate-guidance` fails when either teaching or the two sources are removed.

**Dependencies:** 1.44, 1.71.
**Gate:** skill gates, `npm test`, engine check.

### Story 1.74: Scrub an echo whose letters change case unevenly and reach the evidence as \uXXXX escapes

Added 2026-10-01 in Story 1.66's build. Story 1.66 scrubs a secret in every letter case, but it derives the `\uXXXX` escapes of a secret from the secret in whole-text cases (as written, lower, upper, the Turkish mappings). A letter beyond ASCII has other escape digits in each case (`ü` is `\u00fc`, `Ü` is `\u00dc`), so a secret holding such a letter, echoed with some letters in one case and some in another (a word capitalized, the rest not) and then written with its non-ASCII characters escaped (Python's `ensure_ascii`, Go's HTML escaping with a non-ASCII writer), reaches the evidence unscrubbed. The reference states the limit.

As an adopter whose target echoes what it was sent through a serializer that escapes non-ASCII characters,
I want such an echo scrubbed whatever mix of letter cases it comes back in,
So that no evidence artifact holds a value the host injected (AD-4, AD-8).

**Acceptance Criteria:**

**Given** an `api` registry entry whose auth value holds letters beyond ASCII (a Latin letter with a diaeresis, a Greek and a Cyrillic letter, and a letter outside the BMP, which escapes as a surrogate pair, and an ASCII value that a Turkish-locale capitalizer turns into `Admin-İndex-Token`) and a fake port that echoes it capitalized per word and alternating, written with every non-ASCII character as `\uXXXX` in lower- and upper-case hex, as one level and as the second of two levels of JSON escaping
**When** the call goes through `hostEnvironmentPort`
**Then** the observation holds `[redacted]` in each place, a `test:evaluate-api` case beside Story 1.66's matrix; matching only the escapes of the whole-text cases leaves the echo in, which the case catches
**And** a fault's message and cause quoting the echo scrub with the same matching, and a cut text ending in the leading part of such an echo (four or more characters, cut inside an escape too) is replaced, a `test:evaluate-api` case; a cut text matched against the whole-text cases leaves the leading part in
**And** the matching grows linearly with the secret: a secret of forty letters beyond ASCII compiles to a pattern whose source stays under a stated bound and scrubs a megabyte of ordinary text in a stated time, a `test:evaluate-api` case; enumerating each mix of cases fails it
**And** the reference's sentence that states the limit is replaced by the behavior, and a case reading the section fails when the limit sentence returns.

**Dependencies:** 1.66.
**Gate:** `test:evaluate-api`, `npm test`.

### Story 1.75: Name a report-operation signature collision at check, before the run

Added 2026-10-02 in Story 1.65's round 1 review. Story 1.65 asks every HTTP interface of a deployment which release it runs, through one report operation per interface. eval-quality 4.7.0 refuses `duplicate-operation-signature` across the whole contract: a method plus an erased path template must be unique across all `api` operations of all interfaces. Two services that both serve their release at `GET /release` cannot each declare a report operation, and the registry compiles nowhere. `check` exits 0 for such a registry and `run` exits 4 with the compile refusal. The reference states the limit.

As an adopter whose HTTP interfaces serve their release at one path,
I want `check` to name the collision between their report operations,
So that I learn it before the run, at exit 10, with the interfaces and operations to change (AD-1, AD-7).

**Acceptance Criteria:**

**Given** a registry of two HTTP interfaces whose contract declares one report operation each with the same method and path template, and a `historical` probe whose deployments name both reports
**When** `tea-evaluate check` reads the evaluation
**Then** it exits 10 under `historical` and the finding names both interfaces, a `test:evaluate-check` case; the rule reverted makes `check` exit 0, which the case catches
**And** the finding names the colliding operation IDs and the shared method and path template, a `test:evaluate-check` case on the same registry; a finding that names the interfaces alone fails it
**And** a registry whose two report operations differ in path passes `check` with exit 0, a clean case; a rule that flags any two report operations fails it
**And** the route is the story's decision, recorded in its record with the reason: eval-quality scoping the duplicate-signature refusal per interface (then the engine compiles both operations and the case above becomes a clean case), or TeA's `check` calling the engine's own compile verdict for the report operations (AD-1: TeA computes no verdict of its own, so the finding quotes the engine's)
**And** the reference's `### Against deployments` replaces the sentence that `check` exits 0 for such a registry with the behavior, and the case reading the section fails when the limit sentence returns.

**Dependencies:** 1.65.
**Gate:** `test:evaluate-check`, `npm test`, engine check.

### Story 1.80: Bring a partial-clone project, its tags and a very large history into the withheld repository

Added 2026-10-01 in Story 1.57. The private repository that Story 1.57 builds for a confined git workspace packs the project's whole history from the project's object store. A project cloned with a promisor remote (`--filter=blob:none`, `--filter=tree:0`) does not hold that history on disk, so the build would fetch all of it from the remote, and a confined run over such a project exits 12 with a message that names the cause. The private repository also carries `HEAD` and the history but no branches or tags, so a target that builds with `git describe` or reads a tag finds none, where it found the project's before. The build reads the object walk's whole output into memory, so a history of more than about six million objects exceeds the buffer and the run exits 12. The config it carries for a tracked filter driver misses a driver whose name holds a space and a `required` setting written without a value, so the target's `git status` lists those files as modified.

As an adopter whose project is a partial clone, has a very large history, or whose build reads a tag,
I want the target's git to see what the project's git shows apart from the evaluation folder,
So that a confined run needs neither an opt-out nor a changed target (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a confined run over a project cloned with a promisor remote whose evaluation folder is committed
**When** the run starts and a stub target runs `git status`, `git log` and `git show HEAD:<a tracked file>`
**Then** the run completes with no exit 12, the stub's commands exit 0 over the objects the project holds on disk, no process fetches from the remote, and `git show` of the committed contract finds no object; restoring the refusal makes the run exit 12, which the case catches (amended 2026-10-03 in Story 1.80's build: git before 2.44 cannot be told not to fetch, so a partial-clone project exits 12 there with the way out named, and the checkout of a revision whose objects the clone lacks on disk, a historical probe's among them, exits 12 naming the revision, so that no process of a confined run fetches; a `test:evaluate-arms` case runs a historical probe over a blob-less clone)
**And** a stub target in a confined run over a project with a lightweight and an annotated tag lists both with `git tag -l`, resolves `git describe --tags`, and reads the tagged commit's files, while no remote URL, credential or hook reaches the private repository and a tag on a commit outside the evaluated history or on a tree is left out; dropping the tag copy makes `git tag -l` print nothing, which the case catches (amended 2026-10-03 in Story 1.80's build: the last clause names the tags the build leaves out, since a ref to an object the private repository lacks breaks `git for-each-ref`)
**And** a confined run over a history of more than six million objects (the object walk streamed from a stub `git` that prints seven million ids, so no such repository is built) completes, and a walk that buffers its whole output fails the case (amended 2026-10-03 in Story 1.80's build: the 256 MB buffer holds about 6,547,000 ids of 41 bytes, so a stub that prints 6,500,000 ids passes the buffered walk and seven million does not; the build also streams the commit list that finds the folder's trees)
**And** a project whose local config sets a filter driver named with a space, or `required` with no value, gives the target's git the same driver configuration (`git config --get` of each key prints what it prints in the project) and the same `git status`, a case that fails while the driver is dropped (amended 2026-10-03 in Story 1.80's build: no attribute can name a driver whose name holds a space, since `.gitattributes` splits a value at whitespace, so that driver changes no `git status` and the case reads its configuration; the `required` key is read the same way, since a driver whose command works reads alike with or without it)
**And** the reference's `### File-system confinement` drops its three limits (a partial-clone project is refused; the target's git has no branches or tags; a history of more than about six million objects is refused), and a case reading that section under its exact heading fails while any remains (amended 2026-10-03 in Story 1.80's build: the first limit is the general refusal of a partial-clone project, which goes; the section keeps the one refusal that stays, a git before 2.44 exits 12 for a partial-clone project with the way out named, and the case fails if that statement disappears).

**Dependencies:** 1.57.
**Gate:** `test:evaluate-confinement`, `npm test`.

### Story 1.81: Record how much of the macOS audit the kernel's log lost

Added 2026-10-01 in Story 1.60. macOS reports each ungranted read through the kernel's sandbox log, which loses reports without a trace when the host is saturated or a target reads tens of thousands of files a second: Story 1.60's spike saw none lost in 3,000 reports at a quiet 440 a second, one to five in 1,600 on a saturated host, and 7 to 20 percent of a burst of 40,000 a second. An empty `observedMounts` from a macOS run therefore means only that no report arrived. Linux's `strace` trace loses none.

As an adopter reading `observedMounts` from a macOS run,
I want each trial to record how many of the audit's own canary reads the log delivered,
So that an empty list is read together with how complete the channel was (AD-7).

**Acceptance Criteria:**

**Given** a macOS trial whose audit sends a canary read every 50 ms through the sandbox's own token, a read of a file beneath the audit directory that no target can reach
**When** the trial ends
**Then** the trial's entry in `run.json` records the canaries sent and the canaries the log delivered, and the run's summary names every trial that lost one with the counts; a case that runs a stub `log` which drops a fraction of the reports leaves a recorded loss and names the trial, and a case that restores the unconditional `complete` leaves no loss to name and fails (amended 2026-10-03 in Story 1.81's build: the field is `run.json`'s `observedMountsChannel`, one entry `{ conditionArm, trialIndex, completeness, canariesSent, canariesDelivered }` for each audited trial of the trial sets' arms, plus `logReportedLoss`, whether the log itself reported lost events, and the run's summary line, which `run.json`'s `outcome.message` also holds, names each `lossy` trial with the canaries lost out of the canaries sent; a canary counts as sent when it is attempted, before its file is written or its process started, and a gap of more than 200 ms between attempts counts the canaries the cadence called for as sent and undelivered, so a target that kills, stops or prevents its canaries or freezes the runtime makes the trial lossy and cannot hide a loss, the audit sends one more when the trial ends so a trial shorter than 50 ms has a count (a final canary that cannot start exits 12), at most eight run at once on a host too busy to start them (a tick the cap skips counts as sent and undelivered), and the stub `log` reaches the real CLI through the test-only `TEA_EVALUATE_AUDIT_LOG`, as `TEA_EVALUATE_CONFINEMENT_PLATFORM` stands in for the platform)
**And** a trial that lost no canary and listed no read records `complete`, and a Linux trial records `complete` with no canaries sent, since `strace` reports every traced syscall of the call (amended 2026-10-03 in Story 1.81's build: `complete` is the record of every trial that lost no canary and saw no loss event from the log, whether it listed a read or not, since a listed read does not make the log complete; a trial that launched nothing, ran in a run that opted out or was a sealed-brief evaluator qualification attempt has no entry, and a trial that lost a canary records `lossy` whatever it listed)
**And** `docs/reference/tea-evaluate-cli.md`'s `### File-system confinement` states that macOS reports are lossy, with the measurements above, and names the field `run.json` records; a case reading that section fails while either is missing.

**Dependencies:** 1.60.
**Gate:** `test:evaluate-confinement`, `test:evaluate-run`, `npm test`.

### Story 1.82: Give a Bubblewrap target no route to the host's path-based Unix sockets

Added 2026-10-02 in Story 1.63. Story 1.63 put every Bubblewrap target in a network namespace of its own, which hides the host's abstract Unix sockets. A path-based socket is a file, and the target's view of the file system is `--ro-bind / /`: a read-only mount stops writes, and a `connect()` to a socket file is no write, so a target can still connect to `/var/run/docker.sock`, the system bus at `/run/dbus/system_bus_socket` or an agent's socket under `/tmp`, and ask the host service behind it to run a job outside the sandbox. Story 1.31 hides `/run/user` only, which closes the user session's own sockets.

As an adopter running a Linux target under Bubblewrap,
I want the target to have no route to the host's path-based Unix sockets,
So that a process it starts cannot ask a host service to run a job outside the sandbox (AD-8).

**Acceptance Criteria:**

**Given** a Bubblewrap target on a Linux runner, a listener the runtime serves on a Unix socket file under the temp directory outside the target's grants, and the host's existing `/run/dbus/system_bus_socket` and `/var/run/docker.sock` where present (root-owned, so a case connects to them and the runtime binds neither)
**When** the target connects to each
**Then** each connection fails while an HTTP service the target started stays reachable from the runtime through the bridge; removing the mechanism lets the connection through and fails the case (amended 2026-10-03 in Story 1.82's build: the mechanism is an empty device file mounted over each path-based socket the runtime lists when a call starts, outside the call's grants and the directories the sandbox hides already, over the socket's real path, since Bubblewrap cannot mount over a path that goes through a link; the list is the kernel's table of bound Unix sockets (`/proc/net/unix`), the socket files beside a listed path that was moved after it bound, and the socket files in `/run`, `/var/run`, `/tmp` and `/var/tmp` and in their directories, which finds the Docker socket a container job shares from another network namespace, and a path joins it only after `lstat` on its exact path finds a socket file, with names read as bytes and a name that is no UTF-8 skipped, so no file another user leaves can stop a call, their mounts handed to Bubblewrap in a file (`--args`), and a call whose Bubblewrap could not start over a socket that went away is started again over its own list without the vanished ones; review round 2 amended the bound: the list is ranked by who can create a socket (the well-known service sockets, root and the system accounts, the runtime's own user, then every other user, taken in turns, the first socket of each owner and then the second of each, as review round 3 amended it) and cut to the room the call's own command leaves for mounts, at most 2,000, since Bubblewrap counts the target's arguments with the mounts against 9,000, so a local user who makes sockets in bulk cannot push out another user's socket while the room left after the first three ranks holds one socket for each owner, and a socket in `/dev` or `/proc` takes no room; a call is refused (exit 12) when the sockets of the first three ranks alone exceed the room, which no other user can cause; `run.json`'s `hostSocketTruncation` records each trial whose calls left sockets of other users reachable; the launcher leaves the target's environment as the call gave it for every variable whose name is a valid shell identifier and that the shell does not initialize, and restores `PWD`, `OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND` and `PPID` (review round 3 amended it to those seven; review round 4 narrowed the claim, since a name no shell can hold, an exported shell function and the variables bash initializes itself can still reach the target changed or missing, which the reference stated and Story 1.89 closed; amended 2026-10-06 in Story 1.89's build: the launcher is a Node program with no shell, and the target receives exactly the environment the call gave it for every name apart from `PWD`, `NODE_V8_COVERAGE` and the proxy variables of a call with `egress`, as the reference states, the reference's limit sentence replaced by that claim); the socket files beside a moved path join the list in the same order of owners (review round 4: the directories are read by who owns them and each socket is charged to its own owner, so a directory of 200,000 socket files costs a bounded list and cannot push out the moved socket of root, of a system account, of the runtime's own user or of a third user, whichever directory the table names first; the one bound left is one other user's socket files beside a moved path past the room); `the host socket record` drives a cut report from the registry's port through a trial to `run.json` and the summary; `the path socket units` hold each of these; `the path socket route` serves a socket under the temp directory and a link to it, tries the host's system bus and Docker sockets where the runtime's user can connect to them, and finds each refused for an entry that keeps the default network and for one that declares `host`, then finds each reached with the mounts taken out of the vector, and `the path socket units` run on every host; the started service stays reachable because the bridge's socket is bound inside the target's own namespace and its directory is a grant, which `the confined pipeline` runs under the mounts on Linux; a socket a host process binds after the call started, one unlinked and bound again, one bound in another network namespace outside the scanned directories, one whose path holds a line break in a directory outside them, one whose file name is no UTF-8, one of another user's past the room or of 2,000 directories of a root and a second path to the same socket file through a hard link or another mount stay reachable for that call, since a mount covers the file as listed and the read-only `/` cannot be given a mount over a file that does not exist yet, which the reference states and whose connection the audit lists as an observed mount (Story 1.86, amended 2026-10-04 in Story 1.86's build); the evaluation layer's processes keep every host socket, which Story 1.88 closes (amended 2026-10-04 in Story 1.88's build: a layer process has no route to a path-based host socket on Linux and on macOS, and a socket bound after the process started stays reachable under Bubblewrap alone); a macOS target has a rule on the socket's path, which Story 1.87 adds, amended 2026-10-04 in Story 1.87's build)
**And** a socket the target's own grants hold (one in its workspace or in a private directory of the call, the bridge's socket included) stays connectable, a case that fails while the mechanism blocks every socket (amended 2026-10-03 in Story 1.82's build: `the path socket route` connects to a socket in the workspace and one in a private directory of the call and asserts the vector hides neither, and mounting the masks after the grants' binds with nothing left out fails it; the bridge's socket is bound by the shim inside the target's namespace in such a directory, and `the confined pipeline` reaches the service behind it on Linux)
**And** the story's record states the mechanism chosen and the reasons the others were not: a view of the socket directories that leaves out a socket kept elsewhere, Landlock's rule on connecting to a socket path (a kernel the CI runners may not have), a seccomp filter that cannot read the address (amended 2026-10-03 in Story 1.82's build: the record's Decisions list names the mechanism, the three options above and one more it weighed, a root of the target's own with only the allowed paths bound in, each with the reason and the evidence of a Linux run)
**And** `docs/reference/tea-evaluate-cli.md`'s `### File-system confinement` names the sockets a target cannot connect to and the ones it reaches, and drops the sentence that lists `/run/dbus/system_bus_socket`, `/var/run/docker.sock` and an agent socket as connectable; a case reading that section fails while the old sentence remains (amended 2026-10-03 in Story 1.82's build: ten sentences replace it, each a claim of `the network reference` that names the case backing it: the sockets a target cannot connect to, the ones it reaches, the list's limits, the room, the ranking, the refusal, the record of what the room cut, the exact-path rule, the evaluation layer's and macOS's; review round 4 added four: the neighbors' order, the one bound that remains, the launcher's environment and its limit; Story 1.89 replaced the last two by the launcher's own sentence and the exact-environment sentence).

**Dependencies:** 1.63.
**Gate:** `test:evaluate-run`, `test:evaluate-confinement`, `test:evaluate-api`, `npm test`, and the Linux CI job.

### Story 1.83: Give a confined Linux target a route to the hosts its registry entry authorizes

Added 2026-10-02 in Story 1.63's first review round. Story 1.63 isolates every Bubblewrap target in a network namespace of its own and lets an entry declare `"network": "host"` where it needs the network, which the skill and agent targets do, since an agent CLI calls its model provider. An entry that declares `host` keeps the host's whole network and with it a route to the host's abstract Unix sockets, so the AD-8 gap stays open for exactly the targets that run an agent.

As an adopter evaluating a skill or agent on Linux,
I want a confined target to reach the hosts its registry entry authorizes and no other,
So that an agent runs isolated, with a route to its model provider alone, and `network: host` retires (AD-8).

**Acceptance Criteria:**

**Given** a Bubblewrap target whose entry keeps the default network and authorizes one host and port (a loopback fixture standing in for a model provider)
**When** the target connects to that host through the egress route the runtime gives it, and then to another host and to an abstract Unix socket the runtime serves
**Then** the first connection reaches the fixture and the other two fail; the route is a runtime-owned egress proxy reached through the same bridge mechanism as a started service, so the namespace keeps a loopback and nothing else, and removing the proxy's host limit lets the second connection through, which fails the case
**And** the proxy forwards a connection only for a host and port the entry authorizes, decided by eval-quality's `evaluateTarget` as the HTTP port's calls are, a refusal naming the host and the entry in the run's record, a case that sends a request for an unauthorized address
**And** an entry that authorizes no host reaches none, and an entry that declares `"network": "host"` still runs as Story 1.63 left it until the field is removed from the schema in this story's last step, which leaves `check` refusing it with the entry named and a pointer to the authorization
**And** the proxy's socket and its authorization are private to the call and removed with it on every path, a signal that ends the run included, a case that kills the run mid-call
**And** `docs/reference/tea-evaluate-cli.md`, the skill's harness, adapters and run guides and the `tea-skill-runner` section teach the authorization in place of `"network": "host"`, and a case reading each fails while the old declaration remains; the ci guide is Story 1.84's, which teaches the authorization, since editing it needs the two live capture sessions rerun

**Dependencies:** 1.63.
**Gate:** `test:evaluate-run`, `test:evaluate-api`, `test:evaluate-confinement`, `test:evaluate-guidance`, `npm test`, and the Linux CI job.

(Amended 2026-10-03 in Story 1.83's build: the authorization is a registry field, `egress`, on a command, tool-server or HTTP entry that starts a process: a list of `{ "host", "port", "addresses" }` items, each becoming an eval-quality `ProbeTargetAuthorization` (scheme `https`, method `GET`, since a tunnel shows the runtime neither) that `check` parses through `parseProbeTargetPolicy`, holds to the URL spelling of the host, refuses twice and refuses on an HTTP entry that names no server; entries that start one target must list the same `egress`.
The route is the mirror of the bridge: the runtime serves an HTTP `CONNECT` proxy on a Unix socket in a private directory of the call beneath the run's private parent (the temp directory, or `/tmp` when that leaves no room for a socket path, where the list has none), the directory is bound read-only at a path under the synthetic `/dev` after the private root is emptied, and the call's status shim (`--egress`) listens on a loopback port of the namespace, connects each connection to that socket and starts the target with `HTTPS_PROXY`, `https_proxy` and `NODE_USE_ENV_PROXY=1`; the namespace keeps a loopback and nothing else, and a call whose entries list no host has no proxy and no variable.
The proxy asks `evaluateTarget` with no address first, so a host and port no item lists is refused before the name is resolved, then resolves the host and connects to a resolved address an item names, the next when one cannot be reached, and to no other; every refusal answers `403` naming the reason, the host and the entry, and `run.json`'s `egressRefusals` lists each trial's refusals (at most 50 distinct requests a trial, the rest counted in `omitted`) with the summary naming the trials, beside `egress`, which replaces `hostNetwork`.
The proxy and its authorization are private to the call: the authorization lives in the runtime's memory and no file carries it, the directory is on the run's scratch list, and the end of the call, its failure, a signal that ends the run and a kill of the run (the next run over the evaluation reclaims the dead run's private parent) remove it.
`"network"` is removed from the schema: `check` refuses an entry that declares it, naming the entry and pointing at `egress`, and no `network: host` run remains.
Raw TCP clients and plain `http_proxy` clients have no route, which the reference and the gaps guide state; `ci.md` keeps its entry with no `egress`, and Story 1.84 teaches it there.)

### Story 1.84: Teach a Linux skill target's network declaration in the CI guide and rerun its live sessions

Added 2026-10-02 in Story 1.61's build, from the `ci.md` part of Story 1.61's earlier amendment.
Story 1.63 made every Bubblewrap target run in a network namespace of its own and gave each registry entry a `network` declaration; the `ci-registry` example in `references/ci.md` is a `tea-skill-runner` entry with `RESERVATION_MODEL_KEY`, which on Linux needs `"network": "host"` to reach its model provider, and the guide's live-check passages never say so.
Editing `ci.md` invalidates the committed capture records of `test/fixtures/evaluate-ci-repos/`, which pin the SHA-256 of `references/ci.md`, `SKILL.md` and `assets/evaluation-ci-plan.template.json`, so the edit needs both live capture sessions rerun as Story 2.4's record describes (`claude -p`, `claude-sonnet-5-5`, `acceptEdits` plus Read, Write, Edit, Glob, Grep and Bash, in scratch copies of `tagged-release` and `nightly-deploy` with the installed skill, `_bmad/tea/config.yaml`, `evals/node_modules/.bin/tea-evaluate` linked to `cli/evaluate.js` and `tiers` reset to the AI-feature evaluation's, one scored run with no baseline and the prompt `capture-record.json` holds).
The auto-mode classifier denied launching those sessions twice in Story 1.63, so the story waits for the owner to run them or to add a permission rule.

As an adopter wiring continuous proof for a Linux skill target,
I want the CI guide's registry example and live-check note to declare the target's network,
So that the plan's live checks reach the model provider on a Linux runner (CAP-11).

**Acceptance Criteria:**

**Given** `references/ci.md`, its tagged `ci-registry` example and the two capture records
**When** the guide is edited and both live sessions rerun
**Then** the `ci-registry` example authorizes the model provider's host and port in the form Story 1.83 introduced and validates against the runtime schema, and the guide states that on Linux the live checks also need the target's registry entry to carry that authorization; `checkCiGuidance` holds the sentence as a marker, and deleting either the authorization or the sentence fails `test:evaluate-guidance`
**And** each `capture-record.json` is regenerated from its session's output and pins the new digests of `ci.md`, `SKILL.md` and the plan template, and `test:evaluate-ci` is green; keeping the old records beside the edited guide fails it with "references/ci.md changed since the live session read it"
**And** the story's record states each session's prompt, model, tools and outcome.
**And** the change goes through `bmad-workflow-builder` with a clean Analyze gate (AD-16, AD-18).

(Lane 2 runs Story 1.83 first. Story 1.83 removes `"network": "host"` from the schema and leaves `ci.md` to this story, so the example teaches the authorization 1.83 introduces, and one rerun of the live sessions covers the edit.)

(Amended 2026-10-03 in Story 1.83's build: the authorization is an `egress` item `{ "host", "port", "addresses" }` on the entry, so the `ci-registry` example lists the model provider's host, port and addresses there, `checkCiGuidance` holds the sentence about it as the marker, and the example's `evaluation.json` form is the one the harness guide's registry fragment shows.)

(Amended 2026-10-03 in Story 1.84's build: the marker sentence is "On Linux the live checks also need the target's registry entry to carry the `egress` authorization for the hosts it reaches", and the guide adds three more that `checkCiGuidance` holds beside it: a confined Linux target runs in a network namespace with a loopback and nothing else, the runtime's proxy carries `CONNECT` tunnels for a listed host and port so a client that opens none has no route, and an entry that lists no `egress` reaches no host while macOS ignores the field.
The `ci-registry` example lists `api.anthropic.com`, port 443 and the two addresses of the harness guide's registry fragment, and `checkCiGuidance` fails while the example carries no `egress` item with a host, a port and addresses, while it carries the retired `"network"` declaration, and while any of the four sentences is missing.
Both sessions ran on the schema 2 tree of `evaluation.json`, so each wrote schema 2 bytes and the regenerated records declare no `migrations` entry; the Story 1.103 capture-record guard cases now build the record an older session leaves from the committed one and keep refusing a false, retyped, absent or extra migration.)

**Dependencies:** 1.61, 1.83.
**Gate:** builder Analyze, `test:evaluate-guidance`, `test:evaluate-ci`, `npm test`.

### Story 1.85: Show a sparse-checkout project to the target's git as the project shows it

Added 2026-10-03 in Story 1.80's build.
A project whose worktree uses sparse checkout (`git sparse-checkout set`, the usual shape of a large monorepo, and a blob-less clone made with `--sparse`) has a worktree that inherits the cone, so the files outside it are absent from the checkout.
The private repository's index is rebuilt with `git read-tree HEAD`, which sets no skip-worktree bit, so the target's `git status` lists every tracked file outside the cone as deleted where the project's status lists nothing.
Story 1.57 has this defect for any sparse project, and Story 1.80 makes it reachable for partial clones.

As an adopter whose project uses sparse checkout,
I want the target's git to show the cone's files and the same clean status as the project,
So that a confined run needs neither an opt-out nor a changed target (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a confined run over a project whose worktree is sparse, with a cone that leaves tracked files out of the checkout
**When** a stub target runs `git status --porcelain`, `git ls-files` and `git sparse-checkout list`
**Then** the status lists no deletion and equals the project's, `git ls-files` lists the files outside the cone, and the cone's patterns read as the project's; rebuilding the index with a plain `read-tree` lists the files outside the cone as deleted, which the case catches (amended 2026-10-04 in Story 1.85's build: the case runs a cone, a pattern list, a cone with a sparse index and a blob-less clone made with `--sparse`, and compares every line the stub prints with the project's own, byte for byte: `git status --porcelain`, `git ls-files`, `git ls-files -t` (the skip-worktree flags), `git sparse-checkout list`, `core.sparseCheckout` and `core.sparseCheckoutCone`, and the tracked files the checkout holds; the evaluation folder's paths leave the project's lines, since the target's git sees it as an empty tree; the worktree's metadata directory, which the target may read, holds no `config.worktree`, since `git worktree add` copies the project's worktree-scoped remotes, URLs and credential helpers into it, and the runtime removes the file whether or not the project is sparse, since a legacy sparse project keeps its settings in `.git/config` and has none while a non-sparse project that uses `extensions.worktreeConfig` has one; amended 2026-10-04 in Story 1.85's review round 1: the line of the long-form `git status` that names the sparse checkout is compared too, a sparse index included, since the private repository carries `index.sparse` when the worktree reports it)
**And** a project that is not sparse keeps the index it has today, a case that compares the target's `git status` and `git ls-files` with the project's and fails while a sparse rule reaches a non-sparse worktree (amended 2026-10-04 in Story 1.85's build: the same lines as above, and the target's `git sparse-checkout list` exits 128 and `core.sparseCheckout` is unset, as the project's)
**And** an index step that fails refuses the workspace with exit 12 naming `read-tree`, leaving no workspace, temp file or worktree registration, and a case with a `git` shim that fails `read-tree -m` fails while the step runs without its check (added 2026-10-04 in Story 1.85's review round 1)
**And** the reference's `### File-system confinement` says a sparse project shows the target the project's status, and a case reading that section under its exact heading fails while the sentence is absent.

**Dependencies:** 1.80.
**Gate:** `test:evaluate-confinement`, `npm test`.

### Story 1.86: List a connection to a host's path-based Unix socket outside the grants as an observed mount

Added 2026-10-03 in Story 1.82's build. Story 1.82 mounts an empty device file over each path-based Unix socket the kernel lists as bound on the host when a call starts. A socket a host process binds after the call started, one unlinked and bound again, and one bound in another network namespace of the host stay reachable for that call, and the audit lists none of their connections, since it traces file syscalls and a `connect()` to a socket file is none of them.

As an adopter reading `observedMounts` from a Linux run,
I want a connection to a socket outside the target's grants listed as an observed mount,
So that a route the mounts could not close shows in the isolation manifest and `score` exits 3 (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a Bubblewrap target whose process, after its call started, connects to a Unix socket file the runtime bound outside the target's grants
**When** the call ends
**Then** the socket's path is in the trial's `observedMounts` and `score` exits 3 with eval-quality's isolation violation naming it; dropping the `connect` trace leaves the list empty, which the case catches (amended 2026-10-04 in Story 1.86's build: the audit's trace gains `connect` and the three sends that carry an address, `sendto`, `sendmsg` and `sendmmsg`, since a datagram socket is reached by a send with no `connect`; the entry is the socket file's real path, a link in the workspace to the socket resolved to the file the kernel reached, and a call is listed when the kernel did not refuse it: it returned, found the listener's queue full (`EAGAIN`), was interrupted by a signal or was still waiting when the call ended; `the socket connection route` binds the socket after the call started and finds it listed, through a link and by a datagram too, and `the socket connection run` shows `score` exit 3 naming it) (Amended 2026-10-04 in Story 1.86's review round 1: a call that strace printed with the return value `= ?` is a call the end of the call cut short and is listed; a link the target makes is followed from the trace through a hard link to it (`link`, `linkat`), a directory that holds it renamed, two names exchanged by `renameat2`, a link made through a link to a directory and a link in the sandbox's own `/dev`, and a connection through a path the trace later removes, renames or replaces, or whose directory it does, is listed by the path as given unless the call bound that socket itself, since a link the project held that the target removes leaves the host nothing to read; the trace also reports `bind`, `mount`, `open_tree` and `move_mount`, so a bind mount of a socket file from outside the grants is listed by its source, and `io_uring_setup` is failed with `ENOSYS`, so no ring carries `IORING_OP_CONNECT`; a call that names no socket file is held in no memory; a `sendmmsg` that the end of the call interrupted prints none of its messages, so the datagrams it delivered first have no address in the trace and the reference says so) (Amended 2026-10-04 in Story 1.86's review round 2: a bind exempts a connection only while it stands, so a link the project held that the target removed, bound over or put back is listed as given; a bind mount is listed by its source whatever the source holds and its destination leads to the source for the connections that follow, so a source the target removes after the mount is listed as given; a `..` after a link the trace did not make goes to the parent of the directory the link leads to; the replay is linear in the trace, and a split call that names no socket file is held in no memory) (Amended 2026-10-04 in Story 1.86's review round 3: the replay stays linear for a target that renames a directory of links back and forth, since the table of links is a tree of directory nodes and a rename moves one node; a path a `..` was resolved against on the host counts as the connection's name does for the names the target removes, renames or replaces afterwards; a bound socket stands only when neither spelling of its name was replaced after the bind; and a bind mount's destination leads to the source under both spellings of its directory)
**And** a connection to a socket inside the grants (the workspace or a private directory of the call, the bridge's included) lists nothing, and so does a connection the mounts of Story 1.82 refused, a case for each; listing every connection fails the first, and listing a refused one fails the second (amended 2026-10-04 in Story 1.86's build: the grants a connection is judged against are the workspace, the call's private directories and home, the bridge's directory among them, the sandbox's own `/dev` and `/run/user` and the egress proxy's directory, whose socket the status shim connects to; a connection the mounts refused answers `ECONNREFUSED`, as do a path with nothing behind it and a stale socket, and every error but `EAGAIN` and an interrupted call counts as a refusal, so `ENOENT`, `EACCES`, `EPROTOTYPE` and `ECONNREFUSED` list nothing) (Amended 2026-10-04 in Story 1.86's review round 1: the home is a grant of its own, as it is when it lies beneath the private root in a run, so the units give the sandbox a private root with the home beneath it and the run case serves and connects to a socket in the home)
**And** an abstract socket and a TCP port the namespace refuses list nothing, and a service the target started that the runtime reached through the bridge adds no entry to a clean trial; listing a connection that is not to a Unix socket file fails the case (amended 2026-10-04 in Story 1.86's build: an abstract address, in strace's `@"name"` spelling and the older leading-NUL one, an address of any other family and a send with no address name no file; `the socket connection route` serves and connects to an abstract socket and a loopback port inside the namespace, and the existing confined pipeline cases hold that a bridged server and its egress proxy add no entry)
**And** the reference's audit passage names the connection as a listed access and its sentence on the table's limit points to it, and a case reading `### File-system confinement` under its exact heading fails while either is missing (amended 2026-10-04 in Story 1.86's build: the audit passage gains five sentences, the connection as a listed access with the calls traced for it, the socket a late bind makes an observed mount, the connections the kernel did not refuse, the ones it refused, and what adds nothing; the sentence on the table's limit ends in the audit's listing of a connection to any of those sockets; `the socket connection reference` reads them under the exact heading, and `the network reference` holds each as a claim a case backs) (Amended 2026-10-04 in Story 1.86's review round 1: the audit passage gains four sentences, on the links followed, the path removed after the connection, the bind mount and the `sendmmsg` the end of the call interrupted; the sentences on `--seccomp-bpf` and on `io_uring` name the calls stopped and the ring denied) (Amended 2026-10-04 in Story 1.86's review round 2: the bind mount sentence reads "A bind mount whose source lies outside those places is listed by its source, whatever the source holds", and the passage gains a sentence on a nested sandbox that bind-mounts system paths, one on the destination of a bind mount and one on a `..` after a link).

**Dependencies:** 1.60, 1.82.
**Gate:** `test:evaluate-confinement`, `npm test`, and the Linux CI job.

### Story 1.87: Give a macOS Seatbelt target no route to the host's path-based Unix sockets

Added 2026-10-03 in Story 1.82's build. The Seatbelt profile starts from `(allow default)` and denies a `connect()` to a socket under the user's private root only, so a macOS target can connect to `/var/run/docker.sock`, Docker Desktop's `~/.docker/run/docker.sock`, an agent socket under `/private/tmp` or the one `SSH_AUTH_SOCK` names, and ask the service behind it to run a job outside the sandbox. Seatbelt names a socket by its path (`remote unix-socket`), so a rule can close the route for a socket bound after the call started too, which Bubblewrap's mounts cannot.

As an adopter running a macOS target under Seatbelt,
I want the target to have no route to the host's path-based Unix sockets,
So that a process it starts cannot ask a host service to run a job outside the sandbox (AD-8).

**Acceptance Criteria:**

**Given** a Seatbelt target on macOS, a listener the runtime serves on a Unix socket file under the temp directory outside the target's grants, and the host's Docker socket where it exists
**When** the target connects to each
**Then** each connection fails; removing the rule from the profile lets the connection through and fails the case (amended 2026-10-04 in Story 1.87's build: the profile opens its socket rules with `(deny network-outbound (remote unix-socket))`, which refuses every `connect()` to a socket path with `EPERM`, and allows the grants back after it; `the Seatbelt path socket route` serves a socket under the temp directory, a link to it beside it and one in the workspace, a link the target makes itself, and tries the host's `/var/run/docker.sock`, Docker Desktop's `~/.docker/run/docker.sock` and `/var/run/com.docker.vmnetd.sock` and the socket `SSH_AUTH_SOCK` names where the runtime's user reaches them, finds each refused, and finds each reached with the denial taken out of the real profile; Seatbelt matches the real path of the socket, so a link leads where it leads, and a target cannot hard-link a socket outside its grants into its workspace)
**And** a socket in the target's workspace or in a private directory of the call stays connectable, and the system services a toolchain needs (the resolver, the log) keep answering, which a case that resolves a name and runs the macOS confinement cases checks; a rule that denies every socket fails both (amended 2026-10-04 in Story 1.87's build: the allowances after the denial name the workspace, the call's private directories, the home, each by both spellings, and the two system services the probes on macOS 27 showed a toolchain needs, the resolver `/private/var/run/mDNSResponder` that every name lookup of the C library asks and the BSD log socket `/private/var/run/syslog`; every other socket of `/private/var/run` stays closed, Docker Desktop's privileged helper `com.docker.vmnetd.sock` among them; the home beneath the user's private root is allowed again after the root's denial; `the Seatbelt path socket route` connects to a socket in each of the grants and resolves the host's own `.local` name, which only the resolver answers on a host with no network, and runs the same two probes against a profile with every allowance taken out, which fail both; `the Seatbelt path socket units` read the profile's text on every host, so a Linux host's static level fails when the rule is wrong)
**And** a socket the runtime binds after the call started is refused too, since the rule names a path and no list; a rule built from a list read when the call starts fails the case (amended 2026-10-04 in Story 1.87's build: the case starts a target, binds a socket outside the grants after it started and finds it refused, with a control that binds one in the workspace after the start and reaches it and one with the denial taken out that reaches both; the units generate the profile before and after a socket is bound and find the same text)
**And** the reference's macOS sentence from Story 1.82 is replaced by the sockets the profile closes and the ones it reaches, and a case reading `### File-system confinement` under its exact heading fails while the old sentence remains (amended 2026-10-04 in Story 1.87's build: five sentences replace the two, on the sockets the profile closes, the ones it reaches, the ones it keeps closed in `/var/run`, the path rule and its links, and Seatbelt's abstract sockets, `egress` and Mach services; `the network reference` holds each as a claim a case backs, and `the network reference` fails while the old sentence or a claim is missing).

**Dependencies:** 1.82.
**Gate:** `test:evaluate-confinement`, `npm test`.

### Story 1.88: Give the evaluation layer's processes no route to the host's path-based Unix sockets

Added 2026-10-03 in Story 1.82's build. The processes that run adopter or agent code for the evaluation (a `command` evaluator, a sealed-brief agent, the rubric judge, the evaluation's HTTP port) run under `bubblewrapLayerArguments`, whose `/` is a writable bind of the host's with the evaluation folder read-only. They keep every host socket, so a sealed-brief agent run by a user in the `docker` group can start a container that writes the evaluation folder. Story 1.82's mounts cannot be copied as they are: over a writable `/`, a mount over a socket file that went away between the list and the mount makes Bubblewrap create an empty file on the host.

As an adopter running an agent as the evaluator,
I want the evaluation layer's processes to have no route to the host's path-based Unix sockets,
So that a process the evaluator starts cannot ask a host service to write the evidence the layer protects (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a Bubblewrap process of the evaluation layer on a Linux runner, and a listener the runtime serves on a Unix socket file under the temp directory
**When** the process connects to it and to the host's `/var/run/docker.sock` where present
**Then** each connection fails while the layer's own sockets (the HTTP port's, the agent's bridge relay's) stay connectable; removing the mechanism lets the connection through and fails the case (amended 2026-10-04 in Story 1.88's build and in its review rounds 1 to 3: the mechanism is, for each socket the list names, a bind of the socket's own path onto itself followed by the empty device file over it, after the layer's read-only binds; the list is the one a target's call reads (`host-sockets.js`), asked for at every start of a layer process (`refresh`, called by `launchPrefix` at the spawn sites of the `command` evaluator, the sealed-brief agent in both forms, the rubric judge, the agent's version probe and the HTTP port) without `/dev`, `/proc` and `/run/user`, with the room the layer's command leaves (six arguments for each socket, 1,000 held back for the command, at most 2,000); a list that does not fit is refused, since the layer has no record to name a cut socket in; the HTTP port talks to the runtime over a pipe and to a started service over the host's loopback, so the layer's own Unix socket is the bridge's beneath `/tmp/tea-evaluate-p<uid>`; the bridge registers its socket's path, device and inode when it listens (`registerServedSocket`), and the list drops a socket only when all three match, so a host socket a layer process moved into the private root is another inode and stays hidden at the next start; a socket bound after the process started stays reachable under Bubblewrap, the layer's own sockets included; a Bubblewrap vector binds the private root read-only right after `--bind / /`, whatever the number of sockets it hides, and each of the run's own private parents (`run-<pid>-...`) writable again, so a layer process cannot write a record of the guard while its scratch directories and the bridge's directory stay writable and a `connect()` on the read-only mount needs no write, a half that the vector's text proves on every host and a layer process writing a record and failing proves in `the layer path socket route` on the ubuntu job; a macOS layer profile denies every `connect()` to a socket path and allows back the one shape `<root>/run-<name>/s-<name>/bridge.sock` beneath the private root, in each spelling of the root, and the two system services of Story 1.87, and it denies every write to the private root, to each entry directly in it and to any path of the shape `<root>/run-<name>/s-<name>`, which refuses a socket bound after the process started, the rename of a host directory that holds a socket (Docker Desktop's `~/.docker/run`, the directory `SSH_AUTH_SOCK` names) into the root, the rename of a whole tree of that shape to a run's name in the root (Seatbelt checks a rename against the renamed entry's own path, so review round 2 added the root and its entries) and the write of a record of the guard in the root, a layer process that serves a Unix socket of its own outside the bridge's directory having a loopback port as its route; the target profile of Story 1.87 allows only the workspace and the call's private directories, which a target cannot rename a host directory into since its profile denies every write outside them, so it had no such route; `the layer path socket route` serves a socket under the temp directory and connects to it and to `/var/run/docker.sock` and the system bus where the runtime's user can, finds each refused and finds each reached with the masks taken out, reaches the socket the runtime serves under the private root, finds a host socket moved there refused, and reaches one bound late, which only the ubuntu job runs; `the layer path socket units`, `the layer path socket guard`, `the layer path socket recovery`, `the Seatbelt layer socket units` and `the Seatbelt layer socket route` hold the rest)
**And** a mount that names a socket that went away leaves no file on the host once the layer process has ended, a case that vanishes a listed socket and reads the host directory afterwards (amended 2026-10-04 in Story 1.88's build and in its review rounds 1 to 3: Bubblewrap v0.9.0 runs `realpath` on every bind source before any mount, so a socket that went away before Bubblewrap starts stops the start and makes no file; `setup_newroot` then handles each bind in turn, reading the source's type, making the destination's parent directories (`mkdir_with_parents`) and the destination as an empty file with mode 0444 when it is gone (`ensure_file`), and mounting, and no Bubblewrap argument skips the destination's creation, so a socket its owner removes between the `realpath` pass and the mask's mount can leave an empty file and the directories above it at its path on the host for as long as the layer process runs; the file is no route to anything; the round 1 review found this from Bubblewrap's source, and the options that would close it inside Bubblewrap (a `mount(2)` helper with `CAP_SYS_ADMIN`, a compiled helper, a launcher) were rejected for the story's Never list, so the runtime removes what Bubblewrap made: each start records, right before it, the state of every hidden path and of every directory above one in a record written atomically beneath the user's private root, and `settle`, which every spawn site calls in a `finally` once its process has ended, removes a hidden path only when it was a socket or absent before the start and is now an empty regular file the runtime's user owns with no write bit and a change at or after the start stamped, and removes a recreated directory deepest first only when it is empty, and then deletes the record (a path is removed only when it was also born at or after the start, and one whose birth time reads 0 or is unavailable stays, since the removal rule trusts only what `lstat` reads at removal; `settle` never throws, so a layer process that replaces its own record with a directory leaves the record for the recovery and the spawn site returns what its process produced); a socket the owner made again, a file with content, a file with a write bit or another owner and a directory with an entry stay; a run killed before it could settle leaves its record, and the next run's preflight applies the same rule (`removePlaceholders`) for the dead run, a record of a live run being left, and a record of a dead run that another user owns, whose mode is not 0600, whose pid differs from the pid in its name or whose start is more than two seconds from the record file's own change time (a process cannot set that time back) being deleted with nothing applied; no signal of Bubblewrap fires after `setup_newroot` (`--info-fd` and `--json-status-fd` report the child's pid before it, `--block-fd` holds the child after it), so the guard acts when the process has ended; `the layer path socket guard` stages the race through a stand-in that follows Bubblewrap's order over the host's own file system on every host and reads the host directory after each spawn site, `the layer path socket recovery` kills a child process that launched through the stand-in with the race staged and recovers the dead run, and `the layer path socket route` runs the real Bubblewrap on the ubuntu job, where a vector whose socket went away stops the start with `Can't find source path` and no file and the mask with no bind of its own path leaves an empty file that `settle` removes; the vector holds no option that makes a file and no bind whose destination is a path its own bind does not stand on)
**And** the reference drops the sentence that says the layer keeps every socket, and a case reading `### File-system confinement` under its exact heading fails while it remains (amended 2026-10-04 in Story 1.88's build and in its review rounds 1 to 3: the sentences that replace it name the sockets the layer's processes cannot connect to, the socket the runtime serves and a host socket moved into the private root, the bind of the socket's own path and the start a gone socket stops, the file a socket removed while Bubblewrap mounts it can leave and the removal of it, the sockets that stay reachable and the room, the macOS profile with its write denial and a layer process's own Unix socket; `the network reference` holds each as a claim a case backs and fails while the old sentence or a claim is missing).

**Dependencies:** 1.82.
**Gate:** `test:evaluate-confinement`, `test:evaluate-agents`, `npm test`, and the Linux CI job.

### Story 1.89: Pass the target's exact environment through the socket launcher

Added 2026-10-03 in Story 1.82's build, review round 4. A call that hides sockets starts `/bin/sh -c 'exec 3<"$1" || exit 126; shift; exec "$@"'` as its launcher, so the shell stands between the runtime and the target, and `env` restores the seven variables the shell is known to rewrite (`PWD`, `OLDPWD`, `SHLVL`, `_`, `IFS`, `OPTIND`, `PPID`). The target's environment still depends on whether sockets are hidden for the names a shell treats specially: under dash a variable whose name is not a valid shell name (`BASH_FUNC_f%%`, `my.setting`) is dropped, and under bash as `/bin/sh` a held `PS1` is dropped, `PS2`, `PS4`, `LINENO`, `RANDOM`, `SHELLOPTS`, `BASHOPTS`, `BASH` and `BASH_VERSION` are rewritten and `BASH_FUNC_*` is re-serialized. Story 1.82 narrowed its claim and states the limit in the reference. The list of names does not end, so this story removes the shell: an exec helper replaces the shell launcher, or the call hands the exact environment to `confinement-status.cjs`.

As an adopter whose target reads its environment,
I want the target to receive exactly the environment the call gave it, whether or not the host holds sockets,
So that a hidden socket never changes what a confined process sees (AD-8).

**Acceptance Criteria:**

**Given** a call whose environment holds `BASH_FUNC_f%%`, `my.setting` and a held `PS1`, run once over a host with no socket and once over a host with a hidden socket, on dash as `sh` (Linux) and on bash as `sh` (macOS or a host that links `sh` to bash)
**When** the target prints its full environment
**Then** the two outputs are byte-identical on each shell; the shell launcher fails the case on both, which is the revert check
**And** the launcher is an exec helper that opens the arguments file as descriptor 3 and executes the command in its own place, or the call hands the exact environment to `confinement-status.cjs`, with no shell in the path and no native build, so `SHELL_VARIABLES` and the `env` restore are gone; restoring the shell launcher fails the byte-identity case above
**And** the audit still traces Bubblewrap alone, since the launcher stays outermost and before `strace`, and Story 1.62's byte-identity golden holds the new vector, a diff the story reads and states; a launcher moved inside `strace` fails the audit's trace case
**And** the reference's sentence that states the limit (a name no shell can hold, an exported shell function, the variables bash initializes) is replaced by the exact-environment sentence, and `the network reference` fails while the limit sentence remains; the limit check of `the path socket units` becomes the byte-identity check

**Dependencies:** 1.82.
**Gate:** `test:evaluate-confinement`, `test:evaluate-run`, `test:isolation-primitives`, `npm test`, and the Linux CI job.

(Amended 2026-10-06 in Story 1.89's build: the launcher is a Node program, `cli/lib/evaluate/confinement-launcher.cjs`, started with `process.execPath` outside the sandbox, ahead of `strace`, which stays as the command's parent where the criterion's exec helper would execute the command in its own place.
Node opens every file close-on-exec and has no call that clears the flag, so `process.execve` cannot hand Bubblewrap a descriptor 3, and the engine's own spawn owns the call's stdio, so the runtime cannot pass the file as an extra descriptor either.
The launcher therefore opens the arguments file, starts the command with that file as its descriptor 3 and the call's standard streams, stays as the command's parent, passes the signals it receives on (SIGTERM, SIGINT, SIGHUP, SIGQUIT, SIGUSR1 and SIGUSR2), ends by the signal that ended the command, SIGPIPE and SIGXFSZ included, which Node starts ignoring and the launcher returns to their default action, or by its exit code, and stays in the command's process group, which the engine's group kill reaches and Bubblewrap's `--die-with-parent` ties the sandbox to.
The call's environment reaches it in a file in the call's status directory (mode 600, removed by the launcher once read and by the runtime when the call ends), and the launcher starts with the loader variables the engine's watchdog carries and nothing else, since Node reads `NODE_OPTIONS` and its kin from its environment and could run a script of the call outside the sandbox, and its `process.env` cannot read a variable named by a decimal integer.
The second mechanism the criterion names, handing the exact environment to `confinement-status.cjs`, runs inside the sandbox after the shell has changed the environment, so it cannot restore what the shell dropped.
`SHELL_VARIABLES`, the `env` restore and the refusal of an executable path with `=` in it are gone.
The criterion's byte-identity check holds for the names of the story and for the variables bash and dash initialize, run through a stub Bubblewrap that is no shell, with Story 1.82's shell launcher, `env` restore included, as a control under dash and under bash as `sh` where the host has each.
The control passes a row the shell leaves alone and, on each shell, drops or rewrites the story's names (dash drops `my.setting` and `BASH_FUNC_f%%`, bash as `sh` drops `PS1` and re-serializes `BASH_FUNC_f%%`), and the launcher holds every name on each.
The launcher's refusal for the size of a command (exit 125 and its token) reaches the engine as the error Node's `spawn` gives the operating system's `E2BIG`, from which the engine's command-line adapter builds its own `launch-too-large` fault, the fault a call that hides no socket gets, and only from a call whose status file shows that Bubblewrap's shim never started, so a target that ran cannot forge it; the launcher keeps a host's `NODE_V8_COVERAGE` out of the command.
Bubblewrap sets `PWD` to the directory the call runs in for every call, with sockets hidden or none.
`confinement-status.cjs` starts the target with the environment recorded for its own process (`/proc/self/environ`), since Node's `process.env` cannot read a variable named by a decimal integer, which closes the one name the criterion's exact environment would otherwise lose inside the sandbox.
`the path socket units` hold the byte-identity check, `the socket launcher` runs the launcher and the audited order of launcher, `strace` and Bubblewrap on every host, `the path socket route` compares a hidden and an unhidden call through the real Bubblewrap in the ubuntu job, and Story 1.62's golden holds the new vector: Node, the launcher, the arguments file and the environment file in place of `/bin/sh`, `-c`, the shell text and the seven `-u` pairs.
The evaluation layer's processes never used the launcher, since Story 1.88 gave them relisting at each start, so their vectors stay byte for byte.)

### Story 1.130: Retry and verify the actionlint download so a GitHub outage cannot fail a shard

Added 2026-10-03 in Story 1.82's merge. Chain shard 1 of PR #321 failed before any test ran: the `Install actionlint` step in `.github/workflows/quality.yaml` runs the pinned download script, the script fetches the release tarball with `curl`, and during a GitHub 503 window the response was not a gzip file (`gzip: stdin: not in gzip format`). The step has no retry and no check of what it downloaded, so a GitHub blip fails a shard that has nothing to do with the change. `.github/workflows/publish.yaml` holds the same step. The owner counts CI flakiness as a defect.

As a maintainer merging a pull request,
I want the actionlint install to retry and to verify the tarball it downloaded,
So that a GitHub outage of a few minutes cannot fail a shard, and a corrupt download is named for what it is.

**Acceptance Criteria:**

**Given** the `Install actionlint` step in `quality.yaml` and the same step in `publish.yaml`
**When** the release download answers with a 5xx status, a truncated body or a body that is not a gzip tarball
**Then** the step retries the download (at least five attempts, with a growing wait between them, covering every transient error `curl` reports), and a body that is not a gzip tarball counts as a failed attempt; a step that retries nothing fails the case
**And** the step checks the tarball before it extracts it: `gzip -t` on the file and, where the release publishes one, its checksum against the release's checksum file, so a body that is an error page never reaches `tar`; a step that extracts without the check fails the case
**And** the step keeps the actionlint version floating to latest (the reason in the workflows' own comments stands) and keeps the pinned, hash-checked download script; the retry and the check wrap the script's download, not a pinned binary
**And** a final failure names the attempts made, the last HTTP status and that the body was no gzip file, in place of the bare `gzip: stdin: not in gzip format`; a step whose last error names none of these fails the case
**And** a static check reads both workflow files for the retry, the tarball check and the floating version, and fails when either file drops one; the check runs in `test:ci-coverage` or the workflow structure test the build finds, and in the Linux CI job

**Dependencies:** none.
**Gate:** `test:ci-coverage`, `actionlint` on both workflow files, `npm test`, and the Linux CI job.

Amended 2026-10-04 in Story 1.130's build: the retry and the checks live in one shared installer, `tools/install-actionlint.sh`, which the `Install actionlint` step of `quality.yaml` and of `publish.yaml` both call (`bash tools/install-actionlint.sh <directory>` with `timeout-minutes: 5`, then `sudo mv`), so the retry exists once and the integration case runs the shell the workflows run.
The installer fetches the commit-pinned download script with the same retry and checks its sha256, and runs it with a `curl` in front of `PATH` that passes every call to the real `curl` except the release tarball.
That call is downloaded with seven attempts and a wait of 2, 4, 8, 16, 32 and 64 seconds, which covers a GitHub outage of about two minutes and satisfies the criterion's at least five attempts (the waits of one run share a 126 second budget and a run stops retrying after 170 seconds, so the worst case of a run is about 274 seconds, inside the step's `timeout-minutes: 5`, and a hung network ends in a message before the timeout), checked with `gzip -t` and against the release's `actionlint_<version>_checksums.txt` (a 404 on that file skips the checksum check and nothing else), and written to the pinned script's `tar` only when it passed.
The version floats because the installer resolves the latest tag itself, from the redirect of `https://github.com/rhysd/actionlint/releases/latest` with the same retry, and passes it to the pinned script: the script's own `latest` keyword and its default both download the version hard-coded in it (1.7.12 at the pinned commit), so the criterion as first written, floating by way of the script, did not hold.
The static check reads both workflows for the call to the installer (a step that fetches or runs `download-actionlint.bash` itself fails it, and the step must set `timeout-minutes: 5`) and reads the installer for the attempt count (seven, and at least five), the growing wait, the wait budget, the production defaults of the wait base, the sleep command and the deadline, the `gzip -t` check, the checksum check, the version resolution with no version literal, and the 40-hex commit and 64-hex sha256 of the download script; it runs in `test:ci-coverage`, and `test:ci-coverage-filters` holds each part as a case built by mutating the real text.
The integration case is `test:install-actionlint`: the installer runs against a stub server on 127.0.0.1 on any host with bash, curl, gzip and tar (macOS runs it locally, the ubuntu CI job runs it in the chain), and the file is skipped with its reason named where one is missing.

### Story 1.131: Give a killed run's call directories to the recovery of its private parent

Added 2026-10-03 in Story 1.83's build. A run that ends by a signal it handles removes every directory on its scratch list, and the next run over the evaluation reclaims the private parent a run killed outright left (Story 1.54).
The directories a confined call hands its target are not beneath that parent: the call's temp directory (`tea-evaluate-target-tmp-*`), a started service's port directory (`tea-evaluate-port-*`) and its bridge directory (`tea-nb-*`) sit in the system's temp directory, since the sandbox empties the private root and a grant beneath it would be hidden.
A run killed by `SIGKILL` leaves each of them behind, and nothing reclaims them.
Story 1.83 gave the egress proxy's directory the way out: it sits beneath the private parent and is bound at a path under the synthetic `/dev`.

As an adopter whose CI kills a run that overran its budget,
I want the directories a call hands its target to be reclaimed with the dead run's private parent,
So that a killed run leaves nothing in the temp directory (AD-8).

**Acceptance Criteria:**

**Given** a Linux run over the verdict fixture whose target holds a call open, killed with `SIGKILL`, and a second run over the same evaluation
**When** the second run starts
**Then** the temp directory the first run used holds no `tea-evaluate-target-tmp-*`, `tea-evaluate-port-*` or `tea-nb-*` directory, and the second run's output names the reclaimed private parent; a call directory made in the system's temp directory again fails the case, which is the revert check
**And** the target still reaches each directory it is handed: its `TMPDIR` is writable, a started service's port file is written and read, and the bridge answers, which the confined pipeline of `test:evaluate-api` runs under Bubblewrap (a call directory bound at a path under the synthetic `/dev` and left out of the audit's observed mounts); binding a directory at a path the sandbox hides fails the pipeline, which is the second revert check
**And** Story 1.62's byte-identity golden holds the new vectors, a diff the story reads and states, and the reference states where each call directory lives and that a killed run's are reclaimed; a case reading `### File-system confinement` fails while the old sentence remains.

**Dependencies:** 1.54, 1.83.
**Gate:** `test:evaluate-confinement`, `test:evaluate-run`, `test:evaluate-api`, `test:isolation-primitives`, `npm test`, and the Linux CI job.

Amended 2026-10-06 in Story 1.131's build: the first criterion's case runs on every host.
`test:evaluate-api` starts `test/fixtures/evaluate/killed-call.cjs`, a run that makes its private parent as `preflight` does and a call through the layer's own code (`createApiPort`, the confined command mechanism, `makePrivateParent`), so the call's temp directory, a started service's port directory and its bridge directory exist beneath the parent, kills it with `SIGKILL` and runs the preflight of a second run over the same evaluation.
The temp directory holds no `tea-evaluate-target-tmp-*`, `tea-evaluate-port-*` or `tea-nb-*` directory before and after the second run, and the second run's output names the reclaimed private parent and each call directory.
A real `tea-evaluate preflight` killed while a started service's call is open holds the same case for the port directory.
The recovery stays what Story 1.54 built: no record of call directories exists, since the parent's journal record and marker already authorize the removal of everything beneath a verified parent, and the case plants links, a hard link, a closed directory and files shaped like the runtime's records in each call directory and forges the marker and the journal record, which leaves every directory and the canaries outside whole.
The second criterion's pipeline is the confined pipeline of `test:evaluate-api` on Linux, which now runs the new vectors, with two cases beside it: `the call directories, stood in` runs the real sandbox, mechanisms, status shim and HTTP port through a stand-in for Bubblewrap that applies each bind under `/dev` on every host, and `the call directory route` runs real Bubblewrap in the ubuntu job, where the target writes `TMPDIR`, writes a port file, answers through the bridge and cannot see the directories at their own paths, with a control that binds them at their own paths before the private root is emptied and finds them hidden.
Under Seatbelt the profile allows each call directory again beneath the denied root, as it allows the home, and `a confined target's temp directory` runs it for real.
The golden gains four entries (a Bubblewrap call, its environment, its audited form and a Seatbelt call, each with the directories beneath the private root) and changes none.

### Story 1.132: Pack the withheld history without writing into the adopter's repository

Added 2026-10-04 in Story 1.85's review round 1.
Story 1.57's `packInto` in `cli/lib/evaluate/workspace.js` runs `pack-objects --revs <store>/objects/pack/pack` inside the adopter's repository, and the `pack` job in `cli/lib/evaluate/git-lines.js` (Story 1.80's partial-clone path) does the same.
`pack-objects` writes its temporary pack into the adopter's own `.git/objects/pack` and renames it into the private store, which sits under `os.tmpdir()`.
A project and a temp directory on different filesystems are refused with `fatal: unable to rename temporary file ... Invalid cross-device link`, which is the default layout on Linux hosts where `/tmp` is tmpfs.
A failed run leaves `tmp_idx_*` and `tmp_rev_*` files in the adopter's `objects/pack`, and even a successful run writes there for a moment, which breaks the contract that a confined run writes nothing into the adopter's repository.
Reproduce in the container with the temp directory on tmpfs and the project under `/home/tester`: `docker run --init --rm --tmpfs /tmp --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined --cap-add SYS_ADMIN --cap-add SYS_PTRACE -u tester -e HOME=/home/tester -v <copy of the tree>:/work -v <worktree>/node_modules:/work/node_modules:ro -w /work tea-bwrap-strace node test/test-evaluate-run.js --group=confinement --only="across filesystems"` after applying the `test/test-evaluate-run.js` hunk of the saved patch, since the case does not exist in the tree (the command passes with zero checks while the case is missing).
The container run needs the owner's permission.
It was reproduced on macOS with `TMPDIR` on an attached HFS+ disk image: `error: unable to write file ...pack: Cross-device link`.
Story 1.85's review round 1 began the fix and moved it here: the unfinished work is saved as `/Users/murat/opensource/_wt/evaluate-relay/wip-pack-crossfs.patch` (it applies to `970e67b5`; the unit job in `checkWithheldHistoryUnits` that drives `mode: 'pack'` with the old `list` and `pack` keys is not updated in it).

As an adopter whose project and temp directory sit on different filesystems,
I want a confined run to build its private repository without writing into my repository,
So that the run works on a Linux host with a tmpfs `/tmp` and my `objects/pack` is only read (AD-7, AD-8).

**Acceptance Criteria:**

**Given** a project and a temp directory on different filesystems (a project under the home directory and a tmpfs `/tmp`), for a full repository and, where git honors `GIT_NO_LAZY_FETCH`, a partial clone
**When** a confined run builds the withheld repository
**Then** the build succeeds, the private repository holds the project's commits and a pack of its own, and the adopter's `objects/pack` holds no new file during or after the build, which a read-only `objects/pack` and a listing before and after prove; reverting to `pack-objects --revs <store>/...` inside the adopter's repository fails the case
**And** a build that fails at the pack step leaves nothing in the adopter's `objects/pack`, a case with a `git` shim that fails `pack-objects` or `index-pack`; the old path leaves `tmp_*` files there
**And** the packing runs `pack-objects --stdout` piped into `git --git-dir=<store> index-pack --stdin`, in the full-repository path and in the Story 1.80 partial-clone path (`rev-list --objects --missing=allow-any` into `pack-objects`), and keeps the 256 MiB buffer behavior and the stream reader of very large histories, so commit ids, digests and the isolation golden stay unchanged and no whole-walk buffer appears; a unit case drives the `pack` job through its stages with more revisions than one argument holds
**And** the Linux cases run in the ubuntu CI job and are skipped elsewhere with their reason named.

**Dependencies:** 1.57, 1.80.
**Gate:** `test:evaluate-confinement`, `test:evaluate-run`, `npm test`, and the Linux CI job.

Amended 2026-10-04 in Story 1.132's build: the build's cases are `the withheld git history across filesystems` (the Linux cases above, run in the container with the command in this story; a full repository, and a partial clone where git honors `GIT_NO_LAZY_FETCH`) and `the withheld git history pack stages` (every host: a `git` shim logs the commands and fails the pack stage or the index stage, over a writable `objects/pack`, with the real `pack-objects` run under a zero file-size limit in the pack arm so the old path's temporary file shows in the listing), both in `test/test-evaluate-run.js`'s `confinement` group, and the unit cases drive the `pack` job through its `stages` list with 20,000 revisions under a 48 MB heap.
The `pack` job's `list` and `pack` keys became one `stages` list of git argument lists (the first stage reads the revisions on its standard input, each stage's output feeds the next, the last prints nothing).
The reference's `### File-system confinement` gains the sentence that the build writes nothing into the project's object store, and its case reads it.
The case's `git` shims need a temp directory that can run files, so the container's tmpfs is mounted with `exec` for the shim cases (`--tmpfs /tmp:rw,exec,mode=1777`) and stays `--tmpfs /tmp` for the cross-filesystem case.
The build also fixed a defect the container showed: a git before 2.45 reports no ref format, and the link from a first workspace's objects to a second's was skipped for it, so a second workspace for the same commit packed the history again.

### Story 1.90: Verify the baseline manifest's file digests

Added 2026-10-01 in Story 2.1. `compare --accept` writes `baseline/baseline.json` with a `files` map of every baseline member's path to its `digestBytes`. Neither `compare` nor `tea-evaluate check` re-verifies those digests against the bytes in `baseline/`, so a hand-edited baseline file passes both while the manifest claims otherwise. Only Story 2.2's replay would eventually disagree, and only for the files it reads.

As an adopter reviewing a baseline pull request,
I want `check` and `compare` to refuse a baseline whose bytes differ from its manifest,
So that a baseline edited by hand cannot pass as the one that was accepted (AD-12).

**Acceptance Criteria:**

**Given** a baseline written by `compare --accept`
**When** a `baseline/` file is edited by one byte, a file the manifest's `files` map lists is missing, or a file other than `baseline.json` sits in `baseline/` with no entry in the map
**Then** `check` reports a `baseline-digest` finding and exits 10, naming each file whose `digestBytes` differs from the map, each map entry whose file is missing and each unlisted file; removing the comparison passes a file edited by one byte
**And** a plain `compare` refuses a baseline that fails the same check, with exit 10 and no verdict, before it reads the baseline's evidence; removing the check from `compare` lets the edited file's evidence reach a verdict
**And** a freshly accepted baseline passes both, a `test:evaluate-check` case and a `test:evaluate-compare` case that each accept a baseline and run the command over it, and fail while either command refuses it
**And** the reference's `check` rule list and its `compare` section document the `baseline-digest` rule, and a static test fails if the rule is removed from either.

**Dependencies:** 2.1.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, engine check.

### Story 1.91: Keep machine paths out of a committed baseline

Added 2026-10-01 in Story 2.1. `compare --accept` copies the run's files byte for byte, so every digest `run.json` recorded still matches. Several of those files carry the absolute paths of the machine that produced the run: `run.json`'s `adopterTree.repository` and workspace paths, the recorded argv and staging path in each `scores/<id>/<probeId>/score.json`, and the observations' recorded paths. A baseline committed to a public repository therefore publishes the maintainer's home directory and temporary directory names.

As a maintainer committing an accepted baseline,
I want the machine paths absent from what `compare --accept` writes, with every digest still holding,
So that a public baseline reveals no machine (AD-12).

**Acceptance Criteria:**

**Given** a run produced under an absolute project path and an absolute temporary directory
**When** the runtime records the files `compare --accept` later copies
**Then** it records neutral, run-relative or placeholder path forms in them; the build chooses between recording relative paths at the source and a documented neutral substitution at accept time that keeps each digest anchor valid, and records the choice and why, because rewriting a digest-anchored file moves its digest; restoring an absolute path makes the scan in the next criterion fail
**And** a `test:evaluate-compare` case runs an accept over a project under a distinctive absolute path and a distinctive temporary directory, then scans every file under `baseline/` byte for byte and asserts that none contains that path, the home directory or the temporary root
**And** the replay placement still works: a copy of the baseline at `runs/<acceptedRun>/` in a scratch folder scores to the accepted evidence bytes, a `test:evaluate-compare` case
**And** the fixture baselines committed by Stories 2.2 to 2.5 pass the same scan, which runs over every committed `baseline/` under `test/fixtures/` and `test/evaluations/`
**And** once the machine paths are gone from `score.json` and `aggregate-strength.json`, the `pr` replay's comparison set (Story 2.2 leaves those call records out because they hold private staging paths and the invocation id) also covers both files; a `test:evaluate-ci` case flips one byte of each and exits 13, and leaving either out of the comparison passes it.

Stories 2.2 to 2.5 commit fixture baselines before this story runs, so this story re-accepts them in its own pull request.

**Dependencies:** 2.1.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, engine check.

### Story 1.92: Stop `tea-evaluate ci` at once on a signal while an engine stage runs

Added 2026-10-01 in Story 2.2's review. `runEngineStage` (`engine-cli.js`) runs each eval-quality stage with `spawnSync`, so a SIGINT or SIGTERM that reaches `tea-evaluate ci` while the replay's `preflight` or `score`, `compile`, `seal` or the stale-baseline compile is running waits for the stage to end before the handler removes the scratch directory and the process dies. A stage that hangs holds `ci` and its scratch directory until something kills the stage. Story 2.2 made the gate child and the conformance run asynchronous and ends their process group on a signal; the engine stages, and the in-process `run`, `score` and `preflight` a live check drives, keep the synchronous call. A `ci` killed with SIGKILL also leaves a running gate in its own process group, since no portable parent-death signal exists; the reference states that limit.

As a pipeline owner whose job is cancelled,
I want a signal to end `ci`, the engine stage it runs and its scratch directory at once,
So that a cancelled run holds no runner and leaves nothing behind (AD-10, AD-12).

**Acceptance Criteria:**

**Given** a `ci` run whose replay's engine stage hangs (the `test:evaluate-ci` kill shim with `KILL_HOW=hang`, which the test does not kill)
**When** SIGINT or SIGTERM reaches `ci`
**Then** `ci` ends by that signal within a bounded time, the stage's process is gone and neither the temporary directory nor the user's private root (`run-<ci pid>-*`) holds an entry of the run; reverting `runEngineStage` to `spawnSync` leaves the stage running and fails the case on its timeout
**And** the same case over `compile` and `seal`, and over the stale-baseline compile that runs after the checks
**And** every stage exit still passes through verbatim: the case that compares each stage's exit and streams with the direct CLI run over the same inputs (`checkEngineStageExits`) passes unchanged, and the shim-log cases show the same argv
**And** `test:evaluate-boundaries` keeps `ci.js` reaching eval-quality only through `engine.js` and `runEngineStage`, with string stage names.

Amended 2026-10-06 in Story 1.92's build: the build made `runEngineStage` an asynchronous call for every caller, since a `ci` signal reaches the in-process `run`, `score` and `preflight` too, so none of them keeps a synchronous call (the replay's `score` and `aggregate-strength` through `runScoreCommand`, a live check's `run`, `score` and `preflight`, and the `check` check's compile through `checkEvaluation`). A stage is a detached child on one list in `engine-cli.js`. `cleanUpOnSignal` (`workspace.js`), which `ci`, `preflight` and `run` already registered, calls `stopEngineStages` before the command's own handler removes anything, because a stage that is writing its output recreates the directories a removal has just deleted. `score` (when it makes its own private parent) and `check` (the directory its compile works in, when no caller owns a list) register `cleanUpOnSignal` as well, and the `check` check of `ci` takes the invocation's scratch directory first, so the next `ci` over the folder reclaims it after a SIGKILL. Four cases hold it: `a signal while an engine stage runs` covers the `check` check's compile and the stale-baseline compile in two positions (after a plan that does not read the baseline, and inside `replay`) beside the stages the criteria name, over a stage that hangs; `a signal while an engine stage writes` covers the replay's `score` and `preflight`, a plan's `compile` and the `check` check's compile over a stage that keeps writing its output; `a signal to a command that runs a stage` holds `check`, `preflight`, `run` and `score` to the same end; and `a killed check check` holds the SIGKILL of a `ci` whose `check` check compiles. A spawn error names `spawn` where it named `spawnSync`.

**Dependencies:** 2.2.
**Gate:** `test:evaluate-ci`, `test:evaluate-boundaries`, `npm test`.

### Story 1.93: Prove the merge, scheduled and release rendering and the re-render of evaluation plans

Added 2026-10-01 in Story 2.3. The `evaluation-plan` case of the `ci` behavioral suite proves one slice of `step-03b-render-evaluation-plans.md`: a plan with checks on the `pr` tier, rendered on GitHub Actions in create mode. The step also renders the `merge`, `scheduled` and `release` tiers (the event each trigger maps to, the `merge` job running the `pr` commands first, the 30 and 120 minute timeouts, the event guard a new event puts on the jobs that existed before), replaces its own jobs by their id and marker on a second run, and renders edit mode through the assess and apply steps. No harness case reaches any of that: `test/eval-ci.js` stages create mode over one `pr`-only plan, and `test:evaluate-ci-render` parses the template block and the step references and runs no agent. Other platforms stay outside the suite on purpose, since the corpus rejects them (actionlint lints GitHub Actions alone).

As an adopter whose plan places checks beyond the pull request,
I want the CI skill's rendering of the other tiers, of a re-run and of edit mode proved,
So that an evaluation that runs on merge, on a schedule and on release is enforced there too (AD-11, AD-12).

**Acceptance Criteria:**

**Given** a fixture adopter under `test/fixtures/ci-eval/` whose plan places checks on `pr`, `merge` and `scheduled`, and whose request never names the plan
**When** a live `npm run eval:ci` through the local Claude Code CLI renders it in create mode, and the worker captures the workflow by hand into `test/replay/ci/` with `storedOutput` marked a real capture
**Then** the ground truth lists the triggers each tier maps to, a job per tier with its one `tea-evaluate ci` step, the `merge` job's `pr` step ahead of its own, the timeouts and the `if: always()` upload of each job's `runs/` under its own artifact name, and `test:eval-replay` holds the capture to the scorer
**And** the case's constructed deviations (a `merge` job without the `pr` step, one artifact name for two jobs, a `scheduled` job under the `pr` timeout) each miss exactly the element they remove
**And** the harness gains an edit-mode case over a pipeline that already carries a marker job and an unmarked job: the second run replaces the marker job, leaves the unmarked job byte for byte, and leaves the create-mode checkpoint untouched
**And** `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:eval-replay` and `test:eval-ci-data` hold the new sets, and the `ci` suite's `caseCount` and `fixtures` are updated

Amended 2026-10-04 in Story 1.93's build: the build made two fixture sets, `evaluation-tiers-granite-router` (create mode) and `evaluation-edit-ember-ledger` (edit mode), each held to every one of its elements. The tiers plan places checks on `pr`, `merge`, `scheduled` and `release`, so the title's `release` tier is proved too: its trigger maps to `release` of type `published`, and its job gets the 120 minute limit. The ground truth of the tiers set also lists the event each tier's job runs on (an `if` the scorer evaluates for each event the workflow names, `runsOn`, with `needs` read as well, since a job whose `needs` is skipped is skipped), because the step limits each evaluation job to the event that starts its tier. It lists the same limit on the test job (the request names pull requests and pushes for it), which is the step's guard on a job that existed before the workflow gained the push, release and schedule events. Each artifact element names its job and its artifact name (`<job id>-runs`), so one name for two jobs misses the element of the job that repeats it. The edit set stages the pipeline to edit (`mode: "edit"`, `editTarget`) and adds two element kinds: `preserved`, the digest of a job's source in the edited file, and `checkpoint`, the digest of the create run's checkpoint, which the stored case keeps beside the workflow and the harness reads from the workspace after the run. The edit set adds no event, since its hand-written job is held byte for byte. The stale marker job of the edit set carries an id the rules no longer give, and the live edit runs kept it, so section 4 of the render step now names the rename (the finding and its fix are in the story record). The edit job element counts the jobs that carry the marker and the jobs that run the tier's command, each equal to one, and the job element of every set refuses a job that runs a tier's step other than its own (the `pr` step ahead of the `merge` step excepted). Because the 28 requested elements became 63, the recall threshold moves from 0.9 to 0.96 so that it still admits two misses. The three constructed deviations the criteria name sit beside nine more (an unguarded `pr` job, an unguarded test job, swapped artifact names, a reformatted hand-written job, a rewritten checkpoint, a stale job kept beside the new one with its marker, without it or with its tier command replaced, a job id kept), a merge job that waits for the `pr` job with `needs` is scored in `test:evaluate-ci-render` because it would sign like the deviation without the `pr` step, and the stub agent answers the two new projects, so `test:probe-targets` runs five projects.

**Dependencies:** 2.3.
**Gate:** `test:evaluate-ci-render`, `test:eval-ci-data`, `test:eval-replay`, `test:contract-sources`, `test:probe-sources`, `npm test`; a live `eval:ci` run recorded in the story.

### Story 1.94: Score each stored workflow in the CI probe leg

Added 2026-10-01 in Story 2.3's review. `ciEvidence` in `test/lib/probe-scoring.js` builds the clean-control record of the `ci` contract's probes with every oracle disposition fixed at `held`, whatever workflow its leg reads, so a `CI_CORRECT_RUNS` row that points a project at a wrong stored workflow passes `test:probe-corpus`. The row exists for every project (Story 2.3 added the third), and nothing checks that the workflow behind it is the correct one the leg claims. The same shortcut stands in the other suites' evidence builders where a stored run is read.

As a maintainer who adds a project to the `ci` corpus,
I want the probe leg to read each stored workflow through the contract's own scorer,
So that a leg that points at the wrong workflow is caught where it is added (CAP-12).

**Acceptance Criteria:**

**Given** the `ci` probe leg and the stored correct workflow of each project
**When** `recordInputs` builds the clean-control record
**Then** each oracle's disposition comes from the scorer `ciOracleSpecs` pairs with that oracle, applied to the workflow the leg reads, and not from a constant
**And** a `CI_CORRECT_RUNS` row pointing at another project's workflow, or at a constructed deviation, makes `test:probe-corpus` fail with the oracle that no longer holds (amended 2026-10-03 in Story 1.94's review: for a constructed deviation only where the substring vocabulary can state it, which is 11 of the 34 stored constructed ci deviations; the other 23 pass through, because the contract reads the workflow as one string and one token, `burn-in`, is satisfied by a comment, and `test/probes/README.md` and Story 1.94's record list them; scoring each workflow with the harness's structural scorer is filed as Story 1.123)
**And** the committed `test/probes/expected-strength.json` is unchanged, and every stored correct workflow satisfies its oracles but two (amended 2026-10-03 in Story 1.94: the real capture of the evaluation-plan project quotes its folder names for the shell, so the substring oracles for `command-evaluation-install` and `command-evaluation-ci-pr` do not hold on it; the contract tokens live in `ground-truth.json`, whose digest the ci probes and the baseline's corpus digest record, so closing the defect moves the baseline and is filed as Story 1.122, and `KNOWN_UNHELD` in `test/test-probe-corpus.js` lists exactly those two until then)
**And** the same holds for each other suite's evidence builder that fixes `held` over a stored run, or the story records which ones read no stored run and why (amended 2026-10-03 in Story 1.94: the trace, nfr and test-design builders fixed `held` over a stored run and now score it through their paired scorers; the test-review builder measured its stored verdicts but held its verdict-payload and exit-code oracles constant, and now derives them from the stored verdict; fragment selection and routing read no stored run; `test:probe-corpus` fails a suite whose builder exposes no `storedRunSpecs` or `storedRunLegs`, holds every set and every oracle to a wrong stored run, a refused run on every leg and an unknown oracle identifier, lists the three ci `run-measured` oracles whose scorer reads no workflow as unfailable, and fails the two test-design projection-coherence oracles only through the `projectionOf` read that drops the `design` key)

**Dependencies:** 2.3.
**Gate:** `test:probe-corpus`, `test:probe-sources`, `test:contract-sources`, `npm test`.

Amended 2026-10-05 in Story 1.122's build: the two oracles hold on the real capture, so every stored correct workflow satisfies every oracle of its set and `KNOWN_UNHELD` is empty.
`test:probe-corpus` keeps the check that fails a listed oracle which holds and exercises it on every run.
Amended 2026-10-06 in Story 1.123's build: a deviation only a structure shows is caught as well.
`test:probe-corpus` scores each `CI_CORRECT_RUNS` workflow with the harness's `scoreRun` over its project's ground truth, and the burn-in job oracle reads only a key or a name line outside a comment, so a row pointed at a stored constructed ci case fails for 45 of the 48 (14 of them also violate an oracle of the contract, 31 fail the structural check alone) and the other three are correct spellings that the harness scores as correct.

### Story 1.95: Gate the replay totals, the story count and the lane lists

Added 2026-10-01 in Story 2.3's second review. Several totals that Story 2.3 and its review changed are hand-written and gated by nothing (the stored-output number once printed on the `npm run test:eval-replay` line of `README.md` and the adoption guide was a drift magnet, so Story 2.3's round 4 removed it): the replay corpus counts in `test/README.md` and the header of `test/test-eval-replay.js` (cases, cases that produce a number, constructed cases, captured cases), the story count in the overview of `epics.md` (its intro and the range of appended stories), and the stories listed in the five lane sequences of the same file against the `parallel_lanes` of `sprint-status.yaml` (the 2026-10-03 rebalance and the 2026-10-04 five-lane split moved stories between lanes, so all five lists must hold). The replay counts were stale at the base commit and a count was wrong again after Story 2.3's first push, and no check noticed either time.

As a maintainer who adds a replay case or a story,
I want a gate that holds those totals to the tree,
So that a count that drifts fails where it drifts (CAP-12).

**Acceptance Criteria:**

**Given** the replay corpus under `test/replay/`
**When** `test:eval-replay` (or a `doc-counts` entry) runs
**Then** the four totals in `test/README.md` and the `test/test-eval-replay.js` header equal the counts derived from the `expected.json` files, and adding a case without moving them fails
**And** the story count and the appended-story range in the `epics.md` overview equal the number of story sections the file holds, and every story in each of the five lane sequences (lanes 1 to 5) has a row in `sprint-status.yaml` `parallel_lanes` in the same order, with no story in two lanes
**And** each gate fails when its subject is changed by one (a count off by one, a lane entry removed from any of the five lanes, a story moved to another lane in one file only), observed once in a scratch copy and recorded
**And** the existing `test:doc-counts` entries keep their meaning and no new entry widens what an existing one reads

**Dependencies:** 2.3.
**Gate:** `test:eval-replay`, `test:doc-counts`, `npm test`.

Amended 2026-10-06 in Story 1.95's build: the gates are `doc-counts` entries of `eval-quality.config.json`, so `test:doc-counts` runs them and no existing entry reads anything new.
The replay counts come from `test/lib/doc-count-sources.js` (it gained the cases that produce a number, the constructed ones among them and the cases that carry captured bytes).
The story count, the epic count, the appended-story count and the lane count come from `test/lib/planning-doc-sources.js`, which refuses a plan whose two appended-story lists or whose lane lists in this file and in `sprint-status.yaml` disagree.
The header of `test/test-eval-replay.js` now states the totals it had left to the module, and `test/README.md` and this overview state their counts as digits where the gate renders words only up to ninety-nine.
`test:planning-doc-sources` observes each gate failing on data changed by one.

### Story 1.96: Check the derivable fields of a CI plan

Added 2026-10-01 in Story 2.4's build. The ci stage fills fields of `ci/evaluation-ci-plan.json` that follow from other fields, and nothing in `tea-evaluate check` holds them: a check's `trigger` (the schema accepts any non-empty set of the five events, so a `pr` check can name `schedule`), the `tiers` of `evaluation.json` (nothing under `cli/lib/evaluate/` reads it besides its schema, so it can disagree with the plan), a `<evaluation-folder>` placeholder left in a `command` from the plan template, a `preflight-live` entry whose `defaultTier` disagrees with the registry (the runtime accepts any of `merge`, `scheduled` and `release`, so a self-consistent but wrong default hides a deviation from the closing summary), a check placed with an empty or missing `reason` (the runtime asks for one only on a check moved off its default, so a plan that fills none passes), and a check the evaluation cannot run (an `api-conformance` entry with no HTTP target exits 64 only when `ci` runs it, and a contract that declares a rubric can omit `judge-calibration` from both live tiers unnoticed).

As an adopter who runs the ci stage,
I want `tea-evaluate check` to report these defects,
So that the runtime validates the plan the stage writes and the guide asks the model for judgment only (CAP-11).

**Acceptance Criteria:**

**Given** a plan whose check names a trigger its tier does not use
**When** `tea-evaluate check` or `tea-evaluate ci` reads it
**Then** a `ci-plan` finding of rule `trigger` exits 10, where `pr` allows `pull-request`, `merge` allows `merge`, `scheduled` allows `schedule` and `manual-dispatch`, and `release` allows `release` and `manual-dispatch`
**And** `evaluation.json` `tiers` that differ from the set of tiers the plan places a check on exit 10 with rule `tiers`
**And** a `command` or an `evidence` path holding `<evaluation-folder>` exits 10 with rule `placeholder`, while `<invocationId>` stays valid
**And** an `api-conformance` check over an evaluation with no HTTP target, and a contract that declares a rubric with no `judge-calibration` check on `scheduled` and on `release`, exit 10 with rule `applicability`
**And** a `preflight-live` entry on a target whose registry names no `environmentKeys` and is not a skill or agent runner that carries a `defaultTier` other than `merge`, or a target that needs a secret that carries `merge`, exits 10 with rule `placement-default`
**And** a check with no non-blank `reason` exits 10 with rule `placement-reason` whether it sits on its default tier or off it, so the template at `assets/evaluation-ci-plan.template.json`, which ships empty reasons, fails `check` until the stage fills them
**And** the committed plans keep passing, the template validates once `test:evaluate-guidance` fills its reasons, the guide's `## Write the plan` drops the manual `trigger` and `tiers` steps it then leaves to `check`, and each rule is a `test:evaluate-ci` case that fails when its rule is removed

Amended 2026-10-04 in Story 1.96's build: the rubric half of rule `applicability` reads the live tiers the plan uses.
A plan that places live checks on `release` alone (the tagged-release repository, which has no schedule) needs `judge-calibration` on `release` and none on `scheduled`, so the rule asks for it on each of `scheduled` and `release` that holds a live check and names the tier that lacks it.
A contract that declares a rubric is `contract.json` or the held-out plan declaring one, since the held-out view adds rubrics.
Rule `placement-default` reads "a target that needs a secret" as a registry that names `environmentKeys` (a command or server entry's `environmentKeys`, an HTTP entry's server keys and its `auth` key), a registry entry that launches `tea-skill-runner`, or a `targetKind` of `skill` or `agent`.
Rule `trigger` allows a subset of the tier's events, so a `scheduled` check naming `manual-dispatch` alone is valid.
The rules that read `evaluation.json` and `contract.json` are skipped when the file cannot be read, which `check` reports itself, so `planFindings(plan)` keeps validating a plan alone.
An `api-conformance` check over an evaluation with no HTTP target exits 10 from the plan, where `ci` exited 64 only when it ran the check.

**Dependencies:** 2.4.
**Gate:** `test:evaluate-ci`, `test:evaluate-check`, `test:evaluate-guidance`, `npm test`.

### Story 1.97: Gate an existing publish or deploy job on the evaluation job

Added 2026-10-01 in Story 2.4's first review. A `scheduled` or `release` evaluation job gates nothing unless the repository's own publish or deploy job waits for it, and `bmad-testarch-ci` may not change a job it did not write (step 03b changes only the event guards of section 3 item 7). The plan has no way to say that this job waits for that one, so a repository whose deploy runs nightly on its own cron (the `nightly-deploy` fixture) ends with an evaluation that reports and blocks nothing.

As an adopter whose release or deploy is a workflow of its own,
I want the evaluation job to gate it,
So that a blocking exit stops the shipment (CAP-11).

**Acceptance Criteria:**

**Given** a plan check that names an existing pipeline job the tier must gate (and tiers whose triggers resolve to one GitHub event, which step 03b tells apart with a ref or cron guard from Story 2.4's second review round, so the gate lands on the evaluation job of the right tier; a tier whose only event another tier took, such as a `release` tier on a deploy workflow that has `workflow_dispatch` alone beside a `scheduled` tier that takes it, is named in the summary as wired to no event of its own, and the field names the job without creating an event)
**When** `bmad-testarch-ci` renders the plan in edit or create mode
**Then** that job waits for the tier's evaluation job, through `needs` inside one workflow file or through a `workflow_run` trigger across files, and the story records which and why
**And** the plan schema and `ci-plan.js` define and validate the field, `tea-evaluate check` reports a name that is not a job id as a `ci-plan` finding, and the CI skill's step 03b may edit that one job, reports the edit in its summary and restores it on re-render
**And** a name that matches no job, or a job another plan's tier already gates in a way that conflicts, is reported and renders nothing for that plan
**And** `test:evaluate-ci` validates the field, `test:evaluate-ci-render` fails when the step drops the wait, and an `evaluation-plan` case of the `ci` behavioral suite captures a live rendering of it (`node tools/generate-contracts.js` and `generate-probes.js` regenerated)

Amended 2026-10-04 in Story 1.97's build: the plan field is an optional `gates` list on a check, the ids of existing pipeline jobs its tier must gate.
The schema owns the shape (a non-empty list of distinct strings, each a job id: `^[A-Za-z_][A-Za-z0-9_-]*$`), and a violation under `gates` is reported with rule `gates` in place of `schema`, so `tea-evaluate check` and `ci` exit 10 with the same single finding.
The jobs a tier gates are the union of `gates` over the checks the plan places on it, so a job is named once on any check of the tier and a repeat across the tier's checks is merged.
`references/ci.md` tells the ci stage to set `gates` when its release flow inspection finds a publish or deploy job the tier must gate, and to leave it out otherwise.
Step 03b renders the wait by where the gated job lives.
Inside the pipeline file the step writes, the evaluation job's id is appended to the job's `needs` with the existing entries kept, and the job's `if:` and every other key stay as they were: `needs` is the platform's own dependency edge inside one workflow run, and the evaluation job runs on the event the gated job already runs on.
In another workflow file `needs` cannot reach the evaluation job, since a job waits only for jobs of its own workflow run, so the gated workflow gains a `workflow_run` trigger naming the pipeline file, the gated job gains an `if:` that requires the conclusion `success` of a run of the pipeline file's path started by the tier's event, its checkout steps name the evaluated commit (a `workflow_run` job otherwise builds the default branch), and the workflow's other jobs get an event guard.
The edit set of the wait is the gated job's `needs` inside the pipeline file, and across files the job's `if:` and checkout `ref:`, the workflow's `workflow_run` trigger and the event guards of its other jobs.
A re-render writes the wait under the evaluation job id item 1 gives now and removes it when the plan no longer names the job, the trigger and guards only when no other wait in that file uses them.
A name matches a job when exactly one workflow file holds a job with that id, and a job the step wrote (one under the plan marker) is no job to gate.
A gate conflicts when the gated job already ran in a run where its tier's evaluation job is skipped (the events and filters its file held before the render against the events and ref or cron guards of the evaluation job, so a run the render adds is skipped through the wait and is no conflict), when its tier's evaluation job runs on a run it did not run on before (a `workflow_dispatch` the plan adds to a tag-push release file), when it already waits through the other form for another plan, or when its `if:` calls a status function other than `success()`.
A cross-file gate also conflicts for a pull request or fork tier, an evaluation job behind a ref or cron guard, a workflow that already follows another workflow, a job gated by two plans or tiers, and a job with its own `needs`, `if:`, `uses:` or `github.ref`, `github.sha`, `github.head_ref` or `github.event.*` contexts.
A name that matches no job or a conflicting gate refuses the plan: the summary reports it and nothing renders from that plan.
The "wired to no event" summary line stands, reworded to "of its own", because the gate adds no event: such a tier's evaluation job still runs on the event the other tier took, and a job it gates waits for it there.
The `evaluation-gate` adopter of the `ci` behavioral suite is an edit set whose pipeline holds a hand-written publish job that `needs` the test job and runs on a published release, and whose plan gates that job on its release tier; its ground truth reads the wait through a `wait` element (the exact `needs` list, the events the job still runs on and the digest of the job without its `needs` lines).
The live capture of that set is stored by the recapture after the build as `evaluation-gate-live-capture`, which replaces the constructed correct run the build began with, the two deviations derive from it by one edit each, and the recall threshold of the suite moves from 0.96 to 0.97 so that the larger corpus still admits two misses.

**Dependencies:** 2.3, 2.4.
**Gate:** `bmad-testarch-ci` edit gates, `npm test`.

### Story 1.98: The AI-feature evaluation passes its own CI tiers

Added 2026-10-01 in Story 2.4's first review. A reviewer scored and accepted a baseline for each fixture repository of Story 2.4 and ran its tiers. `ci --tier pr` exits 11 in both: `oracle-agreement` reads `disagrees` on P-006 O-004, P-012 O-004 and P-009 O-003 and O-004. `ci --tier merge` exits 0 and `ci --tier scheduled` of `nightly-deploy` exits 0 with two warnings. `ci --tier release` exits 2 in both repositories: `twin-run` fails the zero-action floor and `held-out` fails both the gameability floor and the zero-action floor, all with `no-eligible-probe`. The evaluation is the Story 1.24 AI-feature one, so the two repositories end red once an adopter follows the stage to its end.

Amended 2026-10-04 in Story 1.98's build: the three disagreements have two causes. P-006 (mutation M-002, minimum 8 to 80) and P-012 (M-006, every unrestricted answer rejected) also violate O-004, because the doubled strict threshold and the strict boundary answer fall with the normal one, so each probe declares a second defect for B-004 with its own manifestation witness. eval-quality marks a finding that the probe's one defect signature does not admit `unwitnessed-detection-claim` (Invalid, exit 3), so each signature is an `any` over the relations of its witnesses. P-009's degenerate answer differed from the correct server on the missing, nonstring and strict steps, so it violated O-003 and O-004 beside the B-001 oracle it games; it now answers like the correct server on every step except the restricted one. The zero-action floor goes: the contract holds four behaviors that each respond to a request, none a mandatory action whose absence a zero-action defect probe could expose, and eval-quality's strength vector leaves every `expectedClean` probe out, so P-001 to P-004 can never fill it. The held-out partition gains P-015, a gameability probe for B-004 (strict mode reported, the doubled minimum not applied), so the gameability floor stays. The pr tier and the local live tiers run in a new suite, `test/test-evaluate-ci-repositories.js`, split into seven chained scripts, one per adopter and tier (`test:evaluate-ci-repositories:tagged-release-pr`, `-merge` and `-release`, and `test:evaluate-ci-repositories:nightly-deploy-pr`, `-merge`, `-scheduled` and `-release`), chained after `test:evaluate-ci`: the live tiers take several minutes per repository, and the sharded chain places each script on a runner by its weight, where `test:evaluate-ci` already weighs 434 seconds. Each script runs one tier over a copy of its own, and `--only=<adopter>:<tier>` selects it; a selector that selects nothing fails. The capture records of both repositories declare the repair of `evaluation.json` as a Story 1.98 migration, which the guard in `test:evaluate-ci` reverses to the bytes the live session wrote. The starter `assets/evaluation.json` of the Evaluate skill declared a `zero-action` floor beside `defect`, and `references/corpus.md` never said that such a floor needs a `zero-action` defect probe (an `expectedClean` probe never counts) in each partition it is read on, or that a `gameability` floor needs a gameability probe in `heldOutProbes`, so an adopter who followed the starter ended at `ci --tier release` exit 2 with `no-eligible-probe`. The live capture records pin the digests of `SKILL.md`, `references/ci.md` and `assets/evaluation-ci-plan.template.json` only, so the starter now declares `defect` alone and `corpus.md` states both rules, through the builder's Edit process. The test-review evaluation of Story 1.24 gets the same repair: P-010 and P-012 each declare a second defect, P-013 three more, one for every behavior its mutation violates; its zero-action floor goes and P-015 is a held-out gameability probe. `test:evaluate-authoring` reads the violated oracles from the scored evidence, which holds every contract oracle, and holds both Story 1.24 replays to it.

Amended 2026-10-04 in Story 1.79's CI round 1: the suite as first merged ran its seven tier runs in one script, which took about 1137 CI seconds under coverage against a weight of 530, so chain shard 3 of 12 timed out at the job's 20 minutes on two pull requests. The split into seven scripts above, each weighted from its measured seconds in `tools/test-shard-weights.json` and each running exactly one tier of the adopter its name gives, lets the shard planner place them on different runners. `test:evaluate-ci-repositories` remains as the all-tiers command for a person and is not chained.

Amended 2026-10-04 in Story 1.98's review round 2: a floor class needs an eligible probe in the partition `baseline/` records (the twin run repeats it) and in `heldOutProbes`, or the evaluation declares no floor for it, so `corpus.md` says that, the Workflow kind's worked corpus holds out P-008 (a `defect` probe of B-002) beside its `zero-action` P-006, and `test:evaluate-guidance` holds each kind's worked partitions to the starter's `defect` floor. The behavior-set assertions of `test:evaluate-authoring` are two, a violated behavior the probe does not declare and a declared behavior the trial leaves held, with the corroboration assertion after them.

As an adopter who copies the AI-feature example,
I want its evaluation to pass the tiers its plan places,
So that the example ends green and a red tier means a regression (CAP-11, CAP-12).

**Acceptance Criteria:**

**Given** the AI-feature evaluation under `test/fixtures/evaluate-authoring/ai-feature/` and its copies in `test/fixtures/evaluate-ci-repos/`
**When** a clean copy-workspace run is scored and accepted with `compare --accept`
**Then** `tea-evaluate ci --tier pr` exits 0, the oracle disagreements above are repaired in the oracles or the probes they read, and the cause of each is recorded
**And** every probe class whose held-out or twin partition holds no eligible probe (the zero-action class of both partitions and the gameability class of the held-out one) either loses its floor where no eligible probe can exist or gains a probe that makes one eligible, so `twin-run` and `held-out` exit 0 on `release` and `scheduled` in both repositories and the `scheduled` warnings of `nightly-deploy` are gone
**And** the repositories commit their baselines, `test:evaluate-ci` runs the `pr` tier over each repository and the live tiers it can run locally and expects exit 0, and the Story 1.24 replay bundles and `test:evaluate-authoring` stay green or are re-recorded with the reason

**Dependencies:** 1.24, 2.4.
**Gate:** `test:evaluate-ci`, `test:evaluate-authoring`, `npm test`.

### Story 1.99: Prove mutation rollback for the test-review, trace, nfr and ci probe corpora

Added 2026-10-02 in Story 1.49's build. Story 1.49 qualifies each test-design controlled-mutation probe through a performed cycle in a disposable copy. `tools/generate-probes.js` still writes `rollbackVerified: true` as a constant for the eighteen other controlled-mutation probes (nine test-review plants, three trace, three nfr and three ci), each of which cites a stored baseline and a stored mutated output. The nine test-review probes name the seeded spec file of the plant (`test/fixtures/test-review-eval/seeded/`) as their `targetArtifact`, and its clean control is a different file; the trace, nfr and ci probes name their corpus's `ground-truth.json`. AD-8 rejects that pattern for every corpus, and the cycle Story 1.49 added (`test/lib/test-design-qualification.js` over `runMutationCycle`) was built around a design document that one exact edit turns into the stored seeded one. The other corpora's plants are not such edits (a registry row planted in a fixture tree, a coverage gap withheld from a summary, a report domain or workflow element), so each corpus needs its own statement of the mutation and the arm that scores it.

Amended 2026-10-03 in Story 1.99's build: the mutation of each corpus edits the stored correct output that the probe's oracle reads. A spec file can only be scored by a reviewer, which no deterministic arm is, so test-review withholds one row's finding from the stored review that reports every plant; trace withholds one coverage gap from the seeded set's correct summary; nfr withholds one domain's finding from the gapped bundle's correct audit; ci edits the correct pipeline into a stored twin that differs by the one named edit. The arm is the probe's own contract oracle, resolved by eval-quality over the artifact the workspace holds, and each probe's `targetArtifact`, `mutationSource` and both evidence references name the artifacts its cycle worked on. Withholding trace's AC-8 or AC-10 leaves the gate at FAIL, and withholding nfr's maintainability concern leaves the overall status at FAIL, so the two lower-band trace probes and the nfr maintainability probe name the oracle that sees their mutation (the priority breakdown, the section headings); the AC-2 probe names the gate oracle. Every probe verdict and exit code stays as recorded.

Amended 2026-10-03 in Story 1.99's review round 1: every stored twin is its reference with the one named edit and nothing else, and the suites hold it there. The twins live under `test/fixtures/probe-mutants/` (the nfr performance and maintainability twins and the three ci twins joined the nine test-review, three trace and one nfr twins), and the suites read the twins the builder's emitted probes cite, list the lines or JSON paths that differ, and assert that exactly the intended oracles flip between reference and twin, each from held to violated. The derived `replace-exact` operator may not span the whole reference, since any two files differ by that edit. The trace AC-2 twin carries the gate its P0 band derives (PASS, the P0 criteria met, the recommendation that named AC-2 removed), so it does not contradict itself and its probe names the gate oracle again; the AC-8 and AC-10 twins carry the inventory and the gate criteria that read it. The nfr maintainability witness reads the section's first criterion at CONCERNS, since the overall status it read holds on the reference and on the twin alike. The cycle's direction differs between the corpora: for the test-review, trace and nfr probes the plant is in the system's input, so the manifestation witness fires on the correct run the clean arm scores and is silent on the mutated artifact, which models a run that misses the plant (pre-flight needs it to fire on the correct run its fault leg replays); the ci probes' witnesses fire on the mutated pipeline (review round 2 amends this: by the witness's wording alone, see below). The suites resolve each committed probe's witness over both stored artifacts and hold each corpus to its direction. A workspace and its private parent are checked outside the checkout and gone whatever depth the corpus's artifact sits at, `git status` includes ignored files, and `test:evaluate-boundaries` derives the files it scans for a `rollbackVerified` value that is not an identifier, a member expression or `false`. Every probe verdict and exit code stays as recorded; `expected-strength.json` moved in corpus digests and behavior ids only.

Amended 2026-10-03 in Story 1.99's review round 2: the three ci probes' witnesses read the element the run gets wrong (the weekly schedule and the `contents: read` grant a run misses, the burn-in job a run adds), so they fire on the mutated pipeline. Their plant is the request in the project's docs, as for the other fifteen, so the ci direction is the reverse of theirs by the witness's wording alone, and that wording is why the ci pre-flight records `failed: seeded-fault-fired, seeded-faults-scoped` for all three, as it did before Story 1.99 and without any document saying so. Fixing it moves those outcomes, which the story's acceptance criteria keep, so it is filed as Story 1.121 and the witnesses are unchanged here; the kit labels the direction `gap-read` and holds each probe to what its witness resolves to. A twin keeps its reference's bytes outside the named edit: the test-review twins carry the reference's own `$comment` and ledger fields and are the reference with that row's finding lines removed, and the ci template twin is the reference, a blank line, the `burn-in` job heading and lines indented below it, with no other top-level key or job. The cycle hands every arm the workspace file alone, the test-design arm included, so no text can reach a phase from outside the workspace. The checkout's status leaves out `_bmad/` beside `node_modules/`, `.claude/` and `.DS_Store`, since agent sessions write ignored render directories there while a suite runs, and a case over a scratch repository holds the guard to reading other ignored paths. The rule that scans for a `rollbackVerified` value reads the generator's whole relative-require closure beside the files that require the cycle, reads class fields and aliases, and accepts `??` and `?:` over handed-over values. Every probe verdict and exit code stays as recorded; `expected-strength.json` moves in four corpus digests and three behavior ids against its state before the story.

Amended 2026-10-04 in Story 1.121's build: the three ci probes' witnesses read the request in the workflow the run wrote, so the ci direction is `plant-reported`, as for the other fifteen, and the `gap-read` label is gone from the kit.
P-001 and P-002 are a containment of `0 2 * * 0` and of `contents: read` with no `not`.
P-003 is an `all` of a containment of `npm test` and a `not` over a containment of `burn-in`: the positive operand keeps the witness silent on the alternate-platform leg, which writes no workflow and over which a `not` of a containment is true, so the flipped containment of `burn-in` alone still fails `seeded-faults-scoped`, and a bare containment of `burn-in` fires on the full project's run.
The ci pre-flight of all three passes from the leg cache with verdict null and exit 3 unchanged, and `expected-strength.json` moves in the three ci pre-flight records (their `basis` no longer names a failed pre-flight) and the ci corpus digest.
`test:ci-qualification` also resolves each ci witness over an absent workflow, and P-003's over the full project's correct pipeline, which pre-flight drops for P-001 and P-002 because their fault leg sends the `witness-github-actions` request; so those shapes are held without a leg cache.

As a maintainer of the TeA probe corpora,
I want each of those probes qualified in a disposable copy with a verified restore,
So that no corpus claims rollback from two stored files (CAP-7, AD-8).

**Acceptance Criteria:**

**Given** the controlled-mutation probes of the test-review, trace, nfr and ci corpora
**When** the qualification is performed for each probe
**Then** a disposable copy of the probe's target runs the clean arm, applies one exact mutation, runs the mutated arm, restores the original bytes, verifies the artifact digest and reruns the clean arm, through `runMutationCycle`; only that sequence sets `rollbackVerified: true`, and the repository's `git status` is unchanged
**And** a failed restore, mismatched digest, missing baseline pass or missing mutated failure emits no probe with a true rollback claim in any corpus; fixtures exercise each failure per corpus and reverting a guard makes them fail
**And** `tools/generate-probes.js` holds no `rollbackVerified: true` literal, the regenerated probes, corpus checks, replay and every staged preflight keep their expected outcomes, and `npm test` passes.

**Dependencies:** 1.49.
**Gate:** `test:test-design-qualification` and the new per-corpus suites, `test:probe-sources`, `test:probe-corpus`, `npm test`.

### Story 1.100: Report whole-body coverage for the routing, test-review and trace contracts

Added 2026-10-02 in Story 1.48's build. Story 1.48 closed the `whole-body` rule for test-design by adding one oracle per plan step that names every required response key in its direction and its check, because eval-quality reads the rule as designed: for every operation declaring more than one required response key, one oracle addresses all of them at one step. The strength baseline still lists `whole-body` for four more contracts. `tea-routing-intents` and `tea-routing-controls` declare `action` and `reason` for `route-intent` and each oracle reads one of them. `test-review` declares twenty-three required keys for its verdict artifact and `trace` twenty-two for its summary, and the oracles of each read a few. The same repair applies, with a different cost per contract: two keys are cheap to read together, and a twenty-three key declaration needs an oracle that reads every key it declares, after the declaration is corrected to the keys the runner or workflow always emits.

Amended 2026-10-03 in Story 1.100's build: all four contracts report the rule, and none narrows its declaration, because the runner or workflow always emits each required key (the routing parser returns all seven keys of every answer, `assertDeclaredKeys` refuses a verdict without an `always` key and step-05 assigns the 22 summary keys in one literal). The README records that evidence for each contract. One oracle per plan step reads every key: for test-review and trace a `shape` over the object and one `existence` per required key, and for routing a `shape`, a `set-membership` of `action` and a non-blank `reason`. The variant whose direction names a key its check does not read is refused at compile as `direction-check-misaligned` (AD-3) and never reaches the rule, so the variants scored through the engine are the oracle removed, one key, every key but one in both channels, a direction that omits one key, and the one-key oracle widened to existence checks of every key. The two routing contracts also stop listing `success-indicator-separation`, since the new oracle reads the success indicator beside a payload key. No probe file moves.

As a maintainer interpreting TeA's contract strength,
I want each of those contracts to declare a key as required only when the runner or workflow always emits it, and to read every required key in one oracle,
So that `whole-body` is satisfied by evidence the oracles examine.

**Acceptance Criteria:**

**Given** the routing, test-review and trace contracts and their baseline
**When** eval-quality scores each contract and reports its coverage
**Then** `whole-body` is satisfied for each by an oracle whose direction and check both name every required key of the operation at one step and whose check can fail for a real defect; a contract narrows its required-key declaration only for a key the runner or workflow does not always emit, shown from that output, with each choice and its reason recorded in `test/contracts/README.md`
**And** each contract carries fixtures scored through the published engine as Story 1.48's do: the contract as shipped (satisfied), the contract without the repair (unsatisfied) and variants whose oracle drops one key in each channel (unsatisfied), so reverting the repair makes the pair agree
**And** the regenerated strength baseline retains every probe verdict and exit code for these suites, `node tools/generate-contracts.js --check` and `node tools/generate-probes.js --check` pass, and `npm test` passes.

**Dependencies:** 1.48, 1.99. 1.48 sets the oracle pattern and its fixtures; 1.99 regenerates the test-review and trace corpora this story also regenerates.
**Gate:** `node tools/generate-contracts.js --check`, `node tools/generate-probes.js --check`, `test:contract-oracles`, `test:probe-corpus`, `npm test`, suite-only staged preflight for each suite.

### Story 1.101: Name a stale stamp on every artifact `score` reads

Added 2026-10-02 in Story 1.42's build. eval-quality 5.0.0 reads the stamp of each sealed run record and of the eval contract before it parses either (eval-quality #173), so a stale one is a named `schema-version-mismatch` with exit 5. `score` still parses the isolation manifest, the evaluator configuration, the scoring policy, the preflight verdict and the private manifest without comparing their stamps, so a stale artifact parses when its shape happens to fit or fails as an anonymous `schema-parse-failure`. TeA's own `score` reports the stamp of every artifact it validates before any engine call (`records.js`), so a TeA run names a stale one already; the gap is a direct `eval-quality score` call, which is how the CI baseline replay, the replay tests and any adopter harness reach the engine. The story decides where to close it: the engine owns the comparison, so it goes through lane 3's release path, and TeA keeps its own reads unchanged.

As an adopter or a CI replay calling `eval-quality score` directly,
I want every versioned artifact `score` reads to be compared with the version the build reads before it is parsed,
So that a stale artifact is named and never scored under a shape it no longer has (CAP-9, AD-5, AD-11).

**Acceptance Criteria:**

**Given** an isolation manifest, an evaluator configuration, a scoring policy, a preflight verdict or a private manifest stamped for another version
**When** `eval-quality score` reads it
**Then** the call fails with `schema-version-mismatch` naming the artifact path, the stamp and the version this build reads, exit 5, before the artifact's shape is read; an artifact stamped with the current version scores as before
**And** each artifact has a fixture whose shape parses under the current schema while its stamp is stale, and reverting the comparison for one artifact makes that fixture score
**And** the engine's changelog and `docs/reference/cli-commands.md` count the added readers, an engine release carries it, and TeA's peer floor, lockfile and `ARCHITECTURE-SPINE.md` AD-5 record move to it in the same pull request that adopts it.

**Dependencies:** 1.42.
**Gate:** the engine's `npm run validate`, `npm view eval-quality version`, then `npm test`, `npm run test:release-metadata` and the engine check in TeA.

### Story 1.102: Refuse a duplicate interface identifier at compile

Added 2026-10-02 in Story 1.42's build. An interface's `logicalId` is now part of an operation's identity: eval-quality 5.0.0 names an operation by the pair of its interface and its operation ID, and every lookup keys on it. `compile` does not check that `permittedInterfaces[].logicalId` is unique, so two interfaces sharing an identifier merge their operations into one pair namespace, and a contract that declares the same operation ID on each reports a duplicate pair that `seal` faults on as a misleading `schema-parse-failure`. The refusal needs an AD-5 code, so it is an engine change through lane 3's release path.

As an adopter authoring a contract with several interfaces,
I want `compile` to refuse two interfaces with one identifier and name them,
So that an operation pair means one operation and no later stage reports a different failure for the same mistake (CAP-4, AD-5).

**Acceptance Criteria:**

**Given** a contract whose `permittedInterfaces` repeat one `logicalId`
**When** `eval-quality compile` and `seal` read it
**Then** `compile` exits with a new AD-5 code naming the repeated identifier and both interface positions, and `seal` is never reached for it; a contract with distinct identifiers compiles as before
**And** the AD-5 registry, its spine table and the generated registry check list the code, and a fixture that repeats an identifier while declaring one operation ID on each interface fails `compile` with it and no longer with `schema-parse-failure`
**And** the engine release that carries it moves TeA's peer floor, lockfile and AD-5 record in the pull request that adopts it, and `check` surfaces the same refusal for an evaluation folder.

**Dependencies:** 1.42.
**Gate:** the engine's `npm run validate` and `check:ad5-registry`, `npm view eval-quality version`, then `npm test`, `npm run test:release-metadata` and the engine check in TeA.

### Story 1.103: Prove the Story 1.42 review fixes against their mutants

Added 2026-10-02 in Story 1.42's merge. The Story 1.42 review round (adversarial and mutation lens, 53 mutants, 15 survivors) produced tests and a guard fix for the survivors, and the weekly usage limit ended the work before the mutation check that proves each new test fails on its mutant could run. The tests pass and the suites are green, but no mutation run has shown that each one kills the mutant it was written for.

As a maintainer of the Evaluate runtime,
I want each test added for a surviving mutant shown to fail on that mutant,
So that the two-interface attribution of Story 1.42 stays protected at every lookup site (AD-23).

**Acceptance Criteria:**

**Given** the review round's list of surviving mutants in `story-1.42.md` (the phase snapshot and unclassified-observation findings in `score.js`, the `degenerateAnswer` and `armPortFor` lookups in `sealed-brief-agent.js`, the calibration observation and step ceiling in `run.js`, `calibration.js` and `arm.js`, and the option-set and gameability lookups in `check.js`)
**When** each mutant is applied in a disposable copy and the suites that read it run
**Then** every one fails a named test, and a mutant that still survives gets a test that fails on it in the same pull request
**And** the Story 2.4 capture-record guard fails when a `migrations` entry names a digest (`from` or `to`), when a `wrote` digest is retyped, when the entry is absent and when `evaluation.json` changes by anything but the declared migration (amended 2026-10-03 in Story 1.103: Story 1.42's review removed `from` and `to` from the entry because the rebuilt bytes are the only authority, so the criterion names a digest the entry must not carry where it first named a false `from`)
**And** a lookup site that no test can reach from a compiled contract is recorded in the story record as unreachable with the engine rule that makes it so.

**Dependencies:** 1.42.
**Gate:** `npm run test:evaluate-check`, `test:evaluate-interpret`, `test:evaluate-arms`, `test:evaluate-agents`, `test:evaluate-mcp`, `test:evaluate-run`, `test:evaluate-records`, `test:evaluate-calibration`, `test:evaluate-ci`, `test:evaluate-compare`, `test:evaluate-mutation` and `test:test-design-qualification` (the shared scratch helper their private-parent cases use), then `npm test`.

### Story 1.104: Count only behavior-linked oracles for success separation

Added 2026-10-03 from Story 1.55's independent review. The engine's `success-indicator-separation` rule scans all contract oracles. An oracle that no behavior references can therefore satisfy the rule without supplying evidence for a behavior. Both the scalar CLI and structured-response branches share this gap.

As an adopter evaluating a contract,
I want success and answer checks counted only when a behavior uses their oracle,
So that an orphan check cannot hide a missing success-separation requirement.

**Acceptance Criteria:**

**Given** a scalar CLI contract with an exact exit-code and whole-stdout oracle that no behavior references
**When** `eval-quality compile` and coverage evaluation run
**Then** coverage reports `success-indicator-separation` unsatisfied; linking the oracle to the behavior satisfies it, and removing the behavior-link check makes the negative fixture fail
**And** the equivalent structured-response fixture rejects an unlinked success/payload oracle and accepts the linked oracle, while the existing valid scalar and structured cases remain satisfied
**And** the published engine release is adopted by TeA with its peer floor and lockfile updated; the pantry fixture retains PASS because its oracle is behavior-linked
**And** a TeA test scores a scalar contract whose exit-code and whole-stdout oracle no behavior lists and sees the gap, then sees it close once a behavior lists the oracle, and another scores the routing contracts the same way over their structured responses.

Amended 2026-10-04 in the Story 1.104 build: the engine shipped the change as 7.1.0, a minor release, because it tightens a coverage rule (the plan said patch). The AC names the release instead of the bump, and adds the TeA test line, since the engine's own fixtures cannot show that TeA surfaces the gap. The three accepted fixture baselines are re-recorded on 7.1.0, as for every engine release.

**Dependencies:** 1.55.
**Gate:** engine `npm run validate`, `npm view eval-quality version`, then TeA `npm run test:evaluate-learned-framework`, `npm run test:release-metadata` and `npm test`.

### Story 1.105: Partition rubrics in a partition plan

Added 2026-10-03 from Story 1.51's build. Story 1.51 refused a `partitionPlan` beside a rubric or waiver that reads a development-only step, because a rubric criterion's evidence pointer disappears with its step in the held-out view. Story 1.105 replaces the rubric half of that refusal with the derivation below; the waiver half stays until Story 1.106.

As an adopter whose behavior needs a judged criterion on a held-out request,
I want a rubric criterion to belong to one partition,
So that a held-out run compiles, calibrates and scores its own criteria without the development ones, and the development view carries no held-out criterion.

**Acceptance Criteria:**

**Given** a rubric criterion whose evidence reads a held-out-only step and one that reads a development-only step
**When** preflight and run execute each partition
**Then** each view holds only the criteria its partition's steps can reach, `check` names a criterion that no view can reach, and calibration items are judged in the partition that owns their criterion
**And** removing the held-out view's partition filter fails the pure view case, and a held-out run over a view that keeps a development criterion stops at the engine's compile (`rubric-evidence-unreachable`, exit 4) before the run-level isolation scan, which is a second line; the development view is `contract.json`'s own bytes and never reads the plan, so it holds no held-out criterion.

**Dependencies:** 1.51, 1.9.
**Gate:** `npm run test:evaluate-partition-plans`, `npm run test:evaluate-calibration`, `npm test`.

### Story 1.106: Partition waivers in a partition plan

Added 2026-10-03 from Story 1.51's build. Story 1.51 refuses a waiver that reads a development-only step. eval-quality's `Waiver` holds `id`, `rule`, `rationale`, `condition`, `approval` and `expiresAt`: it names a discipline rule and no oracle or behavior, and its `condition` is the one field that reads a step. A waiver therefore belongs to the partition whose steps its `condition` reads (amended 2026-10-04 in Story 1.106: the story text said a waiver names the oracle it excuses, which the contract does not carry).

As an adopter who waives a known gap on a held-out request,
I want a waiver to belong to the partition whose steps its condition reads,
So that the engine compiles each view without a waiver that reads the other partition's step.

**Acceptance Criteria:**

**Given** a waiver whose condition reads a development-only step, one whose condition reads a shared step or no step, and one in the held-out plan
**When** the development, held-out and both views are derived
**Then** each view carries only the waivers its steps can reach, a view never names the other partition's step through a waiver, and `check` names a waiver that no view can reach by its waiver ID
**And** a view that kept the other partition's waiver fails the isolation fixture.

**Dependencies:** 1.51, 1.105.
**Gate:** `npm run test:evaluate-partition-plans`, `npm test`.

### Story 1.107: Partition evaluator mappings in a partition plan

Added 2026-10-03 from Story 1.51's build. Story 1.51 requires the deterministic evaluator. A `command`, `sealed-brief-agent` or `records` evaluator binds oracles and behaviors through `evaluator/mapping.json`, which names IDs the held-out view drops. Amended 2026-10-04 in Story 1.107: a command evaluator receives `{ sealedBrief, observations }` and never the mapping, a `records` evaluator reads no mapping and each observation of its records names the plan step it records in its ID (`<label>-<stepId>`, as in `trial-<n>-<stepId>`), and an import refusal exits 10, so the criteria below name what each artifact carries and the exit the code gives. Held-out rows live in the held-out plan's `mappings`, because `evaluator/mapping.json` is read by the development partition and a held-out ID in it would reach every development run.

As an adopter whose evaluator is an adopter command or an agent,
I want the evaluator mapping and the evaluator's sealed brief to follow the partition view,
So that a development run never hands the evaluator a held-out oracle, request or mapping row.

**Acceptance Criteria:**

**Given** an `evaluator/mapping.json` with rows for a development-only and a shared oracle and criterion, and a held-out plan whose `mappings` hold the rows of a held-out oracle and criterion
**When** each partition runs under a command evaluator
**Then** each run's evaluator layer holds only its view's rows (the keys its answers are validated against and converted by, the keys a sealed-brief agent is shown, and the tree digest it records), the evaluator's recorded stdin and the run directory hold no ID or key of the other partition, and `check` names a plan row by its place in `mappings` and a `mapping.json` row that binds what `contract.json` lacks by its key and IDs
**And** under a `partitionPlan`, a `records` evaluator's sealed records are refused (exit 10, nothing copied) when they carry an oracle, a behavior, a rubric criterion, a step or a citation the view does not hold, named by where it sits in the record: an observation is admitted only when its ID is `<run label>-<a step the view declares>` or `<run label>-call-<n>`, a citation only when the record holds the observation it names, and `check` refuses a step named `call-<n>` under a plan
**And** removing the mapping filter fails the pure view case and the held-out run at the evaluator layer, a held-out row in `evaluator/mapping.json` stops a development `check`, `preflight` and `run` with exit 10, no launch and a finding that says the row belongs in the plan's `mappings`, and a `records` import that accepts a foreign oracle, behavior, criterion or step reaches `score` and fails its case.

**Dependencies:** 1.51, 1.20.
**Gate:** `npm run test:evaluate-partition-plans`, `npm run test:evaluate-evaluators`, `npm test`.

### Story 1.108: Compile and seal each partition view in `ci`

Added 2026-10-03 from Story 1.51's build. Story 1.51's `ci` compile and seal checks run over `contract.json`, the development view. An engine compile or seal defect in the held-out plan surfaces only at a held-out or both preflight, where a pull request does not run it. `check` compiles nothing, because `test:evaluate-boundaries` forbids an in-process compile under `cli/`.

As an adopter who protects pull requests with the `pr` tier,
I want `ci` to compile and seal every view a baseline or run uses,
So that a held-out plan that cannot compile fails the pull request that wrote it.

**Acceptance Criteria:**

**Given** a held-out plan whose oracle the engine refuses at compile
**When** `tea-evaluate ci --tier pr` runs
**Then** the `compile` and `seal` checks run once for each view (development, held-out and both), name the view whose compile the engine refused with the engine's exit and its evidence, and write `eval-contract.json` and the sealed brief under the check's evidence path for each view that compiles; a view that fails to compile is never sealed
**And** a plan with no `partitionPlan` compiles once, as today, with no new evidence path.
**And** compiling only `contract.json` passes the broken plan and fails the case, and a second evidence path for a plan with no `partitionPlan` changes the committed replay and fails the replay case.

**Dependencies:** 1.51, 2.2.
**Gate:** `npm run test:evaluate-ci`, `npm run test:evaluate-partition-plans`, `npm test`.

### Story 1.109: Partition gameability degenerate responses

Added 2026-10-03 from Story 1.51's build. Story 1.51 refuses a gameability probe under a `partitionPlan`. The degenerate response answers every plan step with its step ID, so it cannot name a held-out step in a development file and still keep the held-out ID out of development artifacts. Amended 2026-10-04 in Story 1.109: `corpus/gameability/<probeId>.json` already holds one answer per plan step of `contract.json`, so the story adds the one file kind the held-out steps need, `corpus/held-out/gameability/<probeId>.json`, sealed beside the held-out plan. A development `check` never opens the plan, so it cannot name a held-out step; the check that names a missing held-out answer by step ID is a `check` that opens the plan (`tea-evaluate check`, and a held-out or both `preflight` and `run`).

As an adopter with a gameability probe on a rubric-governed behavior,
I want the degenerate response to answer only the steps of the partition that runs the probe,
So that a gameability probe works under a partition plan without leaking a held-out step ID.

**Acceptance Criteria:**

**Given** a gameability probe in each partition and a held-out plan step
**When** each partition and the both view run the gameability arm
**Then** the arm answers the steps of its view and no other (the steps of `contract.json` from `corpus/gameability/<probeId>.json` in the development and both views, and the held-out plan's steps from `corpus/held-out/gameability/<probeId>.json` in the held-out and both views), a development run never opens the held-out answers, and no development file, run artifact, `check` output or `preflight` output of a development run holds a held-out step ID
**And** `check` names a missing answer by probe and step ID, a held-out step by its ID only when the ID has the schema's shape, never quotes the sealed file, and no longer refuses a gameability probe beside a `partitionPlan`.
**And** an arm that answers the whole plan puts a held-out step ID in a development artifact and fails the isolation case, a development run that opens or refuses anything under `corpus/held-out/`, or lists it in its corpus-index comparison, fails the cases that leave the answers unparsable, absent, linked, a FIFO or unopenable (a development run opens no held-out file, and its tree reading lists the directory and takes `lstat` metadata alone), a held-out or both run or `check` that does not refuse such a path with exit 10 and no stack fails the same cases, and a missing answer that passes `check` fails its case.

**Dependencies:** 1.51, 1.14.
**Gate:** `npm run test:evaluate-partition-plans`, `npm run test:evaluate-arms`, `npm test`.

### Story 1.110: Designate one oracle per behavior in the both view

Added 2026-10-03 from Story 1.51's build. eval-quality designates an oracle for a probe only when its behavior names exactly one. The held-out view keeps that rule, and the both view gives a behavior its development oracle and its held-out oracle, so the probes of such a behavior are scored without a designated oracle (`caught: false`) in a run with no `--partition`. Story 1.51 documents the limit and scores each partition apart.

As an adopter who runs everything with no `--partition`, or a baseline of `both` replayed by `ci`,
I want the both view to give each behavior one oracle per probe,
So that a both run scores the probes of a behavior that has a development and a held-out oracle.

**Acceptance Criteria:**

**Given** a behavior with a development oracle and a held-out oracle, one probe in each partition
**When** the evaluation runs with no `--partition`
**Then** each probe is scored against the oracle of its own partition and is caught
**And** a both baseline accepted by `compare --accept` replays through `ci --tier pr` with both probes caught, and the held-out and development partitions keep their own scores unchanged.
**And** a behavior with two oracles that scores `caught: false` for both probes fails the case, and a replay that reads the both view as stale or uncaught fails the replay case.

**Dependencies:** 1.51.
**Gate:** `npm run test:evaluate-partition-plans`, `npm run test:evaluate-ci`, `npm test`.

### Story 1.111: Guide Stage 6 preflight by partition and refuse an unpartitioned plan preflight

Added 2026-10-03 from Story 1.51's round 1 and round 2 reviews. `SKILL.md` Stage 6 still prescribes `tea-evaluate preflight --evaluation <folder>` with no `--partition`. Under a `partitionPlan` that command derives the both view and launches the held-out request during authoring. Story 1.51 carries the correction in `references/adapters.md` and `references/run.md` because `SKILL.md` is a `sessionRead` key of the committed live capture records (`test/test-evaluate-ci.js` pins its digest), so editing it needs both live sessions rerun. The CLI also accepts the flagless command, so a worker that follows `SKILL.md` alone runs it.

As an adopter whose evaluation declares a `partitionPlan`,
I want Stage 6 to name the development partition for its preflight and the CLI to refuse a preflight that names none,
So that no authoring step launches or records a held-out request.

**Acceptance Criteria:**

**Given** `SKILL.md` Stage 6 and a folder that declares a `partitionPlan`
**When** the stage is edited through `bmad-workflow-builder` and both live capture sessions are rerun as Story 1.84 does
**Then** Stage 6 adds `--partition development` to its `preflight` command with the clause that held-out preflight runs only after the development review, `checkGuidance` holds the sentence as a marker, and every `capture-record.json` pins the new digest of `SKILL.md` and `test:evaluate-ci` is green; keeping the old records beside the edited `SKILL.md` fails it with the changed-since-read message
**And** `tea-evaluate preflight` under a declared `partitionPlan` with no `--partition` exits 64 and names the flag, or the story records in `story-1.111.md` why the both-view preflight is required and keeps the command; a folder with no `partitionPlan` preflights with no flag as before and keeps every committed replay byte
**And** deleting the Stage 6 clause fails `test:evaluate-guidance`, and removing the refusal lets the flagless command launch the held-out request and fails the case that scans the run directory for the held-out step ID.
**And** the change goes through `bmad-workflow-builder` with a clean Analyze gate (AD-16, AD-18).

(The `SKILL.md` edit shares its live recapture with Story 1.84, so it runs after the skill-guide stories in other lanes and one rerun covers both edits; Story 1.46 left `SKILL.md` untouched and runs no capture. Lane 3 owns the story because the refusal is a CLI change beside Story 1.51's `preflight --partition`.)

**Dependencies:** 1.51, 1.84.
**Gate:** builder Analyze, `npm run test:evaluate-guidance`, `npm run test:evaluate-partition-plans`, `npm run test:evaluate-ci`, `npm test`.

Amended 2026-10-05 in Story 1.111's build: the story takes the refusal branch of the second criterion, so `tea-evaluate preflight` under a declared `partitionPlan` with no `--partition` exits 64 and the "or the story records why" branch is closed.
The guide edit alone left the CLI accepting the command that launches the held-out request, and a CLI that cannot launch a held-out request during authoring holds where a guide sentence only advises.
The refusal belongs to the `preflight` command line: the CI `preflight-live` check calls the same library function for a CI run, which is no authoring step, and keeps the both view; `run` and `score` keep their flagless meaning.
`--partition both` is not a value the CLI offers and none is added.
`adapters.md` and `run.md` carry the same sentence as `SKILL.md`, and neither is a `sessionRead` key of a capture record.
The paragraph about Lane 3 and the shared recapture with Story 1.84 is superseded: Story 1.84 merged first, so the recapture of this story is its own.

### Story 1.112: Keep other sessions' commits from failing a run's adopter-tree check

Added 2026-10-03 from Story 1.46's live runs. `adopterTreeState` (`cli/lib/evaluate/workspace.js`) digests every ref of the repository and its common git directory, so a commit, fetch or branch in any other worktree of the same repository while a `preflight` or `run` is in flight changes the digest and the run exits 12 ("changed during the qualification") with no qualified probe written. The three relay lanes share one repository; Story 1.46's first live preflight failed this way after twelve minutes with no file edited, and the story ran its live legs from a standalone clone to avoid it. A confined target works in a private repository and cannot reach the shared refs, so the comparison guards nothing there; an opted-out target can write them, which is what the comparison is for.

As a maintainer who runs an evaluation from one worktree while other sessions commit to the repository,
I want a confined run to compare the working tree and the checkout's HEAD and to read no git directory,
So that a long live run is not stopped by work in another worktree.

**Acceptance Criteria:**

**Given** a confined run (Seatbelt or Bubblewrap) of a slow fixture target, with the test creating a ref in the repository's shared git directory while the run is in flight
**When** the run finishes
**Then** it exits 0 and `run.json` records `adopterTree.unchanged: true`, and the rest is still compared: a confined run exits 12 when a tracked file is edited while the run is in flight, an untracked file is created or an edit is committed in the project's own checkout (its `HEAD` moves)
**And** a confined run exits 0 when a ref, the configuration, branch tracking or an in-progress operation changes in any other checkout of the same repository (the main checkout when the run reads a linked worktree; a `git push -u`, a `git worktree add -b <branch> <remote-tracking ref>`, a conflicting rebase stopped in the main checkout of a project that is a linked worktree), and a layer process's write to the git directory is refused by the layer
**And** an opted-out run (`"confinement": false`) keeps the comparison of refs and shared state: a target that runs `git update-ref` or writes `.git/config` exits 12, and `docs/reference/tea-evaluate-cli.md` tells a maintainer who shares a repository with other sessions to run an opted-out evaluation from a standalone clone
**And** restoring the shared-state comparison for a confined run makes the in-flight ref case exit 12 again, and removing it for an opted-out run lets the `git update-ref` target pass and fails the second case.

Amended 2026-10-04 in Story 1.112's build: the case is `checkSharedStateAcrossSessions` (`test:evaluate-confinement`) and its stub acts are `hold-gate`, `update-ref` and `write-config`.
The in-flight ref is a branch and a commit made in a second worktree of the repository while the first clean trial is held, and the case runs on the host's own mechanism, so the macOS run uses Seatbelt and the ubuntu CI job uses Bubblewrap; no case is skipped on either host.
A confined target that runs `git update-ref` or `git config --local` leaves the project's refs and configuration as they were, and the run exits 0; the case asserts the target ran each command and reads no outcome of it, since git refuses the write on macOS (exit 128 and 255) and the exit on Linux is CI's.
The reference sentence is read by `checkWorkspaceReference` under `## The workspace`.
Both `preflight` and `run` read the project through the one `readTree` of the shared pipeline, and the case holds a confined `preflight` (its mutated arm) in flight as well as a `run`.

Amended 2026-10-04 in Story 1.112's review round 1: the first build compared the working tree alone for a confined run.
The evaluation layer (the adopter's command evaluator, the HTTP probe port, the judge, the sealed-brief agent) ran under the layer prefix, `(allow default)` on Seatbelt and `--bind / /` on Bubblewrap with the evaluation folder read-only, so it could write the project's `.git/config`, `hooks/` and refs, and a planted pre-commit hook runs the next time the adopter commits.
The layer prefix now also denies a write under the project's common git directory: the Seatbelt layer profile adds a `(deny file-write* (subpath <common git directory>))` beside the evaluation folder's, and the Bubblewrap layer vector adds `--ro-bind <common git directory> <common git directory>` after `--bind / /`.
`selectConfinement` resolves the directory with `git rev-parse --git-common-dir` from `launch.root` (a linked worktree resolves to the main repository's directory) and a project in no git repository adds nothing.
A confined run also compares the checkout's own `HEAD`, which is per worktree, so another worktree's commit cannot move it and an edit committed in the project's own checkout does, which `git status` alone missed.
A confined evaluator that runs `git update-ref`, appends to `.git/config` or writes a hook is refused; a confined target's `git update-ref` and `git config --local` leave the project's refs and configuration as they were.
Story 1.62's byte-identity golden covers the target profile and the layer vectors of a confinement with no git directory, which are unchanged.

Amended 2026-10-04 in Story 1.112's review round 2: round 1 also digested the common git directory without its refs for a confined run, and that digest stopped runs on ordinary work in another worktree.
`git push -u` and `git worktree add -b <branch> <remote-tracking ref>` write `branch.<branch>.*` into the shared `config`, and a rebase, cherry-pick, merge or `merge --squash` in the main checkout leaves `rebase-merge/`, `REBASE_HEAD`, `AUTO_MERGE`, `CHERRY_PICK_HEAD`, `MERGE_*`, `SQUASH_MSG`, `sequencer/`, `REVERT_HEAD`, `BISECT_*`, `TAG_EDITMSG`, `gc.pid` or `shallow` in the common directory.
Every process of a confined run is denied a write to that directory (the target by its profile, the evaluation layer by the layer denial), so the denial is the guard and a digest of the directory could fire on other sessions only.
A confined run therefore reads `git status`, the content of the paths it names and the checkout's own `HEAD`, and digests no git directory; an opted-out run keeps the full comparison, refs and shared state included.
A `core.hooksPath` that names a directory outside the common git directory (this repository's is `.husky/_`) puts hooks where the layer denial did not reach, so `selectConfinement` also resolves `git rev-parse --git-path hooks` from `launch.root`, and when that directory exists outside the common git directory the layer is denied a write there too (a Seatbelt deny rule, a Bubblewrap `--ro-bind`); an opted-out run digests it.
`selectConfinement` takes `root` as a required argument, since a call without it names no repository to protect.
The cases add a confined evaluator that is refused a write into the `core.hooksPath` directory, the same refusals with the evaluation folder outside the project's repository (`launch.root` pointing into one), an opted-out target (stub act `write-hook`) that writes there and exits 12, a `push -u` and a `worktree add -b` from a remote-tracking ref in a second worktree, and a conflicting rebase stopped in the main checkout of a project that is a linked worktree.

Amended 2026-10-04 in Story 1.112's review round 3: two paths still reached the checkout's git commands.
When `launch.root` is a linked worktree (the relay's lane layout) or a submodule, the checkout's `.git` is a file at `<top>/.git`, outside the common git directory, so the layer denial did not cover it and the confined reading did not record which git directory the checkout resolves to.
A layer process could copy the repository, plant `core.fsmonitor` and a hook in the copy, and point the gitfile (and the `commondir` file of the worktree metadata) into it, with HEAD, index and objects reading the same, so the confined reading stayed byte-identical while the runtime's own unconfined `git status` ran the planted command and the adopter's next commit ran the hook.
`selectConfinement` now resolves the checkout's top (`git rev-parse --show-toplevel`, real path) and, when `<top>/.git` is a file, carries it as `gitFile`; the layer is denied a write to it (a Seatbelt `(literal ...)` rule beside the subpath denies, a Bubblewrap `--ro-bind` of the file), with the same profile-safe path check and refusal wording.
The worktree's own metadata directory (`<common>/worktrees/<name>`) and a submodule's (`<super>/.git/modules/<name>`, which `--git-common-dir` returns) lie inside the common git directory the denial covers.
The confined reading records the git directory the checkout resolves to (`git rev-parse --absolute-git-dir`, real path) and the gitfile's content, so a redirect moves it and ends the run with exit 12 even when a write path was missed; the reading's `git status` runs with `core.fsmonitor` switched off.
A `core.hooksPath` that names a directory that does not exist yet (husky's `.husky/_` before `npm install`, an absolute shared path never created) resolved to no directory, so neither layer vector protected it.
It now resolves to the real path of its nearest existing ancestor plus the components below it: Seatbelt denies that path, Bubblewrap cannot bind an absent path and the run creates no directory in the adopter's tree, so both modes record whether the resolved hooks path exists and a hooks directory created during the run ends it with exit 12.
A hooks path inside the common git directory, or an unset one, stays out of the reading.
The cases add a gitfile redirected to an identical copy that moves a confined reading (`checkAdopterTreeModes`), a confined evaluator whose write to the gitfile of a linked-worktree project is refused (and lands, stopping the run, when opted out), the Seatbelt profile text and the Bubblewrap argument list carrying the gitfile (`checkLayerGitDirectoryUnits`), an absent relative and an absent absolute `core.hooksPath` in the profile text, the argument list and the reading, and a confined evaluator that creates the absent hooks directory and writes a hook (refused on Seatbelt; on any host the run exits 12 or the write is refused).

**Dependencies:** 1.31.
**Gate:** `npm run test:evaluate-confinement`, `npm run test:evaluate-preflight`, `npm run test:evaluate-run`, `npm run docs:validate-links`, `npm test`.

### Story 1.113: Run a subscription-authenticated agent target confined

Added 2026-10-03 from Story 1.46's live preflight. A confined target's `HOME` is a private, empty directory (Story 1.59), so the Claude Code CLI finds no login and a confined `tea-skill-runner --agent claude` call exits 4 (transport) on every request. The CLI reference tells such an operator to pass an API key variable, which the relay's rule for live runs forbids. Story 1.46's evaluation of Evaluate's own skill therefore declares `"confinement": false`, its runs record `opt-out`, and its requirements name the reason.

As an adopter evaluating a skill through the Claude Code CLI on a subscription,
I want a confined agent target to authenticate with that login without receiving the rest of my home,
So that live runs keep file-system confinement.

**Acceptance Criteria:**

**Given** the `claude` adapter and a registry entry for `tea-skill-runner` that declares `"login": "claude"`
**When** `preflight` and `run` confine the target on a host whose login is the file `.credentials.json` (in `CLAUDE_CONFIG_DIR`, or in `.claude` under the real home) or the variable `CLAUDE_CODE_OAUTH_TOKEN`
**Then** the target's calls authenticate and exit 0, `run.json` records `seatbelt` or `bubblewrap` and the grant under `logins` (the variable by name and the file by path), the isolation manifest names the file read-only in `allowedMounts` and both sources in its forbidden-input note, and no recorded file holds the token's value or a string of eight characters or more from the file, an echo of either included
**And** the file grant is read-only and names exactly the file the adapter reads (a link in the private home), so a target that reads a second file under the real home, in the configuration directory or beside it, lists it in `observedMounts` and `score` exits 3; the variable is the one credential variable that passes, so `ANTHROPIC_API_KEY` and the rest of the host's environment stay withheld
**And** a login held in the macOS Keychain has no grant, and the story records in `story-1.113.md` why (no Seatbelt rule scopes the keychain below the whole keychain, and the CLI finds it through the `HOME` a confined target holds privately): a confined run on a host with neither the file nor the variable exits 12 before any target starts, naming the entry, the file it looked for, the token route (`claude setup-token`, then `CLAUDE_CODE_OAUTH_TOKEN`) and the opt-out, and the CLI reference documents both under `#### A subscription login under confinement` and drops its API key advice
**And** the dogfood evaluation keeps `"confinement": false` and the sentence of its `requirements.md` that names the reason, since its owner's host holds the login in the Keychain and the story proves the file and the token routes against stub CLIs alone
**And** removing the declaration makes the claude call exit 4 under confinement, widening the grant to the whole home fails the second-file case, writing the token's value or a string of the file into a record fails the content sweep, and deleting the documented token route or opt-out fails the doc assertion, held by `test:evaluate-confinement` (the run and the audit) and `test:evaluate-preflight` (the real runner and adapter).

Amended 2026-10-04 in Story 1.113's build: the story's two branches (a grant, or a recorded reason and the opt-out) both hold, one per login source.
The three sources are those Claude Code documents (the macOS Keychain item `Claude Code-credentials`, the file `~/.claude/.credentials.json` under `CLAUDE_CONFIG_DIR` when set on Linux and Windows, the variable a `claude setup-token` token arrives in), and the owner delegated the design without a probe of any credential location, so each path is proved against a stub CLI under the confined run's own audit.
The declaration is the registry entry's `login` field (`evaluation.schema.json`, `"claude"` the one adapter).
The live confined preflight of the dogfood evaluation leaves the gate, since the build starts no real CLI, and the evaluation keeps its opt-out because its owner's host holds the login in the Keychain.

Amended 2026-10-04 in Story 1.113's review round 1: the login's strings are scrubbed from every request kind (a command, a tool server, an HTTP server), since the private home with the linked file is shared by every target the sandbox starts.
The set holds the host's value of each granted login's variable and each string of the file except the values under the fields the adapter declares public (`scopes`, `subscriptionType`, `rateLimitTier`), which stay as written because they are no secret and a scrub that rewrote them would change an answer's own words.
A field the adapter does not name is scrubbed.

Amended 2026-10-04 in Story 1.113's review round 2: the scrub set is the union of every string the credentials file has held during the run, read again when each call settles, since the host's own Claude Code can rotate the file while a call runs.
A read caught mid-write (not valid JSON) contributes its whole text, each whitespace-separated token and each quoted string.
A run that opted out scrubs the host's credentials file as well, since its target reads the file through its own `HOME`; `run.json` still records no file for it and no link is made.
The token route's statements in the reference are pinned as whole sentences, one assertion each.

Amended 2026-10-04 in Story 1.113's review round 3: a read caught mid-write leaves out the values under the fields the adapter declares public, so a torn read does not rewrite `user:inference`, `user:profile` or a rate-limit tier in an answer.
A quoted value belongs to the nearest key before it, and an element of an array belongs to the key before its `[`, so a first read that is torn is covered as well.

**Dependencies:** 1.59, 1.46.
**Gate:** `npm run test:evaluate-confinement`, `npm run test:evaluate-preflight`, `npm run test:evaluate-agents`, `npm run docs:validate-links`, `npm test`.

### Story 1.114: Carve the corpus guide into one guide per target kind

Added 2026-10-03 from Story 1.46's Analyze run. `references/corpus.md` is 13,986 tokens against the builder's 9,000-token guide budget because six target-kind sections (agent, skill, workflow, tool-use system, AI feature, test-review mechanism) ship in one file, and every lens states that carving them is the one fix. The finding is the one high that Story 1.51's Analyze run found in the same file and left as present on `main`.

As an agent running Stage 3,
I want to load the craft shared by every kind and only the section of the kind I classified,
So that the stage reads what it needs and the guide stays inside its budget.

**Acceptance Criteria:**

**Given** `references/corpus.md` and the six target-kind sections it holds
**When** the guide is carved through `bmad-workflow-builder` Edit so that `corpus.md` keeps the shared craft (sections, held-out, partition plans, refusals) and names one `references/corpus-<kind>.md` per kind
**Then** each file is within 9,000 tokens, every tagged example in every file still validates through the engine or runtime schema it meets, `test:evaluate-guidance` asserts each named section by exact heading in its new file, and no reference elsewhere in the skill names a heading that moved
**And** `SKILL.md` is untouched (it is a `sessionRead` key of the live capture records), since `corpus.md` names its per-kind guides itself
**And** moving one kind's section back into `corpus.md`, deleting a per-kind file or breaking one tagged example fails `test:evaluate-guidance`, and the builder's Analyze run reports no high finding for `corpus.md`.

Amended 2026-10-06 in Story 1.114's build: each per-kind guide starts with `# <Kind> corpus`, an intro sentence, the worked interface and a pointer to `corpus.md`, and holds its four sections at the second level (`## Representative inputs`, `## Negative and malformed inputs`, `## Gameability design`, `## Held-out probe selection`). `corpus.md` gains `## Per-kind guides`, which names the six files and says to load only the one for the kind recorded as `targetKind` at inspection. The test counts tokens with tiktoken's `cl100k_base`, the encoding the builder's `count_tokens.py` reports, through `js-tiktoken`, which `package.json` lists as a devDependency at `latest`. The shared file is 4,276 tokens, so one kind returned to it stays under the budget and fails the kind-heading assertion; the budget assertion fails when the kinds return together.

**Dependencies:** 1.51, 1.111.
**Gate:** builder Analyze, `npm run test:evaluate-guidance`, `npm test`.

### Story 1.115: Give the skill a command that prints a file's digest

Added 2026-10-03 from Story 1.46's Analyze run and authoring session. Stage 2 (`references/intake.md`), Stage 4 (`SKILL.md` and `references/contract.md`) and `assets/README.md` tell the model to stamp `sourceSpecDigest` and `requirements.digest` with eval-quality's `digestBytes` over the confirmed `requirements.md` bytes. Stage 4's guide gives no command, and Stage 2's gives a one-off inline `node --input-type=module -e` script that `digest --file` replaces; the model otherwise computes a SHA-256 by hand or with its own script, as Story 1.16's maintainer session and Story 1.46's did, and a wrong value is found only when `check` refuses the folder. The Analyze determinism lens names this as its one high.

As an agent stamping a digest,
I want one command to print the digest of a file's bytes,
So that no stage computes a digest in its own words.

**Acceptance Criteria:**

**Given** a file in an evaluation folder
**When** `tea-evaluate digest --evaluation <folder> --file <path>` runs
**Then** it prints `digestBytes` over that file's bytes (`sha256:` and 64 hex digits) and writes nothing, exits 0, and exits 64 for a path outside the folder, a link or a directory
**And** the guides that say to stamp a digest (`references/intake.md`, replacing its inline script, `references/contract.md` and `assets/README.md`) name the command there, through `bmad-workflow-builder` Edit, and `test:evaluate-guidance` holds the sentence in each; `SKILL.md` is untouched, since it is a `sessionRead` key of the live capture records
**And** changing one byte of the file changes the printed digest, a path outside the folder exits 64, and removing the option fails the CLI case.

(Amended 2026-10-04 in Story 1.115's build: `--file` names a path relative to the evaluation folder, and an absolute path, a `..` segment, a symbolic link at any component, a directory, a missing file and anything that is not a regular file each exit 64 with one line on stderr, as does `--file` together with `--calibration-inputs`. `references/intake.md` also tells the model to put `assets/evaluation.json` in the folder first, since the command locates the folder through its `evaluation.json`. The cases are `checkDigestFile` in `test/test-evaluate-check.js` (`test:evaluate-check`) and `checkDigestFileGuidance` in `test/test-evaluate-guidance.js` (`test:evaluate-guidance`).)

**Dependencies:** 1.12.
**Gate:** builder Analyze, `npm run test:evaluate-check`, `npm run test:evaluate-guidance`, `npm run docs:validate-links`, `npm test`.

### Story 1.116: Hold each exit's class against its AD-10 row in the dogfood contract

Added 2026-10-03 from CodeRabbit's review of Story 1.46 (PR #319). O-003 reconciles the `/exits` records against the reference set by id and tests each record's class against the table's class vocabulary, so a complete reply that swaps the classes of `tea-evaluate 11` and `tea-evaluate 12` passes O-003: both ids are covered and both classes belong to the vocabulary. O-001 reads those two exits in its own step, so the swap is caught there, and a mutation that swaps two rows moves O-001 and O-003 together, which `seeded-faults-scoped` refuses. Story 1.46 left O-003 as it is: a reference set holds one key, so `covers-by-key` and `set-membership` cannot pair an id with its class, and a change to `contract.json` invalidates the clean live run recorded for that story.

As a TEA maintainer,
I want the completeness oracle to compare each exit's class with the table's row,
So that a complete listing with a swapped class fails B-003 on its own.

**Acceptance Criteria:**

**Given** the dogfood contract's `list-exit-table` step and a reference set that can carry each exit's class beside its id
**When** the story authors the check through the engine kinds that express a per-key expected class (a second reference set, an `all` of one `equality` per id over `@/id` and `@/class`, or a `for-all` over records whose predicate is an `any` of per-row `all` pairs), or records in `story-1.116.md` why none does and keeps the class-set test
**Then** O-003 fails a reply whose records are complete and in vocabulary but swap the classes of `tea-evaluate 11` and `tea-evaluate 12`, and the committed contract passes it
**And** the mutations M-001 and M-002 still qualify, because the new check moves only when a listed class differs from the table, and the story records how it keeps each seeded probe's defect scoped to one oracle (the story may route the per-row pairs to a per-behavior step of their own)
**And** `test:evaluate-dogfood` gains the swapped-class case, a clean live preflight, development run and held-out run are recorded in `epic-1-proof.md` (the contract digest changes, so the recorded live PASS of Story 1.46 is superseded), and every evidence artifact records `PASS`
**And** removing the new check makes the swapped-class case pass O-003 again and fails the dogfood case, and swapping one class in the table of `references/gaps.md` (a guide edit with no contract edit) fails the replay.

Amended 2026-10-04 in Story 1.116's build:
The check is the third engine kind, a `for-all` over the `/exits` records whose predicate is an `any` of one `all` pair of `equality` checks over `@/id` and `@/class` per table row.
A second reference set cannot pair an id with its class, since `covers-by-key` compares one key, and an `all` of one `equality` per id has no element to bind `@/id` to outside a quantifier.
The pairs stay in O-003: a separate step would read the same mutated table, so moving them changes no scoping.
A pair that held the literal class of `tea-evaluate 11` or `tea-evaluate 12` moves with M-001 and M-002, and the engine records `corroboration: disagrees` for O-003 on P-002 and P-003, since no defect finding cites it.
The records of those two rows therefore compare their class with the answer the `classify-exits` step gave for the same exit, which O-001 holds to the table, so a seeded edit of either row moves O-001 alone and a listing that swaps the two classes moves O-003 alone.
O-003's direction names the two `classify-exits` pointers as evidence targets.
The scoping guard is the corroboration and violated-oracle assertions of `test:evaluate-dogfood`, since the preflight's `seeded-faults-scoped` reads the witness relation on clean legs and qualifies both seeds under either design.
For the two rows the pair reads, B-003's class criterion is held together with B-001's: a listing and a `classify-exits` answer that carry the same wrong class fail O-001 alone, which is M-001 and M-002 themselves.
The criterion that a swapped class fails the replay is held by a trial of the exit-table control (P-006) with a listing that swaps the two classes, by a class changed in the guide's table with no contract edit, and by the same two cases against O-003 as Story 1.46 left it, which pass.
The live development and held-out runs hold the same two assertions on their evidence artifacts: every oracle outcome of every probe reads `corroboration: agrees`, and a seeded probe violates only the oracles of its own behavior.
A verdict of `PASS` alone cannot show this, since the engine scores `PASS` with a `disagrees` outcome, and the two `classify-exits` and listing calls of a mutated trial that disagree on row 11 or 12 would otherwise go unseen.

**Dependencies:** 1.46.
**Gate:** `npm run test:evaluate-dogfood`, `npm run test:evaluate-check`, `npm test`, and a live preflight, development run and held-out run of `test/evaluations/bmad-testarch-evaluate`.

### Story 1.76: Require an explicit custom-agent version response

Added 2026-10-02 from Story 1.72's independent review. Story 1.72 accepts a single semantic-version token anywhere in a custom agent command's version output. A command that prints a dependency version as incidental output can therefore bind that dependency version as `tea.evaluatorAgentVersion`. The custom command is responsible for reporting its own version, but the response format should identify which value it is reporting. This story changes the custom adapter's response contract; the built-in adapter keeps its vendor-specific parser.

As an adopter using a custom sealed-brief agent command,
I want its version response to name the agent version explicitly,
So that incidental dependency versions cannot silently become evaluator provenance (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** a custom sealed-brief agent command whose version response is one line of JSON containing `agentVersion` as a semantic-version string
**When** `tea-evaluate run` prepares the evaluator
**Then** the custom adapter parses that field in `cli/lib/agent-adapters.js`, records it in `tea.evaluatorAgentVersion` and `run.json.evaluator.version`, and still changes the configuration digest and scoring version when that field changes; replacing the keyed parser with Story 1.72's free-text parser makes the dedicated contract test fail
**And** plain text containing one dependency version, JSON with only `dependencyVersion`, malformed JSON, multiple lines, and an invalid `agentVersion` exit 12 before calibration, qualification or a trial record; removing the keyed requirement lets the plain-text dependency case proceed and fails the refusal test
**And** the built-in bridged adapter continues to parse its own documented CLI output; routing it through the custom JSON parser fails a built-in adapter test
**And** `score` and accepted-baseline replay of a recorded custom-agent run still work after removing the custom command, with identical evidence bytes and no version probe; introducing a version read in either path fails that test
**And** the public CLI reference and evaluator guide state the custom response shape, show a valid example, and explain the required update for existing custom commands; removing either example fails `test:evaluate-guidance` or the documentation contract test.

**Dependencies:** 1.72.
**Gate:** `npm run test:evaluate-evaluators`, `npm run test:evaluate-guidance`, `npm run docs:validate-links`, `npm run docs:build`, then `npm test`.

### Story 1.77: Name a report operation's collision with any other api operation at check

Added 2026-10-03 in Story 1.75's round 1 review. Story 1.75 makes `check` compile through the engine and quote its `duplicate-operation-signature` refusal, but only when one `historical` probe's deployments name report operations on two or more interfaces. Two cases still pass `check` and fail `run` at exit 4: a probe that names one report operation whose method and path equal an ordinary `api` operation of another interface, and two probes that each name a report on a different single interface.

As an adopter whose report operation shares its method and path with another operation of the contract,
I want `check` to name that collision before the run,
So that I learn it at exit 10 (AD-1, AD-7).

**Acceptance Criteria:**

**Given** a registry whose one reported interface has a report operation with the same method and path as an ordinary `api` operation of another interface, and one `historical` probe that names that one report
**When** `tea-evaluate check` reads the evaluation
**Then** it exits 10 under `historical` and the finding quotes the engine's line, a `test:evaluate-check` case; narrowing the trigger back to two reported interfaces makes `check` exit 0, which the case catches
**And** two `historical` probes that each name a report for a different single interface, whose operations collide, exit 10 with one collision finding on the first of them from one compile, beside the probes' own report-coverage findings, a `test:evaluate-check` case; a trigger of two reports per probe, or a compile per probe, fails it (amended in Story 1.77: every probe must name a report for each HTTP interface, so Story 1.65's coverage rule already refuses such probes, and the case holds the one collision finding beside those findings)
**And** a registry with one reported interface and no collision exits 0, and a registry whose collision is between two ordinary operations while no probe names a report draws no finding from this rule, so the rule does not take over the CI plan's compile check; a rule that compiles for any `historical` probe, or fires on every collision, fails the clean cases
**And** a registry whose collision is between two operations that no report names, of the `api` shape or any other, beside a probe that does name a report, draws no finding from this rule, because the finding is kept only when the engine's line names an operation a probe's report names, by interface and operation ID and with no template compared (added in Story 1.77's round 1 review: the compile is contract-wide, so every valid deployment probe names a report); a rule that keeps every refusal fails it
**And** the finding is worded around the operations the engine's line names, a case where the engine line names a report operation and an ordinary one; a finding worded as if both operations were reports fails it
**And** the reference's `### Against deployments` and the `historical` row of the rules table state the widened trigger, and a reading case fails while the 1.75 wording "two or more interfaces" remains.

**Dependencies:** 1.75.
**Gate:** `npm run test:evaluate-check`, `npm run test:evaluate-arms`, `npm run docs:validate-links`, `npm run docs:build`, then `npm test`.

### Story 1.78: Prove a sealed-brief accepted-baseline replay through ci starts no agent version probe

Added 2026-10-03 in Story 1.76's round 1 verification review. Story 1.76 proves with a tripwire that `score` and a copied accepted baseline replayed through `score` start no agent version probe. The real replay path, `tea-evaluate ci`, is not exercised for a sealed-brief run: `cli/lib/evaluate/ci.js` imports `run.js`, which holds the one probe site, so a version read added to the replay check would pass every test.

As a maintainer of the Evaluate CLI,
I want the CI replay of a sealed-brief run held to starting no agent version probe,
So that an accepted baseline replays on a runner that lacks the agent CLI (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** an accepted baseline of a sealed-brief-agent run and an agent command replaced by a tripwire that records any invocation
**When** `tea-evaluate ci` runs the `pr` tier replay check
**Then** the `replay` row passes with evidence bytes identical to the baseline's and the tripwire records nothing; adding a version read to the replay path or to a check that runs on the `pr` tier turns the row red or trips the wire, a `test:evaluate-evaluators` case (amended 2026-10-03 in Story 1.78: the sealed-brief project, its stub agent and its baseline acceptance live in `test/test-evaluate-evaluators.js`, and `test/test-evaluate-ci.js` has no sealed-brief fixture, so the case runs `tea-evaluate ci` from the evaluators suite, and its gate list still names both suites; `liveRun` is dropped from the clause because no `pr` check reaches it, the plan validator keeps live checks off the `pr` tier and a live run starts the agent by design; the gameability row is held at the head of its check only, since the baseline holds no gameability probe and its scoring branch is Story 1.79)
**And** the same case holds the other `pr` checks of that evaluation to the same wire, so a check that starts the agent for its version fails it.

**Dependencies:** 1.76.
**Gate:** `npm run test:evaluate-ci`, `npm run test:evaluate-evaluators`, then `npm test`.

### Story 1.79: Hold the gameability scoring branch of a sealed-brief baseline to starting no agent version probe

Added 2026-10-03 in Story 1.78's round 1 review. Story 1.78's case runs the `pr` tier over a sealed-brief baseline that holds no gameability probe, so `gameabilityCheck` returns at its "no gameability probe" exit and its scoring branch never runs under the tripwire. A version read added after that return passes the case.

As a maintainer of the Evaluate CLI,
I want the gameability check's scoring branch held to starting no agent version probe over a sealed-brief baseline,
So that an accepted baseline with a gameability arm replays on a runner that lacks the agent CLI (CAP-13, AD-21).

**Acceptance Criteria:**

**Given** an accepted baseline of a sealed-brief-agent run that holds a gameability probe, and an agent command replaced by a tripwire that records any invocation
**When** `tea-evaluate ci` runs the `pr` tier
**Then** the `gameability` row scores that probe through its scoring branch (its notes omit `no gameability probe` and its output reads `P-004: gameability arm scored through eval-quality score, exit 0`), the row passes (exit 0, class `pass`, action `warn` for the one CONCERNS line the fixture's coverage gaps give, as the `replay` row carries) and the tripwire records nothing; a version read added after the check's no-probe return trips the wire, a `test:evaluate-evaluators` case
**And** the case asserts the accepted baseline holds the probe before the replay (its probe file with the `gameability` route, its trial set and an evidence artifact of `caught` votes), and extends Story 1.78's case, whose baseline now holds the probe
**And** the case needs the sealed-brief stub agent to judge a gameability arm, so the story extends `test/fixtures/evaluate/evaluators/stub-evaluator-agent.js` with `--quote-observed-verdict` (a failing row quotes the `verdict:` line the call's stdout holds, which the degenerate response prints) and keeps its other modes byte-stable.

**Dependencies:** 1.78.
**Gate:** `npm run test:evaluate-evaluators`, `npm run test:evaluate-ci`, then `npm test`.

### Story 1.120: Hold the partial-clone failing-pack refusal to one outcome on Linux

Added 2026-10-03 in Story 1.103's round 2. The `test:evaluate-confinement` case `a failing pack over a partial clone` (`checkWithheldHistoryReachUnits` in `test/test-evaluate-run.js`) failed once on Linux CI (run 37154008845, job 111293528254, ubuntu-24.04, git 2.55.0, chain 4 of 12). Its pack stage is replaced by a git wrapper that exits 1, so the build must refuse naming `rev-list`, `pack-objects` and the wrapper's message. That run refused later instead, at `read-tree HEAD` ("failed to unpack tree object HEAD"), so the pack stage had reported success. The same code and suite passed 20 of 20 at the previous head and 18 of 18 on macOS in six-way parallel, so no cause is known. A one-time flake is a defect: either the stage has a race (`pack` in `cli/lib/evaluate/git-lines.js` ends on both stage outcomes) or the case reads state another build leaves behind (`BUILT_REPOSITORIES`).

As a maintainer of the Evaluate runtime,
I want a failing pack stage over a partial clone to refuse the same way on every run,
So that the case stays a gate and a real refusal is never read as a later-stage fault.

**Acceptance Criteria:**

**Given** a Linux host with git 2.44 or later and the case's wrapper that exits 1 for `pack-objects`
**When** the build over a partial clone runs 200 times in a loop, serially and eight at a time
**Then** every run refuses with a message that names `rev-list`, `pack-objects` and `the case broke the pack`, and none reaches `read-tree`
**And** the story names the cause it found, in `git-lines.js`, in the builder's store cache or in the case, and fixes that site; a cause that cannot be found on Linux leaves the loop green and the record says so with the loop's logs
**And** the loop is a committed script that CI's Linux job can run on demand, and the revert check is that script failing at least once on the unfixed code.

**Dependencies:** 1.80.
**Gate:** `npm run test:evaluate-confinement`, the Linux repro loop, then `npm test`.

Amended 2026-10-04 in Story 1.120's build: the loop is `tools/loop-failing-pack.js` (`npm run loop:failing-pack -- --runs=200 --parallel=8`), which runs `test:evaluate-confinement`'s case `the withheld git history's reach units` (it holds the failing-pack case among the unit cases) and fails a run that refuses anywhere but at the pack stage, and the `Failing-pack loop` workflow (`.github/workflows/failing-pack-loop.yaml`) runs it serially and eight at a time on the ubuntu runner for a pull request that touches `git-lines.js` or the loop (20 serial and 60 parallel runs, about 10 minutes, so the job does not hold a runner while other pull requests queue) and on demand (200 runs in each loop by default). The cause was in `git-lines.js`: the `pack` job counted a stage as ended on `close`, which waits for the stage's standard output to be read to its end, and the pipe into the next stage stops reading once that stage has exited, so an upstream stage with unread output never closed, the event loop ran dry and the job exited 0. The story 1.132 rewrite kept the defect (a Linux container with git 2.47 failed 1 of 40 serial runs and 12 of 60 runs eight at a time on `128680ad`). The fix ends a stage on `exit`, and the `trees` job's same defect (a list paused for a `cat-file` stage that had ended, and a stage that exits 0 before the whole list was handed to it or having answered fewer lines than it was sent) is fixed in the same story. The unit cases hold both with a walk that has exited while a child still holds its output and `cat-file` stages that end before they read, which fail on every host without the fix.

### Story 1.121: Make the ci controlled-mutation witnesses read the reported element so their preflight passes

Added 2026-10-03 in Story 1.99's review. The three ci controlled-mutation probes (P-001 the weekly schedule, P-002 the `contents: read` grant, P-003 the template's burn-in job) carry manifestation witnesses that read the element the run gets wrong: P-001 and P-002 are `not` over a containment of the requested token in the workflow, P-003 is a containment of `burn-in`. Pre-flight's fault leg replays the correct run on the planted input, and on that run each witness is silent, so `test/probes/expected-strength.json` has recorded `failed: seeded-fault-fired, seeded-faults-scoped` for all three since before Story 1.99, and no document said so. The plant is the request in `docs/ci-requirements.md`, the same shape as the fifteen test-review, trace and nfr probes, whose witnesses read the plant in a run that reports it and pass pre-flight. Story 1.99's review reproduced it: dropping the `not` from P-001's and P-002's witnesses makes their pre-flight pass from the leg cache with exit 3 unchanged, and wrapping P-003's witness in `not` still fails `seeded-faults-scoped`, so P-003 needs a witness of another shape. Fixing the witnesses moves the ci pre-flight outcomes, which Story 1.99's acceptance criteria keep, so the fix is filed here.

As a maintainer of the ci probe corpus,
I want the three ci controlled-mutation probes' witnesses to read the element a correct run reports,
So that their pre-flight passes and `expected-strength.json` records it.

**Acceptance Criteria:**

**Given** the ci probes P-001 and P-002
**When** each witness is a containment of the requested element (`0 2 * * 0`, `contents: read`) in the workflow the run wrote, and the staged pre-flight runs from the leg cache (`node test/eval-contract-strength.js --suite ci --from-cache`)
**Then** each pre-flight passes with verdict null and exit 3 unchanged, and the baseline records `passed`; restoring the `not` returns `failed: seeded-fault-fired, seeded-faults-scoped`
**And** P-003 gets a witness that fires on the correct run its fault leg replays and stays silent on the clean legs, and its pre-flight passes the same way; the flipped containment of `burn-in` is the shape that still fails `seeded-faults-scoped`.

**Given** the three corrected probes
**When** the qualification suites read each committed probe's witness over the two stored artifacts
**Then** the kit's direction check follows: `test:ci-qualification` declares `plant-reported`, the `gap-read` label has no probe left, and a witness that reads the other direction fails the suite
**And** every other probe keeps its verdict, exit code and pre-flight outcome: `expected-strength.json` moves only in the three ci pre-flight records and the ci corpus digest, and `npm test` passes.

**Dependencies:** 1.99.
**Gate:** `npm run test:ci-qualification`, `npm run test:probe-corpus`, `node test/eval-contract-strength.js --suite ci --from-cache`, then `npm test`.

Amended 2026-10-04 in Story 1.121's build: the three ci probes' witnesses read the request in the workflow the run wrote, so the ci direction is `plant-reported`, as for the other fifteen, and the `gap-read` label is gone from the kit.
P-001 and P-002 are a containment of `0 2 * * 0` and of `contents: read` with no `not`.
P-003 is an `all` of a containment of `npm test` and a `not` over a containment of `burn-in`: the positive operand keeps the witness silent on the alternate-platform leg, which writes no workflow and over which a `not` of a containment is true, so the flipped containment of `burn-in` alone still fails `seeded-faults-scoped`, and a bare containment of `burn-in` fires on the full project's run.
The ci pre-flight of all three passes from the leg cache with verdict null and exit 3 unchanged, and `expected-strength.json` moves in the three ci pre-flight records (their `basis` no longer names a failed pre-flight) and the ci corpus digest.
`test:ci-qualification` also resolves each ci witness over an absent workflow, and P-003's over the full project's correct pipeline, which pre-flight drops for P-001 and P-002 because their fault leg sends the `witness-github-actions` request; so those shapes are held without a leg cache.

### Story 1.122: Make the ci command oracles hold on the quoted stored capture

Added 2026-10-03 in Story 1.94's build. The real capture `test/replay/ci/evaluation-plan-live-capture` quotes folder names for the shell (`npm install --prefix 'evals'`, `tea-evaluate ci --evaluation 'evals/grader'`). The substring oracles O-031 (`command-evaluation-install`) and O-032 (`command-evaluation-ci-pr`) search for the unquoted literals, so the stored correct run fails both. The engine already resolved both to false on `origin/main` (disposition `held`, check false, corroboration `disagrees`); the baseline records no oracle disposition or corroboration, so it missed it: the clean control P-004 passes pre-flight and scores `CONCERNS` with exit 0, and `probeSummary` keeps only the `probeId`, `state`, `severity` and `trialIndex` of each outcome. Story 1.94 scores each stored run through its paired scorer and lists the two oracles in `KNOWN_UNHELD` in `test/test-probe-corpus.js`; the check fails once either holds, so the list ends with this story.

As a maintainer of the ci probe corpus,
I want the two command oracles to match the quoted commands a correct run writes and nothing looser,
So that every stored correct workflow satisfies every oracle of its set and `KNOWN_UNHELD` is empty (CAP-12).

**Acceptance Criteria:**

**Given** the `contractToken` of `command-evaluation-install` and `command-evaluation-ci-pr` in `test/fixtures/ci-eval/ground-truth.json`, which the oracle machinery consumes as one literal (`ciContains` in `tools/generate-contracts.js` renders a `containment` over it and `workflowMentions` in `test/eval-ci.js` is `String.includes`)
**When** the two elements state a `contractPattern` beside it, a regular expression source that the contract renders with the vocabulary's `regex` operator over the workflow and that the paired scorer tests with `RegExp`, written to tolerate shell quotes and still pin the folder and the tier (amended 2026-10-05 in Story 1.122's build: a balanced pair of quotes and whitespace folds, as below), and fully anchored because the `regex` operator accepts only a pattern that begins with `^` and ends with `$` (`AnchoredPattern`; an unanchored one fails compile with `malformed-operator-expression`), so each is written in the form `tokenGroupExpression` in `tools/generate-contracts.js` already uses, `^[\s\S]*(?:<pattern>)[\s\S]*$`, which the paired scorer tests with `new RegExp(source)` and no flags: `^[\s\S]*npm\s+install\s+--prefix\s+(?:'evals'|"evals"|evals)(?:\s|$)[\s\S]*$` and `^[\s\S]*tea-evaluate\s+ci\s+--evaluation\s+(?:'evals/grader'|"evals/grader"|evals/grader)\s+--tier\s+(?:'pr'|"pr"|pr)(?:\s|$)[\s\S]*$` (single-quoted, double-quoted and unquoted forms pass; a pattern holds no nested quantifier and stays inside the step budget, which the operator enforces)
**Then** `test/contracts/ci.contract.json`, `test/probes/ci.probes.json` and the ci `corpusDigest` in `test/probes/expected-strength.json` regenerate and no other record in the baseline moves
**And** `KNOWN_UNHELD` in `test/test-probe-corpus.js` is empty and `storedRunProblems` passes for the evaluation-plan project

**Given** a workflow that omits either command, runs `--tier nightly` or `--tier prod`, or installs under another prefix (`npm install --prefix other`, `--evaluation other/grader`)
**When** `test:probe-corpus` scores it through its paired scorer in a scratch copy
**Then** the oracle no longer holds and the check names it: a workflow running `--tier nightly` or `--tier prod` fails O-032, and a pattern loosened until it matches anything fails

**Given** the clean control P-004 after the token change
**When** the engine scores its record
**Then** O-031 and O-032 resolve `held` with corroboration `agrees` and the record carries no `disposition-contradicts-evidence` (today the dispositions are `violated` with no defect finding, which that rule reads as a contradiction, and the corroboration is `disagrees` as it was on `origin/main`).

**Dependencies:** 1.94.
**Gate:** `test:probe-corpus`, `test:probe-sources` (which runs `node tools/generate-probes.js --check`), `test:contract-sources`, `test:contract-oracles`, then `npm test`.

Amended 2026-10-05 in Story 1.122's build, fix round 1: the patterns above replace the first ones, `['"]?evals['"]?` and `['"]?pr['"]?` between single spaces.
Each quote there was independent, so an unterminated quote, a closing quote only and a mismatched pair (`'evals"`) all held, and each is a shell syntax error.
Each argument is now a whole-word alternation, `(?:'x'|"x"|x)`, inside a group and with no nested quantifier, so only a balanced pair holds.
A folded YAML scalar (`run: >-`) can break the line between the words of a command and the harness accepts it, so the words are separated by `\s+`.
Amended 2026-10-05 in Story 1.122's build: the paired scorer is `workflowHoldsToken` in `test/eval-ci.js`, which is `workflowMentions` over a literal `contractToken` and `workflowMatches` (`new RegExp(source)`, no flags) over a `contractPattern`.
`validateCorpus` refuses a `contractPattern` that is empty, has no `contractToken`, is not anchored over the whole expression (`^` first, an unescaped `$` last, no alternation at the top level), is not a regular expression, or fails to match its own token or its element's command.
The other three projects' command elements keep their literal tokens (`npm install --prefix`, `--tier pr`), which hold on their stored captures.
`test:contract-oracles` scores forty-one forms of the two commands through the engine and the scorer.
`KNOWN_UNHELD` is the empty list, and `knownUnheldProblems` in `test:probe-corpus` exercises the check that fails a listed oracle which holds, so the list can be refilled.
`cleanControlProblems` holds the third criterion: every engine outcome of a clean control of the four stored-run suites is `held` with corroboration `agrees`, and `cleanControlSelfProblems` exercises it over a contradicted and a violated outcome.

### Story 1.123: Score each ci project's stored workflow structurally as well as by its substring oracles

Added 2026-10-03 in Story 1.94's review. The substring oracles of the ci contract read a workflow as one string, so they cannot see 23 of the 34 stored constructed ci deviations (33 of 46 after Story 1.93's build adds twelve, of which ten pass through): a `CI_CORRECT_RUNS` row pointed at one passes `test:probe-corpus` (`full-unparseable`, `full-test-step-suppressed`, `full-injection-in-run`, `evaluation-plan-chained-commands`, `evaluation-plan-upload-negated` and the rest listed in `test/probes/README.md`). One cause is the token of the burn-in job oracle, `burn-in`, which the comment `# Weekly burn-in on Sundays` satisfies, so `full-burn-in-missing` passes through too. The harness's own scorer, `scoreRun` and `checkElement` in `test/eval-ci.js`, reads these structures, as the trace, nfr and test-design builders already get from their `scoreRun`.

As a maintainer who adds a project to the ci corpus,
I want each `CI_CORRECT_RUNS` workflow scored with the harness's structural scorer as well as by its substring oracles,
So that a row that points at a deviation fails where it is added (CAP-12).

**Acceptance Criteria:**

**Given** every `CI_CORRECT_RUNS` workflow
**When** `test:probe-corpus` scores it with `scoreRun` over its project's ground truth
**Then** every expected element is present and no rule fires

**Given** each of the 33 pass-through deviations (amended 2026-10-04 in Story 1.93's build: 23 stored by Story 1.94 and ten of the twelve Story 1.93 stores, `evaluation-edit-checkpoint-rewritten`, `evaluation-edit-marker-job-emptied`, `evaluation-edit-stale-job-kept`, `evaluation-edit-stale-job-kept-unmarked`, `evaluation-edit-test-job-reformatted`, `evaluation-tiers-artifact-names-swapped`, `evaluation-tiers-merge-without-pr-step`, `evaluation-tiers-pr-job-unguarded`, `evaluation-tiers-scheduled-under-pr-timeout` and `evaluation-tiers-test-job-unguarded`), pointed at by a row of `CI_CORRECT_RUNS` in a scratch copy
**When** `test:probe-corpus` runs
**Then** it fails and names the element or the rule that no longer holds

**Given** the burn-in job oracle
**When** the workflow carries `burn-in` only in a comment
**Then** its token no longer matches, and `test/probes/expected-strength.json` moves only where the story's record says.

Amended 2026-10-04 in Story 1.97's build: 35 pass through, not 33, because Story 1.97 adds two stored constructed deviations of the evaluation-gate project, `evaluation-gate-needs-cut` and `evaluation-gate-release-job-on-pull-requests`, and a `CI_CORRECT_RUNS` row pointed at either passes `test:probe-corpus` (the wait has no substring oracle and the release job's tokens are all present).
The scratch-copy check of the second criterion covers the 35.

Amended 2026-10-06 in Story 1.123's build: the second criterion holds for 32 of the 35, and the other three are not deviations.
`evaluation-plan-upload-wrapped-condition` wraps the upload's condition as `${{ always() }}`, which means what `always()` means.
`full-node-version-literal` writes a literal `node-version` equal to `.nvmrc`, and `full-node-version-step-output` reads the version from a step output as the shipped template does.
The harness scores each as the correct run with every element present and nothing unrequested, and its replay cases pin that, so a row pointed at one is a correct row and `test:probe-corpus` passes it.
The second criterion therefore reads: each of the 32 pass-through deviations fails `test:probe-corpus` and names the element, the lint finding or the rule that no longer holds, and the three correct spellings pass, which `ciStructuralSelfProblems` holds so that a check that flagged any difference from the capture fails.
The first criterion reads every expected element present, nothing unrequested, no actionlint finding and no rule firing, since `full-workflow-dispatch-added` adds a trigger that no element names and a correct run draws no finding.
The third criterion holds with a different token: the burn-in element states the job id `burn-in:` and a `contractPattern` that reads a mapping key or a `name:` line that carries the word, outside a comment, so `test/probes/expected-strength.json` moves in the ci `corpusDigest` only, with `test/contracts/ci.contract.json` and `test/probes/ci.probes.json` regenerated.
`test:contract-oracles` scores 232 forms of the burn-in job through the engine and the scorer, among them each spelling of the word with one character dropped, doubled or replaced, in a job id and in a job name.

**Dependencies:** 1.94.
**Gate:** `test:probe-corpus`, `test:probe-sources` (which runs `node tools/generate-probes.js --check`), `test:contract-sources`, then `npm test`.

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
**Then** it compares a run with `baseline/` through `compareDominance` and reports `refused` when `comparabilityKey` differs, including across `evalQualityVersion` (amended 2026-10-01 in Story 2.1: `comparabilityKey` lives in each score's `evidence-artifact.json`, not in `run.json`, so the key refusal reads the evidence artifacts probe by probe; the `evalQualityVersion` refusal reads `run.json`, since every artifact below it was scored by that install, and routes to `compare --accept`; the partitions and the probe sets must also agree, and a held-out or `both` run is accepted as the partition it recorded)
**And** `compare --accept` writes `baseline/` (contract snapshot, sealed brief, qualified probes, observations, preflight verdict, sealed records, per-trial-set isolation manifests, evaluator configuration, scoring policy, evidence) and `baseline/qualification/`, and refuses a run whose `run.json` says `dirty: true`; a replay through `score` needs every one of these, so omitting the isolation manifests makes Story 2.2's replay exit 3 (amended 2026-10-01 in Story 2.1: `baseline/` mirrors the run directory's relative paths byte for byte, so every digest `run.json` recorded still matches; the actions artifact each record references stays under `trials/`, where the record names it, since `score` refuses a record whose actions artifact is absent. The sealed records name their artifacts as `runs/<acceptedRun>/...` and `score` refuses a reference outside the run directory it scores, so Story 2.2's replay places the baseline's bytes at `runs/<acceptedRun>/` inside a scratch copy of the evaluation folder and rewrites no path. `compare --accept` also refuses a run `score` would reject: any finding of `score`'s input checks, or a latest `score.json` recording an infrastructure failure or a refused strength aggregate)
**And** since `compareDominance` already reports `incomparable` for differing `comparabilityKey`, the named revert check for TeA's own refusal is the case whose only difference is `evalQualityVersion` in `run.json`
**And** `test/lib/compare-dominance.js` and `test/lib/compare-eval-runs.js` import the runtime module and keep only TeA data
**And** `test/test-evaluate-compare.js`, chained into `npm test` as `test:evaluate-compare`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), asserts each case, and it fails when the dirty refusal is removed

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
**And** it persists each check's exit code, stdout and stderr under `runs/<invocationId>/`, so a `gate` check the adopter's plan adopts leaves its output in the evidence bundle (AD-12); a `test:evaluate-ci` case runs a stub `gate` check that prints distinct known bytes to each stream and exits 1, asserts byte equality per stream and the recorded code, and fails when the capture is dropped (amended 2026-10-01 in Story 2.2: `ci.js` runs an `evaluate` check by its id from a closed set of twelve, one per AD-10 default-tier member, and its `command` is the `tea-evaluate` argv a pipeline renders (amended 2026-10-01 in Story 2.3, round 2: the argv records what a reader can run by hand, and a pipeline runs `tea-evaluate ci --tier <tier>` once per tier, since `ci` runs every check of the tier); `enforcement` records AD-10's class, `block`, or `warn` only where AD-10 says warn (a strength regression on the comparison, the floor on `scheduled`), and the action always comes from AD-10's table, so a plan cannot demote a blocking exit; a tier holds only the checks placed on it, so a merge pipeline runs the `pr` tier as well; the final exit is the most severe blocking result in the order 64, 12, 5, 4, 3, 13, 11, 10, 2, 1, recorded in AD-10; a `gate` check and every `pr` default are deterministic checks that stay on `pr`, and a live check sits off `pr`; `check` reports the same plan findings)

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
**And** the `scheduled` and `release` tiers run the held-out partition (Story 1.21) with the strength floor applied to it separately (warn on `scheduled`, block on `release`), and judge calibration whenever the contract declares a rubric, whose exit 11 blocks on both tiers (amended 2026-10-01 in Story 2.2: the twin run covers the partition the baseline recorded at the scoring policy's `minimumTrialCount` trials per arm, so the comparison measures the same probe set (a baseline of `both` is a run of everything, held-out probes included, because a development run against it would be a `refused` comparison; the held-out check applies the floor to that partition on its own); the strength floor is read from the engine's floor decisions in each run's strength aggregate; judge calibration is read from the report a run writes before its first trial)

**Given** `test/test-evaluate-ci.js`, chained into `npm test` as `test:evaluate-ci`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own)
**When** it runs over fixture plans and a fixture evaluation with a committed test baseline under `test/fixtures/evaluate/` (amended 2026-10-01 in Story 2.2: that evaluation is `test/fixtures/evaluate/mutation/evals/verdict-ci`, a copy-workspace clone of the verdict fixture, so the tests that copy `verdict` keep their first-run behavior)
**Then** it asserts the AD-10 enforcement table row by row, the outcome-state mapping, the tier membership and a replay that reproduces the fixture evidence
**And** replay reads baseline bytes only from `baseline/`: it places them at `runs/<acceptedRun>/` inside a scratch copy of the evaluation folder, because the sealed records name their artifacts under that path and `score` refuses a reference outside the run directory it scores (amended 2026-10-01 in Story 2.1), and it writes produced evidence only to a fresh `runs/<invocationId>/replay/` directory; produced evidence that differs from the baseline exits 13, class evaluation evidence drift, action block (an AD-10 row)
**And** mutating one committed baseline evidence byte exits 13, which catches a replay that compares a file with itself
**And** mutating the clean-control leg's `exitCode` in one committed baseline observation exits 13 while eval-quality's own exits stay as recorded, and with `TEA_EVALUATE_ENGINE_CLI` pointed at a logging shim the argv log shows `preflight` and `score` invoked, which together catch a replay that copies baseline evidence forward without re-scoring (amended 2026-10-01 in Story 2.2: the fixture's control legs are what eval-quality's clean-control check reads, so a changed control leg makes the engine's own preflight exit 3, which passes through verbatim; exit 13 is the exit of an observation edit that leaves the engine at its recorded exits, a witness leg's `exitCode`, which moves the verdict's `fixtureDigest`; `test:evaluate-ci` asserts both and the shim log in each; the compared files are the produced verdict, each probe's `evidence-artifact.json`, `strength-aggregate.json` and `strength-floors.json`, and, since Story 1.91, each probe's `score.json` and `aggregate-strength.json`, whose neutral path forms a replay writes again, while the invocation's own `score.json` summary is left out because it names the replay's invocation id; the replay scores under the floors the baseline's own score recorded, so a floors edit since the accept is a stale baseline, and the stale-baseline rule applies once per tier whenever `baseline/` exists)
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
**And** each tier the plan places a check on renders as one job with one pipeline step, `npm exec --prefix <evaluations folder> -- tea-evaluate ci --evaluation <evaluation folder> --tier <tier>`, named for the ids of every check on the tier, after an install of the evaluations folder with `--prefix` (amended 2026-10-01 in Story 2.3, round 1: `ci --tier` is the runtime's one entry that runs a tier and writes its evidence bundle and takes no check selector, so a step per check or per distinct command ran checks twice, ran a live preflight twice and let a failing early step stop the job before the bundle existed; an earlier amendment the same day had read each distinct command as a step; AD-20 keeps the tooling in the evaluations folder's private `package.json`, so no root install and no `npx`)
**And** the GitHub Actions template gains an evaluation block with the one-step-per-tier pattern and an upload of the evaluation folder's `runs/`, which holds one `runs/<invocationId>/` per invocation, with `if: always()` (AD-12; amended 2026-10-01 in Story 2.3: the invocation identifier is minted at run time, so the pipeline uploads the directory that holds every invocation); a deterministic test, chained into `npm test` as `test:evaluate-ci-render`, which the `chain` matrix runs (amended 2026-09-25 in Story 1.9: CI runs the `npm test` chain in shards, so a chained script needs no step of its own), asserts the detection step is reached from both the create and edit entry points and parses the template block as YAML asserting both patterns
**And** because the CI skill's templates are rendered by the agent, the rendering itself is proved behaviorally: `test/eval-ci.js` gains an `evaluation-plan` case over the fixture adopter from Story 1.10, whose ground truth lists the install of the evaluations folder and the tier step as standalone `run:` steps (the command element gains `standaloneStep` and `checkIds`), the `evaluation-pr` job under its marker (a new `job` element) and the evaluation folder's `runs/` upload with its `if: always()` condition (the artifact element gains an optional `condition`, compared exactly, that the upload's `if` must equal; amended 2026-10-01 in Story 2.3: each element reads one property the story claims, and a looser element let the mutants in the review pass); the case's fixture set lives under `test/fixtures/ci-eval/evaluation-plan/` (the harness requires set roots there) as a copy of that plan, the Story 1.10 fixture's, with its evaluation folder moved to `evals/grader` and an evaluations folder `evals/package.json` beside it (amended 2026-10-01 in Story 2.3: the Story 1.10 plan names its evaluation folder under `test/fixtures/evaluate-mcp/`, which a copied adopter project cannot hold, and AD-20 puts the package manifest one level above the evaluation folder; the CI contract generator accepts more than one full-request set, since the new project is a second full request and the contract roles were one full and one minimal); a live `npm run eval:ci` through the local Claude Code CLI produces the workflow, which the worker captures by hand into `test/replay/ci/evaluation-plan-<case>/expected.json` with `storedOutput` marked a real capture; `node tools/generate-contracts.js` and `node tools/generate-probes.js` are re-run (the CI contract's `probeStepBound` grows with the set count) and the `ci` suite's `caseCount` and `fixtures` in `suite-manifest.json` are updated; `test:contract-sources`, `test:probe-sources`, `test:eval-schemas`, `test:eval-replay` and `test:eval-ci-data` then hold it
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
**And** it places the gameability arm, contract-source freshness and oracle-versus-scorer agreement on `pr`, the held-out partition and judge calibration on `scheduled` and `release`, sets live tiers for skill and agent targets to `scheduled`, `release` and manual dispatch only, declares the runner's credential keys as `permittedEnvironmentKeys`, and invokes `bmad-testarch-ci` in edit mode (amended 2026-10-01 in Story 2.4: step 03b of `bmad-testarch-ci` reads the `release` event from the repository's release or deploy workflow and the `merge` event from a `merge_group` the pipeline lists, and tells tiers that share one GitHub event apart with a ref or cron guard, the one edit the story makes to the CI skill, because the renderer otherwise left a tag-releasing repository's live set running nowhere; create mode when the inspection finds no pipeline file; `defaultTier` is the tier AD-10 gives the check for the adopter, so a check the table lists on `scheduled` and `release` has one entry per tier with its own tier as default and `preflight-live` for a target that needs no secret defaults to `merge`; the stage sets `evaluation.json` `tiers` to the tiers the plan uses, accepts the first baseline through `compare --accept` with the adopter's confirmation, runs each tier that can run on the machine and shows the adopter every exit (a blocking exit returns to the stage that owns it, and the hand-off still proceeds), and records its inspection facts and hand-off status as a `## CI` section of the run's inspection record; `SKILL.md` runs Stage 12; the plan template is `assets/evaluation-ci-plan.template.json`, every check at its default with an empty `reason`)
**And** `eval-quality-gates` is offered as opt-in, adds only sections for gates the adopter adopts, never rewrites an existing section, and adds each adopted gate to the plan as a `gate` check
**And** the guidance test asserts each heading and placement rule, and the plan template validates against the runtime schema

**Given** two fixture repositories under `test/fixtures/evaluate-ci-repos/`, one releasing on tags with no model secret in CI and one deploying nightly with a model secret on scheduled runs, each carrying the Story 1.24 AI-feature evaluation
**When** a maintainer session runs the ci stage on each through the local Claude Code CLI
**Then** both produced plans validate against the runtime schema and are committed, they differ in the placement of at least one live check, and each differing placement's `reason` cites a file from its repository
**And** `test:evaluate-ci` validates both committed plans and asserts that difference, so a stage that ignores the inspection and writes the default table fails it (amended 2026-10-01 in Story 2.4: the repositories are `test/fixtures/evaluate-ci-repos/tagged-release` and `nightly-deploy`, each with its workflows, `CONTRIBUTING.md`, a release or deploy note, `app/` (the AI-feature target) and `evals/answer-grade/` (the Story 1.24 evaluation, launching `../../app`); the assertion compares the sets of live placements, `id@tier`, and requires every differing placement's `reason` to cite a file of its own repository; every placement of both plans carries a `reason`, `evaluation.json` `tiers` equals the plan's tiers, and `check` passes)

**Dependencies:** 2.3.
**Gate:** skill gates (no registration change), `npm test`.

### Story 2.5: TeA runs its `pr` tier and documents Evaluate

As a TEA maintainer,
I want TeA's own pull requests to run the `pr` tier for the Evaluate-authored suite and both fixture adopters,
So that Evaluate is continuously proven where it is built, and users can read how to use it.

**Acceptance Criteria:**

**Given** the evaluations from Stories 1.10, 1.11, 1.16, 1.18, 1.19, 1.20, 1.24, 1.25 (its `after` evaluation) and 1.26
**When** the worker wires TeA directly (AD-11: TeA's checks are `npm test` chain scripts, which the `chain` matrix runs, and the CI-skill rendering is proved on the fixture adopters in Story 2.3)
**Then** each fixture evaluation's `pr` checks, and the `check`, `compile` and `seal` checks of `bmad-testarch-evaluate`, join the `npm test` chain as scripts, which the `chain` matrix of `.github/workflows/quality.yaml` runs, and `npm run test:ci-coverage` and `npm run test:shards` pass (amended 2026-09-25 in Story 1.9, which replaced the `validate` job with the sharded `chain` job)
**And** the `chain` job uploads each `runs/<invocationId>/` as a build artifact with `if: always()` from the shard that ran its check, and a `test:evaluate-ci` case parses `quality.yaml` and fails when that upload step or its path is missing
**And** the eight `eval-quality-gates` stay in their current `quality.yaml` jobs, unchanged, which the same test asserts

**Given** no committed baseline exists overnight for `bmad-testarch-evaluate`
**When** the overnight evidence is recorded
**Then** `tea-evaluate ci --tier pr` exits 0 for every fixture evaluation, each with a baseline accepted through `compare --accept` from a clean copy-target run (AD-8: a fixture target's `evaluation.json` declares a copy workspace, so its run records `dirty: false`), the gameability arm, contract-source freshness and oracle agreement included
**And** for `bmad-testarch-evaluate` the non-replay `pr` checks (`check`, `compile`, `seal`) exit 0, and the replay step is recorded as pending Story H.1 with the dirty proof run's evidence artifact, verdicts and rollback proof cited from `epic-1-proof.md`
**And** the result is recorded at `_bmad-output/implementation-artifacts/evaluate/epic-2-proof.md`

Amended 2026-10-04 by the owner: the documentation criteria this story carried moved to Story 2.6, which runs after every other story merges so the documentation describes the skill as shipped.

**Dependencies:** 2.4.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, `npm run test:release-metadata`.

### Story 2.6: Document Evaluate for the people who use it

Added 2026-10-04 by the owner. It runs last, after every other Epic 1 and Epic 2 story has merged, because the documentation describes the skill as it ships. It takes over the documentation criteria Story 2.5 carried. The readers never followed the build: they want to evaluate an AI feature, and the owner reviews these pages closely on their behalf.

As a TEA user who wants to evaluate an AI feature,
I want documentation that takes me from a first evaluation to CI,
So that I can use Evaluate without knowing how it was built.

**Acceptance Criteria:**

**Given** the Evaluate documentation on `main` (`docs/reference/tea-evaluate-cli.md`, `docs/explanation/eval-quality-adoption-guide.md`, `docs/explanation/how-tea-is-tested.md`, `docs/how-to/workflows/setup-ci.md`)
**When** the documentation lands
**Then** `docs/` carries, in the site's existing sections: a tutorial that evaluates one small skill from intake to a scored run and an accepted baseline against a fixture shipped in the repository, every command copyable and its expected output shown; how-to pages for evaluating a skill or agent, a stdio MCP tool server and an HTTP API, for choosing an evaluator and calibrating a judge, for reading the gaps and fixing them, for comparing runs and accepting a baseline, for putting the evaluation in CI (tiers and the `bmad-testarch-ci` rendering), and for bringing an existing AgentEvals or promptfoo suite or learning another framework on the go; and an explanation page for the stack (system under test, the evaluation, the Behavioral Evaluation Contract, eval-quality), what TeA owns above eval-quality, oracles and evaluator kinds, held-out probes and judge calibration, gameability, the clean and mutated arms and their rollback, confinement and why it exists, and how CI placement is derived
**And** `docs/reference/tea-evaluate-cli.md` is rewritten as a user reference: each command's purpose, options, exit codes, outputs and one example, and the `evaluation.json` fields an adopter writes, with design rationale left to the explanation page
**And** every new page is linked from the TEA overview and the site navigation, `how-tea-is-tested.md` and `eval-quality-adoption-guide.md` describe Evaluate as shipped, and TeA's 0/1/2 harness convention is documented as an optional pattern; a check in the `npm test` chain compares the Evaluate pages with the site's resolved sidebar entries and fails when one is missing, since `docs:validate-links` and `docs:build` stay green for a page left out of the sidebar
**And** no page under `docs/` names the build: story numbers, `AD-` identifiers, epics, sprints, lanes, the relay, pull request numbers, `_bmad-output/` paths or the review process; a check in the `npm test` chain scans `docs/` for those patterns and fails on any match
**And** a check in the `npm test` chain runs the tutorial's commands against the shipped fixture and fails when a command errors or its shown output's key lines do not appear
**And** `CHANGELOG.md` names the new documentation under `[Unreleased]`, and `npm run docs:validate-links`, `npm run docs:build`, `test:doc-counts` and `test:doc-claims` pass
**And** the pull request opens as ready and the coordinator asks the owner to review it; it merges after the owner's review, with CI green and every review thread resolved

**Dependencies:** every other Epic 1 and Epic 2 story.
**Gate:** `npm test`, `npm run docs:validate-links`, `npm run docs:build`, `npm run lint:md`, `npm run format:check`.

## Owner Hand-off

### Story H.1: Accept the dogfood baseline and turn its `pr` replay green

Run by the owner coordinator after all five lanes have drained, including Stories 1.104 to 1.116. No `/bmad-build` worker runs this story.

**Engine status (2026-10-03):** eval-quality 7.0.0 is published and Story 1.101 raises TeA's peer floor to that release. Stories 1.102 and 1.104 will publish and adopt later engine releases before H.1 runs. H.1 uses the published engine resolved by the final merged TeA lockfile.

As the owner,
I want the dirty proof run replaced by a clean one on the merged tree,
So that the `pr` replay of `bmad-testarch-evaluate` has an accepted baseline to reproduce.

**Steps, each with what it proves:**

1. On `main` after all lanes drain, `npm ci` then `npm test`. Proves every check is green on the merged tree and the published engine.
2. `node cli/evaluate.js run --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json` and `score` on that committed tree, with live legs through the local Claude Code CLI. Proves a clean (`dirty: false`) run: preflight passed, `passed-clean-control`, `caught` at `minimumTrialCount`, rollback proved.
3. `node cli/evaluate.js compare --accept --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json` in a branch, and open the pull request. Add the `bmad-testarch-evaluate` replay as an `npm test` chain script, which the `chain` matrix of `quality.yaml` runs (amended 2026-09-25 in Story 1.9), in the same pull request. Proves the baseline enters `baseline/` only through a reviewed pull request (AD-12).
4. `node cli/evaluate.js ci --tier pr --evaluation test/evaluations/bmad-testarch-evaluate/evaluation.json`, locally and in the pull request's `quality.yaml` run. Proves the `pr` replay reproduces the committed evidence, closing AD-15's last condition.

**Dependencies:** 2.6, 1.76, 1.77, 1.78, 1.79, 1.84, 1.85, 1.86, 1.87, 1.88, 1.89, 1.104, 1.105, 1.106, 1.107, 1.108, 1.109, 1.110, 1.111, 1.112, 1.113, 1.114, 1.115, 1.116, 1.120, 1.121, 1.122, 1.123, 1.130, 1.131, 1.132, 2.5.

## Traceability

| Capability | Stories                                     | Proven by                                                                                                                                                                                      |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CAP-1      | 1.3, 1.12, 1.13, 1.24                       | guidance test; 1.10, 1.11 and 1.16 contracts declare `mcp`, `api`, `cli`; 1.24 inspection records and vendor redirect                                                                          |
| CAP-2      | 1.12, 1.24                                  | guidance test (six families, confirmation halt); 1.16 and 1.24 requirements statements                                                                                                         |
| CAP-3      | 1.4, 1.12, 1.16, 1.21, 1.24, 1.56           | `test:evaluate-check`; tagged corpus examples; `test:evaluate-authoring` section coverage; 1.56 malformed refusal defect probe                                                                 |
| CAP-4      | 1.4, 1.13, 1.16, 1.24                       | skeleton compile and seal test; tagged contract examples; 1.16 and 1.24 compile and seal exit 0                                                                                                |
| CAP-5      | 1.9, 1.13, 1.21, 1.24                       | `test:evaluate-arms`; `test:evaluate-calibration`; tagged oracle and rubric examples                                                                                                           |
| CAP-6      | 1.1, 1.5, 1.6, 1.10, 1.11, 1.13, 1.18, 1.19 | `test:evaluate-preflight`, `-mcp`, `-api`, `-workflow`, `-tool-use`                                                                                                                            |
| CAP-7      | 1.7, 1.9, 1.14, 1.16, 1.56                  | `test:evaluate-mutation`; tagged mutation examples; 1.16 rollback evidence; 1.56 guard-bypass rollback                                                                                         |
| CAP-8      | 1.8, 1.14                                   | template schema validation; guidance test (risk table)                                                                                                                                         |
| CAP-9      | 1.6, 1.8, 1.14, 1.16, 1.17, 1.45, 1.56      | `test:evaluate-run`; `test:evaluate-evaluators`; 1.16 live verdicts; 1.45 engine-owned aggregate; 1.56 malformed defect score                                                                  |
| CAP-10     | 1.14, 1.16, 1.22, 1.25, 1.45, 1.55, 1.104   | guidance test over exported vocabularies; `test:evaluate-interpret`; `test:evaluate-gap-loop`; 1.45 class-floor gate; 1.55 scalar CLI coverage fixtures; 1.104 orphan-oracle negative fixtures |
| CAP-11     | 2.2, 2.3, 2.4, 2.5, H.1                     | `test:evaluate-ci` (placement, gameability, freshness, agreement); rendering test; the `quality.yaml` `chain` matrix; H.1 step 4                                                               |
| CAP-12     | 1.8, 2.1, 2.5, H.1                          | `run.json`; `test:evaluate-compare`; H.1 step 3                                                                                                                                                |
| CAP-13     | 1.17, 1.19, 1.20, 1.23, 1.26                | `test:evaluate-evaluators`, `-tool-use`, `-promptfoo`, `-learned-framework`; template rendering in the guidance test                                                                           |
| CAP-14     | 1.21, 1.51, 2.2                             | `test:evaluate-partitions`, `test:evaluate-partition-plans`, `test:evaluate-calibration`; `scheduled` and `release` tier cases                                                                 |

### Plan gap audit closure

The 2026-09-23 audit of this plan found eleven partial and two missing items, seven eval-quality non-goals no story covered, and an addendum of further gaps. Each is closed here.

| Audit item                                                                                  | Closed by                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Inspect target: entry points, behaviors, surfaces, existing tests, failure history        | Story 1.12 (inspection headings, inspection record); proven in Story 1.24                                                                                                                    |
| 2 Test-review mechanism kind                                                                | AD-4 sixth row; Story 1.12 corpus section; Story 1.24 test-review suite                                                                                                                      |
| 3 Intake questions                                                                          | Story 1.12 (six question families, statement template)                                                                                                                                       |
| 4 Corpus design per kind, representative, negative and malformed inputs, held-out probes    | Story 1.12 (per-kind corpus); Story 1.21 (held-out runtime); Story 1.24 (section coverage)                                                                                                   |
| 5 BEC authoring discipline, interaction plan, sensitivity witness, waivers, worked examples | Story 1.13                                                                                                                                                                                   |
| 8 Gameability design per kind                                                               | Story 1.12 (per-kind gameability); Story 1.13 (loose and tightened oracle)                                                                                                                   |
| 9 Oracle relation choice, evidence pointers, anchored scales, judge calibration             | Story 1.13 (guide); Story 1.21 (calibration runtime)                                                                                                                                         |
| 10 Workflow adapter, tool-use calling agent, agent's own command                            | Stories 1.18 and 1.19 (fixtures); Story 1.13 (adapter guide rows)                                                                                                                            |
| 11 Realistic mutation choice per behavior                                                   | Story 1.14 (mutation guide)                                                                                                                                                                  |
| 18 Author, rerun, rescore loop                                                              | Story 1.14 (loop); Story 1.25 (seeded weaknesses closed)                                                                                                                                     |
| 19 CI placement from the adopter's repository, CI, release flow and risk profile            | AD-10 amended; Story 2.4 (inspection, placement reasons, two fixture repositories); Story 2.2 (placement schema)                                                                             |
| 20 Gameability arm, contract-source freshness, oracle-versus-scorer agreement in tiers      | Story 2.2 (`pr` tier); Story 2.4 (placement)                                                                                                                                                 |
| 26 TeA decides what runs when                                                               | Story 2.4; AD-10                                                                                                                                                                             |
| 27 Evaluation-layer knowledge, third-party frameworks, sealed-brief evaluator               | AD-21; Stories 1.17 (evaluator kinds, import contract, sealed-brief agent, records), 1.19 (AgentEvals), 1.20 (promptfoo), 1.23 (guide, rubric, learn-on-the-go), 1.26 (unfamiliar framework) |
| Non-goal: claim-to-evidence lineage                                                         | AD-23 boundary; Story 1.22 (citation and pointer trace); Story 1.17 (quotes reach the engine unaltered)                                                                                      |
| Non-goal: process and outcome separation, first material error attribution                  | Story 1.22 (runtime); Story 1.14 (reading them)                                                                                                                                              |
| Non-goal: semantic checkpoint scoring                                                       | AD-23 boundary: a judgment checkpoint is a rubric criterion judged by a calibrated judge (Stories 1.13, 1.21) and scored by eval-quality                                                     |
| Non-goal: held-out probe sets                                                               | AD-22; Story 1.21; Story 2.2 (tiers)                                                                                                                                                         |
| Non-goal: judge calibration                                                                 | AD-22; Story 1.21; Story 1.13 (design)                                                                                                                                                       |
| Non-goal: tool-selection evaluation                                                         | Story 1.19                                                                                                                                                                                   |
| Know-how placement: guidance proven only by term presence                                   | Build Rules (craft and tagged examples); Stories 1.24, 1.25, 1.26                                                                                                                            |
| Addendum A: `seal` in the skill's compile-and-validate stage                                | Story 1.13 (stage and guide); Story 1.16 (proof runs `seal`)                                                                                                                                 |
| Addendum B: vendor-model requests redirected                                                | Story 1.12 (passage and test); Story 1.24 (recorded redirect); AD-4                                                                                                                          |
| Addendum: repetition count and thresholds for a risk                                        | Story 1.14 (harness risk table)                                                                                                                                                              |
| Addendum: low catch rate, strength-vector reading, loose oracle                             | Story 1.14 (per-probe gaps readings); Story 1.45 (run-wide engine aggregate)                                                                                                                 |
| Addendum: exact checks and semantic rubrics                                                 | Story 1.13 (tagged examples compile)                                                                                                                                                         |
| Addendum: adopter-owned harness or custom evaluator into `score`                            | Story 1.17 (`command` and `records` kinds)                                                                                                                                                   |

## Epic Sizing

| Epic   | Size        | What drives it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Epic 1 | Extra large | One upstream export; a runtime generalized from existing harness code in six moves plus the evaluation layer (evaluator kinds, the MCP bridge, the import contract), held-out partitions, judge calibration and interpretation; eight fixture targets (MCP, API, workflow, tool-use agent, promptfoo summarizer, AI feature, test-review mechanism, learn-on-the-go target) and three framework devDependencies (AgentEvals, promptfoo, the framework Story 1.26 learns); four skill-content stories carrying craft and worked examples; and four live proofs (the dogfood suite, two more target kinds, the gap loop, an unfamiliar framework). |
| Epic 2 | Large       | Compare and CI subcommands with placement validation and three added deterministic checks, one step in `bmad-testarch-ci`, the skill's CI stage with repository inspection and two recorded fixture repositories, TeA's own wiring for every fixture evaluation, and documentation.                                                                                                                                                                                                                                                                                                                                                              |

The runtime is split by the AD-5 module table so each story moves or builds one concern and keeps `npm test` green at its end.
