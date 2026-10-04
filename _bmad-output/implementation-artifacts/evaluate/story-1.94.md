---
title: 'Story 1.94: Score each stored workflow in the CI probe leg'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '985143f7dfb8af62dc203d57890f59ab83eb9b3a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md (Build Rules For Every Story; Story 1.94)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md (the Story 1.94 section)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md (AD-8, as amended by Story 1.99)'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/eval-quality-facts.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.99.md'
  - '{project-root}/AGENTS.md'
---

<!-- prettier-ignore-start -->

<frozen-after-approval reason="The Evaluate relay coordinator froze the approach">

## Intent

**Problem:** `ciEvidence` in `test/lib/probe-scoring.js` built the clean-control record of the `ci` contract's probes with every oracle disposition fixed at `held`, whatever workflow its leg read, so a `CI_CORRECT_RUNS` row that points a project at another project's workflow or at a constructed deviation passed `test:probe-corpus`.
The trace, nfr and test-design builders did the same over their stored runs.

**Approach:** Each oracle's disposition comes from the scorer `tools/generate-contracts.js` pairs with it, applied to the stored run the record carries for the oracle's own set or project.
`test:probe-corpus` fails with the oracle that no longer holds, and holds the derivation to the run it reads.

## Boundaries & Constraints

**Always:** Keep every probe verdict and exit code, and `test/probes/expected-strength.json` byte for byte.
Mutation experiments run in a scratch copy with a link to this checkout's `node_modules`.
Signal only processes this work started.

**Never:** Fix Story 1.121 (the three ci probes' preflight) here.
Run the full `npm test` (CI carries it).
Flip the Story 1.99 row or edit the lane lists in `epics.md`.

</frozen-after-approval>

<!-- prettier-ignore-end -->

## Decision

`scoredDispositions` in `test/lib/probe-scoring.js` pairs each oracle of the contract with its spec by identifier and asks `answerOf(spec)`.
`false` is `violated` with a note naming the kind, the element and the set; anything else is `held`.
The four builders supply `answerOf`:

| Builder       | Scorer applied                                                                 | Stored run read                                   |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| `ci`          | `spec.scorer(text)`, which is `workflowMentions` over the oracle's own literal | the workflow of the leg of the oracle's project   |
| `trace`       | `spec.scorer(scoreRun(set, summary, matrix, ...))`                             | the summary and matrix of the leg of the set      |
| `nfr`         | `spec.scorer(scoreRun(set, report))`                                           | the report of the leg of the bundle               |
| `test-design` | `spec.scorer(scoreRun(set, design, categories), projection, documentText)`     | the document and projection the observation holds |

A run the harness refuses to score answers `false` for every oracle of its set (test-design still asks the projection-coherence oracle, which reads the projection alone).
`undefined` (the harness skipping a trace waiver whose gate did not match) and a set the record carries no run of (a defect probe carries only the project it plants a defect on) stay `held`, as the record has always stated.

Each of the four builders takes `{ storedCase }`, a function from the case a leg names to the case its record reads, and states `storedRunSpecs` and `storedRunLegs`.
`test/test-probe-corpus.js` uses them in four checks:

- `storedRunProblems` fails with `oracle O-nnn no longer holds on the stored correct run (<kind> <element> on <set>)` for every oracle that is not held.
- `wrongRunProblems` holds every set and every oracle to a wrong stored run (the revert check: a constant `held` passes every correct row and fails this).
  Leg i reads leg (i + 1) mod n, so every set reads a run other than its own, and a set follows the run only when an oracle that holds on its own run (the identity record, which leaves out the two oracles of `KNOWN_UNHELD` because the correct run already violates them) turns `violated` in the rotated one.
  Each leg also reads every other stored case of its suite, one at a time, and every oracle that holds on its own run must be violated under at least one wrong read, unless `WRONG_RUN_CANNOT_FAIL` lists it with the reason (the three ci `run-measured` oracles).
  A projection with its `design` key dropped (the `projectionOf` option of the test-design builder) is the wrong read that fails the projection-coherence oracles, since the runner derives its projection from the document and no stored case breaks it.
  `REFUSED_READS` reads one run the harness refuses to score through each of trace (`seeded-summary-schema-0-2`), nfr (`gapped-report-without-sections`) and test-design (`seeded-register-absent`), and every oracle of that set must be violated (test-design's projection-coherence stays as it measures).
  The check returns a problem when two sets share a stored case or when only one leg exists.
- `unknownOracleProblems` asks each of the four builders for a record against a contract carrying one extra oracle id (`O-999`) and expects the throw.
- `testReviewVerdictProblems` reads the test-review record through a verdict that exits 0 (`approved-with-no-findings`) and through the stored verdict with its `qualityScore` dropped (the `verdictOf` option), and expects the exit-code oracle and the payload oracle to be violated.

### The finding the check made

On the unchanged tree `storedRunProblems` reported two oracles of the evaluation-plan project, `O-031` (`command-evaluation-install`) and `O-032` (`command-evaluation-ci-pr`).
The real capture (`test/replay/ci/evaluation-plan-live-capture`, byte for byte, with a recorded sha256) quotes the folder names for the shell: `npm install --prefix 'evals'` and `npm exec --prefix 'evals' -- tea-evaluate ci --evaluation 'evals/grader' --tier pr`.
The harness's structural check accepts it (`expected.json` records ten of ten elements).
The oracles search for the literals `npm install --prefix evals` and `tea-evaluate ci --evaluation evals/grader --tier pr`, so the correct run fails both, which makes the AC's premise ("every stored correct workflow satisfies its oracles") false for two oracles.
The baseline never showed it, and the engine already knew: on `origin/main` the clean control P-004 passes pre-flight and scores `CONCERNS` with exit 0, and the engine resolved O-031 and O-032 to false with corroboration `disagrees` (disposition `held`, check false).
The baseline missed it because `probeSummary` keeps only the `probeId`, `state`, `severity` and `trialIndex` of each outcome (`comparableResultOf`), so no disposition or corroboration reaches `expected-strength.json`.

The fix is a quote-robust `contractToken` in `test/fixtures/ci-eval/ground-truth.json` (`npm install --prefix`, `tea-evaluate ci --evaluation`).
I tried it: `ci.contract.json` and `ci.probes.json` regenerate, and the probes' `implementationDigest`, `commitDigest` and cited `ground-truth.json` digest move, so the ci `corpusDigest` in `expected-strength.json` moves.
The brief holds that file byte for byte, so the fix is reverted here and filed as Story 1.122 (see Undone).
`KNOWN_UNHELD` in `test/test-probe-corpus.js` lists exactly those two oracles, and the check fails when either holds, so the list ends in the change that fixes the defect.
Epics.md and the test design carry a dated amendment of the criterion.

## What changed

- **`test/lib/probe-scoring.js`.** `scoredDispositions`, `identity`, the `storedCase` option, `storedRunSpecs` and `storedRunLegs` on the trace, nfr, test-design and ci builders; the `projectionOf` option on the test-design builder; on the test-review builder the `storedCase` and `verdictOf` options, `verdictPayloadPresent`, `verdictOracleIds` and the derivation of its payload and exit-code oracles (the fallback for an oracle the builder measures nothing for now throws); the header paragraph says which builders score a stored run.
- **`test/test-probe-corpus.js`.** `KNOWN_UNHELD`, `WRONG_RUN_CANNOT_FAIL`, `REFUSED_READS`, `storedRunProblems`, `wrongRunProblems`, `unknownOracleProblems` and `testReviewVerdictProblems`, called per suite.
- **`test/probes/README.md`.** A section on what a stored run's dispositions say, the wrong-run checks, the 11 and 23 stored deviations, and the two known oracles.
- **Planning.** `epics.md` (amended criteria of Story 1.94, Story 1.122's text, new Story 1.123, the story count, the lane 1 list and the Dependencies table) and `test-design-epic-1.md` (the Story 1.94 table, Stories 1.122 and 1.123), `sprint-status.yaml` (`review` for 1.94, a `backlog` row and the lane 1 entries for 1.123), `CHANGELOG.md`.
- **Made by the coordinator in commit `a44ebfda`, not by this build.** The Story 1.99 flip (`sprint-status.yaml` row and `story-1.99.md` record to `done`) and the Story 1.122 filing (`epics.md` section, Dependencies row and lane entries, `test-design-epic-1.md` section, `sprint-status.yaml` row and lane entries).

## Builders that fix `held` over a stored run

Searched `test/lib/probe-scoring.js` for `held`:

| Builder            | Disposition before                                                                                     | Now                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trace`            | constant `held`                                                                                        | paired scorer over the stored summary and matrix                                                                                                                                                                                                                                                                                                                  |
| `test-design`      | constant `held`                                                                                        | paired scorer over the stored document                                                                                                                                                                                                                                                                                                                            |
| `nfr`              | constant `held`                                                                                        | paired scorer over the stored report                                                                                                                                                                                                                                                                                                                              |
| `ci`               | constant `held`                                                                                        | paired scorer over the stored workflow                                                                                                                                                                                                                                                                                                                            |
| `test-review`      | `held` from measured findings and missed rows; O-012 and O-013 constant `held` over the stored verdict | registry rows, scope and clean oracles unchanged; O-013 is `reviewBody(verdict).exitCode === 1` and O-012 is the fields the oracle's `existence` operands read (`findings`, `violations`, `qualityScore`, `recommendation`, and `row`, `file`, `line`, `severity` on every finding); every verdict, exit code and `expected-strength.json` byte stay as they were |
| fragment selection | `held` or `violated` from the findings of the constructed answer                                       | unchanged; it reads no stored run, it constructs the selection from `evals.json`                                                                                                                                                                                                                                                                                  |
| routing            | `held` unless the finding of the degenerate answer cites it                                            | unchanged; it reads no stored run, it constructs the correct answer with `correctRoutingAnswer`                                                                                                                                                                                                                                                                   |

Round 1 found that the test-review builder did fix `held` for two oracles over a stored verdict, which the first record called "unchanged".
Both are derived now, so the statement holds; `testReviewVerdictProblems` fails a revert of either.

## Acceptance criteria and their revert checks

| Criterion                                                                             | What fails on a revert                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Each disposition comes from the paired scorer over the workflow the leg reads         | Constant `held` on any set (the first set of each suite, M1 to M4), on any oracle kind (ci `requested`, trace `gate-decision` and the waiver oracles, nfr and test-design kinds, test-design `projection-coherence`) or everywhere (M5) fails `wrongRunProblems`               |
| A wrong `CI_CORRECT_RUNS` row fails with the oracle that no longer holds              | The same revert; a builder that ignores `storedCase` (M6, M13 to M16) fails `wrongRunProblems`; a builder that scores every set over the first workflow fails `storedRunProblems`; a row pointed at a deviation the substring vocabulary can state names the oracle (11 of 34) |
| A refused run answers `false` for every oracle of its set                             | Each of the three refused branches returning `undefined` fails the refused read (M7 to M9)                                                                                                                                                                                     |
| An oracle the generator does not specify is refused                                   | The unknown id resolving `held` fails `unknownOracleProblems` (M10)                                                                                                                                                                                                            |
| Two sets that share a stored case, or one set alone, are refused                      | `storedRunLegs` repeating one case (M11), or holding one leg (M11b), fails `wrongRunProblems`                                                                                                                                                                                  |
| `expected-strength.json` is unchanged                                                 | `test:probe-corpus` over the committed file; `KNOWN_UNHELD` removed fails with the two oracles (M24)                                                                                                                                                                           |
| Other suites' builders read a stored run through a scorer, or the record says why not | The table above; the test-review payload and exit-code oracles fail `testReviewVerdictProblems` when fixed at `held` (M25 to M27)                                                                                                                                              |

## Observations

Each ran in a scratch copy (`mut-1.94-wrongrow` in round 0, `mut-1.94-fix-rows` and `mut-1.94-fix-r1` in round 1: a `git archive HEAD` copy with this checkout's `node_modules` linked and the changed files copied in); the shared checkout was never mutated.

Wrong `CI_CORRECT_RUNS` rows, each failing `test:probe-corpus` with the oracles named:

| Row                                                                        | Failing oracles                                                                                                         |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| evaluation-plan project at `minimal-correct-pipeline`                      | O-033 `job-evaluation-pr`, O-034 `artifact-evaluation-runs` (P-004)                                                     |
| evaluation-plan project at `full-correct-pipeline`                         | O-033, O-034 (P-004)                                                                                                    |
| evaluation-plan project at `evaluation-plan-upload-wrong-path` (deviation) | O-034 `artifact-evaluation-runs` (P-004)                                                                                |
| minimal project at `minimal-template-copied` (deviation)                   | O-018, O-019, O-021 to O-024 `forbidden` (P-003, P-004)                                                                 |
| full project at `full-permissions-missing` (deviation)                     | O-004 `permission-contents-read` (P-001, P-002, P-004)                                                                  |
| evaluation-plan project at `evaluation-plan-marker-dropped` (deviation)    | none: the contract reads the workflow as one string and no oracle states the marker comment, which `checkElement` reads |

All 34 stored constructed ci deviations, each pointed at by the row of its own project (`mut-1.94-fix-rows`, one `node test/test-probe-corpus.js` per case):

- 11 fail with the oracle named: `evaluation-plan-plan-not-detected` (O-033, O-034), `evaluation-plan-upload-wrong-path` (O-034), `full-e2e-command-replaced` (O-007), `full-not-a-workflow` (O-001 to O-012), `full-permissions-missing` and `full-permissions-widened` (O-004), `full-trigger-schedule-missing` (O-003), `full-triggers-unscoped` (O-001 to O-003), `minimal-artifact-added` (O-021), `minimal-retry-action-added` (O-025) and `minimal-template-copied` (O-018, O-019, O-021 to O-024).
- 23 pass through with exit 0: the 13 `evaluation-plan` cases `bare-invocation`, `chained-commands`, `continue-on-error`, `evaluation-node-below-floor`, `job-continue-on-error`, `job-continue-on-error-expression`, `marker-dropped`, `one-step-per-check`, `root-install-in-job`, `step-continue-on-error-expression`, `upload-negated`, `upload-on-failure-only`, `upload-wrapped-condition`, and the 10 `full` cases `artifact-unconditional`, `burn-in-missing`, `injection-in-run`, `lint-needs-undefined`, `node-version-hardcoded`, `node-version-literal`, `node-version-step-output`, `test-step-suppressed`, `unparseable`, `workflow-dispatch-added`.
  `full-burn-in-missing` passes through because O-010's token `burn-in` matches the comment `# Weekly burn-in on Sundays`.
- The round 1 brief counted 20 of 33 and 13 caught; the recount over the 34 case directories under `test/replay/ci` (37 minus the three correct runs) is 23 and 11, each read through its own project's row.
  Pointing a minimal-project deviation at the full project's row, as the brief's `minimal-template-copied` example does, passes through (its oracles belong to another set).

Wrong stored runs: the trace seeded set at the clean run fails O-001 and the oracles after it, the nfr gapped bundle at the clean audit fails O-003 and O-004, and the test-design seeded set at the clean design fails O-002 to O-006.

Oracles a wrong run cannot fail, over every stored case of each suite (`fix-matrix2.js`): the three ci `run-measured` oracles (O-013, O-026 and O-035), whose scorer is a constant, and the two test-design projection-coherence oracles (O-016 and O-017), which fail only under a projection with a key dropped (the `projectionOf` read).
Trace and nfr `run-measured` and the trace waiver oracles fail under the refused reads.

Mutants of this story's own code, each failing a named check:

| ID   | Edit                                                                          | Failed                                                                                          |
| ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| M1   | constant `held` on the first trace set (`seeded-tenant-data-export`)          | `wrongRunProblems`: the set follows no run, O-007 holds under every wrong run, refused read     |
| M2   | constant `held` on the first nfr set (`gapped-harbor-billing-ledger`)         | `wrongRunProblems`: the set follows no run, O-004, refused read                                 |
| M3   | constant `held` on the first test-design set (`seeded-offline-order-capture`) | `wrongRunProblems`: the set follows no run, refused read                                        |
| M4   | constant `held` on the first ci set (`full-meridian-storefront`)              | `wrongRunProblems`: the set follows no run, O-004 holds under every wrong run                   |
| M5   | `scoredDispositions`: `held = true`                                           | `wrongRunProblems` in all four suites (48 lines)                                                |
| M6   | ci evaluation-plan leg ignores `storedCase`                                   | `wrongRunProblems`: the set follows no run, O-028                                               |
| M7   | trace refused run answers `undefined`                                         | the refused read: O-001 to O-015                                                                |
| M8   | nfr refused run answers `undefined`                                           | the refused read: O-001 to O-005                                                                |
| M9   | test-design refused run answers `undefined`                                   | the refused read: O-001 to O-010                                                                |
| M10  | unknown oracle id resolves `held`                                             | `unknownOracleProblems` in all four suites                                                      |
| M11  | `storedRunLegs` of ci repeats one stored case                                 | `wrongRunProblems`: more than one set reads the stored case `full-correct-pipeline`             |
| M11b | `storedRunLegs` of nfr holds one leg                                          | `wrongRunProblems`: one set is the only leg                                                     |
| M12  | ci `requested` oracles constant `held`                                        | `wrongRunProblems` and `KNOWN_UNHELD` (the two oracles hold)                                    |
| M13  | ci builder ignores `storedCase`                                               | `wrongRunProblems`: three sets follow no run                                                    |
| M14  | trace builder ignores `storedCase`                                            | `wrongRunProblems`                                                                              |
| M15  | nfr builder ignores `storedCase`                                              | `wrongRunProblems`                                                                              |
| M16  | test-design builder ignores `storedCase`                                      | `wrongRunProblems`                                                                              |
| M17  | trace `gate-decision` constant `held`                                         | the refused read: O-001                                                                         |
| M18  | trace waiver and no-waiver oracles constant `held`                            | the refused read: O-012 to O-014                                                                |
| M19  | test-design `projection-coherence` constant `held`                            | `wrongRunProblems`: O-016 and O-017 hold under every wrong run (killed by the dropped-key read) |
| M21  | nfr `run-measured` constant `held` on the gapped set                          | the refused read: O-005                                                                         |
| M22  | test-design `material-vocabulary` constant `held`                             | `wrongRunProblems`                                                                              |
| M23  | test-design `unsupported-vocabulary` constant `held`                          | `wrongRunProblems`                                                                              |
| M24  | `KNOWN_UNHELD` emptied (the state before the finding was listed)              | `storedRunProblems` on O-031 and O-032                                                          |
| M25  | test-review exit-code oracle constant `held`                                  | `testReviewVerdictProblems`: O-013 held when the record read `approved-with-no-findings`        |
| M26  | test-review payload oracle constant `held`                                    | `testReviewVerdictProblems`: O-012 held when the stored verdict carries no `qualityScore`       |
| M27  | test-review reverted to hold both oracles                                     | `testReviewVerdictProblems`                                                                     |
| M28  | rotation leaves the first leg reading its own run                             | `wrongRunProblems` in all four suites (the set follows no run)                                  |
| M20  | ci `run-measured` constant `held` (the three listed oracles)                  | **survives by design**: the scorer is a constant and `WRONG_RUN_CANNOT_FAIL` lists it           |

Every mutant but M20 failed a named check.
M20 is the accepted case: the generator's scorer for ci `run-measured` is `() => true`, so no read of a stored workflow can fail it.

## P-004's record and `disposition-contradicts-evidence`

Answer: yes, today.
With O-031 and O-032 `violated` and no defect finding, the clean control's record trips the engine rule `disposition-contradicts-evidence` (`violated` with no defect finding, in `core/score/outcome.js`), and the outcomes read `violated/false/disagrees`.
On `origin/main` they read `held/false/disagrees` (disposition `held` against a check that resolves false).
`disagrees` is diagnostic and moves no verdict, so P-004 keeps `CONCERNS` and exit 0, and `expected-strength.json` does not move.
After the token fix of Story 1.122 the checks resolve true, the dispositions return to `held` and the record carries no contradiction; that is an acceptance criterion of Story 1.122.

## Round 1 review findings

Three reviewers verified each finding against the code; each was verified again here.

| #   | Finding                                                                        | Disposition                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The first set was never read through another run                               | Fixed: rotation, leg i reads leg (i + 1) mod n                                                                                                                                                                          |
| 2   | The check is vacuous for the evaluation-plan set                               | Fixed: a set follows the run when an oracle that holds on its own run turns violated (identity record against the wrong record); `KNOWN_UNHELD` oracles are already violated in the identity record                     |
| 3   | The check is per set, not per oracle                                           | Fixed: every oracle must fail under a rotation or a single-leg read of any other stored case; unfailable oracles are listed with the reason (three ci `run-measured`)                                                   |
| 4   | The harness-refused branch is unexercised                                      | Fixed: `REFUSED_READS` through `storedCase`, one per suite, asserting every oracle of the set is violated (test-design's projection-coherence measures)                                                                 |
| 5   | Two sets sharing a stored case drop the target silently                        | Fixed: a problem when two sets share a case or one set is the only leg                                                                                                                                                  |
| 6   | The unknown-oracle throw is unexercised                                        | Fixed: `unknownOracleProblems`                                                                                                                                                                                          |
| 7   | test-review fixes `held` for O-012 and O-013                                   | Fixed by derivation: both read the stored verdict, `expected-strength.json` is byte-unchanged and every verdict and exit code is stable                                                                                 |
| 8   | New checks run against mutants                                                 | Done: the table above                                                                                                                                                                                                   |
| 9   | The false claim about the ci probes' pre-flight                                | Fixed in README, `test-probe-corpus.js`, CHANGELOG, this record and Story 1.122; the answer about `disposition-contradicts-evidence` is above and an acceptance criterion of Story 1.122                                |
| 10  | AC 2 over-claims for constructed deviations                                    | Amended with a dated note limited to the 11 deviations the vocabulary can state; the 23 are listed here and in the README; the structural check is Story 1.123                                                          |
| 11  | The test design said the other three builders read no stored run               | Reworded: test-review measures its stored verdicts, fragment selection and routing read none                                                                                                                            |
| 12  | This record lacked the coordinator's commit and the gates                      | Added above and below                                                                                                                                                                                                   |
| 13  | Story 1.122's tokens loosen the oracles                                        | Reworded: `contractToken` is one literal to the machinery (`containment`, `String.includes`), so the story adds a `contractPattern` rendered with the `regex` operator, pinning folder and tier; a `--tier nightly` row |
| 14  | The test design cited `test/probes/ci.contract.json` and listed one gate twice | Fixed: the contract is `test/contracts/ci.contract.json`; `test:probe-sources` is `node tools/generate-probes.js --check`, listed once                                                                                  |

## Verification

Gates run in this checkout on the final tree (round 1), every one with exit 0: `npm run test:probe-corpus`, `test:probe-sources`, `test:contract-sources`, `test:contract-oracles`, `test:probe-targets`, `test:test-review-qualification`, `test:trace-qualification`, `test:nfr-qualification`, `test:ci-qualification`, `test:test-design-qualification`, `test:eval-replay`, `test:evaluate-boundaries`, `test:doc-counts`, `test:doc-claims`, `test:changelog`, `test:bmad-output-gated`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`, `npx eslint . --max-warnings 0` and `node tools/generate-probes.js --check`.
`test/probes/expected-strength.json` is byte-unchanged (`git status` lists no change under `test/probes` beyond `README.md`).
`test:probe-targets` ran with no edit in the checkout.
The full `npm test` was not run; CI carries it.

## Undone

- **The two ci oracles the real capture fails.** The oracles of `command-evaluation-install` and `command-evaluation-ci-pr` have to survive shell quoting and still pin the folder and the tier. Regenerate `ci.contract.json` and `ci.probes.json`, regenerate `expected-strength.json` (the ci `corpusDigest` moves and nothing else), and empty `KNOWN_UNHELD`. Filed as Story 1.122.
- **Structural deviations the contract's vocabulary cannot reach.** 23 of the 34 stored constructed ci deviations pass through the substring oracles, such as the dropped marker comment. Filed as Story 1.123.
- **The test-review payload oracle over a refused verdict.** A verdict the harness refuses fails every oracle, so the payload read is told apart only by the `verdictOf` option that drops a field a scoreable verdict keeps; no stored case does.
