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
- `test/lib/probe-scoring.js`: the test-review builder measures the new oracle with `verdictIsWhole`, the trace builder passes the stored summary to each scorer and takes a `summaryOf` option, and the routing builder derives each case's whole-body disposition from `routingAnswerIsWhole` and takes an `answerOf` option.
- `tools/generate-probes.js`: unchanged. The generated probe files are byte-identical.
- `test/test-contract-oracles.js`: agreement of each oracle with its twin on stored and planted evidence, `checkWholeBodyCoverage` (contract variants scored through the engine for the four contracts), `checkWholeBodyDeclarations` (required keys against their source, the stored correct runs and the README).
- `test/test-probe-corpus.js`: the whole-verdict, whole-summary and routing whole-body reads that fail a disposition fixed at `held`.
- `test/test-test-review-cli.js`: each real CLI run in the payload block carries every `always` key.
- Generated: `test/contracts/{tea-routing-intents,tea-routing-controls,test-review,trace}.contract.json` and `test/probes/expected-strength.json`. Unchanged: every probe file and `test/contracts/expected-status.json`.
- Docs and tracking: `test/contracts/README.md`, `test/probes/README.md`, `CHANGELOG.md`, `epics.md`, `test-design-epic-1.md`, `sprint-status.yaml`, Story 1.94's record and row (done).
- Reused, unchanged: eval-quality's `shape`, `existence`, `set-membership` and `regex` operators; `test/lib/probe-scoring.js` (`runSuite`, `storedProbePort`, `suites`); the Story 1.48 coverage fixture pattern.

## Tasks & Acceptance

**Execution:**

- [x] `tools/generate-contracts.js`: the three expressions, their twins, the specs, the behaviors.
- [x] `test/lib/probe-scoring.js`: dispositions from the twins and the options the checks hand them.
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

## Observations

Each mutant ran in a scratch copy of `HEAD` (`git archive HEAD | tar -x`, this checkout's `node_modules` linked), one edit at a time, restored from `HEAD` afterward; where the edit changes a generator the contracts were regenerated in the copy first. The shared checkout was never mutated. `M` is the mutant, the right column the first failing check.

| Mutant | Edit                                                                                         | Fails                                                                                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01    | Routing emits no whole-body specs (the repair reverted)                                      | `test:contract-oracles` (no oracle at any step, real contract no longer satisfies the rule), `test:probe-corpus` (the baseline lists `whole-body` again, 20 problems)                    |
| M02    | Routing check without the non-blank reason regex                                             | `test:contracts` (the direction names `reason` and the check does not read it: `direction-check-misaligned`), `test:contract-oracles` (blank reason, direction pin)                      |
| M03    | Non-blank pattern accepts any string                                                         | `test:contract-oracles` (blank-reason planted answer, every case)                                                                                                                        |
| M04    | Routing `shape` declares no types                                                            | none. Equivalent: the `set-membership` of `action` and the regex over `reason` already refuse a number and a null, so the types state a claim the other two conjuncts also state         |
| M05    | Routing twin is a constant `true`                                                            | `test:contract-oracles` (null, blank and missing planted answers), `test:probe-corpus` (`routingWholeBodyProblems`)                                                                      |
| M06    | Routing record never derives the whole-body disposition                                      | `test:probe-corpus` (`routingWholeBodyProblems`, 20 problems)                                                                                                                            |
| M07    | Routing record reads the first case's answer for every case                                  | `test:probe-corpus` (95 problems: another case's oracle stays held)                                                                                                                      |
| M08    | Verdict oracle without its per-key `existence` conjuncts                                     | `test:contracts` (direction-check-misaligned), `test:contract-oracles` (direction pin)                                                                                                   |
| M09    | Verdict oracle names 22 of 23 keys in both channels                                          | `test:contract-oracles` (the real contract no longer satisfies `whole-body`), `test:probe-corpus` (baseline)                                                                             |
| M10    | Verdict `shape` permits only the required keys                                               | none at first: no stored verdict carries a conditional key. A planted verdict per conditional key (permitted at its type, refused at another) now fails it, observed after the fix below |
| M11    | Verdict twin ignores types                                                                   | `test:contract-oracles` (stored `unattributed-violations` and every retyped planted verdict)                                                                                             |
| M12    | Verdict twin accepts an undeclared key                                                       | `test:contract-oracles` (planted extra key)                                                                                                                                              |
| M13    | Test-review record fixes the whole-verdict disposition at `held`                             | `test:probe-corpus` (`testReviewVerdictProblems`, 46 problems)                                                                                                                           |
| M14    | Test-review record reads the whole oracle through the four payload fields                    | `test:probe-corpus` (41 problems: the 19 other keys, the retypes and the undeclared key)                                                                                                 |
| M16    | Trace scorer receives no summary                                                             | `test:probe-corpus` (`storedRunProblems`: O-027 no longer holds on the stored correct run)                                                                                               |
| M17    | Trace whole-summary twin is a constant `true`                                                | `test:contract-oracles` (stored `seeded-rejected-evidence-omitted`), `test:probe-corpus` (44 problems, one per dropped key)                                                              |
| M19    | Trace `shape` permits only the required keys                                                 | `test:contracts` (compile), `test:contract-oracles` (the three conditional keys in the seeded run)                                                                                       |
| M20    | Trace twin ignores types                                                                     | `test:contract-oracles` (planted retyped summaries)                                                                                                                                      |
| M21    | `rejected_evidence` narrowed out of trace `requiredKeys`                                     | `test:contract-oracles` (`checkWholeBodyDeclarations`, the one-key-short variants, the twin)                                                                                             |
| M22    | `keyStrengths` narrowed out of the verdict `requiredKeys`                                    | `test:contract-oracles` (`checkWholeBodyDeclarations`, the one-key-short variants)                                                                                                       |
| M23    | `reason` narrowed out of the routing runner's required keys                                  | `test:contract-oracles` (the direction no longer matches the check, and the declaration differs from the oracle's keys)                                                                  |
| M24    | README section removed                                                                       | `test:contract-oracles` (`checkWholeBodyDeclarations`, four contracts)                                                                                                                   |
| M25    | Trace record answers `held` for every whole-summary oracle                                   | `test:probe-corpus` (44 problems)                                                                                                                                                        |
| M26    | Trace builder ignores `summaryOf`                                                            | `test:probe-corpus` (44 problems: the key-drop reads read the intact summary)                                                                                                            |
| M27    | Routing oracle lookups skip multi-pointer oracles (the first version of this change) removed | none. The whole-body oracle names `action` first and no lookup reads `action`, so the hardening guarded nothing and is not in the change                                                 |
| M28    | `assertDeclaredKeys` bypassed and `advisoryObservations` left out of the verdict             | `test:cli` (the four real verdicts, each with the absent key named)                                                                                                                      |
| M30    | A stored correct trace summary loses `repo`                                                  | `test:contract-oracles` (declarations, twin, oracle), `test:probe-corpus`                                                                                                                |
| M31    | A stored scored verdict loses `keyStrengths`                                                 | `test:contract-oracles` (declarations, twin, oracle), `test:probe-corpus`                                                                                                                |

M18, removing the trace key-drop block of `test:probe-corpus` by itself, passes: the stored deviation and the wrong rows fail the clean set's oracle without it.
The block is what fails a scorer that reads fewer keys than the oracle names, and M26 is the mutant that shows it is read.
M10 and M27 found two gaps in the first version: the planted conditional keys (added) and a lookup nothing needed (removed).

**The wrong-row case.** `test:probe-corpus` holds a record to the run its leg reads, so each wrong row names the oracles that notice it. With the seeded leg pointed at `seeded-rejected-evidence-omitted` the record violates `O-011` (the rejected evidence of AC-2) and `O-027` (the whole summary, which lost `rejected_evidence`). With the clean leg pointed at `seeded-correct-run` it violates nine oracles of the clean set (the gate, the criteria, the inventory, the priority breakdown, the risk summary, the per-level counts, the collection block, live evidence and rejected evidence) and holds `O-028`, since the seeded summary is a whole object. So `O-028` notices a malformed summary and the other oracles notice a wrong one, which is the division of labor the contract states.

## Revert checks

| Criterion                                                                  | What fails on a revert                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whole-body` is satisfied by one oracle per step naming every required key | M01 and M09 (the oracle removed, one key short), plus the engine-scored variants of `checkWholeBodyCoverage` for every key of every contract                                                                                                            |
| A narrowed declaration is justified                                        | M21, M22, M23 (a narrowed key), M30, M31 (a stored run that stops carrying one) and M24 (the README section)                                                                                                                                            |
| Probe verdicts and exit codes are stable                                   | `test:probe-corpus` compares every verdict, exit code, pre-flight result, strength vector and qualification code with the baseline; the movement is `unsatisfiedCoverageRules`, the `basis` lines naming the closed gaps and one outcome per new oracle |
| Each new oracle's disposition follows its run                              | M05, M06, M07, M13, M14, M16, M17, M25, M26                                                                                                                                                                                                             |

## Completion Notes

**Gates run.** On the final tree: `node tools/generate-contracts.js --check`, `node tools/generate-probes.js --check`, `test:contract-oracles` (5547 checks), `test:contracts`, `test:probe-corpus`, `test:probe-sources`, `test:contract-sources`, `test:probe-targets`, `test:test-review-qualification`, `test:trace-qualification`, `test:nfr-qualification`, `test:test-design-qualification`, `test:ci-qualification`, `test:eval-replay`, `test:cli`, `test:probe-conformance`, `test:corpus-conformance`, `test:schema-versions`, `test:eval-routing-data`, `test:eval-routing-boundaries`, `test:eval-routing-evidence`, `test:eval-trace-data`, `test:eval-schemas`, `test:evaluate-boundaries`, `test:evaluate-mutation`, `test:lineage`, `test:eval-quality-corpus`, `test:file-system-port`, `test:ci-coverage`, `test:shards`, `test:changelog`, the staged preflight for `tea-routing-intents`, `tea-routing-controls`, `test-review` and `trace` (every leg answered from cache, no model call), `npx eslint . --max-warnings 0`, `npm run format:check`, `npm run lint:md` and `npm run docs:validate-links`. The full `npm test` chain is left to CI.

**CI shard impact.** No npm script is added. `test:contract-oracles` and `test:probe-corpus` each run in about two seconds.

**Findings.** Fixed in this change: the two gaps the mutants found (M10, M27). Not closed by this change: nothing. The three ci probes' pre-flight (Story 1.121) and the two ci oracles `KNOWN_UNHELD` lists (Story 1.122) are untouched.

**Housekeeping.** Story 1.94's record and sprint row are `done`, as the coordinator set them in the working tree before this build, and this commit carries them.

**Undone.** Nothing in the acceptance criteria. The plan's variant "whose oracle drops one key in the check" is refused by the compiler when the direction still names the key, so the scored variants drop it from both channels or from the direction alone, and the refusal is asserted.
