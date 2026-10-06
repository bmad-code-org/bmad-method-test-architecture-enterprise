---
title: 'Story 1.92: Stop tea-evaluate ci at once on a signal while an engine stage runs'
type: 'feature'
created: '2026-10-06'
baseline_commit: '15f1232e'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
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

**Approach:** The stage is an asynchronous child that leads a process group of its own, and every live stage sits on one list in `engine-cli.js`, which keeps a guard on the interrupting signals while the list is not empty: the guard stops the list and ends the process by the signal, after `ci`'s own handler has removed the scratch directory.

## The design choice

Three designs were open.

| Design                                                                                               | Result                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) One registry in `engine-cli.js`, `runEngineStage` asynchronous for every caller                  | Chosen. One module owns the child and its end. No signature of `score.js`, `preflight.js`, `run.js` or `check.js` carries a `context.children`.                                                                                                                                                |
| (b) Thread `context.children` through every caller so `stopChildren` reaches the stage               | Needs `ci.js`'s context in `runScoreCommand`, `runPreflightCommand`, `runRunCommand`, `checkEvaluation` and `compileRefusals`, so the engine-stage list would live in five public signatures, and a command run outside `ci` would still have no way to end its stage.                         |
| (c) Keep a synchronous variant for the in-process `run`, `score` and `preflight` a live check drives | A `ci` signal reaches them all: the replay's `score` and `aggregate-strength` come through `runScoreCommand`, a live check's `run`, `score` and `preflight` run in the `ci` process, and the `check` check's compile runs through `checkEvaluation`. Every one of those would keep the defect. |

The callers a `ci` signal reaches were measured by reading each call site.

| Call site                                                              | Reached from `ci` by                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `ci.js` `engineStageCheck` (`compile`, `seal`)                         | the plan's `compile` and `seal` checks                          |
| `ci.js` `staleBaseline`                                                | `applyStaleness` of a baseline-reading check, `tierBaseline`    |
| `ci.js` `replayPreflight`                                              | the `replay` check                                              |
| `score.js` `scoreProbe` and the aggregate call                         | the `replay`, `gameability` and live checks                     |
| `run.js` `scoreAttempt`                                                | the live `run` of `twin-run`, `held-out`, `strength-comparison` |
| `preflight.js` `engineStage` (`compile`, `seal`, `preflight`)          | the `preflight-live` check and every live run                   |
| `release-report.js` `compileRefusals` through `check.js` `checkProbes` | the `check` check                                               |

All seven are awaited now, so there is no synchronous variant.
`compileRefusals`, `checkProbes` and `preflight.js`'s `engineStage` became asynchronous; the others were already inside asynchronous code.

A stage that leads its own process group does not receive a Ctrl-C of the terminal's foreground group any more, which the synchronous, same-group child did.
A command with no signal handler of its own (`score`, `run`, `check`) would then leave the stage running.
`engine-cli.js` therefore installs a guard on SIGINT, SIGTERM, SIGHUP and SIGQUIT while at least one stage is live, and removes it when the list is empty.
The command's own handler is registered earlier and runs first; when the guard is the only listener left, it stops the stages and raises the signal again with the default action restored, so the command ends by the signal.
A process that ends through `process.exit` kills the live groups from an `exit` hook.

## What changed

- `cli/lib/evaluate/process-group.js` is new: `signalGroup` and `sleepSync` moved out of `ci.js`, and `stopGroups` (signal each group, wait the grace, SIGKILL each, empty the set).
  `ci.js` `stopChildren` is one call to it.
- `cli/lib/evaluate/engine-cli.js`: `runEngineStage` is `async`.
  `spawnStage` spawns the program as a detached child with stdin closed and captures both streams byte for byte up to the 64 MiB bound per stream (a stream past it kills the group and surfaces as an `ENOBUFS` error, as `spawnSync` did).
  `liveStages`, `stopEngineStages(signal, graceMs)` (used by the guard), the signal guard and the `exit` hook are new.
  The record, its neutral forms, the `EngineStageError` messages and `DOCUMENTED_EXITS` are unchanged; a stage that ends with a signal and no exit code still throws `killed by <signal> and reported no exit code`.
  A spawn error for a missing program names `spawn` where it named `spawnSync`.
- `cli/lib/evaluate/ci.js`: the signal handler is unchanged and runs first (it stops the gates' groups and removes the scratch directory); the guard then stops the stage and ends `ci` by the signal. `engineStageCheck`, `staleBaseline` and `replayPreflight` await the call.
  The `check` check makes the invocation's private parent and hands `context.scratch` to `checkEvaluation`.
- `cli/lib/evaluate/check.js`, `release-report.js`: `checkEvaluation` takes an optional `scratch` list, `compileRefusals` makes its directory on it (a list of its own when absent), and `checkProbes` and `compileRefusals` are asynchronous.
- `cli/lib/evaluate/score.js`, `run.js`, `preflight.js`: each call is awaited, and `preflight.js`'s `engineStage` is asynchronous.
- `docs/reference/tea-evaluate-cli.md`: the `ci` section says a signal ends the gate or the stage that is running, `ci` removes its scratch directory and ends by the signal, and that only a SIGKILL of `ci` leaves a gate or stage in its own process group.
  The stage paragraph says the same of every command that runs a stage.
- `CHANGELOG.md` has the entry under `[Unreleased]` `Fixed`.
- `epics.md`: the Story 1.92 amendment, and "Parallel lanes" (below).
  `test-design-epic-1.md`: the Story 1.92 amendment and a row for the command with no handler.
- `ARCHITECTURE-SPINE.md` AD-10 and AD-12 say nothing about how a stage is spawned or how a signal ends it, so neither changed.

### Plan sync

`epics.md` "Parallel lanes" and `sprint-status.yaml` `parallel_lanes` now match the relay's lane table: lane 1 ends `1.109, 1.110, 1.108`, lane 3 ends `1.91, 1.92, 2.6`, lane 2 holds no 1.130 and lane 5 reads `1.115, 1.132, 1.120, 1.116, 1.130, 1.111, 1.114` (both were already true).
Every sentence that placed 1.92 in lane 1 or lane 2 was updated, and a "Lane 3 refill (2026-10-04 evening)" paragraph says why 1.92 moved.
No test or doc counts lane entries yet.

### Tests

- `test/test-evaluate-ci.js`:
  - `an interrupted replay` lost its signal block: the case no longer kills the stage.
  - `a signal while an engine stage runs` hangs a stage with the kill shim (`KILL_HOW=hang`), sends SIGINT and then SIGTERM to `ci` alone and stops no stage itself.
    It asserts `ci` ends by that signal within 30 s, the stage's pid is gone, and neither the private root (`run-<ci pid>-*`) nor the temporary directory (`tea-evaluate-*`) holds an entry.
    Stages: the replay's `score` (with the scratch layout asserted before the signal), `aggregate-strength`, `preflight`, and the stale-baseline `compile` inside `replay`; a plan's `compile` and `seal`; the stale-baseline `compile` after a plan that does not read the baseline; the `check` check's `compile`.
  - `a signal to score while its stage runs` holds `score`, which has no handler, to the same end.
  - `a process that exits while a stage runs` holds the `exit` hook.
- `test/test-evaluate-compare.js`: the spawn error text reads `spawn <program> ENOENT`.
- Unchanged and passing: `checkEngineStageExits`, the shim-log cases and the boundary rules.

## Revert observations

Each mutation was applied in a scratch copy of the tree (`mut-worker192-<name>` under the session scratch directory, `node_modules` linked), run against the suite named, and the copy removed.
The cases only signal processes the case started: the `ci` child and its stage, by pid.

| Acceptance criterion                                     | Mutation                                                 | Result                                                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: a signal ends `ci` and the stage                      | `runEngineStage` calls `spawnSync` for every stage       | `a signal while an engine stage runs`: `replay-score, SIGINT: ci was still running 15000 ms after the signal` (the bound was 15 s then, 30 s now); the case stops the stage afterwards. |
| 1: the scratch directory is gone                         | `ci`'s handler no longer calls `removeScratch`           | `replay-score, SIGINT left ["run-<pid>-..."] under /tmp/tea-evaluate-p501`.                                                                                                             |
| 1: the stage's process is gone                           | the guard is not installed                               | `replay-score, SIGINT: the score stage outlived ci`; `a signal to score while its stage runs`: `SIGINT: the score stage outlived the command`.                                          |
| 2: `seal` (plan check)                                   | only `seal` goes through `spawnSync`                     | `plan-seal, SIGINT: ci was still running 30000 ms after the signal`.                                                                                                                    |
| 2: `compile` (plan check)                                | only the plan check's `compile` goes through `spawnSync` | `plan-compile, SIGINT: ci was still running 30000 ms after the signal`.                                                                                                                 |
| 2: the stale-baseline compile                            | only the stale-baseline compile goes through `spawnSync` | `replay-compile, SIGINT: ci was still running 30000 ms after the signal`.                                                                                                               |
| 2: the replay's `preflight`                              | only `preflight` goes through `spawnSync`                | `replay-preflight, SIGINT: ci was still running 30000 ms after the signal`.                                                                                                             |
| 2: the replay's `score`                                  | only `score` goes through `spawnSync`                    | `replay-score, SIGINT: ci was still running 30000 ms after the signal`.                                                                                                                 |
| 2: `aggregate-strength`                                  | only `aggregate-strength` goes through `spawnSync`       | `replay-aggregate-strength, SIGINT: ci was still running 30000 ms after the signal`.                                                                                                    |
| 2: the `check` check's compile                           | only `compileRefusals`'s call goes through `spawnSync`   | `check-check, SIGINT: ci was still running 30000 ms after the signal`.                                                                                                                  |
| 2: the `check` check's directory                         | `checkCheck` no longer hands `context.scratch` over      | `check-check, SIGINT left ["tea-evaluate-check-..."] behind` in the temporary directory.                                                                                                |
| the process that exits                                   | the `exit` hook removed                                  | `a process that exits while a stage runs`: `the stage outlived the process that ran it`.                                                                                                |
| 3: every exit passes through verbatim                    | the stage's exit 4 returned as 5                         | `engine stage exits`: `compile: exit 5 (runtime fault), block` where exit 4 is expected.                                                                                                |
| 3: every stream passes through verbatim                  | the returned stdout gains one character                  | `engine stage exits`: the check's persisted `stdout` is not the direct CLI run's.                                                                                                       |
| 4: `ci.js` reaches eval-quality only through the wrapper | `ci.js` calls `aggregateStrength` on the loaded engine   | `test:evaluate-boundaries`: `cli/lib/evaluate/ci.js:776 [engine-stage] names "aggregateStrength"` (1 of 501 checks fail in the copy).                                                   |

What fails if someone reverts this: any caller that goes back to a synchronous call leaves `ci` running with its stage (the 30 s bound), a handler that drops the scratch removal leaves `run-<pid>-*` or `tea-evaluate-check-*` behind, and a guard removed leaves the stage running after the command ended by the signal.
Reverting the whole story fails `a signal while an engine stage runs` at its first stage.

## Gates

Run one evaluate suite at a time on the final tree unless noted.
The machine ran at a load average of 60 to 80 from other lanes, so the suites ran long.

- Before the last edit (the explicit `stopEngineStages` call in `ci.js`'s handler was dropped, since the guard that runs right after the handler does the same and no case could tell them apart): `test:evaluate-boundaries` (500 checks), `-check` (1290), `-compare`, `-preflight` (353), `-run` (594), `-aggregate` (142), `-held-inputs` (210), `-held-attempts` (462), `-confinement` (2017), `-arms` (733), all exit 0; `test:evaluate-ci` passed (331 s, 39 cases).
  The first `test:evaluate-ci` run failed once in `an interrupted replay`: `a killed preflight stage left a private parent behind: run-<pid>-otherfol`, a directory another lane's `test:evaluate-ci` planted in the shared `/tmp/tea-evaluate-p501` while it ran.
  The rerun passed, as the relay's machine-load rule says.
- The final tree (the one the pull request carries, apart from the story record and the sprint row): `test:evaluate-ci` (332 s, 39 cases, including `a signal while an engine stage runs` 16 s, `a signal to score while its stage runs` 2 s and `a process that exits while a stage runs` 2 s), `test:evaluate-boundaries` (500 checks), `test:evaluate-pr-mcp`, `test:evaluate-ci-repositories:tagged-release-pr`, `test:evaluate-ci-repositories:nightly-deploy-merge` (a live `merge` tier through `ci`), `test:evaluate-preflight` (353 checks) and `test:evaluate-check` (1290 checks), all exit 0.
- `test:doc-counts`, `test:doc-claims`, `docs:validate-links`, `lint`, `lint:md` and `format:check` pass over the final tree.
