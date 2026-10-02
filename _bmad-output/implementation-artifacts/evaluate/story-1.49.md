---
title: 'Story 1.49: Prove test-design mutation rollback before claiming it'
type: 'bugfix'
created: '2026-10-02'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1e0494715e0e5e80c7f48e1d348fd806fbd6f046'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.49)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.49)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-8)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.27.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.47.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - 'AGENTS.md'
---

<frozen-after-approval reason="Owner delegated Story 1.49 and the Evaluate relay grants build authority">

## Intent

**Problem:** `tools/generate-probes.js` writes `rollbackVerified: true` as a constant for every test-design controlled-mutation probe, because the reference design and the seeded design sit side by side on disk. AD-8 rejects that pattern: the claim needs a performed restore, a digest equal to the pre-mutation one and a clean rerun.

**Approach:** The generator qualifies each test-design controlled-mutation probe in a disposable workspace through the runtime's own `runMutationCycle`, scoring each arm with the projection the replay corpus stores. `rollbackVerified` is the cycle's result. A failed step stops the generator before any probe is written.

## Boundaries & Constraints

**Always:** Reuse `cli/lib/evaluate/mutation.js`. Keep the generated probes, `expected-strength.json` outcomes and the staged preflight unchanged in behavior. Prove each acceptance criterion with a real mutation in a disposable copy.

**Never:** Edit generated JSON by hand. Edit `references/ci.md`, `SKILL.md` or the plan template (the Story 2.4 captures digest them). Touch the test-review, trace, nfr and ci builders (Story 1.99).

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                                  | Expected Output / Behavior                                                         |
| ------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Performed sequence        | Reference design, stored seeded design, oracle that separates  | Arms run baseline, mutated, re-pass over the reference, seeded and reference bytes |
| Clean arm fails           | Baseline scores a violated oracle                              | Exit 11, no result                                                                 |
| Mutated arm holds         | Mutation leaves the oracle holding                             | Exit 11, no result                                                                 |
| Restore cannot be written | Mutated arm leaves a directory at the target                   | Exit 12 naming the restore, no result                                              |
| Restored digest differs   | Digest of the original bytes reads another value after the arm | Exit 12 at the digest check, `rollbackVerified` false                              |
| Clean rerun fails         | Re-pass arm answers violated                                   | Exit 12, no result                                                                 |
| Stored evidence differs   | An arm scores a result other than the stored run records       | Exit 12, no result                                                                 |
| Source changes mid-cycle  | A stored design changes while the cycle runs                   | Exit 12, no result                                                                 |
| Cycle reports no rollback | `qualify` returns false or no claim                            | The builder throws; no probe is emitted                                            |

</frozen-after-approval>

## Code Map

- `test/lib/test-design-qualification.js`: new. `qualifyTestDesignMutation` copies the reference into a temp workspace, derives the exact `replace-exact` operator with `deriveReplaceExact` (shared lines trimmed, context added until the span is unique, byte equality with the stored seeded design asserted), runs `runMutationCycle` with `scoreDocument` as the arm, checks every arm's result against the stored one, digests both stored designs before and after, and removes the workspace in `finally`. `testDesignOracleHolds` moved here from the generator.
- `test/lib/test-design-result.js`: new. `projectTestDesignResult`, the projection `test:eval-replay` stores, moved out of `test/test-eval-replay.js` unchanged so a performed arm and a stored result are one function.
- `tools/generate-probes.js`: `buildTestDesignProbes` is async, takes `{ qualify }`, qualifies every defect probe and sets `rollbackVerified` from the cycle. A `QualificationError` or an unverified result raises a `GeneratorError`. `loadGeneratorCorpus` and the builder are exported for the suite.
- `test/test-test-design-qualification.js`: new suite, `npm run test:test-design-qualification`.
- `cli/lib/evaluate/mutation.js`: reused, unchanged. The `cli/` literal ban on `rollbackVerified: true` stays.
- `package.json`, `tools/test-shard-weights.json`, `README.md`: chain step, shard weight, chain length 108.
- `test/probes/README.md`, `ARCHITECTURE-SPINE.md` (AD-8), `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`: documentation, Story 1.99 and tracking.

## Tasks & Acceptance

**Execution:**

- [x] `test/lib/test-design-result.js`, `test/test-eval-replay.js`: move the projection into a shared module; `test:eval-replay` reports 168 passed and 0 moved.
- [x] `test/lib/test-design-qualification.js`: the cycle, the derived operator, the stored-evidence and source-digest guards.
- [x] `tools/generate-probes.js`: qualify each probe, derive the claim from the cycle, refuse to emit on any failure.
- [x] `test/test-test-design-qualification.js`: performed sequence, each failing step, the derived mutation, the generator over failures; package and shard wiring.
- [x] Docs, changelog, Story 1.99, sprint status.

**Acceptance Criteria:**

- Given the test-design controlled-mutation probes, when the qualification is performed, then a disposable copy runs the clean arm, applies one exact mutation, runs the mutated arm, restores the bytes, verifies the digest and reruns the clean arm, and the repository is unchanged.
- Given a failed restore, a mismatched digest, a missing baseline pass or a missing mutated failure, when the generator runs, then no probe is emitted, and reverting a guard fails a fixture.
- Given the regenerated probes, corpus checks, replay and staged suite-only preflight, then every probe keeps its expected outcome and `npm test` passes.

## Implementation Notes

- **What the arms are.** A test-design "run" is a stored document, so an arm scores the workspace's `design.md` with `projectTestDesignResult` and reads the named oracle's polarity with `testDesignOracleHolds` (the generator's former helper). The mutation is the one `replace-exact` edit that turns the set's reference design into the stored seeded design: for the browser-risk case a one-row insertion with a line of context, for the register-absent and generic cases a span of the document. Byte equality with the stored design is asserted, so the mutated arm reads exactly the bytes the probe cites.
- **Evidence the probes cite is performed.** Each arm's result must deep-equal the result in the stored run's `expected.json`. A stored result that drifted from the live scorer, or a cycle that scored something else, stops the generator.
- **Probes and baseline are unchanged.** Qualification is a gate, so `test/probes/test-design.probes.json` and `expected-strength.json` regenerate byte for byte, `corpusDigest` included. Story 1.48 regenerates them next.
- **Scope.** Fourteen of the sixteen test-design probes are controlled-mutation probes; the clean control and the gameability probe carry no rollback claim. The other four corpora keep their constants and become Story 1.99: their `targetArtifact` is a ground-truth file and their mutated output is a stored report, so no single exact edit exists to perform.
- **Reuse.** `runMutationCycle` supplies steps 1 to 6, containment, mode and digest checks, and the exit codes (11 and 12). The suite adds only the arm, the operator derivation and the stored-evidence guards. The `cli/` literal ban in `test:evaluate-boundaries` is unchanged, and the test-design builder is held to it by a source scan in the suite.
- **Preflight cache.** The runner's request is unchanged, so the six cached entries answered all 46 legs and no model call was made.

## Spec Change Log

## Review Triage Log

Round 0 ran three context-free layers over the diff (Blind Hunter, Edge Case Hunter, Verification Gap). Twelve distinct claims after grouping.

- Partial regeneration, `medium`, `patch`: `main` wrote each corpus as it built it, so a failed test-design cycle left the routing and test-review files rewritten and the rest stale, while the changelog and README said nothing was written. `main` now builds and renders every corpus before it writes any; a scratch copy with one stored result changed ended with exit 2 and no probe file touched.
- Exit class lost, `medium`, `patch`: the `QualificationError` to `GeneratorError` conversion dropped AD-10's exit (11 weakness, 12 infrastructure). The message now names the exit.
- Dead handler branch, `false`: `testDesignOracleHolds` is called outside the builder's `try`, so a `QualificationError` reaches `main`'s catch and the branch prints it.
- Working directory not asserted, `low`, `patch`: every qualification case now checks `process.cwd()` is unchanged, including the cases that stop mid-cycle.
- `inconclusive` verdict uncovered, `medium`, `patch`: a vocabulary oracle over a design the harness refuses now has a fixture (exit 11).
- `rebuilt !== mutated` unreachable, `low`, `patch`: a tautology of the derivation, removed. The check that matters is the cycle's own `mutatedDigest` equalling the stored seeded design's digest, which `qualifyTestDesignMutation` now asserts.
- Non-UTF-8 designs, `low`, `patch`: refused with exit 10 before a text operator is derived, with a fixture.
- Weak literal scan, `low`, `patch`: the pattern allows a quoted key and spacing. The planted-false and planted-throw builder fixtures are the real guard; the scan is the backstop.
- `git status` flake, `medium`, `patch`: the status comparison is scoped to `test/replay/test-design` and `test/probes`, since sharded suites write elsewhere in the checkout at the same time.
- Shard weight unmeasured, `false`: the suite runs in 0.5 s of wall time, and 0.6 is that measurement.
- Corpus load implicit, `false`: `digestOf` already throws "the corpus has not been loaded" naming `main`.
- Story claims beyond the diff, `false`: the reviewed diff excluded the planning artifacts; the tracked planning edits exist. The Verification section now records results.
- Stored baseline and rerun comparison unpinned, `medium`, `patch`: fixtures now drift the stored baseline, a rerun that scores another result, and an arm that returns no result. Each guard also covers the other, so only a case that drifts the stored baseline fails when both entries go, and that case exists.
- Backward widening unpinned, `low`, `patch`: an insertion after the last repeated line can only widen backward, and now has a case.
- Sequential loop not pinned, `false`: the cycle changes directory inside synchronous sections only, so concurrency would not race; the comment claiming it did is corrected.
- Source digest checked only after success, `low`, rejected: an arm that writes a stored design while also failing a step still reports the step, and the shipped arm writes nothing; moving the check into `finally` adds error-masking rules for no reachable case.
- Temp workspace after SIGINT, `low`, rejected: the directory is empty or holds one small design, and the generator is a developer command.

## Design Notes

A mutation here is a byte edit of a stored document, and the stored seeded designs were written by hand as one-edit variants of the reference, so deriving the operator from the pair is exact by construction. Taking a diff as the operator means the probe's mutation cannot disagree with its mutated evidence.

## Verification

**Commands:** `npm run test:test-design-qualification`; `node tools/generate-probes.js --check`; `npm run test:probe-corpus`; `npm run test:eval-replay`; `npm run test:contract-oracles`; `node test/eval-contract-strength.js --suite test-design --preflight-only`; the doc, contract, schema, shard and coverage gates in the brief; `npm run format:check`; `npm run lint`; `npm run lint:md`.

**Observed:** see Completion Notes.

## Completion Notes

**Revert checks.** Each acceptance criterion was undone once in a scratch copy of the tree (`node_modules` linked, no git) and the suite observed to fail, then the copy was discarded:

- Hard-coding `rollbackVerified: true` in the generator fails the literal scan. Dropping the generator's verified assertion fails the unverified and silent-cycle fixtures.
- Skipping the cycle (`qualify` bypassed) fails the performed-cycle count.
- A baseline arm that always holds, or a mutated arm that always violates, fails the performed-sequence and corpus fixtures.
- Dropping the cycle's digest check, its clean-rerun failure, its mutated-arm check, its baseline check or its restore (writing the mutated bytes back) each fails a fixture (`cli/lib/evaluate/mutation.js` was mutated in the copy only).
- Dropping the stored-result comparison, the source-digest check or the workspace removal fails a fixture; dropping the rerun-failure throw in both the cycle and the module fails the clean-rerun fixture.

**Gates run.** All pass on the final tree: `test:test-design-qualification` (62 checks), `test:probe-sources` (15 corpora unchanged byte for byte), `test:probe-corpus`, `test:probe-targets`, `test:eval-replay` (168 passed, 0 moved), `test:contract-oracles`, `test:contract-sources`, `test:contracts`, `test:eval-schemas`, `test:eval-ci-data`, `test:eval-test-design-data`, `test:doc-count-sources`, `test:doc-counts` (chain length 108), `test:doc-claim-sources`, `test:doc-claims`, `test:doc-invocation-entry`, `test:doc-invocations`, `test:suite-manifest`, `test:shards`, `test:ci-coverage`, `test:schema-versions`, `test:lineage`, `test:direction`, `test:boundary`, `test:evaluate-boundaries`, `test:changelog`, `test:release-metadata`, `docs:validate-links`, `format:check`, `lint`, `lint:md`. The staged suite-only test-design preflight (`node test/eval-contract-strength.js --suite test-design --preflight-only`) matched every expected outcome, with 46 legs answered from cache and no model call. The full `npm test` chain is left to CI.

**Findings.** Fixed in this change: the round 0 `patch` rows above. Not closed by this change: the eighteen other controlled-mutation probes (nine test-review, three trace, three nfr, three ci) still state `rollbackVerified: true` as a constant. They become Story 1.99, appended at the end of lane 3 with its `epics.md` and `test-design-epic-1.md` sections, its dependency row, its `backlog` row and its `parallel_lanes` entry, and the story count is ninety-two.

**Housekeeping.** Story 1.47's record and sprint row are `done` (it merged at `review`). AD-8 gained an amendment naming this story.

**Undone.** Nothing in the acceptance criteria. The other four corpora wait for Story 1.99.
