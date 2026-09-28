---
title: 'Float the engine pin and admit Evaluate-authored suites'
type: 'feature'
created: '2026-09-28'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '96bb820ec2cb7428426a107b9ff570cf97978523'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="owner delegated Story 1.15 and RELAY.md grants build and merge authority">

## Intent

**Problem:** TeA pins eval-quality to a release and recognizes only generator-owned behavioral suites. Story 1.16 needs to register an Evaluate-authored suite without creating a second authoring path for the same skill.

**Approach:** Float the engine spec to `latest`, verify the installed lockfile release against eval-quality's corpus, and add a manifest type for a committed Evaluate evaluation with strict path, threshold, coverage and single-authoring-path checks.

## Boundaries & Constraints

**Always:** Keep the `.npmrc` and lockfile-age exceptions aligned. Keep the lockfile registry-resolved. Make every acceptance criterion fail on a tested revert. Preserve generator-owned suites and their existing harness routing.

**Never:** Copy eval-quality scoring logic into TeA. Run an Evaluate-authored suite through a generator-owned harness. Register one skill through both authoring paths.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                                                   | Expected Output / Behavior                          | Error Handling                                                    |
| --------------- | --------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Floating engine | `eval-quality: latest`, registry lockfile and installed package | Corpus gate records and tests the installed release | Refuse an exact spec or installed version differing from lockfile |
| Evaluate suite  | Manifest entry points to `evaluation.json` and its policy       | Schema and inventory accept it; thresholds agree    | Reject missing file, bad paths or threshold drift                 |
| Dual authoring  | Same skill has behavioral and Evaluate-authored entries         | Validation fails                                    | Name the conflicting skill                                        |

</frozen-after-approval>

## Code Map

- `package.json`, `package-lock.json`, `.npmrc`: engine spec, resolved registry version and release-age rationale.
- `test/test-eval-quality-corpus.js`, `test/test-contracts.js`: installed engine and lockfile agreement; corpus and contract gates.
- `test/schema/suite-manifest.js`, `test/lib/suite-manifest.js`, `test/eval-all.js`: entry shape, coverage accounting and runner routing.
- `tools/validate-eval-schemas.js`: evaluation policy cross-check, coverage counts and AD-14 authoring exclusivity.
- `test/test-suite-manifest.js`, `test/test-eval-schemas.js`: positive and negative revert checks.

## Tasks & Acceptance

**Execution:**

- [x] Float the dependency through `npm install`, update the corpus and contract gates, and prove the engine and supply-chain checks.
- [x] Admit Evaluate-authored entries through schema, inventory and runner routing without changing generator-owned behavior.
- [x] Cross-check evaluation thresholds and policy, enforce one authoring path per skill, and add focused positive and negative fixtures.
- [ ] Run each revert check and `npm test`; update changelog, sprint row and outcome record; review, push and merge one PR.

**Acceptance Criteria:**

- Given the engine spec, when a fixed version replaces `latest`, then the corpus gate fails; the installed version agrees with the registry lockfile.
- Given an Evaluate-authored suite, when its manifest and evaluation policy agree, then the schema, coverage and eval-schemas gates pass; threshold drift fails.
- Given a skill with both authoring paths, when eval-schemas runs, then it refuses the conflict.
- Given an Evaluate-authored suite in `eval:all`, when it is enumerated, then it is routed or explicitly skipped without invoking a generator harness.

## Implementation Notes

- `package.json` and the lockfile declare `eval-quality: latest`. The lockfile resolves the registry's 4.3.0 release. The corpus and contract gates compare the installed release with that resolved version; `.npmrc` and the lockfile-age exception retain the published-engine rationale.
- The strict manifest union admits `evaluate-authored` with an evaluation path and thresholds. The schema gate reads the committed evaluation and scoring policy, checks five threshold fields, counts the suite as coverage, and rejects a skill registered through both authoring paths.
- `eval:all` leaves Evaluate-authored entries to `tea-evaluate ci` and writes their IDs under `skippedSuiteIds` in its run record. Generator-owned suites keep their existing harness invocation path.

## Spec Change Log

- The approved Story 1.15 acceptance criteria stayed intact. The final gate exposed a dependency-direction error in a new fixture test, which now reads the JSON as data.

## Review Triage Log

- The initial implementation review found four valid gaps: the lockfile-age rationale, a full dual-authoring fixture gate, a coverage-count revert check, and skipped-suite JSON accounting. Each is corrected in the staged change, and three fresh bounded reviewers passed that correction.
- The first full gate exposed a stale exact-version doc claim. Its source now reads the lockfile-resolved release, and the roadmap states the stable lockfile claim. Focused doc-claim, docs build, markdownlint and release-metadata gates passed.
- The replacement coordinator's full gate reached `test:direction` and found that the new dual-authoring test imported JSON through `require`. The test now reads the fixture as file data. Focused `test:direction` and `test:suite-manifest` passed.
- Five source reversions were run and restored: the fixed engine spec, covering counter, dual-authoring rule, threshold cross-check and `eval:all` skip route each made their focused gate fail.
- Fresh adversarial review found three valid gaps. The historical result reader now keeps `evaluate-authored` out of its frozen 1.4.0 enum. Run comparison reports added and removed skipped authored suite IDs. Threshold validation rejects null and non-object evaluation or policy documents. Focused diagnostics, comparison, manifest and schema gates pass.
- A bounded concurrency review found that the production-path manifest test rewrote the tracked manifest while `eval:all` ran. `eval:all` now accepts the `TEA_EVAL_MANIFEST_PATH` test hook, and the test writes an isolated temporary manifest. Concurrent `test:suite-manifest`, `test:eval-schemas`, `test:direction`, `test:eval-diagnostics`, and `test:compare-eval-runs` runs passed without changing tracked files. The final bounded reviewer agents reached their usage limit before a new pass; the coordinator rechecked the isolated path and the complete gate.
- CodeRabbit found that authored documents were checked only for object shape. `checkEvaluateAuthored` now validates `evaluation.json` against TeA's runtime schema and `scoring-policy.json` against the installed eval-quality schema, with malformed-object regressions covered. Focused suite-manifest, eval-schemas and ESLint checks passed; the CodeRabbit review has no remaining actionable findings.

## Verification

**Commands:** `npm test`; `npm run test:release-metadata`; engine export check from Build Rules; focused suite, schema and corpus gates.

- `npm run docs:validate-links`, `npm run docs:build`, `npm run test:release-metadata`, and the engine export check passed.
- `npm run test:direction` and `npm run test:suite-manifest` passed after the fixture import correction.
- `npm run test:compare-eval-runs`, `npm run test:eval-diagnostics`, and `npm run test:eval-schemas` passed after the final review fixes.
- The first complete traversal of `npm test` reached `test:direction` and failed on that import. A fresh complete run on the corrected tree completed through lint, Markdownlint and Prettier with exit code 0 (`/tmp/evaluate115b-npm-test-final2.log`).
- The isolated-manifest correction passed `npm run test:suite-manifest` and the concurrent focused run, with no tracked manifest mutation.
- The CodeRabbit schema-validation correction passed `npm run test:suite-manifest`, `npm run test:eval-schemas`, `npm run lint`, syntax checks and Prettier.
