---
title: 'Story 2.5: TeA runs its `pr` tier'
type: 'feature'
created: '2026-10-04'
baseline_commit: '6b6abf492a38c0e01a51c03808747a496f2bff29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 2.5)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-2.md (Story 2.5, R2-06, R2-12)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-8, AD-10, AD-11)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.98.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.104.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-2.4.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Evaluate proves other people's evaluations in CI, and TeA's own pull requests run none of its own.
Only the MCP and API fixture adopters (and the two CI repositories, through `test:evaluate-ci-repositories`) have a committed plan and baseline; the workflow, tool-use, promptfoo, learned-framework, AI-feature, test-review and gap-loop evaluations and the Evaluate-authored suite have neither, and no `quality.yaml` step keeps the evidence of a red run.

**Approach:** Each evaluation of Stories 1.10, 1.11, 1.16, 1.18, 1.19, 1.20, 1.24, 1.25 (`after`) and 1.26 becomes a script of the `npm test` chain that runs `tea-evaluate ci --tier pr` over its committed folder, with a committed plan and a baseline accepted through `compare --accept` from a clean copy-workspace run.
The `chain` job uploads every `runs/` directory with `if: always()`, and a `test:evaluate-ci` case holds the upload, the chain and the eight `eval-quality-gates` jobs to a revert case each.

## Boundaries & Constraints

**Always:** Baselines are recorded in disposable copies with a unique directory name.
A real defect `ci` finds in an evaluation is repaired at its cause.
Documentation criteria belong to Story 2.6.

**Never:** Touch `test:evaluate-ci-repositories` or its shard weight, the eight gates' jobs, the engine, or `references/ci.md` and the plan template of the Evaluate skill.

</frozen-after-approval>

## Code Map

- `test/lib/evaluate-pr-tier.js` -- the ten evaluations, the wiring, upload and gate rules, and the folder and result checks.
- `test/test-evaluate-pr-tier.js` -- the chained script of one evaluation, `test:evaluate-pr-<key>`.
- `test/test-evaluate-ci.js` -- `checkTeaPrTier`: the committed state and a revert case for every rule.
- `.github/workflows/quality.yaml` -- the `evaluate-runs-<shard>` upload step in the `chain` job.
- `package.json`, `tools/test-shard-weights.json` -- ten scripts in the chain, with measured weights.
- `test/fixtures/**/ci/evaluation-ci-plan.json`, `test/fixtures/**/baseline/` -- plans and accepted baselines of seven fixture evaluations, and a plan for the suite.
- `test/fixtures/evaluate-gap-loop/` -- P-010, P-012 and P-013 of `after`, its replay, `source-inventory.json`, and `test/test-evaluate-gap-loop.js`.

## Tasks & Acceptance

**Execution:**

- [x] `test/lib/evaluate-pr-tier.js`, `test/test-evaluate-pr-tier.js`, `package.json`, `tools/test-shard-weights.json` -- ten chained scripts.
- [x] `test/fixtures/*/ci/evaluation-ci-plan.json` and `baseline/` for workflow, tool-use, promptfoo, learn, ai-feature, test-review and gap-loop `after`; the suite's plan.
- [x] `.github/workflows/quality.yaml` -- the upload step.
- [x] `test/test-evaluate-ci.js` -- `checkTeaPrTier`.
- [x] gap-loop `after` -- repair P-010, P-012 and P-013 and record `replay/` again.
- [x] `CHANGELOG.md`, `epic-2-proof.md`, this record, the sprint row.

**Acceptance Criteria:**

- Given the ten evaluations, when `npm test` runs, then each `test:evaluate-pr-<key>` runs in the chain and `test:ci-coverage` and `test:shards` pass.
- Given `quality.yaml`, when `test:evaluate-ci` parses it, then the `chain` job's `evaluate-runs-${{ matrix.shard }}` upload runs `if: always()` over every evaluation's `runs` directory, and the eight gates stay in their jobs.
- Given each fixture evaluation, when `tea-evaluate ci --tier pr` runs, then it exits 0 over a baseline accepted from a clean copy-workspace run, with the gameability arm, contract-source freshness and oracle agreement.
- Given the suite, when its `check`, `compile` and `seal` run, then each exits 0 and its replay is pending Story H.1.
- Given `epic-2-proof.md`, then it records each script's exit, the digests, the pending suite replay and the measured `pr` duration.

## Implementation Notes

Implemented directly from the plan above; no implementation subagent was available to re-engage.

## Spec Change Log

## Review Triage Log

Three context-free layers (blind, edge-case, verification-gap) reviewed the diff of the tracked and new text files.
Every real finding is fixed in this PR.

| Finding                                                                                                                                      | Verdict | Evidence and fix                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Driver throws on a missing `runs/` after `ci` dies (blind, edge-case, verification-gap)                                                      | medium  | `readdirSync` ran unguarded. The driver now checks `existsSync` and prints the `ci left no runs/<invocationId>/ci.json` line.                                                  |
| Driver writes `null` stdout before checking `run.error` (blind, edge-case)                                                                   | medium  | A failed spawn masked its own message. `run.error` is checked first and the streams are written with `?? ''`.                                                                  |
| "No secret" is claimed and not enforced (blind)                                                                                              | medium  | The child env passed every runner variable. It now drops names matching KEY, TOKEN, SECRET, PASSWORD or CREDENTIAL and adds back the two fixture bearer values per evaluation. |
| A folder's `runs/` ignore rule is only asserted in a comment (blind, edge-case)                                                              | medium  | `checkTeaPrTier` runs `git check-ignore` for every evaluation's `runs/`.                                                                                                       |
| A plan could name another evaluation's folder (blind)                                                                                        | medium  | `folderProblems` requires every check's `--evaluation` argument to equal the plan's own folder, with a revert case.                                                            |
| `ci.json` without `checks` raises a TypeError (edge-case)                                                                                    | low     | `resultProblems` reads `ciJson.checks ?? []`.                                                                                                                                  |
| Held-out witness count compares a map with its source and cannot fail; a probe with no defects passes the loop (edge-case, verification-gap) | medium  | The test asserts each held-out probe declares at least one defect and each probe in `checkQualification` declares at least one.                                                |
| `RECORDED` exclusion reaches `before` (blind)                                                                                                | medium  | `before` excludes only its placeholder `baseline/README.md`; the exclusion of `baseline/` and `ci/` applies to `after` and to the Story 1.24 source alone.                     |
| Revert cases assume the `coverage` and `prettier` job names (blind)                                                                          | low     | Each case asserts the job exists before it edits it.                                                                                                                           |
| `GATE_JOB_STEPS` is an exact list (blind)                                                                                                    | medium  | Round 1 confirmed the reverse: the list compared only `npm run` lines. `GATE_JOBS` now holds the whole jobs frozen from origin/main (see Review round 1).                      |
| Runs accumulate in the ignored `runs/` of a fixture (blind)                                                                                  | false   | The directory is ignored, the artifact is the evidence, and CI starts from a clean checkout.                                                                                   |
| The suite plan is not checked for gameability or conformance (blind)                                                                         | false   | The suite has no baseline and no such probe; Story H.1 adds the replay and `requiredChecks` then derives the rest.                                                             |
| Baselines, replay and sprint row absent from the reviewed diff (blind, verification-gap)                                                     | false   | The diff file excluded generated evidence by design; they are staged explicitly in the commit.                                                                                 |

## Review round 1

An Opus reviewer reproduced four defects on PR 346.
Each is fixed.

| Finding                                                                                                                                                                                                                                                  | Verdict | Evidence and fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gate jobs compare only their `npm run` lines, so `if: false` or `continue-on-error: true` on a step or job leaves every test green (reproduced on `test:licences`, `test:direction`, the `supply-chain` job and the `layering-boundary-lineage` job) | medium  | `GATE_JOBS` in `test/lib/evaluate-pr-tier.js` freezes both whole jobs from the committed jobs at origin/main, and `workflowProblems` deep-compares every key of the job and of each step, reporting the first path that differs (`jobs.supply-chain.steps[5].if (added)`). Revert cases cover a step `if: false`, a step `continue-on-error`, a job `if: false`, a job `continue-on-error` and a job `needs`. Each was also proved by editing a scratch copy of `quality.yaml` as text: the committed file reports no problem, each edit reports its path.                                                                    |
| The `dirty: true` runs `20261004T192244468Z-be9e03a4` and `20261004T192321837Z-8ff2398c` were committed as the gap-loop `after` replay                                                                                                                   | medium  | They were recorded after `compare --accept` had left an untracked `baseline/` in the disposable copy. Both partitions were recorded again from a fresh git repository holding one commit of the evaluation folder (runs `20261004T200734374Z-09e17fd9` and `20261004T200808474Z-02f0655c`, each `dirty: false`, `evaluationFolder.dirty: false`), and `replay/manifest.json` was regenerated. Nothing else hashes the replay: `source-inventory.json`, `corpus-index.json`, the baseline and `epic-2-proof.md` do not name it. `test:evaluate-gap-loop` now asserts both flags are false; it failed on each flag set to true. |
| `folderProblems` cites AD-8 and reads only the baseline run, so a `git` workspace in a fixture `evaluation.json` passes                                                                                                                                  | low     | A baseline entry now requires `evaluation.json` `workspace.kind` to equal `copy`, with the revert case "a fixture evaluation that declares a git workspace". It failed with the check removed.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| The changelog and the driver header claim a baseline "that `compare --accept` recorded", which nothing checks                                                                                                                                            | low     | Both now list what the code checks: the engine release, `dirty`, `completed`, the run's and `evaluation.json`'s `workspace.kind`, `acceptedRun` and `partition`. The antithesis in the gap-loop test header is a plain statement.                                                                                                                                                                                                                                                                                                                                                                                             |

## Review round 2

One Opus reviewer checked the round 1 fixes for regressions.
It re-ran the ten `test:evaluate-pr-*` scripts, `test:evaluate-gap-loop` and the `test:evaluate-ci` case, and proved each round 1 revert case fails by a real mutation.
It found no regression and no material defect in code or tests.
The seven lines of the records that held several sentences were split to one sentence per line.

## What changed

- **Ten chained scripts.** `test/lib/evaluate-pr-tier.js` lists the evaluations (the MCP and API graders, the Evaluate-authored suite, the workflow, tool-use, promptfoo, AI-feature, test-review, gap-loop `after` and learned-framework evaluations).
  `test/test-evaluate-pr-tier.js <key>` is each one's script, `test:evaluate-pr-<key>`, chained into `npm test` after `test:evaluate-ci-render`.
  It runs `tea-evaluate ci --tier pr` through the real CLI and fails on a plan that omits the gameability arm or the port conformance its folder calls for, on a baseline recorded on another engine release, with a dirty or incomplete run or a non-copy workspace, whose manifest names another run or a partition other than both, on an `evaluation.json` that declares a non-copy workspace, and on a non-zero exit, other checks than the plan places or a stale baseline.
  The child environment drops credential-looking variables.
  `tools/test-shard-weights.json` carries a measured weight for each; `test:ci-coverage` (126 chained steps) and `test:shards` pass.
- **Plans and baselines.** The workflow, tool-use, promptfoo, learn, AI-feature, test-review and gap-loop `after` evaluations commit `ci/evaluation-ci-plan.json` and a `baseline/` accepted with `compare --accept` from a clean run of both partitions in a disposable copy (`dirty: false`, `workspace.kind: copy`).
  The suite commits a three-check plan.
  The MCP and API fixtures kept the plans and baselines Stories 2.2 and 1.104 gave them.
  The placeholder `baseline/README.md` of test-review and gap-loop `after` is replaced by the accepted baseline.
  Recording a baseline is a fresh run, so run IDs and digests are new (`epic-2-proof.md` lists them).
- **The upload.** The `chain` job of `quality.yaml` uploads each evaluation's `runs/` as `evaluate-runs-<shard>` with `if: always()` and `if-no-files-found: ignore`.
- **The `test:evaluate-ci` case** `the pr tier of TeA itself` parses `quality.yaml` and `package.json`: the committed state, and a revert case for each of the ten upload paths, the step, its `always()`, its shard-qualified name and its empty-shard setting; each of the nine steps of the two gate jobs dropped and a gate step moved; each script deleted, re-pointed and removed from the chain, and each of the eight gate scripts removed from the chain; and the folder and result rules (a plan missing the gameability arm, the port conformance, `oracle-agreement` or `replay`, a plan for another folder, a baseline from another engine, a dirty or incomplete run, a git workspace in the baseline run or in `evaluation.json`, one partition, none, a suite with a baseline), and a revert case each for a gate step or job switched off with `if: false` or `continue-on-error: true`.
- **A defect found by `ci`.** The gap-loop `after` evaluation exited 11 on `oracle-agreement` (15 disagreeing outcomes on its held-out probes P-010, P-012 and P-013, each mutation violating oracles of behaviors the probe did not declare).
  They now equal the repaired Story 1.24 test-review probes, `replay/` of `after` was recorded again from separate development and held-out runs of a committed disposable copy (`dirty: false`), `source-inventory.json` and `corpus-index.json` were regenerated, and `test:evaluate-gap-loop` reads the oracles of every behavior a probe declares, cites one mutated-fail evidence per defect, and requires the repaired probes to equal the test-review ones while `before` keeps its own.
- **Records.** `README.md` chain length (126), `CHANGELOG.md` under `[Unreleased]`, `epic-2-proof.md`, this record, and the sprint row (`in-progress` at start, `review` at PR open).

## Revert observations

Each was made on the working tree and restored byte for byte.

- **Upload step removed** from `quality.yaml`: `test:evaluate-ci` fails with `the chain job has no actions/upload-artifact step named evaluate-runs-*`.
- **`if: always()` changed to `success()`**: fails with `the evaluate-runs upload runs on "success()", so a red shard uploads nothing; it must run if: always()`.
- **`test:direction` moved from `layering-boundary-lineage` to the `prettier` job**: fails with `the layering-boundary-lineage job runs [...], expected [...]`.
- **`test:evaluate-pr-gap-loop` removed from the `npm test` chain**: the `test:evaluate-ci` case fails with `test:evaluate-pr-gap-loop is not in the npm test chain, so the chain matrix never runs it`, and `test:ci-coverage` fails naming the script.
- **`gameability` removed from the AI-feature plan**: `test:evaluate-pr-ai-feature` exits 1 with `ai-feature: the pr tier lacks gameability`.
- **One byte added to the workflow baseline's `preflight-verdict.json`**: `test:evaluate-pr-workflow` exits 1 with `replay exited 10 (authoring defect)`.
- **P-010 of gap-loop `after` restored to its pre-repair bytes**: `test:evaluate-gap-loop` fails with `P-010.probe.json changed after evidence capture`, and `test:evaluate-pr-gap-loop` exits 1 with `check exited 10` and a stale baseline.
  With the corpus index regenerated over the old probe, `ci --tier pr` exited 11 on `oracle-agreement` before this story (15 disagreeing outcomes), which is how the defect was found.

## Verification

- `test:evaluate-pr-<key>` for all ten keys: exit 0 (`ci --tier pr` 22.2 s serial, slowest `ai-feature` 4.7 s).
- `test:evaluate-ci` (full, 247 s, the new case among them), `test:evaluate-ci-repositories` (520 s), `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:evaluate-dogfood`, `test:evaluate-check`, `test:evaluate-workflow`, `test:evaluate-tool-use`, `test:evaluate-promptfoo`, `test:evaluate-learned-framework`, `test:evaluate-boundaries`, `test:evaluate-guidance`, `test:evaluate-compare`, `test:evaluate-ci-render`: exit 0.
  After the review fixes, `test:evaluate-gap-loop`, the new `test:evaluate-ci` case and the ten pr scripts ran again: exit 0.
- `test:ci-coverage` (126 chained steps), `test:shards`, `test:release-metadata`, `test:changelog`, `test:bmad-output-gated`, `test:suite-manifest`, `test:conflict-markers`, `test:schemas`, `test:doc-counts` (the README chain length now reads 126), `test:doc-claims`, `lint`, `lint:md`, `format:check`: pass.
- Not run here: the full `npm test` chain, which CI carries in its twelve shards.
