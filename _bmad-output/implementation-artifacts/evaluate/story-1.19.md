---
title: 'Story 1.19: Evaluate a tool-use calling agent through its own command, judged by AgentEvals'
type: 'feature'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f04e2cd2a446e64bb246b61b7458318780f16567'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story and Story 1.19)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.19)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-4, AD-19, AD-21)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md (AgentEvals)'
  - '{project-root}/AGENTS.md'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="owner delegated each relay story and does not review individual specs">

## Intent

**Problem:** The command evaluator import contract is built, but no real external framework has judged an adopter's tool calling agent through that agent's own command.

**Approach:** Add a deterministic calling agent fixture whose rules file selects one tool and its arguments. Run its OpenAI-style stdout trajectory through AgentEvals strict matching in an adopter-owned command evaluator, then import judgment rows through the existing mapping contract.

## Boundaries & Constraints

**Always:** Use the agent's own non-interactive command as the authorized `cli` target. Keep AgentEvals imports under the fixture's `evaluator/`. The contract oracle and a failing evaluator row cite the same stdout observation. Use a copy workspace and a rules-file mutation. Keep package specs at `latest`.

**Never:** Add framework code under `cli/`; call a model; compute a verdict outside eval-quality's scoring path; use TeA's skill runner as this fixture's target.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                            | Expected Output / Behavior                                              | Error Handling                |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| Clean rule           | Request chooses the reference tool and arguments         | Strict match passes; clean control scores `passed-clean-control`        | N/A                           |
| Mutated rule         | Rule chooses the wrong tool                              | Strict match fails with a stdout citation; seeded probe scores `caught` | N/A                           |
| Degenerate evaluator | Evaluator always prints `pass`                           | Mutated probe scores an outcome other than `caught`                     | Evidence exposes the weakness |
| Anchored score       | Numeric AgentEvals score belongs to mapped rubric levels | One `judgeResults` entry holds the score                                | N/A                           |
| Off-scale score      | Numeric score is absent from mapped levels               | Exit 12 before a run record is written                                  | No record                     |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/command-evaluator.js` and `judgment-rows.js` already run adopter executables, parse rows, map rubric scores and reject off-scale values. Reuse without editing `cli/`.
- `test/fixtures/evaluate/mutation/evals/verdict/` supplies the contract, probe, mutation and policy shapes. `test/fixtures/evaluate/evaluators/command/evaluator/rows.js` supplies the row contract.
- `test/test-evaluate-evaluators.js` and `test/test-evaluate-workflow.js` supply project-copy, CLI and evidence assertion patterns. `tools/test-shard-weights.json` assigns the new script a shard weight.
- `evaluation-framework-facts.md` holds the AgentEvals claims to recheck against the installed release. Its strict evaluator is called with `{ outputs, referenceOutputs }` and returns a boolean `score` for this fixture.

## Tasks & Acceptance

**Execution:**

- [x] `test/fixtures/evaluate-tool-use-agent/` -- add the command, rules, reference trajectory, command evaluator, mapping and evaluation artifacts.
- [x] `test/test-evaluate-tool-use.js` -- cover direct strict pass/fail, preflight authorization, full clean and mutated evidence, a degenerate evaluator, numeric score mapping and off-scale refusal.
- [x] `package.json`, `package-lock.json`, `tools/test-shard-weights.json` -- install `agentevals` and `@langchain/core` at `latest` and chain `test:evaluate-tool-use` into `npm test`.
- [x] `_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md`, `CHANGELOG.md` -- reconcile facts against the installed package and record the adopter-facing change.
- [x] `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml`, this record -- mark the story complete with installed version, verification and exercised revert checks.

**Acceptance Criteria:**

- Given the clean and mutated fixture, when `check`, `preflight`, `run` and `score` execute, then the clean control is `passed-clean-control`, the wrong-tool mutation is `caught`, and its finding quotes the cited stdout observation.
- Given the same mutated fixture, when the evaluator always passes, then its scored outcome is other than `caught`.
- Given a numeric AgentEvals result, when its key maps to anchored rubric levels, then the row becomes one `judgeResults` entry; a value outside the levels exits 12 with no record.
- Given a preflighted fixture, when its authorization is read, then the executable is the agent's own command.
- Given the dependency and test changes, when `npm test` runs, then the framework stays outside `cli/`, the supply-chain gates pass, and the new suite runs in the chain.

## Implementation Notes

Owner approval is already supplied by the Evaluate relay protocol. The owner delegated individual stories through merge and does not review their specs.

The installed AgentEvals version is `0.0.7`. Its strict trajectory matcher returned a boolean score on both the matching and wrong-tool cases. Its TypeScript source and published package confirmed the remaining framework facts. The facts file now states that strict matching compares multiple calls within a message without order, that `fewShotExamples` is the TypeScript option, that graph trajectory values are wrapped in evaluator calls, and that `comment` is optional. The fixture uses one call per message to make first-tool selection explicit. The numeric case exercises a result shaped as `{ key, score, comment }` with an anchored numeric value; the strict matcher itself returns a boolean.

The fixture's clean control passed and the wrong-tool mutation was caught through the same stdout observation cited by the finding. The always-pass evaluator left the mutation uncaught. The registry and preflight observation both named `calling-agent` as the executable. The off-scale score exited 12 before a trial set was written. The framework import is confined to the fixture evaluator; no `cli/` file changed.

Revert checks were exercised against the focused suite, with each edit restored afterwards: hardcoding the clean tool made preflight fail; replacing the strict result with `true` made the mutated outcome fail; changing the off-scale score to an anchored level made the exit-12 assertion fail; routing through the skill runner made the authorization assertion fail; pinning `agentevals` made the `latest` assertion fail.

## Spec Change Log

## Review Triage Log

| Finding                                                 | Verdict and route | Evidence                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blind 1, fixed tool across requests                     | false, reject     | The story specifies a rules-driven deterministic stub. The request is still captured in the trajectory; request-dependent tool policy is outside this fixture's required behavior.                                                                                             |
| Blind 2, sensitivity witness only checks echo           | low, patch        | The witness proves a changed stdout response but its `agent-follows-request` name promises more. Rename it to describe the relation it actually checks.                                                                                                                        |
| Blind 3, oracle uses substrings                         | false, reject     | This fixture emits exactly one tool call. Its first call is therefore the only call the oracle can find.                                                                                                                                                                       |
| Blind 4, strict matching ignores order within a message | false, reject     | The reference and fixture each contain one call. The installed matcher behavior is recorded in the facts file for future fixture changes.                                                                                                                                      |
| Blind 5, evaluator chooses an unrelated observation     | low, patch        | The run has one interaction step, yet the broad substring selector accepts any matching stdout in a direct call. Select the fixture's prefixed trajectory.                                                                                                                     |
| Blind 6, wrong arguments cite the correct tool name     | medium, patch     | AgentEvals fails the strict comparison, but the current quote and comment omit the mismatched arguments. Quote the observed arguments for that case.                                                                                                                           |
| Blind 7, missing call creates an unwitnessed quote      | medium, patch     | With no tool call, `name` is undefined and the quoted string is absent from stdout. Use an existing stdout fragment.                                                                                                                                                           |
| Blind 8, missing argument mismatch test                 | medium, patch     | Replacing exact argument matching with ignore leaves the current clean and wrong-tool tests green. Add a wrong-city direct case.                                                                                                                                               |
| Blind 9, numeric AgentEvals score is synthetic          | false, reject     | The acceptance criterion calls for a unit case over the numeric `EvaluatorResult` shape. AgentEvals' strict matcher returns a boolean, so the unit's numeric value exercises the supported result type and import mapping without a model. The record states that distinction. |
| Blind 10, empty trial lists pass `every`                | medium, patch     | `every` returns true for an empty list and the finding loop can run zero times. Assert the expected trial and record counts.                                                                                                                                                   |
| Blind 11, absent index does not prove absent records    | medium, patch     | The run implementation writes records before its index. Inspect the trial-set directory for record files after exit 12.                                                                                                                                                        |
| Verification gap, exact arguments lack a negative case  | medium, patch     | The reviewer demonstrated that exact matching rejects Dallas while ignore accepts it. This is the same missing case as Blind 8.                                                                                                                                                |
| Verification other finding, missing call quote          | medium, patch     | A direct invocation confirmed the unwitnessed quote. This is the same defect as Blind 7.                                                                                                                                                                                       |
| Edge 1, absent call or escaped name breaks citation     | medium, patch     | The absent-call path lacks a quoted substring; interpolating a name without JSON escaping can also miss stdout. Quote serialized observed bytes.                                                                                                                               |
| Edge 2, empty evidence lists pass                       | medium, patch     | The reviewer identified the same vacuous assertions as Blind 10.                                                                                                                                                                                                               |
| Edge 3, numeric mapping claim                           | false, reject     | The numeric unit tests the declared `EvaluatorResult` shape and anchored mapping. The strict matcher itself supplies a boolean; the record says so.                                                                                                                            |

Final review round 1 used three independent Codex lenses. Architecture and story compliance passed. The adversarial lens found that the changelog overstated the licence gate. The gate uses a documented MIT exception; the suite now checks the installed package's `LICENSE` text and the changelog names that check accurately. The test-quality lens found a vacuous `every` assertion in the always-pass evaluator case; that case now requires three votes. No findings were deferred. CodeRabbit reported no inline findings. Its generic docstring coverage warning was answered on the PR because these focused test helpers have clear names and the repository has no function-docstring requirement.

Final review round 2 passed architecture and test quality. Its adversarial lens found two real gaps. A strict failure from an additional trajectory message was described as different tool arguments and cited matching arguments; the evaluator now cites the additional message and a direct test holds that behavior. The licence assertion omitted the copyright notice and preservation clause named in the gate evidence; the assertion now checks both. Neither finding was deferred.

Final review round 3 passed architecture and test quality. Its bounded adversarial lens found that missing assistant messages, absent `tool_calls`, and extra calls within one assistant message could still cite only the trajectory prefix. The evaluator now quotes the observable message or extra call for each shape, and direct negative cases hold those citations. No finding was deferred.

Final review round 4 passed the regression lens. The evidence lens found that a prepended extra message could be misidentified as the unchanged assistant message. The evaluator now locates the extra message by removing each observed message and comparing the remainder to the reference. Direct prepend, middle, and append cases hold the quote. The finding was fixed in this story.

## Verification

**Commands:**

- `npm run test:evaluate-tool-use`: 99 checks passed after round 4 fixes.
- `npm test`: passed on the round 1 review-fix tree, including all 90 chained checks. Two earlier full runs also passed before those fixes. Final-tree run pending.
- `npm run test:release-metadata`: passed.
- `npm run test:licences`, `npm run test:lockfile-age`, `npm run test:supply-chain`, `npm run test:evaluate-boundaries`: passed.
- `npm run format:check`, `npm run lint`, `npm run lint:md`, `npm run docs:validate-links`, `npm run docs:build`: passed.
