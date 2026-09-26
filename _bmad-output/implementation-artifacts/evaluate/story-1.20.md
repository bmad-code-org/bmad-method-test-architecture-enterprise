---
title: 'Import a second framework’s results: promptfoo'
type: 'feature'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a265b521b5a8dd2b117115e5bf4dc8a57b8f45de'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="The owner delegated each Evaluate relay story through merge in RELAY.md">

## Intent

**Problem:** The import contract has been demonstrated with one external evaluation framework. An adopter needs proof that another framework can supply judgments without changing TeA’s runtime.

**Approach:** Add a deterministic command-line summarizer fixture whose clean and defective outputs are assessed by promptfoo assertions. Convert the framework’s results into the existing judgment-row contract and score both arms through eval-quality.

## Boundaries & Constraints

**Always:** The evaluator lives under the fixture’s `evaluator/` directory, cites the target’s observed stdout, emits mapped judgment rows, and uses promptfoo with telemetry, update checks, and caching disabled. The clean control reaches `passed-clean-control`; the mutated arm reaches `caught`. The installed package version, engine floor, license and emitted result shape are verified. Every acceptance criterion has a revert-sensitive check. `CHANGELOG.md` gains an Unreleased entry.

**Never:** Change `cli/` for promptfoo. Invoke a model-backed assertion or introduce credentials. Write framework output into the adopter’s tracked tree. Pin the promptfoo dependency to a fixed version.

## I/O & Edge-Case Matrix

| Scenario         | Input / State                                          | Expected Output / Behavior                                        | Error Handling                                             |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Multi-assertion  | One output with required and forbidden item assertions | One mapped row for each `gradingResult.componentResults` entry    | Each failed row cites the corresponding stdout observation |
| Single assertion | Result with `gradingResult` and no `componentResults`  | One mapped row from the top-level grade                           | Missing component list does not erase the judgment         |
| Error result     | Result without `gradingResult`                         | A mapped `fail` row citing the observation                        | The failure stays visible to scoring                       |
| Engine floor     | `.nvmrc` major below promptfoo’s declared floor        | Test reports the named Node requirement before spawning promptfoo | No framework process starts                                |

</frozen-after-approval>

## Code Map

- `test/fixtures/evaluate-tool-use-agent/` and `test/test-evaluate-tool-use.js`: Copy-workspace fixture and end-to-end pipeline patterns. Reuse their contract, probe, mutation, scoring-policy and evidence assertions.
- `cli/lib/evaluate/command-evaluator.js` and `judgment-rows.js`: Existing framework-neutral stdin and row contract. Reuse as-is.
- `_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md`: Promptfoo facts to reconcile with the installed release and observed JSONL output.
- `package.json`, `package-lock.json`, `.nvmrc`, `.lockfile-age-cache.json`: Floating devDependency, chained test script, Node floor and lockfile-age evidence.
- `tools/test-shard-weights.json`: Add a measured weight for the new suite if the shard gate or runtime balance requires it.
- `test/test-evaluate-boundaries.js`: Existing static guard for framework references in `cli/`.

## Tasks & Acceptance

**Execution:**

- [x] `test/fixtures/evaluate-promptfoo/`: Build the summarizer, evaluation artifacts, deterministic promptfoo assertion file, and evaluator command that writes temporary output and result files then emits mapped rows.
- [x] `test/test-evaluate-promptfoo.js`: Exercise real multi-assertion, single-assertion and error rows, Node floor refusal, and clean and mutated check/preflight/run/score evidence.
- [x] `package.json` and `package-lock.json`: Add `promptfoo` at `latest`, chain `test:evaluate-promptfoo` into `npm test`, and refresh lockfile-age evidence as required by the repository gates.
- [x] `_bmad-output/planning-artifacts/evaluate/evaluation-framework-facts.md` and `CHANGELOG.md`: Record the installed release and observed result shape, correct stale claims, and describe the adopter-facing proof.
- [x] `_bmad-output/implementation-artifacts/evaluate/sprint-status.yaml` and this record: Track completion, actual gates, framework version and result shape, exercised revert checks, and the empty `cli/` diff.

**Acceptance Criteria:**

- Given clean and mutated summarizer arms, when `check`, `preflight`, `run`, and `score` execute, then the clean control is `passed-clean-control` and the omitted-item mutation is `caught` with a finding quoting observed stdout.
- Given multi-assertion, single-assertion and error result shapes, when the fixture evaluator imports promptfoo JSONL, then it emits all mapped judgments, including a cited failure for an ungraded error.
- Given an insufficient `.nvmrc` Node major, when the suite checks the declared promptfoo engine range, then it names the unmet requirement before spawning promptfoo.
- Given the completed branch, when the release and quality gates run, then promptfoo remains a floating devDependency, supply-chain checks pass, the new suite runs through `npm test`, and `cli/` has no diff against the branch base.

## Implementation Notes

The Evaluate relay protocol supplies owner approval for individual story specs and authorizes build through merge. The coordinator generated this spec from Story 1.20 and its test design because the outcome file did not exist at takeover.

The installed dependency is `promptfoo@0.123.1` under the floating `latest` spec. Its package declares MIT, binary `promptfoo`, and `engines.node >=22.22.0`. The repository's `.nvmrc` selects Node 24. A real three-assertion JSONL row has `gradingResult.componentResults` with three entries. This release also emits a one-entry `componentResults` array for a single assertion and a failing `gradingResult` for a deterministic JavaScript assertion error. The test removes those fields from copies of real rows to exercise the importer fallback shapes. The evaluator writes `outputs.json` and `results.jsonl` in a system temporary directory, then removes that directory. The pipeline test confirms the adopter tree contains neither framework output file.

The direct suite maps every component assertion to its own oracle. A missing required item emits a failed `required-pears` row citing its stdout observation. The clean control's three trial votes are `passed-clean-control`; the mutated arm's three votes are `caught`, with each finding quoting the stdout it cites. An always-pass evaluator causes the mutated arm to remain uncaught and `score` to exit 2. The suite's low-major `.nvmrc` case reports the promptfoo Node requirement before any spawn.

The new dependency graph initially failed `test:licences` on 19 promptfoo transitives. Eight packages declare Artistic-2.0, Unlicense or BSD and now have package-specific tolerances tied to the floating promptfoo devDependency: `big-integer`, `binaryextensions`, `editions`, `fast-sha256`, `istextorbinary`, `textextensions`, `url-template` and `version-range`. The installed `sylvester` and `xmlhttprequest-ssl` packages omit licence metadata but carry MIT licence files, so both have evidence-backed undeclared readings. The remaining nine entries are the optional `@anthropic-ai/claude-agent-sdk` package and its eight platform binaries. Their published metadata says `SEE LICENSE`; the installed licence names Anthropic's legal agreements, so the SPDX-only gate cannot express their terms. `tools/check-licences.js` verifies that all nine are optional, belong to promptfoo's declared optional graph, retain the expected licence metadata and installed term text, then runs `eval-quality-gates licences` on a temporary lock view omitting only those entries. The committed lockfile remains complete. `test:supply-chain` confirms the scope and rejects a nonoptional SDK entry while preserving a seeded GPL entry. The licence gate then passes on the other 1,986 root entries and all 471 website entries.

Review fixes require promptfoo exit 0 or 100 before reading JSONL, a complete unique component set for multi-assertion grades, and matching observed stdout for graded rows. The single-assertion error fixture carries `required-pears` as promptfoo assertion metadata; an unidentifiable error now fails closed. Node preflight compares the full `.nvmrc` and running Node versions with the declared engine floor. The licence wrapper checks installed platform licence files and rejects any extra lockfile package matched by a promptfoo tolerance prefix. A seeded GPL package now passes through the wrapper in the supply-chain test.

Final review fixes also preserve every expected judgment when a multi-assertion result is ungraded, require a concrete error for ungraded rows and a boolean `pass` for graded assertions, verify any stdout present on an ungraded row, reject conflicting assertion identity and explicit empty component lists, and capture the evaluator's actual promptfoo child arguments and environment. The licence wrapper checks each approved tolerance and undeclared licence tuple, rejects same-prefix sidecars, binds the two undeclared readings to `sylvester@0.0.21` and `xmlhttprequest-ssl@2.1.2` with their exact registry tarballs, and verifies SHA-256 digests for their installed MIT licence files and the installed SDK terms. Missing or changed terms have named refusal tests.

Revert checks exercised: changing the importer to read only `componentResults` failed `test:evaluate-promptfoo` with the single-assertion and ungraded-error rows missing; restoring the fallback returned the suite to green. Temporarily pinning `devDependencies.promptfoo` to `0.123.1` failed the same suite with `promptfoo must use the latest spec`; restoring `latest` returned it to green. The suite's always-pass evaluator caused the seeded mutation to remain uncaught and `score` to exit 2. Its temporary low-major `.nvmrc` case named `promptfoo requires Node >=22.22.0` and confirmed the spawn callback was never called. `git diff origin/main --stat -- cli/` produced empty output, and `test:evaluate-boundaries` passed.

## Spec Change Log

## Review Triage Log

| Finding                                       | Verdict and route | Evidence                                                                                                                                                                                                                                      |
| --------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verification 1, wrapper seed                  | medium, patch     | The GPL seed ran the engine binary directly, so a wrapper that skipped the engine could pass. Exercise the seed through `test:licences`.                                                                                                      |
| Verification 2, forbidden key                 | medium, patch     | The failing shellfish case asserted outcome and citation but did not assert its key or `O-003` mapping.                                                                                                                                       |
| Blind 1, partial CLI result                   | medium, patch     | Promptfoo documents exit 100 for failed assertions and exit 1 for other errors. Reading a file after exit 1 can import partial results.                                                                                                       |
| Blind 2, absent output on a graded row        | medium, patch     | The current comparison skipped absent `response.output`; a graded row then lacked proof that it judged the cited stdout. Ungraded error rows retain their explicit fallback.                                                                  |
| Blind 3, missing components                   | medium, patch     | A partial `componentResults` array dropped required judgments without refusal. Check the expected unique assertion set.                                                                                                                       |
| Blind 4, arbitrary ungraded key               | medium, patch     | The hardcoded pears key could turn an unidentified framework error into an `O-002` defect. Require assertion metadata.                                                                                                                        |
| Blind 5, multi-assertion top-level fallback   | medium, patch     | This is the same missing-assertion defect as Blind 3: a top-level grade can cover only a verified single assertion.                                                                                                                           |
| Blind 6, Node floor false refusal             | low, patch        | `.nvmrc` can name 22.22.0, which satisfies `>=22.22.0`; comparing only majors rejects it.                                                                                                                                                     |
| Blind 7, runtime Node floor                   | medium, patch     | The suite spawned the current `process.execPath` after checking only `.nvmrc`; a mismatched older runtime could fail in promptfoo.                                                                                                            |
| Blind 8, no forbidden mutation                | false, reject     | Story 1.20 specifies an omitted-required-item mutation. Its direct forbidden-output case exercises the third assertion and its mapping; a second end-to-end mutation is outside this story's requested proof.                                 |
| Blind 9, licence prefix scope                 | medium, patch     | Promptfoo-scoped tolerances use prefix matching. The wrapper must reject any extra package matching one of the eight named prefixes.                                                                                                          |
| Blind 10, uninstalled platform terms          | false, reject     | The wrapper verifies the optional SDK graph, exact version and declared licence metadata. The installed package carries the checked legal terms; absent platform binaries are not installed on this runner. No incorrect term was identified. |
| Blind 11, shape-test CLI status               | low, patch        | The direct shape helper accepted a file without checking whether promptfoo completed. Assert the documented status for clean and intentional failures.                                                                                        |
| Edge 1, unrelated error mapped to pears       | medium, patch     | This is Blind 4's hardcoded-key defect. An error row must carry an identifiable assertion before it becomes a cited failure.                                                                                                                  |
| Edge 2, multi-assertion without components    | medium, patch     | This is Blind 3's incomplete-result defect. A top-level fallback is valid only for one assertion.                                                                                                                                             |
| Edge 3, partial result after failed execution | medium, patch     | This is Blind 1's exit-status defect. Exit 1 must not be scored from a partial JSONL file.                                                                                                                                                    |
| Edge 4, installed platform missing licence    | medium, patch     | The verifier used `existsSync` as a reason to skip evidence for an installed SDK with a missing `LICENSE.md`.                                                                                                                                 |
| Edge 5, Node requirement within one major     | low, patch        | This is Blind 6's version-comparison defect. Compare full selected and runtime versions.                                                                                                                                                      |

The first independent review round's accepted findings were fixed in the evaluator, focused suite, and licence wrapper. The final review ran four rounds. Round 1 found incomplete ungraded multi-assertion handling, conflicting assertion identities, empty component lists, missing stdout checks, licence tolerance scope drift, missing SDK file diagnostics, and a child-invocation verification gap. Round 2 found incomplete rows counted as failures and undeclared licence prefixes borrowing evidence from same-prefix packages. Round 3 found undeclared licence readings surviving a locked-version change. All accepted findings were fixed with focused refusal cases. Round 4 passed the importer, licence, and story compliance lenses; no finding was deferred.

## Verification

**Commands:**

- `npm run test:evaluate-promptfoo`: All 95 result-shape and pipeline checks pass after final review fixes.
- `npm test`: The final full chain exited 0 with 95 promptfoo checks, 60 supply-chain checks, the licence gate, lint, markdownlint and Prettier.
- `npm run test:release-metadata`: Dependency and release metadata remain valid.
- `npm run test:licences`, `npm run test:lockfile-age`, `npm run test:supply-chain`, `npm run test:evaluate-boundaries`: Dependency and framework boundaries pass; the final focused supply-chain suite passes 60 checks.
- `git diff origin/main --stat -- cli/`: Empty output.
