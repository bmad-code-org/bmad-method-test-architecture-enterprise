---
title: 'Inspect the target, capture requirements and design the corpus'
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'dispatch'
review_loop_iteration: 4
baseline_commit: '0cfaa7f9f855711565028f47a93c48d1463fbfed'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="Story 1.12 intent approved in the Evaluate epic">

## Intent

**Problem:** An adopter can run Evaluate, but its first three stage guides are placeholders. There is no confirmed statement of what the evaluation measures or target-specific corpus design.

**Approach:** Teach inspection, intake and corpus design for all six target kinds; provide working templates; bind the confirmed requirements file and its byte digest in `evaluation.json`.

## Boundaries & Constraints

**Always:** Follow Story 1.12's criteria in `epics.md`, the test-design revert checks and AD-4, AD-9, AD-19 and AD-22. Use eval-quality's `digestBytes` for committed Markdown bytes. Validate tagged probe examples against the installed engine. Halt intake for adopter confirmation before corpus design. Add the focused guidance test to the `npm test` chain and update the changelog, sprint row and outcome record.

**Never:** Declare `web` as an interface, evaluate a vendor model itself, expose held-out probe content to the gap loop, compute an engine verdict in TeA, or implement Story 2.2's contract-source freshness comparison here.

## I/O & Edge-Case Matrix

| Scenario            | Input / State                        | Expected Output / Behavior                                                         | Error Handling                                      |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| Known target        | One of six target kinds              | AD-4 interface and adapter; inspection record                                      | `check` validates the resulting evaluation          |
| Ambiguous target    | Description fits more than one kind  | Clarifying question before selecting kind                                          | No guessed interface                                |
| Vendor request      | Request concerns a provider model    | Redirect to adopter-owned use; model fixed in evaluator conditions                 | Refuse model-weight or provider-switch mutation     |
| Confirmed statement | Markdown copied to evaluation folder | Relative path and `digestBytes` value in evaluation manifest                       | Missing or mismatched digest fails `check`          |
| Corpus design       | Behavior and ranked risk             | Representative, negative, malformed, held-out, clean and defect probes plus digest | Refuse unrepresentable defect signature with reason |

</frozen-after-approval>

## Code Map

- `src/workflows/testarch/bmad-testarch-evaluate/references/{inspection,intake,corpus}.md`: Replace placeholders with worked craft guidance and stage outputs.
- `src/workflows/testarch/bmad-testarch-evaluate/assets/`: Add evaluation, inspection record and requirements statement templates.
- `test/test-evaluate-guidance.js`: Existing stage guard; extend with exact headings, mapping, tagged engine-valid examples and template checks.
- `cli/lib/evaluate/schemas/evaluation.schema.json` and `cli/lib/evaluate/check.js`: Closed manifest schema and semantic check; add requirements path and digest without copying engine hashing.
- `test/test-evaluate-check.js`: Existing CLI fixture tests for valid and malformed manifests.
- `package.json`, `CHANGELOG.md`, sprint status and this record: Chain the gate and record delivery.

## Tasks & Acceptance

**Execution:**

- [x] Author inspection, intake, corpus guides and the three templates through the workflow-builder Edit path.
- [x] Add requirements path and digest to the manifest schema and `check`, with valid and refusal tests.
- [x] Extend guidance tests for all Story 1.12 headings, examples, corpus rules and templates; keep the existing guidance script in `npm test`.
- [x] Run builder Analyze, the engine export check, focused tests and full quality gates; exercise each revert check.
- [x] Update changelog, sprint status and the outcome record; open one pull request.

**Acceptance Criteria:**

- Given the six target kinds, when inspection is read, then its AD-4 mapping, five inspection topics, worked vendor redirect and inspection record are complete and a changed mapping fails guidance tests.
- Given intake answers, when the adopter confirms the six-section statement, then its committed bytes are named and digested in `evaluation.json`; missing or mismatched metadata fails `check`.
- Given each target kind, when its corpus guide is read, then four named design topics, a schema-valid tagged worked corpus and the CAP-3 rules are present; removing a heading or corrupting an example fails guidance tests.
- Given a planned corpus, when `tea-evaluate digest` runs, then the AD-9 index and digest cover all authored corpus, probe and mutation bytes.

## Implementation Notes

The first three stage guides now lead the adopter from a recorded inspection through a six-family confirmed statement to a corpus designed for the selected target kind. Each of the six target kinds has representative, negative, malformed, gameability, held-out and seeded-defect worked probes. The guidance test validates all 36 tagged probes against the committed-probe schema and a hydrated eval-quality probe schema. It also validates concrete gameability responses against the runtime schema and resolves their signatures through eval-quality.

`evaluation.json.requirements` is additive while earlier fixtures await Story 2.2. When present, `check` requires the fixed `requirements.md` path, a `sha256:` digest over its exact bytes, and a regular file opened without following a link or blocking on a swapped FIFO. It does not compare the contract's `sourceSpecDigest`; Story 2.2 owns that freshness check.

The asset templates remain installed starters. Inspection and intake copy them into run-specific working drafts, then the confirmed statement is copied into the committed evaluation folder. Activation resolves both `test_artifacts` and `tea_evaluations_folder`; resume reads the existing record and manifest before Stage 3.

The existing `test:evaluate-guidance` script was already chained into `npm test`, so no package script or CI matrix edit was required. A packaging boundary check initially found machine paths in ignored builder analysis output and fictional `test/` paths in the inspection example. The analysis report moved outside the package tree, the fictional paths were renamed, and `test:boundary` passed with zero violations.

## Spec Change Log

## Review Triage Log

| Finding                                                        | Verdict | Route    | Evidence                                                                                                                                                                    |
| -------------------------------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime review: FIFO swap after `lstat` can block `check`      | medium  | fixed    | The guarded open now uses `O_NONBLOCK`; a timed FIFO race test exits 10.                                                                                                    |
| Builder architecture: `{test_artifacts}` unresolved            | high    | fixed    | Activation now loads the installed module's `test_artifacts` config.                                                                                                        |
| Builder architecture: stages could edit installed templates    | high    | fixed    | Guides now copy templates into run-specific drafts before filling them.                                                                                                     |
| Builder enhancement: resume omitted prior artifacts            | medium  | fixed    | Workflow reads inspection, manifest and confirmed requirements before Stage 3.                                                                                              |
| Builder corpus length and branch routing                       | medium  | rejected | Story 1.12 requires one `corpus.md` with six per-kind heading trees and engine-valid worked corpora; splitting it would break the approved stage shape.                     |
| Builder template override scalars                              | medium  | rejected | Adopters edit run-specific copies. No organization-specific template requirement exists in the approved story.                                                              |
| Builder manifest stamping helper                               | medium  | rejected | The guide runs eval-quality's `digestBytes`; `check` rejects a missing or mismatched manifest value, so no silent correctness gap remains.                                  |
| Final adversarial and CodeRabbit: object digest crashes check  | high    | fixed    | A JSON object with a string `toString` made `RegExp.test` throw. The guard now requires a string; a CLI case checks schema exit 10.                                         |
| CodeRabbit: starter omits runner exit codes                    | high    | fixed    | The starter now declares codes 3 through 6 and the guidance test checks the exact set.                                                                                      |
| Final edge: held-out examples were clean controls              | high    | fixed    | Each kind now selects a non-clean held-out probe and retains development coverage for its behavior; the guidance test checks both conditions.                               |
| Final edge and CodeRabbit: skill omitted critical B-002        | high    | fixed    | Over-limit cases now target B-002. Its held-out seed cites a reservation call on stdout; B-001 keeps a development seed and held-out gameability case.                      |
| Final edge: naive oracle relation was inconsistent             | medium  | fixed    | The skill's always-decline response satisfies B-002's refusal oracle while B-001's disciplined oracle rejects it; the guide states the cross-behavior rule.                 |
| Final edge: worked Entry points removal passed                 | medium  | fixed    | Guidance assertions now check actionable worked content within each of the five inspection sections.                                                                        |
| Final test: malformed-input examples lacked matcher rule       | medium  | fixed    | Each kind now names a declared typed request key, a `type-violating` binding and an oracle check addressing that step.                                                      |
| Final test: private runtime install was missing                | high    | fixed    | Intake creates AD-20's private package manifest and installs it before digesting; corpus invokes the CLI through `npm exec --prefix`.                                       |
| Final test: extra AD-4 row could pass                          | medium  | fixed    | The guidance test compares the entire mapping table, including all columns, with the expected rows.                                                                         |
| Final test: extra requirements section could pass              | medium  | fixed    | The guidance test compares the full ordered heading set with the six intake families.                                                                                       |
| CodeRabbit: workflow zero-action seed still created            | medium  | fixed    | Its worked seed now suppresses create and read-back while falsely claiming success; the test checks the witness and signature.                                              |
| Round 2 runtime: zero-action signature matched clean success   | high    | fixed    | Workflow P-006 now requires zero actions and a success claim in the same observed response.                                                                                 |
| Round 2 runtime: skill seed could match an eligible request    | high    | fixed    | Skill P-006 witness and selector bind the same over-limit request.                                                                                                          |
| Round 2 runtime: gameability arm absent from starter flow      | medium  | fixed    | Corpus guidance pairs the gameability arm and strength floor with P-004 when the probe is committed.                                                                        |
| Round 2 guide and runtime: five B-002 behaviors lacked seeds   | high    | fixed    | Each non-Skill kind now has a low-severity B-002 controlled seed with a concrete positive input, witness and signature.                                                     |
| Round 2 guide: gameability response missed its signature       | high    | fixed    | Six committed response examples validate against the runtime schema; eval-quality resolves each P-004 predicate true on that response and false on a clean counterresponse. |
| Round 2 guide: AI witness omitted the answer                   | medium  | fixed    | AI feature P-006 sends a JSON policy-boundary answer that its selector binds.                                                                                               |
| Round 2 test: added AD-4 table row escaped parsing             | medium  | fixed    | The guidance test parses the contiguous table block, including rows without outer pipes.                                                                                    |
| Round 2 test: extra intake family passed                       | medium  | fixed    | The guide and statement now have separate exact ordered H2 checks.                                                                                                          |
| Round 2 test: P-007 could omit its manifestation witness       | high    | fixed    | Every non-canary defect example now requires a witness.                                                                                                                     |
| Round 2 test: representative probe could leave its section     | medium  | fixed    | Tagged examples are extracted under each subheading and checked against that section's tags.                                                                                |
| Coordinator self-check: B-001 seed could match a clean decline | high    | fixed    | Skill P-007 witness and selector bind an eligible amount of 100 at a limit of 100; its gameability countercase uses the same request.                                       |
| Coordinator self-check: four held-out prompts were generic     | high    | fixed    | Agent, Workflow, Tool-use and Test-review P-006 witnesses and selectors now bind concrete held-out inputs; their signatures name the faulty stdout values.                  |
| Round 3 regression: AI seed used the wrong output vocabulary   | high    | fixed    | The restricted-answer seed now passes the unsafe answer, matching the worked grader's pass, fail and reject decisions; the test guards its witness and signature.           |
| Round 3 test: Skill P-007 output could change unnoticed        | high    | fixed    | The guidance test now requires its false decline in both witness relation and defect signature.                                                                             |
| Round 3 test: empty intake family passed                       | medium  | fixed    | Each intake family now requires a substantial question, answer and scoped worked content.                                                                                   |
| Round 3 test: held-out B-001 coverage could vanish             | high    | fixed    | The five non-Skill P-006 probes must hold out material B-001; B-002 comparison seeds remain low severity.                                                                   |

Builder Analyze produced a `good` report with zero critical or high findings. Its generated report stayed outside the package tree because it contains machine-specific paths.

## Verification

**Commands:**

- `npm run test:evaluate-guidance`: 12 stages, three worked guides, 36 tagged probe examples, six gameability responses and valid templates passed on the final corrected tree.
- `npm run test:evaluate-check`: 683 checks passed, including a timed FIFO swap case and malformed digest object refusal.
- `npm run test:boundary`: 828 package entries scanned with zero violations after the packaging fix.
- `npm run test:install`, `npm run lint`, `npm run lint:md`, `npm run format:check` and the post-boundary tail of `npm test`: passed on the corrected tree.
- Nine targeted revert checks failed their named focused suites and restored the source bytes: AD-4 mapping edit and extra row, confirmation halt, per-kind corpus heading, corpus digest instruction, requirements schema field and extra statement section, clean held-out probe, and missing `type-violating` rule.
- Engine export check from Build Rules: passed at takeover and after the second-round corrections.
- The private-prefix `tea-evaluate` invocation ran from a temporary non-project directory, and Node resolved eval-quality from a parent private `node_modules` directory.
- `npm run docs:validate-links` passed with zero issues across 44 public Markdown files.
- Full `npm test` passed on the third-round correction commit. The focused guidance test passed again after binding the final held-out examples to concrete inputs; all 36 tagged probes and six gameability responses validated.
