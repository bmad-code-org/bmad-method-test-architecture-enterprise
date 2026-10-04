---
title: 'Story 1.99: Prove mutation rollback for the test-review, trace, nfr and ci probe corpora'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
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

| Corpus        | Reference (clean arm)                               | Mutation (mutated arm)                                                                                                                       | Oracle (arm)                                                                                 |
| ------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `test-review` | `test/replay/test-review/full-recall` verdict       | the finding for one planted row removed, as a reviewer that missed the plant would; nine twins in `test/fixtures/probe-mutants/`             | the row's oracle, O-001 to O-009 (a finding naming the row at an admitted line)              |
| `trace`       | `test/replay/trace/seeded-correct-run` summary      | one gap read as covered: the inventory and the gap's priority band; three twins in `test/fixtures/probe-mutants/`                            | the oracle on the priority breakdown (O-004)                                                 |
| `nfr`         | `test/replay/nfr/gapped-correct-audit` report       | performance: `gapped-performance-passed`; reliability: a twin whose Gate YAML rolls up to CONCERNS; maintainability: `gapped-domain-omitted` | O-004 (a threshold reads UNKNOWN), O-003 (overall status FAIL), O-001 (a section per domain) |
| `ci`          | `full-correct-pipeline`, `minimal-correct-pipeline` | `full-trigger-schedule-missing`, `full-permissions-missing`, `minimal-template-copied`                                                       | O-003, O-004, O-022 (containment of the element, or its absence)                             |

The brief's "a registry row planted in a fixture tree" has no deterministic arm: scoring a spec file takes a reviewer. The mutation of a test-review probe is therefore of the review the oracle reads, and the spec files stay what the plants live in.

## What changed

- **`test/lib/mutation-qualification.js`.** New. `qualifyStoredMutation`, `deriveReplaceExact`, `digestStoredFile` and the dead-parent reaper, extracted from the test-design module. Messages say artifact where they said design.
- **`test/lib/oracle-arm.js`.** New. `oracleArm` over eval-quality's `resolveCheck`, with the policy's regex budget, the step read out of the oracle's own pointers and an observation builder.
- **`test/lib/probe-qualification.js`.** New. Per corpus: the contract, the operation, the artifact's name in the workspace and how its text becomes an observation (`CORPORA`), `corpusArm` and `qualifyCorpusMutation`.
- **`tools/generate-probes.js`.** `buildTestReviewProbes`, `buildTraceProbes`, `buildNfrProbes` and `buildCiProbes` are async, take `{ qualify }` and perform one cycle per controlled-mutation probe. `performedCycle` reads the claim from the cycle's evidence, holds its `preDigest`, `restoredDigest` and `mutatedDigest` against the digests of the stored bytes the probe cites and the last rerun against `held`, and raises a `GeneratorError` naming AD-10's exit when a cycle stops or reports no verified rollback. The test-design builder uses it too. The generator holds no `rollbackVerified: true` literal and exports the four builders.
- **Regenerated probes.** Every cycle qualified, `test-design.probes.json` is byte for byte unchanged, and the four others changed in `qualification` (`mutationSource`, `mutationOperator` for test-review and nfr, `targetArtifact`, `expectedObservableFailure`, `baselinePassEvidence`, `mutatedFailEvidence`, `rollbackVerified` from the cycle), `artifactDigest` (the mutated artifact's digest, as in Story 1.49) and the rationale of the changed mutations. The three trace probes and the nfr maintainability probe name another behavior (below). `expected-strength.json` moved in four corpus digests and four `behaviorId` values; no verdict, exit code, pre-flight count or strength moved.
- **`test/fixtures/probe-mutants/`.** Thirteen stored mutated artifacts and a README: nine test-review verdicts (the stored review without one row's finding), three trace summaries and the nfr reliability report. The other mutants are stored replay cases.
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

## Notes and decisions

- **Three trace probes and the nfr maintainability probe name another behavior.** The gate oracle (`gate_status` equals FAIL) cannot fail on AC-8 or AC-10 withheld, because AC-2 holds the P0 band at 50%. The nfr overall status cannot fail on maintainability's CONCERNS withheld, because reliability breaches a threshold in the same bundle. The generator's own comments recorded both weaknesses, and a cycle turns each into AD-10's exit 11. Each of those probes now names the oracle that sees its mutation: the priority breakdown (O-004, whose pointer is the one the probes' own witness legs already read) for the three trace gaps, and the section oracle (O-001, in `gapped-domain-omitted`) for maintainability. The probe's verdict is unchanged because every one of the four records a null verdict (the qualification gate refuses its signature as `condition-artifact-channel-contract-local`); only `behaviorId` moved in `expected-strength.json`.
- **`artifactDigest` is the mutated artifact's digest.** AD-8 says it is the `targetArtifact` bytes. Story 1.49 recorded the seeded design's digest for the same field, since the mutation seeds it into the target, and this story follows.
- **The evidence the clean control and the gameability probe cite are unchanged.** They carry no rollback claim.
- **Where the mutants ran.** The work was uncommitted, so the scratch copy is a copy of the working tree (without `node_modules`, `.git` and the planning folders) with its own `git init`, and `node_modules` linked. The shared checkout was never mutated. The harness lives in the session scratchpad.
- **The stored-result guard stays test-design's.** The four corpora's arms return the oracle's resolution, so their stored runs record nothing to compare. The probe's cited digests are held to the cycle's own instead (`performedCycle`).
- **Version of the engine.** The suites ran against the installed eval-quality, whose release the work did not change.

- **One unreproduced failure.** `test:probe-targets` failed four checks once, in the middle of the first gate batch, while files of this change were being edited; it then passed on three solo runs, one run beside the four qualification suites in a loop, and the final batch. The failing lines were not captured. It is recorded here and not closed.

## Verification

Gates run in this checkout on the final tree:

- `test:test-review-qualification` (310 checks), `test:trace-qualification` (167), `test:nfr-qualification` (154), `test:ci-qualification` (185), `test:test-design-qualification` (206), `test:probe-sources` and `node tools/generate-probes.js --check`, `test:probe-corpus`, `test:probe-conformance`, `test:probe-targets`, `test:corpus-conformance`, `test:schema-versions`, `test:eval-replay`, `test:contract-oracles`, `test:contract-sources`, `test:contracts`, `test:compare-dominance`, `test:compare-eval-runs`, `test:doc-claim-sources`, `test:doc-claims`, `test:doc-counts`, `test:doc-count-sources`, `test:port-totality`, `test:file-system-port`, `test:automate-eval-fixture`, `test:evaluate-mutation`, `test:evaluate-boundaries`, `test:evaluate-confinement`, `test:ci-coverage`, `test:shards`, `test:suite-manifest`, `test:bmad-output-gated`, `test:lineage`, `test:direction`, `test:boundary`, `test:changelog`, `test:release-metadata`, `test:eval-schemas`, `test:eval-test-design-data`, `test:eval-ci-data`, `test:eval-nfr-data`, `test:eval-trace-data` and `test:eval-quality-corpus`.
- The staged pre-flight of each corpus (`node test/eval-contract-strength.js --suite <corpus> --from-cache`, for test-review, trace, nfr and ci): every probe matched the outcome `expected-strength.json` records, 31, 11, 11 and 11 legs answered from the cache and no model call.
- `npx eslint . --max-warnings 0`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`.
- The full `npm test` was not run; CI carries it.

## Undone

- A committed mutation harness. The mutants need the suites they run, which take longer than the pre-commit budget, so the list in this record is the reproduction.
- The test-review mutation edits a review, not a spec file. A deterministic reviewer would let the mutation plant the row in the fixture tree, and no such arm exists.
