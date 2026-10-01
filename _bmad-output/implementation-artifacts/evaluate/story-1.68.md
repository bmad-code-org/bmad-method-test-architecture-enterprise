---
title: 'Story 1.68: Hold a run's score inputs between verification and the engine's read'
type: 'bugfix'
created: '2026-10-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '05085c31'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.8, 1.41 and 1.68)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.68 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-6, AD-7, AD-12)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.41.md (the staged `--out` and the copy check this story completes)'
  - '{project-root}/cli/lib/evaluate/score.js (`inputFindings`, `scoreProbe`, `artifactProblems`)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `tea-evaluate score` checks every input of a run against the digests `run.json` recorded (the trial records, the compiled contract, each probe, the preflight verdict, the policy, the evaluator configuration and the isolation manifests) and then hands the eval-quality CLI their paths. In a run that opted out of file-system confinement, a target process left alive can rewrite one of those files after the check and before or during the engine's read, so the engine judges bytes the check never saw. Story 1.41 held the outputs and checks a staged artifact against the published schema, the corpus digest and the presence of an outcome for the probe; a well-formed artifact with altered outcomes, substituted by a process that can write the private staging directory, passes that check.

**Approach:** `score` keeps the bytes it verified. One verified read per run returns each input's bytes (read without following a link, digested with the engine's `digestBytes`, compared with `run.json`) and holds them in memory for the whole command; the same module re-reads and re-digests every input after each engine call and names the first file that changed or appeared (a manifest absent at the check and present afterwards counts). After each CLI call, `score` also re-scores in process: it parses the held bytes, calls the library's `runScore` exactly as the CLI does for a probe, serializes the artifact with the library's `serializeArtifact`, and requires the bytes of the staged artifact to equal the result. The re-score never supplies a verdict; it can only refuse a CLI artifact that the verified bytes do not reproduce, so the CLI still decides every enforced verdict (AD-6 amended, dated 2026-10-01). A rewrite caught by either check, and a staged artifact that is well formed but not the one the verified bytes produce, exits 12 naming the changed file or the mismatch, with no evidence copied for that call. The recorded argv still names the run directory's own paths, so re-running it with a fresh `--out` reproduces the persisted evidence byte for byte on an unchanged run. No eval-quality change: `runScore`, `serializeArtifact` and `digestBytes` are exports of 4.6.0.

## Boundaries & Constraints

**Always:** build the verified read as one module (`cli/lib/evaluate/score-inputs.js`) that `inputFindings` and `scoreProbe` both use, so the enumeration of score inputs exists once and Story 1.45's engine call in `score.js` and Story 2.1 can route through it. Read every input without following a link, as `regularFileBytes` does. A repeated `score`, a records run, a run without an isolation manifest and a run with several records per probe behave as before. The engine check runs at start and end. `package.json`, the lockfile and the peer floor do not move. The reference replaces its sentence that a process able to write the run directory can rewrite a file and its digest; AD-6 and the CHANGELOG are amended in the same pull request.

**Never:** a verdict, exit code or artifact that comes from the in-process re-score (it compares, never decides); copying a staged artifact the re-score did not reproduce; weakening the Story 1.41 copy check (it stays as the first gate); rewriting argv to hide a staging path; changing an engine exit code; a new dependency; releasing or changing eval-quality; reading an input from the run directory a second time to feed the re-score (the held bytes are the only source).

**Decisions (coordinator, owner-delegated):**

- Engine change: none. Lane 3 owns releases; this story needs `runScore`, `serializeArtifact` and `digestBytes`, which 4.6.0 exports.
- The re-score uses no private manifest and no corpus port, as the CLI call here passes none (`score` supplies no `--private-manifest` or `--corpus-root`).
- A mismatch found by the byte comparison with every input unchanged at the post-call re-digest is reported as a staged-artifact mismatch; with a changed input it is reported as that file. Both exit 12 and copy nothing.
- The Invalid rung (no artifact) is reproduced too: the re-score must also return a null artifact when the CLI wrote none.

## I/O & Edge-Case Matrix

| Scenario                                                          | Input / State                                          | Expected Output / Behavior                                       | Error Handling |
| ----------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | -------------- |
| Record, contract, policy, probe or manifest rewritten and kept    | a process rewrites the file after the input check      | the file is named, nothing copied for that call                  | exit 12        |
| An input rewritten for the engine's read and restored before exit | rewrite, engine reads, restore                         | the staged artifact differs from the re-score of the held bytes  | exit 12        |
| Manifest absent at the check, planted before the call             | a file appears at the manifest path                    | the file is named as appeared since the check                    | exit 12        |
| Well-formed staged artifact with altered outcomes                 | the staged `--out` replaced by a schema-valid artifact | the byte comparison refuses it                                   | exit 12        |
| Normal score, repeated score                                      | the same sealed run scored twice                       | both invocations hold evidence; the artifact equals the re-score | exit 0         |
| Direct CLI re-score with the recorded argv and a fresh `--out`    | an unchanged run                                       | equals the persisted evidence byte for byte                      | n/a            |
| Records run, no manifest, several records per probe               | as today                                               | unchanged                                                        | as today       |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/score-inputs.js` (new): the verified read (enumerate the inputs `inputFindings` checks, return `{ file, bytes, digest }` entries and the findings), the post-call `changedSince(held)` that returns the first changed or appeared file, and the in-process comparison helper.
- `cli/lib/evaluate/score.js`: `inputFindings` takes its reads from the module; `scoreProbe` re-verifies after the engine call and compares the staged bytes with the re-score before `writer.write`.
- `cli/lib/evaluate/engine.js`: `loadEngine` already returns the library; use its `runScore` and `serializeArtifact`.
- `test/fixtures/evaluate/race-engine.js`: new modes that rewrite a record, the contract, the policy, a probe and a manifest after the real call or before it, restore after it, plant a manifest, and replace the staged artifact with a schema-valid one whose outcomes differ.
- `test/test-evaluate-partitions.js` (`test:evaluate-partitions`) and `test/test-evaluate-run.js` (`test:evaluate-run`): the end-to-end cases over real eval-quality, the repeated and byte-for-byte cases, the static reference read.
- `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md`, `ARCHITECTURE-SPINE.md` (AD-6 amendment), `epics.md`, `test-design-epic-1.md`, `tools/test-shard-weights.json` (only if a measured weight moves).

## Tasks & Acceptance

**Execution:**

- [x] `score-inputs.js` and its use in `inputFindings` and `scoreProbe`; the in-process comparison -- AC 1, 2, 3
- [x] race-engine modes, end-to-end cases, repeated and byte-for-byte cases, with revert observations per criterion -- AC 1, 2, 3
- [x] reference, CHANGELOG, AD-6 amendment, plan amendments, a static test -- AC 4

**Acceptance Criteria:**

- An input rewritten after the check exits 12 naming the file and copies no evidence for that call (a `test:evaluate-partitions` case over real eval-quality for a record, the contract, the policy, a probe and a manifest; revert: removing the post-call check lets the rewritten bytes be scored and the persisted evidence differs from a clean score).
- A rewrite that is restored before the post-call check, and a well-formed staged artifact with altered outcomes, exit 12 with no evidence copied (a `test:evaluate-run` case each; revert: removing the in-process comparison copies both).
- A normal and a repeated score are unchanged, and re-running the recorded argv with a fresh `--out` reproduces the persisted evidence byte for byte (a `test:evaluate-run` case; revert: a check that refuses a clean score fails it).
- The reference states the check and the old limit sentence is gone; a static test fails if the section is removed or the sentence returns.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.runScore !== 'function' || typeof m.serializeArtifact !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-partitions && npm run test:evaluate-run && npm run test:evaluate-check && npm run test:evaluate-guidance && npm run test:evaluate-interpret` -- expected: green
- `npm run test:evaluate-boundaries && npm run test:direction && npm run test:shards && npm run test:ci-coverage && npm run test:doc-counts && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check` -- expected: green
- `npm run docs:validate-links && npm run docs:build` -- expected: green
- `npm test` -- expected: green (CI shards)

## Implementation Notes

- `cli/lib/evaluate/score-inputs.js` (new) holds the one enumeration of score inputs (`scoreInputList`: the contract, the preflight verdict, the evaluator configuration, the policy, and each set's probe, records and isolation manifest, each with the digest `run.json` recorded and its name in a finding) and the `HeldInputs` class `holdScoreInputs` returns.
  `holdScoreInputs` reads each input once without following a link (`regularFileBytes` moved here from `score.js`) and digests the bytes with the engine's `digestBytes`; presence comes from that one open (only `ENOENT` is absent, so a link, a FIFO or a dangling link at a manifest path is a finding, not an absent manifest).
  `json` parses the held bytes, `anchorFinding` compares a held digest with the recorded one, `aliasFindings` names a path the index lists in two roles (listed once, under its first role), `changedSince` re-reads and re-digests every input and names the first that changed, stopped being a regular file or appeared where the check found none, and `reproduce` scores one set's held bytes in process with the library's `runScore` the way `runScoreCommand` of the CLI does (no private manifest, no corpus root) and returns what the CLI would do with them: the `serializeArtifact` bytes or null, the exit (the ladder's exit for a result, 4 for a structural failure, 5 for a fault, 64 for a private-storage manifest reference, which the CLI refuses with a usage error) and the `eval-quality:` diagnostic lines the result prints (qualification failures, then the basis of an Invalid result; null when the library refused the inputs, whose rendering is the CLI's own).
  The engine handle is a private field and `reproduce` reads the result's `artifact`, the ladder's `exitCode`, `verdict` and `basis` and the qualification's `failures`, nothing else.
- `cli/lib/evaluate/score.js`: `runScoreCommand` holds the inputs after the index check and before `inputFindings`, which now parses and digests the held bytes (same findings, same text, same order for every case that existed; the record and manifest evidence-reference digests use the held entry when the reference names a score input).
  The isolation manifest is passed to the engine when the hold found one, whatever appears at its path later.
  `scoreProbe` keeps the Story 1.41 copy check as the first gate, then `heldRefusal` runs `changedSince` and compares `reproduce` with the call: a staged artifact that is not the result byte for byte, a missing one where the held bytes give an artifact (whatever the call exited), an artifact where the held bytes give none, an exit that differs from the held bytes' and, when the library gives them, diagnostic lines that differ are refused (a call that could not run or was killed has no exit to compare).
  A refusal is the probe's `failure`, nothing is copied, and the command exits 12.
  The views are built from the held bytes: `partition.js` and `interpret.js` take `readInput(relative)` in place of `runDirectory`, and `interpret.js`'s `readRegularJson` is gone.
- `cli/lib/evaluate/engine.js` header: the one `runScore` exemption is stated.
- `test/test-evaluate-boundaries.js`: `runScore` is allowed only as the callee of `const { artifact, ladder, qualification } = await this.#engine.runScore(...)` (shorthand keys, no rest element) in `cli/lib/evaluate/score-inputs.js`; that file may read the ladder's `exitCode`, `verdict` and `basis` and the qualification's `failures` and no other field or whole of either, and a `ladder` read anywhere else under `cli/` fails.
  `seal`, `preflightFromObservations` and every other spelling of `runScore` stay forbidden there.
  Plants cover a returned reference, a rest element, a renamed key, an unread ladder or qualification field, an un-awaited call, the verdict destructured, a `ladder` read in another file, the exempt spelling in a file of the same base name elsewhere, and the exempt shape as a clean case.
- `test/fixtures/evaluate/race-engine.js`: `rewrite-<kind>` (rewritten before the real call and kept), `restore-<kind>` (rewritten before the call and put back after it) for `record`, `contract`, `preflight`, `policy`, `configuration`, `probe` and `manifest`, `restore-unreadable` (the first record becomes no JSON), `plant-manifest`, `forge-outcomes` (a schema-valid artifact with a flipped outcome), `stage-stashed` (an earlier clean score's artifact staged over a call), `restore-and-unstage` and `restore-and-restage` (the input `TEA_RACE_KIND` names is rewritten for the call and put back, then the staged artifact is removed or an earlier one staged) and `reformat-artifact` and `duplicate-key-artifact` (the same parsed value in other bytes).
  `test/fixtures/evaluate/engine-shim.js` gains `TEA_EVALUATE_SHIM_RUN_REAL`: the shim runs the real CLI, keeps its diagnostics ahead of its known stderr bytes and exits with its code, since a shim that stages nothing and exits 4 or 2 is now refused.
- `test/test-evaluate-partitions.js`: seven `rewrite-<kind>` attacks over an opted-out run and real eval-quality, each restored from a snapshot; per attack exit 12, the file named in the output and in each probe's `failure`, two engine calls, no evidence anywhere in the invocation, null outcomes in the views, and views that show the sealed probe class and the sealed record's findings.
  A unit shows `writePartitionViews` reading only through `readInput`.
- `test/test-evaluate-run.js`: `checkHeldInputs` (the enumeration, a normal and a repeated score with byte-equal evidence and the recorded argv naming the run directory's own files, `checkDirectRerun` on both, the module's units over a real run, ten restore, forge and reformat attacks, `stage-stashed`, two exit attacks (restore with the artifact restaged over an exit 3, restore with the artifact removed from an Invalid run) and one reason attack, a planted manifest, a dangling link at a manifest path, an index naming one path as two inputs) and `checkScoreInputReference`; `checkScoreOutputReference` now asserts the link to the input check and that the old limit sentence is gone; `checkShimmedScore` runs the real CLI under the shim with P-002's manifest left out (P-001 exit 0, P-002 exit 3, command exit 3).
  `test/test-evaluate-interpret.js` and `test/test-evaluate-evaluators.js` follow the `readInput` signature and the race engine's pass-through logging.
- Docs: `### Score input integrity` in `docs/reference/tea-evaluate-cli.md` replaces the sentence that a process able to write the run directory can rewrite a file and its digest, states what the protection starts at (a file rewritten together with its digest before `score` starts verifies as the run's own; only confinement prevents that), and the exit 12 and exit 3-5 rows name the new refusals; `CHANGELOG.md` `### Fixed`; AD-6 and AD-7 amended in `ARCHITECTURE-SPINE.md`, dated 2026-10-01.
- `tools/test-shard-weights.json`: `test:evaluate-partitions` 42 to 68 and `test:evaluate-run` 300 to 325, the CI measures under coverage of this pull request (68.0 and 323.9 seconds; locally 26.5 to 32 seconds and 179 to 185 seconds).
  Neither is near 400 seconds under coverage.
- Matrix audit: a record, the contract, the policy, a probe and a manifest rewritten and kept (`rewrite-<kind>` in `test:evaluate-partitions`, and the preflight verdict and the evaluator configuration with them); rewritten for the engine's read and restored (`restore-<kind>` in `test:evaluate-run`); a manifest absent at the check and planted before the call returns (`plant-manifest`); a well-formed staged artifact with altered outcomes (`forge-outcomes`); a normal and a repeated score and the recorded argv with a fresh `--out` (`checkHeldInputs` and `checkDirectRerun`); a records run, a run without a manifest and a run with several records per probe (`test:evaluate-records`, `checkFailAndInvalid`, and the three-trial project of `checkHeldInputs`).
  Each ran and passed in the verification output.

### Departures from the plan text

- The plan lets only `engine.js` reach the library's stages, and `test:evaluate-boundaries` forbids `runScore` anywhere under `cli/`.
  The in-process re-score needs it, so the rule has one exemption: `this.#engine.runScore(...)` in `cli/lib/evaluate/score-inputs.js`, whose file may read a result's `artifact` and none of its verdict.
  AD-6 and the plan's boundary lines (`epics.md` Story 1.4, `test-design-epic-1.md` R1-02 and the engine-boundary row) are amended, dated 2026-10-01.
- The views (`partitions.json`, `gap-view.json`, `interpretation.json`) read the probe, the records and the contract from the run directory after the engine's calls, so a rewrite that landed after the last check reached them even when no evidence was copied.
  They are built from the held bytes now (`readInput`), which the plan did not list.
- A call that stages nothing is refused whenever the held bytes give an artifact, whatever it exited; only a call that could not run, was killed or exited a code the CLI does not document skips the comparison.
  The call's exit and, when the library gives them, its `eval-quality:` diagnostic lines are compared with what the held bytes give too (Review round 1), since an artifact that agrees does not bind the exit `score` passes through.
  The engine-shim cases that faked exits 4 and 2 with no artifact could no longer pass an exit through, so `checkShimmedScore` runs the real CLI beneath the shim's known streams with P-002's manifest left out (P-001 exit 0, P-002 exit 3, command exit 3); the mixing of exits across probes stays in the `combinedExit` unit.
- A link at a manifest path that points nowhere was an absent manifest (Invalid, exit 3); presence now comes from the one open that reads the bytes, so it is a finding (exit 10).
  An index that names one path in two roles (the contract as the policy) is a finding too; before, the second role's digest comparison produced one by accident.
- AC 1's revert wording does not hold in full: removing the check after the call alone leaves the in-process comparison refusing every attack, and the test fails only because no failure names the file.
  The rewritten bytes are copied only when both are removed, and then only for a record, the policy and a probe; a contract, preflight verdict, configuration or manifest rewrite goes Invalid with nothing copied.
  `epics.md` and `test-design-epic-1.md` carry the observed behavior, dated 2026-10-01.
- AC 2's "engine's own digest" alternative is not used; the in-process re-score is.
- The plan amendments (`epics.md` Story 1.68, `test-design-epic-1.md`) are dated 2026-10-01.

## Revert observations

Each exercised once, after the review fixes of round 1, by undoing the change in a scratch copy of the tree, `.git` included, with the working tree left as built.
The unmodified scratch copy passes: `test:evaluate-partitions`, `test:evaluate-run` 796 checks, `test:evaluate-boundaries` 342.

- AC 1, the `changedSince` call removed from the check after each call: `test:evaluate-partitions` fails for all seven rewrite kinds (the in-process comparison still refuses each, but no failure names the file); `test:evaluate-run` fails 2 of 796 (the planted manifest exits 3, since nothing reproduces it).
- AC 1 and 2, the check after each call and the in-process comparison both removed: `test:evaluate-partitions` fails for all seven kinds, the rewritten bytes are scored and copied (the record and policy rewrites copy both probes' evidence, the probe rewrite copies P-002's), and 53 of 796 `test:evaluate-run` checks fail.
- AC 1, a probe left out of the enumeration: `test:evaluate-partitions` stops at its first score (`probes/P-001.probe.json is not a score input of this run`), and 44 of 508 `test:evaluate-run` checks fail.
- AC 1, the views read from the run directory again: `test:evaluate-partitions` fails the `probe` and `record` kinds; `test:evaluate-run` passes, since the views are asserted in the partitions file.
- AC 2, the artifact and exit comparison removed with `changedSince` kept: 51 of 796 `test:evaluate-run` checks fail; `test:evaluate-partitions` passes, as the kept rewrites are still named by `changedSince`.
- AC 2, the branch refusing a call that staged nothing where the held bytes give an artifact removed: 19 of 796; the branch refusing an artifact where the held bytes give none removed: 3 of 796; byte equality replaced by a non-empty test: 18 of 796.
- AC 3, the re-score serialized with a trailing newline (a check that refuses a clean score): `test:evaluate-partitions` fails at its first score, and 37 of 688 `test:evaluate-run` checks fail before `checkHeldInputs` can finish.
- AC 3, the recorded `--contract` argument naming a path outside the run directory: 53 of 688.
- AC 4, the old limit sentence back in the reference: 2 of 796; the `### Score input integrity` heading renamed: 16 of 796; the byte-for-byte sentence reworded: 1 of 796; the exit-comparison sentence reworded: 1 of 796.
- The boundaries exemption pointed at another file name: 3 of 344 `test:evaluate-boundaries` checks fail.
- `O_NOFOLLOW` dropped from the read: 3 of 796.
- The alias findings removed: 2 of 796 (an index naming the contract as the policy passes the input check, since the file is held once under its first role, and the engine faults with exit 5 where 10 is expected).
- The in-process score reading the run directory instead of the held bytes: 1 of 796.

## Gates

- Engine check (`runScore` and `serializeArtifact` are functions) exit 0 at the start and at the end.
- Green on the last state of the tree: `test:evaluate-partitions`, `test:evaluate-run` 796 checks, `test:evaluate-check` 807, `test:evaluate-guidance`, `test:evaluate-interpret`, `test:evaluate-boundaries` 342, `test:direction`, `test:shards` 117, `test:ci-coverage`, `test:doc-counts`, `test:changelog`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
- Also green, since `score` and the views feed them: `test:evaluate-records` 127, `test:evaluate-evaluators` 746, `test:evaluate-arms` 536, `test:evaluate-calibration`, `test:evaluate-workflow` 165, `test:evaluate-preflight` 236, `test:evaluate-mutation` 665, `test:evaluate-mcp` 226, `test:evaluate-api` 322, `test:evaluate-tool-use`, `test:evaluate-promptfoo`, `test:evaluate-learned-framework`, `test:evaluate-authoring` and `test:evaluate-gap-loop`.
- `package.json`, `package-lock.json` and the peer floor are unchanged; no script joined the chain.
- Unrun: the full `npm test` (CI shards).
- This record's frozen table was reflowed by Prettier (whitespace only) so `format:check` and `lint:md` pass with the file tracked.

## Build review

Two review lenses (adversarial code review, test quality) raised eighteen findings; each was reproduced or read against the code.
Sixteen were valid and are fixed; two are skipped with a reason.

### Fixed

- Code A1: `test:evaluate-records` failed, since its shim case staged nothing and exited 0, which the comparison correctly refuses; the case logs through the race engine (the real CLI) now.
- Code A2: `format:check` and `lint:md` failed on the frozen table, the reference's exit table and the test design; Prettier reflowed them.
- Code A3: presence came from a separate `fs.existsSync`, so a file appearing between it and the open could be held as absent with real bytes and skip the digest comparison; presence now comes from the one open.
- Code A4: a path the index names in two roles was held once under its first role, dropping the second role's digest check; it is a finding now (`aliasFindings`), with a test.
- Code A5: a dangling link at a manifest path read as absent at the hold and as appeared at the check; it is a finding at the hold now (exit 10), with a test.
- Code A6: a call exiting 4, 5 or 64 that staged nothing was accepted while the held bytes gave an artifact, hiding a rewrite restored before the check; it is refused now, with `restore-unreadable` for the fault case.
- Code A7: the record and manifest evidence-reference check re-read the manifest from the run directory, and a comment overstated "once"; it digests the held bytes and the comment names the check-only reads.
- Code A8: the `runScore` exemption covered every spelling in the file and `engine` was public; it is `this.#engine.runScore(...)` alone, the result's `artifact` is the only field read (member access and destructuring are scanned), and plants pin the path.
- Test T1: the branch refusing a staged artifact where the held bytes give none had no test; `stage-stashed` covers it.
- Test T2: nothing showed the re-score reads the held bytes only; a unit rewrites a record on disk and requires `reproduce` to ignore it.
- Test T3: nothing showed the views come from the held bytes end to end; the partitions attacks assert the sealed probe class and the sealed record's findings.
- Test T4: the reference still said exits 4, 5 and 64 were exempt, and the static read missed it; the sentence, the exit 3-5 row and the static patterns follow the code.
- Test T5: `checkShimmedScore` lost its per-probe code check when the exits moved to 5 and 4; it runs the real CLI with P-002's manifest left out, so the probes exit 0 and 3 and the command exits 3.
- Test T6: the destructured verdict and the same-base-name file escaped the boundaries plants; both are planted.
- Test T7: the preflight attack toggled itself back across calls; it writes a fixed value. The AC 1 revert wording is corrected in the departures and the observations.
- Test T9: `checkHeldInputs` left the run broken after an exception; the files it rewrites are restored in a `finally`.

### Skipped

- Code A9, the post-call re-read grows with probes times inputs: the story fixes "every input", the files are small, and a narrower check would leave a rewrite of another set's file unnamed.
- Test T8, the restore attacks match `/verified inputs/` rather than one message per kind: the three refusal branches each have a dedicated case (`forge-outcomes`, `stage-stashed`, `restore-unreadable` and `restore-contract`), and a message per kind would pin what the floating engine answers for each rewrite.

## Review round 1

Two Opus lenses (adversarial, test quality) on PR #278 raised seven findings, each checked against the code and reproduced; all were valid and are fixed.

### Fixed

- A (adversarial, reproduced): `heldRefusal` never compared the call's exit with what the held bytes give, so a process that rewrote an input for the engine's read, put it back and removed or restaged `--out` decided the exit.
  An Invalid run (preflight verdict sealed as failed, a clean score exits 3) rewritten to passed for the call, restored and unstaged exited 0; a clean run where the call exited 3 over a rewrite, restored with the earlier clean artifact staged, exited 3 with PASS evidence copied.
  `reproduce` now returns the artifact bytes, the exit (the ladder's exit, 4 for a structural failure, 5 for a fault, 64 for a private-storage manifest reference) and the `eval-quality:` diagnostic lines the result prints (qualification failures, then an Invalid result's basis), and `heldRefusal` refuses a differing exit and differing lines.
  The lines come from `qualification.failures` and `ladder.basis` with the CLI's `eval-quality:` prefix, which the library does not export a renderer for; when the library refuses the held inputs only the exit is compared, since the CLI renders that error itself, and the reference says so.
  The race engine gains `restore-and-unstage` and `restore-and-restage`; `checkHeldInputs` runs the restage over an exit 3 on a clean run, the unstage over an exit 0 on an Invalid run (the preflight verdict sealed as failed and `run.json` restamped, both put back after), and a rewrite into another invalidating condition that changes only the reason lines.
- B (adversarial, reproduced): the `runScore` exemption accepted `this.#engine.runScore` in any position and a rest element over the result.
  It is now the callee of `const { artifact, ladder, qualification } = await this.#engine.runScore(...)` with shorthand keys and no rest element; the ladder is read for `exitCode`, `verdict` and `basis` and the qualification for `failures` only, no other field or whole of either; and a `ladder` read anywhere else under `cli/` fails.
  Plants: a returned reference, a rest element, a renamed key, an unread ladder field, an unread qualification field, an un-awaited call, a verdict destructured, a `ladder` read in another file (member access and destructuring), and the exempt shape as a clean case.
- C (test, reproduced): a parsed deep-equal in place of `reproduced.equals(staged.bytes)` failed no test.
  `reformat-artifact` (the same value indented) and `duplicate-key-artifact` (a repeated last key) are in the attack list, expecting exit 12, `differs from the one the verified inputs produce` and no evidence copied.
- D (both): the AC 1 revert clause in `epics.md` and `test-design-epic-1.md` (Stories 1.68 and 1.69) is amended to the observed behavior, and the sentence that a call exiting 4, 5 or 64 is not compared is replaced in the plan, the Departures and the reference (a call staging nothing is refused whenever the held bytes give an artifact, whatever it exited).
- E (adversarial): the reference and the CHANGELOG state that the exit and the diagnostic lines are compared, that a refused library call is compared by its exit alone, and what the comparison leaves out (stdout and other stderr text); `checkScoreInputReference` pins the exit sentence, the diagnostics sentence, the exit-only sentence and the left-out sentence, and the exit 3-5 row.
- F (test): `tools/test-shard-weights.json` `test:evaluate-partitions` 53 to 68 and `test:evaluate-run` 320 to 325, the CI measures under coverage (68.0 and 323.9 seconds); neither is near 400.
- G (test): the check that every held entry with bytes is marked present could not fail; it is deleted.
  The dangling-link case is the check that catches presence taken from `fs.existsSync` (2 of 796 fail on that revert), and presence forced absent with bytes held fails 95 of 787.

A plan-consistency test for the Story 1.69 row and section does not exist and `test:doc-counts` does not read them, so none was added.

### Revert observations

Counts are in the Revert observations above (taken on the code after these fixes), plus these for the new checks:

- A, the exit comparison removed: 4 of 796 `test:evaluate-run` checks fail (the restage over an exit 3 and the unstage over an exit 0, for both probes).
- A, the diagnostic-lines comparison removed: 3 of 796 (the reason attack exits 3 where 12 is expected).
- B, the exemption's call and destructuring shape check dropped: 4 of 342 `test:evaluate-boundaries` checks fail (the returned reference, the rest element, the renamed key and the un-awaited call); the `ladder` rule for other files dropped: 1 (the read in another file); the ladder and qualification field restriction dropped: 3 (the verdict destructured, the unread ladder field, the unread qualification field).
- C, the byte comparison replaced by a parsed one: 8 of 796 (both reformatted artifacts are copied for both probes).
- E, the exit-comparison sentence reworded in the reference: 1 of 796.

### Gates

Green on the last state of the tree: engine check, `test:evaluate-partitions`, `test:evaluate-run` 796 checks, `test:evaluate-check` 807, `test:evaluate-guidance`, `test:evaluate-interpret`, `test:evaluate-boundaries` 342, `test:evaluate-records` 127, `test:evaluate-evaluators` 746, `test:evaluate-arms` 536, `test:evaluate-calibration`, `test:evaluate-workflow` 165, `test:evaluate-preflight` 236, `test:evaluate-mutation` 665, `test:evaluate-mcp` 226, `test:evaluate-api` 322, `test:evaluate-tool-use`, `test:evaluate-promptfoo`, `test:evaluate-learned-framework`, `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:direction`, `test:shards`, `test:ci-coverage`, `test:doc-counts`, `test:changelog`, `test:release-metadata`, `lint`, `lint:md`, `format:check`, `docs:validate-links`, `docs:build`.
Unrun: the full `npm test` (CI shards).

## Left undone, reported

- Story 1.69 (new, end of lane 1): `run` scores each qualification attempt of a sealed-brief agent evaluator through `eval-quality score` over files it wrote a moment before (`scoreAttempt` in `run.js`), and a run that opted out of confinement lets a leftover target process rewrite them before the engine's read.
  Added to `epics.md` (the section, the Epic Dependencies row with the Epic 2 and H.1 rows renumbered 70 to 75, the lane 1 list and the story-count sentences, seventy-five stories and Stories 1.27 to 1.69), `test-design-epic-1.md` and `sprint-status.yaml` (`backlog`, and the end of `lane-1`).
