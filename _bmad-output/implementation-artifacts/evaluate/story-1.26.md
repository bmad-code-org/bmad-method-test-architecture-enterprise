---
title: 'Learn an unfamiliar evaluation framework on the go'
type: 'feature'
created: '2026-09-29'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ba13542c88f485655812ad415d948873310278a3'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<!-- prettier-ignore-start -->

<frozen-after-approval reason="owner-delegated Evaluate story intent">

## Intent

**Problem:** Evaluate has not proved that an adopter can use an evaluation framework absent from its guides. Its framework-neutral import contract needs a live, repeatable proof.

**Approach:** Choose an npm evaluation library with a deterministic scorer, learn its installed API from primary sources, run known pass and fail examples, then author and score a copied fixture through Evaluate without changing the shared runtime.

## Boundaries & Constraints

**Always:** Use an isolated maintainer session instructed to use the chosen framework. Record its source reads, installed version, known pass and fail execution before mapping, contradictions, and full pipeline evidence. Keep framework code in the adopter fixture's `evaluator/`; bind each judgment to a real observation. Make the proof deterministic and revert-sensitive. Keep the framework devDependency at `latest`.

**Never:** Add the framework name to the Evaluate skill or framework imports to `cli/`. Call a model, score a vendor dependency, duplicate eval-quality verdict logic, or invent evidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Known pass and fail | Installed framework scorer receives matching and differing values | Captured results distinguish both before mapping exists | API or result-shape mismatch stops authoring and is recorded |
| Clean and mutated target | One copied target and one controlled mutation | eval-quality resolves `passed-clean-control` and `caught` | Missing binding, unsupported evidence, or scorer error fails the gate |
| Framework drift | Missing package, changed result shape, or framework name added to skill | Focused test fails | No silent fallback to a hand-written scorer |

</frozen-after-approval>

<!-- prettier-ignore-end -->

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md` and `assets/evaluators/LEARNED.md`: existing six-step primary-source learning procedure and record shape; do not edit the skill to name the new library.
- `test/fixtures/evaluate-learn/target/` and a temporary copy of the Evaluate skill: the isolated maintainer's only local source inputs. The maintainer authors the evaluation from these inputs and publisher sources.
- `test/test-evaluate-promptfoo.js`: coordinator reference for temporary project, digest, Git, `check`, `preflight`, `run`, `score` and vote assertions. The isolated maintainer does not read this fixture or test. Strip inherited `GIT_*` variables from child processes.
- `cli/lib/evaluate/`: shared framework-neutral runtime. No edits for this story.
- `package.json`, `package-lock.json`, `tools/test-shard-weights.json`: dependency, chained script and shard coverage. Lockfile age cache may need regeneration.
- `_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md`: add only source- and installed-version-verified facts after live execution.

## Tasks & Acceptance

**Execution:**

- [x] `test/fixtures/evaluate-learn/`: choose the library and target, execute and save known pass and fail examples, then run an isolated maintainer session through the learning guide and commit its evaluation, transcript and `evaluator/LEARNED.md`.
- [x] `test/test-evaluate-learned-framework.js`: rerun real clean and mutated arms through eval-quality; assert name absence, source and transcript order, installed API and model-free result, mapping, evidence votes and controlled failure cases.
- [x] `package.json`, `package-lock.json`, and lockfile age cache: install the framework as `latest`, chain the focused gate, and keep release metadata and supply-chain checks green.
- [x] `evaluation-framework-facts.md`, `CHANGELOG.md`, sprint status and this outcome: record verified framework facts and the user-facing proof.

**Acceptance Criteria:**

- Given the selected library is absent from the skill, when the maintainer follows Stage 7, then its record cites primary sources and installed version and shows known pass and fail execution before mapping.
- Given the committed evaluation, when the deterministic test reruns it, then the clean control resolves `passed-clean-control`, the controlled mutation resolves `caught`, and the framework's evaluator runs without a model call.
- Given a mapping or source assertion is broken, a framework call is replaced by a hand-written answer, or its name is added to the skill, when the focused test runs, then the corresponding assertion fails.
- Given the story branch, when `git diff --stat origin/main -- cli/` runs, then it is empty; local and CI quality gates pass.

## Implementation Notes

- Selected `autoevals@0.3.0` and its model-free `ExactMatch` scorer from publisher sources and the installed package. A fresh `gpt-6-sol` high maintainer session activated Evaluate in `/tmp/tea-evaluate-126-live.yWXgFY`, which initially contained only the copied skill, its activation files and the adopter target. Its customization resolver lacked `config_utils`, so the skill's documented TOML fallback completed activation. The maintainer read the publisher README, scorer reference and releases plus the installed declarations, then executed known pass and fail examples before writing any mapping. Its project is committed at `b1b74424da69f5e5fbcb0a3e1ddf71bb03b200ce` with a clean status. The committed transcript lists direct file reads and chronological commands; it shows no inspection of another fixture or checkout source.
- The repository fixture copies that session's authored evaluation, target, inspection record, requirements statement, gap report, transcript and `LEARNED.md`. Packaging changed `evaluation.json.launch.root` from `../../..` to `..` to preserve the same target-root relationship at the required fixture path. A focused replay found two escaped JSON stdout transcriptions in `LEARNED.md`; the coordinator corrected those lines against the executed command. The final diff audit found the requirements text credited Murat with fixture decisions supplied by the coordinator. Both requirements copies now name the coordinator's fixture-adopter role, and the contract's requirements digest and lineage advance to revision 4. The maintainer transcript retains its historical revision-3 digests. Review repairs also changed the copied `autoevals-exact.mjs`: malformed refusals now require empty stdout, empty output returns a failed judgment, and exit-code failures cite the actual code. The maintainer's live votes used its original wrapper; the committed fixture's focused replay reproduced the clean and mutated votes after these repairs and tested the new failure paths. Generated runs, compiled contract, sealed brief and the temporary dependency install remain outside the fixture.
- The adopter's CLI prints the complete pantry summary and rejects malformed requests. The final `copy` workspace has one controlled mutation, M-001, which removes pears from the adopter-owned rule JSON. The Autoevals command wrapper maps two scorer results to O-001/B-001 and O-002/B-002, cites the captured observation IDs, and quotes observed output on failures. Development P-001 and P-004 resolved `passed-clean-control` in all three trials, while P-002 resolved `caught` in all three. Held-out P-003 resolved `caught` in all three, read through its redacted gap view. No shared `cli/` file changed.
- Stage 11 closed the malformed-input coverage flag with a confirmed refusal boundary and closed per-record and omission/completeness flags by truthfully declaring `collectionLocations: []` for scalar stdout. The engine still reports `CONCERNS` for `success-indicator-separation`: O-001 checks exit code 0 and exact whole stdout, while the scalar response has no separate success field. No waiver or `PASS` claim was added. Story 1.55 records the engine coverage follow-up with paired revert checks.
- The new dependency reached four packages whose lockfile entries omit the licence field. Their installed `LICENSE` files and legacy metadata support MIT. The licence wrapper now pins each exception's exact config tuple, lockfile version, registry tarball and installed licence digest, with drift tests. The lockfile age cache was regenerated with 1,916 entries.
- The extra chained test changed the README's source-checked test count from ninety-six to ninety-seven. The owner-delegated frozen matrix is unchanged, with a local Prettier ignore comment around that block only.

## Spec Change Log

- The isolated proof was rebuilt after preliminary reviewers found the first fixture had been copied from an existing evaluation. The Code Map now separates the coordinator's test harness reference from the maintainer's permitted source inputs.

## Review Triage Log

- Two independent preliminary reviewers found the missing isolated EV run, weak `LEARNED.md` example assertions, a wrapper test that could ignore the framework score, missing revert observations, and unpinned licence exceptions. The fixture was reauthored in the isolated maintainer session; the focused test and licence gate were strengthened. Revert observations are recorded below after the final fixture gate.
- The final live proof exposed an engine coverage false negative for scalar CLI output. Story 1.55 was appended to the epic, test design and sprint status to recognize independent exit-code and exact-stdout checks, with paired negative and structured-response regression fixtures. Story 1.26 retains its measured `CONCERNS` verdict until that engine work is published and replayed. The final review also found that B-002 has only a clean control under this story's one-mutation boundary. Story 1.56 carries a separate guard-bypass defect proof.

| Review finding                                        | Verdict | Evidence and route                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blind 1: malformed extra stdout passes                | medium  | A direct wrapper invocation returned `pass` with expected stderr and extra stdout. The evaluator now requires empty stdout; focused adversarial case added.                                                                                                                      |
| Blind 2: silent malformed response throws             | medium  | A direct invocation exited 1 with no judgment. The evaluator now returns a failed row citing the observed exit code; focused case added.                                                                                                                                         |
| Blind 3: silent summary uses unauthorized stderr      | medium  | A direct invocation exited 1 when both streams were empty. The evaluator now cites the contract-authorized exit code; focused case added.                                                                                                                                        |
| Blind 4: wrong exit cites correct stdout              | medium  | A direct invocation returned a failed row quoting matching stdout while exit code was 1. The evaluator now quotes the actual exit code first; focused case added.                                                                                                                |
| Blind 5: fixed answer can drift from brief            | medium  | The wrapper uses a fixed fixture expectation. The focused test now binds both oracle literals and both behavior criteria to its expected values, so contract edits fail the gate.                                                                                                |
| Blind 6: held-out probe repeats development defect    | low     | Both probes intentionally qualify the sole allowed mutation in separate partitions. Story 1.26 claims partition replay and three votes; it makes no distinct-defect claim. A second mutation is excluded by the approved fixture boundary, so this improvement is rejected here. |
| Blind 7: refusal has no defect probe                  | medium  | P-004 is a clean control; the exploratory guard bypass was removed to preserve the one-mutation boundary. Story 1.56 records the separate controlled defect proof and revert checks.                                                                                             |
| Blind 8: fact table accepts unrelated publisher URL   | medium  | The former check accepted any URL on the publisher domain. The focused test now checks exact fact/source associations and immutable source links.                                                                                                                                |
| Blind 9: source links move with `main`                | medium  | The JavaScript 0.3.0 publisher tag resolves to `b0500edbf6c157d526f9bc027798ea269a3ceb7c`; the cited README, scorer reference and exports were verified there and links pinned.                                                                                                  |
| Blind 10: known example uses wrong working directory  | low     | The test spawned the documented command from repository root. It now runs from the recorded `test/evaluations` directory.                                                                                                                                                        |
| Blind 11: ambient model credentials                   | false   | Installed `ExactMatch` locally normalizes and compares values without a client call; the test checks installed version and output. The child environment now also removes credential and token variables.                                                                        |
| Blind 12: isolated commit mismatch                    | medium  | The transcript recorded the root commit before its two closing lines were committed. A coordinator provenance note now identifies the transcript-only second commit and clean final head.                                                                                        |
| Blind 13: final full gate pending                     | medium  | The outcome said the integrated full run was pending while review was active. Completion requires a final green `npm test` and an updated Verification section.                                                                                                                  |
| Edge 1: malformed extra stdout passes                 | medium  | Verified by the same direct reproduction as Blind 1. The empty-stdout guard and focused case close it.                                                                                                                                                                           |
| Edge 2: silent response throws                        | medium  | Verified by the same direct reproduction as Blind 2 and Blind 3. Both empty-channel cases now return failed rows.                                                                                                                                                                |
| Edge 3: source URL can break                          | medium  | The former domain-only guard admitted an irrelevant link. The pinned exact association test closes it.                                                                                                                                                                           |
| Verification gap 1: refusal score can be ignored      | medium  | The former scorer stub varied only B-001. It now sets B-002's score to 0 and checks a failed row with the captured stderr quote.                                                                                                                                                 |
| Final verification: copied wrapper provenance omitted | medium  | The isolated maintainer commit predates three reviewer-driven evaluator repairs. The implementation note now names those edits and distinguishes historical live votes from the committed fixture's replay.                                                                      |
| PR adversarial: duplicate sourced fact passes         | medium  | Replacing the model-free fact row with a duplicate of another approved row left the four-row gate green. The source check now requires four distinct expected facts, and a negative self-check reproduces the missing-fact case.                                                 |

## Design Notes

The selected candidate is `autoevals` and its deterministic `ExactMatch` scorer. The publisher documents a 0 or 1 result without a model call; the installed API and both outputs must be checked before the fixture mapping is written. The test target judges adopter behavior through captured stdout, and a failed judgment quotes that observation verbatim. The choice remains replaceable if the installed package cannot run under TeA's Node and supply-chain gates.

## Verification

**Commands:**

- The isolated maintainer's final `check`, `compile`, `seal`, `preflight`, development `run` and `score`, and held-out `run` and `score` exited 0. Its transcript names invocation IDs and evidence paths. P-001 and P-004 were clean in three of three trials; P-002 and held-out P-003 caught M-001 in three of three. The final engine verdict retains the one named coverage concern.
- The final integrated `npm test` exited 0 after the PR review repair. It includes 117 learned-framework checks, the supply-chain drift gate, ESLint, Markdown lint and Prettier. An earlier full run also passed before the isolated maintainer fixture replaced the draft.
- The integrated `npm run test:evaluate-learned-framework` passed 117 checks, including live development and held-out replay through eval-quality, actual installed Autoevals calls, scorer-controlled judgments for both behaviors, changed result-shape rejection, malformed-output guards, broken mapping rejection and duplicate source-fact rejection.
- `npm run docs:validate-links` found zero broken links; `npm run docs:build` exited 0.
- `git diff --stat origin/main -- cli/` is empty. The published eval-quality export check passed at the start and end of the story.

**Revert observations:** Seven isolated edits each failed its intended gate and was restored byte for byte. Adding `autoevals` to the skill failed `framework named in skill`; removing the LEARNED known-pass stdout failed its parse assertion; removing the before-mapping transcript marker failed the ordering assertion; renaming the mapping key failed `framework result mapping changed`; replacing the `ExactMatch` call with a constant result failed the framework-call guard; pinning the dependency failed the `latest` assertion; removing a licence exception failed `test:licences` with `approved Autoevals undeclared licence set changed`. The full focused gate passed again after restoration.
