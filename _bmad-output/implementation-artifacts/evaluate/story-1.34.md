---
title: 'Story 1.34: Qualify a sealed-brief agent evaluator before its verdicts count'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'aa20cdc2'
---

<!-- markdownlint-disable MD033 -->

<frozen-after-approval reason="human-owned intent; do not modify unless human renegotiates">

## Intent

**Problem:** A sealed-brief agent chooses its own calls, so two runs over one seeded defect can differ (Story 1.17's live measurement: one run sent the standard input the defect signature selects on, the next sent none and eval-quality read the mutated set as Invalid). A run's verdict then depends on which calls the agent happened to make.

**Approach:** `evaluation.json` gains `evaluatorQualification` (`attempts`, `minimumAgreement`). Before the first trial, `run` runs the agent `attempts` times on the clean arm and on each mutated arm, scores each attempt with `eval-quality score`, writes `evaluator-qualification.json`, and exits 11 when an arm's agreement falls below `minimumAgreement`. `check` exits 10 under `evaluator` when a `sealed-brief-agent` declares none.

## Boundaries & Constraints

**Always:** Every outcome comes from the evidence artifact eval-quality wrote, copied byte for byte; the runtime computes no outcome (AD-1). An attempt eval-quality reads as Invalid has no artifact: it is recorded with the engine's exit code and its `invalid:` lines and counts as disagreeing. Agreement of an arm's probe is the fraction of attempts whose reduced state equals the expected state (clean arm: `passed-clean-control`; mutated arm: `caught`); an arm's agreement is the lowest agreement among its probes. Qualification attempts write nothing under `trials/` and use no `trial-` workspace label. Every private directory goes on the run's scratch list. Failure exits 11 as a `trial` stage stop with no trial-set record, following `judge-calibration.json`.

**Never:** Qualify historical or gameability arms (outside the story text). Fill `evaluatorQualification` in any template (the adopter sets it). Copy engine logic or compute a verdict in TeA. Add a second scoring path outside `runEngineStage`.

## I/O & Edge-Case Matrix

| Scenario                                 | Input / State                                            | Expected Output / Behavior                                                          | Error Handling                               |
| ---------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Steady agent                             | 2 attempts, all `passed-clean-control` / `caught`        | agreement 1.0 per arm, trials run                                                   | N/A                                          |
| Agent omits stdin on one of two attempts | mutated arm 1 caught + 1 Invalid, `minimumAgreement` 0.9 | agreement 0.5, exit 11, `evaluator-qualification.json` written, no trial-set record | message names the arm and points at the file |
| No declaration                           | sealed-brief-agent, no `evaluatorQualification`          | `check` exit 10, `[evaluator]` finding                                              | N/A                                          |
| Other kinds                              | deterministic, command, records with the block           | `check` exit 10 (the block is unused)                                               | N/A                                          |

</frozen-after-approval>

## Code Map

- `cli/lib/evaluate/run.js` -- `runTrialSets` (784): insert after calibration (about 973), before the trial loop (975); move the evaluator configuration and digest (1004-1027) above it. `runTrial` (417) hardcodes evidence path (420), workspace label (419) and `concludeWithRows` streams (627): parameterize. Record building (1066-1139) extract to a helper the qualification reuses.
- `cli/lib/evaluate/preflight.js:721-731` -- pattern for `runEngineStage('score', ...)` inside a run (`--out` to scratch, `writer.copyIn`, distinct `recordPath`).
- `cli/lib/evaluate/calibration.js:200-243` -- agreement shape and exit 11 stop to mirror.
- `cli/lib/evaluate/evaluators.js:312-326` -- `decodingParameters` carry the calibration minimum; add the qualification's.
- `cli/lib/evaluate/schemas/evaluation.schema.json` -- top-level `evaluatorQualification` beside `judgeCalibration` (174-182); artifact schema for `evaluator-qualification.json` under `schemas/`.
- `cli/lib/evaluate/check.js` -- `checkEvaluator` (1189): sealed-brief branch (1293) requires the block; other kinds refuse it (precedent 1193-1204).
- `test/test-evaluate-evaluators.js`, `test/test-evaluate-check.js`, and the `useStubAgent`/`useSealedBriefAgent` helpers in `test-evaluate-evaluators.js`, `test-evaluate-mcp.js`, `test-evaluate-api.js` (plant the block).
- `test/fixtures/evaluate/evaluators/stub-evaluator-agent.js` -- add an alternating-stdin mode with `--counter <file>` outside the project.
- `docs/reference/tea-evaluate-cli.md` (53, 106, 600, 722, 781-799, 886) and `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md` (17, 23, 36); `test/test-evaluate-guidance.js` (1660-1730).
- `CHANGELOG.md` `## [Unreleased]` `### Added`, newest first.

## Tasks & Acceptance

**Execution:**

- [x] `evaluation.schema.json`, `check.js` -- add and require `evaluatorQualification` (integer `attempts` at least 2, `minimumAgreement` 0..1) for the sealed-brief kind, refuse it elsewhere -- AC 2
- [x] `run.js` (+ helpers) -- qualification stage, `evaluator-qualification.json`, exit 11 -- AC 1, 3
- [x] `evaluators.js` -- record the block in `decodingParameters` -- scoring version moves with the policy
- [x] tests and stub agent -- stdin-omitting stub, agreement 0.5 vs 0.9 exit 11, check case, byte comparison, plant the block in existing helpers, fix shifted call counts
- [x] docs, evaluator reference, CHANGELOG, `epics.md`/`test-design-epic-1.md` amendments (Invalid attempts recorded with exit code; per-arm agreement is the lowest probe)

**Acceptance Criteria:**

- Given a stub agent that omits stdin on one attempt of two and `minimumAgreement` 0.9, when `run` runs, then the mutated arm's agreement is 0.5, `evaluator-qualification.json` exists and the run exits 11 with no trial-set record; dropping the stage lets the run seal Invalid records.
- Given a sealed-brief-agent without `evaluatorQualification`, when `check` runs, then exit 10 under `evaluator`.
- Given a passing qualification, when the file is read, then every outcome equals its evidence artifact byte for byte; writing an outcome the artifact does not hold fails.

## Verification

**Commands:**

- `npm test` -- expected: green (about 10 minutes)
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
- `git diff -- package.json package-lock.json` -- expected: empty

## Implementation Notes

- `cli/lib/evaluate/schemas/evaluation.schema.json` gains `evaluatorQualification` (`attempts` an integer of at least 2, `minimumAgreement` 0 to 1). `check.js` `checkEvaluator` requires it for `sealed-brief-agent` and refuses it beside every other kind (`evaluation.json: [evaluator]`, exit 10). The runtime-owned `schemas/evaluator-qualification.schema.json` holds the report; `run` validates the report against it before writing it.
- `run.js` `runTrialSets`: the evaluator configuration and its digest moved above the trial loop for every kind (the attempts' records carry `evaluatorConfigurationDigest`, and `score` reads `evaluator-configuration.json`), which also stops a deterministic run that lacks the engine stages before its trials rather than after. `qualifyEvaluator` runs after judge calibration and before the trial loop for a `sealed-brief-agent`.
- `runTrial` takes its names from `trialNames`: a trial keeps `trial-<arm>-<n>`, `trials/<arm>/trial-<n>.json` and `evaluator/<arm>/trial-<n>.*`; an attempt (`context.attempt`) uses the workspace label `attempt-<arm>-<n>`, the observation label `attempt-<n>` and `evaluator-qualification/<arm>/attempt-<n>/` for its evidence (`actions.json`) and streams (`evaluator.stdout`, `evaluator.stderr`, `evaluator.json`). It runs with `trialIndex` 1 so each record is a set of one trial.
- The record and manifest building moved to `sealProbeTrials`, which the trial sets and the attempts share, so the two cannot drift. Each attempt writes `<probeId>/isolation-manifest.json` and `<probeId>/record-1.json` in its directory and is scored alone with `runEngineStage('score', ...)` (the call record goes to `<probeId>/score.json`, the output through a scratch directory and `writer.copyIn` to `<probeId>/evidence-artifact.json`). The policy is written to the run directory ahead of the first score and `completeRun` skips its own write when the file exists.
- Outcomes are read from `reducedProbeOutcomes[probeId].trialVotes[0].state` of the copied artifact; nothing is computed. Exit 0 and 2 carry an artifact; exit 3 (Invalid) carries none and is recorded with `exitCode: 3`, `evidence: null`, `outcome: null` and the engine's `eval-quality: invalid:` stderr lines; any other exit, a missing artifact or a vote count other than one stops the run with exit 12.
- Agreement follows the decisions: a probe's agreement is the fraction of attempts whose state equals the arm's expected one (`passed-clean-control` on the clean arm, `caught` on a mutated arm), an arm's agreement is the lowest among its probes, historical and gameability arms are not qualified. A shortfall writes `evaluator-qualification.json` and stops with exit 11 as a `trial` stage stop naming each arm below the minimum and the file, with no `trial-sets.json`.
- `evaluators.js` `configurationFields` adds `tea.evaluatorQualificationAttempts` and `tea.evaluatorQualificationMinimumAgreement` to `decodingParameters`, so the scoring version moves with the policy.
- `test/fixtures/evaluate/evaluators/stub-evaluator-agent.js` gains `--mode alternating-stdin --counter <file>`: it numbers the runs that judge a trial (calibration calls do not advance it) and omits standard input on every even one.
- Tests: `test:evaluate-evaluators` `checkEvaluatorQualification` (agreement 0.5 against 0.9 exits 11 with the report, the Invalid attempt, no trial set, no `trials/`, only `attempt-` workspaces and four counted runs; the same agent at a 0.5 minimum seals a run; the byte comparison and a forged outcome it refuses) and, in the steady sealed-brief case, the report, the schema, the decoding parameters and the corrected run count; `--qualification-only` runs the new case alone. `test:evaluate-check` adds the missing-block case, two schema cases and one case per other kind. Every helper that plants a sealed-brief agent declares the block (`useSealedBriefAgent`, both `useStubAgent`, `plantEvaluator`, so the clean case "a rubric a sealed-brief agent scores, with no judge" stays clean). Shifted expectations: the stub ran 13 times instead of 9 in the steady case, the failing-agent modes keep their streams and fault under the first attempt, and the hanging tool server stops the first attempt (`attempt-clean-1`, `attempt-1-call-2`).
- Docs: `docs/reference/tea-evaluate-cli.md` (the `evaluator` rule row, the run steps, a new `### Qualifying a sealed-brief agent`, the evaluation layer and calibration passages, the exit 11 row, which omitted judge calibration's exit 11), `CHANGELOG.md`, and `epics.md` and `test-design-epic-1.md` amended in place on 2026-09-30 for the three decisions.
- Skill gate: `references/evaluator.md` was edited through `/bmad-workflow-builder` Edit, headless, on `src/workflows/testarch/bmad-testarch-evaluate/` only, following its `build-process.md` (customization resolved with no extra gates; memlog entry appended). See Gates for the scanners and lenses. `test/test-evaluate-guidance.js` holds the new paragraph by six markers under `## Emit judgment rows or sealed records`.
- `eval-quality.config.json`: the `doc-claims` gate reads `.js` declarations only, so `evaluatorQualification` and `minimumAgreement`, which the runtime's JSON schema declares, join `symbols.foreign` with that reason (the gate found both in the first full `npm test`).

## Revert observations

Each check is exercised once: undo the change locally, run the named script, restore the file byte for byte from a saved copy.

- AC 1, dropping the stage (`if (false) await qualifyEvaluator(...)` in `run.js`): `node test/test-evaluate-evaluators.js --qualification-only` fails with the run exiting 0 where 11 is expected, no stop naming the arm and the report, and the report missing. This is the run that seals Invalid records; the lenient case scores its sealed mutated set and asserts eval-quality reads it as Invalid (exit 3, no artifact).
- AC 1, dropping only the exit 11 stop (`if (false && below.length > 0)`): 9 of 32 checks fail, among them exit 0 for 11, the stop message and the trial sets written.
- AC 1, an attempt in a workspace labelled `trial-` (`label: trial-<arm>-<n>`): the launch check fails, naming the `trial-clean-1` and `trial-clean-2` workspaces where only `attempt-` ones are expected. Sending an attempt's evidence to `trials/<arm>/trial-<n>.json`: 10 checks fail, among them `trials/clean holds ["trial-1.json","trial-2.json"]` and "ran trials" after an exit 11.
- AC 2, dropping the requirement in `check.js`: `test:evaluate-check` fails 3 of 713, "a sealed-brief agent that declares no evaluatorQualification: check exited 0; expected 10". Dropping the refusal beside other kinds fails 9, starting with "an evaluatorQualification beside a deterministic evaluator: check exited 0; expected 10". Both restored.
- AC 3, writing an outcome the artifact does not hold (`outcome: 'caught'` in place of the vote's state): 10 of 42 checks fail, `clean/P-001/attempt 1: outcome "caught", the artifact holds ["passed-clean-control"]` and the agreement checks that follow. The comparison helper is itself held: six forgeries (a foreign outcome, another attempt's evidence path, an outcome on an Invalid attempt, a probe agreement of 1, an arm agreement of 1, a missing attempt) each produce a mismatch.
- The decoding parameters (`if (false)` around the two `tea.evaluatorQualification*` keys in `configurationFields`): the unit and the reference case fail, "the configuration carries []; expected the qualification's two keys".
- The guide (`evaluator.md` paragraph removed): `test:evaluate-guidance` fails 6 markers under `## Emit judgment rows or sealed records`. The reference (`### Qualifying a sealed-brief agent` renamed): the reference case fails, "the reference holds ... exactly once".

- Final review round 1, an attempt eval-quality scores whose state is not the expected one (stub `--mode always-pass --counter <file> --mode-from 4`, the second mutated attempt answers `pass` whatever the stdout says, so eval-quality reduces it to `missed`): with `outcome: scored.outcome === null ? null : expected` in place of the copied state, `node test/test-evaluate-evaluators.js --qualification-only` fails 3 of 63 checks: the report departs from its evidence (`outcome "caught", the artifact holds ["missed"]`), the outcome is not the artifact's vote byte for byte, and the outcome of a passed defect is `caught`. Restored.
- Final review round 1, an arm's agreement is its lowest probe (`Math.max` in place of `Math.min`): 4 of 63 fail, among them the run exiting 0 where 11 is expected, `mutated:M-001: agreement is not its lowest probe's` and `the mutated arm's agreement is 1; expected the lower probe's 0.5`. Restored.
- Final review round 1, historical and gameability arms are not qualified (`expectedOutcome` returning `caught` for every arm): 4 of 63 fail, among them the run exiting 12 where 0 is expected, the report qualifying `gameability:P-004` and `evaluator-qualification/` holding `gameability-P-004`. Restored.
- Final review round 1, the tree-changed stop names the qualification (`treeUnchanged('trials')` in place of `treeUnchanged('qualification attempts')`): the full `test:evaluate-evaluators` suite fails 2 of 786, among them `a project change during a qualification attempt is reported as a change during the trials`. Restored.

## Gates

- `npm test` green (second full run, after the `doc-claims` entries; the first full run reached `test:doc-claims` and stopped there, with every Evaluate suite before it green). Focused suites in the last state of the tree: `test:evaluate-evaluators` 756 checks (43 in `--qualification-only`), `test:evaluate-check` 713, `test:evaluate-mcp` 173, `test:evaluate-api` 284, `test:evaluate-guidance`, `test:evaluate-run`, `test:evaluate-arms`, `test:evaluate-calibration`, `test:evaluate-workflow`, `test:evaluate-partitions`, `test:evaluate-boundaries` 306, `test:direction`.
- Engine check `ENGINE_OK` (exit 0), `git diff -- package.json package-lock.json` empty, `npm run docs:validate-links` and `npm run docs:build` green, `lint`, `lint:md` and `format:check` green.
- Skill gate: `references/evaluator.md`, `references/run.md` and `references/gaps.md` were edited through `/bmad-workflow-builder` Edit, headless, on `src/workflows/testarch/bmad-testarch-evaluate/` only (its `build-process.md` followed; customization resolved with no extra gates; memlog entries appended; no commit). Its `quick_validate.py`, `prepass-prompt-metrics.py`, `prepass-workflow-integrity.py` and `scan-scripts.py` passed with no issue. `scan-path-standards.py` reported the 14 high findings that predate this change (two tracked lines in `SKILL.md:20` and `references/adapters.md:22`, and twelve in ignored `.analysis/` and `.memlog.md` files); none is in a changed file. The five Analyze lenses (leanness, architecture, determinism, customization, enhancement) ran as an independent subagent over the changed passages: zero critical, zero high, one medium (fixed) and three low (one accepted, two skipped below). AD-17 module validation does not apply: no registration file changed.
- Unrun: no live evaluation run belongs to this story; the qualification is exercised through the stub agent against real eval-quality.

## Review

Three lenses ran as subagents over the working tree: an adversarial review, a test-quality review and the builder's five Analyze lenses over the changed guide. Every finding was verified against the code before it was acted on.

Fixed:

- Adversarial: `scoreAttempt` accepted an artifact left by an exit other than 0 or 2 (it now stops with exit 12 before reading one) and crashed on an unparseable or oddly shaped artifact (now exit 12 naming the artifact); the report is written before its schema check, so a failure keeps the attempts a run paid for; `qualifyEvaluator` stops with exit 10 when the block is missing instead of destructuring `undefined`; `writer.verify` runs once per attempt instead of once per probe; the report schema ties `exitCode` 3 to a null `evidence` and `outcome` and 0 or 2 to a string pair; `cli/evaluate.js` lists judge calibration and the qualification under exit 11 (the same gap the reference had); the `run.js` header names the stage; the reference says a project is read after every attempt too, that the report lists held-out probes beside development ones (read through `gap-view.json`), and that attempt use lives in each attempt's manifest; the CHANGELOG entry says an existing sealed-brief-agent evaluation adds the block before `check` passes.
- Test quality: a missing run directory no longer skips the AC 1 assertions; the byte comparison also checks the evidence path against the attempt's own directory, the attempt count and numbering, the exit code against the evidence, the `invalid` lines and the absence of an artifact file for an Invalid attempt, and holds six forgeries; `trials/<arm>` and `evaluator/<arm>` must hold exactly the trials' own files; both arms must show `attempt-` launches; the lenient run's sealed mutated set is scored and read as Invalid; a fault or a SIGINT in a trial (not only in an attempt) is kept covered through the stub's new `--mode-from`; the reference section is held by `checkReferenceQualifiesSealedBriefAgent` (heading once under `## run`, the attempt fields from the schema, the decoding keys from `configurationFields`, the exit 11 and `evaluator` rows); deterministic and command configurations are asserted to carry no qualification keys; an antithesis sentence in a comment was rewritten; the stub fails fast without `--counter`.
- Analyze: the exit 11 row in `gaps.md` and the sequence sentence in `run.md` name the qualification, so an adopter who meets exit 11 at Stage 11 is pointed at the report.

Skipped, with reasons:

- Anchoring `evaluator-qualification.json` in `run.json` and `score`: nothing reads the report, and `judge-calibration.json` is not anchored either.
- A run-level total of the attempts' model use: the reference states that qualification calls do not count toward the trials, and each attempt's manifest holds its own use.
- A ceiling on `attempts`: the value is the adopter's, as `trials` is.
- The Analyze suggestion to record the agreed values in `evaluator/LEARNED.md`: that file records installed versions. The suggestion to widen the sealed-brief row's cost cell was taken ("Model calls on each trial and qualification attempt").
- The PR carries the epic context that `bmad-build` recompiled at story start (`epic-1-context.md`, Stories 1.33 to 1.63 listed).
- A test for the exit-12 guard on an unexpected score exit: the engine shim replaces `compile`, `seal` and `preflight` too, so a sealed-brief run cannot reach the qualification under it.

## Final review round 1

Each finding was verified against the code before it was acted on. All ten were correct.

1. Fixed. The exit table in `docs/reference/tea-evaluate-cli.md` and the header of `cli/evaluate.js` add to exit 12 a sealed-brief agent attempt `eval-quality score` cannot score (a call that cannot run, an exit other than 0, 2 or 3, no evidence artifact, or no single trial vote). The 3-5 and 64 rows say the qualification's `score` exit 3 is recorded and any exit other than 0, 2 or 3 stops the run with 12. `### Qualifying a sealed-brief agent` states the stop.
2. Fixed. The reference now says an exit 0 or 2 carries an evidence artifact (one record below a `minimumTrialCount` above 1 reads as CONCERNS), so the artifact exists for every attempt eval-quality can read. No file under `references/` makes the earlier claim.
3. Fixed. The Review section states that the PR carries the epic context `bmad-build` recompiled at story start.
4. Fixed. The CHANGELOG entry reads "declares no `evaluatorQualification` and when another kind declares one, so an existing sealed-brief-agent evaluation adds the block before `check` passes".
5. Fixed. `preflight.js` maps `'qualification attempts'` to the `trial` stage with the "no trial set is written" tail, and `qualifyEvaluator` passes it. `checkQualificationHoldsAdopterTree` runs a target that writes into the project during `attempt-clean-1` and asserts exit 12 and the message "changed during the qualification attempts, so no trial set is written".
6. Fixed. `checkQualificationUnexpectedState` with the stub's new `always-pass` mode; the revert observation is above.
7. Fixed. `checkQualificationLowestProbe` adds P-003 to mutation M-001 (its signature selects on no standard input; each probe's witness names its own request so eval-quality's scoping check passes) and asserts probe agreements P-002 at 0.5 and P-003 at 1, arm agreement 0.5, exit 11.
8. Fixed. `checkQualificationSkipsOtherArms` runs an evaluation with a gameability arm (P-004), asserts exit 0, a report listing only `clean` and `mutated:M-001`, no `gameability-P-004` directory under `evaluator-qualification/` and a sealed gameability trial set. A historical arm is not exercised: it needs a fix commit with a parent, and the arm loop treats both non-qualified kinds through the one `expectedOutcome` null.
9. Fixed. The reference case also asserts `/^\| 11 .*judgeCalibration\.minimumAgreement/m`.
10. Fixed. The Story 1.33 doc comment sits directly above `checkReferenceNamesDenialReasons`, and the Story 1.34 function has its own.

Gates run on the tree after these changes: `test:evaluate-evaluators`, `test:evaluate-check`, `test:evaluate-guidance`, `test:evaluate-boundaries`, `test:direction`, `docs:validate-links`, `lint:md`, `format:check` and `lint`.
