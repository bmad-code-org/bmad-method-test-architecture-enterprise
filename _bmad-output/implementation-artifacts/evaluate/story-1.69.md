---
title: 'Story 1.69: Hold the inputs of an evaluator attempt's score call'
type: 'bugfix'
created: '2026-10-02'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1af1940a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Stories 1.34, 1.68 and 1.69)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.69 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-6, AD-7, AD-12)'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.68.md (the module this story reuses and the record it models)'
  - '{project-root}/cli/lib/evaluate/score-inputs.js (`holdScoreInputs`, `HeldInputs`)'
  - '{project-root}/cli/lib/evaluate/score.js (`heldRefusal`, `stagedArtifact`, `diagnosticLines`)'
  - '{project-root}/cli/lib/evaluate/run.js (`scoreAttempt`, `qualifyEvaluator`)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** `run` qualifies a sealed-brief agent evaluator (Story 1.34) by scoring each qualification attempt through `eval-quality score` over files it wrote into the run directory a moment before (`scoreAttempt` in `cli/lib/evaluate/run.js`: the attempt's record, the compiled contract, the policy, the probe, the preflight verdict, the isolation manifest and the evaluator configuration). In a run that opted out of file-system confinement, a target's leftover process can rewrite one of those files between the runtime's write and the engine's read, or substitute the staged artifact, so an attempt's vote can come from bytes the runtime never wrote. The votes decide whether the evaluator qualifies. Story 1.68 holds the inputs of `tea-evaluate score` only.

**Approach:** `scoreAttempt` holds the inputs the way Story 1.68 holds a run's: one read of each input through the module Story 1.68 built (`cli/lib/evaluate/score-inputs.js`), taken from the run directory writer's own verified read (`writer.read`, held to the digest the runtime wrote), kept in memory for the call. After the call, the same module re-reads and re-digests every input and names the first that changed, and an in-process re-score of the held bytes must reproduce the staged artifact byte for byte (an absent artifact must match a result with no artifact), the call's exit and the `eval-quality:` lines that explain an Invalid result. A mismatch exits 12 naming the changed file or the mismatch and records no vote from that call. The vote is read from the staged bytes the comparison accepted, copied into the run directory once, never from a second read of the staging path. The comparison only refuses: the CLI still decides every enforced verdict, exit and artifact (AD-6 amended 2026-10-01). No eval-quality change: `runScore`, `serializeArtifact`, `scanJson` and `digestBytes` are exports of 4.7.0.

## Boundaries & Constraints

**Always:** one comparison, one place. `heldRefusal`, `diagnosticLines` and `stagedArtifact` move out of `score.js` into a module both `score.js` and `run.js` require (`cli/lib/evaluate/held-refusal.js`; `score.js` requires `run.js`, so `run.js` cannot require `score.js`), with their behavior unchanged, so the comparison and its wording exist once. `scoreAttempt` names no score input file except through `score-inputs.js`: it builds the attempt's inputs through a function that module exports and never reads one of them directly. `score-inputs.js` stays the one file that names `runScore`; `held-refusal.js` is the one file that asks for `reproduce`, and `score.js`'s `heldAggregateRefusal` stays the one that asks for `reproduceAggregate`; `test:evaluate-boundaries` follows both moves with its plants intact. The call's argv does not change (the same paths, a fresh `--out` reproduces the attempt's evidence byte for byte). An unchanged qualification, an Invalid attempt (exit 3 and its `invalid:` lines), a call that could not run, was killed or exited a code the CLI does not document, and a run that qualifies nothing behave as before. `package.json`, the lockfile and the peer floor do not move. The reference sentence that describes the attempt's scoring states the check; AD-6 and AD-7 and the CHANGELOG are amended in the same pull request.

**Never:** a verdict, exit code, vote or artifact that comes from the in-process re-score (it compares, never decides); copying a staged artifact the re-score did not reproduce; reading the staged artifact twice (the bytes compared are the bytes copied and parsed); reading an attempt input from the run directory a second time to feed the re-score (the held bytes are the only source); weakening the Story 1.68 comparison for `score` (its cases stay green with the same text); rewriting argv to hide a staging path; changing an engine exit code; an eval-quality change or release; a new dependency; a raised timeout; a script that is not chained; weight added to a heavy suite without the measured weight reported to the coordinator; a commit, push, pull request, merge or release.

**Decisions (coordinator, owner-delegated):**

- Engine change: none. Lane 3 owns releases; the exports this story needs are in the installed 4.7.0 and `loadEngine` already hands them over.
- The attempt's inputs are the seven `scoreInputList` kinds of a one-set run: the contract (`eval-contract.json`), the preflight verdict (`preflight-verdict.json`), the evaluator configuration (`evaluator-configuration.json`), the policy (`POLICY_FILE`), the probe (`probes/<probeId>.probe.json`), the attempt's one record and its isolation manifest. The index `reproduce` reads is built from those names and the run's corpus digest; no `trial-sets.json` exists yet in a qualification, so the module takes the index shape as an argument.
- The hold reads through `writer.read`, which verifies each file against the digest the runtime wrote and refuses a link, a non-file and a changed directory. An input that is not what the runtime wrote at the hold is a stop (exit 12) naming the file, before any engine call. The post-call re-read goes through the same reader, so a directory swapped for a link is named too. The default reader (`regularFileBytes`) stays for `score`.
- Every outcome of a call that ran is compared, exit 3 included: an Invalid attempt whose held bytes give a verdict, or whose `invalid:` lines differ from the held bytes' lines, exits 12. A call that could not run, was killed or exited an undocumented code stops as today.
- A refusal is `stop({ stage: 'trial', exitCode: 12, message })` with the probe ID first, the refusal text of the shared comparison and the sentence that no vote is recorded for the call. No `evidence-artifact.json` is written under the attempt's directory for a refused call and `evaluator-qualification.json` is not written (the run stops before the report), as for every other stop in `qualifyEvaluator`.
- The static test of AC 4 reads `scoreAttempt`'s source and fails when it names `eval-contract.json`, `preflight-verdict.json`, `evaluator-configuration.json`, the policy file, the probe path pattern or `set.manifestFile` / `set.records` as a file to hand the engine without going through the module's function. The build chooses the exact patterns and plants each.
- `test:evaluate-boundaries` keeps the one-call-site rules: a plant for `reproduce` asked in `score.js` or `run.js`, for a second call in `held-refusal.js`, and the real files clean.

## I/O & Edge-Case Matrix

| Scenario                                                                                 | Input / State                                                                  | Expected Output / Behavior                                                                                          | Error Handling         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Record, contract, policy, probe, preflight, configuration or manifest rewritten and kept | the shim rewrites the file before the real call and leaves it                  | the file is named, no vote recorded for the call, no evidence copied                                                | exit 12                |
| An input rewritten for the engine's read and restored before exit                        | rewrite, real call, restore (each of the seven kinds)                          | the staged artifact differs from the re-score of the held bytes, or the exit or lines differ                        | exit 12                |
| Well-formed staged artifact with altered votes                                           | the staged `--out` replaced by a schema-valid artifact whose outcome differs   | the byte comparison refuses it                                                                                      | exit 12                |
| Same bytes, other serialization                                                          | the staged artifact reformatted, with a repeated last key                      | refused (byte comparison, not a parsed one)                                                                         | exit 12                |
| Restore with the staged artifact removed or an earlier one staged                        | an input rewritten for the call and restored, then `--out` removed or restaged | refused for the artifact or the call's exit                                                                         | exit 12                |
| Input already changed at the hold                                                        | a file rewritten between `writer.verify` and the hold                          | the writer's refusal names the file; no engine call is made                                                         | exit 12                |
| Unchanged qualification                                                                  | the stub agent, two attempts, every probe                                      | votes and report as before; the recorded argv with a fresh `--out` reproduces each attempt's evidence byte for byte | exit 0 or 11 as before |
| Invalid attempt, unchanged                                                               | a preflight verdict that makes the attempt Invalid                             | exit 3 kept with its `invalid:` lines as before                                                                     | as before              |
| Call could not run, killed, undocumented exit                                            | the shim exits 7, or is signalled                                              | the existing stop                                                                                                   | exit 12                |
| Static                                                                                   | `scoreAttempt` reading an input file itself                                    | the static test fails                                                                                               | n/a                    |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/held-refusal.js` (new): `heldRefusal`, `diagnosticLines` and `stagedArtifact`, moved from `score.js` unchanged; `score.js` requires them.
- `cli/lib/evaluate/score-inputs.js`: `holdScoreInputs` takes an optional reader and the attempt's index and set; an exported function builds the attempt's held inputs from the writer; `HeldInputs.changedSince` re-reads through the same reader.
- `cli/lib/evaluate/run.js` (`scoreAttempt`, near 1445): hold, call, `heldRefusal`, then the exit-3 and exit-0/2 branches, copying the staged bytes once.
- `cli/lib/evaluate/score.js`: requires the moved functions; its behavior and its text do not change.
- `test/test-evaluate-boundaries.js`: the caller rules follow `heldRefusal` to its new file.
- `test/fixtures/evaluate/race-engine.js` and `engine-shim.js`: reused as they are; a mode is added only where an attempt's call needs one the score command's did not.
- `test/test-evaluate-evaluators.js` (`--group=agents`, `test:evaluate-agents`): the attack cases over a sealed-brief agent evaluator and real eval-quality, the unchanged and byte-for-byte cases, the static read; a `--held-attempts-only` runner flag for the revert checks if the build needs one.
- `docs/reference/tea-evaluate-cli.md`, `CHANGELOG.md` (`Changed` or `Fixed`), `ARCHITECTURE-SPINE.md` (AD-6 and AD-7 amendments), `epics.md` and `test-design-epic-1.md` (the observed revert behavior, dated), `tools/test-shard-weights.json` (only if a measured weight moves).

## Tasks & Acceptance

**Execution:**

- [x] `held-refusal.js` and its use in `score.js`; the attempt's hold in `score-inputs.js`; `scoreAttempt` holds, compares and copies once -- AC 1, 2, 3, 4
- [x] `test:evaluate-boundaries` follows `heldRefusal` and the plants stay -- AC 4
- [x] attack cases, restore cases, forged and reformatted artifacts, the unchanged and recorded-argv cases, the static read, each with a revert observation -- AC 1 to 4
- [x] reference, CHANGELOG, AD-6 and AD-7, plan amendments, sprint row, this record -- all

**Acceptance Criteria:**

- A run that opted out of confinement, qualifying a sealed-brief agent evaluator, exits 12 naming the changed file with no vote recorded when a process rewrites an attempt's record, the contract, the policy, the probe, the preflight verdict, the manifest or the evaluator configuration after the runtime wrote it and before or during the attempt's `eval-quality score` call (a `test:evaluate-evaluators` case per kind over the Story 1.41 shim and real eval-quality; revert: removing the post-call re-read leaves the file unnamed, and removing it and the comparison records votes from the rewritten bytes where the bytes are scored).
- A rewrite restored before the check, a well-formed staged artifact with altered votes, a reformatted artifact, and a call whose exit or Invalid reason the held bytes do not give (the staged artifact removed or an earlier one staged) exit 12 the same way (a `test:evaluate-evaluators` case each; revert: removing the in-process comparison records the altered votes for both).
- An unchanged qualification scores as before, and its recorded argv with a fresh `--out` reproduces the attempt's evidence byte for byte (a `test:evaluate-evaluators` case; revert: a check that refuses a clean attempt fails it).
- `scoreAttempt` reads the bytes it holds through `score-inputs.js`, and a static test fails if `scoreAttempt` names those files without it (revert: reading a file directly in `scoreAttempt` fails the read).
- Each comparison is tried on a later element: a later probe of the arm, a later attempt, a rewrite of the second kind in the list, not only the first call of the first attempt.
- Gate: `test:evaluate-evaluators`, `test:evaluate-agents`, `test:evaluate-boundaries`, `npm test`.

## Verification

**Commands:**

- `node --input-type=module -e "const m = await import('eval-quality'); for (const n of ['runScore','serializeArtifact','scanJson','digestBytes']) if (typeof m[n] !== 'function') process.exit(1)"` -- expected: exit 0
- `npm run test:evaluate-agents && npm run test:evaluate-evaluators && npm run test:evaluate-boundaries && npm run test:evaluate-held-inputs && npm run test:evaluate-partitions && npm run test:evaluate-guidance` -- expected: green
- `npm run test:direction && npm run test:shards && npm run test:ci-coverage && npm run test:doc-counts && npm run test:doc-claims && npm run test:changelog` -- expected: green
- `npm run lint && npm run lint:md && npm run format:check` -- expected: green
- `npm run docs:validate-links` -- expected: green
- `npm test` -- expected: green (CI shards)

## Implementation Notes

- `cli/lib/evaluate/held-refusal.js` (new) holds `heldRefusal`, `diagnosticLines` and `stagedArtifact`, moved from `score.js` with their text unchanged, and is the one file that asks `HeldInputs.reproduce` for the in-process score.
  `score.js` requires it, so `run.js` can too (`score.js` requires `run.js`).
- `cli/lib/evaluate/score-inputs.js`: `RUN_FILES` (the contract, policy, preflight verdict and configuration names, which `run.js` writes its index and `POLICY_FILE` from), `attemptProbeFile`, `AttemptInputError` and `holdAttemptInputs`.
  `holdAttemptInputs` builds the index `reproduce` reads from the attempt's names and the run's corpus digest (no `trial-sets.json` exists in a qualification), lists the seven inputs through `scoreInputList` and reads each through the `read` it is given, the run directory writer's `read`.
  An input the writer refuses is an `AttemptInputError` naming the file.
  `HeldInputs` takes an optional `read` and a name for what a held file was accepted as, so `changedSince` re-reads through the writer for an attempt and through `regularFileBytes` for `score`.
  `HeldInputs.scoreArguments` builds the call's argv (record, contract, probe, preflight verdict, policy, corpus digest, manifest when held, configuration, `--out`) for `score` and for `scoreAttempt`, so the order lives once and the recorded argv is unchanged.
- `cli/lib/evaluate/run.js`: `scoreAttempt` is async.
  It holds the attempt's inputs, runs the call over `held.scoreArguments`, reads the staged file with `stagedArtifact` (a link or non-file is a stop), makes the shared `heldRefusal` comparison, and only then takes the exit-3 branch, the exit-0/2 branch and the vote.
  The vote is parsed from `staged.bytes`, which `writer.write` copied into `evidence-artifact.json`; the old `copyIn` read the staging path a second time.
  A refusal is `stop({ stage: 'trial', exitCode: 12 })` with the probe id first, the comparison's text, `no vote is recorded for the call` and the call record's path; `evaluator-qualification.json` is not written, as for every other stop in `qualifyEvaluator`.
  A call that could not run, was killed or exited a code the CLI does not document still stops with the old text; so does an exit the CLI documents but the attempt cannot read (4, 5 or 64 that the held bytes also give).
  `scoreAttempt` is exported for the hold's unit.
- `cli/lib/evaluate/score.js`: requires the moved functions and builds its argv through `held.scoreArguments`; nothing else changes.
- `test/test-evaluate-boundaries.js`: `REPRODUCTION_CALLERS` names a module and a function for each re-score (`reproduce` in `held-refusal.js`'s `heldRefusal`, `reproduceAggregate` in `score.js`'s `heldAggregateRefusal`); the `expected` answer rule applies in both files.
  Plants cover `reproduce` asked for in `score.js` (in a function named `heldRefusal` and elsewhere), in `run.js` (the same two ways), twice and elsewhere in `held-refusal.js`, `reproduceAggregate` in `held-refusal.js`, and the whole answer returned from `heldRefusal`; the clean plants are `held-refusal.js` asking once, `score.js` asking for the aggregate once and calling `heldRefusal`, and `run.js` calling `heldRefusal` alone.
- `test/fixtures/evaluate/race-engine.js`: stages other than `score` and `aggregate-strength` (a `run`'s `compile`, `seal` and `preflight`) run as they are; the run directory is found from `trial-sets/` or `evaluator-qualification/`; `TEA_RACE_NTH` limits the modes to the n-th `score` call; `TEA_RACE_KEEP` keeps the artifacts of unattacked calls for `TEA_RACE_STASH_DIR`; the new modes are `forge-votes`, `restore-and-rescore` (a second, silent call stages the artifact the held bytes give, so only the first call's exit and lines disagree) and `exit-<code>`; `stage-link` follows `TEA_RACE_NTH` too.
- `test/test-evaluate-evaluators.js`, `--group=held-attempts` (`test:evaluate-held-attempts`, new, in the chain):
  - `checkHeldAttempts`: an unchanged qualification under the race engine (exit 0, four calls, the report holds, each attempt's recorded argv reproduces its evidence byte for byte) and, on the fourth call (a later attempt of a later arm), `rewrite-<kind>` and `restore-<kind>` for each of the seven inputs, `forge-votes`, `reformat-artifact`, `duplicate-key-artifact`, `stage-stashed`, `stage-link`, `restore-and-unstage` and `restore-and-rescore`.
    Each asserts exit 12, the file or the mismatch named, `no vote is recorded for the call`, the engine called four times, no `evidence-artifact.json` under that attempt's directory, a call record there, no `evaluator-qualification.json`, no `trial-sets.json` and no completed `run.json`.
  - `checkHeldAttemptsLaterProbes`: a project whose mutated arm holds P-002 and P-003; a record of the arm's later probe rewritten and kept (call 4), altered votes on the later probe of the later attempt (call 6), another Invalid reason over the attempt the held bytes read as Invalid, and an earlier artifact staged over that Invalid call.
    The Invalid call is found from an unattacked run's report, and each run starts the stub's counter from zero, since which attempt omits stdin follows its number.
  - `checkHeldAttemptsUndocumentedExit`: the fourth call exits 7 and the run still stops with the old text.
  - `checkHeldAttemptInputsUnit`: over a real `RunDirectory`, the inputs listed in order, the call's arguments (two records in order), each of the seven rewritten, linked or removed before the hold (the hold throws naming the file) and rewritten after it (`changedSince` names it), and `scoreAttempt` itself turning a refused hold into exit 12 before any engine call.
  - `checkScoreAttemptRoutesThroughTheModule`: `scoreAttempt`'s source, comments removed, may name no input file, probe path, record or manifest name, call flag, direct path, file system call or `copyIn`, and must call `holdAttemptInputs(`, `held.scoreArguments(`, `heldRefusal(` and `writer.write(evidence, staged.bytes)`; each is planted.
  - `--held-attempts-only` (narrowed by `--only=<text>`) runs these cases alone for the revert checks.
- `test/test-evaluate-run.js`: `checkScoreInputReference` pins the new qualification paragraph, the sentence in `Qualifying a sealed-brief agent` and the exit 12 row's clause.
- Docs: `Score input integrity` gains the paragraph that `run` holds an attempt's call the same way; `Qualifying a sealed-brief agent` and the exit 3-5 and 12 rows state it.
  The skill's guides say nothing about the old limit (grepped `src/workflows/testarch/bmad-testarch-evaluate`), so the skill is untouched and no builder pass ran.
- `package.json` gains `test:evaluate-held-attempts` after `test:evaluate-agents` in the chain, which counts 109 steps (README, in digits); `tools/test-shard-weights.json` carries its weight.
- Matrix audit: a record, the contract, the policy, the probe, the preflight verdict, the configuration or the manifest rewritten and kept (`rewrite-<kind>`); each rewritten for the call and restored (`restore-<kind>`); a well-formed artifact with altered votes (`forge-votes`); the same artifact reformatted or with a repeated last key (`reformat-artifact`, `duplicate-key-artifact`); the artifact removed or an earlier one staged (`restore-and-unstage`, `stage-stashed`, and over an Invalid call in `checkHeldAttemptsLaterProbes`); an input already changed at the hold (the unit, since nothing a call can race with runs between `writer.verify` and the hold); an unchanged qualification (`checkHeldAttempts`, and the existing qualification cases, which now run through the comparison); an Invalid attempt unchanged (`checkEvaluatorQualification`'s second attempt exit 3 and its `invalid:` lines, and the reason attack's baseline); a call that exits 7; the static read.
  Each ran and passed in the verification output.

### Departures from the plan text

- AC 1's revert wording does not hold in full, as in Story 1.68: removing the check after the call alone leaves the in-process comparison refusing every attack, so only the naming of the file fails.
  With the check and the comparison both removed the rewritten bytes are scored: a record, the policy or a probe rewrite copies evidence and votes, while a contract, preflight verdict, configuration or manifest rewrite goes Invalid with no evidence and the run exits 11.
  `epics.md` and `test-design-epic-1.md` carry the observed behavior, dated 2026-10-02.
- The cases run as `test:evaluate-held-attempts`, not inside `test:evaluate-evaluators`: `test:evaluate-agents` already weighs 323.3 seconds in CI, and the new cases weigh about 247 more, so the plan's script would have crossed 400.
  The script joins the chain (109 steps), so the plan's gate lines name it.
- The hold-time refusal has no end-to-end case.
  The runtime verifies the run directory just before sealing an attempt's record, and nothing a call can race with runs between that verify and the hold, so the unit drives it, and drives `scoreAttempt`'s stop over a real writer.
- The check order in `scoreAttempt` changed: the staged file is read and compared before the exit-3 branch and before the "exit other than 0, 2 or 3" stop, so an exit the held bytes do not give is named as a mismatch and an exit they do give (4, 5 or 64 with no artifact) still reaches the old stop.
  A staged link or non-file is a stop of its own; before, `fs.existsSync` followed it and `copyIn` read it.
- The argv builder moved into `HeldInputs.scoreArguments` and `score` uses it as well, so the order of the call's arguments lives once; the recorded argv of `score` is unchanged, which `test:evaluate-held-inputs`' byte-for-byte reruns pin.

## Revert observations

Each exercised once on the final tree, by applying the one edit that undoes the change in a scratch copy of the checkout (node_modules linked, under the scratchpad directory, never the working tree), running the named case, and discarding the copy.
`test:evaluate-held-attempts` passes unmodified: 315 checks (312 under `--held-attempts-only`, which skips the per-project temp-directory checks).
Counts are failed checks of the total the run reached; a case that throws stops the checks after it, so those totals are smaller.

- AC 1, the `changedSince` call removed from `heldRefusal` (the check after the call): 8 of 312 fail (the seven kinds rewritten and kept, and the later probe's record, all for the file left unnamed); the in-process comparison still refuses every attack with exit 12.
- AC 1 and 2, the check after the call and the comparison both removed (`scoreAttempt` takes no refusal): 91 of 313 fail.
  A kept rewrite of a record, the policy or a probe copies evidence for the attempt, and the policy and probe rewrites restored qualify the run (exit 0) or leave it at 11; a contract, preflight verdict, configuration or manifest rewrite, kept or restored, goes Invalid with no evidence and the run exits 11 where 12 is expected.
  `epics.md` and `test-design-epic-1.md` carry this.
- AC 1, the comparison removed with the check after the call kept: 66 of 312 fail (every `restore-<kind>` for the seven kinds, altered votes, the reformatted artifact, the repeated key, the stashed artifact, the removed one, the exit and the Invalid-reason attacks); the kept rewrites are still named.
- AC 1, a later element: `changedSince` looking at the first input only fails 13 of 312 (every kind but the contract, the later probe's record, and the six rewrites after the hold in the unit).
- AC 2, byte equality replaced by a parsed comparison: 12 of 312 (the reformatted artifact and the repeated last key, each for 6 checks); altered votes are still refused.
- AC 2, the exit comparison removed: 1 of 312 (the restored rewrite that leaves the call at exit 3 where the held bytes give 0).
- AC 2, the diagnostic-lines comparison removed: 4 of 312 (the attempt the held bytes read as Invalid, rewritten into another Invalid reason: the run exits 11 and the report is written).
- AC 2, the branch refusing a call that staged nothing where the held bytes give an artifact removed: 5 of 312 (the removed artifact and four `restore-<kind>` attacks the engine reads as Invalid or faulted); the branch refusing an artifact where the held bytes give none removed: 4 of 312 (the earlier artifact staged over the Invalid call).
- AC 2, the stop for a staged link or non-file removed: 1 of 312.
- AC 3, the re-score serialized with a trailing newline (a check that refuses a clean attempt): 13 of 84 fail, from the first unchanged qualification (exit 12 where 0 is expected), and the cases after it cannot finish.
- AC 4, `scoreAttempt` naming `eval-contract.json`: 1 of 22 fail; its staged artifact copied through `writer.copyIn(evidence, produced)` (a second read): 2 of 23.
- The hold reading through an unverified `readFileSync` in `scoreAttempt`: 10 of 313 (the kept rewrites no longer name the file as one the runtime wrote, and the static read names the direct read).
- The hold's error not wrapped as an `AttemptInputError`: 22 of 35 of the hold's unit; the stop's `instanceof` guard removed: 1 of 35 (the hold's error is no longer a stop).
- A hold reading from `/dev/null` in place of the writer: 29 of 35.
- `test:evaluate-boundaries`: the caller-module test dropped fails 2 of 442 (`reproduce` asked for in `score.js` and `reproduceAggregate` in `held-refusal.js` go unreported); `reproduce` allowed in `score.js` instead of `held-refusal.js` fails 3 of 443 (the real `held-refusal.js`, the clean plant and the plant in `score.js`); the one-call-per-caller count dropped fails 1 of 442 (the second call in `heldRefusal`).

## Gates

- Engine check (`runScore`, `serializeArtifact`, `scanJson`, `digestBytes` and `evaluateTarget` are functions of the installed eval-quality) exit 0 at the end.
- Green on the last state of the tree: `test:evaluate-agents` 330 checks, `test:evaluate-held-attempts` 315, `test:evaluate-evaluators` 486, `test:evaluate-boundaries` 442, `test:evaluate-held-inputs` 210, `test:evaluate-partitions`, `test:evaluate-run` 571, `test:evaluate-records` 330, `test:evaluate-check` 1018, `test:evaluate-guidance`, `test:schema-versions`, `test:schemas`, `test:boundary`, `test:direction`, `test:doc-counts`, `test:doc-count-sources`, `test:doc-claims`, `test:doc-claim-sources`, `test:shards`, `test:ci-coverage` (109 steps), `test:changelog`, `test:release-metadata`, `lint`, `lint:md`, `format:check` and `docs:validate-links`.
- Also green, since they run `run`, `score` or the race engine: `test:evaluate-arms` 727, `test:evaluate-preflight` 300, `test:evaluate-mutation` 665, `test:evaluate-ci`, `test:evaluate-compare`, `test:evaluate-confinement` 546, `test:evaluate-aggregate` 142, `test:evaluate-private` 96, `test:evaluate-mcp` 226, `test:evaluate-api` 4166, `test:evaluate-workflow` 165, `test:evaluate-tool-use`, `test:evaluate-promptfoo`, `test:evaluate-learned-framework`, `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:evaluate-calibration`, `test:evaluate-interpret` and `test:evaluate-ci-render`.
- `package.json` (one script added to the chain), `package-lock.json` and the peer floor: the lockfile and the floor are unchanged.
- Unrun: the full `npm test` (the owner told the relay to skip it locally; CI runs the chain) and `docs:build` (no docs page was added, and `docs:validate-links` is green).
- Measured weight (CPU seconds, user plus system, from `npm run` with other jobs running on the machine), before and after:

  | Script                        | Before             | After                                      | Weight in `tools/test-shard-weights.json`                                   |
  | ----------------------------- | ------------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
  | `test:evaluate-agents`        | 171.5 (330 checks) | 167.1 (330)                                | 323.3, unchanged                                                            |
  | `test:evaluate-boundaries`    | 17.6 (428)         | 17.9 (442)                                 | 48.2, unchanged                                                             |
  | `test:evaluate-held-inputs`   | 36.3 (204)         | 36.6 (210)                                 | 50.8, unchanged                                                             |
  | `test:evaluate-partitions`    | 39.7               | 39.4                                       | unchanged                                                                   |
  | `test:evaluate-held-attempts` | none (new)         | 131.2 (315), 111.8 before the review fixes | 247.3 (131.2 times the 1.885 CI-over-local ratio of `test:evaluate-agents`) |

  The new script weighs 247.3 seconds, under the 400-second line.
  The weights are estimates from local CPU time; the CI measure under coverage of this pull request should replace 247.3.
  `test:evaluate-evaluators`, `test:evaluate-run`, `test:evaluate-records` and the other scripts that pass through `run.js` or `score.js` were run for green and not timed before and after.

- This record's frozen table was reflowed by Prettier (whitespace only) so `format:check` and `lint:md` pass with the file tracked.

## Build review

Three layers (a blind diff reader, an edge-case hunter and a verification-gap reviewer) raised eighteen findings between them, each read against the code and the revert counts above.
Twelve were valid and are fixed; six are rejected with a reason (one of them also carried a valid half, the shard weight).

### Fixed

- Verification gap: nothing staged a link at an attempt's `--out`, so the stop for a staged link or non-file was unpinned (a deleted guard sent a `TypeError` into `heldRefusal`); `checkHeldAttempts` plants `stage-link` on the fourth call and the race engine's `stage-link` now follows `TEA_RACE_NTH` (revert: 1 of 312).
- Verification gap: the wiring of a refused hold in `scoreAttempt` was unit-tested only inside `holdAttemptInputs`; `checkHeldAttemptInputsUnit` now calls `scoreAttempt` over a real writer with a rewritten configuration and requires exit 12, the file named, the `no engine call was made` text and no engine call (reverts: 1 of 35 and 22 of 35).
- Blind and gap: the Invalid-reason case accepted either the exit or the diagnostics message, so it did not prove the diagnostics comparison; the pattern is the diagnostics message alone (the exit comparison removed leaves the case green, the lines comparison removed fails 4 of 312).
- Blind: `diagnosticLines` was exported from `held-refusal.js` with no consumer; the export is gone.
- Blind: `holdAttemptInputs` passes an empty run directory and record to `scoreInputList` without saying why; its comment says paths stay run-relative and digests come from the writer.
- Blind: the catch around the hold turned any error into a stop for tampering; `holdAttemptInputs` throws an `AttemptInputError` and `scoreAttempt` stops on that alone.
- Blind: the shard weight was a rounded estimate; it is 247.3 from the measure above.
- Blind: the CHANGELOG entry was one long line; it is one sentence per line, as the brief asks.
- Blind: the exit 3-5 row repeated its pointer to `Score input integrity` and the exit 12 row stated two near-identical clauses; the 3-5 row points once and the 12 row keeps its single clause.
- Blind: the new flags `--held-attempts-only` and `--only=<text>` were undocumented in the test file's header, and no case held an attempt of several records; the header states them and the unit holds two records and requires both `--record` arguments in order.
- Edge: the race engine took a record under neither marker and a non-numeric `TEA_RACE_NTH` without complaint (a silent no-op attack); both throw.
- Edge: the static read missed a record or manifest file name written by hand; it refuses `isolation-manifest` and `record-<n>`, planted.

New comments and docs are one sentence per line (`held-refusal.js`, `scoreAttempt`, `holdAttemptInputs`, the race engine's header), as the brief asks.

### Rejected

- Blind, the forged-votes attack also reformats the artifact, so it would pass without the vote comparison: false.
  The parsed-comparison revert (which sees only values) still refuses it because the votes differ, and the comparison removed fails it.
- Blind, the static read is text matching where the boundaries test walks an AST: low, and the fix is more than a direct correction; the plants prove each pattern, and the reads are of one function.
- Blind, `heldAttemptFiles`, the unit's names and the static patterns repeat the file names the runtime now exports: rejected; a literal in the test pins the name, so a rename fails the test where an imported constant would follow it.
- Blind, the attacks depend on the fixture's call order: the engine's call count, the attempt directory's call record and the file named pin which call was attacked, and the Invalid call is derived from an unattacked run.
- Blind, split `checkHeldAttempts` for wall time: low; the script weighs 247 seconds, under the 400-second line.
- Edge, `reproduce` parses held records outside its `try`, so a non-JSON record would escape: false for both callers.
  The records an attempt holds are JSON the runtime wrote, and `score` parses every held file in its input check before it reaches `reproduce`.
- Edge, `scoreAttempt` does not read back the copied artifact as `score` does: false.
  The bytes parsed are the bytes written, and the writer holds the digest of what it wrote, which `verify` re-reads before `run.json` says completed.

## Left undone

Nothing is left for a new story.
No finding was left open: the hold-time refusal has no end-to-end case because nothing can race it, which the unit covers and the plan text now says.
The full `npm test` is unrun locally by instruction; CI runs it.
