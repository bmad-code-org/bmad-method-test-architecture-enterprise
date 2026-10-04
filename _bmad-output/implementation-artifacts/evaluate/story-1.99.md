---
title: 'Story 1.99: Prove mutation rollback for the test-review, trace, nfr and ci probe corpora'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'e27a5e4645b735f7ba0b2925d61a11a35ad5d81f'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.99)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.99 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-8)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.49.md'
  - '{project-root}/AGENTS.md'
---

<!-- prettier-ignore-start -->

<frozen-after-approval reason="The Evaluate relay coordinator froze the approach">

## Intent

**Problem:** `tools/generate-probes.js` still wrote `rollbackVerified: true` as a constant for eighteen controlled-mutation probes (nine test-review plants, three trace, three nfr, three ci), each citing a stored baseline and a stored mutated output. The nine test-review probes named a seeded spec file as their `targetArtifact`, and the trace, nfr and ci probes named their corpus's `ground-truth.json`. AD-8 rejects both: the claim needs a performed restore, a digest equal to the pre-mutation one and a clean rerun.

**Approach:** Each probe is qualified in a disposable copy through `runMutationCycle`, the way Story 1.49 did for test-design. Each corpus states its own mutation and its own arm. Only the cycle sets `rollbackVerified: true`, and the repository's `git status` is unchanged afterward.

## Boundaries & Constraints

**Always:** Reuse `cli/lib/evaluate/mutation.js`. Keep every probe verdict and exit code. Mutation experiments run in a scratch copy with a link to this checkout's `node_modules`, one file edited and restored per mutant. Signal only processes this work started.

**Never:** Edit generated JSON by hand. Run the full `npm test` (CI carries it). Flip the Story 1.103 row or edit the lane lists in `epics.md`; the coordinator does those.

</frozen-after-approval>

<!-- prettier-ignore-end -->

## Decision

The cycle is the one Story 1.49 built, moved out of the test-design module into `test/lib/mutation-qualification.js` so the five corpora share it: it copies a stored reference artifact into a workspace, derives the one `replace-exact` operator that turns it into a stored mutated artifact (`deriveReplaceExact`), runs `runMutationCycle`, holds both stored artifacts to their bytes and removes the workspace in `finally`. `test/lib/test-design-qualification.js` keeps its arm and its stored-result guard and calls the shared cycle.

The arm differs from test-design's. Test-design scores a document with a projection the replay corpus stores. The other four corpora have a contract oracle for every probe and an eval-quality evaluator that resolves it (`test:contract-oracles` reads every oracle with it), so the arm is `test/lib/oracle-arm.js`: it resolves the oracle the probe's behavior discharges over the artifact the workspace holds in the running phase. `true` is `held`, `false` is `violated`, anything else (an abstention, text that is no artifact) is `inconclusive`. The cycle therefore measures the claim the strength vector later measures, and nothing is scored a second way.

Each corpus states its mutation as an edit of the stored correct output its oracle reads:

| Corpus        | Reference (clean arm)                               | Mutation (mutated arm)                                                                                                                                                                                                 | Oracle (arm)                                                                                      |
| ------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `test-review` | `test/replay/test-review/full-recall` verdict       | the finding for one planted row removed, as a reviewer that missed the plant would; nine twins in `test/fixtures/probe-mutants/`                                                                                       | the row's oracle, O-001 to O-009 (a finding naming the row at an admitted line)                   |
| `trace`       | `test/replay/trace/seeded-correct-run` summary      | one gap read as covered: the inventory, the gap's priority band and the gate criteria that read the inventory; three twins in `test/fixtures/probe-mutants/`, the AC-2 twin also carrying the gate its P0 band derives | the oracle on the priority breakdown (O-004) for AC-8 and AC-10, the gate oracle (O-001) for AC-2 |
| `nfr`         | `test/replay/nfr/gapped-correct-audit` report       | performance: the four UNKNOWN threshold lines written as invented targets; reliability: the Gate YAML rolls up to CONCERNS; maintainability: the section deleted; three twins in `test/fixtures/probe-mutants/`        | O-004 (a threshold reads UNKNOWN), O-003 (overall status FAIL), O-001 (a section per domain)      |
| `ci`          | `full-correct-pipeline`, `minimal-correct-pipeline` | the schedule trigger removed, the permissions block removed, the burn-in job appended; three twins in `test/fixtures/probe-mutants/ci/`                                                                                | O-003, O-004, O-022 (containment of the element, or its absence)                                  |

The brief's "a registry row planted in a fixture tree" has no deterministic arm: scoring a spec file takes a reviewer. The mutation of a test-review probe is therefore of the review the oracle reads, and the spec files stay what the plants live in.

## What changed

- **`test/lib/mutation-qualification.js`.** New. `qualifyStoredMutation`, `deriveReplaceExact`, `digestStoredFile` and the dead-parent reaper, extracted from the test-design module. Messages say artifact where they said design.
- **`test/lib/oracle-arm.js`.** New. `oracleArm` over eval-quality's `resolveCheck`, with the policy's regex budget, the step read out of the oracle's own pointers and an observation builder.
- **`test/lib/probe-qualification.js`.** New. Per corpus: the contract, the operation, the artifact's name in the workspace and how its text becomes an observation (`CORPORA`), `corpusArm` and `qualifyCorpusMutation`.
- **`tools/generate-probes.js`.** `buildTestReviewProbes`, `buildTraceProbes`, `buildNfrProbes` and `buildCiProbes` are async, take `{ qualify }` and perform one cycle per controlled-mutation probe. `performedCycle` reads the claim from the cycle's evidence, holds its `preDigest`, `restoredDigest` and `mutatedDigest` against the digests of the stored bytes the probe cites and the last rerun against `held`, and raises a `GeneratorError` naming AD-10's exit when a cycle stops or reports no verified rollback. The test-design builder uses it too. The generator holds no `rollbackVerified: true` literal and exports the four builders.
- **Regenerated probes.** Every cycle qualified, `test-design.probes.json` is byte for byte unchanged, and the four others changed in `qualification` (`mutationSource`, `mutationOperator` for test-review and nfr, `targetArtifact`, `expectedObservableFailure`, `baselinePassEvidence`, `mutatedFailEvidence`, `rollbackVerified` from the cycle), `artifactDigest` (the mutated artifact's digest, as in Story 1.49) and the rationale of the changed mutations. The AC-8 and AC-10 trace probes and the nfr maintainability probe name another behavior (below). `expected-strength.json` moved in four corpus digests and three `behaviorId` values against main (after review round 1, which returned the AC-2 probe to the gate oracle it named before); no verdict, exit code, pre-flight count or strength moved.
- **`test/fixtures/probe-mutants/`.** Eighteen stored mutated artifacts and a README, each its reference with the one named edit: nine test-review verdicts (the stored review without one row's finding), three trace summaries, three nfr reports (performance, reliability, maintainability) and three ci workflows (schedule, permissions, burn-in). Round 1 moved the nfr performance and maintainability and the ci mutants here from the replay cases, which differed from their references by much more than the named edit.
- **Suites.** `test/lib/qualification-suite.js` is the kit every corpus shares, and `test/test-test-review-qualification.js`, `test-trace-qualification.js`, `test-nfr-qualification.js` and `test-ci-qualification.js` each hand it one corpus and add what is the corpus's own. `npm run test:test-review-qualification`, `test:trace-qualification`, `test:nfr-qualification` and `test:ci-qualification` join the chain after `test:test-design-qualification` (chain length 115, weight 0.8 each in `tools/test-shard-weights.json`, 12 shards unchanged).
- **`test/test-evaluate-boundaries.js`.** The `rollback-literal` walker also scans the shared cycle, the oracle arm, the corpus adapters and `tools/generate-probes.js`.
- **Docs.** `test/probes/README.md` (the five corpora's mutation and arm), `README.md` (chain length), `CHANGELOG.md`, `epics.md` and `test-design-epic-1.md` (the amendment), `ARCHITECTURE-SPINE.md` AD-8 (the amendment), `sprint-status.yaml` (`review`).

## Acceptance criteria and their revert checks

| Criterion                                                                                                              | What fails on a revert                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each probe is qualified in a disposable copy and only the cycle sets the claim; `git status` is unchanged              | Hard-coding the claim in any of the four builders (G1 to G5) fails the suite's literal scan and `test:evaluate-boundaries`. The performed sequence, the workspace and `git status` cases fail when the cycle is skipped or reaches outside its workspace (Q3, Q4, Q6). |
| A failed restore, a mismatched digest, a missing baseline pass or a missing mutated failure emits no probe, per corpus | The four planted failures run through each corpus's builder and fail when the cycle's guard is removed (C1 to C5) or the builder's conversion and digest conjuncts are (G6 to G11).                                                                                    |
| Probes, corpus checks, replay and preflight keep their outcomes                                                        | `test:probe-sources`, `test:probe-corpus` (only digests and four behavior ids moved), `test:eval-replay`, `test:contract-oracles` and the staged preflight of each corpus from the leg cache.                                                                          |

## Mutants

Each mutant is one edit to one file of a scratch copy (a copy of the working tree with `git init`, since the work was uncommitted; `node_modules` linked), restored afterwards.
Every suite named failed on the mutant; the checks column names the first failing check.

| ID  | Site and edit                                                                | Failed                      | First failing check                                                                  |
| --- | ---------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| G1  | `buildTestReviewProbes`: `rollbackVerified: true`                            | test-review, boundaries     | the builder states a rollback claim as a literal                                     |
| G2  | `buildTraceProbes`: `rollbackVerified: true`                                 | trace, boundaries           | the same                                                                             |
| G3  | `buildNfrProbes`: `rollbackVerified: true`                                   | nfr, boundaries             | the same                                                                             |
| G4  | `buildCiProbes` plants: `rollbackVerified: true`                             | ci, boundaries              | the same                                                                             |
| G5  | `buildCiProbes` template probe: `rollbackVerified: true`                     | ci, boundaries              | the same                                                                             |
| G6  | `performedCycle`: drop `rollbackVerified === true`                           | all four                    | a cycle that reports no verified rollback still produced a corpus                    |
| G7  | `performedCycle`: drop the `preDigest` conjunct                              | all four                    | a pre-mutation digest that is not the stored reference still produced a corpus       |
| G8  | `performedCycle`: drop the `restoredDigest` conjunct                         | all four                    | a restored digest that differs still produced a corpus                               |
| G9  | `performedCycle`: drop the `mutatedDigest` conjunct                          | all four                    | a mutated digest that is not the stored mutated artifact still produced a corpus     |
| G10 | `performedCycle`: drop the last-rerun conjunct                               | all four                    | a last re-pass that did not hold still produced a corpus                             |
| G11 | `performedCycle`: let a `QualificationError` escape                          | all four                    | a failed cycle gave the raw error, expected a generator error and no probe           |
| C1  | `mutation.js`: the clean arm need not hold                                   | all four                    | a clean arm that fails stopped with a qualified result                               |
| C2  | `mutation.js`: the mutated arm need not fail                                 | all four                    | a mutated arm that holds stopped with a qualified result                             |
| C3  | `mutation.js`: the restored digest is not compared                           | all four                    | a restored digest that differs stopped with a qualified result                       |
| C4  | `mutation.js`: no throw when the rerun fails                                 | all four                    | a clean rerun that fails stopped with a qualified result                             |
| C5  | `mutation.js`: `rollbackVerified` ignores the rerun                          | all four                    | the same                                                                             |
| Q1  | shared cycle: the stored artifacts' digests are not compared after the cycle | all four                    | a stored reference that changed during the cycle stopped with a qualified result     |
| Q2  | shared cycle: the UTF-8 guard dropped                                        | all four                    | a reference artifact that is not UTF-8 stopped with a qualified result               |
| Q3  | shared cycle: the workspace is not removed                                   | all four                    | the workspace still exists                                                           |
| Q4  | shared cycle: the workspace is the reference's own directory                 | all four                    | a workspace was made inside the checkout                                             |
| Q5  | shared cycle: the arm reads the reference's text, not the workspace file     | all four (shipped-arm case) | the corpus's own arm did not qualify the sample mutation                             |
| Q6  | shared cycle: the workspace starts from the stored mutated artifact          | all four                    | the clean arm read the stored mutated artifact                                       |
| A1  | oracle arm: never `violated`                                                 | all four                    | the arms did not hold, violate and hold in turn                                      |
| A2  | oracle arm: an abstention reads as `violated`                                | test-review                 | a verdict with no findings was read as a conclusion                                  |
| A3  | oracle arm: always `violated`                                                | all four                    | the sample mutation did not qualify                                                  |
| A4  | oracle arm: text that is no artifact reads as `violated`                     | test-review, trace          | an unreadable verdict, an unreadable summary was read as a conclusion                |
| T1  | trace: the probes name the gate oracle again                                 | trace                       | the generator stopped over the stored corpus (AC-8 leaves the gate at FAIL, exit 11) |
| T2  | nfr: maintainability names the overall-status oracle again                   | nfr                         | the generator stopped over the stored corpus (exit 11)                               |
| T4  | ci: the schedule probe names another oracle                                  | ci                          | the generator stopped over the stored corpus                                         |
| T5  | nfr: the reference is the clean bundle's audit                               | nfr                         | the generator stopped over the stored corpus                                         |
| T6  | trace: `targetArtifact` is the ground truth again                            | trace                       | P-001 cites artifacts other than the ones its cycle worked on                        |
| T7  | test-review: `targetArtifact` is the seeded spec again                       | test-review                 | the same, for each of nine probes                                                    |
| T8  | nfr: the mutated evidence is the correct audit                               | nfr                         | the same                                                                             |
| T9  | ci: the baseline evidence is the deviant pipeline                            | ci                          | the same                                                                             |
| T10 | ci: the template probe's `mutationSource` is the ground truth                | ci                          | the same                                                                             |
| T11 | test-review: one twin is the stored review itself                            | test-review                 | the stored mutated artifact is byte for byte the reference artifact                  |

No mutant survived.
A survivor of the first run (A2 over a verdict that parses and has no findings) and one of a trace and nfr arm with no case over the shipped arm (Q5) got cases before the final run: `test-review` checks `{}` and text that is no JSON read as `inconclusive`, `trace` the same for text that is no JSON, and the kit runs the corpus's own arm once.
The first run of T6 to T10 survived because the suites compared the builder's cited artifacts with nothing; the kit now holds each emitted probe's `targetArtifact`, both evidence references and `mutationSource` to the paths its own cycle worked on.

## Review round 1

PR #324 drew thirteen findings, A to M.
Each was verified against the code before any edit, and all thirteen were valid.
Twelve are fixed as written.
A is fixed by the brief's second resolution, with the witness kept, for the reason under A.
Nothing was skipped.

### A. The cycle runs opposite to the declared defect for fifteen of eighteen probes

The kit now resolves every committed probe's manifestation witness over `baselinePassEvidence` and `mutatedFailEvidence` with the shipped arm (`witnessArm` in `test/lib/oracle-arm.js`) and states each probe's direction.
Fifteen probes are `plant-reported`: the witness fires on the stored correct run the clean arm scores and is silent on the mutated artifact (nine test-review, three trace, three nfr; the nfr maintainability witness read the overall status and fired on both, so it is fixed under D).
Three probes are `defect-shown` (the ci probes): the witness is silent on the clean arm and fires on the mutated pipeline.
Each suite declares its corpus's direction and fails when a probe has the other one.

Resolution (a) cannot hold.
For the fifteen, the oracle is violated exactly where the witness is silent, so a clean arm "where the witness is silent" is a clean arm where the oracle fails, and the cycle needs the clean arm to hold.
Resolution (b) keeps the verdicts only if the witness stays.
The witness has to fire on the correct run that pre-flight's fault leg replays on the planted input.
Wrapping test-review P-001's witness in `not` in a scratch copy moved its `expected-strength.json` entry from `passed`, verdict `CONCERNS`, exit 0 to `failed: seeded-fault-fired`, verdict null, exit 3.
So the witnesses stay and the probes say so: each of the fifteen rationales ends with the sentence that the witness reads the plant in a run that reports it, and the generator, the probes README, the mutants README, the AD-8 amendment and the CHANGELOG state the two directions and why.
The brief's wording also asks for the witness to be restated; that part is the one thing not done, for the reason above.

### B to M

| Finding                                                 | Reproduced as                                                                                                                       | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B. Stored twins not held to their named edit            | Mutants E01 to E06 passed every suite before the change                                                                             | The nfr performance and maintainability twins and the three ci twins are stored under `test/fixtures/probe-mutants/`, each its reference with the one named edit (ci template twin: the burn-in job appended and no other job). Each suite reads the twins from the paths the builder's emitted probes cite and lists the lines or JSON paths that differ. The kit asserts for every committed probe that exactly the expected oracles flip between reference and twin, over the probe's own project, each from held to violated. `deriveReplaceExact` refuses an operator that spans the whole reference. The trace suite deep-compares each twin to the summary by leaf path, asserts both the inventory and the band moved, and asserts the violated set |
| C. trace P-001 moved off the gate oracle                | The AC-2 twin read P0 2 of 2 at 100% beside `gate_status` FAIL, `p0_coverage_actual` "50%" and an URGENT recommendation naming AC-2 | The AC-2 twin carries `gate_status` PASS, the P0 criteria met, overall 80% met and no URGENT recommendation; P-001 names the gate oracle (O-001, B-001) again. The AC-8 and AC-10 twins carry the gate criteria that read the inventory (overall 80% met), found while checking C: they had the same contradiction in `gate_criteria`. The suite derives the gate decision and criteria from each twin's own bands with the skill's rules and compares. `expectedObservableFailure` now says what the twin carries                                                                                                                                                                                                                                          |
| D. nfr P-003 witness held on both artifacts             | The kit's direction check reports it `fires` on both                                                                                | The relation reads the Maintainability Assessment heading, then the first criterion's heading, then its status line at CONCERNS (an anchored pattern with single quantifiers, since the Probe schema takes only an anchored one and the evaluator refuses a nested one). It fires on the gapped audit, is silent on the clean bundle's audit and on the twin, and pre-flight is unchanged                                                                                                                                                                                                                                                                                                                                                                   |
| E. `git status` blind to ignored paths                  | A `cycle.log` beside a stored reference and a `coverage/leak-x` passed                                                              | `gitStatus` adds `--ignored` and leaves out `node_modules`, `.claude/` and `.DS_Store`; both leaks now fail a suite. Dropping `--ignored` and leaking survives, which shows the flag is what catches it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F. Private-parent check did nothing outside test-review | `removeScratchDirectory(root)` in place of `(parent)` passed trace, nfr and ci                                                      | The kit takes the workspace root off the arm's file by the corpus's target artifact and checks the root and its parent, outside the checkout and gone. The mutant fails all four suites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| G. CHANGELOG over-claimed, digests never compared       | Reading the planted cases and the docblock                                                                                          | The builder plants six steps (the rerun that fails and a stored reference or mutated artifact that changes are new, planted through `planted(second, ...)` over scratch copies, never the checkout), and the CHANGELOG says so. The kit compares `targetArtifact`, the clean and mutated evidence digests and `artifactDigest` to the stored bytes with the generator's `digestOf`                                                                                                                                                                                                                                                                                                                                                                          |
| H. Pattern-less planted cases                           | Reading the two cases                                                                                                               | They match `clean arm did not pass` and `mutated arm did not fail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| I. `performed[index].qualified` threw                   | Mutant: the ninth cycle bypasses the spy                                                                                            | Optional chaining, and the failure names that each probe needs its own cycle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| J. `rollbackVerified: !0` survived                      | Planted in the generator                                                                                                            | A second walker reports any value written to `rollbackVerified` that is not an identifier, a member expression or `false`, over files derived by what they require (the cycle's modules, and every file under `tools/` and `test/` that requires one). Thirteen plants and five clean forms hold it. It found two literal `true` claims in the forged results of the test-design suite and the kit, now copied from a real cycle                                                                                                                                                                                                                                                                                                                            |
| K. Null guard and the exit code                         | A verdict of `null` threw a TypeError (exit 2 in the suite); the exit-code mutant survived                                          | `jsonArtifact` returns null for a value that is no plain object, and the test-review suite has cases for `null`, a list and a string. O-013 reads the exit code the arm derives: it holds on the stored review and fails on the same review approving                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| L. Shipped arm's `text` never exercised                 | Mutants E07 and E08                                                                                                                 | The arm is handed the workspace file only and reads it, so each phase scores the bytes that phase holds and a case's tampering reaches the shipped arm. E07 and E08 on the file fail all four suites; the same edit on the text alone changes nothing, since no corpus arm reads the text                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M. Test-review twins' `$comment`                        | Reading the nine files                                                                                                              | Each says it is a constructed mutant of the stored review, with the ledger fields carried from it. The suite compares the twin to the review field by field apart from the comment: only `/findings` moves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Mutants of round 1

Each is one edit in a scratch copy of the working tree (own `git init`, `node_modules` linked), restored afterwards; the generator was rerun where the edit moves a twin.

| ID        | Edit                                                                           | Result                                                                      |
| --------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| E01       | nfr maintainability twin is another gapped report                              | killed: the generator exits 11 (the mutated arm holds)                      |
| E02       | nfr performance twin is the old whole-report case                              | killed: the twin changes lines other than the four UNKNOWN thresholds       |
| E03       | ci schedule twin is `full-triggers-unscoped`                                   | killed: O-001, O-002 and O-003 flip                                         |
| E04, E04b | ci template twin is `full-unparseable`, or the old whole-file case             | killed: the generator exits 10 (the operator spans the whole reference)     |
| E05       | h1 twin also flips the recommendation                                          | killed: O-013 flips beside O-002                                            |
| E06       | ac-8 twin also flips `gate_status`                                             | killed: O-001 flips                                                         |
| C1, C2    | ac-2 twin states FAIL beside P0 at 100%, or keeps the URGENT recommendation    | killed: the generator exits 11, and the path set differs                    |
| D         | nfr maintainability witness reads the overall status again                     | killed: direction `fires` on both                                           |
| E, Eb     | the cycle writes `cycle.log` beside the stored reference, or `coverage/leak-x` | killed: the checkout status moved                                           |
| F         | the cycle removes the root and leaves the private parent                       | killed in all four suites                                                   |
| E07, E08  | the clean rerun, or the baseline and mutated phases, score the stored files    | killed in all four suites (the arm ran outside a workspace)                 |
| E07t      | the cycle hands the arm stale text and the right file                          | survives and is equivalent: no corpus arm reads the text                    |
| G         | the cycle stops comparing its stored artifacts                                 | killed in all four suites                                                   |
| J         | the generator writes `rollbackVerified: !0`                                    | killed by `test:evaluate-boundaries`                                        |
| K1, K2    | `jsonArtifact` accepts `null`, or the arm derives exit 0 always                | killed                                                                      |
| I         | the ninth test-review cycle bypasses the spy                                   | killed: eight cycles for nine probes                                        |
| CAP       | the whole-reference refusal removed, with the old ci twin                      | killed by the ci flips and by the test-design suite's derived-mutation case |
| DIG       | a committed probe records another `artifactDigest`                             | killed                                                                      |
| RERUN     | the planted clean-rerun case removed                                           | killed: the builder gave a corpus                                           |
| GIT       | `--ignored` dropped, with the leak                                             | survives, as expected                                                       |

### The `test:probe-targets` flake

The build worker saw four checks fail once, mid-batch, and could not reproduce it.
Round 1 reproduced it and found the cause.

Observed: five solo runs in the checkout failed twice (runs 2 and 3), with `a scaffold that does not load exits 1 with a written record` and its record check in the first, and `a run that writes a workflow that does not parse exits 1` and its record check in the second, each at exit 2 with `short of 1 repetitions`.
Five runs under load (28 busy loops on 14 cores) all passed, so timing is not the cause.
Six further quiet solo runs, with other lanes' suites running beside them, all passed.
Four solo runs and four runs beside a loop that reaps dead private parents every 50 ms passed in a scratch copy, and so did four rounds of two suites run at once.

Cause: every behavioral harness (`eval-atdd`, `eval-ci`, `eval-nfr`, `eval-trace`, `eval-test-design`, `eval-fragment-selection`, `eval-bmad-tea-routing`) takes `git status` of the whole checkout before and after a run (`workingTreeState`) and treats every line the run did not start with as a write by the run: `the runner changed the repository under a scoped-artifact-writes declaration`, an environment failure, exit 2.
Any file that becomes modified or untracked in that window fails the case, whoever wrote it.
The two failed runs began while this round was editing documents that had been clean (`test/probes/README.md`, `epics.md`, the spine), and the build worker was editing files too.
Creating a new untracked file every 250 ms in a scratch copy while the suite ran failed every harness case, with the same check names.

Fix: `runHarnessAgainstStub` in `test/test-probe-targets.js` runs a case again, up to three attempts, when the record or stderr carries that reason, and says so.
A write the stub really makes comes back every attempt and still fails, and so does a writer that never stops.
With files created for 3.5 seconds from the eleventh second of a run, three cases ran again and the suite passed.
The product harnesses keep their strict whole-checkout comparison, since a live run is meant to notice a runner that reached the repository.
Narrowing it to the paths a run could reach is a design change for the harnesses and is filed here, not made.

## Notes and decisions

- **Two trace probes and the nfr maintainability probe name another behavior.** The gate oracle (`gate_status` equals FAIL) cannot fail on AC-8 or AC-10 withheld, because AC-2 holds the P0 band at 50%. The nfr overall status cannot fail on maintainability's CONCERNS withheld, because reliability breaches a threshold in the same bundle. The generator's own comments recorded both weaknesses, and a cycle turns each into AD-10's exit 11. Each of those probes now names the oracle that sees its mutation: the priority breakdown (O-004, whose pointer is the one the probes' own witness legs already read) for the AC-8 and AC-10 gaps, and the section oracle (O-001) for maintainability. The AC-2 probe names the gate oracle (O-001, B-001) as it did on main, since round 1 gave its twin the gate its P0 band derives. The probe's verdict is unchanged because every one of the four records a null verdict (the qualification gate refuses its signature as `condition-artifact-channel-contract-local`); only `behaviorId` moved in `expected-strength.json`.
- **`artifactDigest` is the mutated artifact's digest.** AD-8 says it is the `targetArtifact` bytes. Story 1.49 recorded the seeded design's digest for the same field, since the mutation seeds it into the target, and this story follows.
- **The evidence the clean control and the gameability probe cite are unchanged.** They carry no rollback claim.
- **Where the mutants ran.** The work was uncommitted, so the scratch copy is a copy of the working tree (without `node_modules`, `.git` and the planning folders) with its own `git init`, and `node_modules` linked. The shared checkout was never mutated. The harness lives in the session scratchpad.
- **The stored-result guard stays test-design's.** The four corpora's arms return the oracle's resolution, so their stored runs record nothing to compare. The probe's cited digests are held to the cycle's own instead (`performedCycle`).
- **Version of the engine.** The suites ran against the installed eval-quality, whose release the work did not change.

## Verification

Gates run in this checkout on the final tree:

- `test:test-review-qualification` (471 checks), `test:trace-qualification` (320), `test:nfr-qualification` (300), `test:ci-qualification` (334), `test:test-design-qualification` (207), `test:evaluate-boundaries` (472), `test:probe-sources` and `node tools/generate-probes.js --check`, `test:probe-corpus`, `test:eval-replay` (168 passed, 0 moved), `test:contract-oracles`, `test:shards` (183), `test:doc-counts` and `test:probe-targets`.
- The staged pre-flight of each corpus (`node test/eval-contract-strength.js --suite <corpus> --from-cache`, for test-review, trace, nfr and ci): every probe matched the outcome `expected-strength.json` records, 31, 11, 11 and 11 legs answered from the cache and no model call.
- `npx eslint . --max-warnings 0`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`.
- The full `npm test` was not run; CI carries it.

## Undone

- A committed mutation harness. The mutants need the suites they run, which take longer than the pre-commit budget, so the list in this record is the reproduction.
- The harnesses' whole-checkout comparison still blames the run for any file that changes while it runs. `test:probe-targets` retries around it; narrowing the comparison to the paths a run could reach is a design change for the seven harnesses.
- The test-review mutation edits a review, not a spec file. A deterministic reviewer would let the mutation plant the row in the fixture tree, and no such arm exists.
