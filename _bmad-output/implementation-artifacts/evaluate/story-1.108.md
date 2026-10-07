---
title: 'Story 1.108: Compile and seal each partition view in ci'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: '161b434bca8c74496983b7c827ec13cbf768ded7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.108)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.108)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-5, AD-10, AD-22)'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.51.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.92.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.109.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.110.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.108 to lane 1">

## Intent

**Problem:** The `compile` and `seal` checks of the `pr` tier ran over `contract.json`, the development view, for every plan.
An engine refusal of the held-out plan surfaced only at a held-out or both preflight, which a pull request does not run, and `check` compiles nothing because `test:evaluate-boundaries` forbids an in-process compile under `cli/`.

**Approach:** Under a `partitionPlan` each of the two checks runs its engine stage over the development, held-out and both views.
A derived view's bytes come from `loadContractView`, as the stale-baseline compile derives them, and are staged in a directory of the invocation's scratch list.
The stage is the engine CLI as an asynchronous child (`runEngineStage`), so the signal handling of Story 1.92 covers every extra stage.

## Boundaries & Constraints

**Always:** A folder with no `partitionPlan`, and one whose `evaluation.json` cannot be read (the `check` check's finding), runs each stage once over `contract.json`, writes the evidence paths it always wrote and prints what the engine printed, so no committed fixture, baseline or replay changes a byte.
The development view is the folder's own `contract.json`, so the held-out plan is read only for the held-out and both views.
The row's exit is the most severe of the views' exits (`mostSevere`), so the engine's exit class reaches `ci` unchanged.
What the engine says about the held-out or both view stays in that view's `engine.json`; the check's own stdout and stderr, the development view's files and the console carry no held-out ID.
A view that cannot be derived is a finding of that view (exit 10, the same class `check` uses for the plan's defects), its stage does not run, and every other view still runs.

**Never:** Compile in-process under `cli/` (AD-1).
Compare anything the engine owns: whether a refused view is sealed is eval-quality's rule, and TeA gates nothing on it.
Add a field to `ci.json` or a TeA schema.

## I/O & Edge-Case Matrix

| Scenario                                     | Input / State                                                                              | Expected Output / Behavior                                                                                                                          | Error Handling                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Held-out oracle the engine refuses           | O-101's direction polarity disagrees with its polarity; `check` accepts the plan           | Development compiles and seals; held-out and both exit 4 with a record and no artifact; rows exit 4                                                 | Engine exit passes through                        |
| Development-only oracle the engine refuses   | O-002's direction polarity disagrees with its polarity                                     | Development and both exit 4; held-out compiles and seals                                                                                            | Engine exit passes through                        |
| View compiles, cannot be sealed              | O-101 with empty `evidenceTargets`                                                         | `compile` exits 0 with an artifact per view; `seal` exits 5 for held-out and both                                                                   | Engine exit passes through                        |
| Plan holds one of the two checks             | A `seal` entry alone, or a `compile` entry alone                                           | The check runs over each view; the other check leaves no evidence                                                                                   | N/A                                               |
| View cannot be derived                       | Held-out plan absent, unparsable or off its shape; `contract.json` unparsable              | A finding of the held-out and of the both view naming the plan's path and `contract.json` and no byte of either, exit 10; the development view runs | Exit 10 (the engine's 5 outranks it for contract) |
| No `partitionPlan`                           | The committed verdict fixture                                                              | One compile and one seal over `contract.json`; `checks/<id>/{engine.json,<artifact>,exit-code,stdout,stderr}` only; empty stdout                    | N/A                                               |
| Engine exit 4, 5, 64 or an undocumented exit | A substituted engine under a plan                                                          | One call per view; the row's exit is the engine's (12 for an undocumented one) and every view's record is listed                                    | Class from AD-10's table                          |
| Signal during the held-out view's stage      | SIGINT or SIGTERM while that stage hangs or writes                                         | `ci` ends by the signal, the stage's process is gone, no private parent or scratch entry remains                                                    | Story 1.92 machinery                              |
| Development command beside held-out evidence | All eight held-out evidence files of a `ci` run made a FIFO, unreadable or a dangling link | `check`, `preflight`, `run`, `score` and `ci` of the development partition pass and print no held-out ID                                            | N/A                                               |

</frozen-after-approval>

## Premise Check

What the code and the engine hold, read and run before the build.

1. **The stages.** `engineStageCheck` (`cli/lib/evaluate/ci.js`) called `runEngineStage` over `<folder>/contract.json` for every plan.
   `seal` takes the same `--in` contract as `compile`, not the compiled one.
2. **The view derivation.** `loadContractView({ folder, evaluation, partition }).bytes` is a derived view's bytes; the development partition returns `contract.json`'s bytes and never reads the plan.
   `staleBaseline` stages the bytes with `stagingDirectory` and compiles them, which the new code reuses.
3. **Evidence paths.** The development view keeps `checks/<id>/engine.json` and the artifact beside it; the other two views write the same file names under `checks/<id>/held-out/` and `checks/<id>/both/`, which leaves every development path byte-identical.
4. **No `partitionPlan`.** One compile and one seal over `contract.json` at the committed paths, which `checkStageEvidencePaths` reads from a fresh `pr` run over the committed verdict fixture. The committed baselines and their replay do not hold those paths, so `test:evaluate-ci`, `test:eval-replay` and `test:evaluate-ci-repositories` ran with no change and a second evidence path fails `checkStageEvidencePaths` alone.
5. **Does the engine seal what it refuses to compile?** It does not.
   `eval-quality-facts.md` records that sealing always recompiles first (`src/application/seal.ts:22`), and the runs agree: for each view the engine refused at compile (polarity mismatch, an operation the interface does not declare, an interface the contract does not declare, an unknown operator, an empty `all`, a pointer to a step the view lacks) `seal` exited with the same code.
   `seal` also refuses what `compile` accepts (an oracle with empty `evidenceTargets`: compile 0, seal 5), so the two stages are not the same refusal.
   Because the engine already never seals a view it does not compile, no gate on the compile result was built; TeA would only restate a rule the engine owns (AD-1), and a gate could be exercised only through a substituted engine.
6. **A real refusal exists.** `check` accepts a held-out oracle whose `direction.polarity` disagrees with its `polarity`, and eval-quality refuses the held-out and both views at compile (exit 4, `direction-check-misaligned`) while the development view compiles.
   Other defects `check` passes and the engine refuses: an interface or operation the contract does not declare (exit 4) and empty `evidenceTargets` at seal (exit 5).
   The AC's case runs over the real engine; the shim cases of `checkEngineStageExits` stay as they were.
7. **Tiers.** `compile` and `seal` are deterministic checks that need no secret, and the plan refuses them off `pr` (`deterministic-off-pr`), so no `release` row holds them and no release-tier case exists.
   The stale-baseline rule reads only the checks that read `baseline/`, which these two do not.

AC amendments, recorded in `epics.md` and `test-design-epic-1.md`: the criteria hold as written.
The amendment states the evidence layout, the exit rule, that the engine refuses to seal a view it refuses to compile, the derivation finding and the held-out content's place.

## Code Map

- `cli/lib/evaluate/ci.js` -- `stageViews(context)` (the views a stage runs over: `contract.json` alone for a plan-free folder, otherwise development, held-out and both, each with a `file` or a `problem`; memoized per invocation through `context.once`) and `engineStageCheck` (one `runEngineStage` per view, the record at `checks/<id>[/<view>]/engine.json`, the artifact copied beside it when the engine wrote one, stdout naming each view and its exit, the development view's own streams passed through, `mostSevere` over the exits, an `EngineStageError` of one view recorded as exit 12 for that view).
  Derived views are staged by `stagingDirectory`, so a signal or the end of the run removes them with the rest of the invocation's scratch.
- `cli/lib/evaluate/check.js` -- the comment on the held-out view names the `ci` checks.
- `test/test-evaluate-partition-plans-attempts.js` -- the Story 1.108 block (`assertStageViews` over a refused held-out oracle, the one-check plans, the mirror, the unsealable oracle, the sound plan, four views that cannot be derived, an unreadable `evaluation.json`, and the development commands beside unreadable held-out evidence).
- `test/test-evaluate-partition-plans.js` -- the held-out baseline replay lists each view's compiled contract and sealed brief.
- `test/test-evaluate-ci.js` -- `checkStageEvidencePaths` (plan-free), `checkStageViewExits` (substituted engine over three views, and the streams), the signal cases over the held-out view's stage (`arg` makes the kill shim hang the first stage whose input is a staged view), and `COPIES`, the committed fixtures plus the partition-plan fixture.
- `tools/test-shard-weights.json` -- the weights are the CI timings of the run on this branch (see Review Round 1, finding 6).
- `docs/reference/tea-evaluate-cli.md`, `src/workflows/testarch/bmad-testarch-evaluate/references/corpus.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**

- [x] `ci.js` -- view-aware `compile` and `seal`
- [x] Cases: the AC case over real eval-quality, one check of two, the mirror, an unsealable oracle, a sound plan, views that cannot be derived, plan-free paths, substituted exits and streams, signals, development commands beside held-out evidence
- [x] Docs (reference, skill corpus guide through `/bmad-workflow-builder` Edit headless and Analyze), CHANGELOG, epics and test-design amendment, sprint row `review`
- [x] Revert each acceptance check once and record the observation, and the mutant table

**Acceptance Criteria:**

- Given a held-out plan whose oracle the engine refuses at compile, when `tea-evaluate ci --tier pr` runs, then `compile` and `seal` run once for each view, name the refused view with the engine's exit and its evidence, write the compiled contract and the sealed brief for each view that compiles and none for a view that does not.
- Given a plan with no `partitionPlan`, then each check runs once with the evidence paths it had.
- Given a check that compiles only `contract.json`, then the broken plan passes and the case fails; given a second evidence path for a plan with no `partitionPlan`, then the committed-fixture case fails.

## Implementation Notes

- The layout keeps every development path as it was and adds `held-out/` and `both/` directories beside it, so a reader of a plan with no `partitionPlan` sees no change.
- The check's stdout holds one line per view (`compile over the held-out view: eval-quality exited 4; its record is runs/<id>/checks/compile/held-out/engine.json`), so the console summary names the refused view and its evidence without printing a byte the engine said, which can quote the held-out plan.
  The engine's streams of the development view pass through as the check's own (an empty stdout for a real engine), and the streams of the other two views are in their records.
- A view that cannot be derived prints `<view> view: [partition-plan] <message>; <stage> did not run over the <view> view`.
  A `PartitionPlanError` message names paths only; any other error is named by its class (`an unexpected TypeError while deriving it`), since its text can quote a file.
- An `evaluation.json` that cannot be read is `check`'s finding, and the stages compile `contract.json` once, as before.
- A `contract.json` that does not parse leaves the development view to the engine (exit 5) and the other two views underivable (exit 10); the row's exit is 5 because the engine's exit outranks 10 in `mostSevere`.
- The `check` row of such a folder prints the parse error, which quotes the contract's own bytes; that is the existing behavior of `check` and the case scans the stage rows' stdout alone for this variant.
- A held-out view compiles from the held-out plan's content, so a clean run leaves that content in `checks/<id>/held-out/eval-contract.json` and `both/`.
  `corpus-index.json` indexes `corpus/`, `probes/` and `mutations/` alone, `check` reads named files, and the target's workspace excludes the evaluation folder, so no development command reads another invocation's directory under `runs/`, or the held-out evidence of a `ci` invocation (`score --run` reads its own run's directory, and `run` and `preflight` write theirs).
  The case that pins it makes all eight held-out evidence files of the `ci` invocation (the engine record and the compiled contract or sealed brief of each of the two views, for each of the two checks) a FIFO, unreadable or a dangling link after a replayed development baseline, asserts that those are every file under `held-out/` and `both/`, and runs the development commands over them.
- The signal cases use the kill shim with `KILL_ARG=tea-evaluate-view-`, which matches only a stage whose `--in` is a staged view, so with `KILL_ONCE` the held-out view's stage is the one that hangs or writes.
- A real run of three views costs two more engine calls per check (`compile` and `seal` about half a second each).

## Revert Observations

Each acceptance check was undone once in a scratch copy of the tree (`mut-1.108-build-a1`, `node_modules` linked, one change per mutant), over the trimmed Story 1.108 block of `test-evaluate-partition-plans-attempts.js` or the named `test-evaluate-ci.js` cases.

| Revert                                                                                           | What the case observed                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile and seal only `contract.json` (M1)                                                       | The first case fails: the `ci` run over the polarity-refused held-out oracle exits 0 where the engine's 4 is expected.                                                                |
| A second evidence path for a folder with no `partitionPlan` (M2, plan-free under `development/`) | `checkStageEvidencePaths` and the existing `checkEngineStageExits` fail on the row's evidence paths.                                                                                  |
| A plan-free folder takes the view path (M23)                                                     | `checkStageEvidencePaths` fails: the stdout is not the engine's own (empty).                                                                                                          |
| Seal a view the engine refused (M3: `seal` over `contract.json` for every view)                  | The AC case fails: the held-out and both seals exit 0 where the engine exits 4, and a sealed brief appears for a refused view. The engine owns the rule, so no gate exists to remove. |

## Mutant table

Every new check, rule and branch was reverted or broken once in a scratch copy and every mutant failed a case.
M27 and M28 survived the first pass (the development view's streams passed through, which the real engine never fills) and gained the substituted-engine streams case.
M16 (the memo of `stageViews`) is equivalent: compile and seal derive identical bytes, so the claim "derived once" is left out of every comment.

| Mutant                                                     | Case that failed                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| M1: no views, `contract.json` only                         | the AC case: exit 0 where 4                                                 |
| M2: plan-free evidence under `development/`                | `checkStageEvidencePaths`, `checkEngineStageExits`                          |
| M3: seal runs over `contract.json` for every view          | the AC case                                                                 |
| M4: an underivable view is skipped silently                | the underivable cases                                                       |
| M5: an underivable view exits 64                           | the underivable cases (row exit 10 expected)                                |
| M6: a derivation failure aborts the check                  | the unparsable plan case: the development view must still run               |
| M7: the development view reads the held-out plan           | the unparsable plan case                                                    |
| M8: the row exit is the first view's                       | the AC case                                                                 |
| M9: the row exit is the last view's                        | the unparsable contract case (5 expected, 10 given)                         |
| M10: held-out streams join the check's files               | the development-evidence scan and the streams case                          |
| M11: the both view is skipped                              | the AC case: the both record is missing                                     |
| M12: the held-out view is skipped                          | the AC case: the held-out record is missing                                 |
| M13: every view records at the development path            | the AC case (a record is written twice)                                     |
| M14: an engine stage error aborts the check                | `checkStageViewExits`: one call per view expected                           |
| M15: a stage error lists no record                         | `checkStageViewExits`: the row's files                                      |
| M17: the row exit is the numerically largest               | the unparsable contract case                                                |
| M19: an unreadable `evaluation.json` is treated as planned | the unreadable-evaluation case                                              |
| M20: the stdout names no view                              | the AC case                                                                 |
| M22: the corpus index reads `runs/`                        | the development commands beside unreadable held-out evidence                |
| M25: a raw error message is printed for a view             | the off-shape plan case                                                     |
| M26: a derived view is staged outside the scratch list     | `checkSignalEndsStage`: the held-out view's staging directories stay behind |
| M27: the development view's stdout is dropped              | `checkStageViewExits` streams case                                          |
| M28: the development view's stderr is dropped              | `checkStageViewExits` streams case                                          |

## Review Round 1

Three Opus lenses (blind, edge case, verification gap) reviewed 2b6d21b3 and reproduced twelve defects.
Each finding was checked against the code before an edit.

| #   | Finding                                                                                                                | Verdict | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A mixed-exit row cannot fail: every tested combination put the most severe exit first or applied one exit to all views | Valid   | A real-engine fixture mixing a refused development oracle with an unsealable held-out oracle (`seal` exits 4, 5 and 4, row 5; `compile` 4, 0 and 4), a substituted engine that fails only the staged views (kill shim with `KILL_ARG`), a per-input shim (development 4, staged views 64, row 64) and the staged views' undocumented exit beside a development view that ran. The docblock and the test-design row claim only what these hold.                                                                                                                                                                                               |
| 2   | A staged view that cannot be written was reported as an authoring defect                                               | Valid   | `stageViews` keeps only `loadContractView` in the derivation `try`; a failure to make the staging directory or write the file is exit 12 for that view with the error code, as the `EngineStageError` branch is. A preload that makes writes below `tea-evaluate-view-` fail with ENOSPC pins it.                                                                                                                                                                                                                                                                                                                                            |
| 3   | A view's summary line was glued onto engine output with no final newline                                               | Valid   | The summary lines come first, each newline-terminated, and the development view's streams follow, so its bytes stay exact and last; the faults on stderr come before the development stderr. The streams case asserts every view's line with the `m` flag, and a per-input shim holds the faults and the exact tail.                                                                                                                                                                                                                                                                                                                         |
| 4   | A FIFO `contract.json` made `ci` ignore SIGINT and SIGTERM, and `check` hang                                           | Valid   | `readRegularFile` (`partition.js`) opens without blocking (a link is followed, as before) and checks the descriptor. `loadContractView` turns a non-regular file into a `PartitionPlanError` that names `contract.json`; `loadBothViewDesignation`, `check.js` (`readJsonFile`, which reports `is not a regular file`), `preflight.js` (`readJson`, which the judge calibration check and every manifest read use) and `records-calibration.js` read through it. `staleBaseline` and the twin-run read go through `loadContractView`, so they are covered; the development view is left to the engine child, which the signal handler kills. |
| 5   | The record said the stale-baseline compile writes held-out content under `runs/`                                       | Valid   | The clause is gone: `staleBaseline` keeps only `baseline-staleness/engine.json`. The record credits what writes held-out content, the held-out and both views' compiled contracts.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6   | The shard weights were local seconds and the file holds CI seconds                                                     | Valid   | The weights file is refreshed from the timings of CI run 37583753246 (`gh run download`, `jq -S -s add`): `test:evaluate-ci` 646.9 s, `test:evaluate-partition-plans-attempts` 393.7 s, `test:evaluate-partition-plans` 455.3 s. Before this PR CI measured 576.6 s and 588.9 s for the first two, so the story added about 60 s. The heaviest shard by the new weights is 955.6 s (one script) against the 1200 s cap, which is unchanged.                                                                                                                                                                                                  |
| 7   | Skill reference edits owed beyond `SKILL.md`                                                                           | Valid   | One sentence in `contract.md` (Compile and seal) and a pointer to it in `adapters.md`, `run.md` and `gaps.md` say that under a `partitionPlan` `eval-quality compile` and `eval-quality seal` cover the development view alone and that `ci --tier pr` and the first `--partition held-out` preflight or `run` with no `--partition` compile the others; `corpus.md` names the same two triggers. Builder Analyze over the delta (`.analysis/2026-10-07-r108-r1/`): 0 critical, 0 high, 5 medium, 4 low, all fixed. The skip holds for `SKILL.md` alone.                                                                                     |
| 8   | A revert claim no case holds: a second evidence path changes the committed replay                                      | Valid   | A mutant that also copies the record to `checks/<id>/development/engine.json` passes `test:eval-replay`, the `pr` replay and the `-pr` repository suites and fails `checkStageEvidencePaths`. The test docstring, the test-design row, the `epics.md` acceptance criterion and premise item 4 say so.                                                                                                                                                                                                                                                                                                                                        |
| 9   | The underivable-view finding named no file                                                                             | Valid   | `heldOutPlanName` (`partition.js`) returns the plan path when it has the schema's shape and `the partitionPlan of evaluation.json` otherwise, and the finding reads `<plan> and contract.json do not derive the <view> view (an unexpected <class>)`. A plan error keeps its own message, which names paths. The patterns of the cases follow.                                                                                                                                                                                                                                                                                               |
| 10  | "Every held-out evidence file" was six of eight                                                                        | Valid   | All eight files are planted and the case asserts that they are every file under `held-out/` and `both/` of the `ci` invocation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 11  | Wording the code falsifies: "no development command opens `runs/`"                                                     | Valid   | The comments, the record and the test-design row say that no development command reads another invocation's directory under `runs/` or the held-out evidence of a `ci` invocation.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12  | A stale sentence in `docs/reference/tea-evaluate-cli.md`                                                               | Valid   | It now reads "stops only a held-out or both run, `check` and the `compile` and `seal` checks of `ci` (exit 10)". A search of `docs/` and `src/` found no other copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Round 1 mutants

Applied once each in a scratch copy of the tree (`mut-1.108-r1-a1`) over the trimmed Story 1.108 block or the named `test-evaluate-ci.js` cases, and each failed the case named.

| Mutant                                            | Case that failed                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| N1: the row exit is the first non-zero exit       | the real-engine mixed fixture (row 5 expected) and the per-input shim (row 64) |
| N2: an unstaged view adds no exit                 | the ENOSPC case (row 0 where 12)                                               |
| N3: an engine stage error adds no exit            | the kill-shim and undocumented-exit cases                                      |
| N4: an unstaged view is an authoring problem      | the ENOSPC case (exit 10 where 12)                                             |
| N5: the development stdout leads the summary      | the streams case                                                               |
| N6: the development stderr leads the faults       | the faulty-views case                                                          |
| N7: `contract.json` is read with a blocking read  | the FIFO case: `ci` is still running 30 s after SIGTERM                        |
| N8: `check` reads files with a blocking read      | the FIFO case: `check` times out                                               |
| N9: `preflight.js` `readJson` blocks              | the FIFO case: the judge calibration check times out                           |
| N10: a non-regular `contract.json` is a raw error | the FIFO case: the derived views' finding                                      |
| N11: the finding names no file                    | the off-shape plan case                                                        |
| N12: `check` says a FIFO does not parse           | the FIFO case: the finding text                                                |

The first `--only=FIFO` run of N9 ran 900 s because `spawnSync` ended a `ci` that cannot handle SIGTERM only with SIGTERM; the case's `spawnSync` now kills with SIGKILL, so a blocked command fails the case in 60 s.

Round 1 gates, run on the tree of the round 1 push under the suite lock, all exit 0: `test:evaluate-ci` (339 s), `test:evaluate-partition-plans-attempts` (381 s), `test:evaluate-partition-plans` (295 s), `-boundaries`, `-check`, `-preflight`, `-records`, `-calibration`, `-held-inputs`, `-partitions`, `-evaluators`, `-compare`, `-agents`, `-private`, `-aggregate`, `-interpret`, `-run`, `-confinement` (677 s), `test:evaluate-ci-repositories:tagged-release-pr` and `:nightly-deploy-pr`, `test:eval-replay`, `test:evaluate-pr-api`, `-mcp` and `-gap-loop`, then `test:shards`, `test:ci-coverage`, `test:planning-doc-sources`, `test:evaluate-guidance`, `test:doc-counts`, `eslint . --max-warnings 0`, `format:check`, `lint:md` and `docs:validate-links`.

## Review Round 2

Two Opus lenses (regressions and fix quality) reviewed 507078c0.
Every finding was reproduced against the code before an edit.

| #   | Finding                                                                                      | Verdict | Fix                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The non-blocking reads in `records-calibration.js` and `loadBothViewDesignation` had no case | Valid   | `checkFifoContract` runs `digest --calibration-inputs` over a FIFO `contract.json` (exit 10, `it cannot be read as JSON: is not a regular file`) and a `score` of the committed both baseline over a FIFO `contract.json` (exit 0, no wait); the attempts block scores a both run under a plan over a FIFO (exit 10, the designation message). |
| 2   | The ENOSPC preload hooked `writeFileSync` only                                               | Valid   | A second preload fails `mkdtempSync` for `tea-evaluate-view-` paths; the loop asserts the development view's line and record, `(ENOSPC)` for each staged view and row 12. The code already behaved as the record says (the directory is made inside the staging `try`), and a mutant that makes it outside the `try` fails the case.           |
| 3   | `!isFile()` against `isFIFO()` survived                                                      | Valid   | `check` over a link to `/dev/null` and over a directory in `contract.json` asserts `is not a regular file`.                                                                                                                                                                                                                                    |
| 4   | Mapping every read error to the not-a-regular-file text survived                             | Valid   | `plan-ci-views-absent-contract`: a planned folder with no `contract.json` expects `corpus/held-out/plan.json and contract.json do not derive the <view> view (an unexpected Error)` and the engine's 64 for the development view.                                                                                                              |
| 5   | The `HELD_OUT_PLAN_PATH` shape guard of `heldOutPlanName` survived                           | Valid   | `plan-ci-views-off-shape-plan-path` types `corpus/held-out/../../SECRET-NAME-5b9e.json`, expects the fallback name and finds the typed bytes in no file of either stage row.                                                                                                                                                                   |
| 6   | The "largest exit" revert claim was not held                                                 | Valid   | The docstring and the test-design row now say that over engine exits the numerically largest is the most severe, so the unparsable-contract case (the engine's 5 beside the findings' 10) holds the `Math.max` mutant; the revert column names the first or last exit and a dropped record.                                                    |
| 7   | "Four rows join them" listed five                                                            | Valid   | The test-design sentence says five and lists five.                                                                                                                                                                                                                                                                                             |
| 8   | The `stageViews` docblock lacked the third entry shape                                       | Valid   | It names `unstaged`: a message naming the code of the error that kept a derived view from being staged (infrastructure, exit 12).                                                                                                                                                                                                              |
| 9   | `staleBaseline` reported a failed staging write as a stale reason (a Story 1.51 defect)      | Valid   | Only `loadContractView` is in the derivation `try`; a failed write throws, which the replay check and the tier's staleness rule report as exit 12 with the error code. A held-out baseline grafted onto the partition-plan fixture warns on `pr` as before and exits 12 under an ENOSPC preload.                                               |
| 10  | Anything else the reviewers' reports imply                                                   | Valid   | The CHANGELOG entry gains the two behaviors round 1 and this round added (a staged view that cannot be written is exit 12; a non-regular `contract.json` is read without blocking).                                                                                                                                                            |

### Round 2 mutants

Applied once each in a scratch copy of the tree (`mut-1.108-r2-a1`), and each failed the case named.

| Mutant                                                      | Case that failed                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P1: `records-calibration.js` reads with a blocking read     | `checkFifoContract`: `digest --calibration-inputs` times out                                                              |
| P2: `loadBothViewDesignation` reads with a blocking read    | `checkFifoContract`: the `score` times out                                                                                |
| P2b: the same, for a both run under a plan                  | the attempts block's `score` over a FIFO                                                                                  |
| P3: only a FIFO is refused                                  | `checkFifoContract`: the link to `/dev/null`                                                                              |
| P4: every read error is the not-a-regular-file text         | `plan-ci-views-absent-contract`                                                                                           |
| P5: the plan path shape guard is dropped                    | `plan-ci-views-off-shape-plan-path`                                                                                       |
| P6: the staging directory is made outside the staging `try` | `checkStageViewExits`: the `mkdtempSync` preload                                                                          |
| P7: the stale-baseline staging failure is a stale reason    | `checkStageViewExits`: the stale baseline under ENOSPC (exit 0, not 12)                                                   |
| P8: the row exit is the numerically largest                 | the attempts block; only the unparsable-contract case (the engine's 5 beside the findings' 10) tells it from `mostSevere` |

Round 2 gates, all exit 0: `test:evaluate-ci` (336 s), `test:evaluate-partition-plans-attempts` (382 s), `test:evaluate-partition-plans` (290 s), `-boundaries`, `-check`, the two `ci-repositories` `-pr` suites, `test:eval-replay`, `test:evaluate-pr-api`, `test:shards`, `test:ci-coverage`, `test:planning-doc-sources`, `test:evaluate-guidance`, `test:doc-counts`, `eslint . --max-warnings 0`, `format:check`, `lint:md` and `docs:validate-links`.

## Spec Change Log

## Completion Notes

Gates run on the tree of the first push (247db4b7): `test:evaluate-ci` (324 s), `test:evaluate-partition-plans` (294 s), `test:evaluate-partition-plans-attempts` (378 s), `test:evaluate-ci-repositories:tagged-release-pr` and `:nightly-deploy-pr`, `test:eval-replay`, `test:evaluate-boundaries`, `test:evaluate-confinement` (643 s), `test:evaluate-check`, the ten `test:evaluate-pr-<key>` suites, `test:evaluate-ci-render` and `test:evaluate-partitions`, all exit 0.
Afterwards the streams case and the shard weights changed, and `test-evaluate-ci.js --only` over the new cases, `test:shards`, `test:ci-coverage`, `eslint . --max-warnings 0`, `format:check`, `lint:md` and `docs:validate-links` ran again, exit 0.
`npm test` was not run; CI carries it.
Shard weights come from the CI timings of run 37583753246 on this branch (see Review Round 1, finding 6); the chain cap is unchanged.
The attempts suite carries the new block because the partition-plan harness it builds on lives there and that file had the smaller weight.

The skill reference `references/corpus.md` went through the `/bmad-workflow-builder` Edit flow headless (memlog entry of Story 1.108, `quick_validate`, `scan-path-standards` over the skill's files and `scan-scripts`).
`SKILL.md`, `references/ci.md` and `assets/evaluation-ci-plan.template.json` are untouched, since they are `sessionRead` keys of the committed live capture records.
Builder Analyze of the edit (`.analysis/2026-10-07-r108/`, five lenses over the delta): 0 critical, 0 high, 1 medium, 2 low.
Fixed in `corpus.md`: the `pr` tier is named as the condition of the pull-request failure (architecture-2), and the sentence is split off the list of what `check` names (architecture-3).
Architecture-1 asked for a Stage 6 sentence in `SKILL.md`, which is a digest-pinned `sessionRead` key of the committed capture records, so editing it fails `test:evaluate-ci`; that skip holds for `SKILL.md` alone, and round 1 added the sentence to the other references (see Review Round 1, finding 7).

## Verification

**Commands:**

- `npm run test:evaluate-ci && npm run test:evaluate-partition-plans && npm run test:evaluate-partition-plans-attempts` -- expected: pass
- `npm run test:evaluate-ci-repositories:tagged-release-pr && npm run test:eval-replay && npm run test:evaluate-boundaries && npm run test:evaluate-confinement` -- expected: pass, no replay byte changes
- `npx eslint . --max-warnings 0 && npm run format:check && npm run lint:md && npm run docs:validate-links` -- expected: pass
