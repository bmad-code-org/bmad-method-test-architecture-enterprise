---
title: 'Story 1.48: Report whole-document coverage for a structured design artifact'
type: 'bugfix'
created: '2026-10-02'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0e864009232d75bf8bdb5a313e5ccd777f9fbf1c'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.48)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.48)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-19)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.27.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.47.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.49.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - 'AGENTS.md'
---

<frozen-after-approval reason="Owner delegated Story 1.48 and the Evaluate relay coordinator froze the approach">

## Intent

**Problem:** eval-quality reports the test-design contract's `whole-body` coverage rule unsatisfied. The rule asks for one oracle whose direction and check both address every required response key of an operation at one step, and the test-design operation declares four (`design`, `riskRowCount`, `scoredRiskDescriptions`, `scoredRiskCount`). Every oracle reads a subset, and a parent pointer does not address a key.

**Approach:** The fix is TeA-side. There is no eval-quality change and no release. `tools/generate-contracts.js` appends one `projection-coherence` oracle per fixture set after the existing oracles, naming all four key pointers and the design artifact in its direction and its check, with a check that fails for a real defect and a harness scorer that mirrors it.

## Boundaries & Constraints

**Always:** Keep `O-001` to `O-015` and their behavior ids. Regenerate the contract and the probes through their generators. Keep every probe outcome, verdict and exit code unchanged, and `SCORER_VERSION` at 16. Prove each acceptance criterion with a real mutation in a disposable copy.

**Never:** Change eval-quality or release it. Tune the oracle to make a probe pass. Add a risk catalogue entry. Edit generated JSON by hand. Edit `references/ci.md`, `SKILL.md` or the plan template (the Story 2.4 captures digest them). Fix the same gap in the test-review, trace or routing contracts (Story 1.100).

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                               | Expected Output / Behavior                                                                             |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Real contract            | Contract as generated                                       | `whole-body` is not a coverage gap                                                                     |
| Oracle removed           | Contract without `O-016` and `O-017`                        | `whole-body` is a coverage gap                                                                         |
| Descriptions only        | Oracle reads only `/scoredRiskDescriptions`                 | `whole-body` is a coverage gap                                                                         |
| One key short            | Oracle that reads exactly the other three keys              | `whole-body` is a coverage gap                                                                         |
| Direction drops a key    | Check reads all four, direction names three                 | `whole-body` is a coverage gap                                                                         |
| Widened                  | Reduced oracle widened to every key                         | `whole-body` is satisfied                                                                              |
| Coherent projection      | Parser-derived projection of a stored design                | Oracle holds, scorer agrees                                                                            |
| Blank design             | `design` is empty or whitespace                             | Oracle fails, scorer agrees                                                                            |
| Design not the document  | `design` truncated or another document beside the artifact  | Oracle fails, scorer agrees                                                                            |
| Count and list disagree  | Scored count with an empty list, or zero with a description | Oracle fails, scorer agrees                                                                            |
| Scored row never counted | `scoredRiskCount` above zero with `riskRowCount` zero       | Oracle fails, scorer agrees                                                                            |
| Wrong shape              | A missing, extra or mistyped key                            | Oracle fails, scorer agrees                                                                            |
| Count names two rows     | `scoredRiskCount` 2 beside one description                  | The oracle holds, the scorer agrees (recorded limit); the stored-run assertions cover real projections |

</frozen-after-approval>

## Code Map

- `tools/generate-contracts.js`: `projectionCoherenceExpression`, `projectionIsCoherent` (the scorer's twin), `TEST_DESIGN_PROJECTION_KEYS` and `_TYPES`, the `projection-coherence` specs appended after the per-set loops in `testDesignOracleSpecs`, and the `TEST_DESIGN_BEHAVIORS` entry (severity `material`, risk `unscoreable-deliverable`).
- `tools/generate-probes.js`: `testDesignOracleIndex` accounts for the two new oracles (`probed: false`, shape and check pinned against the generator's expression), `buildTestDesignProbes` builds probes for probed entries only and the gameability probe's conjunction stays on the probed stdout oracles with a rationale line naming the new one.
- `test/lib/test-design-qualification.js`: `testDesignOracleHolds` refuses a projection-coherence entry (exit 10) since no stored design evidences it.
- `test/test-contract-oracles.js`: the scorer receives the projection, planted incoherent projections, and `checkTestDesignCoverage` scoring contract variants through `runSuite` and the engine's `coverageGaps`.
- `test/test-test-design-qualification.js`: one case for the refusal above.
- Generated: `test/contracts/test-design.contract.json`, `test/probes/test-design.probes.json`, `test/probes/expected-strength.json`. `test/contracts/expected-status.json` is unchanged (every contract still compiles).
- Docs and tracking: `test/contracts/README.md`, `test/probes/README.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`.
- Reused, unchanged: eval-quality's `shape`, `regex`, `count-tolerance`, `equality`, `all`, `any`, `not` operators; `test/lib/probe-scoring.js` (`runSuite`, `storedProbePort`, `suites`).

## Tasks & Acceptance

**Execution:**

- [x] `tools/generate-contracts.js`: the projection-coherence expression, its JavaScript twin, the specs, the behavior entry.
- [x] `tools/generate-probes.js`, `test/lib/test-design-qualification.js`: index, probe loop, gameability probe, guard.
- [x] `test/test-contract-oracles.js`, `test/test-test-design-qualification.js`: scorer argument, planted projections, coverage fixtures, refusal case.
- [x] Regenerate contract, probes and baseline; docs, changelog, plan amendment, Story 1.100, sprint status, Story 1.49 to `done`.

**Acceptance Criteria:**

- Given the test-design contract, when eval-quality scores it, then `whole-body` is satisfied because one oracle per step names all four key pointers in both channels, and it is unsatisfied when an oracle reads only the scored descriptions or omits any key.
- Given the real contract and the same contract with the oracle reduced to `/scoredRiskDescriptions`, when both are scored, then they differ, and restoring the contract without the oracle or widening the reduced oracle flips the result.
- Given the regenerated baseline, then every probe verdict and exit code is unchanged and `npm test` passes.

## Implementation Notes

- **Why TeA-side.** eval-quality 4.7.0 defines `whole-body` as: for every operation declaring more than one distinct required response key, one oracle's direction and check both address every one of those keys at one step (eval-quality's AD-20 rule 2 and AD-31). Its truth table reports oracles that each read a different key as unsatisfied on purpose. The test-design operation declares four keys and no oracle read all four, so the engine was right and the contract had the gap. The plan's "engine coverage fixture" and "nested complete-body rule" wording assumed an engine change; `epics.md` and `test-design-epic-1.md` are amended.
- **What the check says.** `equality` takes two evidence pointers, but the vocabulary has no ordering between two evidence values and no pointer to a collection's length, so exact count equality and `riskRowCount >= scoredRiskCount` need an enumeration over the declared cardinality bound (200), which costs 60 to 68 KB of JSON per oracle. That was judged too large. The oracle states what the vocabulary carries without it: the stdout has exactly the four keys with their declared types (`shape` over the stdout root), `design` equals the design artifact the run wrote (`deep-equality` with `/interactions/<step>/artifact/design`, so the whole original Markdown) and has a non-blank character, the scored count is zero exactly when the description list is empty, and the row count is not zero whenever the scored count is not. The `shape` conjunct is load-bearing: under `not(equality(...))` an absent number reads as not zero, and the planted missing-key cases showed the first draft passing a projection with no `riskRowCount`. The direction names the four key pointers and the artifact pointer.
- **Scorer.** The scorer is `projectionIsCoherent` over the runner's projection and the design artifact, passed as second and third arguments; every other spec ignores them. The projection is derived from the document by one function, so the stored runs hold the oracle. The relations the oracle cannot state are asserted directly in `test:contract-oracles` on every stored projection (`scoredRiskCount` equals the number of descriptions, `riskRowCount` is not less than `scoredRiskCount`, `design` equals the artifact), independent of the oracle and its twin. A scratch copy of the parser with `scoredRiskCount` one too high or doubled fails them, and so does one that truncates `design`. The suite also plants incoherent projections, one per claim, and compares the oracle with the scorer on each.
- **No defect probe.** A defect probe needs a stored run whose document makes the oracle resolve false, and none can. `testDesignOracleIndex` still accounts for both oracles (shape and check pinned against the generator's expression), so a contract edit that touches them fails the generator. The gameability probe's signature leaves them out: the oracle reads the design artifact, a defect signature cannot address a file a command wrote, and adding it moved P-016 to a qualification refusal (`condition-artifact-channel-contract-local`, exit 3). The gameability probe stays on the ten stdout oracles, byte-identical to before in its predicate. The probe count stays sixteen and the ids P-001 to P-016 hold.
- **Coverage fixtures.** The engine exposes its coverage result on `runScore`'s evidence artifact (`coverageGaps`), so `checkTestDesignCoverage` scores the zero-action probe through `runSuite` against contract variants with the stored runs answering the legs. Variants: the real contract; the contract without the oracles and their behaviors (the pre-story state); the oracle reduced to `/scoredRiskDescriptions`; that reduced oracle widened to every pointer from the generator's own expression and targets; four oracles that each read exactly the three keys other than one (direction names three, check is the existence of those three); and a direction that omits `design` while the check reads every key.
- **Baseline movement.** `unsatisfiedCoverageRules` for test-design drops `whole-body` and keeps `malformed-input` and `state-change-read-back`. The `basis` lines that named the `whole-body` gap on P-011 are gone. P-011 and P-016 each gain two outcomes (one per new oracle: `passed-clean-control` and `confirmed`). `corpusDigest` moves. Every verdict, exit code, preflight result and strength vector is unchanged. The clean control rationale count rises from five to six oracles and the gameability rationale says why the eleventh is outside its conjunction.
- **Staged preflight.** The runner's request is unchanged, so the cache answered 46 of 46 legs and no model call was made.
- **Not closed here.** `whole-body` is still a gap for `tea-routing-intents`, `tea-routing-controls`, `test-review` and `trace`. They become Story 1.100.

## Spec Change Log

## Review Triage Log

Round 0 ran three context-free layers over the diff with the three generated JSON files excluded for size (Blind Hunter, Edge Case Hunter, Verification Gap). Twenty distinct claims after grouping.

- `scoredRiskCount` and `design` mistype unpinned, `medium`, `patch` (Edge, Gap, Blind): no planted projection mistyped those two keys, so an oracle whose `shape` types dropped them passed every case. Planted cases for a numeric `design` and a string `scoredRiskCount` were added, and a scratch copy with the types reduced to the other two keys fails the string-count case.
- `wholeBodySatisfied` read a missing artifact as satisfied, `medium`, `patch` (Edge): `artifact?.coverageGaps.some(...)` on an undefined artifact is `undefined` and the function returned true. It now asserts the artifact carries a `coverageGaps` array and reads an empty list when it does not, and the suite asserts `DISCIPLINE_RULES` publishes `whole-body`. A satisfied rule leaves no record, so the name is also held by the variants that must be unsatisfied.
- Engine drops the rule and the satisfied side passes vacuously, `low`, `false` (Edge): the unsatisfied variants search for a `whole-body` gap, so a renamed rule fails them.
- Gameability rationale takes the last oracle of the set, `low`, `patch` (Edge, Blind): it now selects the entry by kind.
- Probe ids from the index position, `low`, `patch` (Edge): the builder passes the count of probes built so far, equal today and robust to a probed entry after an unprobed one.
- The field ternary in three places, `low`, `patch` (Edge): one `testDesignEvidenceField(kind)` helper.
- Dangling "see Completion Notes", `medium`, `patch` (Blind): the section exists below.
- Stale Lane 3 text naming 1.48 as an engine release, `medium`, `patch` (Blind): removed from `epics.md`.
- Strings that claim more than the check proves (the behavior's success, the scope and the commentary say "complete Markdown"), `medium`, `patch` (Blind): the three strings now say what the expression states: four declared keys of their types, a non-blank design, agreeing counts.
- "Three ways" in the Design Notes, `low`, `patch` (Blind): the generator mutations were manual proofs in a scratch copy and are recorded below and no committed test runs them. The note says so.
- Story 1.100 under-specified, `medium`, `patch` (Blind): it depends on 1.99 too (both regenerate the other corpora), its alternative of narrowing `requiredKeys` is held to a stated criterion (a key the runner or workflow does not always emit, shown from its output), its fixtures follow Story 1.48's per-key variants, its plan table has a row for the recorded choice, and its gate runs `generate-probes.js --check`.
- CHANGELOG states no remaining state and omits the README correction, `low`, `patch` (Blind): the entry names Story 1.100 and a second bullet records the README fix.
- Negative, fractional or oversized counts and `scoredRiskCount` above `riskRowCount` pass, `low`, recorded limit (Blind, Edge): the vocabulary has no ordering between two evidence values and no pointer to a collection's length, so exact count equality and `>=` need an enumeration over the declared bound of 200, which costs 60 to 68 KB of JSON per oracle and was judged too large; the stored-run assertions in `test:contract-oracles` hold both relations instead. Three planted cases pin the limit (a count of two beside one description, a count of five above a row count of one with five descriptions, a count of minus one) and the matrix lists it.
- Non-string description elements, `low`, `false` (Edge): the parser builds the list from risk descriptions, and a blank description is a legal row, so a non-blank-element conjunct would reject real designs.
- Oracle cannot be evidenced by a stored run, so give it a defect probe by mutating the runner, `medium`, rejected (Blind): the corpus mutates the document an agent writes. The runner is TeA's own code and `test:probe-targets` drives it end to end and compares its projection with the harness, so a mutation of it is a code change that suite already catches. The reason is in the README.
- Regex scans the whole document, `low`, rejected (Blind): the dialect requires a fully anchored pattern, `^\s*\S[\s\S]*$` costs three estimated steps per character against a budget of one million, which is the cost class of every material oracle.
- Step id rebuilt in `generate-probes.js`, `low`, rejected (Blind): `testDesignStdoutPointer(`design-${set.id}`)` is how that file builds it throughout.
- Pattern literal restated in the test, `low`, rejected (Blind): the literal sits in a reduced variant that stands for any check reading only the descriptions, and it is not compared with the real oracle.
- Variants run serially, `low`, rejected (Blind): the suite ran in half a second.
- Seen-false on a blank refused document, `low`, rejected (Edge): no stored document is blank, and the planted cases supply the failing evidence.

Round 1 (three Opus lenses over 250cbc0b, decided by the coordinator after verifying each finding):

- `design` was not tied to the document, `high`, `patch`: the oracle checked only that it was non-blank, so a truncated or substituted Markdown string passed. The check now also requires `deep-equality` of `/stdout/design` and `/artifact/design`, the direction names the artifact pointer, `projectionIsCoherent` takes the artifact text, and planted cases for a truncated and a different design fail. Re-measured: the check holds on all fourteen stored documents and every probe verdict and exit code is unchanged.
- The gameability signature cannot carry the artifact pointer, `medium`, `patch`: mapping it into P-016's predicate moved P-016 to a qualification refusal (`condition-artifact-channel-contract-local`, exit 3) and dropped its gameability strength, which moves a probe verdict. The engine refuses a signature pointer on the artifact channel, so P-016's signature cannot carry the artifact conjunct. The predicate stays byte-identical to main's ten stdout oracles, which keeps every verdict, and the rationale says why `O-016` is outside it. This differs from the fix brief's "map the artifact pointer as well".
- Mutants of the runner's counts survived, `high`, `patch`: the oracle and its twin both read the projection, so `scoredRiskCount` one too high or doubled passed the stored-run agreement. `test:contract-oracles` now asserts on every stored projection, directly, that `scoredRiskCount` equals the number of descriptions, `riskRowCount` is not less than `scoredRiskCount` and `design` equals the artifact. Scratch copies of `scoredRiskProjection` with `+ 1`, `* 2` and a truncated `design` each fail them.
- The one-key-short variants read fewer keys than they claimed, `medium`, `patch`: `withoutKey('scoredRiskCount')` removed both conjuncts that mention the count and so read `design` alone. Each variant now names exactly the three other keys in its direction, asserts that before scoring, and reads them through the existence of those three pointers.
- Vocabulary limit misstated, `medium`, `patch`: the generator comment, README, CHANGELOG, test comment and this record stated the limit as a missing operator and as the best the vocabulary allows. `equality` takes two evidence pointers; the vocabulary has no ordering between two evidence values and no pointer to a collection's length, so exact count equality and `>=` need an enumeration over the declared bound (200), which costs 60 to 68 KB of JSON per oracle and was judged too large. Every statement says that now.
- "The coverage is earned" and "no stored run can fail the oracle", `low`, `patch`: replaced by the plain limit that the oracles read every key and fail only for a defect in the runner's projection, with the workflow's Markdown still judged by the material oracles, and by the stored-run assertions.
- AD citations, `low`, `patch`: written as eval-quality's AD-20 rule 2 and AD-31, and dropped from the TeA spine context line, where AD-20 is the operational envelope and AD-31 does not exist.
- Story 1.100 framing, `low`, `patch`: the story statement, the dependency reason and the criteria agree.
- Story 1.48 plan table lacked the real-defect and ids row, `low`, `patch`: added.
- `expected-status.json` note differed from the writer, `low`, `patch` (pre-existing): both say "lockfile-resolved".
- The Evaluate skill taught a repair that cannot close the gap, `medium`, `patch`: `gaps.md` and `contract.md` now say that one oracle names every required key pointer in direction and check, with a compiled multi-key example.

Round 2 (two Opus regression lenses over 163f2316; no behavior regression, regeneration byte-identical, every probe verdict equals main):

- Nothing failed when the artifact pointer left the direction, `medium`, `patch`: the generator and the corpus pin built the direction from one function, and the test pinned only the check. `test:contract-oracles` now asserts that the direction equals the set of pointers the check reads, apart from the stdout root, and names `/interactions/<step>/artifact/design`. A scratch copy that drops the artifact pointer from `projectionCoherenceTargets` and regenerates fails both assertions for `O-016` and `O-017`.
- The skill guidance had no runtime check, `medium`, `patch`: `test:evaluate-guidance` resolves the whole-body example's check with `engine.resolveCheck`, asserting `{status: accepted, amount: 7}` holds and `{accepted, 8}` and `{rejected, 7}` do not, and requires the `gaps.md` row to say "every required response key pointer" and "parent pointer". Changing `accepted` to `rejected` in `contract.md` fails the first, and restoring the old `gaps.md` row fails the second.
- Story 1.100 test plan reused the four-key phrase, `low`, `patch`: it says "every required key but one".
- This record still said the vocabulary has no numeric comparison, `low`, `patch`: rewritten to the ordering and collection-length limit with the enumeration cost and the stored-run assertions.
- "The only way to keep every verdict", `low`, `patch`: the stdout-only conjuncts of `O-016` in P-016's predicate also kept every verdict. The record now says the engine refuses an artifact-channel pointer in a signature, and that the predicate stays byte-identical to main's ten stdout oracles.
- An antithesis in a test comment, `low`, `patch`: reworded.

## Design Notes

A stored run cannot fail the projection oracle, so its failure cases are planted. Each planted projection breaks one claim and is checked against the evaluated oracle and the scorer. The generator mutations that weaken a claim, a type or the scorer were run once in a scratch copy and each fails the planted case for it; they are recorded below and are not a committed test.

## Verification

**Commands:** `node tools/generate-contracts.js --check`; `node tools/generate-probes.js --check`; `npm run test:contract-oracles`; `npm run test:contracts`; `npm run test:probe-corpus`; `npm run test:eval-replay`; `npm run test:test-design-qualification`; `node test/eval-contract-strength.js --suite test-design --preflight-only`; the doc, schema, shard and coverage gates; `npm run format:check`; `npm run lint`; `npm run lint:md`.

**Observed:** see Completion Notes.

## Completion Notes

**Revert checks.** Each acceptance criterion was undone once in a scratch copy of the tree (`node_modules` linked, no git, nothing committed there) and the named suite observed to fail, then the copy was discarded:

- Restoring the contract without the projection oracles (the loop over fixture sets emptied) fails the generator (15 oracles on disk against 17 accounted), `test:contract-oracles` (the real contract no longer satisfies `whole-body`, and the widened variant no longer matches it) and `test:probe-corpus` (the baseline lists `whole-body` again).
- An oracle whose direction names only `/scoredRiskDescriptions` fails the generator's pin and the real-contract fixture.
- Dropping the `any` branch for a non-empty count with an empty list, replacing the row implication with `existence`, making the non-blank pattern accept anything, emptying the `shape` types, and reducing them to the two keys the first planted set mistyped each fail the planted case named for the claim.
- Replacing the scorer with a constant fails every incoherent planted case.
- Removing the projection entries from the generator's index fails it with the oracle count message.
- Round 1: `scoredRiskProjection` in a scratch copy with `scoredRiskCount` set to the description count plus one, to twice the count, and with `design` truncated to 50 characters each fail the stored-run assertions in `test:contract-oracles` (before the assertions, the first two passed). A shape descriptor that omits the types of `design` and `scoredRiskCount` fails the string-count planted case.
- A check that rejects a correct document (a pattern requiring a `Z`) moves the test-design baseline and fails `test:probe-corpus` on the changed digest and outcomes.

**Gates run.** All pass on the final tree: `node tools/generate-contracts.js --check`, `node tools/generate-probes.js --check`, `test:contract-sources`, `test:contracts`, `test:contract-oracles` (4276 checks), `test:probe-sources`, `test:probe-corpus`, `test:probe-targets`, `test:eval-replay`, `test:test-design-qualification` (206 checks), `test:eval-schemas`, `test:eval-ci-data`, `test:eval-test-design-data`, `test:doc-invocation-entry`, `test:doc-invocations`, `test:doc-count-sources`, `test:doc-counts`, `test:doc-claims`, `test:doc-claim-sources`, `test:shards`, `test:ci-coverage`, `test:suite-manifest`, `test:changelog`, `test:direction`, `test:evaluate-boundaries`, `test:release-metadata`, `test:eval-quality-corpus`, `test:schema-versions`, `test:lineage`, `test:boundary`, `test:evaluate-guidance`, `test:evaluate-authoring`, `test:evaluate-gap-loop`, `test:evaluate-ci`, `docs:build`, `docs:validate-links`, `format:check`, `lint`, `lint:md`. The staged suite-only test-design preflight (`node test/eval-contract-strength.js --suite test-design --preflight-only`) matched every expected outcome with 46 legs answered from cache and no model call. The full `npm test` chain is left to CI.

**Findings.** Fixed in this change: the round 0 and round 1 `patch` rows above. Not closed by this change: `whole-body` is still a gap for `tea-routing-intents`, `tea-routing-controls`, `test-review` and `trace`. It becomes Story 1.100, appended at the end of lane 3 with its `epics.md` and `test-design-epic-1.md` sections, its dependency row, its `backlog` row and its `parallel_lanes` entry, and the story count is ninety-four.

**Housekeeping.** Story 1.49's record and sprint row are `done` (it merged at `review`).

**Undone.** Nothing in the acceptance criteria. The criteria in `epics.md` and `test-design-epic-1.md` are rewritten because they assumed an engine change.
