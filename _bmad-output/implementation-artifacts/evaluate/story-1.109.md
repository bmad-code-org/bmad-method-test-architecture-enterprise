---
title: 'Story 1.109: Partition gameability degenerate responses'
type: 'feature'
created: '2026-10-04'
status: 'done'
baseline_commit: 'a12914a012325b6bd1c3fdfea1839cfd47aebaad'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.109)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.109)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-9, AD-22)'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.51.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.107.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.14.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.34.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.109 to lane 1">

## Intent

**Problem:** Story 1.51 refuses a gameability probe beside a `partitionPlan`. A gameability probe's degenerate response (`corpus/gameability/<probeId>.json`) answers every plan step of `contract.json`, so under a plan a held-out step has no file it can be answered from without putting its ID in a file the development run reads.

**Approach:** The degenerate response splits where the plan does. `corpus/gameability/<probeId>.json` keeps answering the steps of `contract.json` (shared and development-only), and a new file, `corpus/held-out/gameability/<probeId>.json`, sealed beside the held-out plan, answers the steps of the held-out plan in the same shape. An arm answers only the steps of the view it runs (`answersForView`): the development view reads the first file and never opens the second, the held-out view takes the shared steps from the first and its own from the second, and the both view takes every step from both. `check` holds both files to the same rules and replaces the 1.51 refusal.

## Boundaries & Constraints

**Always:** With no `partitionPlan`, every committed fixture, baseline and replay stays byte-identical. A development run never opens the held-out plan or the held-out answers, and a corpus-index comparison for it leaves both out. `check` findings name paths and IDs, name a step of the held-out plan by its ID only when it has the schema's shape, and never quote the sealed file (a parser's message, a schema error's key). Every gameability probe answers every step of the plan, because the both view runs each probe over the whole plan. The engine and `degenerate-response.schema.json` do not change.

**Never:** Designate one oracle per behavior in the both view (Story 1.110). Add a field to the probe schema. Invent a capability nobody needs (no per-partition answer format, no held-out naive oracle from the plan).

## I/O & Edge-Case Matrix

| Scenario                     | Input / State                                                                                                 | Expected Output / Behavior                                                                                                                          | Error Handling |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Development view             | Gameability probe in the development partition, `--partition development`                                     | Arm answers the steps of `contract.json` from `corpus/gameability/<probeId>.json`; the held-out answers are never opened; the record names one file | N/A            |
| Held-out view                | Gameability probe in `heldOutProbes`, `--partition held-out`                                                  | Arm answers the shared steps from the first file and the held-out plan's from the second; no development-only answer is handed on                   | N/A            |
| Both view                    | No `--partition`                                                                                              | Every probe's arm answers every step from both files                                                                                                | N/A            |
| Answer missing               | A step of `contract.json` or of the held-out plan has no answer                                               | `check` finding by probe file and step ID (held-out step by its ID when shaped)                                                                     | Exit 10        |
| Held-out answers file absent | The plan declares a step and the file is absent                                                               | `check` finding naming the probe and the path                                                                                                       | Exit 10        |
| Misplaced step               | A held-out step in the development file, a development or shared step or a free-text key in the held-out file | `check` finding; a free-text key is named by place (`steps entry 1`)                                                                                | Exit 10        |
| Unreadable held-out answers  | Unparsable, off its schema, a link, a link directory                                                          | `check` and a held-out or both run refuse by path; a development run is unaffected                                                                  | Exit 10        |
| Held-out probe naive oracle  | A held-out probe's `naiveOracle` reads a development-only step                                                | `check` finding on the probe file                                                                                                                   | Exit 10        |
| Plan declares no step        | Held-out plan with an empty `interactionPlan`                                                                 | The answers file is not required, and not read by a run; one that answers a step is a `check` finding                                               | N/A / Exit 10  |
| No `partitionPlan`           | Any existing fixture                                                                                          | Source bytes in every view; the response record is the one file                                                                                     | N/A            |

</frozen-after-approval>

## Premise Check

What the code and the engine hold, read before the design.

- **How the degenerate response is built today.** `gameability.js` (`syntheticPort`, `degenerateArm`) answers each request of an arm from `steps[stepId]`, where `steps` is the `steps` object of `corpus/gameability/<probeId>.json` (`degenerate-response.schema.json`: one `{ stdout, stderr, exitCode }`, `{ isError, structuredResult? }` or `{ status, headers?, body? }` per plan step). `preflight.js` `gameabilityProbes(folder)` read that file for every gameability probe (`corpus/gameability/<probeId>.json` through `degenerateResponsePath`) and handed `steps` whole to `qualifyGameabilityProbes` and, through `run.js`, to each trial's `degenerateArm` and to the sealed-brief agent's `degenerateAnswer`. The arm itself executes the plan of the contract it is given, which under a plan is already the view (Story 1.51), so it requested only the view's steps; what a plan could not do was name a held-out step in `corpus/gameability/`.
- **Where a held-out step ID would reach a development file or artifact.** The answers file, if it held a held-out step (a development file, hashed into `corpus-index.json` and read by every run). The run's evidence records `degenerateResponse: { path, digest }` only (no step IDs), the arm's `steps` records are the view's, and `check` prints a step key it finds in a file. So the one leak is the answers file itself.
- **Which per-partition files exist.** None for the held-out partition. `corpus/gameability/<probeId>.json` exists today (one per probe, one answer per plan step of `contract.json`). The story introduces `corpus/held-out/gameability/<probeId>.json`, the held-out plan's answers, under the sealed `corpus/held-out/` that `corpus-index.json` digests. `corpus-index.js` skipped only the plan file for a development comparison, so it gains a directory form of `unread`.
- **What a gameability probe's expected response is.** The same schema in both files. The probe names its naive oracle (an oracle of another behavior, held by the response) and the disciplined oracle is the probe's behavior's own; the response must satisfy the first and violate the second in every view the probe runs in.
- **What `check` does today for a missing answer.** `checkGameability` names it by file and step ID (`answers no response for interaction plan step <id>, so the gameability arm cannot run the plan`), exit 10. Under a plan, `checkPartitionPlan` refused any gameability probe (`is a gameability probe; its degenerate response answers one plan, so a partitionPlan does not partition gameability probes yet`), the only place that refused it: `preflight`, `run`, `ci` and `score` ignored the combination.
- **Engine.** No engine change. `qualifyProbe` takes the candidate and its home operation, and a gameability probe has none; the both view's gameability arm is answered and qualified (both oracles of B-002 must be violated), then scored `caught: false` by eval-quality, which designates an oracle only for a behavior that names exactly one (Story 1.110's gap, as for the defect probes of B-002).

AC amendments, recorded in `epics.md` and `test-design-epic-1.md`: the Given and Then named a response "the folder keeps beside the plan for its partition" and a `check` that names a missing answer by step ID. The development `check` never opens the plan, so it cannot name a held-out step; `tea-evaluate check` has no `--partition` and opens the plan, and a held-out or both `preflight` and `run` run the same check. The criterion now states the two files, the allowlist per view, that a development run reads no byte of the held-out answers, and where each missing answer is named.

What the arm answers per view:

| View        | Before the story                                                                 | After the story                                                                                              |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| development | refused beside a plan; with no plan, every step of `contract.json` from one file | the steps of `contract.json` from `corpus/gameability/<probeId>.json`; the held-out answers are never opened |
| held-out    | refused beside a plan                                                            | the shared steps from the first file, the plan's steps from `corpus/held-out/gameability/<probeId>.json`     |
| both        | refused beside a plan                                                            | every step, from both files                                                                                  |

## Code Map

- `cli/lib/evaluate/partition.js` -- `HELD_OUT_ANSWERS_DIRECTORY`, `heldOutResponsePath` and `readHeldOutResponse` (a regular file directly under `corpus/held-out/gameability/` of the folder, through no link and under the on-disk spelling of the directory (`realpathSync.native`, here and in `readHeldOutPlan`), refusals naming the path and never a byte; `absent` marks a missing file), and the exports `named`, `STEP_ID`, `PROBE_ID` that `check` shares.
- `cli/lib/evaluate/gameability.js` -- `answersForView` (the allowlist: the view's steps, in the view's order, from the two answer sets) and `responseRecord` (the response file's path and digest, and the held-out answers' under the held-out and both views); `qualifyGameabilityProbes` takes `heldOut` per probe.
- `cli/lib/evaluate/preflight.js` -- `gameabilityProbes(folder, { view, selectedProbeIds })` filters to the selected probes before reading, reads the held-out answers only for a view that holds a plan declaring a step, and hands each arm `answersForView`.
- `cli/lib/evaluate/corpus-index.js` -- `unread` takes a directory form (a trailing `/`), so a development comparison leaves out `corpus/held-out/gameability/`; `filesUnder` decides each entry against the skipped set by its path before any listing, type check or read (case-folded, so another spelling of a sealed path on a case-insensitive file system stays unread), and a directory or file the process cannot open is a refusal naming the path, never an uncaught `EACCES`.
- `cli/lib/evaluate/workspace.js`, `cli/lib/evaluate/preflight.js` -- `adopterTreeState` and `treeDigest` take `sealed` directories, whose files enter a tree reading by `lstat` size, modification time and mode with no byte read, a path `lstat` cannot reach by its error code; a development run under a plan seals `corpus/held-out/` of its folder.
- `cli/lib/evaluate/check.js` -- the 1.51 refusal is gone; `checkAnswers` (one rule set for both files, named by `wording` and `name`), `checkGameability` over `contract.json`'s steps, `checkHeldOutAnswers` over the held-out plan's steps for a check that opens a sound plan, the held-out naive-oracle rule, `plainSchemaFindings` takes a rule, the development index comparison leaves out the answers.
- `test/test-evaluate-partition-plans.js` -- `gameabilityLayer` (probes P-005, development, and P-006, held-out, both on B-002 with naive oracle O-001, and their answer files), `planProject` takes the layer, the pure `answersForView` cases, the `check` cases, the development-never-opens cases, and the run, score and replay flow in all three views. `test/test-evaluate-guidance.js` -- markers and five mutants for the corpus guide.
  Story 1.110 split the suite for CI: the gameability flow cases now sit in `test/test-evaluate-partition-plans-attempts.js` and `gameabilityLayer` in `test/lib/evaluate-partition-plans-harness.js`; the pure and `check` cases stay in `test/test-evaluate-partition-plans.js`.
- `docs/reference/tea-evaluate-cli.md`, skill `references/corpus.md`, `CHANGELOG.md`, `epics.md`, `ARCHITECTURE-SPINE.md` (AD-22), `test-design-epic-1.md`, `sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**

- [x] `partition.js`, `gameability.js`, `preflight.js`, `corpus-index.js` -- the held-out answers file, the per-view allowlist, the unread directory
- [x] `check.js` -- the refusal replaced by the answer rules over both files
- [x] fixtures and cases in `test-evaluate-partition-plans.js`, guidance markers and mutants
- [x] docs, skill reference through `/bmad-workflow-builder` Edit headless, CHANGELOG, AD-22 amendment, `epics.md` and test-design amendment, sprint row `review`
- [x] Revert each acceptance check once and record the observation, mutant table and the wrong-answer case below

**Acceptance Criteria:**

- Given a gameability probe in each partition and a held-out plan step, when each partition and the both view run the gameability arm, then the arm answers the steps of its view and no other, a development run reads no byte of the held-out answers, and no development file, run artifact, `check` output or `preflight` output of a development run holds a held-out step ID.
- Given a missing, misplaced or unreadable answer, when `check` runs, then it names the probe and the step ID (a held-out step by its ID only when shaped), never quotes the sealed file, and no longer refuses a gameability probe beside a `partitionPlan`.
- Given any committed fixture, baseline or replay with no `partitionPlan`, then no byte changes.

## Implementation Notes

- The held-out answers are required for every gameability probe, whichever partition it belongs to, because the both view runs each probe over the whole plan and a probe of the development partition needs an answer to the held-out step there. A held-out probe's `contract.json` file answers the development-only steps for the same reason.
- A held-out probe's `naiveOracle` is an oracle of `contract.json` (the probe file is a development file, so the plan's oracle IDs stay out of it) that the held-out view keeps. An oracle that reads a development-only step leaves that view and the arm's resolve would throw, so `check` names it; the rule needs no plan and holds in every partition.
- `answersForView` filters by the view's step IDs, so a file that holds a step the view does not declare hands none of it on. The allowlist is a defense, since `check` already refuses a step a file should not hold; the pure case holds it.
- A development comparison of the corpus index leaves out the whole `corpus/held-out/` directory, not file by file, because a development check cannot list what a probe's held-out answers are called without reading the probes' IDs, the schema puts the plan directly under it, and the directory is sealed as one (round 2: round 1 skipped the plan and `gameability/` alone, so a link or an unlistable directory beside them still stopped a development run).
- The skipped set is an allowlist decided by path before the walk looks at an entry, so the development comparison neither lists nor opens what the sealed directory holds and a development run refuses none of it, and the held-out and both runs and `check` walk it and refuse a link, a FIFO or an unopenable path by name.
- The adopter-tree reading that brackets a run opens every path `git status` names, so a development run seals `corpus/held-out/` there too: the held-out plan and the answers enter the reading by `lstat` metadata, which an edit still moves, and no byte is read. The reading lists the sealed directory, since the tree digest walks it, and records the error code of a path it cannot list or `lstat` (a directory at mode 0o444 lists and cannot be entered).
  Nothing the reading holds is recorded beyond `adopterTree.unchanged`, so no replay byte changes.
- The response record carries the held-out answers as `heldOut: { path, digest }` inside `degenerateResponse`, so every site that writes the record is unchanged and a run with no plan writes the record it always did.

## Revert Observations

Each acceptance check was undone once in a scratch copy of the tree (`mut-1.109-build-<name>`, one change per mutant, `node_modules` linked, the copy removed after).
The copy ran a trimmed `test-evaluate-partition-plans.js` holding the Story 1.109 section only (the pure, `check`, development-never-opens and flow parts), so each mutant stopped at its first failure within a minute.
Every mutant failed.

| Mutant                                                                                                    | Check that failed                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M17: an arm answers the whole plan (the both-view contract and every answer in every view)                | The development partition's flow case: the qualification arm answered `shared-run`, `development-run` and `held-out-run` where the view has two steps. This is the story's own revert check.                                 |
| M2: a development run reads the held-out answers                                                          | The development-never-opens case: a development `preflight` over an absent answers file died with `PartitionPlanError: corpus/held-out/gameability/P-006.json cannot be read (ENOENT)`, exit 12.                             |
| M1: `answersForView` hands on every answer of both files                                                  | The pure case: a development view was handed a held-out answer that sat in the development file.                                                                                                                             |
| M3: the answers are read whenever a plan is held, declared steps or not                                   | The no-step case: a held-out preflight of a plan that declares no step failed with `cannot be read (ENOENT)`.                                                                                                                |
| M4: the unread directory form of `corpus-index.js` is an exact path                                       | A development `preflight` over held-out answers edited since the index was written exited 10 with `corpus-index.json is stale`.                                                                                              |
| M15: a development index comparison reads the held-out answers (`check` leaves the directory out of it)   | The same stale-index case.                                                                                                                                                                                                   |
| M5: `check` reads no held-out answers                                                                     | `a held-out answer left out of P-005`: `check` exited 0 where the case expects 10. This is the story's missing-answer revert check.                                                                                          |
| M6: the held-out answers are required whatever the plan declares                                          | The no-step case: a plan with no step needed the answers file.                                                                                                                                                               |
| M7: an absent answers file is reported by the reader's message                                            | `the held-out answers of P-005 absent`: the finding lacked the probe and the path sentence.                                                                                                                                  |
| M7b: an unreadable answers file is not reported                                                           | `an unparsable held-out answers file`.                                                                                                                                                                                       |
| M8: a held-out step key is printed whatever its shape                                                     | `a free-text step in the held-out answers, first`: the finding printed the `canary-` key.                                                                                                                                    |
| M9: a probe ID of no shape reaches the answers path                                                       | The `escape-probe` case: a finding named `corpus/held-out/gameability/escape-probe`.                                                                                                                                         |
| M10: the held-out naive-oracle rule never fires                                                           | `the naive oracle of a held-out probe that reads a development-only step` exited 0.                                                                                                                                          |
| M10b: the naive-oracle rule applies to every gameability probe                                            | The development-probe control: P-005 with the same naive oracle was named.                                                                                                                                                   |
| M11: the response record omits the held-out answers                                                       | The flow case: the held-out and both runs' response record was the response file alone.                                                                                                                                      |
| M12: the answers directory is not held to the folder                                                      | `a linked answers directory`.                                                                                                                                                                                                |
| M13: the answers file may be a link                                                                       | `a linked answers file`. The first spelling survived: the `corpus-file` finding of the corpus index says `is not a regular file` too, so the case now anchors on the gameability finding's own line.                         |
| M14: the answers schema findings carry the `partition-plan` rule                                          | `a held-out answer off its schema`.                                                                                                                                                                                          |
| M16: a held-out step answered in the development file is accepted                                         | `a held-out step answered in the development answers of P-005`.                                                                                                                                                              |
| M18: the exit-11 message names the response file alone                                                    | The wrong-answer case: the message did not name `corpus/held-out/gameability/P-006.json`.                                                                                                                                    |
| M19: the response record digests re-serialized answers (`JSON.stringify(JSON.parse(bytes))`) with no plan | `test:evaluate-arms` failed: `the gameability evidence names the degenerate response ... digest`, the bytes-changed-without-a-plan check of the test design (row 4). Run on the whole suite, since it holds no trimmed form. |

The five gameability markers and mutants added to `test:evaluate-guidance` (answers sentence, the held-out file placed in `corpus/gameability/`, the both-files sentence, the naive-oracle sentence, the check sentence) and the two example mutants (example removal, an example that answers a step of `contract.json`) each fail the gate, which passes only when every mutant fails.

The wrong-answer case: P-006's held-out answer for `held-out-run` says `verdict: accepted`, which satisfies the disciplined oracle O-101.
`preflight --partition held-out` exits 11, `probes/P-006.probe.json: over the degenerate response corpus/gameability/P-006.json and corpus/held-out/gameability/P-006.json, the disciplined oracle O-101 of B-002 is held where it must be violated`.
The message first named the response file alone, which points at the wrong file for this defect, so it now names both (mutant M18).
A `preflight` with no flag over the same file qualifies the probe, because the both view gives B-002 two oracles and an arm is qualified when any of them is violated: the development answer still violates O-002.
That is the both view's behavior with two oracles (Story 1.110), and the held-out partition's own preflight is where the answer is held to O-101.

### Round 1 review fixes

Three reviewers (blind, edge case, verification gap) reproduced seven findings in scratch copies.
Each was checked against the code and held.
The fixes follow, each with the mutants that prove its case (scratch copies `mut-1.109-fix1-<id>`, one change per mutant, `node_modules` linked, the copies removed after; the trimmed Story 1.109 section of `test-evaluate-partition-plans.js`, or the sealed-directory case of `test-evaluate-run.js` for the tree reading).
The X-series are the reviewers' survivors, numbered by finding.

| Finding | Fix                                                                                                                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `filesUnder` tests each entry against the skipped set before any listing, type check or read, and does not descend into a skipped directory; an unlistable directory or unreadable file is a `corpus-file` refusal naming the path (exit 10).                        |
| 2       | `adopterTreeState` and `treeDigest` take `sealed` directories whose files enter the reading by `lstat` size, modification time and mode; a development run under a plan seals the folder's `corpus/held-out/` (the plan and the answers).                            |
| 3       | `readHeldOutResponse` and `readHeldOutPlan` compare `realpathSync.native`, so the on-disk spelling decides, and the skipped set of the index comparison is case-folded.                                                                                              |
| 4 to 6  | Cases only: the naive oracle that reads a development-only step through `direction.evidenceTargets` alone, a held-out step named `constructor` (pure and through `check`), and a free-text key of lower-case letters, digits and hyphens (`canary-`) named by place. |

| Mutant                                                                                    | Check that failed                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| M20: the index walk decides a skipped entry after the type check and the listing          | The sealed-path case, `a linked answers file`: a development `preflight` read the sealed path (exit 10 where 0 is expected).                     |
| M20b: an unlistable directory of the index walk is not a refusal                          | `an answers directory nobody may open`: a held-out `preflight` ended with an uncaught `EACCES, scandir` stack.                                   |
| M20c: an unreadable file of the index walk is not a refusal                               | `an answers file nobody may open`: a held-out `preflight` ended with an uncaught `EACCES, open` stack.                                           |
| M20d: the skipped set is compared case-sensitively                                        | The case-variant case: a development `preflight` read `corpus/held-out/Gameability/`.                                                            |
| M21: a development run reads the adopter tree with no sealed directory                    | `an answers file nobody may open`: a development `preflight` ended with `EACCES ... open` at `fileDigest`, which is the reviewers' reproduction. |
| M21f: the tree reading seals the answers directory and not the held-out plan              | `a held-out plan nobody may open`: the same crash on the plan.                                                                                   |
| M21b: `adopterTreeState` hashes a sealed file `git status` names                          | `test:evaluate-confinement` case `the adopter-tree reading of a sealed directory`: the sealed file nobody may open ended the reading.            |
| M21c: `treeDigest` hashes a sealed file outside a repository                              | The same case: the bare tree digest threw on the sealed file.                                                                                    |
| M21d: `treeDigest` refuses a sealed directory it cannot list                              | The same case: the bare tree digest threw on the unlistable sealed directory.                                                                    |
| M21e: a sealed file enters the reading by its size alone                                  | The same case: a same-size edit of a sealed file left the reading unchanged.                                                                     |
| M22: the answers reader compares a real path that keeps the spelling it is given          | The case-variant case: a held-out `preflight` accepted `corpus/held-out/Gameability/` (macOS keeps the spelling it is given).                    |
| X1: the naive-oracle rule reads the oracle's `check` pointers alone                       | `the naive oracle ... through its evidence targets alone`: `check` exited 0.                                                                     |
| X2: `answersForView` takes the defined value of a step ID (`steps[stepId] !== undefined`) | The pure case: a held-out step named `constructor` was not answered from its own key.                                                            |
| X7: `check` finds an answer by its defined value                                          | `a held-out plan step named constructor that no answer covers`: `check` exited 0.                                                                |
| X12: a step key of lower-case letters, digits and hyphens is printed whatever its shape   | `an off-shape step of lower-case letters, digits and hyphens in the held-out answers`: the finding printed the `canary-` key.                    |

### Round 2 review fixes

A second review round (the regressions reviewer and CodeRabbit) found five defects, each reproduced and each held.
The mutants ran in scratch copies `mut-1.109-fix2-<id>` (one change per mutant, `node_modules` linked, the copies removed after; the trimmed Story 1.109 section of `test-evaluate-partition-plans.js`, or the sealed-directory case of `test-evaluate-run.js` selected with `--only`).
A control copy with no change passed both.

| Finding | Fix                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A       | A development comparison passes the whole `corpus/held-out/` directory (`HELD_OUT_DIRECTORY`, exported from `partition.js`) as the unread entry, since round 1 skipped the plan file and `gameability/` alone and a link, a FIFO, an unlistable directory or an edited file beside them still stopped a development run. `HELD_OUT_ANSWERS_DIRECTORY` stays in the two readers. |
| B       | The root guard of every case this story added reads `process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0`, since a mode does not deny the owner on Windows.                                                                                                                                                                          |
| C       | The sealed loop of `test-evaluate-partition-plans.js` gains a case-variant plan directory (`corpus/Held-Out/`), and `checkAdopterTreeSealed` gains a case-variant sealed directory inside and outside a repository.                                                                                                                                                             |
| D       | `treeDigest` records the error code of a sealed entry `lstat` or `readlink` cannot reach (`unstatted`), as it does for a sealed directory it cannot list, so a sealed directory at mode 0o444 reads outside a repository. Every claim that a development run neither lists nor opens the held-out files now says what each reader does.                                         |
| E, F    | The gate list and the weight line of the Completion Notes are corrected, and the story and its sprint row are `done`.                                                                                                                                                                                                                                                           |

| Mutant                                                                       | Check that failed                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M30: `readHeldOutPlan` compares `realpathSync` and not `realpathSync.native` | The case-variant plan directory case: a held-out `preflight` accepted the plan read through `corpus/Held-Out/`. The first version of the case survived, because a stale-index finding named the same path; the index now follows the edit and the refusal must be the reader's.           |
| M31: `sealedUnder` compares the paths in their own case                      | `test:evaluate-confinement` case `the adopter-tree reading of a sealed directory`: the reading opened the mode-0 `corpus/Held-Out/plan.json` (`EACCES, open` at `fileDigest`). The partition-plans case survives this mutant, because git reports the tracked spelling of the plan there. |
| M32: the development comparison skips the plan file and `gameability/` alone | The sealed case `a link directly under the held-out folder`: a development `preflight` refused `corpus/held-out/link.json` (exit 10 where 0 is expected).                                                                                                                                 |
| M33: `treeDigest` calls `lstat` on a sealed file with no guard               | The same confinement case, mode 0o444 on the sealed `gameability` directory outside a repository: `EACCES, lstat` on `gameability/P-001.json` ended the reading.                                                                                                                          |

## Spec Change Log

## Completion Notes

Observed beside the story: the both view runs every gameability probe and answers every step, and eval-quality scores the probes of B-002 `caught: false` there, since B-002 names two oracles in the both view and the engine designates an oracle only for a behavior with one.
The run asserts each both-view gameability probe is run, answered and scored, and holds no claim about `caught` (Story 1.110).
A sealed-brief agent beside a gameability probe under a plan answers from `degenerateAnswer`, which looks answers up through the view contract's plan, so it follows the view like the deterministic arm; no case runs that combination.

Round 1 review (seven findings, all held): the claims "a development run never opens the held-out answers" and "a development comparison leaves the sealed directory out" were false at the edges, because the corpus-index walk still listed and type-checked the sealed directory and the adopter-tree reading hashed every held-out file `git status` named.
Both now decide a sealed path by its path alone, in the walk and in the tree reading; the held-out plan, sealed since Story 1.51 and read the same way since Story 1.112, gains the same protection.
No frozen row changed meaning: the matrix row "Unreadable held-out answers" and the Boundaries sentence on a development run were true as written once the code matched them.
`test:evaluate-workspace` does not exist; `adopterTreeState` is read by `test:evaluate-run` and `test:evaluate-confinement` (`test-evaluate-run.js`), which hold the Story 1.112 cases for a commit by another session and a change to the adopter tree.

Gates run on the final tree (round 2): `test:evaluate-partition-plans`, `test:evaluate-confinement` (the sealed case sits in this group, which `test:evaluate-run` does not run, and `workspace.js` and `preflight.js` changed), `-run`, `-arms`, `-guidance`, `-check`, `-preflight`, `-ci` (replays committed fixtures, no byte change), `test:eval-replay`, `test:shards`, `eslint . --max-warnings 0`, `format:check`, `lint:md` and `docs:validate-links`.
`npm test` was not run; CI carries it.
CI shard impact: `test:evaluate-partition-plans` measured 546 s locally on the final tree (451 s after round 1) and its weight in `tools/test-shard-weights.json` moved from 780 to 890, the measurement times 1.63 rounded up. Another session was running evaluate suites on the machine during the measurement (load average 8), so the figure is an upper reading. The gameability section alone takes about 60 s. No npm script was added.
The skill reference `references/corpus.md` went through the `/bmad-workflow-builder` Edit flow headless (memlog entries, `quick_validate` ok, `scan-scripts` no findings, `scan-path-standards` none in `corpus.md`). `SKILL.md` and `references/ci.md` are untouched, since both are `sessionRead` keys of the committed live capture records, so `test:evaluate-ci` replays unchanged.
Builder Analyze (all five lenses, `.analysis/2026-10-04-r109/`, gitignored): 0 critical, 0 high, 9 medium, 6 low. Fixed in `corpus.md`: the every-step sentence (leanness-1), the pointer from the single-file sentence to the plan pair and the build-internal story name (architecture-1, enhancement-3), the naive-oracle refusal in the check paragraph (determinism-1), the way out when no shared oracle exists (enhancement-2) and a tagged worked example of the held-out answers, validated by `test:evaluate-guidance` (enhancement-1). Skipped, with the reason: the check paragraph's catalogue of findings (leanness-2, enhancement-4) is pinned by `test:evaluate-guidance` sentences that earlier stories added; the `SKILL.md` Stage 6 findings (leanness-4, leanness-5, architecture-2, architecture-3) pre-exist and `SKILL.md` is a `sessionRead` key; the reference-to-reference pointers (architecture-4) and the `customize.toml` header (customization-1) pre-exist this change.

## Verification

**Commands:**

- `npm run test:evaluate-partition-plans && npm run test:evaluate-arms` -- expected: pass
- `npm run test:evaluate-ci && npm run test:eval-replay` -- expected: pass, no replay byte changes
- `npx eslint . --max-warnings 0 && npm run format:check && npm run lint:md && npm run docs:validate-links` -- expected: pass
