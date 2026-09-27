---
title: 'Attribute findings for interpretation'
type: 'feature'
created: '2026-09-26'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5d613bc1c5c40fbc8d06bfff24eeb521c4c5b3f0'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="Story 1.22 intent approved in the Evaluate epic">

## Intent

**Problem:** Scored runs expose findings and engine outcomes, yet adopters cannot read a single trace from a finding to its observations and oracle evidence. The run does not distinguish process from outcome failures or identify the first material error.

**Approach:** Classify contract operations in `evaluation.json`, validate complete coverage, and project scored records plus the compiled contract into `runs/<invocationId>/interpretation.json`. Preserve eval-quality's judgment fields exactly as emitted.

## Boundaries & Constraints

**Always:** Cite each finding's recorded observations, their sequence, operation, provenance and phase; retain its quotes and oracle evidence pointers from the compiled contract. Pick the lowest sequence among material or critical citations for first material error. Keep engine outcomes, verdicts and strength as direct artifact copies. Follow AD-23 and the Story 1.22 test design. Add a revert-sensitive suite to `npm test`, a changelog entry, sprint status and this record.

**Never:** Derive a new verdict, rate, claim-support judgment or checkpoint score in TeA. Change eval-quality for this story.

## I/O & Edge-Case Matrix

| Scenario                | Input / State                                        | Expected Output / Behavior                                                        | Error Handling                                    |
| ----------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Missing phase           | Contract operation without a manifest phase          | `check` exits 10 and names the operation                                          | No run starts                                     |
| Unknown phase           | Manifest phase names no contract operation           | `check` exits 10 and names the key                                                | No run starts                                     |
| Mixed citations         | One finding cites process and outcome observations   | Both phase partitions reference the finding; citation metadata retains each phase | Each finding remains in the trial's complete list |
| Material ordering       | Material citations at 7, 3 and 12; low citation at 1 | First material error cites sequence 3                                             | Null when no material or critical citation exists |
| Missing engine artifact | Invalid score emits no evidence artifact             | Interpretation records no engine judgment for that probe                          | Score exit remains the engine exit                |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/schemas/evaluation.schema.json`: Add a closed phase vocabulary for `operationPhases`.
- `cli/lib/evaluate/check.js`: Compare phase keys with `contract.permittedInterfaces[].operations[].operationId` after contract parsing.
- `cli/lib/evaluate/score.js`: Invoke the interpretation projection after engine scoring beside `writePartitionViews`; use run-index record paths and score artifact paths.
- `cli/lib/evaluate/partition.js`: Reuse its exclusive temporary file and rename approach for a planted destination link.
- `cli/lib/evaluate/records.js` and `cli/lib/evaluate/judgment-rows.js`: Findings already carry severity, citations, oracle ID and quotes; retain those values.
- `test/lib/evaluate-story-121.js` and `test/test-evaluate-partitions.js`: Existing CLI fixture and evidence projection pattern.

## Tasks & Acceptance

**Execution:**

- [x] `evaluation.schema.json`, `check.js`, and affected fixtures: Validate exact operation-phase coverage.
- [x] `cli/lib/evaluate/interpret.js` and `score.js`: Write the per-trial finding trace, phase partitions, first material error and direct engine field copies through an atomic output replacement.
- [x] `test/test-evaluate-check.js` and `test/test-evaluate-interpret.js`: Prove exit-10 refusals, pointers, quotes, first-error ordering, artifact equality, key allow-list and safe replacement.
- [x] `package.json`, `CHANGELOG.md`, sprint status and this record: Chain the test, record delivery, and run the full gate.

**Acceptance Criteria:**

- Given a contract operation missing a phase or an unknown phase key, when `check` runs, then it exits 10 and names each mismatch.
- Given a scored run, when `score` writes interpretation, then every finding cites recorded observations, quotes, oracle and compiled-contract evidence pointers, with process and outcome partitions.
- Given material citations at sequences 7, 3 and 12 and a low citation at 1, when interpretation is written, then first material error is the citation at 3.
- Given the eval-quality evidence artifacts, when interpretation is written, then engine outcomes, verdicts and strength values match the artifacts exactly and no TeA judgment key appears.

## Implementation Notes

The phase partitions contain finding references. A finding that cites both phases appears in both partitions, while the complete finding remains once in its trial list. The finding's citation list is authoritative for its individual phases.

Eval-quality's sealed observations carry `operationId` without `interfaceId`, although the contract scopes operation IDs to each interface. `check` must refuse a cross-interface reuse of one operation ID if it makes phase attribution ambiguous. The interpretation file must never guess which interface produced an observation.

The implementation makes `operationPhases` additive at the schema level and enforces complete coverage in `check`. A run snapshots the checked map in `run.json` and in a digested `operation-phases.json`; score verifies both copies before an engine call. Scoring also refuses any finding without a citation and a quote, including a `records` import. `interpretation.json` retains every finding once per trial and references it from each phase its citations cover. It copies `outcomes`, `reducedProbeOutcomes`, `strength` and the applicable verdict directly from each evidence artifact. A missing artifact has `engine: null` with scorer exit and diagnostics references. The view replaces a planted destination link through an exclusive temporary file and rename.

Story 1.42 was appended to the Epic 1 plan, test design, dependency table and sprint backlog for interface-qualified observations. Story 1.22 safely refuses cross-interface operation-ID reuse until a published eval-quality record can identify each observation's interface. No eval-quality release is needed for this story.

Five targeted revert checks failed their named suites and restored the source bytes: phase coverage (`test:evaluate-check`), oracle pointer projection (`test:evaluate-interpret`), severity filtering (`test:evaluate-interpret`), direct strength copy (`test:evaluate-interpret`), and chain registration (`test:ci-coverage`).

## Spec Change Log

## Review Triage Log

| Finding                                      | Verdict | Route  | Evidence                                                                                                                                                                    |
| -------------------------------------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1: duplicate ID on one interface            | medium  | patch  | The phase key still identifies one operation ID on one interface. Both checks currently describe that repetition as a cross-interface collision.                            |
| B2: edited phase value                       | medium  | patch  | A reviewer changed a saved phase from outcome to process and reproduced score exit 0 with a wrong citation phase. A separately digested phase-map artifact can detect this. |
| B3: unknown citation gets null metadata      | medium  | patch  | An imported record can name an observation ID absent from its observations. Projection currently emits null citation metadata without a refusal.                            |
| B4: confirmation may be first material error | false   | reject | The approved Story 1.22 rule selects by severity and sequence, regardless of finding type.                                                                                  |
| B5: missing record and evidence paths        | medium  | patch  | A trial index and engine copy alone do not locate the particular sealed record and evidence artifact used for a trace.                                                      |
| B6: null engine hides scorer state           | medium  | patch  | A probe with no evidence artifact loses its score exit and diagnostics reference in this view.                                                                              |
| B7: unguarded rereads                        | medium  | patch  | Interpretation adds filesystem reads after input validation and can follow a replaced link; the score command has a guarded regular-file reader.                            |
| B8: production verdict test                  | medium  | patch  | The existing integration fixture only emits `contractVerdict`, leaving the `productionVerdict` copy unguarded by an assertion.                                              |
| B9: persisted partitions test                | medium  | patch  | Unit assertions cover partitioning and order, while the scored-run assertions leave those persisted fields unchecked.                                                       |
| B10: duplicate H.1 sequence                  | low     | patch  | The new dependency row uses 47 for Story 2.5 and H.1; H.1 must be 48.                                                                                                       |
| E1: unresolved observation citation          | medium  | patch  | The cited observation can be absent from an imported record and currently produces a citation with null metadata.                                                           |
| E2: changed phase snapshot                   | medium  | patch  | The later E2E reproduction of B2 showed a wrong phase in `interpretation.json`; a checked phase-map artifact can detect this edit.                                          |
| V1: critical-only first error test           | medium  | patch  | The material-first and low-only assertions pass if `critical` is removed from the selector.                                                                                 |
| V2: invalid phase value test                 | medium  | patch  | The key coverage checks pass if the schema's phase enum is widened.                                                                                                         |
| F1: serialized engine field comparison       | medium  | patch  | Explicit UTF-8 buffer comparisons make the field-copy requirement observable in the integration test.                                                                       |
| F2: key allow-list scope                     | medium  | patch  | Top, probe and trial objects could gain TeA judgment fields without failing the existing engine-only allow-list.                                                            |
| F3: oracle and full citation assertions      | medium  | patch  | Persisted trace tests compare individual citations but do not assert the full citation list or retained oracle ID.                                                          |
| F4: uncited imported finding                 | high    | patch  | A schema-valid imported `records` finding can have no citations or quotes, contrary to AD-23.                                                                               |
| F5: edited phase E2E                         | medium  | patch  | The final runtime reviewer changed a saved phase value and observed score exit 0 with wrong attribution, confirming B2 and E2.                                              |

## Verification

**Commands:**

- `npm run test:evaluate-check`: 658 checks passed.
- `npm run test:evaluate-interpret`: passed, including real scoring, Invalid exit 3, and malformed citation refusal.
- `npm test`: all 94 chained checks passed on the initial PR commit, in an independent final review, and on the review-fix tree.
- `npm run docs:validate-links`: 44 documentation files checked with no issue.
- `npm run docs:build`: passed on the initial PR commit and review-fix tree.
- Engine export check from the Evaluate build rules: passed at the start and end.
