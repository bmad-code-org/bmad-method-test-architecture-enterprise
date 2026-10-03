---
title: 'Story 1.55: Recognize process and answer separation for scalar CLI output'
type: 'bugfix'
created: '2026-10-02'
status: 'in-review'
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

- [x] `bmad-eval-quality/src/core/coverage/satisfaction.ts` and coverage tests: recognize exact scalar process and answer checks, retaining negative and structured behavior.
- [x] `bmad-eval-quality/CHANGELOG.md` and generated coverage artifacts: validate, merge and publish the engine change, then verify npm version and tag.
- [x] `package-lock.json`, pantry fixture and `test/test-evaluate-learned-framework.js`: install published engine and prove three-trial clean and mutated replays with PASS evidence.
- [ ] TeA `CHANGELOG.md`, sprint row and story record: document the change and run all gates.

**Acceptance Criteria:**

- Given a scalar stdout CLI operation with no success field, when one oracle names both pointers and checks exit code 0 plus exact whole stdout at one step, then the published engine satisfies `success-indicator-separation`; reverting recognition fails the positive fixture.
- Given exit-only, stdout-only, substring, direction-only, split-step or split-oracle checks, when scored, then each retains an unsatisfied rule; weakening a required observation fails its negative fixture.
- Given a structured response with a declared success field, when success and payload are checked separately, then the rule is satisfied; a success-only check remains unsatisfied.
- Given the pantry fixture on the published engine, when clean and mutated partitions replay, then each evidence artifact reports `contractVerdict: PASS`, no critical gap, and three expected trial votes; restoring the old engine or null collection list fails the focused gate.
- Given the TeA dependency update, when the engine export check, `test:evaluate-learned-framework`, `test:atdd-workflow-guidance` after contract regeneration, `test:release-metadata` and `npm test` run, then all pass.

## Implementation Notes

- Engine PR [#179](https://github.com/bmad-code-org/bmad-eval-quality/pull/179) merged at `f8d6816031167835a2f26cfdafca540b1a9baefb` after all watched checks and native Codex reviews passed. Its scalar CLI branch requires an affirmative oracle naming the same step's exit code and whole stdout in both direction and conjunctive equality checks. Root `channelRoles: {"": "payload"}` is supported; a diagnostic role is rejected. Structured response checks keep their previous rule. No generated coverage corpus or table changed.
- The engine PR also repaired its website audit gate after GHSA-ch52-4w7c-c8xp blocked CI. `http-cache-semantics@4.2.0` remains the latest npm release and no patched version exists as of 2026-10-03. The narrow, expiring exception applies only to Astro's locked static GitHub Pages build graph and keeps other high severity findings and incomplete or failed audits red. The documentation build reported `output: "static"` and 17 generated pages. The exception expires 2026-10-17.
- Engine Publish run `37092731848` completed successfully. npm `latest` is `eval-quality@6.0.1`; `v6.0.1` dereferences to release commit `906d950cbe8166c64ab8e8090a564f5428347280` on engine `main`.
- TeA keeps the `latest` devDependency, raises the optional peer floor to `>=6.0.1`, and resolves `6.0.1` in `package-lock.json`. The pantry contract and probes were already correct, so no contract or probe regeneration was needed. The test asserts `PASS` and an empty gap list on development P-001, P-004 and P-002 and held-out P-003, while retaining three expected votes per probe.
- Red-phase check on eval-quality 6.0.0: `test:evaluate-learned-framework` failed exactly four new assertions, one for each artifact with a critical `success-indicator-separation` gap. On published 6.0.1 it passed 121 checks after the held-out evidence vote assertion. `test:atdd-workflow-guidance`, `test:release-metadata`, `test:guard-publish`, `format:check`, `lint:md`, `lint`, `docs:validate-links` and `docs:build` passed after rebasing onto TeA `c17cfafa`. A full local `npm test` was stopped at the relay owner's direction to avoid concurrent load with lane 2; it will be rerun after lane 2 exits.

## Spec Change Log

## Review Triage Log

| Finding                                                              | Decision                | Evidence                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story record claimed the full TeA gate had passed before it finished | Fixed                   | Verification now records the stopped lane 3 run and pending rerun after lane 2 exits.                                                                                             |
| Release guard and release-metadata test still accepted engine 6.0.0  | Fixed                   | Raised both floors to 6.0.1; focused guard and release-metadata suites pass.                                                                                                      |
| Architecture and CLI reference named the old engine floor            | Fixed                   | Updated the stack record and CLI prerequisite to 6.0.1; formatting and link checks pass.                                                                                          |
| Engine separation rule counts an oracle that no behavior references  | Deferred to Story 1.104 | The same contract-wide scan affects scalar and structured responses. Story 1.104 specifies negative fixtures, revert checks, the engine release and TeA adoption.                 |
| H.1 hand-off text still started after Story 2.5                      | Fixed                   | The dependency row, H.1 instructions and sprint owner hand-off now wait for all lanes, including Story 1.104.                                                                     |
| FR10 and CAP-10 maps omitted the new coverage story                  | Fixed                   | Both maps now name Story 1.104 and its orphan-oracle negative fixtures.                                                                                                           |
| Missing-engine CLI guidance still recommended 6.0.0                  | Fixed                   | Reproduced exit 12 with the engine hidden; the message now recommends the declared 6.0.1 peer floor, covered by the existing dynamic peer-range assertion in test:evaluate-check. |
| Held-out evidence votes were checked only through gap-view           | Fixed                   | P-003 evidence now directly asserts three caught votes, matching the development evidence checks.                                                                                 |

## Verification

**Commands:**

- `npm run validate` in eval-quality: all engine checks pass.
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` in TeA: published export exists.
- `npm run test:evaluate-learned-framework` (121 checks), `npm run test:atdd-workflow-guidance`, `npm run test:release-metadata`, `npm run test:guard-publish`, `npm run docs:validate-links`, `npm run docs:build`, `npm run format:check`, `npm run lint:md` and `npm run lint` in TeA: passed after the rebase.
- Missing-engine CLI check with the engine hidden: exit 12 now recommends `eval-quality@">=6.0.1"`.
- `npm test` in TeA: pending until lane 2's full test exits, per the relay owner's process ownership instruction.
