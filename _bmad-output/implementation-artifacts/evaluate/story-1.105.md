---
title: 'Story 1.105: Partition rubrics in a partition plan'
type: 'feature'
created: '2026-10-04'
status: 'in-review'
baseline_commit: '807410f5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.105)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.105)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-9, AD-22)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.51.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.9.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and assigned Story 1.105 to lane 1">

## Intent

**Problem:** Story 1.51 refuses a `partitionPlan` beside a rubric that reads a development-only step. A rubric criterion's `evidence` pointer names a step (`/interactions/<stepId>/...`), so the criterion disappears with its step in the held-out view, and an adopter whose behavior needs a judged criterion on a held-out request has no home for it: `contract.json` would carry the held-out step's ID, and the development run would judge it.

**Approach:** A criterion belongs to the partition whose steps its evidence reads. Criteria in `contract.json` are in the development view, and in the held-out view unless they read a development-only step; a rubric left with no criterion leaves the held-out view. The held-out plan gains an optional `rubrics` array for criteria only the held-out partition judges. `contractView` derives each partition's rubrics at the one choke point, so the judge, the calibration and the scoring each see their own view's criteria. One `policy/judge-calibration.json` serves every partition, and a partition's run judges the items of the criteria its view holds.

## Boundaries & Constraints

**Always:** With no `partitionPlan`, and for a plan with no `rubrics`, every committed fixture, baseline and replay stays byte-identical. A development run never opens the held-out plan. `check` findings name paths and IDs and never quote held-out plan bytes; a criterion is named by its ID only when the ID has the schema's shape, otherwise by its index. `schemaVersion` of the held-out plan stays 1 (the new field is optional). The engine's contract schema does not change.

**Never:** Partition waivers (Story 1.106), evaluator mappings (1.107), gameability answers (1.109) or designate a both-view oracle (1.110). Add a `partition` field to a criterion. Merge a plan rubric into a `contract.json` rubric. Use Claude or a live model (the rubric judge in every test is the stub judge).

## I/O & Edge-Case Matrix

| Scenario                           | Input / State                                                                                            | Expected Output / Behavior                                                                                                              | Error Handling                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Development run                    | `contract.json` rubric with a development and a shared criterion; plan rubric with a held-out one        | Run `contract.json` equals the folder's; judge handed the development and shared criteria; calibration judges only their items          | N/A                                                         |
| Held-out run                       | Same folder, `--partition held-out`                                                                      | View holds the shared criterion and the plan's; the development criterion is absent from every artifact; calibration judges their items | N/A                                                         |
| Both view                          | No `--partition`                                                                                         | Every criterion; every calibration item judged                                                                                          | An item of a criterion no view declares exits 10 in `check` |
| Item of the other partition        | Labelled file holds items of a criterion the run's view lacks                                            | Not judged, not validated in a partition run                                                                                            | `check` over both files names an item of no criterion       |
| Unreachable criterion              | `contract.json` criterion reads a step it lacks; plan criterion reads a development-only or unknown step | `check` finding naming criterion and rubric ID and the step                                                                             | Exit 10                                                     |
| Plan rubric ID collision           | Plan rubric ID equals or repeats a `contract.json` or plan rubric ID                                     | `check` finding naming the rubric ID                                                                                                    | Exit 10                                                     |
| Held-out-only rubric               | `contract.json` holds no rubric; plan holds one; judge declared                                          | `check` passes; development run calls no judge; held-out run calibrates and judges                                                      | N/A                                                         |
| No rubric anywhere, judge declared | `contract.json` and plan declare no rubric, `judge` present                                              | `check` finding that no judge runs                                                                                                      | Exit 10                                                     |
| No `partitionPlan`                 | Any existing fixture                                                                                     | Source bytes in every view, strict calibration as before                                                                                | N/A                                                         |

</frozen-after-approval>

## Where a criterion's evidence names a step

Read before the build; the whole story rests on these seams.

- Representation: `contract.rubrics[]` is `{ id R-nnn, scaleLevels[{level, anchor}], failureModePenalties[{name, description}], maxLength, criteria[{ id RC-nnn, text, evidence }] }` (eval-quality `RubricBody`). Criterion IDs are unique within a rubric and may repeat across rubrics; the pair `rubricId/criterionId` is the identity (`compile/rubrics.js`). An empty `criteria` array is legal. A criterion's `evidence` matches `^/interactions/<stepId>/<channel>...`, and an unreachable one is the engine's `rubric-evidence-unreachable` at compile.
- `partition.js` `stepsReadBy` already read a criterion's `evidence` as a step reference (Story 1.51's `POINTER_FIELDS`), which is what made the 1.51 refusal possible and what makes the derivation here a filter on the same read.
- `judge.js` `judgeRubrics` scores every criterion of `contract.rubrics` once per trial from `stepObservations[stepId]`, and its calibration form keeps the one rubric and criterion `calibrationResponse` names. `run.js` hands it `context.contract`, which is the partition view.
- `calibration.js`: `calibrationStepPair` and `calibrationProjection` read the criterion's `evidence` for the step and the channel; `calibrationProblems` keys items by `rubricId/criterionId` and refused any item naming a criterion the contract lacks; `runCalibration` loops the contract's rubrics and criteria and takes their items from the labelled file.
- `score.js`, `arm.js`: neither names a rubric. They read the compiled `eval-contract.json` of the run and the records' `judgeResults`, so scoring follows the view the run compiled. No change there.
- `check.js`: `checkJudge` (judge and model snapshot required when the contract has a rubric, refused when it has none) and `checkCalibration` read `context.contract`. `ci.js` `judgeCalibrationCheck` read `contract.json`.

## Code Map

- `cli/lib/evaluate/partition.js` -- `reachableRubric` (held-out filter), `contractView` appends `heldOutPlan.rubrics`, `partitionPlanProblems` replaces the rubric refusal with the reachability and ID rules, `readHeldOutPlan` doc.
- `cli/lib/evaluate/schemas/held-out-plan.schema.json` -- optional `rubrics` (ID pattern only; the engine's contract schema judges the rest through the view).
- `cli/lib/evaluate/calibration.js` -- `calibrationProblems` and `runCalibration` take `partial`: items of a criterion the view lacks are skipped; a view with no rubric has nothing to calibrate.
- `cli/lib/evaluate/run.js` -- passes `partial` for a development or held-out run under a `partitionPlan`.
- `cli/lib/evaluate/check.js` -- `checkPartitionPlan` returns the plan it read; `checkJudge` and `checkCalibration` hold the union of `contract.json`'s and the plan's rubrics, and run `partial` when the plan is unread; `locate` maps a view's rubric index back to the plan's.
- `cli/lib/evaluate/ci.js` -- `judgeCalibrationCheck` reads the view of the baseline's partition under a plan.
- `test/test-evaluate-partition-plans.js` -- `rubricLayer`, `judgeCalls`, pure view cases, eleven `check` finding cases and the held-out-only rubric case and the development, held-out and both runs with scoring.
- `test/test-evaluate-calibration.js` -- `partial` cases. `test/test-evaluate-guidance.js` -- the tagged example and the wording.
- `docs/reference/tea-evaluate-cli.md`, skill `references/corpus.md`, `CHANGELOG.md`, `epics.md`, `ARCHITECTURE-SPINE.md` (AD-22), `test-design-epic-1.md`, `sprint-status.yaml`.

## Tasks & Acceptance

**Execution:**

- [x] `partition.js`, schema -- criterion ownership by evidence step, held-out view filter, plan `rubrics` -- each view holds only the criteria its steps reach
- [x] `calibration.js`, `run.js` -- partition-aware calibration -- a run judges the items of its own view's criteria
- [x] `check.js`, `partition.js` -- union-aware judge and calibration checks, unreachable-criterion and rubric-ID findings -- `check` names a criterion no view reaches by ID
- [x] `ci.js` -- judge-calibration over the baseline partition's view
- [x] fixtures and cases in `test-evaluate-partition-plans.js` and `test-evaluate-calibration.js`, guidance example
- [x] docs, skill reference through `/bmad-workflow-builder` Edit headless, CHANGELOG, AD-22 amendment, sprint row `review`
- [x] Revert each acceptance check once and record the observation, mutant table and the wrong-row case below

**Acceptance Criteria:**

- Given a rubric criterion whose evidence reads a held-out-only step and one that reads a development-only step, when preflight and run execute each partition, then each view holds only the criteria its partition's steps can reach, `check` names a criterion that no view can reach by its ID, and calibration items are judged in the partition that owns their criterion.
- Given the development view, when the partition filter is removed, then the development view carries the held-out criterion and the isolation fixture fails.
- Given any committed fixture, baseline or replay with no `partitionPlan`, then no byte changes.

## Implementation Notes

- A criterion has one `evidence` pointer, so it reads one step and has one home: `contract.json` criteria are development (reading a development-only step) or shared (reading a shared step); plan criteria are held-out. There is no stored `partition` field. The held-out view drops a `contract.json` criterion by the same `stepsReadBy` read that drops an oracle.
- Plan rubrics are whole rubrics with IDs `contract.json` does not use. Merging a plan criterion into a `contract.json` rubric was left out: it would make one rubric's scale answer to two files, and two rubrics with the same scale cost the adopter one repeated block.
- `check` holds the rubrics of every partition: with the plan read it builds the both view and runs the judge and calibration rules over it; with the plan unread (a development run does not open it, or it fails its own checks) the same rules run `partial`: no "judge is unused" refusal and no "unknown criterion" refusal, because the held-out partition may own them. Findings for the plan itself stay with `checkPartitionPlan`.
- A partition run's calibration is `partial` only under a `partitionPlan` and only for `development` and `held-out`; the both run and every folder with no plan keep the strict rule (an item of no criterion is refused, exit 10 from `check`).
- A development run cannot tell an item of a held-out criterion from an item with a typo, because it never opens the plan. A typo also leaves a real criterion without an item at an anchored level, which `check` and the run's coverage rule name, and `check` and every held-out or both run read the plan and name the unknown item.
- `ci`'s `judge-calibration` check runs the baseline's partition and so reads that partition's view; before, a rubric only the plan declared made it report "no rubric declared" and skip calibration.
- Run directory artifacts carry rubric IDs of the view's criteria only: the run's `contract.json`, `eval-contract.json`, `judge-calibration.json` and records. The labelled file is never copied into a run, and its digest, which every partition records as `tea.judgeCalibrationDigest`, hashes bytes only.

## Revert Observations

Each acceptance check was undone once in a scratch copy (`git archive` of the committed branch, `node_modules` linked, one change per mutant, the file restored after each), and the suite named was run to its first failure.
The pure view cases fail in seconds; the run cases fail after the held-out run reached them.

| Mutant                                                                                     | Check that failed                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1: the held-out view keeps every `contract.json` criterion (the partition filter removed) | `test:evaluate-partition-plans`, the pure view case over the held-out criteria (`R-001` held `RC-001` and `RC-002`; `R-002` held `RC-003`). This is the story's own revert check.                                               |
| W1: wrong row, the filter keeps the development criterion and drops the shared one         | The same case: the held-out view held `RC-001` and lost `RC-002`, `R-001` read `['RC-001']` against `['RC-002']`.                                                                                                               |
| M2: a rubric left with no criterion stays in the held-out view                             | The same case: `R-002` with no criteria appeared.                                                                                                                                                                               |
| M3: a rubric that never had a criterion is dropped                                         | The same case: `R-003` vanished from the held-out view.                                                                                                                                                                         |
| M4: the plan rubrics never join a view                                                     | The same case: `R-101` absent from the held-out and both views.                                                                                                                                                                 |
| M5: the development view derives from the plan                                             | `the development view is the folder bytes, not a copy of them`, before any rubric case.                                                                                                                                         |
| M5b: the development view appends the plan's rubrics (the held-out criterion reaches it)   | `the development view is the folder bytes, not a copy of them` (5,250 bytes against 9,038).                                                                                                                                     |
| M6: `check` accepts a `contract.json` criterion reading a step the development view lacks  | `a contract criterion reading a step the contract does not declare` exited 0.                                                                                                                                                   |
| M7: `check` accepts a plan criterion reading a step the held-out view lacks                | `a held-out criterion reading a development-only step` exited 0; this is the unreachable-criterion revert check.                                                                                                                |
| M8, M9: plan rubric ID collision and repeat accepted                                       | `a held-out rubric ID that a contract rubric has`, `a held-out rubric declared twice`.                                                                                                                                          |
| M10, M11: `partial` calibration reverted in `calibrationProblems`                          | `test:evaluate-calibration`: the view with no rubric and the item of another partition's criterion were refused.                                                                                                                |
| M12: the run calibrates strictly under a plan                                              | The development run exited 12: `judge calibration became invalid before trial: items[4] names unknown rubric criterion R-101/RC-101`. This is the item of the other partition's criterion judged here.                          |
| M13, M14, M15: `check` reads `contract.json` alone, or is never `partial`                  | The held-out-only rubric case (`evaluation.json: [judge] declares judge: contract.json declares no rubric`), the unknown `R-101/RC-101` item in the pristine check, and `no rubric, so judge calibration has nothing to score`. |
| M16: a plan rubric's schema error located in the view                                      | `a held-out criterion whose evidence the engine schema refuses`.                                                                                                                                                                |
| M17: `ci` calibrates `contract.json` whatever the baseline's partition                     | `ci did not calibrate the held-out criterion over its two labelled items`.                                                                                                                                                      |
| M18: the plan schema does not declare `rubrics`                                            | `corpus/held-out/plan.json: [partition-plan] (root) must NOT have additional properties` in the pristine check.                                                                                                                 |

No mutant survived. One strictness is defence in depth and has no mutant: the both run's `calibrationProblems` is strict, but `check`, which runs first and reads both files, already refuses an item of no criterion with exit 10, so relaxing the run's strictness for the both view changes nothing observable.

## Spec Change Log

## Completion Notes

Gates run on the final tree: `test:evaluate-partition-plans`, `-calibration`, `-partitions`, `-check`, `-run`, `-guidance`, `-preflight`, `-ci` (replays committed fixtures, no byte change), `test:eval-replay`, `-boundaries`, `-authoring`, `-compare`, `-gap-loop`, `-dogfood`, `-arms`, `-evaluators`, `-records`, `-agents`, `-held-attempts`, `-private`, `-interpret`, `-aggregate`, `-held-inputs`, `-confinement`, `test:schemas`, `validate:schemas`, `test:shards`, `test:ci-coverage`, `eslint . --max-warnings 0`, `format:check`, `lint:md`, `docs:validate-links`.
`npm test` was not run; CI carries it.
CI shard impact: `test:evaluate-partition-plans` grew from about 70 s to about 95 s (three rubric runs and a `ci` scheduled check), and its weight in `tools/test-shard-weights.json` moved from 70 to 95. No npm script was added.
The skill reference `references/corpus.md` went through the `/bmad-workflow-builder` Edit flow headless (memlog entry, one reference edited, `quick_validate` ok, `scan-scripts` 0 findings, `scan-path-standards` findings identical to `main` and none in `corpus.md`); the full Analyze lenses were not run for a one-section addition. `SKILL.md` is untouched, so no live capture record changes.

## Design Notes

Alternatives turned down: a `partition` field on a criterion (1.51's rule against a `partition` field on a step applies the same way, and the evidence step already decides); a second labelled file under `corpus/held-out/` (it would make the calibration gate and its digest differ per partition and give the development run a file it must not open, for items that hold only an example response); merging plan criteria into source rubrics (above).

## Verification

**Commands:**

- `npm run test:evaluate-partition-plans && npm run test:evaluate-calibration && npm run test:evaluate-partitions && npm run test:evaluate-check && npm run test:evaluate-run && npm run test:evaluate-guidance` -- expected: pass
- `npm run test:evaluate-ci && npm run test:eval-replay` -- expected: pass, no replay byte changes
- `npx eslint . --max-warnings 0 && npm run format:check && npm run lint:md && npm run docs:validate-links` -- expected: pass
