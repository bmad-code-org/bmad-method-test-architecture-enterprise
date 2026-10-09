# Criteria registry, convention baseline, and the eval harness

This design record began on 2026-08-04 after couture-cast PR #103 produced conflicting review recommendations.
The dated sections describe the implementation and evidence available at the time.
For current behavior, read the [criteria registry](./skills/bmad-testarch-test-review/steps-c/criteria-registry.md) and [CLI reference](./docs/reference/tea-test-review-cli.md).

## What the #103 comparison exposed

Run 30929497408 used Codex `gpt-5.6-luna` with low reasoning effort and scored 82/100, `Request Changes`.
A parallel persona run scored 8.5/10 and recommended merging.
The scores differed by three points; the recommendations would produce opposite outcomes under `--fail-on request-changes`.

The investigation found four defects:

| Defect                                     | Effect                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Convention criteria fired unconditionally  | `Test IDs: none present` carried the same meaning in repos with and without that convention |
| Three workers chose severity through prose | Reviewers could agree on a defect and disagree on its deduction                             |
| Recommendation was independent of findings | A deterministic score could sit beside an arbitrary gate recommendation                     |
| Workers defined no CRITICAL row            | Aggregation deducted 10 points per Critical finding without a shared rule for assigning one |

The Critical findings on `unit-test-coverage-bot` #25 happened to be correct, but the rubric supplied no rule that justified their severity.

## Registry and baseline decisions

### Severity comes from the registry

Each row in `steps-c/criteria-registry.md` defines a firing predicate, severity, and gate class.
Workers own subsets of those rows.
A defect matching no row is reported as an observation with no deduction.

The registry uses three gate classes:

- **Absolute:** hard waits, conditional assertions, unreset shared state, oversize files, and CRITICAL rows apply regardless of repo adoption.
- **Applicability:** a criterion applies when the reviewed file exercises the behavior it protects.
  Network-first applies to navigation that depends on a response.
- **Convention:** deductions follow measured adoption: `established` uses the row severity, `emerging` lowers it one step with a LOW floor, and `absent` or `unknown` deducts nothing and reports `✅ PASS (n/a)` with the adoption count.

Network-first received an Applicability gate.
Its adoption in couture was 5 of 19 files; a Convention gate would have demoted a navigation race to LOW because adoption was sparse.

The Test IDs finding on #103 concerned `#main-content` and the presentation text `+ Add Garment`, which belong to selector resilience (L1).
Role- and label-based locators satisfy L1.

### Baseline measurement excludes the review set

`step-02-discover-tests` §2b samples up to eight files, ranked closest-first, outside the review set.
The thresholds are `< 4` files for `unknown`, zero adopted for `absent`, and at least 50% for `established`; the remaining cases are `emerging`.
An unavailable baseline makes Convention rows `n/a` and is reported explicitly.

### Recommendation follows the findings

`step-03f` §3b applies:

```javascript
if (CRITICAL > 0) return 'Block';
if (HIGH > 0) return 'Request Changes';
if (score < 70) return 'Request Changes';
if (MEDIUM + LOW > 0) return 'Approve with Comments';
return 'Approve';
```

A CLI waiver changes the exit result while preserving this recommendation.
Findings are deduplicated by `(file, line, row)` before counting.

### Conflicting worker rules were reconciled

- `waitForTimeout` became H1, HIGH, owned by determinism.
  Previously, determinism and performance each deducted MEDIUM for the same wait while the published table called it FAIL.
- Shared state and test-order dependency became H4, owned by isolation.
- Test length became H5 at 1,000 lines.
  The maintainability worker had deducted for more than 100 lines.
- Deductions for fresh database setup and `describe.serial` were removed because they penalized isolation and required Pact serialization.
- H2 applies to wall-clock values governing expiry, lifetime, TTL, or scheduling boundaries.
  A timestamp unrelated to behavior does not trigger it.

Vague rows such as "could benefit from helper functions" and "missing performance optimizations" were removed because they had no reproducible firing predicate.

## Eval harness

`test/eval-test-review.js` uses fixtures under `test/fixtures/test-review-eval/` and runs through `npm run eval:test-review`.
It measures:

- Recall against planted registry rows and their derived `admittedLines` sets.
  Those sets include the firing line, enclosing declaration, and row comment.
  They replaced a four-line radius that admitted out-of-file lines for two plants and missed enclosing declarations for two others.
- CRITICAL recall, with a 100% threshold.
- Non-false-positive rate against the clean fixture.
  This replaced the name "precision", since findings on seeded fixtures can include real defects absent from the manifest.
- Score standard deviation and recommendation stability across repeated runs.

Unmatched findings on a seeded fixture are reported as unattributed.
The fixture may contain an incidental real defect.
An implementation change with no test is a negative control: coverage assessment belongs to `trace`.

Preflight validates repo state and tool availability before model calls.
A failed preflight exits 2 with an environment failure, preventing a missing credential from being counted as zero recall.

## Recorded verification

The original implementation recorded:

- `npm test`: exit 0 across schemas, installation, knowledge, release metadata, workflow descriptions, lint, markdownlint, and formatting.
- `npm run test:cli`: 416 passes before the workflow edits.
- `node test/eval-test-review.js --preflight-only`: exit 2 naming the missing credential, or exit 0 with it present; fixture paths and ground-truth lines were validated.

A live evaluation ran on 2026-09-08 with Claude/Sonnet across three suites.
[The roadmap](./test/docs/eval-quality-roadmap.md) records their results; that run committed no result artifact.

## Derived recommendation in the CLI

`parse-report.js` gained `deriveRecommendation(violations, qualityScore)`.
`parseReport` publishes the derived recommendation and preserves a differing agent value as `reportedRecommendation`.
`test-review.js` logs the substitution and the counts that caused it.
The existing `Critical + Approve` contradiction remained `REPORT_UNPARSEABLE`.

Fixtures were retuned while preserving their test purpose:

| Fixture                          | Before                 | After                                  | Purpose                            |
| -------------------------------- | ---------------------- | -------------------------------------- | ---------------------------------- |
| `approve.md`                     | 1 HIGH, `Approve`, 93  | 0 HIGH, `Approve with Comments`, 93    | Passing gate report                |
| `approve-low-score.md`           | 12 HIGH, `Approve`, 40 | 15 MEDIUM, `Approve with Comments`, 70 | Score floor and the boundary at 70 |
| `plain-bullets-key-strengths.md` | 1 HIGH, 98             | 0 HIGH, 98                             | Bullet parsing                     |
| `wrapped-steps-flow.md`          | 2 HIGH, 83             | 7 MEDIUM, 83                           | Wrapped frontmatter                |
| `colon-in-bold.md`               | 2 HIGH, `Approve`, 90  | 5 MEDIUM, `Approve with Comments`, 90  | Bold recommendation label          |
| `lowercase.md`                   | `approve`              | `approve with comments`                | Case normalization                 |
| `score-mismatch.md`              | 2 HIGH, 86             | 7 MEDIUM, 86                           | Arithmetic mismatch                |

`approve-with-high.md` preserves the original #103 regression shape: one HIGH with `Approve` becomes `Request Changes`, retains `reportedRecommendation: 'Approve'`, and fails the gate on the derived value.
Direct tests cover each branch of `deriveRecommendation`.

## Critical escalation decision, 2026-08-04

Critical findings derive `Block`, which fails at every `--fail-on` level.
The former boundary test allowed one Critical with `--max-critical 1 --fail-on block`; it was changed to assert failure.
`--max-critical` can tighten the gate but cannot admit a Critical finding.
A recorded waiver with a reason and expiry remains the exception path.

Both effects were accepted on 2026-08-04: Critical remains Block, and `--fail-on block` rejects it.
This ruling is settled. Do not reopen it by proposing a Request Changes cap or a max-critical escape.
The H1 severity change was separately noted: aligning hard waits with the published HIGH rule increased their deduction from 2 to 5 points.

## Estimated effect on #103

A hand-worked review under the registry found one HIGH (H2), four MEDIUM (M1, M2, M4, M5), and two LOW (L1, L2), with priority-marker adoption established at 11 of 19 files.
The result was 85/100, `Request Changes`, because HIGH was nonzero.
This checked the arithmetic; the harness supplies repeated measurements.

## 2026-08-10: fabricated convention baseline

Couture-cast PR #106, comment 5234513259, reported four LOW Priority Markers findings and cited `Convention: priorityMarkers (18 of 40 sampled)`.
A repo-wide search found zero real priority markers; the sole incidental match was a `'p1'` silhouette-profile ID.
The cited `test-quality.md` fragment contained no priority rule.

§2b specified sampling outside the review set, recording `corpusSize` and `sampled`, and reporting `baselineUnavailable: true` when measurement failed.
At the time, the agent alone performed that sampling.
No report fixture included a `**Convention Baseline**:` line, and the parser never checked one.

`cli/lib/convention-baseline.js` moved the mechanically detectable part into the CLI.
It uses `git ls-files`, excludes the review set, ranks neighbors by directory distance, and provides an eight-file sample to the agent.
The CLI scans a wider 40-file set for mechanical signals, keeping the zero-adoption check grounded in that observed corpus.
The original six mechanically recognized keys were `priorityMarkers`, `testIds`, `networkFirst`, `dataFactories`, `fixtures`, and `playwrightUtils`.
`bddNaming` and `assertionStyle` remained agent-judged because token searches could not establish those conventions.

`verifyConventionBaseline` checks sample and corpus counts exactly.
It also rejects nonzero adoption claims when the CLI found zero occurrences in its scan.
Lower or judgment-based counts remain available to the agent.
Against #106's corpus, the fabricated fraction would exit 3.
CLI Suite 11 and Suite 8 git fixtures reproduce that case in a temporary repo with neighbor tests and zero priority markers.

The 4.0 registry used Convention gates for `priorityMarkers` (L2), `testIds` (L3), `bddNaming` (L5), and `playwrightUtils` (M9/L9).
Network-first, data factories, and fixtures used Applicability gates; `assertionStyle` (L7) had no published report-table row.
The baseline still grounded all eight keys for citations, while deductions followed each row's gate class.

Rubric 5.0, dated 2026-10-09, removed L5 and `bddNaming`.
Seven keys remained, with Convention gates for `priorityMarkers`, `testIds`, and `playwrightUtils`.

## 2026-08-10: finding detail and summary counts disagreed

A second reproduction documented a real C1 Critical finding while declaring `0 Critical, 0 High, 0 Medium, 0 Low` in Total Violations.
The parser trusted the summary and returned Approve, 100/100.

`lib/registry-rows.js` reads the registry's row-to-severity map.
`verifyFindingSeverityCounts` checks documented Critical and High findings against their summary counts and validates row IDs and severity.
That implementation scoped detail-count validation to Critical and High, which directly controlled Block and Request Changes.
Medium/Low fixture expansion was left outside that historical change.

Fifteen existing report fixtures declared Critical/High counts with no supporting detail.
They gained the minimum finding fields: `### N. Title`, `**Severity**:`, and `**Row**:`, preserving the counts their tests asserted.
`fenced-recommendation.md` needed no change because its apparent 9/9 count was a fenced decoy and its real count was 0/0.
`critical-approve.md` already failed the earlier contradiction check.
