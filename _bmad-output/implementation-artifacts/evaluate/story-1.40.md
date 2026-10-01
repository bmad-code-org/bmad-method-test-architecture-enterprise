---
title: 'Story 1.40: Calibrate rubric scores imported from harness records'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4ceb0503'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.17, 1.21 and 1.40)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.40 section, and the Story 1.21 section for the calibration fixtures it extends)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-21, AD-22)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.21.md (the gate this story extends to the records kind)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** a `records` evaluator imports the sealed records and the `EvaluatorConfiguration` an adopter harness produced, rubric scores among them. Story 1.21 gates every rubric judgment TeA's own scorer makes, but an imported score has no calibration path, so `check` refuses any `records` evaluation whose contract declares a rubric ("a records evaluator cannot score rubrics until its harness supplies a verifiable calibration path"). An adopter whose harness judges a rubric cannot use the kind at all.

**Approach:** the harness runs its own scorer over the labelled items in `policy/judge-calibration.json` (the same file Story 1.21 reads) and writes the label-free judgments beside its records as `<records>/calibration-judgments.json`. TeA does not run the harness's scorer. It verifies what only the runtime can: the judgments cover the labelled items, each item's scorer input is exactly the label-free observation TeA derives from the item (so `expectedLevel` never reached the scorer), the judgments name the same scorer configuration the imported `EvaluatorConfiguration` describes, and the configuration binds the labelled file's digest and `judgeCalibration.minimumAgreement`. TeA then computes exact agreement and the largest level distance per criterion itself, writes `runs/<invocationId>/judge-calibration.json` in Story 1.21's shape, and exits 11 below the threshold before any imported record is copied. `check` replaces its blanket refusal with the same verification. No eval-quality change: the binding uses the caller-keyed `decodingParameters` and the `digestBytes` and `digestArtifact` the engine exports today.

## Boundaries & Constraints

**Always:** reuse Story 1.21's pieces: `calibrationProblems` for the labelled file, `calibrationObservation` for the scorer input, `runCalibration` (with a `judgeItem` that reads the harness's answer) for the report, the exit 11 and the digest. The judgments file is a regular in-folder file under the records directory, read through no link, as the records themselves are (`records-evaluator.js`). Provenance defects (absent or malformed file, a different scorer configuration, a scorer input that is not the label-free observation, a missing or extra item, a configuration without the two bindings or with the wrong values) are authoring defects: `EvaluatorLayerError`, exit 10, before any record is copied. The imported configuration's `decodingParameters` must carry `tea.judgeCalibrationDigest` (the digest of the labelled file's bytes) and `tea.judgeCalibrationMinimumAgreement` (the evaluation's minimum), so a changed item or threshold changes the configuration digest and the scoring version (eval-quality digests the whole configuration into it, AD-1). A `records` evaluation with no rubric imports and scores through its existing path, and a judgments file beside it is not read. The engine check runs at start and end. `package.json`, the lockfile and the peer floor do not move.

**Never:** TeA runs, replays or second-guesses the harness's scorer. `expectedLevel` appears in anything the harness is asked to produce. TeA recomputes a verdict. A second report shape. Releasing or changing eval-quality. A new dependency. An unused judgments file read or refused when the contract declares no rubric.

**Decisions (coordinator, owner-delegated):**

- File: `<records>/calibration-judgments.json`, `{ "schemaVersion": 1, "scorerConfigurationDigest": "sha256:...", "items": [{ "rubricId", "criterionId", "scorerInput": <the observation>, "answer": <anchored level or null> }] }`, one item per labelled item in the labelled file's order. The name differs from the labelled `policy/judge-calibration.json` and the run's report `judge-calibration.json` so no file is mistaken for another.
- `scorerConfigurationDigest` is `digestArtifact` over the imported configuration with the two `tea.judgeCalibration*` keys removed from `decodingParameters`. The judgments cannot name the full configuration's digest: that digest covers the labelled file's digest, and the harness cannot know a digest that covers a file it has not finished. The configuration the trial records name and the one the judgments name differ only in the two calibration bindings, which TeA checks separately.
- `scorerInput` is exactly what `calibrationObservation` returns for the labelled item (with the operation id the contract's interaction plan gives the criterion's step, else `calibration`), compared whole. Extra keys, a label, or a different response fail the comparison, which is how a label in scorer input fails the case.
- The provenance verification is one function used by `check` and `run`, so the two cannot drift. `check` needs the records directory to exist (it already refuses a missing one) and reads the configuration and judgments from it.
- The honest limit goes in the reference: the runtime verifies that the judgments bind to the configuration and the label-free input; it cannot prove the harness ran its scorer. A harness that wants that proof runs its scorer through a `command` evaluator.

## I/O & Edge-Case Matrix

| Scenario                                              | Input / State                                                                      | Expected Output / Behavior                                  | Error Handling              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| Calibrated rubric records                             | verified judgments, agreement at or above the minimum                              | `judge-calibration.json` written, records copied and scored | exit 0                      |
| Low agreement                                         | two labelled items, one answered wrong, minimum 0.9                                | report written with agreement 0.5, no record copied         | exit 11                     |
| Different scorer configuration                        | `scorerConfigurationDigest` of another configuration                               | refused before any record is copied                         | exit 10 naming both digests |
| Label in scorer input                                 | `scorerInput` carrying `expectedLevel`                                             | refused before any record is copied                         | exit 10                     |
| Binding missing or wrong                              | configuration without a calibration key, or one carrying another digest or minimum | refused                                                     | exit 10                     |
| Item missing, extra, reordered or with a wrong answer | judgments not 1:1 with the labelled items, or an answer off the criterion's levels | refused                                                     | exit 10                     |
| Rubric records without judgments                      | `check` over a `records` evaluation with a rubric and no judgments file            | `check` reports a finding on the judgments file             | exit 10                     |
| `records` evaluation with no rubric                   | no rubric in the contract                                                          | imports and scores as before, judgments file never read     | exit 0                      |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/calibration.js`: the labelled file's reader, `calibrationProblems`, `calibrationObservation`, `runCalibration`; the new provenance verification (a new function here or a new `records-calibration.js` beside `records-evaluator.js`, whichever keeps each file's job single).
- `cli/lib/evaluate/records-evaluator.js` (`importRecords`): verify the judgments and run the calibration after the configuration validates and before any record is read or copied.
- `cli/lib/evaluate/run.js` (`concludeImportedRecords` near 1485; the kind branch near 913; `configurationFields` callers): wire the calibration, the report, exit 11; the binding values come from the labelled file's digest (`engine.digestBytes`) and `evaluation.judgeCalibration.minimumAgreement`.
- `cli/lib/evaluate/check.js` (the records branch near 1238): replace the blanket refusal with the verification; keep the records-directory rules.
- `test/test-evaluate-evaluators.js` and `test/test-evaluate-check.js` (the `records` fixture near `test-evaluate-evaluators.js` 2450, `addRubric` near 315): the cases below.
- `docs/reference/tea-evaluate-cli.md` (calibration section near 64, the `check` table row near 106, the evaluation layer's `records` description); `CHANGELOG.md` `## [Unreleased]`.
- Skill gate: `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md` states that a `records` evaluator with a rubric fails `check` (lines naming it) and the records section; edit through `/bmad-workflow-builder` Edit per Build Rules, with `test:evaluate-guidance` green (the skill's `adapters.md` embeds fixture registries, so a fixture registry edit goes in the test's own project copy).
- `epics.md` and `test-design-epic-1.md`: amend in place, dated 2026-10-01, only where the build departs from the plan text.

## Tasks & Acceptance

**Execution:**

- [x] provenance verification (one function for `check` and `run`), `importRecords` hook, run wiring, report, exit 11 -- AC 1, 2, 3
- [x] `check` verification replacing the refusal -- AC 4
- [x] `test-evaluate-evaluators.js` and `test-evaluate-check.js` cases with revert observations; reference, skill guidance, CHANGELOG, plan amendments -- AC 1 to 4

**Acceptance Criteria:**

- Imported rubric scores carry verifiable calibration: a harness fixture over real eval-quality supplies label-free judgments and a configuration bound to the labelled file; a different scorer configuration or a label in scorer input fails the case (revert: dropping either comparison accepts the mismatch).
- Low agreement exits 11 before any record is copied; the report lists agreement and largest level distance per criterion (revert: removing the gate lets the run write a record).
- The labelled file's digest and the minimum agreement are bound to the imported configuration; omitting or mismatching either is refused, and changing an item or the minimum changes the configuration digest and the scoring version (revert: dropping either binding check admits a configuration without it).
- `check` refuses rubric records whose judgments are absent or unverifiable, and a `records` evaluation without a rubric still imports (revert: restoring the bypass accepts an uncalibrated rubric).

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-evaluators && npm run test:evaluate-records && npm run test:evaluate-check && npm run test:evaluate-guidance` -- expected: green
- `npm run test:evaluate-run && npm run test:evaluate-calibration && npm run test:evaluate-workflow` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check` -- expected: green
- `npm run docs:validate-links && npm run docs:build` -- expected: green
- `npm test` -- expected: green (CI shards)

## Implementation Notes

- New `cli/lib/evaluate/records-calibration.js` holds the verification and the gate.
  `verifyRecordsCalibration({ records, root, configuration, evaluation, contract, labelled, engine })` is the one function `check` and `run` use. It returns `{ problems: [{ file, message }], judgments }`, so `check` can report each problem against the file it is in and `run` can join the messages.
  It runs `calibrationProblems` over the labelled file first (a labelled file `check` already faults is reported once, under its own rule), then checks the two bindings against `engine.digestBytes(labelled.bytes)` and `evaluation.judgeCalibration.minimumAgreement`, reads the judgments through no link (`lstat` then read, as the records are), and compares each item by index: the labelled item's rubric and criterion, `scorerInput` against the observation `calibrationObservation` returns (compared whole as JSON, key order aside, so an extra key or a label fails), and `answer` against the criterion's anchored levels or `null`.
  `scorerConfigurationDigest` is `engine.digestArtifact` over the imported configuration with the two `tea.judgeCalibration*` keys removed from `decodingParameters`.
  Unknown fields at the top level or on an item are refused, so a label cannot ride beside the scorer input.
- `calibrateImported` verifies (an `EvaluatorLayerError` naming every problem, exit 10), then calls `runCalibration` with a `judgeItem` that reads the harness's answer from a per-criterion queue in labelled order. The report shape, the exit 11 and the digest are Story 1.21's.
- `calibration.js` gains `calibrationOperationId(contract, criterion)`, the operation ID the interaction plan gives the criterion's step, else `calibration`. `run.js`'s own `judgeItem` uses it too, so both derive the observation from one function.
- `records-evaluator.js` `importRecords` takes an optional `calibration` and calls `calibrateImported` after the configuration validates and its `sealedBriefDigest` matches, before any record directory is read. `run.js` `concludeImportedRecords` passes it when the contract declares a rubric, over the labelled file the run snapshotted at its start; a stop with exit 11 passes through `importRecords`'s caller unchanged.
- `check.js`: the blanket refusal is gone. When the contract declares a rubric and the records directory resolves, `checkRecordsCalibration` reads the configuration and calls the shared function, reporting under rule `judge-calibration` against `<records>/calibration-judgments.json` or `<records>/evaluator-configuration.json`. A contract with no rubric never reads the judgments file.
- `cli/lib/evaluate/records-calibration.js` compares JSON with its own `sameJson`, since `node:util` is outside the `cli` layer's `dependency-direction` allow list (`test:direction` caught the first draft).
- Tests. `test/test-evaluate-evaluators.js` (863 checks): `harnessProject` builds an adopter harness over real eval-quality (a command run scores the verdict project with a rubric; its configuration and records are copied to `records/`; the harness writes its judgments by feeding each label-free observation to the stub scorer), then `checkImportedRubricCalibration` (verified import, report, byte-equal copies, scored votes, then 16 refusals each exit 10 with its message and no copied file, then the restored files import again), `checkImportedCalibrationBelowMinimum` (two labelled items, agreement 0.5 under 0.9, exit 11, report with largest distance 1, no record or configuration copied), `checkImportedCalibrationChangesScoringVersion` (a changed item and a changed minimum each change the configuration digest, the bindings and the scoring version), and `checkImportedCalibrationReferenceExample` (the reference's worked observation equals what the runtime derives). `checkRecordsEvaluator` now plants an unreadable judgments file beside a no-rubric contract and asserts it is never read. A `--imported-calibration-only` flag runs these cases alone. The stub scorer gains a `score-two` mode for the two-level harness.
  `test/test-evaluate-check.js` (789 checks): ten exit 10 cases for the absent, unparseable and unverifiable judgments and configuration, and two clean cases (verified judgments; a no-rubric records evaluation beside a judgments file it never reads). The runners now await a case's `plant`.
- Docs: `docs/reference/tea-evaluate-cli.md` (calibration paragraph, `check` table rows, exit table rows, the records description with the file's schema, the two bindings, exit 10 versus 11, a worked `scorerInput` and the honest limit); `eval-quality.config.json` lists `EvaluatorConfiguration` among the foreign symbols the reference now spells.
- Skill gate: `references/evaluator.md` edited through `/bmad-workflow-builder` Edit (headless, that path only), then Analyze: pre-pass scripts clean, five lenses, grade excellent, 0 critical, 0 high, 1 medium, 7 low. No guidance test pinned the old wording.
- `tools/test-shard-weights.json`: `test:evaluate-evaluators` weight 146.5 to 175 for the new cases.
- `CHANGELOG.md` `### Added`.

### Departures from the plan text

- The test-design row for the binding criterion named a contract-level test; it is an integration case over real eval-quality (the version moves only when a harness over real eval-quality records another configuration). Amended in place, dated 2026-10-01, in `test-design-epic-1.md`.
- `epics.md` Story 1.40 and `ARCHITECTURE-SPINE.md` AD-22's Judge calibration bullet gain a dated 2026-10-01 amendment naming the judgments file, its shape, the digest rule and the limit.
- The binding revert named in the plan ("omitting either binding leaves the scoring version unchanged") applies to TeA's own `configurationFields`, which the harness fixture copies; omitting a binding there makes the harness's configuration fail verification, so the base case fails first (observed below).

### Skipped builder findings

- leanness-1, architecture-1, enhancement-1 (low): the calibration paragraph repeats the file shape and digest recipe the CLI reference states. Kept: a harness author needs the contract without a fetch, as the guide inlines the other layers' contracts.
- customization-1 (low): `customize.toml` header omits the override paths. Outside this edit, which touches `references/evaluator.md` only.
- determinism-1 (medium) is partly closed (the guide says to compute the digest with the named function and never type it; the reference carries a worked observation pinned by a test) and the rest is Story 1.67.

## Revert observations

Each check exercised once in a scratch copy of `cli/` and `test/` (the working tree stayed untouched), with the change undone and the named test run; counts are of the 113 to 116 checks of `--imported-calibration-only` (789 for `test:evaluate-check`).

- AC 1, the `scorerConfigurationDigest` comparison dropped: 5 of 113 fail ("judgments of another scorer configuration: run exited 0; expected 10", the two digests and the message missing, the refused run copying files).
- AC 1, the `scorerInput` comparison dropped: 9 of 115 fail (a label in the scorer input, a label in its response and reordered items exit 0 or 11 where 10 is expected).
- AC 2, the `calibrateImported` call dropped from `importRecords`: 3 of 65 fail ("imported rubric scores below the minimum exited 0; expected 11", then the report is missing); the calibrated case fails the same way.
- AC 2, the exit 11 throw in `runCalibration` disabled: 3 of 112 fail ("exited 0; expected 11", "copied a record", "copied the harness files").
- AC 3, both binding checks dropped: 12 of 116 fail (no, wrong digest and wrong minimum each exit 0 where 10 is expected).
- AC 3, the digest binding alone dropped: 6 of 114 fail (the missing and the wrong digest). The minimum binding alone dropped: 6 of 114 fail (the missing and the wrong minimum).
- AC 3, `configurationFields` not writing the minimum binding: 3 of 52 fail (the harness configuration lacks it, the base run exits 10); not writing the digest binding: 5 of 49 fail (the base run exits 10, the below-minimum run exits 10 instead of 11).
- AC 4, the `check` branch disabled (the old bypass restored): 33 of 789 fail (every exit 10 case: the absent, unreadable, unverifiable judgments and configuration findings and their anchors); the two clean cases still pass.

## Gates

- Engine check (`evaluateTarget` is a function) exit 0 at the start and at the end.
- Green on the last state of the tree: `test:evaluate-evaluators` 863 checks, `test:evaluate-check` 789, `test:evaluate-guidance`, `test:evaluate-run` 543, `test:evaluate-calibration`, `test:evaluate-workflow` 165, `test:evaluate-boundaries` 306, `test:direction`, `test:doc-claims`, `test:doc-counts`, `test:changelog`, `test:shards`, `test:ci-coverage`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
- `package.json`, `package-lock.json` and the peer floor are unchanged.
- Unrun: the full `npm test` (CI shards) and `test:release-metadata` (no package or workflow change).

## Left undone, reported

- Story 1.67 (new, end of Epic 1): the runtime emits the label-free scorer inputs and the digests a harness copies, so a harness in any language need not derive them by hand. Added to `epics.md`, `test-design-epic-1.md`, the Epic Dependencies table (the later rows renumbered) and `sprint-status.yaml` as `backlog`.
- The judgments file is read and verified when `run` imports; a harness that rewrites it between `check` and `run` is verified again at import, so no stale verification is used.

## Review round 1

Two review lenses (adversarial, test quality) raised eleven findings.
Each was verified against the tree before it was fixed.
All eleven were valid; none was skipped.

### Fixed

- A1: `calibrationOperationId` read `contract.interactionPlan` unguarded, so `tea-evaluate check` crashed with a raw `TypeError` on `"interactionPlan": {}` and on a plan holding `null`, both reproduced.
  It now reads the plan only when it is an array and skips any step that is not an object, so the contract's own `engine-schema` finding is what `check` reports (exit 10).
  Two cases in `test/test-evaluate-check.js` pin the non-array plan and the null step.
- A2: `references/evaluator.md`, the CLI reference and the CHANGELOG entry read as if `check` gates agreement.
  Each now says `check` and `run` verify the judgments and bindings with one function (exit 10, rule `judge-calibration`) and that `run` alone computes agreement, writes `judge-calibration.json` and exits 11.
  The `records-calibration.js` docblock says the same.
  The guide edit went through `/bmad-workflow-builder` Edit on that path only, then Analyze: integrity pre-pass pass, path and script scans clean, no content added, still 0 critical and 0 high.
- T1: new cases pin the judgments file read through a link (evaluators suite and check suite), a symlinked `evaluator-configuration.json` (check suite), and a top-level `expectedLevel` field (both suites).
- T2: the reference's worked `scorerInput` now shows `"operationId": "judge-request"`, the operation the plan gives step `judge-run`.
  The pinning test derives the id with `calibrationOperationId` over the verdict fixture's `contract.json` and asserts it is `judge-request`.
- T3: `epics.md` reads seventy-three stories and Stories 1.27 to 1.67, and `test-design-epic-1.md` reads Stories 1.1 to 1.67 and 1.27 to 1.67; a grep of both files and the other planning files found no other count sentence.
- T4: the AC3 revert text in `epics.md` and `test-design-epic-1.md` now reads "dropping either binding check admits a configuration without it, and the missing or wrong binding case exits 0".
  `test-design-epic-1.md` gains an "Amended 2026-10-01 in Story 1.40" note under the Story 1.40 table naming the Level (Contract to Integration over real eval-quality) and the revert change.
- T5: both `judge-calibration.json` reads are guarded with a `check(fs.existsSync(...))` and a return, so a removed gate reports its assertions.
- T6: `checkImportedCalibrationChangesScoringVersion` builds its own base run as the first variant; the module-level `calibratedBase` is gone.
- T7: the CHANGELOG entry lost "The runtime does not run that scorer." and "no longer fails `check`"; the `records-calibration.js` docblock lost the same split.

### Revert observations

Each exercised once by undoing the change in the working tree and restoring it (a scratch copy of the test file for T6 and T2).

- A1, `calibrationOperationId` restored to the unguarded read: 7 of 797 `test:evaluate-check` checks fail (both new cases: exit 1 instead of 10, no `engine-schema` finding, the raw `TypeError` in the output).
- T1, `lstatSync` swapped for `statSync` on the judgments file: 3 of 119 `--imported-calibration-only` checks fail (run exits 0, no "is not a regular file", the refused run copied files) and 3 of 807 `test:evaluate-check` fail.
- T1, top-level field check disabled: 3 of 119 evaluators checks fail ("a label beside the items") and 3 of 807 check checks fail.
- T1, `statSync` on `evaluator-configuration.json` in `check.js`: 4 of 807 check checks fail (exit 0 where 10 is expected; neither finding text appears).
- T2, the reference example reverted to `"operationId": "calibration"`: 1 check fails (the reference's scorer input differs from the derived one).
- T5, the `calibrateImported` call dropped from `importRecords`: 3 of 65 checks fail and each names its cause ("a calibrated records run wrote no judge-calibration.json", "exited 0; expected 11", "the run below the minimum wrote no judge-calibration.json"); the earlier build crashed with ENOENT there and skipped the rest.
- T6, the version case plus the reference example run alone through a scratch copy of the runner: 19 of 19 pass, so the case no longer depends on the rubric case running first.

### Gates

Green on the last state of the tree: `test:evaluate-evaluators` 873 checks, `test:evaluate-check` 807, `test:evaluate-run` 543, `test:evaluate-guidance`, `test:evaluate-calibration`, `test:direction`, `test:shards`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
`tools/test-shard-weights.json` is unchanged: the added cases are one more harness run and a handful of refusals in `test:evaluate-evaluators`, a change of a few percent.

### CI round (PR 272)

- `chain (2/5)` hit its 15 minute `timeout-minutes` (run 36818524342). Shard 2 held `test:evaluate-evaluators`, 442 s under coverage before this story and about 629 s with it, against a stale weight of 175.
- `test/test-evaluate-evaluators.js` takes `--group=<name>`: `records` runs the five Story 1.40 cases (127 checks) and `evaluators` runs every other case (746 checks); no flag runs all 873, and an unknown name exits 2. `package.json` chains `test:evaluate-evaluators` (`--group=evaluators`) and `test:evaluate-records` (`--group=records`), one file and one set of fixtures.
- Each group ends with the `runtimeTemps` leftover check and `scratch.removeAll()`: a group's `runtimeTemps` hold only the projects that group made, and both groups pass it.
- `tools/test-shard-weights.json` is refreshed from the CI timings of this run's shards 1, 3, 4 and 5 and the previous green run's shard 2. Local times of 68.5 s (`records`) and 294.3 s (`evaluators`) scaled to the 629 s CI figure give 118.8 and 510.2. The five shards sum to 580.1 or 580.2 s by the weights, and the evaluators script shares its shard with 69.9 s of other weight.
- Revert: removing `test:evaluate-records` from the `test` chain fails `test:ci-coverage` (the script is neither run in CI nor deliberately local) and `test:shards` (the weights name a script the chain no longer calls).
- `README.md` reads ninety-eight chain checks.
