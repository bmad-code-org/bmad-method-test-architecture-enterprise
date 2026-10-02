---
title: 'Story 1.67: Emit the label-free calibration inputs a records harness feeds its scorer'
type: 'feature'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '35a02492'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.40 and 1.67)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.67 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-5, AD-21, AD-22)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.44.md (the previous story record, the model for this one)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.40.md (the records calibration this story completes)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A `records` harness proves its rubric scores with `<records>/calibration-judgments.json`. Each item's `scorerInput` must equal, key for key, the observation the runtime derives from the labelled item, and `scorerConfigurationDigest` must be `digestArtifact` over the harness's configuration without its two calibration bindings. A harness in any language can reproduce both only by hand from the reference, and a mismatch shows only as a `check` exit 10.

**Approach:** One option of an existing subcommand, `tea-evaluate digest --evaluation <path> --calibration-inputs`, prints the values the harness must copy: the labelled file's digest, the `scorerConfigurationDigest` of the configuration the evaluation names, and per labelled item, in the labelled file's order, its rubric, criterion and label-free `scorerInput`. The values come from the functions `check` and `run` verify with (`cli/lib/evaluate/records-calibration.js`), so the output and the verification change together. The reference and the skill's evaluator guide tell the harness to copy the values verbatim. No eval-quality change; no new subcommand (AD-5's count stays).

## Boundaries & Constraints

**Always:** reuse, do not copy, the derivation: `verifyRecordsCalibration` and the new emitter share one function for the observation (`calibrationObservation` with `calibrationOperationId`, JSON round-tripped as `itemProblems` does) and one for the scorer configuration digest. Read the labelled file with `readCalibration` and the configuration the way `check` does (a regular file, no link). The option is read-only: it writes nothing under the folder, `corpus-index.json` included. Keep `cli/` free of any framework import (`test:direction`, `test:evaluate-boundaries`). Edit the skill through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/`, with Analyze at zero critical and zero high findings (a finding that contradicts a repository test is skipped with the reason in the completion notes). Verify every behavioral claim about a vendor tool live against the installed version before it enters plan or guide text. Exercise every revert check once in a scratch copy and record the observation. Fix pre-existing defects found on the way. Run `test:schema-versions` locally: a literal `schemaVersion` under `cli/lib/evaluate`, `test/lib` or `tools` fails it, so a schema version belongs in a schema file. List every digest or evidence byte the change refreshed.

**Never:** an eval-quality change or a new engine export; a new subcommand; the label (`expectedLevel`) anywhere in the output; a write under the evaluation folder; a second derivation of the observation or the digest; a raised timeout; a script that is not chained; weight added to a heavy suite without the measured weight in `tools/test-shard-weights.json`; a commit, push, pull request, merge or release.

**Decisions (coordinator, owner-delegated):**

- The option lives on `digest`, the subcommand that prints the folder's digests. `digest` without the option is unchanged (it writes `corpus-index.json` and prints `corpusDigest`); with `--calibration-inputs` it writes nothing and prints one JSON document on stdout.
- The document holds `calibrationDigest` (eval-quality's `digestBytes` of `policy/judge-calibration.json`, the value for `tea.judgeCalibrationDigest`), `scorerConfigurationDigest`, and `items`, each `{ rubricId, criterionId, scorerInput }` in the labelled file's order. It carries no `answer` (the harness's scorer supplies it) and no label.
- The scorer configuration digest is taken over `<records>/evaluator-configuration.json`, which the harness writes before it asks; the two calibration bindings are removed first, so the file can exist without them.
- Refusals are exit 10 with a finding line under the `judge-calibration` rule: a folder whose evaluator is not `records`, a contract that declares no rubric, an unusable labelled file (the `calibrationProblems` messages), an absent, linked or non-JSON configuration, a configuration that cannot be digested. A malformed command line is exit 64.

## I/O & Edge-Case Matrix

| Scenario                                              | Input / State                                                                       | Expected Output / Behavior                                                    | Error Handling |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------- |
| Harness asks, then writes judgments                   | `records` evaluator, rubric contract, labelled file, configuration without bindings | JSON on stdout; a judgments file built from it alone passes `check` and `run` | n/a            |
| Output carries no label                               | any valid ask                                                                       | no `expectedLevel` anywhere in stdout                                         | n/a            |
| Order                                                 | labelled items of several rubrics and criteria                                      | `items` in the labelled file's order, one per labelled item                   | n/a            |
| Not a records evaluator                               | `deterministic`, `command` or `sealed-brief-agent`                                  | finding line naming the evaluator kind                                        | exit 10        |
| No rubric in the contract                             | `records` evaluator, no rubric                                                      | finding line: nothing to calibrate                                            | exit 10        |
| Labelled file unusable                                | absent, malformed or uncovered levels                                               | the `calibrationProblems` messages as findings                                | exit 10        |
| Configuration absent / link / not JSON / undigestable | `evaluator-configuration.json` missing, a link, text, or off its schema             | finding line naming the file                                                  | exit 10        |
| Configuration carries the bindings                    | `tea.judgeCalibration*` present                                                     | `scorerConfigurationDigest` equals the digest of the file without them        | n/a            |
| Folder untouched                                      | any ask                                                                             | no file written under the folder                                              | n/a            |
| Derivation changes in the runtime                     | `calibrationObservation` or the digest rule changes                                 | output and verification change together; a hand-built old copy fails          | n/a            |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/records-calibration.js`: the shared derivation (`scorerInputFor`, `scorerConfigurationDigest`) and the new `calibrationInputs`; `itemProblems` and `verifyRecordsCalibration` call the same functions.
- `cli/evaluate.js`: `digest`'s `--calibration-inputs` option and `runDigest`'s branch; the header comment.
- `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md`: the copy-verbatim sentence under its heading.
- `docs/reference/tea-evaluate-cli.md`: the `digest` entry and the records calibration section.
- Tests: `test/test-evaluate-evaluators.js` (the harness fixture builds its judgments from the output alone), `test/test-evaluate-guidance.js`.
- `CHANGELOG.md`, `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, `epics.md`, `test-design-epic-1.md`, `ARCHITECTURE-SPINE.md` only if an AD sentence names digest's single behavior.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/evaluate/records-calibration.js`, `cli/evaluate.js` -- shared derivation, emitter, `digest --calibration-inputs` -- AC 1, 2
- [x] Skill: the guide sentence under its exact heading (builder Edit, Analyze clean) -- AC 3
- [x] Docs reference, CHANGELOG, plan amendments, sprint row, this record -- all
- [x] `test/test-evaluate-evaluators.js`, `test/test-evaluate-guidance.js` -- the three cases -- AC 1 to 3

**Acceptance Criteria:**

- A harness fixture builds `calibration-judgments.json` from the emitted output alone, and `check` exits 0 and `run` imports and scores it (revert: emitting an input the verification does not derive fails `check`; changing the observation derivation changes the output and the verification together, and a hand-built copy of the old derivation fails the case).
- The output carries no `expectedLevel` (revert: adding the label to the output fails the search).
- The reference and the evaluator guide tell the harness to copy these values verbatim, and the guidance test asserts that sentence under its exact heading (revert: removing the sentence fails the assertion).

## Implementation Notes

- `cli/lib/evaluate/records-calibration.js` now holds the one derivation.
  `scorerInputFor(item, criterion, contract)` is the label-free observation (`calibrationObservation` with `calibrationOperationId`, JSON round-tripped); `scorerConfigurationDigest(configuration, engine)` is `digestArtifact` over the configuration without its two bindings.
  `itemProblems` and `verifyRecordsCalibration` call both, and so does the new `calibrationInputs`, so a change to either changes the output and the verification together.
  `criteriaOf`, `readConfiguration` (regular file, no link, JSON) and `recordsDirectory` (a directory the folder holds, reached through no link) were extracted from `check.js` and the verification and are shared; `check.js` calls `readConfiguration` and `recordsDirectory`, with its messages unchanged.
- `calibrationInputs({ folder, evaluation, contract, engine })` is async and returns `{ problems, inputs }`.
  Refusals in order: an evaluator that is not `records` (names the kind), a records directory the folder does not hold, a contract with no rubric, a labelled file `readCalibration` throws on or `calibrationProblems` faults, a configuration that is absent, a link or not JSON, and a configuration off eval-quality's `evaluator-configuration` schema (`createArtifactValidator`, the check `run` makes before it calibrates).
  The success document is `{ calibrationDigest, scorerConfigurationDigest, items }`, items in the labelled file's order.
  `calibrationInputsOf(folder)` reads `evaluation.json` and `contract.json` and loads the engine; `cli/` imports no framework.
- `cli/evaluate.js`: `digest --calibration-inputs` branches before `writeCorpusIndex`; findings print to stdout as `judge-calibration` lines, a one-line summary to stderr, exit 10.
  Success prints the JSON document alone on stdout.
  No new subcommand, so AD-5's seven stays; the header comment and `--help` describe the option.
- The skill was edited through `/bmad-workflow-builder` Edit run headless on `src/workflows/testarch/bmad-testarch-evaluate/` (memlog `.memlog.md` and the Analyze run `.analysis/2026-10-01-story-1-67/`, both gitignored).
  Edited: `references/evaluator.md`, the records-harness calibration paragraph under `## Emit judgment rows or sealed records`, now three short paragraphs: the judgments file shape; the procedure (the pinned sentence, the minimum-agreement binding, rerun after an edit, what the exit 10 means); the verification and limit.
- Docs: `docs/reference/tea-evaluate-cli.md` (`## digest` gains the option, the records calibration section tells the harness to copy the values, the `scorerConfigurationDigest` bullet points at the command, the exit 10 row names the option).
  `CHANGELOG.md` has the Added entry.
  `ARCHITECTURE-SPINE.md` needs no change: no AD sentence names `digest`'s single behavior.
- Tests, `test/test-evaluate-evaluators.js` group `records`:
  `checkCalibrationInputs` (one harness project, one run, one score) holds the three plan cases and everything below; `checkCalibrationInputsDocumented` is static.
  The harness fixture strips the configuration's bindings (the harness writes it first), asks, writes `calibration-judgments.json` from the output alone (the scorer adds only `answer`), binds `tea.judgeCalibrationDigest` to `calibrationDigest`, and then `check` exits 0, `run` imports and `score` scores it.
  The emitted `scorerInput` equals a hand-written literal (`literalObservation`, derived from nothing in the runtime) and the fixture's own hand-built derivation; asking with the bindings present gives the same digests; `--evaluation` naming `evaluation.json` gives the folder's answer.
  The output has exactly the three keys, each item exactly `rubricId`, `criterionId`, `scorerInput`, and no `expectedLevel` anywhere.
  Refusals (each exit 10, one or more lines `<file>: [judge-calibration] ...`, no document, and a `snapshotOf` of the folder, content and modification time of every entry, unchanged): a `deterministic`, `command`, `sealed-brief-agent`, absent and string evaluator, a records directory that is absent, a link, under a link and nested link, an `evaluation.json` that is no object, a contract with no rubric or not JSON, an absent, not-JSON, uncovered-level, unknown-criterion and off-scale labelled file, a configuration absent, not JSON, a link and off its schema.
  A contract of two rubrics and three criteria with seven interleaved labelled items pins the order and the channel (stdout and stderr).
  `--calibration-inputs-only` is a new runner flag for the revert checks, like `--imported-calibration-only`.
- `test/test-evaluate-guidance.js`: the exact sentence under `## Emit judgment rows or sealed records`.
- Digests and evidence bytes refreshed: none; no committed digest, record, fixture or evidence file changed.
  `tea.judgeCalibration*` bindings and the labelled file are untouched, so no `corpus-index.json` moves.

### Departures from the plan text

- The plan says "an option of an existing subcommand, or a subcommand if AD-5's count is amended". The option is `digest --calibration-inputs`; the count stays seven. `epics.md` and `test-design-epic-1.md` carry `Amended 2026-10-01 in Story 1.67's build:` paragraphs.
- The plan's refusal list says "a configuration that cannot be digested". `digestArtifact` canonicalizes any JSON object and never throws on one, so the refusal that exists is the schema: the configuration is held to eval-quality's `evaluator-configuration` schema, as `run` holds it.
- The command does not run `check`. It reads the evaluator, the contract, the labelled file and the configuration, and the reference says to run `check` once the judgments file is written.
- Vendor claims: none entered plan or guide text beyond eval-quality's own functions (`digestArtifact`, `digestBytes`, the `evaluator-configuration` schema), all read through the installed 4.7.0 engine in the tests.

## Revert observations

Each exercised once on a scratch copy of the final tree (`cp -c`, `.git` and `node_modules` included), by applying one edit that undoes or breaks the change, running the named test, and restoring the file.
The unmodified copy passes: `--calibration-inputs-only` 135 checks, `test:evaluate-check` 987, `test:evaluate-guidance` green.
The counts are failed checks of `--calibration-inputs-only` (13 to 98 checks run before the case stops; 135 when it passes) unless named otherwise; the driver and its log are in the session scratchpad.

- AC 1, an input the verification does not derive (the emitter adds a member to `scorerInput`): 4 fail (the emitted items, the hand-derived inputs, `check` exits 10 over judgments built from the output).
  The shared observation derivation changed (the operation id): 3 fail; output and verification moved together, so `check` still agreed, and only the hand-written literal failed (the fixture's hand-built copy imports the runtime's `calibrationObservation` and `calibrationOperationId`, so it follows a change in `calibration.js`; it fails the copy only for a change inside `scorerInputFor`).
  The shared digest rule changed (the bindings kept in the digest): 3 fail.
  The emitter digesting the configuration with its bindings: 1 fail (asking with the bindings present).
  `calibrationDigest` left out: 4 fail.
  Items out of the labelled order (sorted by criterion): 1 fail, in the two-rubric case.
  The ask ignored by `digest` (the option removed): 1 of 3 checks fail (no JSON document).
- AC 2, the label added to each item: 5 fail (the text search for `expectedLevel`, the item keys, the literal comparison, the hand-built comparison and `check`).
- AC 3, the guide sentence removed: 1 `test:evaluate-guidance` failure naming the sentence; the heading renamed: 14 failures.
  The reference page without the command: 1 of 135.
- Refusals, each guard removed once: evaluator kind check 4; no-rubric check 1; labelled-file check 11 (the absent file crashes with exit 1); configuration read through a link 4; schema check 3 to 4; records-directory check 3; a link accepted as the records directory 8; a string evaluator named `undefined` 1.
- Read-only: the ask rewriting `corpus-index.json` with identical bytes: 16 fail (the modification time shows it); a refusal exiting 0: 15 fail.
- `check.js` no longer calling the shared `recordsDirectory` (the raw `realpathSync` back): 6 of 987 `test:evaluate-check` checks fail.

## Gates

- Engine check (`evaluateTarget` is a function, eval-quality 4.7.0) exit 0 at the end of the build.
- Green on the final tree: `test:evaluate-records` 264, `test:evaluate-evaluators` 486, `test:evaluate-agents` 330, `test:evaluate-check` 987, `test:evaluate-guidance`, `test:evaluate-boundaries` 427, `test:schema-versions` (68 held), `test:schemas`, `test:boundary`, `test:direction`, `test:doc-counts`, `test:shards` 117, `test:ci-coverage` (106 steps), `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
- `git diff -- package.json package-lock.json` is empty: no dependency, lockfile or peer change and no `file:` or `.tgz` spec.
- Measured weight: the `records` group (`test:evaluate-records`) took 106.7 seconds with the cases and 92.1 seconds at `HEAD` on the same quiet machine, +14.7 seconds locally (the new cases alone, `--calibration-inputs-only`, 15 seconds); at the 1.9 local-to-CI ratio Story 1.44 measured, about +28 seconds, so `tools/test-shard-weights.json`'s `test:evaluate-records` 120.2 becomes about 148.
  `test:evaluate-guidance` gains one assertion and `test:evaluate-check` no case; their weights stay.
  The weights file is the coordinator's to update; this change did not touch it.
- Unrun: the full `npm test` (CI shards).

### Gates after review round 1

Green on the final tree: `test:evaluate-records` 321, `test:evaluate-evaluators` 486, `test:evaluate-agents` 330, `test:evaluate-check` 987, `test:evaluate-run` 571, `test:evaluate-workflow` 165, `test:evaluate-ci`, `test:evaluate-interpret`, `test:evaluate-guidance`, `test:evaluate-boundaries` 427, `test:schema-versions`, `test:schemas`, `test:boundary`, `test:direction`, `test:doc-counts`, `test:shards` 117, `test:ci-coverage`, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`; engine check exit 0; `git diff -- package.json package-lock.json` empty.
Measured weight, same machine in the same hour: `test:evaluate-records` 119.9 seconds against 88.0 at `35a02492`, +31.9 seconds locally (round 0 added 14.7; the sealed-against case, one more harness run, adds about 17); at the 1.9 local-to-CI ratio about +60 seconds, so `tools/test-shard-weights.json`'s `test:evaluate-records` 120.2 becomes about 181.
No other weight changed.

### Gates after review round 2

Green: `test:evaluate-records` 330, `test:evaluate-check` 987, `test:evaluate-run` 571, `test:evaluate-guidance`, `test:evaluate-boundaries`, `test:direction`, `test:schema-versions`, `test:doc-counts`, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
Measured weight, other lanes' suites running alongside, two runs each: `test:evaluate-records` 130.0 and 133.8 seconds (131.9) against 92.8 and 90.1 (91.4) at `35a02492`, +40.5 seconds locally, a ratio of 1.44.

## Build review

Builder Analyze (delta, five lenses) found 0 critical, 0 high, 6 medium and 4 low.

### Fixed (all ten)

- leanness-1, enhancement-4: the hand-derivation prose (digest recipe, order rule) was cut; the pinned sentence stays.
- leanness-2, determinism-1: the labelled-file binding is stated once, as the command's `calibrationDigest`; the minimum-agreement binding is named as the one value the command does not print.
- leanness-3, enhancement-2: the exit 10 list became one clause with the meaning (a non-`records` evaluator or no rubric needs no judgments file; any other finding names the file to fix).
- enhancement-1: the guide says to run the command again and recopy after editing the configuration or the labelled file.
- architecture-1, enhancement-3: the reference documents the option, the guide's link target now does.
- enhancement-5: answered by splitting the paragraph into three; a numbered list would break the guidance test's single pinned procedure sentence.
- Skipped: none. Path scan unchanged against main (`SKILL.md` bare `_bmad`, `references/adapters.md` `../`).

### Code review triage (three layers over the diff)

| Finding                                                                                             | Verdict | Evidence and route                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No case for a linked records directory or an `evaluation.json` that is no object (verification gap) | medium  | the link refusal was pinned only for `check`; patched with link, under-link and nested-link cases and an array `evaluation.json`, and the revert (the link accepted) fails 8 |
| Doc, header and `--help` unguarded (blind)                                                          | medium  | patched: `checkCalibrationInputsDocumented`, revert fails 1                                                                                                                  |
| Evaluator that is a string reads `undefined` (edge)                                                 | low     | patched, with a case and a revert                                                                                                                                            |
| Unknown criterion in the labelled file reaches the item lookup (blind)                              | false   | `calibrationProblems` rejects it first; a case now pins the refusal                                                                                                          |
| `digestArtifact` can throw, unguarded (edge)                                                        | false   | it canonicalizes a parsed JSON object that already met the schema and does not throw; the verification's `catch` is defensive, so a guard here would be dead code            |
| `withBytes` restore writes through a link (blind)                                                   | low     | patched: the file is removed before it is rewritten                                                                                                                          |
| `--evaluation` naming `evaluation.json` untested (blind)                                            | low     | patched in the main flow                                                                                                                                                     |
| `evaluation.json` and `contract.json` read through a link (edge, blind)                             | false   | `check` reads both with plain reads too; the folder is resolved by `resolveEvaluationFolder`, which follows the link by design                                               |
| `records` of `''` or `.` resolves to the folder (edge)                                              | low     | `check` also reaches it through its own records rule and `evaluation.json`'s schema; the command does not run `check`, and the reference now says so                         |
| `contract.rubrics` not an array reads "declares no rubric" (edge)                                   | low     | the contract's schema finding belongs to `check`; the fix adds a branch for a state the contract schema already refuses                                                      |
| Absent or linked configuration worded "cannot be read as JSON" (blind)                              | low     | `check` uses this wording and its tests pin it; the finding also carries the cause (`ENOENT`, `it is not a regular file`)                                                    |
| No rubric or non-`records` exits 10 though no judgments file is needed (blind)                      | false   | the owner-delegated decision in the frozen block; the guide says what the exit means                                                                                         |
| `--calibration-inputs-only` duplicates the group filter (blind)                                     | false   | the house idiom for revert checks (`--imported-calibration-only`, `--frameworks-only`)                                                                                       |
| Stderr summary line, pipe truncation, a corpus index beside the ask (blind)                         | false   | the summary is one line; `process.exitCode` is set and the process is not exited, so stdout drains; the snapshot covers the committed `corpus-index.json`                    |
| `calibrationProblems`' minimum-agreement fault filed under the labelled file (verification gap)     | low     | `check` files the same message under the same path; unchanged convention                                                                                                     |
| Diff omits the story record and the sprint row (blind)                                              | false   | the review diff held code, tests, docs, skill and plan text; the record is this file                                                                                         |
| Stale `digest` description in the reference intro and `CHANGELOG` shape (blind)                     | low     | default `digest` is unchanged and correct; the option has its own subsection                                                                                                 |

### Left undone, reported

- The command runs no `check`; the evaluation's other rules (a records directory spelled `.`, the contract schema) stay `check`'s.
- No Python or other-language sample harness: the guide and the reference teach the sequence; a harness in any language spawns the command and parses stdout.

## Review round 1

Two Opus lenses reported on PR #289 (adversarial and test quality).

### A1: records sealed against an earlier configuration (medium, fixed here)

Reproduced first, on a copy of the tree before the fix: records sealed by the harness's own run, then the minimum moved from 1 to 0.5 in `evaluation.json` and in the configuration's binding (the ask-then-bind sequence): `check` exit 0, `run` exit 0, `score` exit 3 (`evaluator configuration digest mismatch` from eval-quality).
Root cause, pre-existing: each imported record and isolation manifest names `evaluatorConfigurationDigest`, the digest of the full configuration with its bindings; `score` skips its recorded-digest comparison for imported records (`if (sealed === null || imported) continue;`), and neither `check` nor `run` held an imported file to the imported configuration's digest.
Fix, small and local: `importRecords` (`cli/lib/evaluate/records-evaluator.js`) takes the engine, computes `engine.digestArtifact(configuration, 'EvaluatorConfiguration')` once, requires every record's and every isolation manifest's `evaluatorConfigurationDigest` to equal it (`EvaluatorLayerError`, so `run` exits 10 with nothing copied, the finding naming the file and both digests), and returns it as `configurationDigest`; `run.js` records that value instead of computing the digest a second time (two lines: `engine` passed in, `imported.configurationDigest` out).
`check` reads no imported record or manifest, so it does not repeat the comparison and stays as it was.
Docs: the reference lists the check among what `run` verifies, the exit 10 row names it, and states the bind-before-seal sentence; the evaluator guide says the same in the records layout paragraph (every records evaluation) and in the calibration paragraph (the ordering), with `digestArtifact` of the whole file named so the harness does not seal against the printed `scorerConfigurationDigest`; CHANGELOG has a Fixed entry; `epics.md` and `test-design-epic-1.md` carry round-1 amendments.
Suites that import records or plant a records evaluator ran against the fix (see Gates); none relied on the gap.
Test: `checkImportedFilesSealedAgainstTheConfiguration` (group `records`): `check` 0 and `run` 10 for records sealed against the earlier configuration (naming `records/P-001/record-1.json`, both digests, nothing copied), then 10 for an isolation manifest left behind, then `run` 0 and `score` 0 once every file names the final digest.
Reverts: the whole comparison removed, 12 of 191 `--calibration-inputs-only` checks fail (the sealed-against-old-configuration run exits 0, which is what leads to `score` exit 3); the manifest comparison removed, 5 fail; the record comparison removed, 1 fails (the refusal no longer names the record).

### Review round 2

- R2-1: `engine.digestArtifact` throws eval-quality's `RuntimeFault non-canonicalizable-value` for a configuration that meets the schema and passes `check` (a number such as `1e21`, a lone surrogate); the throw was no `EvaluatorLayerError`, so `run` exited 12 with a raw stack for an authoring defect.
  Reproduced first: a no-rubric records project whose configuration gains `decodingParameters["tea.harnessScale"] = 1e21` gave `check` 0 and `run` 12.
  `importRecords` now wraps the digest and throws `records/evaluator-configuration.json cannot be digested as an EvaluatorConfiguration: <reason>` (the wording `records-calibration.js` uses), so `run` exits 10 with nothing copied; the case lives in `checkRecordsEvaluator` (group `records`), which already holds the no-rubric project, so it adds no run.
  Revert (the `try`/`catch` removed): the case fails, `run` exits 12.
- R2-3: the sealed-against case now leaves one later record behind (`records/P-002/record-3.json`) with every other record and manifest fixed, and expects the refusal to name it; then the second probe's manifest is held the same way.
  Revert (only the first record of each set compared): 5 of 197 `--calibration-inputs-only` checks fail.
- R2-4: `harnessProject` writes `policy/judge-calibration.json` as compact bytes before the harness's own run, so a digest of the re-serialized value differs from the digest of the file.
  Reverts: the labelled digest taken from `JSON.stringify(labelled.value, null, 2)` at the `bindingProblems` site, 19 of 92 `--imported-calibration-only` checks fail (a verified records run exits 10); at the `runCalibration` site, 19 of 92 fail (the harness configuration binds another digest than the file's bytes).
- R2-5: `checkImportedFilesSealedAgainstTheConfiguration` also fails when its final `run` exits 0 with no run directory of its own, so the guard of T5 is in the three cases (`checkImportedRubricCalibration`, `checkCalibrationInputs` and this one).
- R2-2: the header comment of `records-evaluator.js` lists the configuration-digest check among the run's checks and no longer leaves the configuration digest to eval-quality.
- CHANGELOG and the reference's exit 10 row name the refusal.

### A2 to A5

- A2, A3: the guide says the printed values hold for the contract, the configuration and the labelled file ("any of them"), and that any other `judge-calibration` finding "says what to fix".
- A4: `recordsDirectory` returns null for a records path with an empty, `.` or `..` segment (the evaluation schema's rule); `check` shares the helper and `test:evaluate-check` still passes (987). New refusal cases: a path out of the folder, `records/../records`, an empty path, `.` and `records//`.
  Revert (the segment rule removed): 16 of 191 fail.
- A5: `labelledDigest(labelled, engine)` in `calibration.js` is the one digest of the labelled file's bytes; `bindingProblems`, `calibrationInputs` and `runCalibration` call it.

### Test-quality lens (T1 to T5), cases ported from the prototype

- T1: the order case writes the labelled file as compact bytes and asserts `calibrationDigest` is the digest of those bytes. Revert (digest of the re-serialized value): 1 fails.
- T2: the order case adds a second interaction step with its own operation, a `json` item and a criterion on that step. Reverts: `responseKind` dropped, 1 fails; `calibrationOperationId` returning the first step's operation, 1 fails.
- T3: two rubrics share the criterion id `RC-101` on different channels. Revert (lookup by criterion id alone): 14 of 23 checks fail (the ask exits 1).
- T4: a linked labelled file is refused (`regular in-folder file`) and a labelled file with two faults prints both messages. Reverts: the link followed, 4 fail; only the first problem printed, 1 fails. The missing `judgeCalibration.minimumAgreement` case (optional) was not added.
- T5: `checkImportedRubricCalibration`, `checkCalibrationInputs` and (R2-5) the sealed-against case now fail when `run` exits 0 without a run directory of its own; the guard has no separate revert, since no fixture makes `run` exit 0 with no new directory.
- T6: the AC 1 note above is corrected.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-records && npm run test:evaluate-evaluators && npm run test:evaluate-agents && npm run test:evaluate-guidance && npm run test:evaluate-check` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:schema-versions && npm run test:schemas && npm run test:boundary && npm run test:doc-counts && npm run test:shards && npm run test:ci-coverage && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check && npm run docs:validate-links` -- expected: green
