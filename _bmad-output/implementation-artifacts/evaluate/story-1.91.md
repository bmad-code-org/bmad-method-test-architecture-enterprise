---
title: 'Story 1.91: Keep machine paths out of a committed baseline'
type: 'feature'
created: '2026-10-04'
baseline_commit: '4eb03c69'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.91)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.91)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-12)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.90.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-2.5.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.98.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.104.md'
  - '_bmad-output/implementation-artifacts/evaluate/epic-2-proof.md'
---

## Intent

**Problem:** `compare --accept` copies a run's files into `baseline/` byte for byte.
`run.json`, the observations and the score call records carried the workspace paths, the repository path, the evaluation checkout's path and the private staging path of the machine that produced the run.
Twelve of the fourteen committed `baseline/` folders held them, 239 files in all, so a public repository published the maintainer's home directory and temporary directory names.

**Approach:** The runtime writes neutral path forms where a path would be, and every digest is taken over those bytes.
`compare --accept` is unchanged.
The twelve accepted baselines are accepted again from fresh runs.

## The design choice

Two designs were open: neutral forms recorded at the source (a), and a neutral substitution when `compare --accept` copies the files (b).
The build chose (a).

What digests each file that leaked decides whether (b) could work, so each was traced.

| File                                             | What digests it                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `run.json` (workspaces, repository)              | Only the baseline manifest. `run.json` is the file that holds the other digests.                            |
| `observations/*.json` (`cwd`)                    | Only the baseline manifest. `observations.json`, the file the preflight reads, holds no `cwd`.              |
| `scores/<id>/<probe>/score.json` (`cli`, argv)   | Only the baseline manifest. The invocation summary names these files by path and holds no digest of them.   |
| `scores/<id>/aggregate-strength.json`            | Only the baseline manifest. The aggregate's input digests are over the evidence artifacts.                  |
| isolation manifests (a login's credentials file) | `run.json` (`isolationManifests`). A login run writes the home directory into `allowedMounts` and its note. |

A substitution at accept time keeps every one of those anchors valid, apart from the isolation manifests, where it would move a digest `run.json` anchors.
Three reasons decided for (a) all the same.

- **The replay compares the call records.** The AC extends the `pr` replay's comparison to each probe's `score.json` and `aggregate-strength.json`.
  A replay of the same records writes those files itself, so the runtime has to write the bytes the baseline holds.
  Under (b) the accept would write neutral forms and the replay would write absolute ones, so the comparison could not pass.
- **`runs/` is published too.** The `chain` job uploads every `runs/` directory as a CI artifact.
  A substitution at accept time leaves that bundle carrying the paths.
- **The accept stays a byte copy.** AD-12 says `baseline/` mirrors the run directory byte for byte.
  (a) keeps that sentence true and the one compare header sentence "no probe's bytes or evidence paths are rewritten" with it.

The replay accepts the neutral forms because every form is a function of what the replay reproduces: the evaluation folder's layout (`runs/<acceptedRun>/...`), the engine package's layout and a fixed placeholder for the staging file.
The score invocation id is random per call, so the aggregate call's argv names the invocation's directory as `<score-invocation>`.
eval-quality reads none of these records back: it is handed the real paths in the call and sees no record.

## What changed

- `cli/lib/evaluate/recorded-paths.js` is new.
  It holds the forms and the recorder an engine call's argv and output go through.
  - `<workspace>`, or `<workspace>/<path>` when `launch.root` sits below the workspace's top: `run.json` `workspaces` and each `cwd` in `observations/` and `faults/`.
  - `<repository>`: `run.json` `adopterTree.repository`, `null` stays `null`.
  - `<credentials-file>`: a login's file in `run.json`, the isolation manifest's `allowedMounts` entry (`read-only login <credentials-file>`) and its forbidden-input note.
  - `eval-quality/<path below the package>` for the engine executable, or the file name of the program `TEA_EVALUATE_ENGINE_CLI` substituted.
  - A file of the evaluation folder in an argv by its path below the folder, any other absolute argument as `<staging>/<file name>`, and the score invocation's directory as `<score-invocation>`.
- `cli/lib/evaluate/engine-cli.js`: `runEngineStage` takes the evaluation `folder` (and the `scoreInvocation`) and records the neutral forms in `cli`, `argv`, `stdout`, `stderr` and `error`.
  The caller still gets the real streams.
  Every caller passes its folder (`score.js` twice, `run.js`, `preflight.js`, `ci.js` three times, `release-report.js`), and a call without one throws.
- `cli/lib/evaluate/preflight.js`, `historical.js`, `run.js`, `confinement.js`: the workspace, repository and credentials forms where those paths were recorded.
  A route carries its recorded working directory in `cwd`.
- `cli/lib/evaluate/ci.js`: the replay's comparison covers every file `score` writes under `scores/<id>/` except the invocation's own `score.json` summary (it names the replay's invocation id).
  `CALL_RECORDS` is gone, `SUMMARY_RECORD` replaces it.
  The scratch replay's `preflight` call passes the scratch folder, so its record names `runs/<acceptedRun>/...` too.
- `cli/lib/evaluate/compare.js`: the header states the forms and that no file is rewritten.
  No logic changed.
- `docs/reference/tea-evaluate-cli.md`: a section "Paths in the records" with the table of forms, the engine, score, aggregate, `compare` and `ci` passages that said where a path appears, and exit 13's row.
  A recorded argv reruns by hand from the evaluation folder.
- `ARCHITECTURE-SPINE.md` AD-12 records the choice as an amendment, and the Story 2.2 amendments in AD-10, `epics.md` and `test-design-epic-2.md` say the call records are compared now.
- `CHANGELOG.md` has the entry under `[Unreleased]`.
- The twelve accepted baselines are accepted again (below), and the replay bundles hold the same forms (below).

### Tests

- `test/test-evaluate-compare.js`:
  - `checkMachinePaths` runs a project under `machine-path-canary-4d7a` with `TMPDIR` set to `distinctive-temp-root-9e21`, accepts the run and scans every file under `baseline/` byte for byte for the project's, the temp directory's and the home directory's paths in both spellings, the host's temp directory and the private root `tea-evaluate-p<uid>`.
    A second scan looks for any Unix or macOS host path (`/Users/`, `/home/`, `/private/`, `/var/folders/`, `/tmp/`).
    The case also asserts `check` exits 0 on the accepted baseline, the recorded forms in `run.json`, an observation and a score call, and that a project path planted into each baseline file in turn is found.
  - The existing replay block now also asserts that each probe's `score.json` and `aggregate-strength.json` of the replay equal the accepted bytes.
  - `checkCommittedBaselinesHoldNoMachinePath` scans every `baseline/` under `test/fixtures/` and `test/evaluations/` (fourteen folders, 1412 files, listed by name so a vanished folder fails) for those host paths.
- `test/test-evaluate-ci.js`: the replay comparison set is eight files, and its case flips one byte of the strength aggregate, of the floors, of `P-001/score.json` and of `aggregate-strength.json` in turn (exit 13, the drift named).
  The `pr replay` case asserts the replay reproduces the call records, and that a replay through the logging shim, which records the substitution, differs in those three files alone.
- `test/lib/recorded-argv.js`, `test/lib/evaluate-baseline.js`: the two directions between an argv as it ran and as its record states it, and the scan helpers.
- `test/test-evaluate-run.js`, `test-evaluate-evaluators.js`, `test-evaluate-preflight.js`, `test-evaluate-mutation.js`, `test-evaluate-arms.js`: each assertion that read an absolute path from a record now reads the neutral form.
  The staging file's real place (inside the private root, removed after the call) is asserted from the argv the logging shim saw, since the record no longer shows it.

## The fourteen baselines

`machinePathHits` ran over every committed `baseline/` under `test/fixtures/` and `test/evaluations/` before and after.
Before, twelve of the fourteen held a path (the `valid` fixture and the gap-loop `before` placeholder held none): 9 files in each of the MCP, API, promptfoo, tool-use and `verdict-ci` baselines, 11 in the workflow baseline, 16 in learn, 32 in AI-feature and in each CI repository, 35 in gap-loop `after` and 36 in test-review, 239 files in all.
After, none of the 1412 files holds one.

## Accepted again

Each baseline is a fresh run of both partitions accepted with `compare --accept` in a disposable copy with a unique directory name: a one-commit git repository of the fixture's project (the evaluation folder and its launch root), `runs/` and the provisioned `vendor/` excluded through `.git/info/exclude` so the tree holds nothing the fixture does not, and the packages of TeA's `node_modules` linked in a `node_modules` above it.
Every run recorded `dirty: false`, `completed: true` and `workspace.kind: copy`, on eval-quality 7.1.0, with the contract, corpus and policy digests, the partition and the verdicts the earlier baselines recorded.
`check` and the digest check pass on each, and `acceptedRun` and `partition` (`both`) are what the ten `test:evaluate-pr-*` scripts require.
`epic-2-proof.md` carries the new accepted runs, score invocations and replay digests, and `story-1.98.md` the new runs of the two CI repositories.
A grep of the repository for the old run identifiers and digests finds nothing else.

| Evaluation       | Accepted run                   | Score invocation               |
| ---------------- | ------------------------------ | ------------------------------ |
| mcp              | `20261005T002637506Z-c07ad017` | `20261005T002640548Z-f865198c` |
| api              | `20261005T002653577Z-ef22f04c` | `20261005T002658491Z-0e79935d` |
| workflow         | `20261005T002700231Z-2a847f02` | `20261005T002704270Z-060cb355` |
| tool-use         | `20261005T003519483Z-09aa2413` | `20261005T003526622Z-1bb66c7f` |
| promptfoo        | `20261005T003528438Z-a2899e78` | `20261005T003538994Z-bbfda810` |
| learn            | `20261005T003540834Z-9af645f6` | `20261005T003551497Z-8eae1cbc` |
| ai-feature       | `20261005T003059220Z-94afbbcd` | `20261005T003245693Z-b6fda3d0` |
| test-review      | `20261005T003249653Z-94a4d2b7` | `20261005T003354745Z-4c12b1dc` |
| gap-loop `after` | `20261005T003359218Z-a24b1481` | `20261005T003504334Z-a4e8f573` |
| verdict-ci       | `20261005T002714911Z-9a6d158d` | `20261005T002718039Z-49c3f27b` |
| tagged-release   | `20261005T002720085Z-54904496` | `20261005T002904247Z-2270b8ed` |
| nightly-deploy   | `20261005T002908491Z-27b43866` | `20261005T003055084Z-18402264` |

### Replay bundles

The gap-loop `after` and `before`, AI-feature and test-review `replay/` folders are run bundles of the same file kinds, with 110 files naming the recording machine (`run.json`, `observations/`, the call records of `score`, `engine/`).
They record states a run cannot reach again (a stopped development run, the diagnostic runs of the blind session), so they are not recorded again.
Each file that named a path was rewritten to the form the runtime now writes, and each `replay/manifest.json` hash map was recomputed over the new bytes: 47, 19, 23 and 21 hashes changed, one per rewritten file.
Nothing else digests the replay, and `test:evaluate-gap-loop` and `test:evaluate-authoring` pass over the new bytes.

## Gates

Run serially, one evaluate suite at a time, each over the final tree.

- `test:evaluate-compare` passes (66 s) with the three new cases and the extended replay block.
- `test:evaluate-check` passes (all 1290 checks).
- The ten `test:evaluate-pr-*` scripts exit 0 (1 to 5 s each), and `node test/test-evaluate-ci.js --only="the pr tier of TeA itself"` passes.
- `test:evaluate-ci` passes (283 s), including the replay comparison set of eight files and the shim replay.
- `test:evaluate-ci-repositories:<adopter>-<tier>` for the seven scripts of `tagged-release` and `nightly-deploy`: exit 0.
- `test:evaluate-run`, `-aggregate`, `-held-inputs`, `-evaluators`, `-agents`, `-records`, `-private`, `-held-attempts`, `-preflight`, `-arms`, `-mutation`, `-confinement`, `-authoring`, `-gap-loop`, `-dogfood`, `-learned-framework`, `-mcp`, `-api`, `-workflow`, `-tool-use`, `-promptfoo`, `-partitions`, `-partition-plans`, `-interpret`, `-calibration`, `-ci-render` and `-boundaries` (500 checks): exit 0.
- `test:doc-counts`, `test:doc-claims`, `test:release-metadata`, `docs:validate-links`, `lint`, `lint:md` and `format:check`: pass.
- Not run here: the full `npm test` chain, which CI carries.

Two suites failed once and are fixed.

- `test:evaluate-ci` failed at the replay comparison set, which expected five compared files and now compares eight, and at the clean replay through the logging shim: the shim is a substituted engine, its call records say so (`substituted: true`, another `cli`), and they differ from the baseline's.
  The clean replay now runs without the shim, and a second replay through the shim asserts that exactly the three call records drift.
- `test:evaluate-confinement` failed one check that read the credentials file's path from the isolation manifest's note.
  It reads `<credentials-file>` now, and the run passes.

## Revert observations

Each mutation was applied in a scratch copy of the tree (`mut-r91-7c2f` under the session scratch directory), run against the suite named, and undone.
`test:evaluate-compare` is "compare" below.

| Mutation                                                                                           | Result                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The workspace form returns the absolute path                                                       | compare: `a file of baseline/ names a path of this machine`.                                                                                                                                                                                  |
| The pristine leg's `cwd` recorded absolute                                                         | compare: the same assertion.                                                                                                                                                                                                                  |
| `adopterTree.repository` recorded as the repository path                                           | compare: the same assertion.                                                                                                                                                                                                                  |
| The engine executable recorded as its absolute path                                                | compare: the same assertion.                                                                                                                                                                                                                  |
| The argv recorded as it ran                                                                        | compare: `the replay of P-001 did not reproduce the accepted call record`. With `--machine-paths-only`: `a file of baseline/ names a path of this machine`.                                                                                   |
| The score invocation id left in the aggregate argv                                                 | compare: `the replay did not reproduce the accepted aggregate call record`.                                                                                                                                                                   |
| The scan returns no hit                                                                            | compare: `baseline.json: a planted project path is not found`.                                                                                                                                                                                |
| `/Users/someone/work` appended to the MCP baseline's `run.json`                                    | compare: `test/fixtures/evaluate-mcp/evals/grader/baseline holds a path of a Unix or macOS host`, before any run.                                                                                                                             |
| `compare --accept` appends a byte to `trial-sets/P-001/record-1.json` in the copy and the manifest | compare: `trial-sets/P-001/record-1.json is not the run's own bytes`. With that assertion removed, the accepted baseline fails the next step, `check`: `[run-integrity] digests to sha256:2d17..., not the sha256:cc5a... run.json recorded`. |
| Both call records left out of the replay comparison (Story 2.2's set)                              | `test:evaluate-ci --only="the replay comparison set"`: the count line (`8 baseline file(s) compared`) fails. With the count line relaxed, the flip of `P-001/score.json` exits 10 where 13 is expected.                                       |
| Only `aggregate-strength.json` left out                                                            | the same count failure; with the count relaxed, the flip of `aggregate-strength.json` exits 10 where 13 is expected.                                                                                                                          |
| Only each probe's `score.json` left out                                                            | the same count failure; with the count relaxed, the flip of `P-001/score.json` exits 10 where 13 is expected.                                                                                                                                 |
| A login's credentials file recorded as its path in `run.json`                                      | `test:evaluate-preflight`: 1 of 353 checks fails.                                                                                                                                                                                             |
