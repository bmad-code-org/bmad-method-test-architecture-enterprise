---
title: 'Hold out probes and calibrate rubric judges'
type: 'feature'
created: '2026-09-26'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0613452d2e4b8c4d19d646cf295fd0abdc5ce401'
context:
  - '_bmad-output/planning-artifacts/evaluate/epics.md'
  - '_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="The owner delegated each Evaluate relay story through merge in RELAY.md">

## Intent

**Problem:** An evaluation can tune its authoring loop to every probe it sees, and rubric scores can count before the judge proves it understands the adopter's anchors.

**Approach:** Split development and held-out probes at execution, project scored evidence into safe partition views, and gate rubric trials on labelled calibration items judged through the scorer's own path.

## Boundaries & Constraints

**Always:** Validate every held-out ID against committed probes, preserve a development probe for each affected behavior, and exclude clean controls from held-out. Copy reduced outcomes from eval-quality evidence artifacts without recomputing them. Keep held-out details out of `gap-view.json`. Run calibration before trial records, with labels withheld from the judge. Include the calibration file digest in `EvaluatorConfiguration.decodingParameters` so it changes the scoring version. Add revert-sensitive tests, `npm test`, an Unreleased changelog entry, and sprint status.

**Never:** Compute a second verdict or strength rate in TeA. Add fields to strict `judgeConfiguration`. Send `expectedLevel` to a judge. Change eval-quality for this story.

## I/O & Edge-Case Matrix

| Scenario                   | Input / State                                           | Expected Output / Behavior                                         | Error Handling                                                        |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Invalid held-out selection | Unknown ID, clean control, or sole probe for a behavior | `check` exits 10                                                   | Names the invalid selection                                           |
| Partition selection        | `development`, `held-out`, or omitted                   | Runs the selected set or both                                      | Rejects unknown partition                                             |
| Scored held-out probe      | Evidence artifact and authored probe details            | Partition outcome equals evidence; gap view has ID, class, outcome | No held-out rationale, defect summary, data binding, or mutation text |
| Invalid calibration        | Missing criterion item, anchor level, or threshold      | `check` exits 10                                                   | Names missing coverage                                                |
| Judge disagreement         | One disagreement in two items, minimum agreement 0.9    | `run` exits 11 before a trial record                               | Calibration report shows 0.5 and level distance                       |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/schemas/evaluation.schema.json` and `check.js`: Closed manifest schema and committed probe validation. Extend for partition and calibration declarations.
- `cli/evaluate.js`, `cli/lib/evaluate/run.js`, and `preflight.js`: Run option, qualified probe selection, trial loop, and judge entry points. Filter before execution and calibrate before the first trial.
- `cli/lib/evaluate/judge.js`, `command-evaluator.js`, `sealed-brief-agent.js`, and `judgment-rows.js`: Existing scorer paths and imported rubric scores. Reuse each kind's production route.
- `cli/lib/evaluate/evaluators.js` and `records.js`: `configurationFields` supplies decoding parameters; record schema and digest come from eval-quality.
- `cli/lib/evaluate/score.js`: Each `scores/<scoreInvocationId>/<probeId>/evidence-artifact.json` contains `reducedProbeOutcomes`. Project partitions from these artifacts.
- `test/test-evaluate-check.js`, `test/test-evaluate-arms.js`, and `test/fixtures/evaluate/stub-judge.js`: Existing rubric and probe fixtures. Add focused partition and calibration suites.

## Tasks & Acceptance

**Execution:**

- [x] `evaluation.schema.json`, `check.js`, `run.js`, and `cli/evaluate.js`: Validate and execute held-out selection, including the default both-partition run.
- [x] `score.js` and new partition helper: Write evidence-derived `partitions.json` and redacted `gap-view.json` under the run invocation.
- [x] New calibration helper, `run.js`, and `evaluators.js`: Validate labelled coverage, judge every item through its scorer path before trials, gate low agreement, and bind the calibration digest.
- [x] `test/test-evaluate-partitions.js`, `test/test-evaluate-calibration.js`, `package.json`, `CHANGELOG.md`, sprint status, and this record: Prove all acceptance cases and wire both suites into `npm test`.

**Acceptance Criteria:**

- Given invalid held-out IDs, clean controls, or a behavior without a development probe, when `check` runs, then each case exits 10.
- Given each partition option, when `run` executes, then only its selected probes run, while the default runs both.
- Given scored artifacts, when `score` writes partition and gap views, then every outcome is copied byte for byte and held-out details are absent.
- Given missing calibration coverage or threshold, when `check` runs, then it exits 10.
- Given a rubric scorer, when `run` starts, then the same judge path sees label-free items before any trial record; agreement below threshold exits 11.
- Given a changed calibration item, when configuration is built, then its digest and scoring version change and the schema remains valid.

## Implementation Notes

`run --partition` selects committed probe IDs before preflight and trial execution. `score` projects each probe's reduced outcome from its eval-quality evidence artifact into `partitions.json`. The development gap view retains authored probe detail; the held-out gap view contains only probe ID, class, and copied outcome.

Rubric runs read a regular in-folder `policy/judge-calibration.json` without following links or blocking on named pipes, validate coverage during `check`, and judge every labelled example through the configured scorer before writing a trial record. Calibration responses are projected through their criterion's evidence pointer, including structured JSON and non-stdout channels. A deterministic judge receives only the target criterion and resolved evidence. A sealed agent receives public evidence channels without the private operation ID. The scorer sees no label. Agreement below the declared minimum writes `judge-calibration.json` and exits 11. The calibration file's byte digest and minimum agreement enter `EvaluatorConfiguration.decodingParameters` and change the scoring version. `check` refuses rubric records until the harness can provide a verifiable calibration path.

Eight revert checks were exercised with one source mutation at a time. Each named suite failed and the source was restored byte for byte: removing held-out validation (`test:evaluate-check`), ignoring `--partition` (`test:evaluate-partitions`), exposing full held-out probes (`test:evaluate-partitions`), sourcing outcomes outside the evidence artifact (`test:evaluate-partitions`), removing calibration validation (`test:evaluate-check`), sending labels in calibration judge input (`test:evaluate-calibration`), bypassing the agreement gate (`test:evaluate-calibration`), and omitting the calibration digest (`test:evaluate-calibration`).

One `npm test` attempt stopped with `Abort trap: 6` as nested npm started `test:contract-sources`. The matching macOS crash report, `~/Library/Logs/DiagnosticReports/node-2026-09-26-171911.ips`, records PID 1638 and a faulting stack through Apple `_LSApplicationCheckIn`, Node `uv__set_process_title`, and `ProcessTitleSetter`. The contract generator did not start in that attempt. `npm run test:contract-sources` passed directly and in 20 consecutive npm invocations. A subsequent full `npm test` passed. This host-level npm startup abort remains a possible intermittent gate failure.

## Spec Change Log

## Review Triage Log

The first independent review round used blind, edge-case, and verification-gap lenses. Findings and dispositions:

| Finding                                                   | Disposition                                                                        | Evidence                                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Rubric `records` import bypasses calibration              | Fixed the unsafe acceptance path; Story 1.40 tracks verifiable harness calibration | `check` now refuses rubric `records`; the plan, test design, and sprint backlog contain Story 1.40                                             |
| Calibration marker lets a scorer recognize calibration    | Accepted behavior                                                                  | The scorer receives no `expectedLevel`; the same scorer path handles calibration and trials. Hiding the stage is outside Story 1.21's contract |
| Deterministic judge receives unrelated criterion evidence | Fixed                                                                              | Calibration now passes only the target criterion and response                                                                                  |
| `minimumAgreement: 0` is accepted                         | Intentional adopter policy                                                         | The adopter sets the threshold explicitly; the schema limits it to the closed interval from 0 to 1                                             |
| Threshold does not affect configuration digest            | Fixed                                                                              | `tea.judgeCalibrationMinimumAgreement` joins the calibration digest in `decodingParameters`                                                    |
| Report lacks response and prompt text                     | Within the stated report contract                                                  | The report contains each label, actual level, distance, criterion agreement, and largest distance; the scorer input is tested separately       |
| A probe without an evidence artifact has `outcome: null`  | Intentional absence marker                                                         | `scoreInvocationId` points to scoring diagnostics; no engine outcome exists to copy when scoring produced no artifact                          |
| Calibration path can be a link or named pipe              | Fixed                                                                              | The reader requires a regular file below a real `policy/` directory and opens without following links                                          |
| Command and sealed agent agreement failures lack cases    | Fixed                                                                              | Both kinds now have two-item 0.5 agreement cases under a 0.9 minimum                                                                           |
| Command scorer label secrecy lacks an assertion           | Fixed                                                                              | The command calibration fixture captures input and tests that `expectedLevel` is absent                                                        |
| Partition tests could miss a late filter                  | Fixed                                                                              | The tests assert launch and qualification evidence for the selected probes                                                                     |
| Public CLI reference omits the new behavior               | Fixed                                                                              | The reference now describes partition selection, evidence views, and rubric calibration                                                        |

The imported-records calibration gap has its own acceptance criteria and revert checks in Story 1.40. Story 1.41 tracks score-output confinement during concurrent directory changes. The macOS npm startup abort is recorded under Implementation Notes; its stack is outside TeA code and a direct contract-source run plus 20 repeated npm launches passed.

The final review rounds found these additional defects and dispositions:

| Finding                                                                                                        | Disposition | Evidence                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output views followed a symlink already placed at their destination                                            | Fixed       | Partition views are replaced through exclusive temporary files and rename; the regression plants both symlinks and checks the external sentinel.              |
| A calibration scorer could change the adopter tree before a low-agreement exit                                 | Fixed       | The run checks tree integrity after each scorer call and on every calibration exit; the regression reproduces a scorer write and expects integrity exit 12.   |
| Synthetic command observations missed normal record fields or put evidence in stdout regardless of its pointer | Fixed       | Calibration uses the shared total observation builder; stderr, nested JSON, JSON-root, call inputs, and scalar channels have focused checks.                  |
| Structured examples reached deterministic and sealed scorers with a different shape                            | Fixed       | All scorers use the projected observation; JSON-root tests inspect deterministic judge material and command and sealed agent input.                           |
| A full synthetic observation exposed a private operation ID to a sealed agent                                  | Fixed       | The sealed calibration prompt carries public evidence channels and a neutral observation ID; its captured prompt is checked for the absence of `operationId`. |
| Calibration response could parse but miss the criterion evidence pointer                                       | Fixed       | `check` resolves every projected example through eval-quality's published resolver and refuses unreachable evidence.                                          |
| A calibration file changed after `check` could leave missing items or undefined agreement                      | Fixed       | The calibration entry point validates its captured snapshot before scorer calls; a regression refuses missing and empty snapshots.                            |
| Review tests compared configuration inputs but missed the resulting scoring version and call order             | Fixed       | Tests compare `scoringVersion` after threshold and item edits and check every calibration launch precedes the first trial launch.                             |
| Malformed rubric and held-out probe inputs crashed `check` after schema findings                               | Fixed       | End-to-end cases put a null criterion and an object-shaped `defects` field beside valid calibration and held-out declarations; both now exit 10.              |
| A planted `scores` symlink redirected score artifacts into the adopter repository                              | Fixed       | `score` refuses the link before an engine call; an end-to-end case checks exit 12 and unchanged adopter git status.                                           |
| Concurrent score-directory replacement could still redirect an engine output                                   | Story 1.41  | The new story requires held score-output identities, a concurrent-swap fixture, truthful stage argv and direct re-score proof.                                |
| Epic story count and CLI rule table were stale                                                                 | Fixed       | The plan names 46 stories and the reference names 26 rules with the new calibration and held-out checks.                                                      |

## Verification

**Commands:**

- `npm run test:evaluate-partitions` and `npm run test:evaluate-calibration`: Passed.
- `npm run test:evaluate-evaluators`, `npm run test:evaluate-tool-use`, `npm run test:evaluate-promptfoo`, `npm run test:evaluate-mcp`, `npm run test:evaluate-api`, and `npm run test:evaluate-workflow`: Passed individually after the calibration prompt fix.
- `npm test`: Passed all 93 chained checks on the final code and documentation set.
- `npm run test:release-metadata`: Passed.
- `npm run test:doc-counts`, `npm run format:check`, and `git diff --check`: Passed.
- `npm run docs:validate-links`, `npm run docs:build`, and `npm run lint:md`: Passed after the reference and plan amendments.
- eval-quality export check (`evaluateTarget`): Passed.
