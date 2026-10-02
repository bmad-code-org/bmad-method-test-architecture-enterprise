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

- `cli/lib/test-design-parser.js` -- `referenceLabelOf`, `isReferenceHeading`: the context rule, documented against the shipped example. `parseTables` tags each table. `readRisks`, `readCoverage` skip reference tables; `readDesign` reports them as `referenceTables`.
- `cli/test-design-runner.js`, `test/eval-test-design.js`, `test/lib/probe-scoring.js` -- consumers of the one parser, unchanged.
- `test/test-contract-oracles.js` -- the reference pairs, the coverage case and the shipped-example case.
- `test/replay/test-design/seeded-z-reference-table-scored-risk/` -- a stored design pairing a reference table and a scored row with the same ruled-out category.
- `test/test-eval-replay.js` -- `SCORER_VERSION` 16 and its history paragraph.
- `test/probes/test-design.probes.json`, `test/probes/expected-strength.json` -- regenerated; the new stored run moves the corpus digest.
- `test/contracts/README.md` -- the context rule, in the test-design section.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/test-design-parser.js` -- context rule: an enclosing heading below the title that begins or ends with Reference, Example, Sample or Illustration, or a paragraph directly above the table that opens with one -- the shipped example labels its register by `## Risk Assessment` and its bands by score, so a reference label never collides with it
- [x] `test/test-contract-oracles.js` -- reference-only and reference-plus-scored pairs under four labelings, title and story-title negatives, the reference coverage case, the shipped-example case, the projection-versus-harness row count
- [x] `test/replay/test-design/seeded-z-reference-table-scored-risk/`, `test/test-eval-replay.js` -- the harness replay, scorer version 16
- [x] regenerate probes and the strength baseline; `test/contracts/README.md`; CHANGELOG; sprint status

**Acceptance Criteria:**

- Given a design with a scored register and a labeled unfenced reference table with risk ID and score columns, when the harness and the contract evaluate it, then the reference rows change no register count, unsupported-risk oracle, risk precision or coverage mapping, and the scored register still does.
- Given the same excluded category in the reference table and in a scored register row, when both evaluate it, then O-008 fires for the register row in the harness and the contract; with the category in the reference table only it stays unfired. Restoring table-global parsing fails the reference-only fixtures.
- Given the staged suite-only test-design preflight and the full chain, when they run, then the contract, the runner projection and the scorer agree.

## Implementation Notes

- **The context rule.** The shipped worked example (`src/workflows/testarch/bmad-testarch-test-design/resources/test-design-epic-3.example.md`) is the real document the rule is read against. Its register is seven rows in three band tables under `## Risk Assessment` (`### High Risks: Score 6 or Greater`, `### Medium Risks: Score 3 to 4`, `### Low Risks: Score 1 to 2`), and none of its headings carries a reference word. The four templates and the stored designs follow the same shape. A table is a reference when an enclosing heading below the title begins or ends with `Reference`, `Example`, `Sample` or `Illustration` (plural and `Illustrative` included), or when the paragraph directly above it opens with one of those words (`**Example:** ...`, which is how the architecture and QA templates label their own examples). Any enclosing label counts, so a labeled appendix that copies the register's band headings stays a reference.
- **Two guards against over-reading.** The title heading is never a label, so a feature called "Reference Data Sync" keeps its register. Only the first and the last word of a heading are read, so a story heading such as `Story 1.47: Distinguish reference risk tables ...` above real coverage rows labels nothing. `test-design-epic-1.md` (91 tables) carries that heading and the rule leaves all of its tables in place. A heading that has the word in the middle (`Scoring Reference Tables`) falls back to the lead-in paragraph or to the earlier reading; that boundary is the price of keeping story and feature titles out of the rule.
- **One parser, three readers.** Runner projection, harness scorer and contract oracles consume `cli/lib/test-design-parser.js`, so no copy of the rule exists to diverge. The contract is unchanged: its oracles already say "scored risk-register row", and a reference row is not one. `test:contract-sources` confirms the generated contract matches its sources without regeneration. The projection keeps its four keys; `design.referenceTables` is read by tests and by the refusal reason (a design whose only register-shaped tables are labeled references is refused with "outside the tables it labels as reference examples").
- **Material vocabulary stays document-wide.** The material-risk oracles read the original Markdown, so the words of a reference table still count toward them, exactly as prose does. The acceptance criterion lists the register count, unsupported-risk oracles, risk precision and coverage mapping, and the README states this boundary.
- **Replay case.** `seeded-z-reference-table-scored-risk` is `seeded-z-browser-risk-scored` plus a labeled appendix: a worked-example register that repeats R-001, adds an out-of-scale R-099 and scores the browser risk 9, and a coverage row linking R-099. Its stored result equals the browser case's. Read as the design's own, the appendix would add a duplicate id, a scale failure, a dangling link and a second scored mention. The name keeps it after `seeded-z-browser-risk-scored`, which stays the O-009 probe evidence; the corpus digest moved, so the probes and `expected-strength.json` were regenerated, and the baseline moved only in `corpusDigest`. A reference-only stored design would be a second run on which every check passes, and the probe generator needs exactly one per fixture set, so that fixture is constructed in `test-contract-oracles.js` instead.
- **Scorer version.** `SCORER_VERSION` is 16. No earlier stored design labels a table a reference, so every case recorded at 15 reproduces as a version stamp only.
- **Staged preflight.** The worktree's leg cache was empty, so a first run started live model legs. It was stopped and the six content-derived cache entries of the Story 1.27 worktree (`evaluate-1.27`, the same requests: the contract and prompts are unchanged) were copied into this worktree's gitignored `test/eval-artifacts/preflight-cache`. The suite-only preflight then answered all 46 legs from cache and matched the baseline.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:** `npm run test:contract-oracles`; `npm run test:eval-replay`; `node test/eval-contract-strength.js --suite test-design --preflight-only`; the chain scripts that read README.md, docs/, `test/lib/doc-*` or the touched files; `npm run format:check`, `npm run lint`, `npm run lint:md`.

### Revert observations

Each in a disposable copy with `node_modules` linked, never in the working tree. "Oracle checks" is the count of failing lines in `test:contract-oracles`.

| Change in the copy                                              | Observation                                                                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `referenceLabelOf` returns null (table-global parsing restored) | 49 oracle checks fail; `test:eval-replay` fails `seeded-z-reference-table-scored-risk` at an unchanged scorer version      |
| `referenceLabelOf` labels every table (filtering both tables)   | 60 oracle checks fail, among them every scored-register case; `test:eval-replay` fails the clean and seeded stored designs |
| `readCoverage` reads reference tables                           | Oracle checks fail the reference coverage case; the replay case fails on its links                                         |
| `readRisks` reads reference tables                              | 38 oracle checks fail; the replay case fails                                                                               |
| The title heading counts as a label                             | `a feature title that names a reference does not label its register` fails                                                 |
| A reference word anywhere in a heading labels it                | `a story heading that mentions a reference does not label its register` fails                                              |
| The lead-in paragraph rule removed                              | 11 oracle checks fail                                                                                                      |
| The runner projection counts reference rows                     | `the runner projection and the harness count the same register rows` fails on every reference fixture                      |

The first run of the title mutation passed: the fixture title `Test Design: Reference Data Sync` ends and begins with no reference word, so it never exercised the rule. The fixture is now `Reference Data: Sync Design` and the mutation fails it.

### Gate summary

Run in this checkout before the push: `test:contract-oracles` (3149 checks), `test:eval-replay` (168 cases), `test:contract-sources`, `test:probe-sources`, `test:probe-corpus`, `test:probe-targets`, `test:eval-schemas`, `test:eval-ci-data`, `test:eval-test-design-data`, `test:contracts`, the suite-only staged test-design preflight (46 cached legs, every outcome matches the baseline, exit 0), and the documentation, schema, CI-coverage, shard and suite-manifest scripts listed in the final run below.

## Findings

Fixed in this story: the register-global reading of reference tables (the story itself). Skipped with a reason: none. Findings left for a later story: none. The three deliberate boundaries (material vocabulary stays document-wide, a mid-heading reference word falls back to the lead-in, the skill's own guidance is untouched) are design decisions recorded above, with no defect behind them.
