---
title: 'Teach choosing and building the evaluation layer'
type: 'feature'
created: '2026-09-27'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 2
baseline_commit: '8c260be057b089d14fd9f696e8c504fd35f1ee6f'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="owner-approved epic intent">

## Intent

**Problem:** Evaluate has evaluator kinds and a framework-neutral import contract, but Stage 7 still has a placeholder. Adopters need guidance that chooses and builds a suitable evaluation layer, including a framework the guide has never seen.

**Approach:** Fill the evaluator guide and five adopter templates. Prove the framework templates against the existing AgentEvals and promptfoo fixtures through the real Evaluate pipeline.

## Boundaries & Constraints

**Always:** Cover the duties and six selection options in Story 1.23, with every named rubric criterion, the four runtime evaluator kinds, primary-source learning, known-pass and known-fail execution, source and version notes, and the vendor rule. Framework-specific code stays in the adopter's `evaluator/` folder. Each acceptance criterion needs a revert-sensitive gate.

**Never:** Add framework-specific imports to `cli/`, duplicate eval-quality judgments, evaluate a vendor dependency itself, or assert that an illustrative framework list is exhaustive.

## I/O & Edge-Case Matrix

| Scenario             | Input / State                                          | Expected Output / Behavior                                                                                                                  | Error Handling                                              |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Known framework      | AgentEvals or promptfoo template in its copied fixture | Clean control passes and seeded defect is caught                                                                                            | Invalid mapping, output or template fails the guidance gate |
| Unfamiliar framework | Adopter has an installed version absent from the guide | Primary-source facts, executed pass and fail, and contradictions are recorded in `evaluator/LEARNED.md`; results map through `mapping.json` | Unverified API claims remain unadopted                      |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md`: replace Stage 7 placeholder with craft, rubric, examples and learning procedure.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/evaluators/`: add the five named starter files. Generalize the two framework executables from fixture sources without importing either framework into TeA runtime code.
- `test/fixtures/evaluate-tool-use-agent/evals/tool-use/evaluator/trajectory.mjs` and `test/fixtures/evaluate-promptfoo/evals/summary/evaluator/promptfoo.mjs`: behavioral source examples; retain adjacent reference and assertion assets in fixture copies.
- `test/test-evaluate-guidance.js`: validate exact guidance structure, selection rubric, runtime kind schema, learning template and real template executions.
- `test/test-evaluate-tool-use.js` and `test/test-evaluate-promptfoo.js`: reuse their real check, preflight, run, score and vote assertions.
- `CHANGELOG.md` and `evaluate/sprint-status.yaml`: record the user-facing change and story state.

## Tasks & Acceptance

**Execution:**

- [x] `references/evaluator.md`: teach layer duties, selection, open framework landscape, primary-source learning and vendor conditions.
- [x] `assets/evaluators/`: provide the command, AgentEvals, promptfoo, mapping and learning templates.
- [x] `test/test-evaluate-guidance.js`: validate every required heading, rubric row and criterion, learning step, template section and vendor rule; run rendered framework templates through both fixture evaluations.
- [x] `CHANGELOG.md`, sprint status and this record: document the shipped behavior and verification.

**Acceptance Criteria:**

- Given the evaluator guide, when Stage 7 chooses a layer, then all six options map to valid runtime kinds and the rubric names every Story 1.23 criterion.
- Given an unfamiliar framework, when the adopter follows the guide, then primary-source evidence, installed-version pass and fail output, contradictions and mapping are recorded.
- Given either framework template, when rendered into a copied fixture and run, then eval-quality resolves its clean control as `passed-clean-control` and seeded defect as `caught`.
- Given any required guide section, rubric row, template section or framework behavior is removed, when the guidance gate runs, then it fails.

## Implementation Notes

- Stage 7 now opens in `SKILL.md`. The guide covers four layer duties, six selection options, all ten criteria, framework examples, primary-source learning, and the vendor rule. The five starter files live under `assets/evaluators/`. The AgentEvals template accepts a reference path and stdout prefix; the promptfoo template derives row keys from `mapping.json` and accepts a stdout prefix.
- The guidance gate copies each framework template into its existing fixture and runs `check`, `preflight`, `run`, and `score`. Both clean controls resolved as `passed-clean-control` and both seeded defects resolved as `caught`, with three votes each.
- A narrow dependency-direction layer admits only the evaluator templates' Node builtins and AgentEvals import. `cli/` remains framework-neutral. ESLint treats these templates as adopter executables.
- Headless `/bmad-workflow-builder` Edit produced no files or diagnostic output and ended with `Execution error` after a bounded wait. Headless Analyze produced no output and exited 142 at its 45-second bound. Builder quick validation, workflow-integrity prepass, and script scan passed. Its path scan cited nine pre-existing highs in ignored builder artifacts, `SKILL.md`, and `references/adapters.md`; none cited the new evaluator guide or assets.
- Revert checks: removing the run-system heading, the external-framework rubric row, learning step 4, or the known-fail section of `LEARNED.md` each failed `test:evaluate-guidance` with the expected diagnostic. Forcing the AgentEvals template to pass every row made its rendered fixture's `score` exit 2 and failed the guidance gate. Every source file was restored after its check.
- During the full gate, `test:evaluate-mutation` printed success but held its process open for its interrupted-run timeout. The test now clears that deadline when the child closes, preserving the timeout failure case. A focused wrapper observed exit 11 ms after the success line and failed if that gap exceeded 5 seconds.
- Review fixes require stable promptfoo assertion metrics and complete normal-run mapping coverage. The guidance gate now exercises both templates' optional selection arguments, reordered results, ambiguity rejection, empty-output evidence, and output-to-observation binding. The guide adds runnable sealed-agent and records configuration details and records framework versions in the digested evaluator tree.

## Spec Change Log

## Review Triage Log

### Round 1

Three independent reviewers examined the committed story diff. Their findings were grouped by root cause.

| Finding                                                                                                         | Verdict             | Resolution                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Promptfoo assertion identity depends on array position; reordered assertions or `--single` misattribute oracles | Valid               | Require each assertion's stable `metric` to match a mapping key, remove fixture-only `--single`, and test reordering and subsets.                                                                                                                                    |
| Promptfoo accepts fewer assertions than mapped keys in normal execution                                         | Valid               | Require exactly one judgment for each mapped key and test missing coverage.                                                                                                                                                                                          |
| Framework template args and observation selection are absent from the guidance gate                             | Valid               | Exercise AgentEvals `--reference` and `--prefix`, plus promptfoo `--stdout-prefix` with multiple observations.                                                                                                                                                       |
| Framework version can change without moving the evaluator configuration digest                                  | Valid               | Require the installed version in tracked `evaluator/LEARNED.md`, which the runtime digests.                                                                                                                                                                          |
| Command skeleton assumes stdout and can emit a failure without a quote                                          | Valid               | Let the oracle select its observation and channel, and require an observation ID, comment, failure quote and channel.                                                                                                                                                |
| Sealed-brief agent and records options lack required configuration details                                      | Valid               | Add concrete `evaluation.json` examples, model conditions, record layout and CLI reference.                                                                                                                                                                          |
| AgentEvals quote fallback cites only the trajectory prefix                                                      | Valid               | Fall back to the complete verbatim observed trajectory when compact JSON is absent.                                                                                                                                                                                  |
| Four duty headings survive deletion of their content                                                            | Valid               | Require substantive markers within each duty section in the guidance gate.                                                                                                                                                                                           |
| Rubric cells could contain false advice while remaining nonempty                                                | Valid example found | The records row implied support for rubric scoring, while `check` currently refuses that pairing. The row now states the runtime restriction. A static structure gate cannot establish the truth of arbitrary prose, so reviewer inspection still covers the advice. |

### Round 2

| Finding                                                                                           | Verdict  | Resolution                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A failed promptfoo assertion over empty stdout emits an empty required quote                      | Valid    | Cite the same observation's exit code when stdout is empty; fail explicitly if neither channel is available. The guidance gate checks that row.                                                                                   |
| Both framework starters silently select the first observation when a prefix matches more than one | Valid    | Require exactly one matching observation and test both ambiguity paths.                                                                                                                                                           |
| The guide says clean and defect arms use the same committed target                                | Valid    | State that both arms derive from the same committed baseline and only the intended adopter mutation changes.                                                                                                                      |
| The promptfoo template's output-to-observation guard lacks a revert-sensitive gate                | Valid    | Add a copied-template result with different output and require rejection.                                                                                                                                                         |
| The mutation-test timer fix lacks a committed duration regression test                            | No patch | This was an incidental test-harness cleanup, outside Story 1.23 acceptance. A focused timing wrapper verified exit after child close. A wall-clock assertion in the repository test would be flaky and mirror the implementation. |

### Full-gate correction

The first full `npm test` after review fixes reached `test:boundary` and failed because the guide linked to a relative `docs/` path absent from the published package. Both links now point to the repository's public documentation, and `npm run test:boundary` passes. The final commit hook reruns the complete gate on the corrected tree.

## Verification

**Commands:**

- `npm run test:evaluate-guidance`: structural and real template checks pass.
- `npm test`: final full quality gate completed with exit code 0 after the timer repair and restored revert checks.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"`: published engine export remains available.
