---
title: 'Story 1.107: Partition evaluator mappings in a partition plan'
type: 'feature'
created: '2026-10-04'
status: 'in-review'
baseline_commit: '07f252f5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.107)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.107)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-9, AD-22)'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.51.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.105.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.106.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.107 to lane 1">

## Intent

**Problem:** Story 1.51 refuses a `partitionPlan` beside any evaluator but the deterministic one. A `command` or `sealed-brief-agent` evaluator binds oracles and rubric criteria to the keys it prints through `evaluator/mapping.json`, so the file would name the held-out oracle the development run must not hold; a `records` evaluator's records name oracles, behaviors and criteria that a view may not declare.

**Approach:** The mapping follows the contract view. A row of `evaluator/mapping.json` binds what `contract.json` declares: it is in the development and both views, and in the held-out view unless the held-out view drops the oracle or criterion it binds. The held-out plan gains an optional `mappings` array for the rows of what only the held-out partition declares, which join the held-out and both views. `mappingView` derives each partition's mapping beside `contractView`, so a run's evaluator layer (its row validator and converter, the keys a sealed-brief agent is shown, its tree digest) holds its view's mapping only. A `records` evaluator reads no mapping, so `importRecords` refuses, under a plan, a record that names an oracle, behavior or criterion the run's view does not declare.

## Boundaries & Constraints

**Always:** With no `partitionPlan`, and for a plan with no `mappings` and nothing to drop, every committed fixture, baseline and replay stays byte-identical. A development run never opens the held-out plan. `check` findings name paths and IDs and never quote held-out plan bytes: a plan row is named by its place in `mappings` and never by its key, and a plan rubric's levels never reach a finding. A record's foreign content is named by where it sits in the record and never by its ID. `schemaVersion` of the held-out plan stays 1 (the new field is optional). The engine's contract schema does not change.

**Never:** Partition gameability answers (Story 1.109) or designate a both-view oracle (1.110). Add a `partition` field to a mapping row. Hold a held-out oracle's row in `evaluator/mapping.json`. Invent a capability nobody needs (no records calibration derivation, no per-view calibration inputs for a harness).

## I/O & Edge-Case Matrix

| Scenario                        | Input / State                                                                                                                | Expected Output / Behavior                                                                                                                                     | Error Handling |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Development view                | `mapping.json` rows for a development-only and a shared oracle and criterion; plan `mappings` for the held-out ones          | The file's own bytes; no plan row; the tree digest is over the file                                                                                            | N/A            |
| Held-out view                   | Same folder, `--partition held-out`                                                                                          | Rows binding what the view declares, then the plan's rows; rows of a development-only oracle or criterion absent from the layer, the digest and every artifact | N/A            |
| Both view                       | No `--partition`                                                                                                             | Every row of the file, then the plan's                                                                                                                         | N/A            |
| Plan without `mappings`         | Held-out plan written before mappings joined it                                                                              | Held-out view holds the shared rows only; the both view is the file's bytes                                                                                    | N/A            |
| Plan row collides or repeats    | Key equal to a `mapping.json` key or an earlier row's                                                                        | `check` finding naming the row by place (`mappings[i]`) and never the key                                                                                      | Exit 10        |
| Plan row binds what no view has | Oracle, behavior or criterion the held-out view lacks, an oracle its behavior does not declare, wrong levels, double binding | `check` finding naming the row by place and the shape-checked IDs; levels never printed                                                                        | Exit 10        |
| Plan criterion unbound          | A held-out plan criterion no key binds                                                                                       | `check` finding naming `rubricId/criterionId`                                                                                                                  | Exit 10        |
| Held-out row in the file        | `mapping.json` binds an oracle `contract.json` lacks                                                                         | `check` of every partition names the key and IDs, and says the row belongs in the plan's `mappings`                                                            | Exit 10        |
| Contract error elsewhere        | Bogus oracle polarity beside bad plan rows                                                                                   | The contract error is the only finding; no row is blamed                                                                                                       | Exit 10        |
| Evaluator that reads no rows    | `mappings` beside a deterministic or records evaluator; a records evaluator beside a rubric                                  | `check` finding                                                                                                                                                | Exit 10        |
| Foreign record                  | A record with an oracle disposition, a finding's oracle or behavior, or a judge result the view lacks                        | Import refused, nothing copied, the record's own paths named, no ID                                                                                            | Exit 10        |
| No `partitionPlan`              | Any existing fixture                                                                                                         | Source bytes in every view; records unchecked as before                                                                                                        | N/A            |

</frozen-after-approval>

## What each evaluator kind receives

Read before the build. The story text assumed more than the code and the engine hold, so the acceptance criteria were rewritten (`epics.md`, `test-design-epic-1.md`), as Story 1.106 did for waivers.

- `command`: stdin is `{ sealedBrief, observations }` (`command-evaluator.js`). The mapping is never sent. The runtime validates the printed rows against the mapping's keys (`rowsValidator`) and converts them through it (`judgmentFromRows`); `tea.evaluatorTreeDigest` hashes every file under `evaluator/`, `mapping.json` included. The sealed brief is the engine's seal of the view's compiled contract and the observations are the plan steps the view runs, so stdin already follows the view (Story 1.51). The evaluator process runs in place, so a file under `evaluator/` is readable by it, which is why a held-out row must not sit in `mapping.json`.
- `sealed-brief-agent`: the prompt is the sealed brief plus `keys`, one entry per mapping key (`keysMaterial` in `sealed-brief-agent.js`): the key and its oracle and behavior IDs, or the criterion's text and anchored levels. This is where a development run would be shown a held-out oracle ID.
- `records`: the evaluator reads no mapping. A `SealedRunRecord` holds `observations[]` (`observationId` slugs, `interfaceId`, `operationId`), `oracleDispositions[].oracleId`, `findings[]` (`oracleId`, `behaviorId`, `probeId`) and `judgeResults[]` (`rubricId`, `criterionId`); it holds no plan step ID. eval-quality's `score` ignores a disposition of an oracle its contract lacks (`core/score/score.js` reads only the contract's oracles) and the schema says the criterion check "is the caller's". `importRecords` validated the schema, the brief digest, the run ID and the arm and nothing about content, so a foreign oracle reached the run directory unchallenged.
- Exit codes: an answer off the row schema (command or agent) is exit 12. Every records import refusal is an `EvaluatorLayerError`, which `run` maps to exit 10 (`the records evaluator's records cannot be scored`), as the evaluator guide says ("exit 10 and nothing copied"). The test design's exit 12 for records was wrong.
- Where the 1.51 refusal sat: `checkPartitionPlan` in `check.js` alone (`partitionPlan requires the deterministic evaluator`). Nothing in `preflight`, `run`, `partitionPlanProblems` or `ci` refused or ignored it, so lifting it needed the derivation and nothing else.

AC rewrite: the Given named a mapping row for a held-out oracle in `mapping.json`, which the development partition reads. A held-out row there reaches every development run's layer, so rows for what only the held-out partition declares live in the plan's `mappings`. The Then clauses named a "stdin that holds a held-out row" (a command evaluator receives no row) and a records "step" (a record carries none). They now speak of the layer, the recorded stdin and run directory, and the oracle, behavior and criterion IDs a record carries. The exit is 10.

No engine change is needed.

## Code Map

- `cli/lib/evaluate/partition.js` -- `mappingView` (the pure derivation), `mappingViewProblems` (the plan rows' findings, named by place), `contractView` and `loadContractView` return `source`, `heldOutPlan` and `partition` so the layer can derive its mapping from the view that was compiled.
- `cli/lib/evaluate/judgment-rows.js` -- `mappingContractProblems` takes `subject`, `levels`, `reportKey`, `reportCriterion` and `hint`, so one rule set serves `mapping.json` against `contract.json` and the plan's rows against the held-out view.
- `cli/lib/evaluate/evaluators.js` -- `readEvaluatorLayer` takes the `view`, validates the view's mapping against the view's contract, and digests the view's mapping bytes in place of the file's (`layer.files` stay the bytes on disk, which `evaluatorLayerChange` holds the layer to).
- `cli/lib/evaluate/run.js`, `preflight.js` -- pass the contract view to the layer and to the records import.
- `cli/lib/evaluate/records-evaluator.js` -- `declaredContent`, `foreignContent`, and the refusal in `importRecords` under a plan.
- `cli/lib/evaluate/check.js` -- the 1.51 refusal is gone; `checkPlanMappings` runs the plan-row rules over a held-out view that passed the engine's contract schema; a records evaluator beside a rubric and `mappings` beside an evaluator that reads none are findings; a `mapping.json` row binding what `contract.json` lacks carries where it belongs.
- `cli/lib/evaluate/schemas/held-out-plan.schema.json` -- optional `mappings` (strict row shapes with ID and key patterns); `evaluation.schema.json` description.
- `test/test-evaluate-partition-plans.js` -- `mappingLayer`, the pure cases (`mappingView`, the row validators, the sealed-agent prompt, `foreignContent`), the layer unit with the tree digest, nine `check` cases, the command evaluator flow over split oracle and criterion rows in all three partitions, and the records flow. `test/fixtures/evaluate/partition-plan-evaluator/` (new: `rows.js`, `mapping.json`, `frameworks.json`). `test/test-evaluate-guidance.js` -- the tagged mapping example, five markers and five mutants.
- `docs/reference/tea-evaluate-cli.md`, skill `references/corpus.md`, `CHANGELOG.md`, `epics.md`, `ARCHITECTURE-SPINE.md` (AD-22), `test-design-epic-1.md`, `sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**

- [x] `partition.js`, schema -- `mappingView`, plan `mappings`, held-out view filter -- each view's layer holds only its rows
- [x] `evaluators.js`, `run.js`, `preflight.js` -- the layer reads the view's mapping and digests it
- [x] `records-evaluator.js`, `run.js` -- foreign records refused under a plan
- [x] `check.js`, `partition.js`, `judgment-rows.js` -- the 1.51 refusal replaced; plan-row findings by place; misplaced row hint
- [x] fixtures and cases in `test-evaluate-partition-plans.js`, guidance example and mutants
- [x] docs, skill reference through `/bmad-workflow-builder` Edit headless, CHANGELOG, AD-22 amendment, `epics.md` and test-design amendment, sprint row `review`
- [x] Revert each acceptance check once and record the observation, mutant table and the wrong-row case below

**Acceptance Criteria:**

- Given a `mapping.json` with rows for a development-only and a shared oracle and criterion, and a plan whose `mappings` hold the held-out ones, when each partition runs under a command evaluator, then each run's layer holds only its view's rows, its recorded stdin and run directory hold no ID or key of the other partition, and `check` names a plan row by its place and a misplaced `mapping.json` row by its key and IDs.
- Given a `records` evaluator under a plan, when a record carries an oracle, behavior or criterion the view does not hold, then the import is refused (exit 10, nothing copied) naming where it sits.
- Given the held-out view, when its mapping filter is removed, then the pure view case fails and a held-out run stops at the evaluator layer (`key accepted:development-run binds oracle O-002, which the contract does not declare`).
- Given any committed fixture, baseline or replay with no `partitionPlan`, then no byte changes.

## Implementation Notes

- The filter is by what the view dropped, not by what it lacks: a row leaves the held-out view only when `contract.json` declares the oracle or criterion it binds and the held-out view does not. A row for something no view declares stays for `check` and the run to refuse (named once, by the file), and a plan row for the same is `check`'s finding about the plan.
- The plan's rows carry their `key` inside the row (`mappings` is an array), so a finding can name a row by `mappings[i]` and never print a key, which is the plan's own text. `mapping.json` is the adopter's file and is read by the development partition, so its rows are named by key.
- `check` of the plan's rows runs only over a held-out view that passed the engine's contract schema, so a contract error elsewhere is the only finding about it. `checkEvaluator` still checks `mapping.json` against `contract.json` in every partition's `check`; a row of it that binds a held-out oracle names where the row belongs.
- The tree digest substitution: `layer.files` keeps the bytes on disk for the change detector, and only the digest reads the view's mapping bytes. A view that drops and adds nothing is the file's bytes, so no existing digest moves.
- A records evaluator beside a rubric and a plan is refused rather than derived. The harness's calibration judgments are one-to-one with the labelled file, scorer inputs need the criterion's step in the view, and `--calibration-inputs` reads `contract.json` alone, so deriving them would need a partition flag and a partial judgments format that nobody asked for.
- The records refusal covers findings' `behaviorId` too. Behaviors are in every view, so only a behavior no contract declares is foreign; the check is the same set rule as for oracles and criteria.

## Spec Change Log

## Completion Notes

See the gate summary, the revert observations and the mutant table below.

## Design Notes

Alternatives turned down: every row in `evaluator/mapping.json`, filtered per view (the development partition reads that file, and a command evaluator runs in place beside it, so every development run would hold the held-out oracle's ID); a `partition` field on a row (the oracle or criterion decides, as a rubric criterion's evidence does); passing the mapping on stdin (a command evaluator never had it); refusing a records evaluator under a plan (its records name oracles, so a derivation by set membership is cheap and the refusal would leave no home); deriving a records evaluator's calibration judgments per view (a partial judgments format and a partition flag on `--calibration-inputs` for no stated need, so the combination is refused).

## Verification

**Commands:**

- `npm run test:evaluate-partition-plans && npm run test:evaluate-evaluators && npm run test:evaluate-records && npm run test:evaluate-calibration && npm run test:evaluate-partitions && npm run test:evaluate-check && npm run test:evaluate-run && npm run test:evaluate-guidance` -- expected: pass
- `npm run test:evaluate-ci && npm run test:eval-replay` -- expected: pass, no replay byte changes
- `npx eslint . --max-warnings 0 && npm run format:check && npm run lint:md && npm run docs:validate-links` -- expected: pass
