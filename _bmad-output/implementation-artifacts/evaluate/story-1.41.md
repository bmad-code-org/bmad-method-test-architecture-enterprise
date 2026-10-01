---
title: 'Story 1.41: Confine score output during concurrent run-directory changes'
type: 'bugfix'
created: '2026-10-01'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8a77825b'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.8, 1.21 and 1.41)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.41 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-7, AD-12)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.21.md (the planted `scores` link refusal this story completes)'
  - '{project-root}/cli/lib/evaluate/run-directory.js (the held-directory writer `run` uses)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.21 refuses a planted `scores` link before `tea-evaluate score` writes, but `score.js` still writes through plain path operations (`mkdirSync`, `writeFileSync`, `replaceView`'s temporary file and rename) and hands the engine an absolute `--out` under `scores/<scoreInvocationId>/<probeId>/`. A process that changes the run directory while `score` runs (a second `score`, a target process left alive from the run) can swap `scores`, the invocation directory or a probe directory for a link between the check and the write, and carry an output into the adopter's working tree. `run` holds every directory it writes (AD-7, AD-12); `score` does not.

**Approach:** `score` writes through the same held-directory discipline as `run`. The run directory already exists when `score` starts, so `RunDirectory` gains an attach path: it holds the existing run directory, adopts an existing `scores` directory only when it is a real directory (held open, recorded by device and inode) or creates it exclusively, and creates the invocation directory and each probe directory exclusively. Every score artifact the runtime writes (`score.json` per probe and per invocation, `partitions.json`, `gap-view.json`, `interpretation.json`, the copied evidence artifact) goes through the writer, so a swap or a planted entry exits 12 before an external write. The engine's `--out` names a private staging file the runtime owns (the way `scoreAttempt` stages an evaluator attempt in `run.js`), and the runtime copies the produced artifact in through the writer; the stage record keeps the actual argv, stdout, stderr and exit code, so a direct CLI re-score with the recorded argv reproduces the persisted evidence byte for byte. No eval-quality change: the engine's exit codes and artifact are unchanged and the staging path is an ordinary `--out` value.

## Boundaries & Constraints

**Always:** reuse `RunDirectory` (`run-directory.js`) and `runEngineStage`'s `writer` option; the new attach path is a method on `RunDirectory`, not a second writer. `score` stays a read of the run's existing inputs through today's regular-file readers (the run's own artifacts were written by an earlier process, so a held digest does not exist for them); only score outputs are held. A refusal is a `RunDirectoryError`, which `score` reports as exit 12 with a message naming the entry, before any byte reaches a path outside the run directory. A normal repeated `score` succeeds and keeps both invocation directories and both sets of evidence. The engine check runs at start and end. `package.json`, the lockfile and the peer floor do not move.

**Never:** a second report shape, changing an engine exit code, rewriting argv to hide the staging path (the recorded argv is the argv that ran), copying an artifact the writer did not read back through the held directory, releasing or changing eval-quality, a new dependency, following any link at `scores`, an invocation directory or a probe directory.

**Decisions (coordinator, owner-delegated):**

- The staging directory for `--out` comes from the existing scratch helpers (`workspace.js` `makeScratchDirectory` and `releaseScratchDirectory`), as `scoreAttempt` does, so it lies outside the evaluation folder and is removed after each stage.
- The run directory is held through `fstat` of an open descriptor and confirmed before and after each write, exactly as `inDirectory` does for a created run directory; the attach path records the existing root and each directory the score creates.
- `replaceView` (partitions, gap view, interpretation) is replaced by the writer's `replace`, so the destination is a rename over a held-directory entry, never a path join on `runDirectory`.
- A planted link at `scores`, the invocation directory or a probe directory is refused as exit 12 without an engine call; the refusal message names which entry.
- The CLI reference gets a short "Score output integrity" paragraph: the exit (12), the safe location (inside the run directory only), and the staging of the engine's output.

## I/O & Edge-Case Matrix

| Scenario                                                   | Input / State                                               | Expected Output / Behavior                                               | Error Handling |
| ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | -------------- |
| Repeated scoring                                           | the same sealed run scored twice                            | both invocation directories exist with their evidence and `score.json`   | exit 0         |
| `scores` replaced by a link before the first write         | link to an adopter directory                                | no engine call, nothing written outside the run directory                | exit 12        |
| Invocation directory swapped for a link while `score` runs | a process replaces `scores/<id>` after it is made           | the next write is refused, adopter tree and external sentinels unchanged | exit 12        |
| Probe directory swapped for a link while `score` runs      | a process replaces `scores/<id>/<probeId>` after it is made | the next write is refused, adopter tree and external sentinels unchanged | exit 12        |
| Entry planted at a path `score` will create                | a file or link at `scores/<id>` or a probe directory        | refused, nothing followed                                                | exit 12        |
| Stage provenance                                           | a clean score                                               | `score.json` per probe holds the real argv, exit code, stdout, stderr    | n/a            |
| Direct CLI re-score                                        | the recorded argv re-run with a fresh `--out`               | the produced artifact equals the persisted evidence byte for byte        | n/a            |
| Evidence copied from a file the runtime did not stage      | the staging file replaced with other bytes before the copy  | provenance or digest check fails                                         | exit 12        |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/run-directory.js`: `RunDirectory` attach path (hold an existing run directory, adopt or create `scores` safely); `holdDirectory`, `inDirectory`, `ensureDirectory`, `write`, `replace`, `copyIn`, `close` are the existing pieces.
- `cli/lib/evaluate/score.js` (`runScoreCommand`, lines near 499 to 605): replace the `mkdirSync`/`lstatSync`/`writeJson` path code with the writer; stage `--out`; pass `writer` to `runEngineStage`; write `score.json` through the writer; close the writer in a `finally`.
- `cli/lib/evaluate/partition.js` and `cli/lib/evaluate/interpret.js`: take the writer and call `writer.replaceJson` where they call `replaceView`; keep `replaceView` only if another caller needs it.
- `cli/lib/evaluate/engine-cli.js`: `runEngineStage`'s `writer` option already writes the stage record through the writer; no change expected.
- `test/test-evaluate-partitions.js` (`test:evaluate-partitions`) and `test/test-evaluate-run.js` (`test:evaluate-run`): the race fixture, repeated-score, provenance and byte-for-byte re-score cases.
- `docs/reference/tea-evaluate-cli.md`: a score-output integrity paragraph near the `score` section; `CHANGELOG.md` `## [Unreleased]`; a static test that fails if the section is removed.
- `epics.md` and `test-design-epic-1.md`: amend in place, dated 2026-10-01, only where the build departs from the plan text.

## Tasks & Acceptance

**Execution:**

- [x] `RunDirectory` attach path; `score.js` writes `scores/` through it, stages the engine's `--out`, copies the artifact in; `partition.js` and `interpret.js` write through the writer -- AC 1, 2, 3
- [x] race fixture, repeated-score, provenance and re-score cases with revert observations -- AC 1, 2, 3
- [x] reference paragraph with its static test, CHANGELOG, plan amendments -- AC 4

**Acceptance Criteria:**

- A swapped score directory cannot redirect an output: an end-to-end fixture over real eval-quality races a link swap at the scores parent, the invocation directory and the probe directory and compares the adopter's git status and external sentinels before and after; scoring either writes under the held run directory or exits 12 before an external write (revert: removing the held-directory checks changes at least one sentinel).
- A normal repeated `score` succeeds and keeps both invocations; a planted link at `scores`, the invocation directory or a probe directory is refused without an engine call and no planted link is followed (revert: reusing an invocation directory overwrites the first result; following a link changes a sentinel).
- The stage record preserves the actual eval-quality argv, stdout, stderr and exit code, and a direct CLI re-score reproduces the persisted evidence byte for byte; rewriting the argv to hide the staging path or copying an unverified artifact fails the provenance and digest checks (revert: a false argv or an unverified copy fails).
- The CLI reference describes the score-output integrity refusal (exit 12, the safe location), and a static test fails if that section is removed (revert: removing the section fails the read).

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-partitions && npm run test:evaluate-run && npm run test:evaluate-check && npm run test:evaluate-guidance` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:shards && npm run test:ci-coverage` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check` -- expected: green
- `npm run docs:validate-links && npm run docs:build` -- expected: green
- `npm test` -- expected: green (CI shards)

## Implementation Notes

- `cli/lib/evaluate/run-directory.js`: `RunDirectory.attach(runDirectory)` holds an existing run directory (lstat must say a real directory, and the descriptor opened on it must be that directory by device and inode), and `adoptDirectory(directory)` holds an existing real directory or creates it exclusively.
  Both share `holdEntry(directory, parent, adopt)` with `ensureDirectory`, so the creation, the `lstat`-versus-`fstat` identity check, the before and after confirmation and the undo are one code path.
  A link or any other entry at `scores`, and any entry at an invocation or probe directory, is a `RunDirectoryError`.
- `cli/lib/evaluate/score.js`: `runScoreCommand` attaches, adopts `scores`, creates `scores/<id>` and returns exit 12 with `score output cannot be created inside the run directory: <reason>` when the writer refuses (the old `scores is a link or a non-directory entry` wording is kept inside the reason).
  The probe loop moved to `scoreProbes` and `scoreProbe`: the probe directory is made exclusively before the engine call, `--out` is a file in a `makeScratchDirectory('tea-evaluate-score-')` staging directory released after each call, `runEngineStage` writes `score.json` through the writer with the argv that ran, and the staged artifact is read without following a link, checked (`artifactProblems`: parses, meets the published `evidence-artifact` schema, names the run's corpus digest, holds an outcome for the probe; it cannot tell a well-formed substitute from the engine's artifact), written through the writer, read back through the held directory and parsed from the read-back bytes.
  A staged artifact that fails is not copied, its reason is the probe's `failure`, and the command exits 12.
  A `RunDirectoryError` anywhere stops the loop, the invocation's `score.json` is still written when the writer allows it, the views are skipped, and the command exits 12 with `score output was refused to keep it inside the run directory: <reason>`.
  Staging directories that could not be removed are retried once at the end.
- `cli/lib/evaluate/partition.js` and `interpret.js` write through `writer.replaceJson` (`replaceView` is gone) and take the parsed `evidence` map `score.js` built from the read-back bytes and read no score directory, so a directory swapped after the copy cannot feed them.
  `interpret.js` exports its no-follow `readRegularJson`, which `partition.js` now uses for the probe file (it followed links before).
- `test/fixtures/evaluate/race-engine.js` (new): a stand-in at `TEA_EVALUATE_ENGINE_CLI` that runs the real eval-quality CLI and then swaps or plants (modes in its header); `test/fixtures/evaluate/wrap-score-writer.cjs` (new) swaps a probe directory right after the evidence write, for the read-back case.
- `test/test-evaluate-partitions.js`: the `scores-link` case now plants a link and then a file at `scores` with the shim counting engine calls (zero), compares git status and a file listing of the repository, and scores normally once the entry is gone; a repeated-score case; the race fixture over the real engine (seven modes toward the adopter repository and toward an external directory, 14 attempts, each held to the state just before it); the probe-link case for `writePartitionViews`.
  `test/test-evaluate-run.js` (543 to 625 checks): `checkAttachedWriter` (attach and adopt units), the staged `--out` checks beside the existing direct re-score, the persisted argv compared with the shim's logged argv, `checkUnverifiedEvidence` (four forged artifacts and the read-back swap) and `checkScoreOutputReference`.
  `test/test-evaluate-interpret.js` passes the writer and the evidence map; its evidence-link case is gone because the helper no longer opens an evidence file.
- Docs: a `### Score output integrity` section in `docs/reference/tea-evaluate-cli.md`, the score paragraphs now name the staging file, the old "Story 1.41 tracks held score-output directories" sentence is gone, and the exit 12 row names the new refusals.
  `CHANGELOG.md` `### Fixed` carries the entry.
- No skill file needed a change (`run.md` and `gaps.md` describe the persisted files, which keep their paths), so `src/` is untouched.
- `tools/test-shard-weights.json`: `test:evaluate-partitions` 21.2 to 38 and `test:evaluate-run` 261 to 275, scaled from the local growth (13 to 23.5 seconds, 158 to 165 seconds).
  Neither is near 400 seconds under coverage.
- Matrix audit: repeated scoring (the repeated-score case), planted `scores` (the `scores-link` case, link and file), swapped invocation and probe directories (`swap-invocation`, `swap-probe`, and the writer unit), planted entries (`plant-next-probe`, `plant-record`, `plant-evidence`, `plant-summary`, and the writer units at `scores`, an invocation directory, a probe directory and a score file), stage provenance (the shimmed streams and argv case, and the real score's `--out` check), the direct re-score (`checkDirectRerun`, now over a staged `--out`), and an artifact the runtime did not stage (`checkUnverifiedEvidence`).
  Each ran and passed in the verification output.

### Departures from the plan text

- The plan lists a planted link at the invocation directory among the end-to-end cases.
  The invocation identifier is drawn when `score` starts and carries four random bytes, so no process can plant at it before it exists.
  The end-to-end fixture swaps it after it is made and plants at the next probe directory and at each file path, and the writer's unit cases plant a link, a file and a directory at the invocation directory.
  Amended in `epics.md` and `test-design-epic-1.md`, dated 2026-10-01.
- The third criterion's "unverified copy" is made concrete: the staged artifact is copied only after it meets the published schema, names the run's corpus digest and carries an outcome for the probe, and the copy is read back through the held directory.
  A malformed, foreign-corpus, wrong-probe, garbled or linked artifact exits 12 with no evidence copied.
  A well-formed substitute from a process that can write the staging directory passes the check, which Story 1.68 closes.
  Same amendment.
- The views take the evidence the writer read back and read no score directory, so the `evidence` link case of `test-evaluate-interpret.js` has nothing to attack and was removed.

## Revert observations

Each exercised once by undoing the change in a scratch copy of the tree (the working tree stayed as built) and running the named test; counts exclude three `.gitignore` checks that fail in a scratch copy with no `.git`.

- AC 1, `RunDirectory.confirm` made a no-op: 6 of 14 race attempts fail in `test:evaluate-partitions` (`swap-scores` and `swap-invocation` toward both targets exit 0 with two engine calls and change the adopter repository's git status or an external sentinel; `swap-probe` is refused only by a leftover entry from the earlier attempts), and 13 of 625 `test:evaluate-run` checks fail (the moved-directory and swapped-directory writer cases, the attached writer's swap case and the read-back case).
- AC 1, a link at `scores` followed (`stat` for `lstat`, no `O_NOFOLLOW` on the hold) with `confirm` still on: the `scores-link` case fails on its refusal message (the confirmation still refuses the write). With `confirm` off as well, `score` exits 0 where 12 is expected and writes through the link.
- AC 1 and 2, `CREATE` without `O_EXCL` and `O_NOFOLLOW`: 6 of 14 race attempts fail (`plant-record`, `plant-evidence` and `plant-summary` toward both targets write through the planted link) and 3 of 625 `test:evaluate-run` checks fail (a file, a link and a directory planted where a score file goes).
- AC 2, an existing directory at an invocation or probe directory adopted (`EEXIST` swallowed): 2 of 14 race attempts fail (`plant-next-probe`) and 7 of 625 `test:evaluate-run` checks fail (an existing invocation directory and a planted directory are accepted, a planted link or file is refused by a different message).
- AC 2, a fixed score invocation identifier: the first repeated score exits 12 where 0 is expected in `test:evaluate-partitions`, and 42 of 625 `test:evaluate-run` checks fail (every case that scores twice).
- AC 3, the recorded argv rewritten to hide the staging path (`--out` named the final evidence path): 12 of 625 `test:evaluate-run` checks fail (the `--out` check and the argv-equals-logged-argv check for both probes of the real and shimmed scores, and for the unverified-copy cases).
- AC 3, no staging (`--out` the final evidence path): 34 of 610 `test:evaluate-run` checks fail (the engine writes the evidence before the runtime copies it, so the copy is refused and the run exits 12 where 0 is expected).
- AC 3, the staged-artifact verification removed: 21 of 621 `test:evaluate-run` checks fail (the forged-corpus, garbage and wrong-probe artifacts are copied and `score` exits 0).
- AC 3, the staged artifact followed through a link: 9 of 623 `test:evaluate-run` checks fail (the linked valid artifact is copied).
- AC 3, the read-back dropped: 1 of 625 `test:evaluate-run` checks fails (the probe directory swapped after the evidence write exits 0 where 12 is expected).
- AC 4, the `### Score output integrity` heading renamed: 1 of 618 `test:evaluate-run` checks fails (`the reference has no "### Score output integrity" section`).

## Gates

- Engine check (`evaluateTarget` is a function) exit 0 at the start and at the end.
- Green on the last state of the tree: `test:evaluate-partitions`, `test:evaluate-run` 625 checks, `test:evaluate-interpret`, `test:evaluate-check` 807, `test:evaluate-guidance`, `test:evaluate-calibration`, `test:evaluate-workflow` 165, `test:evaluate-boundaries` 306, `test:direction`, `test:shards` 117, `test:ci-coverage`, `test:doc-counts`, `test:changelog`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
- Also green, since the writer refactor touches `run`: `test:evaluate-evaluators` 746 checks, `test:evaluate-records` 127, `test:evaluate-arms` 536, `test:evaluate-mutation` 665, `test:evaluate-preflight` 236, `test:evaluate-mcp` 226, `test:evaluate-api` 322, `test:evaluate-tool-use`, `test:evaluate-promptfoo`, `test:evaluate-learned-framework`, `test:evaluate-authoring` and `test:evaluate-gap-loop`.
- `package.json`, `package-lock.json` and the peer floor are unchanged.
- Unrun: the full `npm test` (CI shards) and `test:release-metadata` (no package or workflow change).
- This record's frozen table was reflowed by Prettier (whitespace only) so `format:check` passes with the file tracked.

## Left undone, reported

- Story 1.68 (new, end of Epic 1): `score` verifies each input against its digest and then hands the engine the paths, so in a run that opted out of confinement a process writing the run directory between the check and the engine's read can change what is scored; the reference already states the limit.
  Added to `epics.md`, `test-design-epic-1.md`, the Epic Dependencies table (the Epic 2 and H.1 rows renumbered 69 to 74) and `sprint-status.yaml` as `backlog`; the story-count sentences read seventy-four stories and Stories 1.27 to 1.68 (and the test design's scope sentence 1.1 to 1.68).

## Review round 1

Two review lenses (adversarial, test quality) raised four findings, each reproduced.
All four were valid and are fixed.

### Fixed

- A1: `RunDirectory.attach` followed a link at `runs/`, which `run` refuses.
  With `runs` moved aside and a link to a copy of it inside the adopter's tree, `score` exited 0 and wrote scores, `partitions.json`, `gap-view.json` and `interpretation.json` there.
  `attach` now requires `path.dirname(runDirectory)` to `lstat` as a real directory and `realpathSync.native(runDirectory)` to equal the real parent's path joined with the run's name; either failure is a `RunDirectoryError` that names `runs`.
  `runDirectoryFor` resolves the run through the link first, and the refusal comes at `attach`, before any engine call.
  `test-evaluate-partitions.js` plants the `runs` link beside the `scores-link` case and asserts exit 12, the message, no engine call, and an unchanged repository listing and git status.
  The reference and the CHANGELOG name the `runs/` link.
- A2: the wording overstated what the copy check proves.
  `artifactProblems` checks the published schema, the run's corpus digest and an outcome for the probe, so a well-formed artifact with altered outcomes from a process that can write the private staging directory passes.
  The exit 12 row of the reference, the `score.js` header and messages (`fails the copy check: ...`), the test messages and comments, the CHANGELOG entry and the dated 2026-10-01 amendments in `epics.md` and `test-design-epic-1.md` now say what the code checks.
  The `Score output integrity` section states the limit: a process that can write the private staging directory can substitute an artifact that passes the copy check.
  Story 1.68 gains an acceptance criterion (the copied artifact is checked against the engine's own digest or an in-process re-score; substituting altered outcomes in the staged artifact exits 12, a `test:evaluate-run` case) and a matching row in the test design.
  `checkScoreOutputReference` now asserts the limit sentence, what the copy check covers, the `runs/` link and the exit 12 row's wording.
- T1: dropping the confirmation at the `scores` parent failed no test.
  `checkAttachedWriter` now swaps `scores` for a link to an outside directory after `adoptDirectory('scores')`, asserts `ensureDirectory('scores/<id>')` is refused with `no longer the directory the runtime made`, and asserts a recursive listing of the outside directory, directories included, is unchanged.
- T2: dropping the published-schema check on the staged artifact failed no test, since every forged case was caught by another check.
  `race-engine.js` gains a `forge-schema` mode that keeps the corpus digest and the probe's outcome, drops the required `strength` and adds a forbidden property, and `checkUnverifiedEvidence` runs it with the expectation `fails its published schema`.

### Revert observations

Each exercised once in a scratch copy of the tree; counts exclude three `.gitignore` checks that fail in a scratch copy with no `.git`.

- A1, the `runs` checks removed from `attach`: `test:evaluate-partitions` fails at the planted `runs` link case (`score` exits 0 where 12 is expected and writes through the link, so the first assertion stops the file).
- A2, the limit sentence removed from the reference: 1 of 644 `test:evaluate-run` checks fails (the section does not name the limit).
- T1, `if (/^scores$/.test(directory)) return;` at the top of `confirm`: 3 of 644 `test:evaluate-run` checks fail (the swapped parent ends without a refusal, an invocation directory is made in the outside directory, the attached writer wrote through a link); before the fix 0 of 625 failed.
- T2, the schema branch of `artifactProblems` changed to `if (false)`: 9 of 644 `test:evaluate-run` checks fail (`forge-schema` is copied and `score` exits 0 where 12 is expected, for both probes, their evidence files and their interpretations); before the fix 0 of 625 failed.

### Gates

Green on the last state of the tree: engine check, `test:evaluate-partitions`, `test:evaluate-run` 644 checks, `test:evaluate-interpret`, `test:evaluate-check`, `test:doc-claims`, `test:doc-counts`, `test:changelog`, `test:direction`, `test:shards`, `lint`, `lint:md`, `format:check`, `docs:validate-links`.
`tools/test-shard-weights.json` is adjusted from local growth: `test:evaluate-partitions` 38 to 42 (23.5 to 25.9 seconds) and `test:evaluate-run` 275 to 300 (158 to 184 seconds).
