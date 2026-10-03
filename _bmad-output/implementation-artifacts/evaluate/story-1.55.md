---
title: 'Story 1.55: Recognize process and answer separation for scalar CLI output'
type: 'bugfix'
created: '2026-10-02'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7338b5c04fb312d7e976672c05750974ad322b1a'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules and Story 1.55)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.55)'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-1, AD-6, AD-20, AD-23)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.50.md'
---

<frozen-after-approval reason="The owner gave GO for the Evaluate relay and Story 1.55">

## Intent

**Problem:** A plain-text CLI oracle checks process success and the exact answer, yet eval-quality marks `success-indicator-separation` unsatisfied because the response has no structured success field.

**Approach:** Teach the published engine to recognize the paired exit-code and whole-stdout checks for one command interaction. Rescore the pantry fixture with that release and require clean and defect trials to retain their outcomes with a PASS contract.

## Boundaries & Constraints

**Always:** Require one oracle to name both pointers in its direction and check exit code 0 plus exact whole stdout at the same step. Preserve the existing structured-response rule. Use a published engine before TeA updates its resolved dependency; regenerate derived evidence through its owning tools.

**Never:** Add a fictitious success field, waiver, TeA-side coverage rule, live Claude run, or hand-edited generated evidence. Leave Story 1.42 in `review` until Story 1.103.

## I/O & Edge-Case Matrix

| Scenario            | Input / State                                                                          | Expected Output / Behavior              | Error Handling         |
| ------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------- |
| Scalar pass         | One CLI step; exit 0 and full stdout equality in one oracle's direction and check      | Separation satisfied                    | No waiver              |
| Partial or loose    | Exit only, stdout only, substring, omitted direction pointer, different step or oracle | Separation unsatisfied                  | Critical gap retained  |
| Structured response | Declared success and payload fields                                                    | Both checks satisfy; success-only fails | Existing rule retained |

</frozen-after-approval>

## Code Map

- `bmad-eval-quality/src/core/coverage/satisfaction.ts`: `successIndicatorSeparationSatisfaction` rejects null indicators; add a narrow command scalar path while retaining the structured branch. Existing `OracleView` flattens check nodes, so inspect the check expression to prove equality and conjunction.
- `bmad-eval-quality/src/core/coverage/relevance.ts` and `operations.ts`: keep relevance for missing indicators; resolved operation gives interface kind and stdout descriptor root.
- `bmad-eval-quality/tests/coverage/satisfaction.test.ts` and `command-coverage.test.ts`: paired positive and negative engine fixtures, including same step, both channels, exact equality, and structured regression.
- `bmad-eval-quality/CHANGELOG.md`, generated coverage corpus/table as needed: record behavior and run owning generators, never edit generated outputs by hand.
- `test/fixtures/evaluate-learn/evaluation/contract.json`: O-001 already names exit code and exact whole stdout; scalar response already has `collectionLocations: []` and must keep it.
- `test/test-evaluate-learned-framework.js`: replace expected CONCERNS with PASS/no critical gap for every development and held-out evidence artifact, retaining three clean and defect votes.
- `test/fixtures/evaluate-learn/evaluation/evaluator/LEARNED.md` and `test/fixtures/evaluate-learn/gap-report.md`: preserve historical concern and add the post-release resolution if documentation needs to describe current status.
- `package.json`, `package-lock.json`, `CHANGELOG.md`, `sprint-status.yaml`: consume the published release, record the change and finish the story.

## Tasks & Acceptance

**Execution:**

- [ ] `bmad-eval-quality/src/core/coverage/satisfaction.ts` and coverage tests: recognize exact scalar process and answer checks, retaining negative and structured behavior.
- [ ] `bmad-eval-quality/CHANGELOG.md` and generated coverage artifacts: validate, merge and publish the engine change, then verify npm version and tag.
- [ ] `package-lock.json`, pantry fixture and `test/test-evaluate-learned-framework.js`: install published engine and prove three-trial clean and mutated replays with PASS evidence.
- [ ] TeA `CHANGELOG.md`, sprint row and story record: document the change and run all gates.

**Acceptance Criteria:**

- Given a scalar stdout CLI operation with no success field, when one oracle names both pointers and checks exit code 0 plus exact whole stdout at one step, then the published engine satisfies `success-indicator-separation`; reverting recognition fails the positive fixture.
- Given exit-only, stdout-only, substring, direction-only, split-step or split-oracle checks, when scored, then each retains an unsatisfied rule; weakening a required observation fails its negative fixture.
- Given a structured response with a declared success field, when success and payload are checked separately, then the rule is satisfied; a success-only check remains unsatisfied.
- Given the pantry fixture on the published engine, when clean and mutated partitions replay, then each evidence artifact reports `contractVerdict: PASS`, no critical gap, and three expected trial votes; restoring the old engine or null collection list fails the focused gate.
- Given the TeA dependency update, when the engine export check, `test:evaluate-learned-framework`, `test:atdd-workflow-guidance` after contract regeneration, `test:release-metadata` and `npm test` run, then all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**

- `npm run validate` in eval-quality: all engine checks pass.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` in TeA: published export exists.
- `npm run test:evaluate-learned-framework`, `npm run test:atdd-workflow-guidance`, `npm run test:release-metadata`, `npm test` in TeA: focused and full gates pass.
