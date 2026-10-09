---
title: 'Eval Quality and Behavioral Coverage Roadmap'
description: 'TEA evaluation coverage, completed adoption work, historical measurements, and remaining runner verification'
---

# Eval Quality and Behavioral Coverage Roadmap

All eleven TEA skills have covering suites.
This roadmap records the implementation sequence, the first live measurements, and the remaining runner work.
[Adopting eval-quality, One Skill at a Time](./eval-quality-adoption-guide.md) turns those examples into a procedure for another module.

`npm run eval:all` runs the ten behavioral suites; the eleventh, `bmad-testarch-evaluate`, carries the suite Evaluate wrote for itself, which `tea-evaluate` runs and `eval:all` records as skipped.
A machine-checked gate over the manifest proves `eval:all` finds no undeclared skill.

## Current Baseline

TEA currently has three layers of self-validation:

| Layer                           | What exists                                                                                                                                                                                                                                                                    | What it proves                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic repository checks | `npm test`, including `test:criteria-fragments`, `test:enforce-hook`, `test:eval-data`, `test:eval-test-design-data`, and `test:eval-trace-data`                                                                                                                               | Repository structure, rule traceability, hook decisions, and declared corpora remain internally consistent                                                                                                                                                                                                                                   |
| Fragment-selection eval         | 24 cases across eight workflow skills, repeated twice by default                                                                                                                                                                                                               | The agent selects required knowledge and avoids explicitly excluded knowledge                                                                                                                                                                                                                                                                |
| Full behavioral eval            | `test-review`, repeated three times against nine planted defects and one clean file                                                                                                                                                                                            | The complete review can find known defects without flooding a clean file, and its score and verdict remain stable                                                                                                                                                                                                                            |
| Full behavioral eval            | `test-design`, repeated twice against a seeded epic carrying five material risks and a clean control capped at three                                                                                                                                                           | The register is grounded in the epic it was given, its arithmetic and score bands hold, priorities respect the fixture's severity ordering, and every material risk reaches the coverage plan                                                                                                                                                |
| Full behavioral eval            | `trace`, repeated twice against a ten-criterion seeded set and a five-criterion clean set                                                                                                                                                                                      | The seeded set scores its ten criteria and derives the expected FAIL gate. The corrected clean set derives PASS; the original corpus mismatch is recorded below                                                                                                                                                                              |
| Full behavioral eval            | `atdd`, repeated twice against one story and five acceptance criteria, executing the generated scaffold under the isolation every gate that executes content runs in                                                                                                           | Every generated test fails for the reason its criterion states, none passes vacuously, none stays skipped, none loads with an error, every test maps to a supplied criterion, and no run mutates production files                                                                                                                            |
| Full behavioral eval            | `bmad-tea-routing`, 19 intents repeated twice: eleven with one right menu item, four where two or more items are close enough that the right answer is to ask, and four nothing on the menu serves                                                                             | `bmad-tea` routes an intent to the workflow the menu names, asks when several items fit and declines unsupported requests                                                                                                                                                                                                                    |
| Full behavioral eval            | `ci`, six projects each with its own written request, service, and thresholds, repeated twice                                                                                                                                                                                  | The generated workflow parses and lints clean under `actionlint` on pinned flags, and requested elements land without emitting a forbidden one                                                                                                                                                                                               |
| Full behavioral eval            | `nfr`, two evidence bundles each audited in its own staged workspace so one service's measurement never judges against another's target, repeated twice                                                                                                                        | The audit's domain statuses and gate decision are grounded in the supplied evidence bundle                                                                                                                                                                                                                                                   |
| Full behavioral eval            | `automate`, four hand-authored spec sets standing in for generated coverage, each run against the fixed `voucher-service` fixture and a scratch copy carrying its seeded minimum-spend regression                                                                              | One set catches the regression and attributes the failure to the seeded boundary through a declared message pattern; the other three each stand in for coverage that looks thorough and detects nothing: interior-only assertions, an assertion that cannot fail against real behavior, and a duplicated assertion                           |
| Full behavioral eval            | `framework`, one case: the clean `bmad-testarch-framework` scaffold fixture installed for real and its own `api-sample.spec.ts` run against a minimal in-memory stub, inside the isolation every gate that executes content runs in extended with a CONNECT-allowlisting proxy | The generated scaffold actually installs and its own smoke test actually passes against a real backend; a seeded backend defect and a seeded installed-fixture defect each then fail that same smoke test for their own distinct, verified reason                                                                                            |
| Full behavioral eval            | `bmad-teach-me-testing`, one case, two turns, against a real vendor: turn 1 plays a full first session through the real skill with a seeded wrong quiz answer and the `[R]` review it triggers, turn 2 is a brand-new, memoryless process in the same persistent workspace     | Placement matches the fixture's declared level, the seeded wrong answer's correction reappears in the transcript after the review choice, the fresh second process resumes on the right continuation greeting by reading `progress.yaml`, and no session `progress.yaml` claims complete without transcript evidence it was actually quizzed |

The single live entrypoint is:

```bash
npm run eval:all -- --agent codex
```

It runs 48 fragment selections, 38 routing intents, 4 complete test designs, 3 complete reviews, 4 complete audits, 12 complete pipelines, 4 complete traces, and 2 generations for one runner.
`automate` and `framework` both run inside the same `eval:all` invocation too, at zero calls: `automate`'s four cases and `framework`'s install-and-smoke run all execute for real every time but spend no vendor call, which is why the count above carries no term for either.
`bmad-teach-me-testing` adds 2 calls, one per turn, at its single declared repetition.
The default total is 117 calls.
The focused harnesses remain available for debugging.

Underneath the ten full behavioral suites above, TEA now exercises `eval-quality`'s command-line adapter (`createCommandLineAdapter`, every harness's own runner), its local corpus adapter, its file-system adapter, and its clock port, each certified against the package's own published conformance suite before any call site adopted it.
The package publishes six conformance arms in total; TEA runs five: `command-probe`, `corpus`, `clock`, `file-system`, and `environment-probe`.
`environment-probe` is the HTTP `api` arm.
Its subject is the HTTP port template the Evaluate skill ships, which `npm run test:evaluate-api` runs against a loopback stub.
TEA has not verified the remaining `mcp-probe` conformance arm.
`tea-evaluate` uses the package's `createMcpAdapter` directly, so the package owns its conformance certification; `npm run test:evaluate-mcp` checks TEA's use end to end.
`npm run test:port-totality` holds that ledger, in both directions, against the package's own published count.
TEA also uses the package's scoring pipeline (`runPreflight`, `runScore`, `seal`) to compile and score every Behavioral Evaluation Contract under `test/contracts/` (`test/contracts/README.md` carries the current count), and its `compareDominance` rule to compare the strength of two stored results.

## Coverage Closed

Fragment selection is a routing measurement.
A passing routing suite does not establish that the workflow produced a correct final artifact.
TEA closed this gap for `bmad-tea` (routing), `bmad-testarch-atdd`, `bmad-testarch-automate`, `bmad-testarch-ci`, `bmad-testarch-framework`, `bmad-testarch-nfr`, `bmad-testarch-test-design`, `bmad-testarch-test-review`, `bmad-testarch-trace`, and `bmad-teach-me-testing` (a transcript-based suite), each now a full behavioral eval in `test/evals/suite-manifest.json`.
`bmad-testarch-evaluate` is covered by an `evaluate-authored` entry whose evaluation folder Evaluate authored and ran on itself.

Each behavioral eval needs both positive cases and clean or negative controls.
Recall alone rewards a system that reports everything.

## Why This Fits `eval-quality`

`eval-quality` is the independent contract and scoring layer.
TEA supplies real skill outputs, fixtures, and repeated-run measurements that exercise it.
Package limitations found during adoption are tracked with their fixes in the [command-adapter guide](./eval-quality-command-adapter.md).

| TEA owns                                   | `eval-quality` owns                           |
| ------------------------------------------ | --------------------------------------------- |
| Skill execution and agent runners          | Contract format and authoring rules           |
| Fixtures, seeded defects, and ground truth | Compilation, validation, and sealing          |
| Domain oracles and thresholds              | Contract-strength analysis and result schemas |
| Prompt and artifact capture                | Scoring over declared evidence                |
| Local and CI orchestration                 | Stack-neutral libraries and CLI               |

TEA calls public package entry points.
Fragment selection and review were the first contracts; later suites reused their harness and integration patterns.

## Work Plan

Sections 1-3 record the completed implementation plan.
Section 4 lists remaining runner verification; section 5 records the CI policy.

### 1. Finish the Shared Eval Foundation

- Add a versioned suite manifest.
  Each entry should declare the skill, eval type, fixtures, contract, thresholds, repetition count, CI tier, and runner capabilities.
- Make `eval:all` discover suites from that manifest.
  It should fail when a TEA skill has neither a behavioral or Evaluate-authored covering suite nor an explicit deferred declaration.
  Evaluate-authored entries are recorded as skipped for `tea-evaluate ci`, which owns their execution.
- Add machine-readable output such as `--json <path>`.
  Include the repository commit, suite and case IDs, runner executable and version, resolved model and parameters, contract version, fixture digest, prompt digest, expected and completed repetitions, measurements, duration, token or cost data when available, and final failure class.
- Preserve the existing exit classes: `0` for thresholds met, `1` for measured quality failure, and `2` for an environment that could not measure anything.
- Classify authentication, timeout, transport, parser, and missing-artifact failures as environment failures.
  A failed model call must not look like a measured quality regression.
- Require every declared repetition to complete before variance or stability can pass.
  The `test-review` harness once scored fewer runs than were requested, which made variance unmeasurable and weakened the stability claim.
  Every live harness now exits `2` on a short run.
- Rename or document the current review precision metric precisely.
  It penalizes definite false positives reported against the clean fixture.
  Unmatched findings on seeded fixtures remain unattributed until adjudicated, so they cannot silently count as either correct or incorrect.
- Add replay tests that score stored outputs without launching a model.
  Parser and scorer changes must reproduce the historical result or declare an intentional version change.
- Give each suite its own capability policy and fresh disposable workspace.
  Fragment selection needs read-only access, while a complete workflow may need scoped artifact writes or command execution.
  Each harness exports the `RUNNER_CAPABILITIES` it hands to `cli/lib/run-agent.js`, which turns the tier into vendor argv, and `npm run test:eval-schemas` fails when the manifest declares something else.
- Keep credentials out of prompts, artifacts, logs, and result files.

### 2. Integrate the `eval-quality` Contract Layer

- Express fragment selection and `test-review` as versioned Behavioral Evaluation Contracts.
- Compile and validate every contract in the deterministic pull-request gate.
- Seal the exact contract, fixture, prompt, and scoring inputs used by a live run.
- Keep agent execution in TEA.
  Feed the captured evidence and outputs into the `eval-quality` scoring boundary.
- Record contract-strength findings separately from the skill's measured quality.
  A weak eval can produce a green score that deserves no confidence.
- Refuse a scored result when required evidence is absent, stale, internally inconsistent, or inaccessible to the evaluator.

This phase is complete when the same sealed inputs replay to the same deterministic score, and when Claude, Codex, or another runner can be compared against the same contract without changing its oracles.

### 3. Add Behavioral Suites in Evidence Order

Use this order so the first additions have strong oracles and create reusable infrastructure:

1. `trace` and `nfr`: bounded reports with explicit evidence, status, coverage, waiver, and gate rules.
2. `atdd` and `automate`: executable fail-before and pass-after checks against qualified seeded regressions.
3. `framework` and `ci`: generated project and pipeline fixtures that can be installed, parsed, linted, and smoke-tested.
4. `test-design`: deterministic artifact checks plus semantic oracles for risk grounding and coverage choices.
5. `bmad-tea` and `bmad-teach-me-testing`: transcript-based, multi-turn behavior with more semantic scoring.
6. `test-review`: expand the existing corpus continuously as real misses and false positives are qualified.

A case qualifies when the seeded defect or expected behavior is observable from the exact evidence given to the agent, the ground truth was written independently of the generated output, and the oracle can distinguish a real catch from a fluent guess.

### 4. Complete Runner Portability

Claude and Codex have verified built-in paths.
The custom runner contract covers other headless CLIs that can read a prompt, operate in the repository, return the requested artifact, and exit reliably.

Remaining runner work:

- Verify Gemini end to end with a valid `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
  The current account's CLI login cannot run the live eval, so no Gemini pass has been recorded.
- Treat any Antigravity runner as experimental until a complete `eval:all` run proves prompt delivery, artifact writes, timeouts, exit-code mapping, and parseable reports.
- Add runner and model labels for custom adapters so result files identify what actually ran.
- Add a runner admission suite.
  It should test stdin or documented prompt transport, working-directory access, report creation, nonzero failures, timeout handling, minimal environment forwarding, and model selection.
- Review prompt confidentiality for CLIs that accept the prompt only as a process argument.
  Process arguments may be visible to other local processes and CI diagnostics.
- Add an export and import mode for manual LLM use.
  It should emit complete, case-addressed prompt bundles and accept responses or artifacts later.
  Manual mode must use the same parser and scorer as headless mode and must be marked in result metadata.

The manual bundle must include every source file and instruction the case expects the model to inspect.
A prompt that points at a local path is not portable to a chat session that cannot read the repository.

Custom-runner preflight can prove that the executable and fixtures exist.
Authentication remains unproven until the runner completes a real model call.

### 5. Adopt a CI Policy

Use three CI tiers:

| Tier          | Trigger                                  | Contents                                                                                    | Credentials and cost                         |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Deterministic | Every pull request                       | Existing repository checks, eval data validation, contract compilation, scorer replay tests | None                                         |
| Smoke         | Manual and scheduled                     | One qualified case per behavioral suite with one approved runner                            | Secret-backed credentials, bounded model use |
| Full matrix   | Manual, scheduled, and release candidate | Every suite at its required repetition count across selected runner and model combinations  | Secret-backed credentials, measured quota    |

Live results should upload the machine-readable summary, generated artifacts, sanitized transcripts, and logs.
Trend reporting should compare like with like by contract, fixture, prompt, runner, and model identity.

Keep live model quality separate from the required pull-request gate until the corpus, thresholds, and variance are calibrated.
Promotion to a required gate needs a recorded baseline, an owner, a flake policy, and a rollback rule.

## Definition of Done for Every Behavioral Suite

A skill can be marked behaviorally covered only when all of these are true:

- The fixture represents a realistic TEA use case and contains no private data.
- Ground truth was authored independently of the agent output.
- The case includes planted positives plus a clean or negative control.
- Deterministic assertions run outside the agent wherever the output permits them.
- Semantic oracles are versioned, bounded, and limited to judgments that cannot be made deterministically.
- The agent sees every fact required to reach the expected answer.
- Repeated identical runs measure stability.
- Thresholds, reducer rules, and invalid-run rules are declared before the live run.
- The suite emits stable machine-readable results and CI-compatible exit codes.
- At least one built-in or admitted custom runner has completed the suite end to end.
- `npm test` remains credential-free and makes no paid model calls.

## Next Implementation Slice

The original nine-item implementation slice is complete:

1. Added `test/evals/suite-manifest.json` and `test/schema/eval-result.js`.
2. Registered fragment selection and review with unchanged thresholds and manifest-to-harness checks.
3. Added deterministic replay and oracle checks.
   `test:eval-replay` replays a corpus containing 158 cases: 3 fragment selections, 13 ATDD reports, 10 review verdicts, 14 test-design documents, 15 trace pairs, 20 routing replies, 29 NFR reports, and 54 CI runs.
   Some cases assert refusal or missing-artifact behavior and receive no numeric quality score.
   Of the 158 stored outputs, 6 are real captures, 12 are captured reports, and 140 are constructed.
   Expected results come from hand-authored ground truth; parser or scorer changes require an intentional scorer-version change.
4. Generated and compiled the contracts in `test/contracts/`.
   The original nine contracts could not compile against 0.2.0's HTTP-only target model.
   Eight compiled after 0.3.0; the ninth needed a trace fragment-selection invariance witness.
   Later behavioral suites arrived with contracts of their own.
5. Added `test/eval-trace.js` with sixteen thresholds.
   It reads per-criterion status from the matrix because summary schema 0.3.0 has no per-criterion block.
6. Recorded the first live measurements on 2026-09-08; their results are below.
7. Adopted the command-line adapter, repeatable options in 1.2.0, and explicit environment admission in 3.0.0.
   All runner commands are registered in `package.json`.
   `tea-transcript-runner` serves shared multi-turn infrastructure, `tea-skill-runner` is generic, and `tea-evaluate` owns Evaluate execution.
   Automate and framework execute fixtures without dedicated agent runners.
8. Adopted `runPreflight`, `runScore`, and `seal`.
   The corpus has 59 probes across fifteen corpora, with stored-evidence scoring, schema checks, and published conformance coverage.
   The [adapter guide](./eval-quality-command-adapter.md#how-much-of-eval-quality-tea-uses) records the remaining contract and vocabulary gaps.
9. Added suites for framework and teaching, then Evaluate's own authored suite.
   The manifest's `deferred` array is empty.

The first measurements covered the three suites that existed on 2026-09-08:

| Suite                        | Measured result                                                                 | Declared threshold                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Fragment selection, 24 cases | Required recall 100%; forbidden rate 1%                                         | Recall ≥90%; forbidden rate ≤10%                                                         |
| Review                       | Recall 100%; CRITICAL recall 100%; non-false-positive rate 100%; stable verdict | 0.7; 1.0; 0.8; one verdict                                                               |
| Trace                        | Seeded 10/10 with FAIL; clean 5/5 with PASS; all sixteen thresholds met         | Zero clean false positives, invented criteria, duplicate sections, and fixture mutations |

Those are dated results.
Use `test/results/eval-all/latest.json` and its history for later measurements.

The fragment-selection run found two routing defects: a Python scaffold loaded the Playwright mandate from a flag alone, and a system test-design run inferred contract testing from a three-service description.
Both were fixed.
Review's two unmatched findings were adjudicated as real and recorded under `knownUnplanted`.
Its default Codex invocation timed out after fifteen minutes; the measured review used Claude.

Trace's clean AC-4 failed on three runs as PARTIAL, INTEGRATION-ONLY, then PARTIAL.
Inlining the classification rule and re-running did not change the result.
The corpus was wrong: AC-4 claimed a rendered console state, while its evidence contained only API assertions.
Correcting the criterion to match the evidence produced PASS.
The confirming run used Codex because the Claude account was rate limited.

Gemini verification, Antigravity admission, and manual export/import remain runner obligations in [Complete Runner Portability](#4-complete-runner-portability).
