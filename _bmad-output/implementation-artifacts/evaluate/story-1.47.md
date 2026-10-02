---
title: 'Story 1.47: Distinguish reference risk tables from the scored register'
type: 'bugfix'
created: '2026-10-01'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fdd1ed5b9a6b5e376abfdc41e40e235c39688d54'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.47)'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (Story 1.47)'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.27.md'
  - '_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - 'AGENTS.md'
---

<frozen-after-approval reason="Owner delegated Story 1.47 and the Evaluate relay grants build authority">

## Intent

**Problem:** The test-design parser reads any unfenced table with risk ID and score columns as the register, including a separately labeled reference example. A ruled-out category in such an example fires the unsupported-risk oracles and an example row moves the register count, risk precision and coverage mapping.

**Approach:** The shared parser (`cli/lib/test-design-parser.js`) identifies a reference table from the document's own labels and leaves it out of the register and the coverage map. The runner projection and the harness scorer read that one parser, so the contract oracles, the projection and the scorer agree. The rule is documented against the shipped worked example, a real test-design document.

## Boundaries & Constraints

**Always:** One parser for the runner, the harness and the contract oracles. Regenerate contracts, probes and the strength baseline from their sources. Prove each acceptance criterion with a real mutation in a disposable copy.

**Never:** Edit generated JSON by hand. Edit the test-design skill, `references/ci.md`, `SKILL.md` or the plan template (the Story 2.4 captures digest the last three).

## I/O & Edge-Case Matrix

| Scenario                 | Input / State                                                                  | Expected Output / Behavior                                                                     |
| ------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Reference only           | Ruled-out category in a labeled reference table, a guard row in the register   | O-008 stays unfired; the register has one row; no duplicate id, scale or dangling link failure |
| Reference and scored row | The same category in the labeled table and in a register row scored above 3    | O-008 fires on the register row alone; the harness agrees                                      |
| Title names a reference  | `# Reference Data: Sync Design` over a scored register                         | The register counts; the title is no label                                                     |
| Story title names it     | `### Story 7.1: Distinguish reference risk tables (Score 1-9)` over a register | The register counts; a heading that merely mentions the word is no label                       |
| Shipped worked example   | `test-design-epic-3.example.md` with a labeled copy of its register appended   | Seven register rows and the same projection as without the copy                                |

</frozen-after-approval>

## Code Map

- `cli/lib/test-design-parser.js`: `isReferenceHeading`, `referenceLabelOf` and the lead-in scope in `parseTables` hold the context rule, documented against the shipped example. `readRisks` and `readCoverage` skip reference tables; `readDesign` reports them as `referenceTables`.
- `cli/test-design-runner.js`, `test/lib/probe-scoring.js`: consumers of the one parser, unchanged.
- `test/eval-test-design.js`: `readObservedDesign` holds the projection-equality guard the harness applies to a run, extracted so a test can call it.
- `test/test-contract-oracles.js`: the reference pairs per label branch, the register negatives, the coverage, shipped-example, refusal-reason and material-vocabulary cases.
- `test/test-probe-targets.js`, `test/fixtures/test-design-runner/stub-agent.js`: the `reference-table` stub mode through the real runner and harness, and the mismatched-projection refusal.
- `test/replay/test-design/seeded-z-reference-table-scored-risk/`: a stored design pairing a reference table and a scored row with the same ruled-out category.
- `test/test-eval-replay.js`: `SCORER_VERSION` 16 and its history paragraph.
- `test/probes/test-design.probes.json`, `test/probes/expected-strength.json`: regenerated in round 0; the new stored run moves the corpus digest.
- `test/lib/doc-count-sources.js`, `eval-quality.config.json`, `test/test-doc-count-sources.js`, `docs/explanation/eval-quality-adoption-guide.md`, `docs/explanation/eval-quality-roadmap.md`: the replay counts, held by `doc-counts`.
- `test/contracts/README.md`: the context rule, in the test-design section.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/test-design-parser.js`: context rule (see Implementation Notes). The shipped example labels its register by `## Risk Assessment` and its bands by score, so a reference label never collides with it.
- [x] `test/test-contract-oracles.js`: fixtures per branch, register negatives, shipped-example variants, refusal reason, material vocabulary, projection-versus-harness row count.
- [x] `test/replay/test-design/seeded-z-reference-table-scored-risk/`, `test/test-eval-replay.js`: the harness replay, scorer version 16.
- [x] `test/test-probe-targets.js`, stub agent, `test/eval-test-design.js`: the runner stub case and the mismatched-projection refusal.
- [x] regenerate probes and the strength baseline; `test/contracts/README.md`; CHANGELOG; sprint status; replay counts.

**Acceptance Criteria:**

- Given a design with a scored register and a labeled unfenced reference table with risk ID and score columns, when the harness and the contract evaluate it, then the reference rows change no register count, unsupported-risk oracle, risk precision or coverage mapping, and the scored register still does.
- Given the same excluded category in the reference table and in a scored register row, when both evaluate it, then O-008 fires for the register row in the harness and the contract; with the category in the reference table only it stays unfired. Restoring table-global parsing fails the reference-only fixtures.
- Given the staged suite-only test-design preflight and the full chain, when they run, then the contract, the runner projection and the scorer agree. The reference agreement is held by the runner stub case, the projection-versus-harness check and the replay case; the staged preflight is a no-regression run (see the Spec Change Log).

## Implementation Notes

- **The context rule.** The shipped worked example (`src/workflows/testarch/bmad-testarch-test-design/resources/test-design-epic-3.example.md`) is the real document the rule is read against. Its register is seven rows in three band tables under `## Risk Assessment` (`### High Risks: Score 6 or Greater`, `### Medium Risks: Score 3 to 4`, `### Low Risks: Score 1 to 2`), and none of its headings or lead-ins carries a label. `test-design-template.md` and the stored designs follow the same shape; `test-design-qa-template.md` and `test-design-architecture-template.md` parse to 0 risk rows and `test-design-handoff-template.md` carries `### Risk References`, so they are not register examples.
- **Two labels.** An enclosing heading labels its tables when its last word is Example, Illustration or Reference (`Appendix: Scoring Reference`, `Worked Example`), or when its first word is Example or Illustration followed by a colon, a spaced dash or the word Register or Table (`Example: a checkout register`, `Example Register`). A paragraph that opens `Example:`, `Worked example:` or `Illustration:` labels every table after it up to the next heading, whatever sits between them. Any enclosing label counts, so a labeled appendix that copies the register's band headings stays a reference.
- **What labels nothing.** The document's first heading is its title at any level. A first-word Reference, `Reference:` and `References:` citations, and the words Sample and Illustrative label nothing: round 1 reproduced registers lost to `Sample Intake Risks`, `Reference Data Risks`, `Reference: PRD section 4.2 ...`, `Sample handling is the riskiest area.` and `Example-driven scoring`, all of which the first rule read as labels. The rule moved from "any reference word at either end" to the narrow positions above.
- **Design boundaries.** A heading that ends with the word for another reason (`### Story 7.2: Upload an example`) reads as a label. Position alone cannot tell it from `Worked Example`, and any rule that could (a story-number prefix, a length cap) would be a second heuristic with its own misses. The failure is loud: the register is refused with the reason naming the exclusion, or a coverage row is reported unmapped, and the repair is a rename. A heading with the word in the middle (`Scoring Reference Tables`) is not read; its tables fall back to the lead-in or to the earlier register-wide reading. A lead-in labels every table up to the next heading, so a real register placed under an `Example:` paragraph in the same section is excluded as well; that is the price of covering a coverage table, a second table and an HTML comment after one lead.
- **One parser, three readers.** Runner projection, harness scorer and contract oracles consume `cli/lib/test-design-parser.js`, so no copy of the rule exists to diverge. The contract is unchanged: its oracles already say "scored risk-register row". The projection keeps its four keys; `design.referenceTables` is read by tests and by the refusal reason (a design whose only register-shaped tables are labeled references is refused with "outside the tables it labels as reference examples").
- **Material vocabulary stays document-wide.** The material-risk oracles read the original Markdown, so the words of a reference table still count toward them, as prose does. A fixture whose material-risk words appear only inside a labeled reference table holds the claim in the harness and the oracle.
- **Replay case.** `seeded-z-reference-table-scored-risk` is `seeded-z-browser-risk-scored` plus a labeled appendix: a worked-example register that repeats R-001, adds an out-of-scale R-099 and scores the browser risk 9, and a coverage row linking R-099. Its stored result equals the browser case's. The name keeps it after `seeded-z-browser-risk-scored`, which stays the O-009 probe evidence. A reference-only stored design would be a second run on which every check passes, and the probe generator needs exactly one per fixture set, so that fixture is constructed in `test-contract-oracles.js`.
- **Scorer version.** `SCORER_VERSION` is 16. No earlier stored design labels a table a reference, so every case recorded at 15 reproduces as a version stamp only.
- **Runner agreement.** The `reference-table` stub mode copies the replay case through the real runner. The harness run exits 1 with the single failure "1 risk(s) the epic rules out in as many words", six register rows, precision 5/6 and every link resolved. `readObservedDesign` (extracted from `runCase`, behavior unchanged) refuses a hand-built projection that counts the reference rows.
- **Replay counts.** `test/replay/` held 141 cases while the adoption guide and the roadmap stated 123 (a pre-existing defect: 37 ci runs and 14 test-design documents, not 21 and 12). The sentences now state digits and `doc-counts` holds them against `test/lib/doc-count-sources.js`, which counts the case directories and their `origin`. The real-capture sentence is restated from the data: 3 real captures (two test-review verdicts, one ci workflow), 12 captured atdd reports, 126 constructed. The earlier claim that the only banked real outputs were both unscoreable is no longer true and is dropped.
- **Staged preflight.** The worktree's leg cache was empty, so a first run started live model legs. It was stopped and the six content-derived cache entries of the Story 1.27 worktree (the same requests: the contract and prompts are unchanged) were copied into this worktree's gitignored `test/eval-artifacts/preflight-cache`. The suite-only preflight then answered all 46 legs from cache and matched the baseline. Those cached live outputs carry no labeled table, so the preflight is a no-regression run for this story.
- **Engine check.** The epic's engine check (`import('eval-quality')` exports `evaluateTarget`) exits 0, and `git diff origin/main -- package.json package-lock.json` is empty.

## Spec Change Log

- Round 1, Story 1.47 row 3 of `test-design-epic-1.md` and AC 3 in `epics.md`. The row and the criterion named the staged preflight as the evidence that the reference agreement holds. The preflight replays cached live outputs that contain no labeled table, so it cannot fail on a reference regression. Both now name the evidence that can: the runner stub case through the real runner and harness (`test:probe-targets`), the projection-versus-harness row count (`test:contract-oracles`) and the stored replay case. The preflight stays as a no-regression run. A mutation that makes the runner parse table-globally fails the stub case; a mutation that removes the harness equality guard fails the mismatched-projection check.

## Review Triage Log

- Round 1, adversarial 1, test quality 2, AD 3 (`high`, fixed): the context rule read Sample, Illustrative, a first-word Reference and `Reference:` leads as labels and let the title at level two label itself. Fixed as described under "What labels nothing". Every document the reviewers listed is now a negative fixture, including the four shipped-example variants.
- Round 1, test quality 3 and 4, adversarial 3 (`medium`, fixed): the rule had branches no case exercised. Each heading position, each lead-in word, the lead's reach over later tables, the plural words and the first-heading rule now has a fixture; the mutation run below kills all 25 branch mutations.
- Round 1, test quality 1, AD 1 (`medium`, fixed): the runner projection agreement was untested end to end. Added the stub case, the extracted guard and the mismatched-projection check. The contract-oracles assertion that said "the runner projection" now names the parser's `scoredRiskProjection`.
- Round 1, AD 2, 4, 5 and test quality 5 (`low`, fixed): stale replay counts held by `doc-counts`, the clause connector and the missing "final run" in this record, the template claim narrowed, the engine check added, the material-vocabulary clause folded into the existing README sentence.
- Skipped: none.

## Verification

**Commands:** `npm run test:contract-oracles`; `npm run test:eval-replay`; `npm run test:probe-targets`; `node test/eval-contract-strength.js --suite test-design --preflight-only`; the chain scripts listed under the gate summary; `npm run docs:build`, `npm run format:check`, `npm run lint`, `npm run lint:md`.

### Revert observations

Each in a disposable copy with `node_modules` linked, never in the working tree.

Round 0 (the first review's scope):

| Change in the copy                                              | Observation                                                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Table-global parsing restored (`referenceLabelOf` returns null) | 49 oracle checks fail; `test:eval-replay` fails `seeded-z-reference-table-scored-risk` at an unchanged version    |
| Every table labeled a reference (filtering both tables)         | 60 oracle checks fail, among them every scored-register case; the stored clean and seeded designs fail in replay  |
| `readCoverage` or `readRisks` reads reference tables            | Oracle checks fail the reference coverage case and the register counts; the replay case fails                     |
| The runner projection counts reference rows                     | `the parser's scoredRiskProjection and the harness count the same register rows` fails on every reference fixture |

Round 1, one mutation per branch of the narrowed rule (`test:contract-oracles` failure counts in parentheses). All 25 fail at least one case:

- Last word: Example dropped (44), Illustration dropped (33), Reference dropped (28), Sample added (1).
- First word: plural dropped, colon dropped, spaced dash dropped, dash made unspaced (1), register and table nouns dropped (11), `Worked` dropped, Reference accepted.
- Lead-in: `Worked` dropped (11), Illustration dropped (11), Example dropped (66), colon not required (1), `Reference:` accepted (3), Sample accepted (3).
- Scope: the title labels itself (3), only a level-one title is exempt (1), the lead cleared after one table (37), the lead surviving a heading (1), the lead surviving a list item (1), heading labels ignored (171), lead-ins ignored (77), the refusal suffix removed (1).
- Runner: the runner projects table-globally, which fails the `reference-table` stub case in `test:probe-targets` (three assertions); the harness equality guard removed, which fails the mismatched-projection check.

Survivors found while writing the fixtures, and what happened to them: the first-word `end` alternative and the `labelled.length` truncation could not fail any case because the last-word position and the by-level `find` over `headings` already cover them, so both were deleted. The dash, plural and `Worked` first-word branches survived until each got its own heading fixture. No survivor remains.

### Gate summary

Round 0 and round 1, in this checkout: `test:contract-oracles`, `test:eval-replay`, `test:probe-targets`, `test:contract-sources`, `test:probe-sources`, `test:probe-corpus`, `test:eval-schemas`, `test:eval-ci-data`, `test:eval-test-design-data`, `test:contracts`, `test:shards`, `test:ci-coverage`, `test:ci-coverage-filters`, `test:suite-manifest`, `test:doc-invocation-entry`, `test:doc-invocations`, `test:doc-count-sources`, `test:doc-counts`, `test:doc-claim-sources`, `test:doc-claims`, `test:changelog`, `test:release-metadata`, `test:bmad-output-gated`, `test:direction`, `test:boundary`, `docs:validate-links`, `docs:build`, `format:check`, `lint`, `lint:md`, and the suite-only staged test-design preflight (46 cached legs, every outcome matches the baseline, exit 0). Round 1 changed no replay case and no contract, so the corpus digest and the strength baseline did not move again.

## Findings

Fixed in this story: the register-global reading of reference tables, the over-wide label rule found in round 1, the untested runner agreement and the stale replay counts. Skipped with a reason: none. Findings left for a later story: none. The design boundaries above (a heading that ends with the word for another reason, a word in the middle of a heading, the lead-in reach, material vocabulary staying document-wide, the skill's own guidance untouched) are decisions with their reasons recorded.
