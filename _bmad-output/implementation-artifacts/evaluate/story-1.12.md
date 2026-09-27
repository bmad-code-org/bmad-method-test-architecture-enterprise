---
title: 'Inspect the target, capture requirements and design the corpus'
type: 'feature'
created: '2026-09-27'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
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

The first three stage guides now lead the adopter from a recorded inspection through a six-family confirmed statement to a corpus designed for the selected target kind. Each of the six target kinds has representative, negative, malformed, gameability, held-out and seeded-defect worked probes. The guidance test validates all 36 tagged probes against the committed-probe schema and a hydrated eval-quality probe schema.

`evaluation.json.requirements` is additive while earlier fixtures await Story 2.2. When present, `check` requires the fixed `requirements.md` path, a `sha256:` digest over its exact bytes, and a regular file opened without following a link or blocking on a swapped FIFO. It does not compare the contract's `sourceSpecDigest`; Story 2.2 owns that freshness check.

The asset templates remain installed starters. Inspection and intake copy them into run-specific working drafts, then the confirmed statement is copied into the committed evaluation folder. Activation resolves both `test_artifacts` and `tea_evaluations_folder`; resume reads the existing record and manifest before Stage 3.

The existing `test:evaluate-guidance` script was already chained into `npm test`, so no package script or CI matrix edit was required. A packaging boundary check initially found machine paths in ignored builder analysis output and fictional `test/` paths in the inspection example. The analysis report moved outside the package tree, the fictional paths were renamed, and `test:boundary` passed with zero violations.

## Spec Change Log

## Review Triage Log

| Finding                                                     | Verdict | Route    | Evidence                                                                                                                                                                 |
| ----------------------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime review: FIFO swap after `lstat` can block `check`   | medium  | fixed    | The guarded open now uses `O_NONBLOCK`; a timed FIFO race test exits 10.                                                                                                 |
| Builder architecture: `{test_artifacts}` unresolved         | high    | fixed    | Activation now loads the installed module's `test_artifacts` config.                                                                                                     |
| Builder architecture: stages could edit installed templates | high    | fixed    | Guides now copy templates into run-specific drafts before filling them.                                                                                                  |
| Builder enhancement: resume omitted prior artifacts         | medium  | fixed    | Workflow reads inspection, manifest and confirmed requirements before Stage 3.                                                                                           |
| Builder corpus length and branch routing                    | medium  | rejected | Story 1.12 requires one `corpus.md` with six per-kind heading trees and engine-valid worked corpora; the 8,992-token guide is below the single-purpose reference budget. |
| Builder template override scalars                           | medium  | rejected | Adopters edit run-specific copies. No organization-specific template requirement exists in the approved story.                                                           |
| Builder manifest stamping helper                            | medium  | rejected | The guide runs eval-quality's `digestBytes`; `check` rejects a missing or mismatched manifest value, so no silent correctness gap remains.                               |

Builder Analyze produced a `good` report with zero critical or high findings. Its generated report stayed outside the package tree because it contains machine-specific paths.

## Verification

**Commands:**

- `npm run test:evaluate-guidance`: 12 stages, three worked guides, 36 tagged probe examples and valid templates passed.
- `npm run test:evaluate-check`: 681 checks passed, including a timed FIFO swap case.
- `npm run test:boundary`: 828 package entries scanned with zero violations after the packaging fix.
- `npm run test:install`, `npm run lint`, `npm run lint:md`, `npm run format:check` and the post-boundary tail of `npm test`: passed on the corrected tree.
- Five targeted revert checks failed their named focused suites and restored the source bytes: AD-4 mapping, confirmation halt, per-kind corpus heading, corpus digest instruction and requirements schema field.
- Engine export check from Build Rules: passed at takeover; repeat at completion.
- Full `npm test` rerun on the corrected tree: passed.
