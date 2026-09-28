---
title: 'Tell a documented guard from an invented risk in the test-design contract'
type: 'bugfix'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a2a032587e72f1c36b265dcb261dab160ba21d99'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/implementation-artifacts/evaluate/story-1.7.md'
---

<frozen-after-approval reason="Owner delegated Story 1.27 and the Evaluate relay grants build authority">

## Intent

**Problem:** The test-design contract treats a ruled-out risk mentioned anywhere in a document as an invented risk. Live designs put these categories in low-score “Document” guard rows, causing six test-design preflight outcomes to differ from the stored baseline.

**Approach:** Read unsupported categories in scored risk-register rows and count them only above the score 1–3 guard band. Keep the contract, scorer, probes and stored replay evidence aligned, then prove the staged live preflight matches its baseline.

## Boundaries & Constraints

**Always:** Preserve the probe generator's witness as the exact negation of its oracle. Generate the contract and probe artifacts from their sources. Keep the risk parser, oracle and replay results consistent. Exercise each acceptance check against a local revert.

**Never:** Edit generated JSON by hand or weaken material-risk checks. Change the test-design skill unless its instructions prove to be the source of the live behavior.

## I/O & Edge-Case Matrix

| Scenario      | Input / State                                                                    | Expected Output / Behavior                     | Error Handling                                                           |
| ------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Guard         | Ruled-out category in a scored register row with score 1–3 and “Document” action | O-008 remains unfired                          | A row absent from the register cannot be counted as an invented risk     |
| Invented risk | Same category in a scored register row above 3                                   | O-008 fires and its negated witness detects it | A seeded replay with an above-band risk remains a valid mutation witness |
| Prose         | Ruled-out category in prose or a fenced example only                             | Exclusion oracle stays unfired                 | The harness and oracle must agree on the reading                         |

</frozen-after-approval>

## Code Map

- `tools/generate-contracts.js`: `testDesignOracleSpecs` owns O-008 to O-010 and O-012 to O-014; change its unsupported-risk reading. Keep supported-risk vocabulary behavior.
- `test/eval-test-design.js`: `readRisks` parses register rows; `documentMentions` and `scoreTestDesignRun` currently count unsupported vocabulary globally or in every row. Align the unsupported predicate with the guard band.
- `tools/generate-probes.js`: `buildTestDesignProbes` selects replay violations and negates contract checks. Regenerate after the oracle and replay changes; preserve equality by construction.
- `test/test-contract-oracles.js`: evaluate the clean guard and above-band risk through eval-quality, then compare with the harness. Keep stored-run agreement checks.
- `test/replay/test-design/`, `test/contracts/test-design.contract.json`, `test/probes/test-design.probes.json`, `test/probes/expected-strength.json`: update the seeded risk's score, replay results and generated artifacts together.
- `test/eval-contract-strength.js`: staged live `--suite test-design --preflight-only` command; its final result must match the baseline.

## Tasks & Acceptance

**Execution:**

- [x] Update the row-scoped unsupported-risk predicate in the generated contract and scorer. Keep the 1–3 guard band explicit.
- [x] Add oracle cases for a “Document” guard, a scored invented risk and prose-only mention. Preserve witness negation and rerun the generators.
- [x] Bring stored replay documents and expected results into agreement with the new predicate; regenerate contract, probes and baseline.
- [x] Run `test:contracts`, `test:contract-oracles`, `test:probe-corpus`, the suite-only staged live preflight and `npm test`; update changelog and sprint status.

**Acceptance Criteria:**

- Given the same ruled-out category in a guard row and a row scored above 3, when O-008 is evaluated, then it stays unfired for the guard and fires for the scored risk; reverting the predicate fails an oracle case.
- Given a test-design probe, when the corpus is regenerated, then its manifestation witness equals the negation of its oracle and the contract, probes and stored replays agree; reverting one source fails a generator or corpus gate.
- Given the staged test-design harness, when the suite-only preflight runs, then every probe reduces to `test/probes/expected-strength.json`; reverting the fix reproduces a live mismatch.

## Implementation Notes

- The fix belongs in the contract and scorer. `src/workflows/testarch/bmad-testarch-test-design/steps-c/step-03-risk-and-testability.md` already directs the skill to ground risks in the epic and put unsupported concerns outside the register. Story 1.7's staged documents show the skill still wrote low-score Document rows. The contract needed to recognize those rows as guards.
- Unsupported-risk oracles now inspect scored register rows and count a match only above score 3. Material-risk vocabulary keeps its existing document-wide reading. The scorer uses the same threshold for `mentions` and `ungrounded`.
- The generic replay keeps its score-2 browser guard. A new one-row mutation of the seeded correct run scores that category at 4, providing a violation for O-009. Replay results were recorded at scorer version 15. The contract, probes and expected-strength baseline were regenerated from their sources.
- The fresh baseline live attempt before edits stopped while its first leg was running and produced no verdict. Story 1.7 records the six pre-change mismatches. With the fix, the suite-only staged preflight answered 46 legs from the content-derived cache and matched all 16 baseline outcomes. With the old oracle predicate restored locally, the same preflight reported those six mismatches again.
- Local revert checks: restoring the old oracle predicate and regenerating the contract made `test:contract-oracles` fail the Document guard and prose cases; the staged preflight exited 2 with P-008 to P-010 and P-012 to P-014 moved. Restoring the old probe generator source made `node tools/generate-probes.js --check` fail on the test-design probe artifact. The fixed sources and generated artifacts were restored after each check.
- The first `npm test` run exposed an end-to-end probe-target assertion still expecting four invented risks in the generic replay. The score-2 Document row now counts as a guard, so `test/test-probe-targets.js` expects three invented risks and confirms that guard is excluded. `npm run test:probe-targets` then exited 0.
- The step-03 diff audit reproduced two further oracle disagreements: a scored table with reordered columns was missed, and a scored table inside a fenced example was counted. `test:contract-oracles` failed both cases before the parser-derived projection. The raw Markdown regex cannot align arbitrary header and row positions; eval-quality also rejects a fenced-block skipping pattern as `budget-exhausted` for a nested-quantifier shape.
- The test-design runner emits one JSON projection on stdout after the agent finishes. The Markdown design remains the sole file artifact. The projection carries the original document, the parsed risk-row count and descriptions of rows scored above 3. Both runner and harness import `cli/lib/test-design-parser.js`, so reordered columns, valid fences and tables without outer pipes have one interpretation. O-001 reads the parsed row count; O-008 through O-014 read scored descriptions.
- A stub-backed runner test plants a sidecar symlink whose target is outside the workspace, then confirms the external bytes remain unchanged while the adapter returns JSON stdout. It also confirms a missing Markdown file yields no projection evidence. The harness compares JSON stdout with a fresh parse of the returned Markdown. Agent diagnostics go to stderr.
- The exact staged suite-only preflight on the final Markdown-token tree passed: all 16 outcomes matched the stored baseline, 46 legs came from the content-derived cache, and no model calls were needed.
- Review added shared-parser cases for decorated score headers, longer fences, escaped pipes, tables without outer pipes and an invalid backtick-fence info string. The current `test:contract-oracles` checks O-001 on the reordered and unpiped tables and retains the scored exclusion cases.
- Final adversarial review reproduced an indented code example being read as a scored register row. The parser now counts Markdown indentation columns and list content indentation before table detection. Oracle cases cover four-space and tab-indented examples, code inside a list, and valid tables with up to three spaces or inside list content.
- A fresh review then found that list marker lines lost their content, hiding a table header or fence opener on that same line. The parser now retains the content after the marker. Oracle cases cover scored tables, headings and fenced examples on bullet and nested list marker lines.
- A bounded review found that excess padding after a list marker made an indented code example look like a table. Three container failures in the hand-written parser led to a direct production `markdown-it` dependency. The shared parser now walks heading and table tokens into its existing scorer shape; code blocks never become tables. Constructed table fixtures were corrected to valid Markdown where their header, separator or list spacing had been permissive before. All 13 stored test-design documents kept identical parsed output under the replacement.
- Final bounded review found that a heading inside a blockquote or list item could classify later top-level tables. The token walker now ignores quoted examples and restores heading context at each list-item boundary. Oracle regressions cover quoted risk tables, quoted score bands, and list, sibling and top-level coverage priorities.
- Stories 1.47 and 1.48 carry the reference-table context and eval-quality whole-body coverage findings. Final review found the inherited test-design twin-fixture rollback claim violates AD-8; Story 1.49 carries its qualification work. Story 1.16 had already assigned 1.46 to its dogfood coverage gaps. All four are recorded in the Epic 1 plan, test design and sprint backlog.
- The repository commit hook reproduced an inherited-Git-environment defect in the Evaluate interpretation fixture: its nested `git init` and `git commit` followed the hook's repository variables and moved the outer branch to fixture commits. The story worktree was restored to the recorded baseline with its files intact. The fixture helper now strips inherited `GIT_*` values from its child processes, and the interpretation test poisons those values while creating a scratch project. The focused interpretation gate passes.

## Spec Change Log

## Review Triage Log

- Blind 1, `false`: the approved approach defines the guard by a stated score of 1–3; the Document action is an example of that band, and action text is outside the unsupported-risk predicate.
- Blind 2, `false`: the exclusion oracle reads the stated score as specified. The harness reports probability-times-impact arithmetic errors through its separate shape check.
- Blind 3, `medium`, `patch`: the moved parser's decorated-score fallback misses `Score (P×I)`, so the shared projection and scorer can both omit a real register. Accept that header and test it.
- Blind 4, `medium`, `patch`: toggling on any fence marker allows a shorter marker inside a longer fence to expose an example table. Track fence character and opening width.
- Blind 5, `maybe-false`, `defer`: the parser treats an unfenced table with risk ID and score columns as a register. Whether an unfenced reference table should be excluded depends on document context that this story does not define; an example with its expected scoring would settle it.
- Blind 6, `medium`, `patch`: splitting at an escaped pipe shifts score cells and can exempt a scored invented risk. Parse escaped table separators correctly.
- Blind 7, `medium`, `patch`: the shared parser skips a valid table without outer pipes, leaving the scored risk unread. Accept that Markdown table form and test it.
- Blind 8, `medium`, `patch`: a document with no parsed risk register must not pass as a guard-only design. The stdout projection reports `riskRowCount: 0`, O-001 resolves false, and the harness refuses the document.
- Blind 9 and Edge 1, `false`: `ungrounded` measures risk rows and precision uses the number of rows as its denominator. One row mentioning two exclusions is one ungrounded row; both category oracles still fire.
- Blind 10, `low`, `defer`: eval-quality marks `whole-body` coverage unsatisfied because the full Markdown is a field in structured stdout. The contract still evaluates that full string; Story 1.48 owns the coverage representation.
- Blind 11, `low`, rejected: 201 scored rows already violate every fixture set's risk ceiling, so the 200-row descriptor cap cannot turn a valid run into a failure.
- Blind 12, `patch`: the earlier sidecar write exposed a path-swap race. The runner now emits JSON stdout and never writes a sidecar; the planted-link runner test confirms the outside target stays unchanged.
- Verification gap 1, `medium`, `patch`: direct writer tests do not prove the normal runner observation contains `scored-risks`. Assert the artifact in the stub-backed end-to-end harness run.
- Verification gap 2, `medium`, `patch`: the final contract declares only the Markdown `design` artifact and a JSON stdout descriptor. The default target map retains `design`; the runner adapter test checks both evidence channels.
- Final review, `high`, `defer to Story 1.49`: the test-design probe generator inherited a hard-coded `rollbackVerified: true` over two stored fixture designs. AD-8 requires an actual restore, digest check and clean rerun. The Story 1.27 guard-scoring acceptance criteria do not rely on that qualification claim; Story 1.49 owns its repair and revert checks.
- Final adversarial review, `medium`, `patch`: a four-space-indented example table was counted as a scored risk register. Normalize Markdown content indentation and skip indented code before detecting tables; assert that the example cannot fire O-008 while valid indented list content remains readable.
- Bounded review round 2, `medium`, `patch`: discarding list marker lines hid a valid table header and a fence opener. Preserve post-marker content and assert both scored list tables and fenced examples resolve through the shared parser.
- Bounded review round 3, `medium`, `patch`: excess list-marker padding was code in Markdown but a scored table in the hand parser. Replace the container scanner with Markdown tokens and prove code examples, list tables and fences against the oracle and harness.
- Final bounded review, `medium`, `patch`: quoted headings and list-item headings leaked into later tables. Exclude blockquote contents from scoring and restore the enclosing heading snapshot when each list item closes. Six regression assertions reproduced the error before the patch.

## Verification

**Commands:** `npm run test:contracts`; `npm run test:contract-oracles`; `npm run test:probe-corpus`; `node test/eval-contract-strength.js --suite test-design --preflight-only`; `npm test`; engine export check from the epic build rules.

**Observed before the full gate:** `test:contracts`, `test:contract-oracles`, `test:probe-corpus`, `test:eval-replay` and `test:probe-sources` exited 0. The suite-only staged live preflight exited 0: all 16 outcomes matched the stored baseline, with 46 legs answered from cache. The engine export check exited 0 at the start.

**After the end-to-end assertion update:** `npm run test:probe-targets` and `npm run test:doc-invocations` exited 0. The engine export check exited 0 again, and `git diff -- package.json package-lock.json` was empty.

**Prior gate:** `npm test` exited 0 on the stable tree before the stdout correction. Its chained contract, oracle, probe, replay, probe-target, documentation, ESLint, markdownlint and Prettier checks passed. The prior exact suite-only staged live preflight exited 0 with all 16 outcomes matching baseline, 46 cache hits, and no new model calls. The engine export check and `npm run docs:validate-links` exited 0. `git diff -- package.json package-lock.json` was empty.

**Stdout correction and parser review fixes:** `test:contracts`, `test:contract-sources`, `test:contract-oracles`, `test:probe-sources`, `test:probe-corpus`, `test:eval-replay` (151 cases), `test:probe-targets`, `test:direction`, `test:release-metadata`, the supply-chain gates and a production-only parser load exited 0. The exact staged suite-only preflight on the final heading-scope tree matched all 16 baseline outcomes, with 46 cached legs and zero model calls. `npm test` exited 0 on that frozen tree, including lint, markdownlint and Prettier.
