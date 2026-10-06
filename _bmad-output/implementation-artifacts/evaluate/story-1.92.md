---
title: 'Story 1.92: Stop tea-evaluate ci at once on a signal while an engine stage runs'
type: 'feature'
created: '2026-10-06'
baseline_commit: '15f1232e'
status: 'done'
route: 'dispatch'
review_loop_iteration: 2
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.92; Parallel lanes)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.92)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-10, AD-12)'
  - '_bmad-output/implementation-artifacts/evaluate/story-2.2.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.90.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.91.md'
---

## Intent

**Problem:** `runEngineStage` ran each eval-quality stage with `spawnSync`.
A synchronous call holds the event loop, so a SIGINT or SIGTERM that reached `tea-evaluate ci` while `compile`, `seal`, `preflight`, `score`, `aggregate-strength` or the stale-baseline compile ran could not run its handler until the stage ended.
A stage that hangs held `ci`, its stage and its private directory until something killed the stage.
The test that held the signal case killed the stage itself after sending the signal, so it encoded the defect.

**Approach:** The stage is an asynchronous child that leads a process group of its own, and every live stage sits on one list in `engine-cli.js`.
`cleanUpOnSignal` (`workspace.js`), which every command that runs a stage registers, stops that list first and then lets the command remove its scratch directories and end by the signal.

## The design choice

Three designs were open.

| Design                                                                                               | Result                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) One registry in `engine-cli.js`, `runEngineStage` asynchronous for every caller                  | Chosen. One module owns the child and its end. No signature of `score.js`, `preflight.js`, `run.js` or `check.js` carries a `context.children`.                                                                                                                                                |
| (b) Thread `context.children` through every caller so `stopChildren` reaches the stage               | Needs `ci.js`'s context in `runScoreCommand`, `runPreflightCommand`, `runRunCommand`, `checkEvaluation` and `compileRefusals`, so the engine-stage list would live in five public signatures, and a command run outside `ci` would still have no way to end its stage.                         |
| (c) Keep a synchronous variant for the in-process `run`, `score` and `preflight` a live check drives | A `ci` signal reaches them all: the replay's `score` and `aggregate-strength` come through `runScoreCommand`, a live check's `run`, `score` and `preflight` run in the `ci` process, and the `check` check's compile runs through `checkEvaluation`. Every one of those would keep the defect. |

The callers a `ci` signal reaches were measured by reading each call site.

| Call site                                                                                            | Reached from `ci` by                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ci.js` `engineStageCheck` (`compile`, `seal`)                                                       | the plan's `compile` and `seal` checks                            |
| `ci.js` `staleBaseline`                                                                              | `applyStaleness` of a baseline-reading check, `tierBaseline`      |
| `ci.js` `replayPreflight`                                                                            | the `replay` check                                                |
| `score.js` `scoreProbe` and the aggregate call                                                       | the `replay`, `gameability` and live checks                       |
| `run.js` `scoreAttempt`                                                                              | the live `run` of `twin-run`, `held-out`, `strength-comparison`   |
| `preflight.js` `engineStage` (`compile`, `seal`, `preflight`)                                        | the `preflight-live` check and every live run                     |
| `release-report.js` `compileRefusals` through `check.js` `checkProbes` (called by `checkEvaluation`) | the `check` check, and the pipeline's own check of every live run |

All seven are awaited now, so there is no synchronous variant.
`compileRefusals`, `checkProbes`, `preflight.js`'s `engineStage`, `ci.js`'s `engineStageCheck` and the `context.once` callback of `replayPreflight` became asynchronous; the others were already inside asynchronous code.

### The order of a signal

The first design stopped the stage after the command's handler had removed the scratch directories.
eval-quality writes an artifact with `mkdir(dirname(out), { recursive: true })` and then the file, so a stage that is writing recreates entries after the removal, or makes the removal fail with `ENOTEMPTY`.
Round 1 reproduced `run-<pid>-*` left behind in 4 of 6 `ci` runs and in 6 of 6 standalone `tea-evaluate preflight` runs against a stage that writes its `--out`, and 0 of 6 with the stage stopped first.
`cleanUpOnSignal` therefore calls `stopEngineStages` (SIGINT or SIGTERM to each group, SIGKILL after 500 ms, the list emptied) before it aborts the run and calls the command's `onSignal`.
It is the one place every handler passes through, so `ci`, `preflight` and `run` need no call of their own, and `workspace.js` requires `engine-cli.js` with no cycle.
A process that ends through `process.exit` kills the live groups from an `exit` hook in `engine-cli.js`.

### Which commands remove what on a signal

| Command               | Handler before this story                            | Now                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci`                  | `cleanUpOnSignal` in `runCiCommand` (gates, scratch) | Stops the live stage first. The `check` check hands `ci`'s scratch list to its compile, and takes the invocation's scratch directory first, so a SIGKILL of `ci` leaves a parent the next `ci` removes. |
| `preflight` and `run` | `cleanUpOnSignal` in the pipeline (`preflight.js`)   | Stops the live stage first. The pipeline's own `checkEvaluation` call (before the pipeline's list exists) removes the compile's directory itself.                                                       |
| `score`               | none                                                 | Registers `cleanUpOnSignal` when it makes its own private parent (a replay hands over a staging root and `ci` owns the cleanup), and removes that parent.                                               |
| `check`               | none                                                 | `compileRefusals` registers `cleanUpOnSignal` when no caller owns its list, and removes the directory its compile works in.                                                                             |

## What changed

- `cli/lib/evaluate/process-group.js` is new: `signalGroup` and `sleepSync` moved out of `ci.js`, and `stopGroups` (signal each group, wait the grace, SIGKILL each, empty the set).
  `ci.js` `stopChildren` is one call to it.
- `cli/lib/evaluate/engine-cli.js`: `runEngineStage` is `async`.
  `spawnStage` spawns the program as a detached child with stdin closed and captures both streams byte for byte up to the 64 MiB bound per stream (a stream past it kills the group and surfaces as an `ENOBUFS` error, as `spawnSync` did).
  `liveStages`, `stopEngineStages(signal, graceMs)` and the `exit` hook are new.
  The record, its neutral forms, the `EngineStageError` messages and `DOCUMENTED_EXITS` are unchanged; a stage that ends with a signal and no exit code still throws `killed by <signal> and reported no exit code`.
  A spawn error for a missing program names `spawn` where it named `spawnSync`.
- `cli/lib/evaluate/workspace.js`: `cleanUpOnSignal` stops the live stages before it aborts the run and calls `onSignal`.
- `cli/lib/evaluate/ci.js`: `engineStageCheck`, `staleBaseline` and `replayPreflight` await the call.
  `checkCheck` takes `invocationScratch(context)` (the replay scratch directory with its owner file, in the private parent) and hands `context.scratch` to `checkEvaluation`.
- `cli/lib/evaluate/check.js`, `release-report.js`: `checkEvaluation` takes an optional `scratch` list, `compileRefusals` makes its directory on it (a list of its own, removed on a signal, when absent), and `checkProbes` and `compileRefusals` are asynchronous.
- `cli/lib/evaluate/score.js`: `runScoreCommand` registers `cleanUpOnSignal` when it makes its own private parent.
- `cli/lib/evaluate/run.js`, `preflight.js`: each call is awaited, and `preflight.js`'s `engineStage` is asynchronous.
- `docs/reference/tea-evaluate-cli.md`: the `ci` section says a signal ends the gate or the stage that is running (naming each stage), `ci` removes its scratch directory and ends by the signal, and that only a SIGKILL of `ci` leaves a gate or stage in its own process group.
  The stage paragraph says the same of `check`, `preflight`, `run`, `score` and `ci`.
- `CHANGELOG.md` has the entry under `[Unreleased]` `Fixed`.
- `epics.md`: the Story 1.92 amendment, and "Parallel lanes" (below).
  `test-design-epic-1.md`: the Story 1.92 amendment and rows for a writing stage, the commands that run a stage and a killed `check` check.
- `ARCHITECTURE-SPINE.md` AD-10 and AD-12 say nothing about how a stage is spawned or how a signal ends it, so neither changed.

### Plan sync

`epics.md` "Parallel lanes" and `sprint-status.yaml` `parallel_lanes` now match the relay's lane table: lane 1 ends `1.109, 1.110, 1.108`, lane 3 ends `1.91, 1.92, 2.6`, lane 2 holds no 1.130 and lane 5 reads `1.115, 1.132, 1.120, 1.116, 1.130, 1.111, 1.114` (both were already true).
Every sentence of `epics.md` that places 1.92 in a lane (`grep -n "1\.92" epics.md`) names lane 3 or says it moved there: the lane lists, the five-lane paragraph, the overlap sentence and the Rebalance paragraph ("1.92 later moved to lane 1, then to lane 3").
A "Lane 3 refill (2026-10-04 evening)" paragraph says why 1.92 moved.
No test or doc counts lane entries yet.

### Tests

- `test/test-evaluate-ci.js`:
  - `an interrupted replay` lost its signal block: the case no longer kills the stage.
  - `a signal while an engine stage runs` hangs a stage with the kill shim (`KILL_HOW=hang`), sends SIGINT and then SIGTERM to `ci` alone and stops no stage itself.
    It asserts `ci` ends by that signal within 30 s, the stage's pid is gone, and neither the private root (`run-<ci pid>-*`) nor the temporary directory (`tea-evaluate-*`) holds an entry.
    Stages: the replay's `score` (with the scratch layout asserted before the signal), `aggregate-strength`, `preflight`, and the stale-baseline `compile` inside `replay`; a plan's `compile` and `seal`; the stale-baseline `compile` after a plan that does not read the baseline; the `check` check's `compile`.
  - `a signal while an engine stage writes` runs the same assertions over the kill shim in `KILL_HOW=write` mode: the stage keeps creating its `--out` directory and filling it, and ignores SIGINT and SIGTERM until the engine stage's own SIGKILL.
    Stages: the replay's `score` and `preflight`, a plan's `compile` and the `check` check's `compile`.
  - `a signal to a command that runs a stage` runs the same two assertions, and that the private parent and temporary entries of the command's own pid are gone, over standalone `check` (a two-interface contract, hanging and writing), `preflight` (a two-interface contract, so the pipeline's own check compiles, and the pipeline's compile, hanging and writing), `run` (the pipeline's compile, hanging and writing) and `score` (hanging and writing).
  - `a killed check check` hangs the `check` check's compile over a two-interface contract, SIGKILLs `ci` and then the stage, finds the compile's directory in the private parent, and asserts the next `ci` over the folder removes the parent.
  - `a process that exits while a stage runs` holds the `exit` hook.
- `test/test-evaluate-compare.js`: the spawn error text reads `spawn <program> ENOENT`.
- Unchanged and passing: `checkEngineStageExits`, the shim-log cases and the boundary rules.

## Revert observations

Each mutation was applied in a scratch copy of the tree (`mut-worker192-<name>` under the session scratch directory, `node_modules` linked), run against the case named, and the copy removed.
The cases only signal processes the case started: the command's child and its stage, by pid.
"Bound" is `SIGNAL_LIMIT_MS`, 30 s.

| Acceptance criterion                                     | Mutation                                                                       | Result                                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: a signal ends `ci` and the stage                      | `runEngineStage` calls `spawnSync` for every stage                             | `a signal while an engine stage runs`: `replay-score, SIGINT: the command was still running 30000 ms after the signal`; the case stops the stage afterwards.                                                  |
| 1: the stage's process is gone                           | `cleanUpOnSignal` does not stop the live stages                                | `replay-score, SIGINT: the score stage outlived the command`.                                                                                                                                                 |
| 1: the scratch directory is gone                         | `ci`'s handler no longer calls `removeScratch`                                 | `replay-score, SIGINT left ["run-<pid>-..."] under /tmp/tea-evaluate-p501`.                                                                                                                                   |
| 1: the handler stops the stage before it removes scratch | `cleanUpOnSignal` stops the stages after `onSignal` (the order before round 1) | `a signal to a command that runs a stage`: `standalone-preflight-write, SIGTERM left ["run-<pid>-..."] under /tmp/tea-evaluate-p501`. The `ci` cases over the writing stage fail in part of the runs (below). |
| 2: `seal` (plan check)                                   | only `seal` goes through `spawnSync`                                           | `plan-seal, SIGINT: the command was still running 30000 ms after the signal`.                                                                                                                                 |
| 2: `compile` (plan check)                                | only the plan check's `compile` goes through `spawnSync`                       | `plan-compile, SIGINT: the command was still running 30000 ms after the signal`.                                                                                                                              |
| 2: the stale-baseline compile                            | only the stale-baseline compile goes through `spawnSync`                       | `replay-compile, SIGINT: the command was still running 30000 ms after the signal`.                                                                                                                            |
| 2: the replay's `preflight`                              | only `preflight` goes through `spawnSync`                                      | `replay-preflight, SIGINT: the command was still running 30000 ms after the signal`.                                                                                                                          |
| 2: the replay's `score`                                  | only `score` goes through `spawnSync`                                          | `replay-score, SIGINT: the command was still running 30000 ms after the signal`.                                                                                                                              |
| 2: `aggregate-strength`                                  | only `aggregate-strength` goes through `spawnSync`                             | `replay-aggregate-strength, SIGINT: the command was still running 30000 ms after the signal`.                                                                                                                 |
| 2: the `check` check's compile                           | only `compileRefusals`'s call goes through `spawnSync`                         | `check-check, SIGINT: the command was still running 30000 ms after the signal`.                                                                                                                               |
| `score` removes its private parent                       | `runScoreCommand` registers no `cleanUpOnSignal`                               | `a signal to a command that runs a stage`: `standalone-score-hang, SIGINT: the score stage outlived the command`.                                                                                             |
| `check` removes its compile's directory                  | `compileRefusals` registers no `cleanUpOnSignal` when it owns its list         | `standalone-check, SIGINT: the compile stage outlived the command`.                                                                                                                                           |
| a killed `check` check is reclaimed                      | `checkCheck` makes the private parent and no owner file                        | `a killed check check`: `a killed ci left [...]` (no replay scratch directory with an owner file in the parent).                                                                                              |
| the `check` check's directory is in the private parent   | `checkCheck` hands over no scratch list                                        | `a killed check check`: `the check check made no directory in the private parent`.                                                                                                                            |
| the process that exits                                   | the `exit` hook removed                                                        | `a process that exits while a stage runs`: `the stage outlived the process that ran it`.                                                                                                                      |
| 3: every exit passes through verbatim                    | the stage's exit 4 returned as 5                                               | `engine stage exits`: `compile: exit 5 (runtime fault), block` where exit 4 is expected.                                                                                                                      |
| 3: every stream passes through verbatim                  | the returned stdout gains one character                                        | `engine stage exits`: the check's persisted `stdout` is not the direct CLI run's.                                                                                                                             |
| 4: `ci.js` reaches eval-quality only through the wrapper | `ci.js` calls `aggregateStrength` on the loaded engine                         | `test:evaluate-boundaries`: `cli/lib/evaluate/ci.js:773 [engine-stage] names "aggregateStrength"`.                                                                                                            |

What fails if someone reverts this: any caller that goes back to a synchronous call leaves the command running with its stage (the bound), a handler that stops the stage after it removes the scratch leaves `run-<pid>-*` behind whenever the stage is writing, a handler that skips the removal leaves the private parent, and a command without `cleanUpOnSignal` leaves its stage or its directory.
Reverting the whole story fails `a signal while an engine stage runs` at its first stage.

### Flakiness

The writing cases ran in a scratch copy of the tree and again with the order of the handler reversed.
Round 1 ran them 10 times each; the reversed order failed `an engine stage writes` 4 times of 10, because the shim died on SIGINT or SIGTERM before it recreated anything.
Round 2 made the shim in `KILL_HOW=write` mode ignore SIGINT and SIGTERM, so only the engine stage's own SIGKILL after the grace ends it, and ran each case 5 times:

| Tree                         | Case (`--only=`)              | Runs of 5 |
| ---------------------------- | ----------------------------- | --------- |
| Final tree                   | `an engine stage writes`      | 5 pass    |
| Final tree                   | `a command that runs a stage` | 5 pass    |
| Handler stops the stage last | `an engine stage writes`      | 5 fail    |
| Handler stops the stage last | `a command that runs a stage` | 5 fail    |

`a killed check check` passed 10 times of 10 in round 1.

## Gates

Run one evaluate suite at a time.
The machine ran at a load average of 60 to 80 from other lanes, so the suites ran long.

- The final tree (round 1): `test:evaluate-ci` (333 s, 41 cases: the round-1 build had 39, `a signal to score while its stage runs` became `a signal to a command that runs a stage`, and `a signal while an engine stage writes` and `a killed check check` are new), `test:evaluate-boundaries` (500 checks), `-preflight` (353), `-run` (594), `-aggregate` (142), `-held-inputs` (210), `-held-attempts` (462), `-compare`, `-confinement` and `-check` (1290), all exit 0.
  The repository has no `test:evaluate-score` script: `score` runs in the `run`, `aggregate`, `held-inputs` and `held-attempts` groups.
- The first build (before round 1): the same suites passed, `test:evaluate-arms` (733), `-pr-mcp`, two `-ci-repositories` scripts included.
  The first `test:evaluate-ci` run of that build failed once in `an interrupted replay` on `run-<pid>-otherfol`, a directory another lane's `test:evaluate-ci` planted in the shared `/tmp/tea-evaluate-p501`; the rerun passed.
- `test:doc-counts`, `test:doc-claims`, `docs:validate-links`, `lint`, `lint:md` and `format:check` pass over the final tree.

## Review

Round 1: two lenses, 5 and 3 findings (the order of the signal, scratch left by `ci`'s live checks, standalone `score` and `check`, the `check` check's owner file, prose and plan-sync wording); all fixed in this pull request.
Round 2: two lenses, 3 and 1 findings (the writing coverage attributed to the wrong case, the dropped guard's prose, two `workspace.js` comments, the writing shim that died on the signal); all fixed in this pull request.
No story was filed.
