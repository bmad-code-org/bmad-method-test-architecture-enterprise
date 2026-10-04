---
title: 'Story 1.100: Report whole-body coverage for the routing, test-review and trace contracts'
type: 'bugfix'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bc50863e'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.100)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.100 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-8, AD-19)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.48.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.94.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.99.md'
  - '{project-root}/AGENTS.md'
---

<!-- prettier-ignore-start -->

<frozen-after-approval reason="The Evaluate relay coordinator froze the approach">

## Intent

**Problem:** eval-quality reports the `whole-body` coverage rule unsatisfied for four contracts.
The rule asks for one oracle whose direction and check both address every required response key of an operation at one step.
`tea-routing-intents` and `tea-routing-controls` declare `action` and `reason` for `route-intent`, `test-review` declares 23 keys for its verdict artifact and `trace` 22 for its summary, and every oracle of each reads a few.

**Approach:** The fix is TeA-side, as Story 1.48's was.
`tools/generate-contracts.js` appends one oracle per plan step after the existing oracles of each contract, naming every required key pointer in its direction and its check, with a check that fails for a real defect and a scorer twin.
A contract narrows its `requiredKeys` only for a key the runner or workflow does not always emit, shown from that output, with the choice and its reason in `test/contracts/README.md`.
The new oracles join the Story 1.94 stored-run discipline and the Story 1.99 mutation qualification where they apply, and every probe verdict and exit code stays as recorded.

## Boundaries & Constraints

**Always:** Keep every existing oracle id and behavior id. Regenerate contracts and probes through their generators. Keep every probe verdict and exit code. Run mutation experiments in a scratch copy with a link to this checkout's `node_modules`. Signal only processes this work started.

**Never:** Change eval-quality or release it. Edit generated JSON by hand. Fix Story 1.121 (the three ci probes' preflight). Flip the Story 1.94 row or edit the lane lists in `epics.md`. Run the full `npm test`.

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                                      | Expected Output / Behavior                                         |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Real contract               | Each of the four contracts as generated                            | `whole-body` is not a coverage gap                                 |
| Oracle removed              | The contract without its whole-body oracles and their behaviors    | `whole-body` is a coverage gap                                     |
| One key                     | Every whole-body oracle reduced to one key in both channels        | `whole-body` is a coverage gap                                     |
| One key short               | Oracle that reads every key but one, in direction and check        | `whole-body` is a coverage gap, for every key                      |
| Direction drops a key       | Check reads every key, direction names all but one                 | `whole-body` is a coverage gap, for every key                      |
| Check drops a key           | Direction names every key, check reads all but one                 | The compiler refuses it as `direction-check-misaligned` (AD-3)     |
| Widened                     | The one-key oracle widened to every key                            | `whole-body` is satisfied                                          |
| Routing reason null or blank| A reply that named an action and no reason                         | Oracle fails, twin agrees                                          |
| Verdict or summary key lost | Any required key dropped, retyped, or an undeclared key added      | Oracle fails, twin agrees                                          |
| Wrong stored run            | A record whose legs read another run, or a summary losing a key    | The whole-summary oracle is violated in the record                 |

</frozen-after-approval>

<!-- prettier-ignore-end -->

## Code Map

- `tools/generate-contracts.js`: `routingWholeBodyExpression`, `routingWholeBodyTargets`, `routingAnswerIsWhole` and the `whole-body` specs appended in `routingOracleSpecs`; `verdictWholeBodyExpression`, `verdictWholeBodyTargets`, `verdictIsWhole` and the oracle `O-014` and behavior `B-013` appended in `buildTestReviewContract`; `traceWholeSummaryExpression`, `traceWholeSummaryTargets`, `traceSummaryIsWhole`, `traceSummaryShape` and the `whole-summary` specs appended in `traceOracleSpecs`, with behavior `B-007` in `TRACE_BEHAVIORS`.
- `test/lib/probe-scoring.js`: the test-review builder measures the new oracle with `verdictIsWhole`, the trace builder passes the stored summary to each scorer and takes a `summaryOf` option, the routing builder derives each case's whole-body disposition from `routingAnswerIsWhole` and takes an `answerOf` option, and the routing oracle lookup skips oracles that name more than one pointer.
- `tools/generate-probes.js`: the routing oracle lookup skips oracles that name more than one pointer. The generated probe files are byte-identical.
- `test/test-contract-oracles.js`: agreement of each oracle with its twin on stored and planted evidence, `checkWholeBodyCoverage` (contract variants scored through the engine for the four contracts), `checkWholeBodyDeclarations` (required keys against their source, the stored correct runs and the README).
- `test/test-probe-corpus.js`: the whole-verdict, whole-summary and routing whole-body reads that fail a disposition fixed at `held`.
- `test/test-test-review-cli.js`: each real CLI run in the payload block carries every `always` key.
- Generated: `test/contracts/{tea-routing-intents,tea-routing-controls,test-review,trace}.contract.json` and `test/probes/expected-strength.json`. Unchanged: every probe file and `test/contracts/expected-status.json`.
- Docs and tracking: `test/contracts/README.md`, `test/probes/README.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, Story 1.94's record and row (done).
- Reused, unchanged: eval-quality's `shape`, `existence`, `set-membership` and `regex` operators; `test/lib/probe-scoring.js` (`runSuite`, `storedProbePort`, `suites`); the Story 1.48 coverage fixture pattern.

## Tasks & Acceptance

**Execution:**

- [x] `tools/generate-contracts.js`: the three expressions, their twins, the specs, the behaviors.
- [x] `test/lib/probe-scoring.js`, `tools/generate-probes.js`: dispositions from the twins, the options the checks hand them, the oracle lookup.
- [x] `test/test-contract-oracles.js`, `test/test-probe-corpus.js`, `test/test-test-review-cli.js`: agreement, coverage variants, declarations, wrong reads.
- [x] Regenerate the four contracts and the baseline; README sections, changelog, plan amendments, sprint status.

**Acceptance Criteria:**

- Given each of the four contracts, when eval-quality scores it, then `whole-body` is satisfied because one oracle per plan step names every required key pointer in both channels, and it is unsatisfied when the oracles are removed, read fewer keys, or name fewer keys in the direction.
- Given a declaration, when its required keys are compared with what the runner or workflow always emits, then each stays required and `test/contracts/README.md` records the decision, the reason and the output that shows it.
- Given the regenerated baseline, then every probe verdict and exit code is unchanged, the three generators' `--check` modes pass, and the focused suites pass.

## Implementation Notes

- **Which contracts report the rule.** All four, read from `test/probes/expected-strength.json` before any change: `tea-routing-intents`, `tea-routing-controls`, `test-review` and `trace` list `whole-body`. The nfr, ci and test-design contracts do not.
- **No key is narrowed.** The routing runner's parser returns all seven keys of every answer, so `action` and `reason` are always printed. `assertDeclaredKeys` in `cli/test-review.js` throws for a verdict that lacks an `always` key, and `test:test-review-cli` now asserts that each of its four real runs carries all 23. Step-05 of the trace workflow assigns each of the 22 required keys inside one object literal, and the three it assigns under a condition are already permitted-only. Every stored run of these suites is constructed, so the real evidence is the code and the CLI runs, which `test/contracts/README.md` states.
- **What each oracle says.** A `shape` over the object (declared keys, declared types, no undeclared key) and one `existence` per required key, which is what puts each key pointer in the check beside the root that `shape` reads. Routing adds `set-membership` of `action` in the three answers and a non-blank `reason`. The routing parser maps a reply with no reason to a null `reason`, so the oracle's real defect is an answer that named an action and said nothing about why. The test-review and trace oracles fail on a missing, retyped or undeclared key.
- **Variants.** The compiler refuses a direction that names a key its check does not read (`direction-check-misaligned`, AD-3), so the check-only variant never reaches the rule. `test:contract-oracles` asserts the refusal for every key and scores the other four variants through the engine.
- **Side effect on `success-indicator-separation`.** The routing oracle reads `action`, the success indicator, beside `reason`, a payload key, in both channels, so the engine reports that rule satisfied for both routing contracts. Both gaps drop from the baseline's `unsatisfiedCoverageRules` for the two suites.
- **Probe records.** Trace derives the whole-summary disposition from the stored summary through the scorer twin, which a wrong run or a dropped key violates. Test-review derives it from the stored verdict, which a dropped, retyped or added key violates. Routing reads no stored run: it derives it from the constructed correct answer, which `routingWholeBodyProblems` holds to a malformed answer, so routing stays out of `STORED_RUN_SUITES`. No new oracle has a defect probe, so Story 1.99's mutation qualification has nothing to qualify: no controlled mutation of the skill, the CLI or the workflow makes an answer, verdict or summary malformed without being a code change that `test:probe-targets` and the harnesses already catch.
- **Baseline movement.** `unsatisfiedCoverageRules` drops `whole-body` for the four suites and `success-indicator-separation` for the two routing suites. The `basis` lines that named those gaps are gone, and each probe whose suite gained oracles gains one outcome per new oracle. Every verdict, exit code, pre-flight result, strength vector and qualification code is unchanged, and every `*.probes.json` is byte for byte the same.
- **Staged preflight.** `node test/eval-contract-strength.js --suite <suite> --preflight-only` for the four suites matched every expected outcome with every leg answered from cache and no model call.

## Spec Change Log

## Review Triage Log
