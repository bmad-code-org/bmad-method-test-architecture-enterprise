---
title: 'Story 1.94: Score each stored workflow in the CI probe leg'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 2
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
The trace, nfr and test-design builders also take `{ refusedSets }`, a `Set` they add the identifier of every set whose stored run the harness refused to score, so a check can tell a violation a scorer produced from one the refusal produced.
`test/test-probe-corpus.js` keeps one list of the suites that score a stored run (`STORED_RUN_SUITES`: trace, nfr, test-design, ci) and uses the exposed properties in five checks:

- `storedRunExposureProblems` fails a suite of that list whose builder exposes no `storedRunSpecs` or `storedRunLegs`, and a suite outside it that exposes them.
  Every other check reads those properties, so a builder reverted to its `985143f7` body (a constant `held`, neither property) or renamed so no check finds it used to pass all of them.
  `storedRunProblems` runs its `KNOWN_UNHELD` "holds now" check whatever the builder exposes, so that revert also fails there.
- `storedRunProblems` fails with `oracle O-nnn no longer holds on the stored correct run (<kind> <element> on <set>)` for every oracle that is not held.
- `wrongRunProblems` holds every set and every oracle to a wrong stored run (the revert check: a constant `held` passes every correct row and fails this).
  Leg i reads leg (i + 1) mod n, so every set reads a run other than its own, and a set follows the run only when an oracle that holds on its own run (the identity record, which leaves out the two oracles of `KNOWN_UNHELD` because the correct run already violates them) turns `violated` in the rotated one.
  Each leg also reads every other stored case of its suite, one at a time, and every oracle that holds on its own run must be violated by a scorer under at least one wrong read, unless `WRONG_RUN_CANNOT_FAIL` lists it with the reason (the three ci `run-measured` oracles).
  A read the harness refused to score adds only the `run-measured` oracles to that set: the refusal answers every other oracle of the set `false` without calling its scorer, so counting those would hide a scorer reverted to a constant `held` behind the refusal (round 2, finding 2).
  A projection with its `design` key dropped (the `projectionOf` option of the test-design builder) is the wrong read that fails the projection-coherence oracles, since the runner derives its projection from the document and no stored case breaks it.
  `REFUSED_READS` reads one run the harness refuses to score through every leg: trace `seeded-summary-schema-0-2` for the seeded set and `clean-matrix-without-sections` for the clean set, nfr `gapped-report-without-sections` and `gapped-gate-without-assessment-sections`, test-design `seeded-register-absent` for both.
  Each read must be reported on `refusedSets` and every oracle of the set must be violated; a leg without an entry fails, because the refused read is the only thing that fails the clean set's `run-measured` oracle.
  Test-design's projection-coherence oracles measure a refused run, so the read is repeated with the projection's `design` key dropped and they must be violated.
  The check returns a problem when two sets share a stored case or when only one leg exists.
- `unknownOracleProblems` asks each builder that measures a stored run (the four above and test-review) for a record against a contract carrying one extra oracle id (`O-999`) and expects the throw (`does not specify` for the four, `measures nothing for` for test-review).
- `testReviewVerdictProblems` reads the test-review record through a verdict that exits 0 (`approved-with-no-findings`), through the stored verdict with one field dropped at a time (the `verdictOf` option: each of `findings`, `violations`, `qualityScore` and `recommendation`, and each of `row`, `file`, `line` and `severity` on its first finding), and through the stored refused verdict `verdict-without-findings`.
  The payload oracle must be violated by every drop.
  The exit-code oracle must stay held for every drop but `recommendation`, which the exit code is read from (a verdict without one exits 0, so the exit-code oracle follows; round 2 brief item 3 expected it held and the builder's own mapping says otherwise).
  The refused verdict must violate every oracle of the contract.

### The finding the check made

On the unchanged tree `storedRunProblems` reported two oracles of the evaluation-plan project, `O-031` (`command-evaluation-install`) and `O-032` (`command-evaluation-ci-pr`).
The real capture (`test/replay/ci/evaluation-plan-live-capture`, byte for byte, with a recorded sha256) quotes the folder names for the shell: `npm install --prefix 'evals'` and `npm exec --prefix 'evals' -- tea-evaluate ci --evaluation 'evals/grader' --tier pr`.
The harness's structural check accepts it (`expected.json` records ten of ten elements).
The oracles search for the literals `npm install --prefix evals` and `tea-evaluate ci --evaluation evals/grader --tier pr`, so the correct run fails both, which makes the AC's premise ("every stored correct workflow satisfies its oracles") false for two oracles.
The baseline records no oracle disposition, so it never showed it, and the engine already knew: on `origin/main` the clean control P-004 passes pre-flight and scores `CONCERNS` with exit 0, and the engine resolved O-031 and O-032 to false with corroboration `disagrees` (disposition `held`, check false).
The baseline missed it because `probeSummary` keeps only the `probeId`, `state`, `severity` and `trialIndex` of each outcome (`comparableResultOf`), so no disposition or corroboration reaches `expected-strength.json`.

The fix is a quote-robust `contractToken` in `test/fixtures/ci-eval/ground-truth.json` (`npm install --prefix`, `tea-evaluate ci --evaluation`).
I tried it: `ci.contract.json` and `ci.probes.json` regenerate, and the probes' `implementationDigest`, `commitDigest` and cited `ground-truth.json` digest move, so the ci `corpusDigest` in `expected-strength.json` moves.
The brief holds that file byte for byte, so the fix is reverted here and filed as Story 1.122 (see Undone).
`KNOWN_UNHELD` in `test/test-probe-corpus.js` lists exactly those two oracles, and the check fails when either holds, so the list ends in the change that fixes the defect.
Epics.md and the test design carry a dated amendment of the criterion.

## What changed

- **`test/lib/probe-scoring.js`.** `scoredDispositions`, `identity`, the `storedCase` option, the `refusedSets` option of the trace, nfr and test-design builders, `storedRunSpecs` and `storedRunLegs` on the trace, nfr, test-design and ci builders; the `projectionOf` option on the test-design builder; on the test-review builder the `storedCase` and `verdictOf` options, `verdictPayloadPresent`, `verdictOracleIds` and the derivation of its payload and exit-code oracles (the fallback for an oracle the builder measures nothing for now throws); the header paragraph says which builders score a stored run.
- **`test/test-probe-corpus.js`.** `KNOWN_UNHELD`, `STORED_RUN_SUITES`, `WRONG_RUN_CANNOT_FAIL`, `REFUSED_READS`, `storedRunExposureProblems`, `storedRunProblems`, `wrongRunProblems`, `unknownOracleProblems`, `testReviewVerdictProblems` and the `readUnder` helper, called per suite.
- **`test/probes/README.md`.** A section on what a stored run's dispositions say, the wrong-run checks, what the baseline does and does not see of a wrong row, the 11 and 23 stored deviations, and the two known oracles.
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

| Criterion                                                                             | What fails on a revert                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each disposition comes from the paired scorer over the workflow the leg reads         | Constant `held` on any set (the first set of each suite, M1 to M4), on any oracle kind of a scored run (every kind of trace, nfr, test-design and ci, R1 to R28) or everywhere (M5) fails `wrongRunProblems`; a builder swapped to its `985143f7` body or renamed away from `storedRunSpecs` fails `storedRunExposureProblems` (R29 to R36) |
| A wrong `CI_CORRECT_RUNS` row fails with the oracle that no longer holds              | The same revert; a builder that ignores `storedCase` (M6, M13 to M16) fails `wrongRunProblems`; a builder that scores every set over the first workflow fails `storedRunProblems`; a row pointed at a deviation the substring vocabulary can state names the oracle (11 of 34)                                                              |
| A refused run answers `false` for every oracle of its set                             | Each of the three refused branches returning `undefined` or `held`, on one leg or both, fails the refused read (M7 to M9, R50 to R54); a refusal not reported on `refusedSets` fails it too (R55, R56); so do the test-review refused branch (R48) and the test-design projection-coherence branch of a refused run (R49)                   |
| An oracle the generator does not specify is refused                                   | The unknown id resolving `held` fails `unknownOracleProblems` for the four suites (M10) and for test-review (R47)                                                                                                                                                                                                                           |
| Two sets that share a stored case, or one set alone, are refused                      | `storedRunLegs` repeating one case (M11), or holding one leg (M11b), fails `wrongRunProblems`                                                                                                                                                                                                                                               |
| `expected-strength.json` is unchanged                                                 | `test:probe-corpus` over the committed file; `KNOWN_UNHELD` removed fails with the two oracles (M24)                                                                                                                                                                                                                                        |
| Other suites' builders read a stored run through a scorer, or the record says why not | The table above; the test-review payload and exit-code oracles fail `testReviewVerdictProblems` when fixed at `held` (M25 to M27), and the payload predicate reduced by any field fails it (R37 to R46; R39 is equivalent, see below)                                                                                                       |

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

What the baseline sees of a wrong row (round 2, `mut-1.94-fix2-run1`, one `node test/test-probe-corpus.js` per row, looking for `expected-strength.json is out of date`): the full and minimal defect probes carry their project's run, so a row of those projects that changes the run those probes read moves the baseline as well.
Six of the 11 caught deviation rows move it (`full-not-a-workflow`, `full-permissions-missing`, `full-permissions-widened`, `full-trigger-schedule-missing`, `full-triggers-unscoped`, `minimal-template-copied`), and so do the full project at `minimal-correct-pipeline`, the minimal project at `full-correct-pipeline`, and either at `evaluation-plan-live-capture`.
It stays silent for the two evaluation-plan deviations that fail (`plan-not-detected`, `upload-wrong-path`), for `full-e2e-command-replaced`, `minimal-artifact-added` and `minimal-retry-action-added`, and for the evaluation-plan project at `minimal-correct-pipeline` or `full-correct-pipeline`: the evaluation-plan project's run is read by P-004 alone.
What the baseline never recorded is an oracle disposition, so it cannot say which oracle stopped holding for any of them.
The round 2 brief said only the evaluation-plan row is invisible to it; the five silent deviation rows above are the measured set.

Wrong stored runs: the trace seeded set at the clean run fails O-001 and the oracles after it, the nfr gapped bundle at the clean audit fails O-003 and O-004, and the test-design seeded set at the clean design fails O-002 to O-006.

Oracles no stored wrong run can fail, over every stored case of each suite: the three ci `run-measured` oracles (O-013, O-026 and O-035), whose scorer is a constant and which `WRONG_RUN_CANNOT_FAIL` lists, and the two test-design projection-coherence oracles (O-016 and O-017), which no stored run can fail and which fail only through the `projectionOf` read that drops the `design` key.
Round 1 counted every violation of a read the harness refused, which put every oracle of trace, nfr and test-design in `failable` through the `scored === null ? false` branch without calling its scorer (round 2, finding 2).
The oracles a scorer fails over a scored run are now the only ones counted, so the check names a constant `held` on trace `gate-decision`, the waiver, live and rejected-evidence kinds, nfr `threshold-unknown`, `overall-status`, `domain-block` and `domain-coverage`, and test-design `material-vocabulary` and `unsupported-vocabulary`.
Trace, nfr and test-design `run-measured` fail only under a refused read of their own set, which `REFUSED_READS` states for every leg.

Mutants of this story's own code, each failing a named check:

| ID   | Edit                                                                          | Failed                                                                                                  |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| M1   | constant `held` on the first trace set (`seeded-tenant-data-export`)          | `wrongRunProblems`: the set follows no run, O-007 holds under every wrong run, refused read             |
| M2   | constant `held` on the first nfr set (`gapped-harbor-billing-ledger`)         | `wrongRunProblems`: the set follows no run, O-004, refused read                                         |
| M3   | constant `held` on the first test-design set (`seeded-offline-order-capture`) | `wrongRunProblems`: the set follows no run, refused read                                                |
| M4   | constant `held` on the first ci set (`full-meridian-storefront`)              | `wrongRunProblems`: the set follows no run, O-004 holds under every wrong run                           |
| M5   | `scoredDispositions`: `held = true`                                           | `wrongRunProblems` in all four suites (48 lines)                                                        |
| M6   | ci evaluation-plan leg ignores `storedCase`                                   | `wrongRunProblems`: the set follows no run, O-028                                                       |
| M7   | trace refused run answers `undefined`                                         | the refused read: O-001 to O-015                                                                        |
| M8   | nfr refused run answers `undefined`                                           | the refused read: O-001 to O-005                                                                        |
| M9   | test-design refused run answers `undefined`                                   | the refused read: O-001 to O-010                                                                        |
| M10  | unknown oracle id resolves `held`                                             | `unknownOracleProblems` in all four suites                                                              |
| M11  | `storedRunLegs` of ci repeats one stored case                                 | `wrongRunProblems`: more than one set reads the stored case `full-correct-pipeline`                     |
| M11b | `storedRunLegs` of nfr holds one leg                                          | `wrongRunProblems`: one set is the only leg                                                             |
| M12  | ci `requested` oracles constant `held`                                        | `wrongRunProblems` and `KNOWN_UNHELD` (the two oracles hold)                                            |
| M13  | ci builder ignores `storedCase`                                               | `wrongRunProblems`: three sets follow no run                                                            |
| M14  | trace builder ignores `storedCase`                                            | `wrongRunProblems`                                                                                      |
| M15  | nfr builder ignores `storedCase`                                              | `wrongRunProblems`                                                                                      |
| M16  | test-design builder ignores `storedCase`                                      | `wrongRunProblems`                                                                                      |
| M17  | trace `gate-decision` constant `held`                                         | round 1: the refused read; round 2: `wrongRunProblems` names O-001 and O-016 (R1)                       |
| M18  | trace waiver and no-waiver oracles constant `held`                            | round 1: the refused read; round 2: `wrongRunProblems` names O-012 to O-014 and O-025 (R12 to R14, R17) |
| M19  | test-design `projection-coherence` constant `held`                            | `wrongRunProblems`: O-016 and O-017 hold under every wrong run (killed by the dropped-key read)         |
| M21  | nfr `run-measured` constant `held` on the gapped set                          | the refused read: O-005                                                                                 |
| M22  | test-design `material-vocabulary` constant `held`                             | `wrongRunProblems`                                                                                      |
| M23  | test-design `unsupported-vocabulary` constant `held`                          | `wrongRunProblems`                                                                                      |
| M24  | `KNOWN_UNHELD` emptied (the state before the finding was listed)              | `storedRunProblems` on O-031 and O-032                                                                  |
| M25  | test-review exit-code oracle constant `held`                                  | `testReviewVerdictProblems`: O-013 held when the record read `approved-with-no-findings`                |
| M26  | test-review payload oracle constant `held`                                    | `testReviewVerdictProblems`: O-012 held when the stored verdict carries no `qualityScore`               |
| M27  | test-review reverted to hold both oracles                                     | `testReviewVerdictProblems`                                                                             |
| M28  | rotation leaves the first leg reading its own run                             | `wrongRunProblems` in all four suites (the set follows no run)                                          |
| M20  | ci `run-measured` constant `held` (the three listed oracles)                  | **survives by design**: the scorer is a constant and `WRONG_RUN_CANNOT_FAIL` lists it                   |

Every mutant but M20 failed a named check.
M20 is the accepted case: the generator's scorer for ci `run-measured` is `() => true`, so no read of a stored workflow can fail it.

Round 2 mutants, each run in a scratch copy of the final tree (`mut-1.94-fix2-final`, driver `fix2-mutants.py`: `git archive HEAD` with the working-tree `test/test-probe-corpus.js` and `test/lib/probe-scoring.js` copied in, one `node test/test-probe-corpus.js` per edit).
R1 to R25 are the scored-run form of each kind: the builder's answer for that kind is `true` whenever the harness scored the run, and unchanged for a refused one.
Round 1's check passed these for trace `gate-decision`, the waiver, live and rejected-evidence kinds, nfr `threshold-unknown`, `overall-status`, `domain-block` and `domain-coverage`, and test-design `material-vocabulary` and `unsupported-vocabulary`, because a refused read violated every oracle through the branch that calls no scorer.

| ID  | Edit                                                                            | Failed                                                                                                                     |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| R1  | trace `gate-decision` constant `held` on scored runs                            | `wrongRunProblems`: O-001 and O-016 hold under every wrong stored run                                                      |
| R2  | trace `gate-criteria` constant `held` on scored runs                            | `wrongRunProblems`: O-002 and O-017                                                                                        |
| R3  | trace `coverage-inventory` constant `held` on scored runs                       | `wrongRunProblems`: O-003 and O-018                                                                                        |
| R4  | trace `priority-breakdown` constant `held` on scored runs                       | `wrongRunProblems`: O-004 and O-019                                                                                        |
| R5  | trace `risk-summary` constant `held` on scored runs                             | `wrongRunProblems`: O-005 and O-020                                                                                        |
| R6  | trace `criteria-covered-by-level` constant `held` on scored runs                | `wrongRunProblems`: O-006 and O-021                                                                                        |
| R7  | trace `collection-and-oracle` constant `held` on scored runs                    | `wrongRunProblems`: O-007 and O-022                                                                                        |
| R8  | trace `live-dispositions` constant `held` on scored runs                        | `wrongRunProblems`: O-008                                                                                                  |
| R9  | trace `live-blocker-4-LIVE-001` constant `held` on scored runs                  | `wrongRunProblems`: O-009                                                                                                  |
| R10 | trace `live-blocker-4-LIVE-002` constant `held` on scored runs                  | `wrongRunProblems`: O-010                                                                                                  |
| R11 | trace `rejected-evidence-AC-2` constant `held` on scored runs                   | `wrongRunProblems`: O-011                                                                                                  |
| R12 | trace `waiver-register` constant `held` on scored runs                          | `wrongRunProblems`: O-012                                                                                                  |
| R13 | trace `waiver-W-1` constant `held` on scored runs                               | `wrongRunProblems`: O-013                                                                                                  |
| R14 | trace `waiver-W-2` constant `held` on scored runs                               | `wrongRunProblems`: O-014                                                                                                  |
| R15 | trace `live-absent` constant `held` on scored runs                              | `wrongRunProblems`: O-023                                                                                                  |
| R16 | trace `rejected-evidence-none` constant `held` on scored runs                   | `wrongRunProblems`: O-024                                                                                                  |
| R17 | trace `no-waiver-register` constant `held` on scored runs                       | `wrongRunProblems`: O-025                                                                                                  |
| R18 | nfr `domain-coverage` constant `held` on scored runs                            | `wrongRunProblems`: O-001 and O-006                                                                                        |
| R19 | nfr `domain-block` constant `held` on scored runs                               | `wrongRunProblems`: O-002 and O-007                                                                                        |
| R20 | nfr `overall-status` constant `held` on scored runs                             | `wrongRunProblems`: O-003 and O-008                                                                                        |
| R21 | nfr `threshold-unknown` constant `held` on scored runs                          | `wrongRunProblems`: O-004 and O-009                                                                                        |
| R22 | test-design `material-vocabulary` constant `held` on scored runs                | `wrongRunProblems`: the seeded set follows no run, O-002 to O-006                                                          |
| R23 | test-design `unsupported-vocabulary` constant `held` on scored runs             | `wrongRunProblems`: the clean set follows no run, O-007 to O-010 and O-012 to O-015                                        |
| R24 | ci `requested` constant `held` on scored runs                                   | `wrongRunProblems` and `KNOWN_UNHELD` (the two oracles hold)                                                               |
| R25 | ci `forbidden` constant `held` on scored runs                                   | `wrongRunProblems`: the minimal set follows no run, O-018 to O-025                                                         |
| R26 | trace every kind but `gate-decision` constant `held` on scored runs             | `wrongRunProblems`: 22 lines, O-002 onward                                                                                 |
| R27 | nfr every kind but `domain-coverage` constant `held` on scored runs             | `wrongRunProblems`: both sets follow no run, 8 lines                                                                       |
| R28 | test-design `projection-coherence` constant `held` on scored runs               | `wrongRunProblems`: O-016 and O-017 hold under every wrong stored run                                                      |
| R29 | `ciEvidence` swapped to its `985143f7` body (constant `held`, neither property) | `storedRunProblems`: both `KNOWN_UNHELD` entries hold now; `storedRunExposureProblems`                                     |
| R30 | `traceEvidence` swapped to its `985143f7` body                                  | `storedRunExposureProblems` and `unknownOracleProblems`                                                                    |
| R31 | `testDesignEvidence` swapped to its `985143f7` body                             | `storedRunExposureProblems` and `unknownOracleProblems`                                                                    |
| R32 | `nfrEvidence` swapped to its `985143f7` body                                    | `storedRunExposureProblems` and `unknownOracleProblems`                                                                    |
| R33 | `traceEvidence` property renamed, constant `held`                               | `storedRunExposureProblems`                                                                                                |
| R34 | `nfrEvidence` property renamed, constant `held`                                 | `storedRunExposureProblems`                                                                                                |
| R35 | `testDesignEvidence` property renamed, constant `held`                          | `storedRunExposureProblems`                                                                                                |
| R36 | `ciEvidence` property renamed, constant `held`                                  | `storedRunProblems`: both `KNOWN_UNHELD` entries hold now; `storedRunExposureProblems`                                     |
| R37 | `verdictPayloadPresent` reduced to `qualityScore !== undefined`                 | `testReviewVerdictProblems`: 7 lines, O-012 held for every other drop                                                      |
| R38 | `verdictPayloadPresent` per-finding clause deleted                              | `testReviewVerdictProblems`: O-012 held when a finding lost its row, file, line or severity                                |
| R39 | `verdictPayloadPresent` stops reading top-level `findings`                      | **survives, equivalent**: `Array.isArray(verdict.findings)` already requires it                                            |
| R40 | `verdictPayloadPresent` stops reading top-level `violations`                    | `testReviewVerdictProblems`: O-012 held when the verdict lost `violations`                                                 |
| R41 | `verdictPayloadPresent` stops reading top-level `qualityScore`                  | `testReviewVerdictProblems`: O-012 held when the verdict lost `qualityScore`                                               |
| R42 | `verdictPayloadPresent` stops reading top-level `recommendation`                | `testReviewVerdictProblems`: O-012 held when the verdict lost `recommendation`                                             |
| R43 | `verdictPayloadPresent` stops reading finding `row`                             | `testReviewVerdictProblems`: O-012 held when the first finding lost its `row`                                              |
| R44 | `verdictPayloadPresent` stops reading finding `file`                            | `testReviewVerdictProblems`: O-012 held when the first finding lost its `file`                                             |
| R45 | `verdictPayloadPresent` stops reading finding `line`                            | `testReviewVerdictProblems`: O-012 held when the first finding lost its `line`                                             |
| R46 | `verdictPayloadPresent` stops reading finding `severity`                        | `testReviewVerdictProblems`: O-012 held when the first finding lost its `severity`                                         |
| R47 | test-review unknown oracle `throw` replaced by `return true`                    | `unknownOracleProblems`: test-review scored an unknown oracle without an error                                             |
| R48 | test-review refused branch dropped (`measured === null`)                        | `testReviewVerdictProblems`: reading `verdict-without-findings` threw on the missing measurement                           |
| R49 | test-design refused branch: projection-coherence answers `true`                 | `wrongRunProblems`: O-016 and O-017 held when the set read `seeded-register-absent` with its projection's `design` dropped |
| R50 | test-design refused branch answers `held` for every oracle                      | `wrongRunProblems`: run-measured O-001 and O-011 hold under every wrong run, 19 lines                                      |
| R51 | trace refused branch answers `held`                                             | `wrongRunProblems`: run-measured O-015 and O-026, 28 lines                                                                 |
| R52 | nfr refused branch answers `held`                                               | `wrongRunProblems`: run-measured O-005 and O-010, 12 lines                                                                 |
| R53 | trace refused branch answers `held` on the clean set only                       | `wrongRunProblems`: run-measured O-026 and the refused read of `clean-matrix-without-sections`                             |
| R54 | nfr refused branch answers `held` on the clean set only                         | `wrongRunProblems`: run-measured O-010 and the refused read of `gapped-gate-without-assessment-sections`                   |
| R55 | trace refusal not added to `refusedSets`                                        | `wrongRunProblems`: the harness did not refuse `seeded-summary-schema-0-2`                                                 |
| R56 | test-design refusal not added to `refusedSets`                                  | `wrongRunProblems`: the harness did not refuse `seeded-register-absent`                                                    |

55 of the 56 failed a named check.
R39 is equivalent: `verdictPayloadPresent` also requires `Array.isArray(verdict.findings)`, which already fails a verdict without `findings`, so the top-level `findings` key in the list is redundant and no behavior differs.

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

## Round 2 findings

Three Opus reviewers (blind, edge, verification gap) verified each finding against the code; each was verified again here.

| #   | Finding                                                                                          | Verdict | Reason and fix                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The revert checks run only when a builder opts in                                                | Fixed   | Confirmed: the four builders at their `985143f7` bodies, or with the two properties renamed, passed `test:probe-corpus`. `STORED_RUN_SUITES` is the one list; `storedRunExposureProblems` fails a listed suite without `storedRunSpecs` or `storedRunLegs`; the `KNOWN_UNHELD` check runs whatever the builder exposes. R29 to R36                                                                  |
| 2   | The per-oracle check is vacuous for trace, nfr and test-design                                   | Fixed   | Confirmed: a refused read violated every oracle without calling a scorer, so every oracle counted as failable. The builders report `refusedSets`, a refused read adds only `run-measured` oracles, and `REFUSED_READS` now asserts a refused read for every leg. R1 to R28 and R50 to R56                                                                                                           |
| 3   | test-review O-012 reads more fields than `testReviewVerdictProblems` drops                       | Fixed   | Confirmed: reducing the predicate to `qualityScore` or deleting the per-finding clause survived. One read per field now, eight in all. The exit-code oracle follows a dropped `recommendation` (the exit code maps from it), so that one drop expects O-013 violated; the brief expected it held. R37 to R46                                                                                        |
| 4   | The test-review "measures nothing for" throw is exercised by nothing                             | Fixed   | Confirmed: `unknownOracleProblems` skipped builders without `storedRunSpecs`. It now runs for any builder that measures a stored run and accepts either message. R47                                                                                                                                                                                                                                |
| 5   | The test-review refused branch is unexercised                                                    | Fixed   | Confirmed: dropping `measured === null` survived. The clean control reads `verdict-without-findings` and every oracle must be violated, and a throw on the missing measurement is reported by name. R48                                                                                                                                                                                             |
| 6   | The test-design refused branch of projection-coherence is unexercised                            | Fixed   | Confirmed: that branch answering `true` survived. `REFUSED_READS` repeats each refused read with the projection's `design` dropped and requires the measured kinds violated (O-016 and O-017). R49                                                                                                                                                                                                  |
| 7   | Run each new check against mutants and record the rows                                           | Done    | The Round 2 mutants table: 56 edits, 55 failed a named check, one equivalent.                                                                                                                                                                                                                                                                                                                       |
| 8   | Story 1.122's patterns are unanchored, and eval-quality's `regex` accepts only anchored patterns | Fixed   | Confirmed in `AnchoredPattern` and `regexRejection`. Epics, the test design and Undone state the anchored forms, which pass the capture, the double-quoted and unquoted forms, and fail `--tier nightly`, `--tier prod`, another prefix and an omitted command, through eval-quality's own `regexMatch` (nested-quantifier gate and step budget clear)                                              |
| 9   | The 1.94 amendment says only the three ci `run-measured` oracles cannot fail                     | Fixed   | Confirmed: no stored run fails O-016 and O-017; only the `projectionOf` read does. Reworded in `epics.md`, here (Decision, Observations) and in the test design                                                                                                                                                                                                                                     |
| 10  | The baseline-blindness claims are overstated                                                     | Fixed   | Confirmed and measured: six of the 11 caught deviation rows and the cross-project rows between full and minimal move `expected-strength.json`. The brief said only the evaluation-plan row is invisible; the measurement also finds `full-e2e-command-replaced`, `minimal-artifact-added` and `minimal-retry-action-added` silent. Scoped in the README, CHANGELOG, `test-probe-corpus.js` and here |
| 11  | Records match the final code                                                                     | Done    | CHANGELOG, README, this record's tables and the test design updated                                                                                                                                                                                                                                                                                                                                 |
| -   | Scorer drift to `undefined`                                                                      | Skipped | Skipped by the coordinator: `test:contract-oracles` kills it                                                                                                                                                                                                                                                                                                                                        |
| -   | The round 1 brief's 33, 13 and 20 counts                                                         | Skipped | Skipped by the coordinator: outside the PR, and the records' 34, 11 and 23 are right                                                                                                                                                                                                                                                                                                                |

## Verification

Gates run in this checkout on the final tree (round 2), every one with exit 0: `npm run test:probe-corpus`, `test:probe-sources`, `test:contract-sources`, `test:contract-oracles`, `test:probe-targets`, `test:test-review-qualification`, `test:trace-qualification`, `test:nfr-qualification`, `test:ci-qualification`, `test:test-design-qualification`, `test:eval-replay`, `test:evaluate-boundaries`, `test:doc-counts`, `test:doc-claims`, `test:changelog`, `test:bmad-output-gated`, `npm run format:check`, `npm run lint:md`, `npm run docs:validate-links`, `npx eslint . --max-warnings 0` and `node tools/generate-probes.js --check`.
The Round 2 mutants table was run before the gates, in a scratch copy of the same two code files.
`test/probes/expected-strength.json` is byte-unchanged (`git status` lists no change under `test/probes` beyond `README.md`).
`test:probe-targets` ran with no edit in the checkout.
The full `npm test` was not run; CI carries it.

## Undone

- **The two ci oracles the real capture fails.** The oracles of `command-evaluation-install` and `command-evaluation-ci-pr` have to survive shell quoting and still pin the folder and the tier. The `regex` operator accepts only fully anchored patterns (`AnchoredPattern`, `^` first and `$` last, or the contract fails to compile with `malformed-operator-expression`), so the story's `contractPattern`s take the form `tokenGroupExpression` already uses (`^[\s\S]*(?:<pattern>)[\s\S]*$`; the paired scorer tests the same source with `new RegExp(source)` and no flags): `^[\s\S]*npm install --prefix ['"]?evals['"]?(?:\s|$)[\s\S]*$` and `^[\s\S]*tea-evaluate ci --evaluation ['"]?evals/grader['"]? --tier ['"]?pr['"]?(?:\s|$)[\s\S]*$`. Both match the capture and its double-quoted and unquoted forms. A workflow running `--tier nightly` or `--tier prod` fails the second, one installing under another prefix fails the first, and one omitting either command fails its pattern. Regenerate `ci.contract.json` and `ci.probes.json`, regenerate `expected-strength.json` (the ci `corpusDigest` moves and nothing else), and empty `KNOWN_UNHELD`. Filed as Story 1.122.
- **Structural deviations the contract's vocabulary cannot reach.** 23 of the 34 stored constructed ci deviations pass through the substring oracles, such as the dropped marker comment. Filed as Story 1.123.
- **The test-review payload oracle over a scoreable verdict.** No stored case drops one field of a verdict the harness still scores, so the payload read is told apart only by the `verdictOf` option, one field at a time.
